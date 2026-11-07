import { DELIVERY, MAX_LINES, MAX_QTY, productById, type Product } from "../../data/shop";

/** The cart and the order request. Pure: prices always come from the catalogue, never from what was stored on the phone. */
export interface CartLine {
  id: string;
  size: string | null;
  qty: number;
}

export const lineKey = (l: Pick<CartLine, "id" | "size">) => `${l.id}|${l.size ?? ""}`;

/** Reads a stored cart defensively: unknown products, invalid sizes and silly quantities are dropped or clamped. */
export function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CartLine[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const p = productById(typeof r?.id === "string" ? r.id : null);
    if (!p) continue;
    const size = typeof r.size === "string" ? r.size : null;
    if (p.sizes ? !size || !p.sizes.includes(size) : size !== null) continue;
    const qty = Math.min(MAX_QTY, Math.max(1, Math.floor(Number(r.qty) || 0)));
    if (!out.some((l) => lineKey(l) === lineKey({ id: p.id, size }))) out.push({ id: p.id, size, qty });
  }
  return out.slice(0, MAX_LINES);
}

export type AddResult = { ok: true; cart: CartLine[] } | { ok: false; error: string };

export function addToCart(cart: readonly CartLine[], p: Product, size: string | null, qty = 1): AddResult {
  if (p.sizes && (!size || !p.sizes.includes(size))) return { ok: false, error: "Choose a size first." };
  const key = lineKey({ id: p.id, size: p.sizes ? size : null });
  const existing = cart.find((l) => lineKey(l) === key);
  if (existing) return { ok: true, cart: cart.map((l) => (l === existing ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l)) };
  if (cart.length >= MAX_LINES) return { ok: false, error: `An order can have up to ${MAX_LINES} different items.` };
  return { ok: true, cart: [...cart, { id: p.id, size: p.sizes ? size : null, qty: Math.min(MAX_QTY, Math.max(1, qty)) }] };
}

export const setQty = (cart: readonly CartLine[], key: string, qty: number): CartLine[] =>
  qty <= 0 ? cart.filter((l) => lineKey(l) !== key) : cart.map((l) => (lineKey(l) === key ? { ...l, qty: Math.min(MAX_QTY, Math.floor(qty)) } : l));

export interface Totals {
  lines: { line: CartLine; product: Product; unitPrice: number; amount: number }[];
  subtotal: number;
  delivery: number;
  total: number;
  count: number;
}

export function totals(cart: readonly CartLine[], area: "inside" | "outside" | null): Totals {
  const lines = cart.flatMap((line) => {
    const product = productById(line.id);
    return product ? [{ line, product, unitPrice: product.price, amount: product.price * line.qty }] : [];
  });
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const delivery = !lines.length || !area ? 0 : area === "inside" ? DELIVERY.insideDhaka : DELIVERY.outsideDhaka;
  return { lines, subtotal, delivery, total: subtotal + delivery, count: lines.reduce((s, l) => s + l.line.qty, 0) };
}

/** Bangladeshi mobile number: 01[3-9] and 8 more digits, with or without +88. Returned as 01XXXXXXXXX. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/[\s-]/g, "").replace(/^\+?88/, "");
  return /^01[3-9]\d{8}$/.test(d) ? d : null;
}

export interface Checkout {
  name: string;
  phone: string;
  address: string;
  area: "inside" | "outside" | null;
  note: string;
}

export function checkCheckout(c: Checkout): Record<string, string> {
  const e: Record<string, string> = {};
  const name = c.name.trim();
  if (name.length < 2 || name.length > 60) e.name = "Enter the name to deliver to.";
  if (!normalizePhone(c.phone)) e.phone = "Enter a Bangladeshi mobile number, like 01712345678.";
  const addr = c.address.trim();
  if (addr.length < 10 || addr.length > 300) e.address = "Enter the full address: house, road, area, district.";
  if (!c.area) e.area = "Choose inside or outside Dhaka.";
  if (c.note.length > 300) e.note = "Keep the note under 300 characters.";
  return e;
}

/** The order document (orders/{id}). Only catalogue prices; the Firestore rules check every line and the total again. */
export function orderDoc(uid: string, cart: readonly CartLine[], c: Checkout) {
  const t = totals(cart, c.area);
  return {
    uid,
    items: t.lines.map((l) => ({ id: l.product.id, name: l.product.name, size: l.line.size ?? "", qty: l.line.qty, unitPrice: l.unitPrice })),
    subtotal: t.subtotal,
    delivery: t.delivery,
    total: t.total,
    payment: "cod",
    status: "requested",
    contact: { name: c.name.trim(), phone: normalizePhone(c.phone) ?? "", address: c.address.trim(), area: c.area ?? "inside", note: c.note.trim() },
  };
}
