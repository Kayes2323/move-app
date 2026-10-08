"use client";
import type { Ownership } from "../lib/territory/coverage/ownership";

const initials = (name: string) => name.trim().slice(0, 1).toUpperCase() || "M";
const GOLD = "#D9A520";

/** A King's public face: photo (or initial) and first name. Never anything else about them. */
export function KingAvatar({ name, photo, size }: { name: string; photo: string; size: number }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="av" src={photo} alt="" width={size} height={size} style={{ width: size, height: size, boxShadow: "0 0 0 3px #F5C542, 0 6px 18px rgba(217,165,32,.35)" }} referrerPolicy="no-referrer" />
  ) : (
    <div className="av" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4, boxShadow: "0 0 0 3px #F5C542, 0 6px 18px rgba(217,165,32,.35)" }}>{initials(name)}</div>
  );
}

const since = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Who holds the Territory: the King's public name and photo, and how long they've held it. */
export function KingCard({ ownership, you, territory }: { ownership: Ownership | null; you: boolean; territory: string }) {
  if (!ownership) {
    return (
      <section aria-label="King" className="king-card king-empty">
        <div className="king-slot" aria-hidden="true">👑</div>
        <div style={{ minWidth: 0 }}>
          <p className="lab" style={{ color: GOLD }}>No King yet</p>
          <p className="body" style={{ marginTop: 3 }}>Be the first to conquer {territory}.</p>
        </div>
      </section>
    );
  }
  const takeovers = ownership.reign - 1;
  return (
    <section aria-label="King" className={`king-card${you ? " king-you" : ""}`}>
      <KingAvatar name={ownership.ownerName} photo={ownership.ownerPhoto} size={56} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="lab" style={{ color: GOLD }}>{you ? "👑 You are King" : "👑 Current King"}</p>
        <p className="h2" style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{you ? "You" : ownership.ownerName}</p>
        <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>
          King since {since(ownership.reignStartedAt)}
          {takeovers > 0 ? ` · ${takeovers} takeover${takeovers > 1 ? "s" : ""}` : ""}
        </p>
      </div>
    </section>
  );
}
