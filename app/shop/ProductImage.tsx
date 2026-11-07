"use client";
import { useState } from "react";
import type { Product } from "../data/shop";

/** The owner's poster for a product, or a plain MOVE tile until it has been added. Never a stock or invented product photo. */
export function ProductImage({ product, height }: { product: Product; height: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div data-testid="product-placeholder" aria-label={`${product.name}: photo coming soon`} role="img" style={{ height, borderRadius: 16, background: "radial-gradient(120% 90% at 70% 10%, rgba(123,232,106,.22), transparent 60%), linear-gradient(160deg, #101410, #0A0C0A)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", textAlign: "center", padding: 12 }}>
        <span style={{ font: "900 22px 'Archivo Black', 'Archivo', sans-serif", letterSpacing: 4 }}>MOVE</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#7BE86A", lineHeight: 1.3 }}>{product.name.replace(/^MOVE /, "")}</span>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.55)" }}>Photo coming soon</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt={product.name} loading="lazy" decoding="async" onError={() => setMissing(true)} style={{ width: "100%", height, objectFit: "cover", borderRadius: 16, display: "block", background: "#0A0C0A" }} />
  );
}
