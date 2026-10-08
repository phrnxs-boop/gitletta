// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { body, json, preflight } from "../_shared/http.ts";

/**
 * POST /functions/v1/ai-extract-menu  (menu.manage)
 *
 * Accepts menu images (base64 data URLs) and uses the VLM to extract structured
 * menu data. Ported from src/app/api/ai-extract-menu/route.ts.
 *
 * The Next route used the `z-ai-web-dev-sdk`, whose config lives in a
 * `.z-ai-config` file — unavailable in Deno. We therefore call the same HTTP
 * endpoint the SDK calls (`POST {baseUrl}/chat/completions/vision`) directly,
 * reading the base URL + key from the `Z_AI_BASE_URL` / `Z_AI_API_KEY` secrets
 * (falling back to `ZAI_BASE_URL` / `ZAI_API_KEY`). The prompt, parsing and
 * normalization are byte-identical to the Next version.
 */

const PROMPT = `You are an expert at reading restaurant menus from photos/scans. Analyze the menu image(s) and extract ALL menu items into a structured JSON format.

IMPORTANT INSTRUCTIONS:
- Handle blurry, rotated, multi-page, and differently formatted menus.
- For each item, extract: category, name, description (if present), price, veg/non-veg indicator (if visible), variants/sizes (if present), and add-ons (if present).
- If a field is unclear or you're uncertain, set its "confidence" to "low". Otherwise "high".
- Prices should be numbers (without currency symbols).
- If the menu is in a non-English language, still extract in the original language but provide an English translation of the name if possible.
- Group items by their category as shown on the menu. If no category is visible, use "Main Menu".
- Return ONLY valid JSON, no markdown, no explanation.

Return this exact JSON structure:
{
  "categories": [
    {
      "name": "Category Name",
      "icon": "🍽️",
      "items": [
        {
          "name": "Item Name",
          "description": "Item description if available",
          "price": 12.99,
          "veg": true,
          "confidence": "high",
          "variants": [
            { "name": "Half", "price": 8.99 },
            { "name": "Full", "price": 14.99 }
          ],
          "addOns": [
            { "name": "Extra Cheese", "price": 2.00 }
          ],
          "tags": ["spicy", "bestseller"]
        }
      ]
    }
  ]
}

For the category icon, choose an appropriate emoji:
🍛 for main dishes, 🍜 for noodles/soup, 🍢 for grilled/skewers, 🥗 for salads/appetizers, 🍰 for desserts, 🍹 for beverages/drinks, 🍕 for pizza, 🍔 for burgers, 🍣 for sushi, 🥘 for curries, 🍝 for pasta, 🌮 for mexican, 🥟 for dumplings, 🍚 for rice dishes, 🧊 for cold items, 🍞 for bread/bakery.

For tags, use these values where applicable: spicy, bestseller, new, veg, vegan, gluten-free, signature, healthy.
Set "veg" to true if the item appears to be vegetarian, false if non-vegetarian, null if unclear.`;

Deno.serve(async (req: Request) => {
  const pf = preflight(req);
  if (pf) return pf;

  // Authenticate before the method check so an anonymous caller never sees a
  // 405 — every request to this function requires menu.manage.
  const g = await guard(req, { permission: "menu.manage" });
  if (!g.ok) return g.response;

  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    return await extract(req);
  } catch (e: any) {
    console.error("AI menu extraction error:", e);
    return json(req, { error: e?.message || "AI extraction failed" }, 500);
  }
});

async function extract(req: Request): Promise<Response> {
  const b = await body(req);
  const images = b.images as string[] | undefined;

  if (!images || !Array.isArray(images) || images.length === 0) {
    return json(req, { error: "No images provided" }, 400);
  }

  if (images.length > 10) {
    return json(req, { error: "Maximum 10 images allowed" }, 400);
  }

  const baseUrl = Deno.env.get("Z_AI_BASE_URL") ?? Deno.env.get("ZAI_BASE_URL");
  const apiKey = Deno.env.get("Z_AI_API_KEY") ?? Deno.env.get("ZAI_API_KEY");
  if (!baseUrl || !apiKey) {
    throw new Error("AI extraction is not configured (missing Z_AI_BASE_URL / Z_AI_API_KEY)");
  }

  // Build the content array with all images
  const content: any[] = [{ type: "text", text: PROMPT }];
  for (const img of images) {
    content.push({ type: "image_url", image_url: { url: img } });
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions/vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Z-AI-From": "Z",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      thinking: { type: "disabled" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API request failed with status ${res.status}: ${errText}`);
  }

  const response = await res.json();
  const rawContent = response.choices?.[0]?.message?.content || "";

  // Parse the JSON response (handle markdown-wrapped JSON)
  let cleaned = rawContent.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return json(req, { error: "AI returned unparseable response", raw: rawContent.substring(0, 500) }, 500);
      }
    } else {
      return json(req, { error: "AI returned unparseable response", raw: rawContent.substring(0, 500) }, 500);
    }
  }

  if (!parsed.categories || !Array.isArray(parsed.categories)) {
    return json(req, { error: "AI response missing categories array", raw: rawContent.substring(0, 500) }, 500);
  }

  const normalized = {
    categories: parsed.categories.map((cat: any) => ({
      name: String(cat.name || "Uncategorized"),
      icon: String(cat.icon || "🍽️"),
      items: (cat.items || [])
        .map((item: any) => ({
          name: String(item.name || ""),
          description: item.description ? String(item.description) : null,
          price: typeof item.price === "number" ? item.price : parseFloat(String(item.price || 0)),
          veg: item.veg === true ? true : item.veg === false ? false : null,
          confidence: item.confidence === "low" ? "low" : "high",
          variants: Array.isArray(item.variants)
            ? item.variants.map((v: any) => ({
                name: String(v.name || ""),
                price: typeof v.price === "number" ? v.price : parseFloat(String(v.price || 0)),
              }))
            : [],
          addOns: Array.isArray(item.addOns)
            ? item.addOns.map((a: any) => ({
                name: String(a.name || ""),
                price: typeof a.price === "number" ? a.price : parseFloat(String(a.price || 0)),
              }))
            : [],
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        }))
        .filter((item: any) => item.name),
    })),
  };

  return json(req, normalized);
}
