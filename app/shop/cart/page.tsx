"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DELIVERY } from "../../data/shop";
import { checkCheckout, lineKey, orderDoc, setQty, totals, type Checkout } from "../../lib/shop/cart";
import { taka, useCart } from "../../lib/shop/store";

/** The cart, then the order request: cash on delivery, confirmed by the MOVE team by phone. Nothing is charged online. */
export default function Cart() {
  const [cart, setCart, ready] = useCart();
  const [form, setForm] = useState<Checkout>({ name: "", phone: "", address: "", area: null, note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<{ id: string; total: number } | null>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../../firebase"), import("firebase/auth")]);
      unsub = onAuthStateChanged(auth, (u) => {
        setUid(u?.uid ?? null);
        if (u?.displayName) setForm((f) => (f.name ? f : { ...f, name: u.displayName ?? "" }));
      });
    })().catch(() => undefined);
    return () => unsub?.();
  }, []);

  const t = totals(cart, form.area);

  const place = async () => {
    const e = checkCheckout(form);
    setErrors(e);
    if (Object.keys(e).length || !cart.length) return;
    if (!uid) return setErrors({ form: "Sign in to place an order." });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return setErrors({ form: "You're offline. Connect and try again; your cart is kept." });
    setBusy(true);
    try {
      const [{ db }, f] = await Promise.all([import("../../firebase"), import("firebase/firestore")]);
      const ref = await f.addDoc(f.collection(db, "orders"), { ...orderDoc(uid, cart, form), createdAt: f.serverTimestamp() });
      setPlaced({ id: ref.id, total: t.total });
      setCart([]);
    } catch (err) {
      console.error(err);
      setErrors({ form: "Couldn't send the order. Check your connection and try again; your cart is kept." });
    } finally {
      setBusy(false);
    }
  };

  const field = (bad: boolean): React.CSSProperties => ({ width: "100%", marginTop: 6, minHeight: 46, padding: "10px 14px", borderRadius: 14, border: `1.5px solid ${bad ? "var(--danger)" : "var(--cardbd)"}`, background: "var(--surf)", color: "var(--ink)", fontSize: 16, fontFamily: "inherit" });

  if (placed) {
    return (
      <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }} data-testid="order-placed">
        <p style={{ fontSize: 40 }} aria-hidden="true">✓</p>
        <h1 className="h1">Order request sent</h1>
        <p className="body mute" style={{ maxWidth: 320 }}>The MOVE team will call you to confirm before delivery. You pay {taka(placed.total)} in cash when it arrives.</p>
        <p className="mute" style={{ fontSize: 12 }}>Order {placed.id.slice(0, 8).toUpperCase()}</p>
        <Link href="/shop/orders" className="btn btn-solid" style={{ width: "auto" }}>My orders</Link>
        <Link href="/shop" className="btn btn-ghost" style={{ width: "auto" }}>Keep shopping</Link>
      </main>
    );
  }

  return (
    <main className="app nonav" style={{ paddingBottom: 28 }}>
      <header className="bar">
        <Link href="/shop" className="icon-btn" aria-label="Back to the shop"><svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></Link>
        <h1 className="h2">Your cart</h1>
        <span style={{ width: 44 }} />
      </header>

      {!ready ? null : !t.lines.length ? (
        <div className="card" style={{ marginTop: 20, textAlign: "center", padding: 24 }} data-testid="cart-empty">
          <p className="h2">Your cart is empty</p>
          <Link href="/shop" className="btn btn-solid" style={{ marginTop: 14 }}>Browse the shop</Link>
        </div>
      ) : (
        <>
          <ul data-testid="cart-lines" style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
            {t.lines.map((l) => (
              <li key={lineKey(l.line)} className="card" style={{ display: "flex", gap: 12, alignItems: "center", padding: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800 }}>{l.product.name}</p>
                  <p className="mute" style={{ fontSize: 12 }}>{l.line.size ? `Size ${l.line.size} · ` : ""}{taka(l.unitPrice)} each</p>
                </div>
                <button className="icon-btn" aria-label={`One less ${l.product.name}`} onClick={() => setCart(setQty(cart, lineKey(l.line), l.line.qty - 1))}>−</button>
                <span className="blk" style={{ minWidth: 20, textAlign: "center" }}>{l.line.qty}</span>
                <button className="icon-btn" aria-label={`One more ${l.product.name}`} onClick={() => setCart(setQty(cart, lineKey(l.line), l.line.qty + 1))}>+</button>
              </li>
            ))}
          </ul>

          <section style={{ marginTop: 22 }}>
            <p className="lab">Delivery · cash on delivery</p>
            <label className="lab" htmlFor="o-name" style={{ display: "block", marginTop: 12 }}>Name</label>
            <input id="o-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={field(Boolean(errors.name))} autoComplete="name" />
            {errors.name && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 4 }}>{errors.name}</p>}
            <label className="lab" htmlFor="o-phone" style={{ display: "block", marginTop: 12 }}>Mobile number</label>
            <input id="o-phone" inputMode="tel" value={form.phone} placeholder="01XXXXXXXXX" onChange={(e) => setForm({ ...form, phone: e.target.value })} style={field(Boolean(errors.phone))} autoComplete="tel" />
            {errors.phone && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 4 }}>{errors.phone}</p>}
            <label className="lab" htmlFor="o-addr" style={{ display: "block", marginTop: 12 }}>Full address</label>
            <textarea id="o-addr" rows={3} value={form.address} placeholder="House, road, area, district" onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ ...field(Boolean(errors.address)), resize: "none" }} autoComplete="street-address" />
            {errors.address && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 4 }}>{errors.address}</p>}
            <div role="radiogroup" aria-label="Delivery area" style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(["inside", "outside"] as const).map((a) => (
                <button key={a} role="radio" aria-checked={form.area === a} onClick={() => setForm({ ...form, area: a })} style={{ flex: 1, minHeight: 48, borderRadius: 14, fontWeight: 800, fontSize: 13.5, border: `2px solid ${form.area === a ? "var(--accent)" : errors.area ? "var(--danger)" : "var(--cardbd)"}`, background: form.area === a ? "var(--surf2)" : "transparent", color: "var(--ink)", cursor: "pointer" }}>
                  {a === "inside" ? `Inside Dhaka · ${taka(DELIVERY.insideDhaka)}` : `Outside Dhaka · ${taka(DELIVERY.outsideDhaka)}`}
                </button>
              ))}
            </div>
            {errors.area && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 4 }}>{errors.area}</p>}
            <label className="lab" htmlFor="o-note" style={{ display: "block", marginTop: 12 }}>Note (optional)</label>
            <input id="o-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={field(Boolean(errors.note))} />
          </section>

          <section className="card" style={{ marginTop: 18 }} data-testid="totals">
            <div className="bar"><span className="mute">Items ({t.count})</span><span>{taka(t.subtotal)}</span></div>
            <div className="bar" style={{ marginTop: 6 }}><span className="mute">Delivery</span><span>{form.area ? taka(t.delivery) : "Choose area"}</span></div>
            <div className="bar" style={{ marginTop: 10 }}><span style={{ fontWeight: 800 }}>Total</span><span className="blk" style={{ fontSize: 20 }}>{taka(t.total)}</span></div>
          </section>
          {errors.form && <p role="alert" className="notice bad" style={{ marginTop: 14 }}>{errors.form}</p>}
          <button className="btn btn-go" style={{ marginTop: 16 }} onClick={place} disabled={busy}>{busy ? "Sending…" : "Place order · cash on delivery"}</button>
          <p className="mute" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>Your name, number and address go only to the MOVE team for this delivery. No online payment is taken.</p>
        </>
      )}
    </main>
  );
}
