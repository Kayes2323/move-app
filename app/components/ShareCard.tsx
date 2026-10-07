"use client";
import type { CSSProperties } from "react";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatDuration, formatKm, formatPerformance, type Achievement, type ActivityKind } from "../lib/activity";
import { JourneyRoute } from "./JourneyRoute";

export type CardRatio = "story" | "post";

export const CARD_WIDTH = 360;
export const CARD_HEIGHT: Record<CardRatio, number> = { story: 640, post: 450 };

// Keeps the logo and text inside the area that survives Instagram's UI and a 4:5 / 1:1 crop of the story.
const LAYOUT = {
  story: { logoTop: 96, bottom: 120 },
  post: { logoTop: 24, bottom: 30 },
} as const;

const DISPLAY = "'Archivo Black', system-ui, sans-serif";
const TEXT = "'Space Grotesk', system-ui, sans-serif";

interface Props {
  kind: ActivityKind;
  km: number;
  duration: string;
  pace?: number;
  dateLabel: string;
  route?: Route;
  /** Absolute km along the route (from Dhaka) reached after this activity. */
  journeyKm: number;
  /** Route km where the user's journey began. */
  routeStartKm?: number;
  achievement?: Achievement | null;
  photo?: string | null;
  ratio: CardRatio;
}

export function ShareCard({ kind, km, duration, pace, dateLabel, route, journeyKm, routeStartKm = 0, achievement, photo, ratio }: Props) {
  const meta = ACTIVITY_META[kind];
  const H = CARD_HEIGHT[ratio];
  const { logoTop, bottom } = LAYOUT[ratio];
  const hasPhoto = Boolean(photo);

  const distance = formatKm(km);
  const distanceSize = distance.length <= 4 ? 82 : distance.length <= 5 ? 70 : 58;
  const blockHeight = achievement ? 190 : 130;
  const secondary: CSSProperties = { fontFamily: TEXT, fontSize: 18, fontWeight: 600, marginTop: 8, color: "#FFFFFF" };

  const routeTop = logoTop + 48;
  const routeBottom = H - bottom - blockHeight - 8;
  const routeHeight = Math.max(routeBottom - routeTop, 120);

  return (
    <div style={{ position: "relative", width: CARD_WIDTH, height: H, overflow: "hidden", background: "#0A0A0C", color: "#FFFFFF", fontFamily: TEXT }}>
      {hasPhoto && (
        <>
          <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "50% 38%" }} />
          {/* One full-size layer: separate gradient elements leave hairline seams in the exported PNG. */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.34) 0px, rgba(0,0,0,0) 170px), linear-gradient(to top, rgba(0,0,0,0.76) 0%, rgba(0,0,0,0.36) 24%, rgba(0,0,0,0) 50%)" }} />
        </>
      )}

      {!hasPhoto && route && (
        <div style={{ position: "absolute", left: 0, top: routeTop, width: CARD_WIDTH, height: routeHeight, display: "flex", justifyContent: "center" }}>
          <JourneyRoute
            route={route}
            progressKm={journeyKm}
            startKm={routeStartKm}
            width={CARD_WIDTH}
            height={routeHeight}
            padL={achievement ? 120 : 104}
            padR={achievement ? 120 : 104}
            padY={10}
            labels="auto"
            accent={meta.accent}
            line={3}
            fontSize={11}
          />
        </div>
      )}

      {!hasPhoto && !route && (
        // No photo and no journey route: a quiet Move watermark keeps the card intentional rather than empty.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/move-mark.png" alt="" aria-hidden="true" style={{ position: "absolute", left: "50%", top: routeTop + routeHeight / 2, width: 190, height: "auto", transform: "translate(-50%, -50%)", opacity: 0.07 }} />
      )}

      {hasPhoto && route && (
        <div style={{ position: "absolute", right: 8, bottom: bottom, width: 200, height: 176 }}>
          <JourneyRoute route={route} progressKm={journeyKm}
            startKm={routeStartKm} width={200} height={176} padL={66} padR={30} padY={14} labels="mini" accent={meta.accent} line={2.2} fontSize={11} dotted={false} />
        </div>
      )}

      {/* Move icon: always present, inside the crop-safe area */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/move-mark.png" alt="Move" width={42} height={29} style={{ position: "absolute", left: 28, top: logoTop, width: 42, height: "auto" }} />

      <div style={{ position: "absolute", left: 28, bottom }}>
        {achievement ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={meta.accent} aria-hidden="true">
                <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
              </svg>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2.4, color: hasPhoto ? "#FFFFFF" : meta.accent, textShadow: hasPhoto ? "0 1px 8px rgba(0,0,0,0.45)" : "none" }}>{achievement.title}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{achievement.subtitle}</div>
          </div>
        ) : (
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, color: hasPhoto ? "rgba(255,255,255,0.88)" : meta.accent }}>
            {meta.label}
            {dateLabel ? ` · ${dateLabel}` : ""}
          </div>
        )}
        <div style={{ fontFamily: DISPLAY, fontSize: distanceSize, lineHeight: 1, marginTop: achievement ? 4 : 6, textShadow: hasPhoto ? "0 1px 12px rgba(0,0,0,0.35)" : "none" }}>
          {distance}
          <span style={{ fontSize: 20, marginLeft: 7, color: hasPhoto ? "rgba(255,255,255,0.85)" : "#8A8A94" }}>km</span>
        </div>
        <div style={secondary}>
          {formatDuration(duration)}
          <span style={{ opacity: 0.5, margin: "0 10px" }}>·</span>
          {formatPerformance(kind, pace)}
        </div>
      </div>
    </div>
  );
}
