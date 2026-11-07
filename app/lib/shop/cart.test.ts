import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DELIVERY, MAX_LINES, PRODUCTS, productById } from "../../data/shop";
import { addToCart, checkCheckout, lineKey, normalizePhone, orderDoc, parseCart, setQty, totals } from "./cart";

const tee = productById("performance-tee")!;
const drink = productById("electrolyte-lemon")!;

test("the catalogue is well formed: unique ids, whole-taka prices, sizes where they matter", () => {
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  for (const p of PRODUCTS) {
    assert.ok(Number.isInteger(p.price) && p.price > 0, p.id);
    assert.equal(p.sizes === null, p.category === "drink", p.id);
  }
  assert.equal(productById("nope"), undefined);
});

test("apparel needs a size; the same item and size adds up instead of duplicating", () => {
  assert.deepEqual(addToCart([], tee, null), { ok: false, error: "Choose a size first." });
  assert.equal(addToCart([], tee, "XXXL").ok, false);
  const a = addToCart([], tee, "M");
  assert.ok(a.ok);
  const b = addToCart(a.ok ? a.cart : [], tee, "M", 2);
  assert.ok(b.ok && b.cart.length === 1 && b.cart[0].qty === 3);
  const c = addToCart(b.ok ? b.cart : [], tee, "L");
  assert.ok(c.ok && c.cart.length === 2);
  const d = addToCart([], drink, "M");
  assert.ok(d.ok && d.cart[0].size === null, "a drink has no size, whatever is passed");
});

test("limits: at most 6 different items and 10 of each", () => {
  let cart = [] as ReturnType<typeof parseCart>;
  for (const s of ["S", "M", "L", "XL", "XXL"]) cart = (addToCart(cart, tee, s) as { cart: typeof cart }).cart;
  cart = (addToCart(cart, drink, null, 50) as { cart: typeof cart }).cart;
  assert.equal(cart.length, MAX_LINES);
  assert.equal(cart.find((l) => l.id === drink.id)?.qty, 10);
  assert.equal(addToCart(cart, productById("running-shoes")!, "42").ok, false);
  assert.equal(setQty(cart, lineKey({ id: drink.id, size: null }), 0).length, MAX_LINES - 1);
});

test("a stored cart is never trusted: unknown products, wrong sizes and prices on the phone are ignored", () => {
  const parsed = parseCart([{ id: "performance-tee", size: "M", qty: 2, price: 1 }, { id: "fake", qty: 1 }, { id: "performance-tee", size: "Q", qty: 1 }, { id: "electrolyte-lemon", size: null, qty: 999 }, "junk"]);
  assert.deepEqual(parsed, [{ id: "performance-tee", size: "M", qty: 2 }, { id: "electrolyte-lemon", size: null, qty: 10 }]);
  assert.deepEqual(parseCart(null), []);
  assert.equal(totals(parsed, null).subtotal, 2 * tee.price + 10 * drink.price, "always the catalogue price");
});

test("totals: subtotal + courier charge for inside or outside Dhaka", () => {
  const cart = [{ id: tee.id, size: "M", qty: 2 }, { id: drink.id, size: null, qty: 3 }];
  const inside = totals(cart, "inside");
  assert.deepEqual([inside.subtotal, inside.delivery, inside.total, inside.count], [2 * 990 + 3 * 90, DELIVERY.insideDhaka, 2 * 990 + 3 * 90 + DELIVERY.insideDhaka, 5]);
  assert.equal(totals(cart, "outside").delivery, DELIVERY.outsideDhaka);
  assert.equal(totals([], "inside").delivery, 0, "no delivery charge on an empty cart");
});

test("phone numbers: Bangladeshi mobiles only, normalised", () => {
  assert.equal(normalizePhone("01712345678"), "01712345678");
  assert.equal(normalizePhone("+880 1712-345678"), "01712345678");
  assert.equal(normalizePhone("8801912345678"), "01912345678");
  for (const bad of ["0171234567", "01212345678", "1712345678", "abc", ""]) assert.equal(normalizePhone(bad), null, bad);
});

test("checkout: every field is checked and explained", () => {
  const ok = { name: "Rafi Ahmed", phone: "01712345678", address: "House 12, Road 5, Dhanmondi, Dhaka", area: "inside" as const, note: "" };
  assert.deepEqual(checkCheckout(ok), {});
  assert.deepEqual(Object.keys(checkCheckout({ name: "", phone: "123", address: "Dhaka", area: null, note: "x".repeat(301) })).sort(), ["address", "area", "name", "note", "phone"]);
});

test("the order holds only catalogue prices, COD, status 'requested', and the right total", () => {
  const o = orderDoc("u1", [{ id: tee.id, size: "M", qty: 1 }], { name: " Rafi ", phone: "+8801712345678", address: "House 12, Road 5, Dhanmondi", area: "outside", note: "" });
  assert.deepEqual(o.items, [{ id: tee.id, name: tee.name, size: "M", qty: 1, unitPrice: 990 }]);
  assert.equal(o.total, 990 + DELIVERY.outsideDhaka);
  assert.equal(o.payment, "cod");
  assert.equal(o.status, "requested");
  assert.equal(o.contact.phone, "01712345678");
  assert.equal(o.contact.name, "Rafi");
});

test("firestore.rules carries exactly the catalogue's prices (regenerate with npm run shop:rules)", () => {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  const m = rules.match(/\/\/ generated:begin shopPrices[\s\S]*?return \((\{[^}]*\})/);
  assert.ok(m, "the shopPrices block exists");
  const map = Object.fromEntries([...m![1].matchAll(/'([a-z0-9-]+)':\s*(\d+)/g)].map((x) => [x[1], Number(x[2])]));
  assert.deepEqual(map, Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price])));
  assert.ok(rules.includes(`'inside': ${DELIVERY.insideDhaka}`) && rules.includes(`'outside': ${DELIVERY.outsideDhaka}`));
});
