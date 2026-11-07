"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { productById, type Product } from "../../data/shop";
import { showToast } from "../../lib/appToast";
import { addToCart } from "../../lib/shop/cart";
import { readCart, taka, writeCart } from "../../lib/shop/store";
import { ProductImage } from "../ProductImage";

const noSubscribe = () => () => undefined;

export default function ShopItem() {
  // the product named in the address (?id=...): read on the client only, the page itself is static
  const id = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("id"), () => undefined);
  const product: Product | null | undefined = id === undefined ? undefined : productById(id) ?? null;
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState("");

  if (product === undefined) return <main className="app nonav" aria-busy="true" />;
  if (product === null) {
    return (
      <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
        <p className="h2">That product isn&apos;t in the shop</p>
        <Link href="/shop" className="btn btn-solid" style={{ width: "auto" }}>Back to the shop</Link>
      </main>
    );
  }

  const add = () => {
    const r = addToCart(readCart(), product, size, qty);
    if (!r.ok) return setError(r.error);
    writeCart(r.cart);
    setError("");
    showToast("Added to cart");
  };

  return (
    <main className="app nonav" style={{ paddingBottom: 28 }}>
      <header className="bar">
        <Link href="/shop" className="icon-btn" aria-label="Back to the shop"><svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></Link>
        <Link href="/shop/cart" className="btn btn-line" style={{ width: "auto", minHeight: 40, padding: "0 16px" }}>Cart</Link>
      </header>
      <div style={{ marginTop: 12 }}><ProductImage product={product} height={360} /></div>
      <h1 className="h1" style={{ marginTop: 16, fontSize: 24 }}>{product.name}</h1>
      <p className="mute" style={{ marginTop: 4 }}>{product.tagline}</p>
      <p className="blk" data-testid="price" style={{ fontSize: 28, marginTop: 10, color: "var(--acc-text)" }}>{taka(product.price)}</p>
      <ul className="body" style={{ paddingLeft: 18, marginTop: 10, display: "grid", gap: 4 }}>
        {product.details.map((d) => <li key={d}>{d}</li>)}
      </ul>

      {product.sizes && (
        <div style={{ marginTop: 18 }}>
          <p className="lab">Size</p>
          <div role="group" aria-label="Size" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {product.sizes.map((s) => (
              <button key={s} aria-pressed={size === s} onClick={() => { setSize(s); setError(""); }} style={{ minWidth: 52, minHeight: 44, borderRadius: 14, fontWeight: 800, border: `2px solid ${size === s ? "var(--accent)" : "var(--cardbd)"}`, background: size === s ? "var(--surf2)" : "transparent", color: "var(--ink)", cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18 }}>
        <p className="lab">Quantity</p>
        <button className="icon-btn" aria-label="One less" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
        <span className="blk" data-testid="qty" style={{ fontSize: 20, minWidth: 24, textAlign: "center" }}>{qty}</span>
        <button className="icon-btn" aria-label="One more" onClick={() => setQty((q) => Math.min(10, q + 1))}>+</button>
      </div>
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
      <button className="btn btn-go" style={{ marginTop: 18 }} onClick={add}>Add to cart · {taka(product.price * qty)}</button>
      <p className="mute" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.45 }}>Cash on delivery. Prices in Bangladeshi taka; delivery is added at checkout.</p>
    </main>
  );
}
