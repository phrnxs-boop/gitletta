/**
 * End-to-end test suite for portion-wise menu pricing.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let checks = 0;
let bad = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  checks++;
  if (!ok) {
    bad++;
    console.log(`  FAIL  ${name}`, detail ? `
        detail: ${JSON.stringify(detail)}` : "");
  } else {
    console.log(`  ok    ${name}`);
  }
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function sessionFor(email: string) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw new Error(`Magiclink failed: ${linkErr.message}`);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.verifyOtp({
    token_hash: link!.properties.hashed_token,
    type: "magiclink",
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  return data!.session!.access_token;
}

async function callFn(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

console.log(`
── 1. Authenticate owner & resolve tenant ──`);
const token = await sessionFor("swizofoods@gmail.com");
check("Owner sign-in succeeded", Boolean(token));

const boot = await callFn("bootstrap", token);
check("Bootstrap 200", boot.status === 200);
const tenantId = boot.data?.tenant?.id;
check("Tenant ID resolved", Boolean(tenantId));

const categoriesRes = await callFn("categories", token);
const categories = Array.isArray(categoriesRes.data) ? categoriesRes.data : [];
check("Categories fetched", categories.length > 0);
const categoryId = categories[0]?.id;

const createdItemIds: string[] = [];
const createdOrderIds: string[] = [];

try {
  console.log(`
── 2. Menu Item Portions Validation ──`);

  // Duplicate portion names
  const dupRes = await callFn("menu", token, {
    method: "POST",
    body: JSON.stringify({
      categoryId,
      name: `Test Dish Validation ${Date.now()}`,
      price: 150,
      portions: [
        { name: "Half", price: 80 },
        { name: "half", price: 90 }, // case-insensitive duplicate
      ],
    }),
  });
  check("Duplicate portion name rejected with 400", dupRes.status === 400, dupRes.data);

  // Negative price
  const negRes = await callFn("menu", token, {
    method: "POST",
    body: JSON.stringify({
      categoryId,
      name: `Test Dish Validation ${Date.now()}`,
      price: 150,
      portions: [{ name: "Half", price: -20 }],
    }),
  });
  check("Negative portion price rejected with 400", negRes.status === 400, negRes.data);

  // Missing name
  const emptyRes = await callFn("menu", token, {
    method: "POST",
    body: JSON.stringify({
      categoryId,
      name: `Test Dish Validation ${Date.now()}`,
      price: 150,
      portions: [{ name: "", price: 50 }],
    }),
  });
  check("Empty portion name rejected with 400", emptyRes.status === 400, emptyRes.data);

  // More than 8 portions
  const manyRes = await callFn("menu", token, {
    method: "POST",
    body: JSON.stringify({
      categoryId,
      name: `Test Dish Validation ${Date.now()}`,
      price: 150,
      portions: Array.from({ length: 9 }, (_, i) => ({ name: `Size ${i + 1}`, price: 10 + i })),
    }),
  });
  check("Over 8 portions rejected with 400", manyRes.status === 400, manyRes.data);

  console.log(`
── 3. Create Dish with Portions ──`);
  const testDishName = `Tandoori Chicken Test ${Date.now()}`;
  const createRes = await callFn("menu", token, {
    method: "POST",
    body: JSON.stringify({
      categoryId,
      name: testDishName,
      description: "Tender chicken cooked with aromatic spices in a clay oven",
      price: 240, // Base price (fallback)
      portions: [
        { name: "Quarter", price: 70 },
        { name: "Half", price: 130 },
        { name: "Full", price: 240 },
      ],
    }),
  });
  check("Dish with portions created (201)", createRes.status === 201, createRes.data);
  const dishId = createRes.data?.id;
  if (dishId) createdItemIds.push(dishId);
  check("Dish portions returned on create", Array.isArray(createRes.data?.portions) && createRes.data.portions.length === 3);

  console.log(`
── 4. Verify Menu List contains Portions ──`);
  const listRes = await callFn("menu", token);
  const items = Array.isArray(listRes.data) ? listRes.data : [];
  const foundDish = items.find((i: any) => i.id === dishId);
  check("Dish found in menu list", Boolean(foundDish));
  check("Dish has 3 portions in menu list", foundDish?.portions?.length === 3);
  check("Quarter price is 70", foundDish?.portions?.find((p: any) => p.name === "Quarter")?.price === 70);
  check("Half price is 130", foundDish?.portions?.find((p: any) => p.name === "Half")?.price === 130);
  check("Full price is 240", foundDish?.portions?.find((p: any) => p.name === "Full")?.price === 240);

  console.log(`
── 5. Place Order with Selected Portion (Half @ ₹130) ──`);
  const orderRes = await callFn("orders", token, {
    method: "POST",
    body: JSON.stringify({
      orderType: "TAKEAWAY",
      customerName: "Priyanshu Test",
      items: [
        {
          menuItemId: dishId,
          portion: "Half",
          quantity: 2,
          notes: "Extra mint chutney",
        },
      ],
    }),
  });
  check("Order placed successfully (201)", orderRes.status === 201, orderRes.data);
  const orderId = orderRes.data?.id;
  if (orderId) createdOrderIds.push(orderId);

  const orderItem = orderRes.data?.items?.[0];
  check("Order item has portion 'Half'", orderItem?.portion === "Half", orderItem);
  check("Order item unit price is ₹130 (portion price, not base ₹240)", orderItem?.price === 130, orderItem?.price);
  check("Order itemsTotal matches 2 × 130 = ₹260", orderRes.data?.itemsTotal === 260, orderRes.data?.itemsTotal);

  console.log(`
── 6. Invalid Portion Name Rejected on Order ──`);
  const badOrderRes = await callFn("orders", token, {
    method: "POST",
    body: JSON.stringify({
      orderType: "TAKEAWAY",
      customerName: "Bad Portion Test",
      items: [
        {
          menuItemId: dishId,
          portion: "MonsterSize",
          quantity: 1,
        },
      ],
    }),
  });
  check("Invalid portion rejected with 400", badOrderRes.status === 400, badOrderRes.data);

  console.log(`
── 7. Order Item Without Portion (Backward Compatibility) ──`);
  const baseOrderRes = await callFn("orders", token, {
    method: "POST",
    body: JSON.stringify({
      orderType: "TAKEAWAY",
      customerName: "Base Portion Test",
      items: [
        {
          menuItemId: dishId,
          // No portion sent -> should fall back to base price 240
          quantity: 1,
        },
      ],
    }),
  });
  check("Order without portion accepted (201)", baseOrderRes.status === 201, baseOrderRes.data);
  if (baseOrderRes.data?.id) createdOrderIds.push(baseOrderRes.data.id);
  const baseItem = baseOrderRes.data?.items?.[0];
  check("Item portion is null", baseItem?.portion === null, baseItem?.portion);
  check("Item unit price is base price ₹240", baseItem?.price === 240, baseItem?.price);

  console.log(`
── 8. Add Item with Portion to Existing Order (Quarter @ ₹70) ──`);
  const addItemRes = await callFn(`orders/${orderId}/items`, token, {
    method: "POST",
    body: JSON.stringify({
      menuItemId: dishId,
      portion: "Quarter",
      quantity: 1,
      notes: "Crispy",
    }),
  });
  check("Item added to order (201)", addItemRes.status === 201, addItemRes.data);
  check("Added item has portion 'Quarter'", addItemRes.data?.portion === "Quarter");
  check("Added item price is ₹70", addItemRes.data?.price === 70);

  // Check updated order totals: 2×130 + 1×70 = ₹330
  const updatedOrderRes = await callFn(`orders/${orderId}`, token);
  check("Order itemsTotal updated to ₹330", updatedOrderRes.data?.itemsTotal === 330, updatedOrderRes.data?.itemsTotal);
  check("Order has 2 items", updatedOrderRes.data?.items?.length === 2);

  console.log(`
── 9. Bill Verification ──`);
  const billRes = await callFn(`bill/${orderId}`, token);
  check("Bill fetched (200)", billRes.status === 200, billRes.data);
  const billItems = billRes.data?.items || [];
  const billHalf = billItems.find((it: any) => it.portion === "Half");
  const billQuarter = billItems.find((it: any) => it.portion === "Quarter");
  check("Bill has item with portion 'Half'", Boolean(billHalf));
  check("Bill Half unitPrice is 130 and total is 260", billHalf?.unitPrice === 130 && billHalf?.total === 260);
  check("Bill has item with portion 'Quarter'", Boolean(billQuarter));
  check("Bill Quarter unitPrice is 70 and total is 70", billQuarter?.unitPrice === 70 && billQuarter?.total === 70);
  check("Bill subtotal is 330", billRes.data?.subtotal === 330);

  console.log(`
── 10. Update Dish Portions (PATCH /menu) ──`);
  const patchRes = await callFn(`menu/${dishId}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      portions: [
        { name: "Small", price: 80 },
        { name: "Large", price: 150 },
      ],
    }),
  });
  check("Menu item patched with new portions (200)", patchRes.status === 200, patchRes.data);
  check("Patched item has 2 portions", patchRes.data?.portions?.length === 2);
  check("New portion 'Small' is ₹80", patchRes.data?.portions?.find((p: any) => p.name === "Small")?.price === 80);

} finally {
  console.log(`
── Cleanup ──`);
  for (const id of createdOrderIds) {
    await admin.from("order_items").delete().eq("order_id", id);
    await admin.from("orders").delete().eq("id", id);
  }
  for (const id of createdItemIds) {
    await admin.from("menu_items").delete().eq("id", id);
  }
  console.log(`Cleaned up ${createdOrderIds.length} test orders and ${createdItemIds.length} test menu items.`);
}

console.log(`
========================================`);
console.log(`Summary: ${checks - bad}/${checks} checks passed.`);
if (bad > 0) {
  console.log(`❌ ${bad} CHECKS FAILED`);
  process.exit(1);
} else {
  console.log(`✅ ALL CHECKS PASSED`);
}
