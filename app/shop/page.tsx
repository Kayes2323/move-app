"use client";
import Link from "next/link";
import { BottomNav } from "../components/BottomNav";
import { PRODUCTS } from "../data/shop";
import { taka, useCart } from "../lib/shop/store";
import { ProductImage } from "./ProductImage";

export default function Shop() {
  const [cart] = useCart();
  const count = cart.reduce((s, l) => s + l.qty, 0);
  return (
    <main className="app">
      <header className="bar">
        <div>
          <p className="lab" style={{ color: "var(--acc-text)" }}>MOVE Shop</p>
          <h1 className="title-blk" style={{ marginTop: 6 }}>Gear for every move</h1>
        </div>
        <Link href="/shop/cart" className="icon-btn" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`} style={{ position: "relative" }}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h2l2 11h10l2-8H7" /><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /></svg>
          {count > 0 && <span data-testid="cart-count" style={{ position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, background: "var(--accent)", color: "var(--on-acc)", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{count}</span>}
        </Link>
      </header>
      <p className="body mute" style={{ marginTop: 8 }}>Cash on delivery across Bangladesh. The MOVE team confirms every order by phone.</p>

      <ul data-testid="products" style={{ listStyle: "none", padding: 0, margin: "18px 0 0", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <Link href={`/shop/item?id=${p.id}`} className="card" style={{ display: "block", padding: 8, borderRadius: 20 }}>
              <ProductImage product={p} height={170} />
              <p style={{ fontSize: 13.5, fontWeight: 800, marginTop: 8, lineHeight: 1.25, minHeight: 34 }}>{p.name}</p>
              <p className="blk" style={{ fontSize: 17, marginTop: 4, color: "var(--acc-text)" }}>{taka(p.price)}</p>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/shop/orders" className="row" style={{ marginTop: 16 }}><span>My orders</span><svg className="ic mute" viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></Link>
      <BottomNav active="profile" />
    </main>
  );
}
