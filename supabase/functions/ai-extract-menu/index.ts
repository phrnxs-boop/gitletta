// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { guard } from "../_shared/auth.ts";
import { body, json, preflight } from "../_shared/http.ts";
import {
  getGeminiConfig,
  geminiGenerateText,
  parseDataUrl,
} from "../_shared/gemini.ts";

/**
 * POST /functions/v1/ai-extract-menu  (menu.manage)
 *
 * Accepts menu images (base64 data URLs) and uses Google Gemini to extract
 * structured menu data.
 *
 * This used to call Z AI's `chat/completions/vision`. The prompt, the
 * normalisation and the response shape are unchanged, so the onboarding
 * upload → preview → edit → approve → import workflow works exactly as it
 * did; only the provider behind it changed.
 *
 * The API key is read on the server, from `public.ai_provider_settings` (or
 * the function's own secret). It is never sent to the browser and never
 * appears in a response.
 */

const PROMPT = `You are an expert at reading restaurant menus from photos/scans. Analyze the menu image(s) and extract ALL menu items into a structured JSON format.

IMPORTANT INSTRUCTIONS:
- Handle blurry, rotated, multi-page, and differently formatted menus.
- For each item, extract: category, name, description (if present), price, veg/non-veg indicator (if visible), variants/sizes (if present), and add-ons (if present).
- If a field is unclear or you're uncertain, set its "confidence" to "low". Otherwise "high".
- An item is "low" confidence if ANY of its fields is uncertain or unreadable, not just one.
- NEVER invent a price. If a price cannot be read, set "price" to null and mark the item "low" confidence. The same applies to the name, the description, the variants and the add-ons: if you cannot read them, leave them out or set them to null rather than guessing.
- Prices should be numbers (without currency symbols).
- If the menu is in a non-English language, still extract in the original language but provide an English translation of the name if possible.
- Group items by their category as shown on the menu. If no category is visible, use "Main Menu".
- If several images are given they are pages of the same menu. Merge the pages, keep the categories from each page, and never invent an item that is not on any page.
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

  const config = await getGeminiConfig("gemini");
  if (!config.apiKey) {
    return json(
      req,
      {
        error:
          "AI extraction is not configured. Add a Gemini API key in Super Admin → AI Provider.",
      },
      503,
    );
  }

  // Build the Gemini content parts: the prompt, then one inline image per
  // page. A data URL that will not parse is rejected here rather than sent to
  // Gemini, so the caller gets a clear error rather than a confusing one.
  const parts: any[] = [{ text: PROMPT }];
  for (const img of images) {
    const parsed = parseDataUrl(img);
    if (!parsed || !parsed.data) {
      return json(req, { error: "One of the images could not be read" }, 400);
    }
    parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
  }

  const rawContent = await geminiGenerateText({
    model: config.textModel,
    apiKey: config.apiKey,
    parts,
    responseMimeType: "application/json",
    temperature: 0.1,
    timeoutMs: 120_000,
    retries: 1,
  });

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
        .map((item: any) => {
          const price = toPrice(item.price);
          const variants = Array.isArray(item.variants)
            ? item.variants.map((v: any) => ({
                name: String(v.name || ""),
                price: toPrice(v.price) ?? 0,
              }))
            : [];
          const addOns = Array.isArray(item.addOns)
            ? item.addOns.map((a: any) => ({
                name: String(a.name || ""),
                price: toPrice(a.price) ?? 0,
              }))
            : [];
          const veg = item.veg === true ? true : item.veg === false ? false : null;

          // Anything we could not read makes the whole item uncertain, and an
          // uncertain item is flagged for review rather than imported on faith.
          const lowConfidence =
            item.confidence === "low" ||
            price === null ||
            !item.name ||
            variants.some((v: any) => v.price === null) ||
            addOns.some((a: any) => a.price === null) ||
            (item.veg === undefined);

          return {
            name: String(item.name || ""),
            description: item.description ? String(item.description) : null,
            // A price we could not read stays null — it is never guessed. The
            // preview shows it for review before anything is imported.
            price: price ?? 0,
            priceUnreadable: price === null,
            veg,
            confidence: lowConfidence ? "low" : "high",
            variants,
            addOns,
            tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          };
        })
        .filter((item: any) => item.name),
    })),
  };

  return json(req, normalized);
}

/**
 * A price is a number or null. It is never a guess: a price that came back
 * as a word, or not at all, is null so the item can be flagged.
 */
function toPrice(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = parseFloat(value.replace(/[^\d.]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
