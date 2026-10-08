"use client";
import Link from "next/link";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";
import { KingAvatar } from "./KingCard";
import { TerritoryEmblem } from "./TerritoryEmblem";

/**
 * The moment a user becomes King: by first conquest, or by taking (or retaking) it. Coverage and the move's real distance
 * are shown apart: they are different numbers.
 */
export function Celebration({ def, kind, name, photo, coveragePercent, distanceKm, shareHref, onClose }: { def: TerritoryDefinition; kind: "conquest" | "takeover"; name: string; photo: string; coveragePercent: number; distanceKm: number | null; shareHref: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={kind === "conquest" ? `${def.name} conquered` : "Territory taken"} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "radial-gradient(120% 80% at 50% 0%, #1B1F3A 0%, #0A0A0C 60%)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px", textAlign: "center", overflowY: "auto" }}>
      <span className="crown mv-rise" aria-hidden="true" style={{ fontSize: 46 }}>👑</span>
      <p className="mv-rise" style={{ marginTop: 10, fontSize: 12, fontWeight: 700, letterSpacing: 3, color: "#F5C542", animationDelay: ".1s" }}>{kind === "conquest" ? "CONQUERED" : "TERRITORY TAKEN"}</p>
      <h1 className="blk mv-rise" style={{ fontSize: 34, lineHeight: 1.05, marginTop: 6, animationDelay: ".15s" }}>{def.name.toUpperCase()}</h1>
      <div style={{ width: "min(300px, 80vw)", marginTop: 14 }}>
        <TerritoryEmblem def={def} fraction={1} conquered width={300} height={220} draw colors={{ fill: "#15151B", base: "#2C2C36", progressFrom: "#F5C542", progressTo: "#FFE08A", head: "#FFFFFF" }} />
      </div>
      <div className="mv-rise" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, animationDelay: ".5s" }}>
        <KingAvatar name={name} photo={photo} size={48} />
        <div style={{ textAlign: "left" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#F5C542" }}>NEW KING</p>
          <p className="h2">{name}</p>
        </div>
      </div>
      <p className="mv-rise" style={{ marginTop: 12, fontSize: 14, color: "rgba(255,255,255,.75)", animationDelay: ".6s" }}>
        {kind === "conquest" ? "You are the first King of " + def.name + "." : "You are the new King."}
      </p>
      <div className="mv-rise" style={{ display: "flex", gap: 10, marginTop: 18, animationDelay: ".7s" }}>
        <div className="card" style={{ background: "rgba(255,255,255,.06)", minWidth: 120 }}>
          <p style={{ fontSize: 11, letterSpacing: 1.5, color: "rgba(255,255,255,.6)" }}>EXPLORED</p>
          <p className="blk" style={{ fontSize: 22, marginTop: 4 }}>{coveragePercent.toFixed(1)}%</p>
        </div>
        {distanceKm !== null && (
          <div className="card" style={{ background: "rgba(255,255,255,.06)", minWidth: 120 }}>
            <p style={{ fontSize: 11, letterSpacing: 1.5, color: "rgba(255,255,255,.6)" }}>THIS MOVE</p>
            <p className="blk" style={{ fontSize: 22, marginTop: 4 }}>{distanceKm.toFixed(2)} km</p>
          </div>
        )}
      </div>
      <Link href={shareHref} className="btn btn-go mv-rise" style={{ marginTop: 22, maxWidth: 320, animationDelay: ".8s" }}>Share</Link>
      <button className="btn btn-ghost" style={{ color: "#fff", marginTop: 6, maxWidth: 320 }} onClick={onClose}>Continue</button>
    </div>
  );
}
