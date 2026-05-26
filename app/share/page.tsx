"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

interface CheckpointDef {
  name: string;
  position: number;
  nx: number;
  ny: number;
}

const ROUTE_DATA: Record<string, { total: number; checkpoints: CheckpointDef[] }> = {
  "Chandpur": {
    total: 105,
    checkpoints: [
      { name: "Dhaka",       position: 0,   nx: 50, ny: 8  },
      { name: "Narayanganj", position: 20,  nx: 58, ny: 30 },
      { name: "Munshiganj",  position: 55,  nx: 44, ny: 58 },
      { name: "Chandpur",    position: 105, nx: 50, ny: 92 },
    ],
  },
  "Cox's Bazar": {
    total: 399,
    checkpoints: [
      { name: "Dhaka",       position: 0,   nx: 50, ny: 8  },
      { name: "Comilla",     position: 95,  nx: 65, ny: 30 },
      { name: "Feni",        position: 155, nx: 35, ny: 52 },
      { name: "Chittagong",  position: 265, nx: 62, ny: 72 },
      { name: "Cox's Bazar", position: 399, nx: 48, ny: 92 },
    ],
  },
  "Sylhet": {
    total: 317,
    checkpoints: [
      { name: "Dhaka",        position: 0,   nx: 50, ny: 8  },
      { name: "Narsingdi",    position: 60,  nx: 62, ny: 28 },
      { name: "Brahmanbaria", position: 120, nx: 38, ny: 50 },
      { name: "Habiganj",     position: 210, nx: 65, ny: 72 },
      { name: "Sylhet",       position: 317, nx: 50, ny: 92 },
    ],
  },
  "Chittagong": {
    total: 264,
    checkpoints: [
      { name: "Dhaka",      position: 0,   nx: 50, ny: 8  },
      { name: "Comilla",    position: 116, nx: 64, ny: 38 },
      { name: "Feni",       position: 172, nx: 36, ny: 62 },
      { name: "Chittagong", position: 264, nx: 56, ny: 92 },
    ],
  },
  "Rajshahi": {
    total: 262,
    checkpoints: [
      { name: "Dhaka",     position: 0,   nx: 50, ny: 8  },
      { name: "Manikganj", position: 55,  nx: 36, ny: 30 },
      { name: "Sirajganj", position: 140, nx: 62, ny: 55 },
      { name: "Natore",    position: 200, nx: 32, ny: 75 },
      { name: "Rajshahi",  position: 262, nx: 50, ny: 92 },
    ],
  },
  "Rangpur": {
    total: 318,
    checkpoints: [
      { name: "Dhaka",     position: 0,   nx: 50, ny: 8  },
      { name: "Tangail",   position: 90,  nx: 36, ny: 30 },
      { name: "Bogura",    position: 175, nx: 62, ny: 55 },
      { name: "Gaibandha", position: 240, nx: 34, ny: 75 },
      { name: "Rangpur",   position: 318, nx: 50, ny: 92 },
    ],
  },
  "Khulna": {
    total: 333,
    checkpoints: [
      { name: "Dhaka",    position: 0,   nx: 50, ny: 8  },
      { name: "Faridpur", position: 100, nx: 36, ny: 32 },
      { name: "Narail",   position: 190, nx: 60, ny: 58 },
      { name: "Jashore",  position: 230, nx: 34, ny: 74 },
      { name: "Khulna",   position: 333, nx: 50, ny: 92 },
    ],
  },
  "Barisal": {
    total: 270,
    checkpoints: [
      { name: "Dhaka",      position: 0,   nx: 50, ny: 8  },
      { name: "Munshiganj", position: 50,  nx: 60, ny: 30 },
      { name: "Madaripur",  position: 130, nx: 38, ny: 58 },
      { name: "Barisal",    position: 270, nx: 52, ny: 92 },
    ],
  },
};

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

function buildCurvedPath(pts: { x: number; y: number }[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const sv = (p: { x: number; y: number }) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h });
  const sp = pts.map(sv);
  let d = `M ${sp[0].x} ${sp[0].y}`;
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i], b = sp[i + 1];
    const cp1x = a.x + (b.x - a.x) * 0.3;
    const cp1y = a.y + (b.y - a.y) * 0.6;
    const cp2x = a.x + (b.x - a.x) * 0.7;
    const cp2y = a.y + (b.y - a.y) * 0.4;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${b.x} ${b.y}`;
  }
  return d;
}

function RouteMapSVG({
  routeName, completedKm, w, h,
}: {
  routeName: string; completedKm: number; w: number; h: number;
}) {
  const data  = ROUTE_DATA[routeName] ?? ROUTE_DATA["Cox's Bazar"];
  const color = ROUTE_COLOR[routeName] ?? "#3B82F6";
  const total = data.total;
  const cps   = data.checkpoints;
  const filterId = `glow-${routeName.replace(/[\s']/g, "")}`;

  let currentIdx = 0;
  for (let i = 0; i < cps.length; i++) {
    if (completedKm >= cps[i].position) currentIdx = i;
  }

  // full path
  const allPts   = cps.map(c => ({ x: c.nx, y: c.ny }));
  const fullPath = buildCurvedPath(allPts, w, h);

  // progress path
  let progressPts: { x: number; y: number }[] = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i], b = cps[i + 1];
    if (completedKm >= b.position) {
      if (!progressPts.length) progressPts.push({ x: a.nx, y: a.ny });
      progressPts.push({ x: b.nx, y: b.ny });
    } else if (completedKm > a.position) {
      const t = (completedKm - a.position) / (b.position - a.position);
      if (!progressPts.length) progressPts.push({ x: a.nx, y: a.ny });
      progressPts.push({ x: a.nx + (b.nx - a.nx) * t, y: a.ny + (b.ny - a.ny) * t });
      break;
    }
  }
  const progressPath = buildCurvedPath(progressPts, w, h);

  // user dot position
  const uCp = cps[currentIdx], nCp = cps[currentIdx + 1];
  let uNX = uCp.nx, uNY = uCp.ny;
  if (nCp && completedKm > uCp.position) {
    const t = (completedKm - uCp.position) / (nCp.position - uCp.position);
    uNX = uCp.nx + (nCp.nx - uCp.nx) * t;
    uNY = uCp.ny + (nCp.ny - uCp.ny) * t;
  }
  const uX = (uNX / 100) * w;
  const uY = (uNY / 100) * h;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ✅ Unfinished — solid bright white */}
      <path d={fullPath} fill="none"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="2.5" strokeLinecap="round" />

      {/* ✅ Completed — color + glow */}
      {progressPath && completedKm > 0 && (
        <>
          <path d={progressPath} fill="none"
            stroke={color} strokeWidth="7"
            strokeLinecap="round" opacity="0.22" />
          <path d={progressPath} fill="none"
            stroke={color} strokeWidth="3"
            strokeLinecap="round"
            filter={`url(#${filterId})`} />
        </>
      )}

      {/* Checkpoints */}
      {cps.map((cp, i) => {
        const cx = (cp.nx / 100) * w;
        const cy = (cp.ny / 100) * h;
        const done    = completedKm >= cp.position;
        const isStart = i === 0;
        const isEnd   = i === cps.length - 1;
        const isCurr  = i === currentIdx && completedKm > 0;
        const showLbl = isStart || isEnd || isCurr || i === currentIdx + 1;
        const lblLeft = cp.nx < 52;
        const lblX    = lblLeft ? cx + 9 : cx - 9;
        const anchor  = lblLeft ? "start" : "end";

        return (
          <g key={i}>
            {/* pulse ring */}
            {isCurr && <circle cx={cx} cy={cy} r="11" fill={color} opacity="0.18" />}

            {/* dot */}
            {done ? (
              <circle cx={cx} cy={cy} r={isStart || isEnd ? 6 : 4.5}
                fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" />
            ) : (
              <circle cx={cx} cy={cy} r={isStart || isEnd ? 6 : 4.5}
                fill="rgba(0,0,0,0.15)" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
            )}

            {/* label */}
            {showLbl && (
              <text x={lblX} y={cy + 1}
                textAnchor={anchor} dominantBaseline="middle"
                fontSize="9"
                fill={done ? "white" : "rgba(255,255,255,0.55)"}
                fontFamily="system-ui"
                fontWeight={isCurr ? "700" : "400"}>
                {cp.name}
              </text>
            )}
          </g>
        );
      })}

      {/* I'm here badge */}
      {completedKm > 0 && (
        <g>
          <circle cx={uX} cy={uY} r="6" fill={color} stroke="white" strokeWidth="2" />
          <rect x={uX + 10} y={uY - 10} width={46} height={20} rx="10" fill={color} />
          <text x={uX + 33} y={uY + 1}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fill="white" fontFamily="system-ui" fontWeight="700">
            I&apos;m here
          </text>
        </g>
      )}

      {/* % done */}
      <text x={w / 2} y={h - 2}
        textAnchor="middle" fontSize="9"
        fill="rgba(255,255,255,0.4)" fontFamily="system-ui">
        {Math.min(Math.round((completedKm / total) * 100), 100)}% done
      </text>
    </svg>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SharePage() {
  const router = useRouter();
  const cardRef     = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user,    setUser]    = useState<UserData | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { auth, db }           = await import("../firebase");
        const { doc, getDoc }        = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(auth, async (fu) => {
          if (cancelled) return;
          if (fu) {
            const snap = await getDoc(doc(db, "users", fu.uid));
            if (snap.exists() && !cancelled) setUser(snap.data() as UserData);
          }
          if (!cancelled) setLoading(false);
        });
      } catch { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ✅ Direct save — no navigator.share
  const handleSaveToGallery = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3, useCORS: true, allowTaint: true,
        backgroundColor: null, logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a   = document.createElement("a");
      a.href     = url;
      a.download = `move-${currentRoute.replace(/[\s']/g, "-").toLowerCase()}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const currentRoute = user?.currentRoute ?? "Cox's Bazar";
  const completedKm  = user?.completedKm  ?? 0;
  const color        = ROUTE_COLOR[currentRoute] ?? "#3B82F6";
  const routeData    = ROUTE_DATA[currentRoute]  ?? ROUTE_DATA["Cox's Bazar"];
  const runs         = user?.runs ?? [];

  const todayKm = runs
    .filter(r => new Date(r.date).toDateString() === new Date().toDateString())
    .reduce((s, r) => s + r.km, 0);
  const lastRun = runs[runs.length - 1];
  const timeStr = lastRun?.duration ?? "—";
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  }).toUpperCase();

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0A" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${color}`, borderTopColor: "transparent", animation: "sp 0.8s linear infinite" }} />
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "'Archivo Black', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 48px" }}>

      {/* TOP BAR */}
      <div style={{ width: "100%", maxWidth: 430, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 20px" }}>
        <button onClick={() => router.back()} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <p style={{ color: "white", fontSize: 13, fontWeight: 900, letterSpacing: 3, margin: 0 }}>SHARE CARD</p>
        <div style={{ width: 38 }} />
      </div>

      {/* ═══════════ CARD ═══════════ */}
      <div ref={cardRef} style={{
        position: "relative",
        width: 360, height: 640,
        borderRadius: 24, overflow: "hidden",
        flexShrink: 0,
        background: "#0D1117",
      }}>

        {/* ── BACKGROUND PHOTO ── */}
        {bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgImage} alt="bg" style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%", objectFit: "cover",
            objectPosition: "center top",
          }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg,#0D1117 0%,#1a2236 40%,#0f2027 100%)" }} />
        )}

        {/* ── ONLY bottom gradient for text readability — no dark overlay on photo ── */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: 260,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 40%, transparent 100%)",
          pointerEvents: "none",
        }} />

        {/* ── TOP LEFT: Logo ── */}
        <div style={{
          position: "absolute", top: 22, left: 22, zIndex: 2,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <img
            src="/icon-192.png"
            alt="MOVE"
            style={{ width: 28, height: 28, borderRadius: 7, objectFit: "contain", filter: "brightness(0) invert(1)" }}
          />
          <span style={{ color: "white", fontSize: 16, fontWeight: 900, letterSpacing: 4 }}>MOVE</span>
        </div>

        {/* ── TOP RIGHT: Date ── */}
        <div style={{ position: "absolute", top: 28, right: 22, zIndex: 2 }}>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 }}>
            {dateStr}
          </span>
        </div>

        {/* ── RIGHT SIDE: Curved route map strip ── */}
        <div style={{
          position: "absolute",
          top: 60, right: 12,
          width: 90, height: 390,
          zIndex: 2,
        }}>
          <RouteMapSVG
            routeName={currentRoute}
            completedKm={completedKm}
            w={90}
            h={390}
          />
        </div>

        {/* ── BOTTOM: Minimal stats ── */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "0 22px 24px",
          zIndex: 2,
        }}>
          {/* Route name — small */}
          <p style={{
            color: color, fontSize: 9, fontWeight: 700,
            letterSpacing: 3, margin: "0 0 4px", fontFamily: "system-ui",
          }}>JOURNEY</p>
          <p style={{
            color: "white", fontSize: 15, fontWeight: 900,
            margin: "0 0 14px", lineHeight: 1.2,
            paddingRight: 100, // avoid overlap with map
          }}>
            Dhaka → {currentRoute}
          </p>

          {/* Thin divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginBottom: 14 }} />

          {/* Stats row — 4 items, no icons, clean */}
          <div style={{ display: "flex", paddingRight: 100 }}>
            {[
              { val: `${todayKm.toFixed(2)} km`, lbl: "TODAY" },
              { val: timeStr,                    lbl: "TIME"  },
              { val: `${completedKm.toFixed(1)} km`, lbl: "TOTAL" },
              { val: `${Math.min(Math.round((completedKm / routeData.total) * 100), 100)}%`, lbl: "DONE" },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1,
                borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none",
                paddingLeft: i > 0 ? 10 : 0,
              }}>
                <p style={{ color: "white", fontSize: 14, fontWeight: 900, margin: 0, lineHeight: 1 }}>{s.val}</p>
                <p style={{ color: "rgba(255,255,255,0.38)", fontSize: 8, letterSpacing: 1.5, margin: "3px 0 0", fontFamily: "system-ui" }}>{s.lbl}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, letterSpacing: 1, fontFamily: "system-ui" }}>#RunYourWorld</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "system-ui" }}>move-app.vercel.app</span>
          </div>
        </div>
      </div>
      {/* ═══ END CARD ═══ */}

      {/* CONTROLS */}
      <div style={{ width: "100%", maxWidth: 430, padding: "20px 20px 0" }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />

        {/* Add photo */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ width: "100%", padding: "14px", borderRadius: 14, background: bgImage ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)", border: bgImage ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.10)", cursor: "pointer", color: bgImage ? color : "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "system-ui" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
          </svg>
          {bgImage ? "✓ Photo Added — Change" : "Add Your Photo as Background"}
        </button>

        {/* ✅ Save to Gallery */}
        <button
          onClick={handleSaveToGallery}
          disabled={saving}
          style={{ width: "100%", padding: "17px", borderRadius: 14, background: saving ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${color}, ${color}aa)`, border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 900, color: "white", boxShadow: saving ? "none" : `0 8px 24px ${color}33`, letterSpacing: 1, marginBottom: 10, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "⬇ SAVE TO GALLERY"}
        </button>

        {/* Done */}
        <button
          onClick={() => router.back()}
          style={{ width: "100%", padding: "13px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: 700, fontFamily: "system-ui" }}
        >
          Done
        </button>

        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 11, textAlign: "center", marginTop: 12, fontFamily: "system-ui" }}>
          Saves as image · Share to WhatsApp, Instagram, anywhere
        </p>
      </div>
    </main>
  );
}