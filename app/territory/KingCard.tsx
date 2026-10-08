"use client";
import type { Ownership } from "../lib/territory/coverage/ownership";

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "M";

/** A King's public face: photo (or initial) and first name. Never anything else about them. */
export function KingAvatar({ name, photo, size }: { name: string; photo: string; size: number }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="av" src={photo} alt="" width={size} height={size} style={{ width: size, height: size, boxShadow: "0 0 0 3px #F5C542" }} referrerPolicy="no-referrer" />
  ) : (
    <div className="av" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4, boxShadow: "0 0 0 3px #F5C542" }}>{initials(name)}</div>
  );
}

const since = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Who holds the Territory. */
export function KingCard({ ownership, you, territory }: { ownership: Ownership | null; you: boolean; territory: string }) {
  if (!ownership) {
    return (
      <section aria-label="King" className="card king-card">
        <span className="crown" aria-hidden="true" style={{ opacity: 0.35 }}>👑</span>
        <div>
          <p className="lab">No King yet</p>
          <p className="body" style={{ marginTop: 2 }}>Explore {territory} first to rule it.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-label="King" className="card king-card">
      <KingAvatar name={ownership.ownerName} photo={ownership.ownerPhoto} size={52} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="lab" style={{ color: "#D9A520" }}>👑 King</p>
        <p className="h2" style={{ marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{you ? "You" : ownership.ownerName}</p>
        <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>since {since(ownership.reignStartedAt)}{ownership.reign > 1 ? ` · ${ownership.reign - 1} takeover${ownership.reign > 2 ? "s" : ""}` : ""}</p>
      </div>
    </section>
  );
}
