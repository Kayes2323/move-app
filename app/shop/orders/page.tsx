"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadError } from "../../components/LoadError";
import { taka } from "../../lib/shop/store";

interface OrderRow { id: string; total: number; status: string; at: number; items: { name: string; size: string; qty: number }[] }

const STATUS: Record<string, string> = { requested: "Waiting for our call", confirmed: "Confirmed", shipped: "On the way", delivered: "Delivered", cancelled: "Cancelled" };

export default function Orders() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ auth, db }, { onAuthStateChanged }, f] = await Promise.all([import("../../firebase"), import("firebase/auth"), import("firebase/firestore")]);
      unsub = onAuthStateChanged(auth, async (u) => {
        if (cancelled) return;
        if (!u) return void (window.location.href = "/login");
        try {
          const snap = await f.getDocs(f.query(f.collection(db, "orders"), f.where("uid", "==", u.uid)));
          if (cancelled) return;
          const rows = snap.docs.map((d) => {
            const v = d.data() as Record<string, unknown>;
            const at = v.createdAt as { toMillis?: () => number } | number | undefined;
            return { id: d.id, total: Number(v.total) || 0, status: String(v.status ?? "requested"), at: typeof at === "number" ? at : at?.toMillis?.() ?? 0, items: Array.isArray(v.items) ? (v.items as OrderRow["items"]) : [] };
          });
          setOrders(rows.sort((a, b) => b.at - a.at));
          setFailed(false);
        } catch (err) {
          console.error(err);
          if (!cancelled) setFailed(true);
        }
      });
    })().catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [attempt]);

  if (failed) return <LoadError message="Couldn't load your orders." onRetry={() => { setFailed(false); setOrders(null); setAttempt((n) => n + 1); }} />;
  return (
    <main className="app nonav">
      <header className="bar">
        <Link href="/shop" className="icon-btn" aria-label="Back to the shop"><svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></Link>
        <h1 className="h2">My orders</h1>
        <span style={{ width: 44 }} />
      </header>
      {orders === null ? (
        <div role="status" aria-busy="true" style={{ display: "grid", gap: 10, marginTop: 18 }}>{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 80 }} />)}</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ marginTop: 18, textAlign: "center", padding: 24 }}><p className="h2">No orders yet</p><Link href="/shop" className="btn btn-solid" style={{ marginTop: 12 }}>Browse the shop</Link></div>
      ) : (
        <ul data-testid="orders" style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 10 }}>
          {orders.map((o) => (
            <li key={o.id} className="card">
              <div className="bar"><span style={{ fontWeight: 800 }}>{STATUS[o.status] ?? o.status}</span><span className="blk">{taka(o.total)}</span></div>
              <p className="mute" style={{ fontSize: 12.5, marginTop: 4 }}>{o.items.map((i) => `${i.qty} × ${i.name}${i.size ? ` (${i.size})` : ""}`).join(", ")}</p>
              {o.at > 0 && <p className="mute" style={{ fontSize: 11.5, marginTop: 4 }}>{new Date(o.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · Cash on delivery</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
