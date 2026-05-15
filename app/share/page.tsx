"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RunEntry {
  km: number;
  duration: string;
  date: string;
}

interface UserData {
  name: string;
  totalKm: number;
  completedKm: number;
  currentRoute: string;
  runs: RunEntry[];
}

// ─── Route Data ───────────────────────────────────────────────────────────────
interface CheckpointDef {
  name: string;
  position: number; // km from Dhaka
  // normalized SVG coords (0-100 scale, will be mapped to card dimensions)
  // x: left = 0, right = 100  |  y: top = 0, bottom = 100
  nx: number;
  ny: number;
}

const ROUTE_DATA: Record<string, { total: number; checkpoints: CheckpointDef[] }> = {
  "Chandpur": {
    total: 105,
    checkpoints: [
      { name: "Dhaka",       position: 0,   nx: 50, ny: 8  },
      { name: "Narayanganj", position: 20,  nx: 55, ny: 30 },
      { name: "Munshiganj",  position: 55,  nx: 52, ny: 58 },
      { name: "Chandpur",    position: 105, nx: 48, ny: 90 },
    ],
  },
  "Cox's Bazar": {
    total: 399,
    checkpoints: [
      { name: "Dhaka",      position: 0,   nx: 50, ny: 8  },
      { name: "Comilla",    position: 95,  nx: 60, ny: 30 },
      { name: "Feni",       position: 155, nx: 65, ny: 50 },
      { name: "Chittagong", position: 265, nx: 62, ny: 72 },
      { name: "Cox's Bazar",position: 399, nx: 55, ny: 92 },
    ],
  },
  "Sylhet": {
    total: 317,
    checkpoints: [
      { name: "Dhaka",        position: 0,   nx: 50, ny: 8  },
      { name: "Narsingdi",    position: 60,  nx: 58, ny: 28 },
      { name: "Brahmanbaria", position: 120, nx: 65, ny: 50 },
      { name: "Habiganj",     position: 210, nx: 68, ny: 70 },
      { name: "Sylhet",       position: 317, nx: 62, ny: 92 },
    ],
  },
  "Chittagong": {
    total: 264,
    checkpoints: [
      { name: "Dhaka",      position: 0,   nx: 50, ny: 8  },
      { name: "Comilla",    position: 116, nx: 60, ny: 38 },
      { name: "Feni",       position: 172, nx: 65, ny: 62 },
      { name: "Chittagong", position: 264, nx: 60, ny: 92 },
    ],
  },
  "Rajshahi": {
    total: 262,
    checkpoints: [
      { name: "Dhaka",     position: 0,   nx: 50, ny: 8  },
      { name: "Manikganj", position: 55,  nx: 42, ny: 30 },
      { name: "Sirajganj", position: 140, nx: 35, ny: 58 },
      { name: "Natore",    position: 200, nx: 28, ny: 75 },
      { name: "Rajshahi",  position: 262, nx: 22, ny: 92 },
    ],
  },
  "Rangpur": {
    total: 318,
    checkpoints: [
      { name: "Dhaka",     position: 0,   nx: 50, ny: 8  },
      { name: "Tangail",   position: 90,  nx: 42, ny: 30 },
      { name: "Bogura",    position: 175, nx: 35, ny: 55 },
      { name: "Gaibandha", position: 240, nx: 30, ny: 75 },
      { name: "Rangpur",   position: 318, nx: 28, ny: 92 },
    ],
  },
  "Khulna": {
    total: 333,
    checkpoints: [
      { name: "Dhaka",    position: 0,   nx: 50, ny: 8  },
      { name: "Faridpur", position: 100, nx: 40, ny: 32 },
      { name: "Narail",   position: 190, nx: 32, ny: 58 },
      { name: "Jashore",  position: 230, nx: 26, ny: 72 },
      { name: "Khulna",   position: 333, nx: 22, ny: 92 },
    ],
  },
  "Barisal": {
    total: 270,
    checkpoints: [
      { name: "Dhaka",      position: 0,   nx: 50, ny: 8  },
      { name: "Munshiganj", position: 50,  nx: 48, ny: 30 },
      { name: "Madaripur",  position: 130, nx: 44, ny: 58 },
      { name: "Barisal",    position: 270, nx: 46, ny: 92 },
    ],
  },
};

// ─── Route color per destination ─────────────────────────────────────────────
const ROUTE_COLOR: Record<string, string> = {
  "Chandpur":    "#22C55E",
  "Cox's Bazar": "#3B82F6",
  "Sylhet":      "#10B981",
  "Chittagong":  "#F97316",
  "Rajshahi":    "#F59E0B",
  "Rangpur":     "#8B5CF6",
  "Khulna":      "#EF4444",
  "Barisal":     "#06B6D4",
};

// ─── Helper: build curved SVG path from normalized points ────────────────────
function buildCurvedPath(
  pts: { x: number; y: number }[],
  w: number,
  h: number
): string {
  if (pts.length < 2) return "";
  const toSVG = (p: { x: number; y: number }) => ({
    x: (p.x / 100) * w,
    y: (p.y / 100) * h,
  });
  const svgPts = pts.map(toSVG);
  let d = `M ${svgPts[0].x} ${svgPts[0].y}`;
  for (let i = 0; i < svgPts.length - 1; i++) {
    const a = svgPts[i];
    const b = svgPts[i + 1];
    // control points — natural curve following the real road direction
    const cp1x = a.x + (b.x - a.x) * 0.3;
    const cp1y = a.y + (b.y - a.y) * 0.6;
    const cp2x = a.x + (b.x - a.x) * 0.7;
    const cp2y = a.y + (b.y - a.y) * 0.4;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${b.x} ${b.y}`;
  }
  return d;
}

// ─── Mini Route Map SVG ───────────────────────────────────────────────────────
function RouteMapSVG({
  routeName,
  completedKm,
  w,
  h,
}: {
  routeName: string;
  completedKm: number;
  w: number;
  h: number;
}) {
  const data = ROUTE_DATA[routeName] ?? ROUTE_DATA["Cox's Bazar"];
  const color = ROUTE_COLOR[routeName] ?? "#3B82F6";
  const total = data.total;
  const cps = data.checkpoints;

  // find current checkpoint index
  let currentIdx = 0;
  for (let i = 0; i < cps.length; i++) {
    if (completedKm >= cps[i].position) currentIdx = i;
  }

  // build full path coords
  const allPts = cps.map((c) => ({ x: c.nx, y: c.ny }));
  const fullPath = buildCurvedPath(allPts, w, h);

  // build progress path — up to interpolated position
  let progressPts: { x: number; y: number }[] = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i], b = cps[i + 1];
    if (completedKm >= b.position) {
      if (progressPts.length === 0) progressPts.push({ x: a.nx, y: a.ny });
      progressPts.push({ x: b.nx, y: b.ny });
    } else if (completedKm > a.position) {
      const t = (completedKm - a.position) / (b.position - a.position);
      if (progressPts.length === 0) progressPts.push({ x: a.nx, y: a.ny });
      progressPts.push({
        x: a.nx + (b.nx - a.nx) * t,
        y: a.ny + (b.ny - a.ny) * t,
      });
      break;
    }
  }
  const progressPath = buildCurvedPath(progressPts, w, h);

  // user position
  const userCp = cps[currentIdx];
  const nextCp = cps[currentIdx + 1];
  let userNX = userCp.nx, userNY = userCp.ny;
  if (nextCp && completedKm > userCp.position) {
    const t = (completedKm - userCp.position) / (nextCp.position - userCp.position);
    userNX = userCp.nx + (nextCp.nx - userCp.nx) * t;
    userNY = userCp.ny + (nextCp.ny - userCp.ny) * t;
  }
  const userX = (userNX / 100) * w;
  const userY = (userNY / 100) * h;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      {/* Full dashed path */}
      <path
        d={fullPath}
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="2"
        strokeDasharray="5 4"
        strokeLinecap="round"
      />

      {/* Completed path */}
      {progressPath && completedKm > 0 && (
        <path
          d={progressPath}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      )}

      {/* Checkpoint dots */}
      {cps.map((cp, i) => {
        const cx = (cp.nx / 100) * w;
        const cy = (cp.ny / 100) * h;
        const done = completedKm >= cp.position;
        const isStart = i === 0;
        const isEnd = i === cps.length - 1;
        const isCurrent = i === currentIdx && completedKm > 0;

        // label side: if point is on left half → label right, else → label left
        const labelLeft = cp.nx < 50;
        const labelX = labelLeft ? cx + 8 : cx - 8;
        const anchor = labelLeft ? "start" : "end";
        const showLabel = isStart || isEnd || isCurrent || i === currentIdx + 1;

        return (
          <g key={i}>
            {/* pulse ring for current */}
            {isCurrent && (
              <circle cx={cx} cy={cy} r="9" fill={color} opacity="0.18" />
            )}

            {/* dot */}
            <circle
              cx={cx} cy={cy}
              r={isStart || isEnd ? 5 : 3.5}
              fill={done ? color : "rgba(255,255,255,0.12)"}
              stroke={done ? "white" : "rgba(255,255,255,0.3)"}
              strokeWidth="1.5"
            />

            {/* end flag */}
            {isEnd && (
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="white">⚑</text>
            )}

            {/* label */}
            {showLabel && (
              <text
                x={labelX} y={cy + 1}
                textAnchor={anchor}
                dominantBaseline="middle"
                fontSize="8.5"
                fill={done ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)"}
                fontFamily="system-ui"
                fontWeight={isCurrent ? "700" : "400"}
              >
                {cp.name}
              </text>
            )}
          </g>
        );
      })}

      {/* User "I'm here" marker */}
      {completedKm > 0 && (
        <g>
          <circle cx={userX} cy={userY} r="5.5" fill={color} stroke="white" strokeWidth="2" />
          {/* badge */}
          <rect
            x={userX + 9} y={userY - 10}
            width={44} height={20}
            rx="10"
            fill={color}
          />
          <text
            x={userX + 31} y={userY + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fill="white"
            fontFamily="system-ui"
            fontWeight="700"
          >
            I&apos;m here
          </text>
        </g>
      )}

      {/* progress % bottom */}
      <text
        x={w / 2} y={h - 2}
        textAnchor="middle"
        fontSize="9"
        fill="rgba(255,255,255,0.35)"
        fontFamily="system-ui"
      >
        {Math.min(Math.round((completedKm / total) * 100), 100)}% done
      </text>
    </svg>
  );
}

// ─── Main Share Page ──────────────────────────────────────────────────────────
export default function SharePage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);

  const [user,     setUser]     = useState<UserData | null>(null);
  const [bgImage,  setBgImage]  = useState<string | null>(null);
  const [sharing,  setSharing]  = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saved,    setSaved]    = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load Firebase user data ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { auth, db }           = await import("../firebase");
        const { doc, getDoc }        = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (cancelled) return;
          if (firebaseUser) {
            const snap = await getDoc(doc(db, "users", firebaseUser.uid));
            if (snap.exists() && !cancelled) setUser(snap.data() as UserData);
          }
          if (!cancelled) setLoading(false);
        });
      } catch { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── Share / Download ──────────────────────────────────────────────────────
  const handleShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "move-journey.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "MOVE — My Journey", text: `I'm running from Dhaka to ${currentRoute} with MOVE! ${completedKm.toFixed(1)} km done. #RunYourWorld` });
        } else {
          const url = URL.createObjectURL(blob);
          const a   = document.createElement("a");
          a.href     = url;
          a.download = "move-journey.png";
          a.click();
          URL.revokeObjectURL(url);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        }
      }, "image/png");
    } catch (e) { console.error(e); }
    setSharing(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const currentRoute = user?.currentRoute ?? "Cox's Bazar";
  const completedKm  = user?.completedKm  ?? 0;
  const color        = ROUTE_COLOR[currentRoute] ?? "#3B82F6";
  const routeData    = ROUTE_DATA[currentRoute]  ?? ROUTE_DATA["Cox's Bazar"];
  const runs         = user?.runs ?? [];

  const todayKm = runs
    .filter((r) => new Date(r.date).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + r.km, 0);

  const lastRun = runs[runs.length - 1];
  const timeStr = lastRun?.duration ?? "—";

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).toUpperCase();

  // ── Loading screen ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0A" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${color}`, borderTopColor: "transparent", animation: "sp 0.8s linear infinite" }} />
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main style={{
      minHeight: "100vh",
      background: "#0A0A0A",
      fontFamily: "'Archivo Black', system-ui, sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0 0 48px",
    }}>

      {/* TOP BAR */}
      <div style={{
        width: "100%", maxWidth: 430,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "52px 20px 20px",
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "50%", width: 38, height: 38,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <p style={{ color: "white", fontSize: 13, fontWeight: 900, letterSpacing: 3, margin: 0 }}>SHARE CARD</p>
        <div style={{ width: 38 }} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SHARE CARD — this div is captured by html2canvas
      ══════════════════════════════════════════════════════════════════ */}
      <div
        ref={cardRef}
        style={{
          position: "relative",
          width: 360, height: 640,
          borderRadius: 24, overflow: "hidden",
          flexShrink: 0,
          background: "#0D1117",
        }}
      >
        {/* ── USER PHOTO BACKGROUND ── */}
        {bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgImage} alt="background"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0D1117 0%, #1a2236 40%, #0f2027 100%)" }} />
        )}

        {/* ── CINEMATIC OVERLAY — top + bottom only, no left gradient ── */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.05) 32%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.85) 100%)",
          pointerEvents: "none",
        }} />

        {/* ── TOP: MOVE LOGO ── */}
        <div style={{ position: "absolute", top: 26, left: 24, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ color: "white", fontSize: 22, fontWeight: 900, letterSpacing: -0.5 }}>MOV</span>
            {/* E → stylized arrow */}
            <svg width="14" height="22" viewBox="0 0 14 22" fill="none" style={{ marginBottom: 1 }}>
              <path d="M2 20L7 4L12 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 13H9.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ color: "rgba(255,255,255,0.42)", fontSize: 9, letterSpacing: 2.5, fontFamily: "system-ui" }}>
            RUN · CONQUER · REPEAT
          </span>
        </div>

        {/* date top right */}
        <div style={{ position: "absolute", top: 30, right: 24 }}>
          <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, fontFamily: "monospace", letterSpacing: 1.5 }}>
            {dateStr}
          </span>
        </div>

        {/* ── CENTER: ROUTE TITLE ── */}
        <div style={{
          position: "absolute", top: "50%", left: 24,
          transform: "translateY(-62%)",
          right: 150, // leave room for map
        }}>
          <p style={{ color: color, fontSize: 10, fontWeight: 700, letterSpacing: 4, margin: "0 0 8px", fontFamily: "system-ui" }}>
            JOURNEY
          </p>
          <h1 style={{ color: "white", fontSize: 34, fontWeight: 900, lineHeight: 1.0, margin: 0 }}>
            Dhaka<br />
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 20, fontWeight: 700 }}>to</span><br />
            {currentRoute}
          </h1>
        </div>

        {/* ── RIGHT: CURVED ROUTE MAP ── */}
        <div style={{
          position: "absolute",
          top: "50%", right: 16,
          transform: "translateY(-50%)",
          width: 130, height: 280,
        }}>
          <RouteMapSVG
            routeName={currentRoute}
            completedKm={completedKm}
            w={130}
            h={280}
          />
        </div>

        {/* ── BOTTOM: STATS ── */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 24px 26px" }}>
          {/* thin divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: 18 }} />

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* TODAY'S RUN */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                </svg>
              </div>
              <div>
                <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TODAY&apos;S RUN</p>
                <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
                  {todayKm.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", marginLeft: 3 }}>km</span>
                </p>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

            {/* TOTAL JOURNEY */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                  <line x1="8" y1="2" x2="8" y2="18"/>
                  <line x1="16" y1="6" x2="16" y2="22"/>
                </svg>
              </div>
              <div>
                <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TOTAL JOURNEY</p>
                <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>
                  {completedKm.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", marginLeft: 3 }}>/ {routeData.total} km</span>
                </p>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

            {/* TIME */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div>
                <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TIME</p>
                <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0, lineHeight: 1.1 }}>{timeStr}</p>
              </div>
            </div>
          </div>

          {/* hashtag + url */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, letterSpacing: 1, fontFamily: "system-ui" }}>#RunYourWorld</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "system-ui" }}>move-app.vercel.app</span>
          </div>
        </div>
      </div>
      {/* ══ END CARD ══ */}

      {/* ── CONTROLS ── */}
      <div style={{ width: "100%", maxWidth: 430, padding: "20px 20px 0" }}>

        {/* hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: "none" }}
        />

        {/* Upload photo button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%", padding: "14px", borderRadius: 16,
            background: bgImage ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)",
            border: bgImage ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.10)",
            cursor: "pointer", color: bgImage ? color : "rgba(255,255,255,0.6)",
            fontSize: 13, fontWeight: 700, marginBottom: 12,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: "system-ui",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          {bgImage ? "✓ Photo Added — Change" : "Add Your Photo as Background"}
        </button>

        {/* Share button */}
        <button
          onClick={handleShare}
          disabled={sharing}
          style={{
            width: "100%", padding: "17px", borderRadius: 16,
            background: sharing
              ? "rgba(255,255,255,0.08)"
              : `linear-gradient(135deg, ${color}, ${color}bb)`,
            border: "none",
            cursor: sharing ? "not-allowed" : "pointer",
            fontSize: 15, fontWeight: 900, color: "white",
            boxShadow: sharing ? "none" : `0 8px 24px ${color}44`,
            opacity: sharing ? 0.7 : 1,
            transition: "all 0.2s",
            letterSpacing: 0.5,
          }}
        >
          {sharing ? "Generating..." : saved ? "✓ Saved to device!" : "Share This Card →"}
        </button>

        <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", marginTop: 12, fontFamily: "system-ui" }}>
          Saves as image · Share to WhatsApp, Instagram, anywhere
        </p>
      </div>
    </main>
  );
}