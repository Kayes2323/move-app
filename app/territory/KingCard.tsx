"use client";
import type { Ownership } from "../lib/territory/coverage/ownership";
import type { Explorer } from "../lib/territory/explorers";

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
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`);

export function KingCard({ ownership, you, territory, explorer, leadM, alone }: { ownership: Ownership | null; you: boolean; territory: string; explorer?: Explorer | null; leadM?: number | null; alone?: boolean }) {
  if (!ownership) {
    return (
      <section aria-label="Owner" className="king-card king-empty">
        <div className="king-slot" aria-hidden="true">👑</div>
        <div style={{ minWidth: 0 }}>
          <p className="lab" style={{ color: GOLD }}>No Owner yet</p>
          <p className="body" style={{ marginTop: 3 }}>Be the first to explore {territory}. The highest score owns it.</p>
        </div>
      </section>
    );
  }
  const takeovers = ownership.reign - 1;
  return (
    <section aria-label="Owner" className={`king-card${you ? " king-you" : ""}`}>
      <KingAvatar name={ownership.ownerName} photo={ownership.ownerPhoto} size={56} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="lab" style={{ color: GOLD }}>{you ? "👑 You own it" : "👑 Current Owner"}</p>
        <p className="h2" style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{you ? "You" : ownership.ownerName}</p>
        <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>
          Owner since {since(ownership.reignStartedAt)}
          {takeovers > 0 ? ` · changed hands ${takeovers} time${takeovers > 1 ? "s" : ""}` : ""}
        </p>
        {explorer ? (
          <div data-testid="owner-detail" style={{ marginTop: 8 }}>
            <p style={{ fontSize: 13 }}>
              {explorer.username ? <span className="mute">@{explorer.username} · </span> : null}
              <b data-testid="owner-score">{km(explorer.score)}</b> <span className="mute">valid score</span>
            </p>
            <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>
              {alone ? "Unchallenged so far" : leadM ? `Leads by ${km(leadM)}` : "Level with the next explorer"} · {explorer.exploredCells.toLocaleString("en-US")} cells explored
            </p>
          </div>
        ) : (
          <p className="mute" style={{ fontSize: 12, marginTop: 6 }}>Score shows after their next move.</p>
        )}
      </div>
    </section>
  );
}
