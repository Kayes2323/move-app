"use client";

import Link from "next/link";
import { BottomNav } from "../components/BottomNav";
import { ROUTE_MAP } from "../data/routes";

// Lengths, photos and taglines come from the route data, so the list can't drift from the journey itself.
const ORDER = ["chandpur", "coxsbazar", "sylhet", "rajshahi", "rangpur", "khulna", "chittagong", "barisal"];
const ROUTE_LIST = ORDER.map((id) => ROUTE_MAP[id]).filter(Boolean);

export default function JourneyList() {
  return (
    <main className="app">
      <header>
        <h1 className="title-blk">Choose your route</h1>
        <p className="body mute" style={{ marginTop: 6 }}>Pick a destination and every kilometre you move takes you closer.</p>
      </header>

      <ul style={{ listStyle: "none", marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {ROUTE_LIST.map((route, i) => (
          <li key={route.id}>
            <Link href={`/journey/${route.id}`} className="card" style={{ display: "block", padding: 0, overflow: "hidden" }}>
              <div style={{ position: "relative", height: 150, background: "var(--surf2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={route.image} alt="" loading={i < 2 ? "eager" : "lazy"} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 60%)" }} />
                <span className="blk" style={{ position: "absolute", left: 16, bottom: 12, color: "#fff", fontSize: 22 }}>
                  {route.totalKm}<span style={{ fontSize: 13, marginLeft: 4, opacity: 0.85 }}>km</span>
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <h2 className="h2">Dhaka → {route.name}</h2>
                <p className="body mute" style={{ marginTop: 4 }}>{route.tagline}</p>
                <p style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 14, fontWeight: 800, color: "var(--acc-text)" }}>
                  Start journey
                  <svg className="ic" viewBox="0 0 24 24" style={{ width: 18, height: 18 }} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <BottomNav active="routes" />
    </main>
  );
}
