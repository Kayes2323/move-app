// app/result/page.tsx — FULL UPDATED FILE
"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";
import { ROUTES as ROUTE_LIST } from "../data/routes";

const ROUTES: Record<string, number> = Object.fromEntries(
  ROUTE_LIST.map(r => [r.name, r.totalKm])
);

const ROUTE_CHECKPOINTS: Record<string, { name: string; position: number }[]> =
  Object.fromEntries(
    ROUTE_LIST.map(r => [
      r.name,
      r.checkpoints.map(cp => ({ name: cp.name, position: cp.distanceFromStart }))
    ])
  );

interface UserData {
  name: string;
  totalKm: number;
  completedKm: number;
  currentRoute: string;
}

function ShareModal({ km, time, pace, calories, steps, activity, currentRoute, completedKm, routeTotal, onClose }: {
  km: string; time: string; pace: string; calories: string; steps: string; activity: string;
  currentRoute: string; completedKm: number; routeTotal: number; onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ✅ SAVE TO GALLERY — direct download, no nested share
  const handleSaveToGallery = async () => {
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current!, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      });
      // Direct download
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `move-${currentRoute.replace(/\s/g, "-").toLowerCase()}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const checkpoints = ROUTE_CHECKPOINTS[currentRoute] || ROUTE_CHECKPOINTS["Chandpur"];
  const currentCpIdx = checkpoints.reduce((acc, cp, i) => completedKm >= cp.position ? i : acc, 0);
  const mapW = 120;
  const mapH = 260;
  const startY = 16;
  const endY = mapH - 16;
  const totalH = endY - startY;

  // Progress Y based on actual completedKm (not just checkpoint)
  const progressY = startY + Math.min(completedKm / routeTotal, 1) * totalH;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 40px", overflowY: "auto" }}>
      {/* TOP BAR */}
      <div style={{ width: "100%", maxWidth: 430, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 16px" }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <p style={{ color: "white", fontSize: 13, fontWeight: 900, letterSpacing: 3 }}>SHARE CARD</p>
        <div style={{ width: 38 }} />
      </div>

      {/* ═══════════════ CARD ═══════════════ */}
      <div ref={cardRef} style={{
        position: "relative",
        width: 360,
        minHeight: 640,
        borderRadius: 24,
        overflow: "hidden",
        flexShrink: 0,
        background: "#0D1117",
      }}>
        {/* BG */}
        {bgImage ? (
          <img src={bgImage} alt="bg" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0D1117 0%, #1a2236 50%, #0f2027 100%)" }} />
        )}
        {/* Cinematic overlay */}
        <div style={{ position: "absolute", inset: 0, background: bgImage ? "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 30%, rgba(0,0,0,0.6) 65%, rgba(0,0,0,0.92) 100%)" : "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.95) 100%)" }} />

        {/* ── TOP ROW: Logo + Date ── */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 22px 0" }}>
          {/* MOVE logo — actual icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="/icon-192.png"
              alt="MOVE"
              style={{ width: 28, height: 28, borderRadius: 6, objectFit: "contain", filter: "brightness(0) invert(1)" }}
            />
            <span style={{ color: "white", fontSize: 15, fontWeight: 900, letterSpacing: 5 }}>MOVE</span>
          </div>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
          </span>
        </div>

        {/* ── MIDDLE: Journey title + Route map side by side ── */}
        <div style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "32px 22px 0" }}>
          {/* Left: Title */}
          <div style={{ flex: 1 }}>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 4, margin: "0 0 8px", fontFamily: "system-ui" }}>JOURNEY</p>
            <h1 style={{ color: "white", fontSize: 36, fontWeight: 900, lineHeight: 1.05, margin: 0 }}>
              Dhaka
            </h1>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 16, fontWeight: 400, margin: "4px 0" }}>to</p>
            <h1 style={{ color: "white", fontSize: 36, fontWeight: 900, lineHeight: 1.05, margin: 0 }}>
              {currentRoute}
            </h1>

            {/* Progress pill */}
            <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(79,110,247,0.18)", border: "1px solid rgba(79,110,247,0.35)", borderRadius: 20, padding: "5px 12px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4F6EF7", boxShadow: "0 0 6px #4F6EF7" }} />
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 10, fontFamily: "system-ui", letterSpacing: 1 }}>
                {((completedKm / routeTotal) * 100).toFixed(1)}% complete
              </span>
            </div>
          </div>

          {/* Right: Route SVG map */}
          <div style={{ width: mapW, flexShrink: 0, marginTop: -8 }}>
            <svg width={mapW} height={mapH} viewBox={`0 0 ${mapW} ${mapH}`} style={{ overflow: "visible" }}>
              <defs>
                <filter id="blueGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="whiteGlow">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              {/* ✅ UNFINISHED line — bright white, solid */}
              <line
                x1={mapW / 2} y1={startY}
                x2={mapW / 2} y2={endY}
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* ✅ COMPLETED line — bright blue glow */}
              {completedKm > 0 && (
                <>
                  {/* Glow layer */}
                  <line
                    x1={mapW / 2} y1={startY}
                    x2={mapW / 2} y2={progressY}
                    stroke="#4F6EF7"
                    strokeWidth="6"
                    strokeLinecap="round"
                    opacity="0.35"
                  />
                  {/* Core blue line */}
                  <line
                    x1={mapW / 2} y1={startY}
                    x2={mapW / 2} y2={progressY}
                    stroke="#4F8EFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Checkpoints */}
              {checkpoints.map((cp, i) => {
                const y = startY + (cp.position / routeTotal) * totalH;
                const isCompleted = completedKm >= cp.position;
                const isCurrent = i === currentCpIdx;
                const isFirst = i === 0;
                const isLast = i === checkpoints.length - 1;
                const showLabel = isFirst || isLast || isCurrent || i === currentCpIdx + 1;
                const labelX = mapW / 2 + (i % 2 === 0 ? 11 : -11);
                const anchor = i % 2 === 0 ? "start" : "end";

                return (
                  <g key={i}>
                    {/* Glow ring for current */}
                    {isCurrent && (
                      <circle cx={mapW / 2} cy={y} r="11" fill="rgba(79,110,247,0.25)" />
                    )}

                    {/* ✅ Dot: completed = filled blue, unfinished = white hollow */}
                    {isCompleted ? (
                      <circle cx={mapW / 2} cy={y} r={isFirst || isLast ? 7 : 5}
                        fill="#4F8EFF"
                        stroke="#7EB8FF"
                        strokeWidth="1.5"
                      />
                    ) : (
                      <circle cx={mapW / 2} cy={y} r={isFirst || isLast ? 7 : 5}
                        fill="rgba(0,0,0,0.3)"
                        stroke="rgba(255,255,255,0.75)"
                        strokeWidth="2"
                      />
                    )}

                    {/* Flag emoji for last */}
                    {isLast && !isCompleted && (
                      <text x={mapW / 2} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8">🏁</text>
                    )}

                    {/* Label */}
                    {showLabel && (
                      <text
                        x={labelX} y={y + 1}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        fontSize="9"
                        fill={isCompleted ? "white" : "rgba(255,255,255,0.5)"}
                        fontWeight={isCurrent ? "bold" : "normal"}
                        fontFamily="system-ui"
                      >
                        {cp.name}
                      </text>
                    )}

                    {/* "I'm here" badge */}
                    {isCurrent && completedKm > 0 && (
                      <g>
                        <rect x={mapW / 2 + 10} y={y - 9} width={44} height={18} rx="9" fill="#4F6EF7" />
                        <text x={mapW / 2 + 32} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="7.5" fill="white" fontFamily="system-ui" fontWeight="bold">I'm here</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* ── BOTTOM STATS ── */}
        <div style={{ position: "relative", zIndex: 2, padding: "24px 22px 28px", marginTop: 16 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 18 }} />

          {/* Stats grid: 3 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 8px" }}>
            {[
              { label: "TODAY", value: `${parseFloat(km).toFixed(2)} km` },
              { label: "TOTAL", value: `${completedKm.toFixed(1)} km` },
              { label: "TIME", value: time },
              { label: "PACE", value: pace },
              { label: "KCAL", value: calories },
              { label: activity === "cycling" ? "SPEED" : "STEPS", value: parseInt(steps) >= 1000 ? `${(parseInt(steps)/1000).toFixed(1)}k` : steps },
            ].map((s, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 10px 8px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 2, margin: "0 0 4px", fontFamily: "system-ui" }}>{s.label}</p>
                <p style={{ color: "white", fontSize: 15, fontWeight: 900, margin: 0, lineHeight: 1 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 }}>#RunYourWorld</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "system-ui" }}>move-app.vercel.app</span>
          </div>
        </div>
      </div>
      {/* ═══════════════ END CARD ═══════════════ */}

      {/* CONTROLS */}
      <div style={{ width: "100%", maxWidth: 430, padding: "20px 20px 0" }}>
        {/* Add photo */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "13px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          {bgImage ? "Change Background Photo" : "Add Your Photo as Background"}
        </button>

        {/* ✅ SAVE TO GALLERY — primary action */}
        <button onClick={handleSaveToGallery} disabled={saving} style={{ width: "100%", padding: "16px", borderRadius: 14, background: saving ? "rgba(79,110,247,0.5)" : "linear-gradient(135deg, #4F6EF7, #7C3AED)", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 900, color: "white", boxShadow: saving ? "none" : "0 8px 24px rgba(79,110,247,0.35)", letterSpacing: 1, marginBottom: 10 }}>
          {saving ? "Saving..." : "⬇ SAVE TO GALLERY"}
        </button>

        {/* Done */}
        <button onClick={onClose} style={{ width: "100%", padding: "13px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700 }}>
          Done
        </button>
      </div>
    </div>
  );
}

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const km = params.get("km") || "0.00";
  const time = params.get("time") || "00:00";
  const pace = params.get("pace") || "0.00";
  const calories = params.get("calories") || "0";
  const steps = params.get("steps") || "0";
  const activity = params.get("activity") || "running";
  const [user, setUser] = useState<UserData | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) setUser(snap.data() as UserData);
        }
      } catch (err) { console.error(err); }
    };
    loadUser();
  }, []);

  const currentRoute = user?.currentRoute || "Chandpur";
  const routeTotal = ROUTES[currentRoute] || 105;
  const completedKm = user?.completedKm || 0;
  const percent = Math.min((completedKm / routeTotal) * 100, 100);
  const toGo = Math.max(routeTotal - completedKm, 0);

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 40%)", fontFamily: "'Archivo Black', sans-serif", padding: "0 20px 40px" }}>

      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "56px", marginBottom: "40px" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#6B7280" }}>✕</button>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: "20px", padding: "6px 14px" }}>
          <span style={{ fontSize: "14px" }}>✅</span>
          <span style={{ color: "#16A34A", fontSize: "11px", letterSpacing: "2px", fontWeight: 700 }}>RUN COMPLETE</span>
        </div>
      </div>

      <h1 style={{ color: "#0F0F0F", fontSize: "36px", fontWeight: 900, lineHeight: 1.1, marginBottom: "8px" }}>You moved the needle.</h1>
      <p style={{ color: "#6B7280", fontSize: "14px", fontFamily: "system-ui", marginBottom: "32px" }}>+{km} km closer to {currentRoute}.</p>

      {/* Result card */}
      <div style={{ background: "linear-gradient(135deg, #4F6EF7 0%, #6D28D9 60%, #7C3AED 100%)", borderRadius: "20px", padding: "24px", marginBottom: "32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ color: "white", fontSize: "13px", fontWeight: 900, letterSpacing: "2px" }}>MOVE</span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontFamily: "system-ui" }}>{new Date().toLocaleDateString("en-US")}</span>
        </div>
        <h2 style={{ color: "white", fontSize: "26px", fontWeight: 900, marginBottom: "20px" }}>Dhaka → {currentRoute}</h2>
        <div style={{ display: "flex", gap: "0", marginBottom: "20px" }}>
          {[
            { label: "KM TODAY", value: km },
            { label: "DURATION", value: time },
            { label: "PACE", value: pace },
            { label: "KCAL", value: calories },
            { label: activity === "cycling" ? "SPEED" : "STEPS", value: parseInt(steps) >= 1000 ? `${(parseInt(steps)/1000).toFixed(1)}k` : steps },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.15)" : "none", paddingLeft: i > 0 ? "10px" : "0" }}>
              <p style={{ color: "white", fontSize: "18px", fontWeight: 900, lineHeight: 1 }}>{s.value}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>{s.label}</p>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: "white", borderRadius: "4px", minWidth: percent > 0 ? "8px" : "0" }} />
        </div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>{percent.toFixed(1)}% of journey · {toGo.toFixed(1)} km to go</p>
      </div>

      {percent >= 100 ? (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "16px", padding: "16px", marginBottom: "24px", textAlign: "center" }}>
          <p style={{ color: "#92400E", fontSize: "16px", fontWeight: 900 }}>🏆 Journey Complete!</p>
          <p style={{ color: "#B45309", fontSize: "13px", fontFamily: "system-ui", marginTop: "4px" }}>You conquered {currentRoute}! Pick your next route.</p>
        </div>
      ) : (
        <div style={{ background: "#EEF2FF", borderRadius: "16px", padding: "14px 16px", marginBottom: "24px" }}>
          <p style={{ color: "#4F6EF7", fontSize: "13px", fontFamily: "system-ui" }}>🗺️ <strong>{toGo.toFixed(1)} km</strong> left to reach {currentRoute}. Keep going!</p>
        </div>
      )}

      <div style={{ display: "flex", gap: "12px" }}>
        <button onClick={() => setShowShareModal(true)} style={{ flex: 1, padding: "16px", borderRadius: "16px", background: "#0F0F0F", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span style={{ color: "white", fontSize: "14px", fontWeight: 700 }}>Share Card</span>
        </button>
        <button onClick={() => router.push("/")} style={{ flex: 1, padding: "16px", borderRadius: "16px", background: "#F3F4F6", border: "none", cursor: "pointer" }}>
          <span style={{ color: "#0F0F0F", fontSize: "14px", fontWeight: 700 }}>Done</span>
        </button>
      </div>

      {showShareModal && (
        <div style={{ position: "fixed", inset: 0, background: "#0A0A0A", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", overflowY: "auto" }}>
          <ShareModal
            km={km} time={time} pace={pace} calories={calories} steps={steps} activity={activity}
            currentRoute={currentRoute} completedKm={completedKm} routeTotal={routeTotal}
            onClose={() => setShowShareModal(false)}
          />
        </div>
      )}
    </main>
  );
}

export default function ResultPage() {
  return <Suspense><ResultContent /></Suspense>;
}