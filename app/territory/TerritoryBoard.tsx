"use client";
import { Avatar } from "../components/Avatar";
import { shownPercent } from "../lib/territory/coverage/rules";
import type { TerritoryBoard as Board } from "../lib/territoryState";
import { firstName } from "../lib/profile/model";

const GOLD = "#D9A520";
const day = (ms: number) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/**
 * Beneath the Owner: who is exploring this Territory (real stored totals, ranked), who has held it, and who conquered it first.
 * Everything here is a public summary: a name, a picture and counts of explored cells. Never where anyone is or has been.
 * `board` is null while loading and never blocks the page above it.
 */
export function TerritoryBoard({ board, uid, territory, onRetry }: { board: Board | null; uid: string; territory: string; onRetry: () => void }) {
  if (!board) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading explorers" style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 56 }} />)}
      </div>
    );
  }
  if (board.status === "unavailable") {
    return (
      <div className="card" role="alert" style={{ marginTop: 10 }}>
        <p className="body">Explorers can&apos;t be shown right now.</p>
        <p className="mute" style={{ fontSize: 12.5, marginTop: 4 }}>Your own exploration is still counted. Check your connection and try again.</p>
        <button className="btn btn-line" style={{ width: "auto", minHeight: 40, padding: "0 18px", marginTop: 10 }} onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return (
    <>
      {board.conquered && (
        <div data-testid="conquered-record" className="card" style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", border: "1px solid rgba(217,165,32,.45)" }}>
          <Avatar name={board.conquered.name} photo={board.conquered.photo} size={40} />
          <div style={{ minWidth: 0 }}>
            <p className="lab" style={{ color: GOLD }}>Territory Conquered</p>
            <p style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{board.conquered.uid === uid ? "You" : firstName(board.conquered.name)}{board.conquered.username ? <span className="mute" style={{ fontWeight: 500 }}> · @{board.conquered.username}</span> : null}</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 1 }}>First to complete {territory}{board.conquered.atMs ? ` · ${day(board.conquered.atMs)}` : ""}. This stays even if the Territory changes hands.</p>
          </div>
        </div>
      )}

      <h2 className="lab" style={{ marginTop: 28 }}>Active explorers</h2>
      {board.explorers.length === 0 ? (
        <div className="card" data-testid="explorers-empty" style={{ marginTop: 10 }}>
          <p className="body">No one has explored {territory} yet.</p>
          <p className="mute" style={{ fontSize: 12.5, marginTop: 4 }}>Explore a new street and you&apos;ll be the first on this list.</p>
        </div>
      ) : (
        <ol data-testid="explorers" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 8 }}>
          {board.explorers.map((e, i) => {
            const you = e.uid === uid;
            const p = shownPercent(e.exploredCells, e.requiredCells).percent;
            return (
              <li key={e.uid} className="card" data-uid={e.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: you ? "1px solid var(--accent)" : "1px solid transparent" }}>
                <span className="blk" style={{ width: 22, textAlign: "center", fontSize: 14, color: "var(--mute)" }}>{i + 1}</span>
                <Avatar name={e.name} photo={e.photo} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: you ? "var(--acc-text)" : "var(--ink)" }}>{you ? "You" : firstName(e.name)}{e.username ? <span className="mute" style={{ fontWeight: 500, fontSize: 12.5 }}> @{e.username}</span> : null}</p>
                  <p className="mute" style={{ fontSize: 12 }}>{e.moves} {e.moves === 1 ? "move" : "moves"}{e.lastGainAt ? ` · last found new ground ${day(e.lastGainAt)}` : ""}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="blk" style={{ fontSize: 17 }}>{e.exploredCells.toLocaleString("en-US")}</p>
                  <p className="mute" style={{ fontSize: 11 }}>cells · {p.toFixed(1)}%</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mute" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>Ranked by explored cells (validated ground, counted once). A tie goes to whoever got there first. Distance isn&apos;t part of this ranking.</p>

      {board.history.length > 0 && (
        <>
          <h2 className="lab" style={{ marginTop: 28 }}>Ownership history</h2>
          <ol data-testid="history" style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {board.history.map((h, i) => (
              <li key={h.reign} className="row" style={{ gap: 12, alignItems: "center" }}>
                <Avatar name={h.ownerName} photo={h.ownerPhoto} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700 }}>{h.ownerUid === uid ? "You" : firstName(h.ownerName)}{i === 0 ? <span style={{ color: GOLD, fontSize: 11, fontWeight: 800, letterSpacing: 1, marginLeft: 8 }}>CURRENT</span> : null}</span>
                  <span className="mute" style={{ display: "block", fontSize: 12 }}>{h.kind === "conquest" ? "Conquered" : "Took over"}{h.atMs ? ` · ${day(h.atMs)}` : ""}</span>
                </span>
                <span className="mute" style={{ fontSize: 12 }}>Reign {h.reign}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
