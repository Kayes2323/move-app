"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ROUTES as ROUTE_LIST } from "../data/routes";

interface RunEntry {
  km: number;
  duration: string;
  date: string;
  calories?: number;
  pace?: number;
  steps?: number;
  activity?: string;
}

interface UserData {
  name: string;
  totalKm: number;
  completedKm: number;
  currentRoute: string;
  runs: RunEntry[];
}

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

const ROUTE_COLOR2: Record<string, string> = {
  "Chandpur":    "#16A34A",
  "Cox's Bazar": "#2563EB",
  "Sylhet":      "#059669",
  "Chittagong":  "#EA580C",
  "Rajshahi":    "#D97706",
  "Rangpur":     "#7C3AED",
  "Khulna":      "#DC2626",
  "Barisal":     "#0891B2",
};

const ACTIVITY_LABEL: Record<string, string> = {
  running: "OUTDOOR RUN",
  walking: "OUTDOOR WALK",
  cycling: "CYCLING",
};

// nx/ny curved coordinates per route
const ROUTE_NX: Record<string, { nx: number; ny: number }[]> = {
  "Chandpur":    [{nx:50,ny:8},{nx:58,ny:30},{nx:44,ny:58},{nx:50,ny:92}],
  "Cox's Bazar": [{nx:50,ny:8},{nx:65,ny:22},{nx:42,ny:38},{nx:58,ny:52},{nx:35,ny:65},{nx:60,ny:78},{nx:48,ny:92}],
  "Sylhet":      [{nx:50,ny:8},{nx:62,ny:28},{nx:38,ny:50},{nx:65,ny:72},{nx:50,ny:92}],
  "Chittagong":  [{nx:50,ny:8},{nx:64,ny:38},{nx:36,ny:62},{nx:56,ny:92}],
  "Rajshahi":    [{nx:50,ny:8},{nx:36,ny:30},{nx:62,ny:55},{nx:32,ny:75},{nx:50,ny:92}],
  "Rangpur":     [{nx:50,ny:8},{nx:36,ny:30},{nx:62,ny:55},{nx:34,ny:75},{nx:50,ny:92}],
  "Khulna":      [{nx:50,ny:8},{nx:36,ny:32},{nx:60,ny:58},{nx:34,ny:74},{nx:50,ny:92}],
  "Barisal":     [{nx:50,ny:8},{nx:60,ny:30},{nx:38,ny:58},{nx:52,ny:92}],
};

function buildCurvedPath(pts: {x:number;y:number}[], w: number, h: number): string {
  if (pts.length < 2) return "";
  const sv = (p: {x:number;y:number}) => ({ x: (p.x/100)*w, y: (p.y/100)*h });
  const sp = pts.map(sv);
  let d = `M ${sp[0].x} ${sp[0].y}`;
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i], b = sp[i+1];
    d += ` C ${a.x+(b.x-a.x)*0.3} ${a.y+(b.y-a.y)*0.6} ${a.x+(b.x-a.x)*0.7} ${a.y+(b.y-a.y)*0.4} ${b.x} ${b.y}`;
  }
  return d;
}

function RouteMapSVG({ routeName, completedKm, w, h }: {
  routeName: string; completedKm: number; w: number; h: number;
}) {
  const routeData = ROUTE_LIST.find(r => r.name === routeName) ?? ROUTE_LIST[0];
  const color = ROUTE_COLOR[routeName] ?? "#3B82F6";
  const color2 = ROUTE_COLOR2[routeName] ?? "#2563EB";
  const total = routeData.totalKm;
  const cps = routeData.checkpoints;
  const coords = ROUTE_NX[routeName] ?? ROUTE_NX["Cox's Bazar"];
  const filterId = `glow-${routeName.replace(/[\s']/g,"")}`;
  const gradId = `grad-${routeName.replace(/[\s']/g,"")}`;

  let currentIdx = 0;
  for (let i = 0; i < cps.length; i++) {
    if (completedKm >= cps[i].distanceFromStart) currentIdx = i;
  }

  // Limit coords to checkpoint count
  const usedCoords = coords.slice(0, cps.length);

  const allPts = usedCoords.map(c => ({ x: c.nx, y: c.ny }));
  const fullPath = buildCurvedPath(allPts, w, h);

  let progressPts: {x:number;y:number}[] = [];
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i], b = cps[i+1];
    const ca = usedCoords[i], cb = usedCoords[i+1];
    if (!ca || !cb) break;
    if (completedKm >= b.distanceFromStart) {
      if (!progressPts.length) progressPts.push({ x: ca.nx, y: ca.ny });
      progressPts.push({ x: cb.nx, y: cb.ny });
    } else if (completedKm > a.distanceFromStart) {
      const t = (completedKm - a.distanceFromStart) / (b.distanceFromStart - a.distanceFromStart);
      if (!progressPts.length) progressPts.push({ x: ca.nx, y: ca.ny });
      progressPts.push({ x: ca.nx+(cb.nx-ca.nx)*t, y: ca.ny+(cb.ny-ca.ny)*t });
      break;
    }
  }
  const progressPath = buildCurvedPath(progressPts, w, h);

  const uCa = usedCoords[currentIdx], uCb = usedCoords[currentIdx+1];
  const uCp = cps[currentIdx], uNp = cps[currentIdx+1];
  let uNX = uCa?.nx ?? 50, uNY = uCa?.ny ?? 50;
  if (uCb && uNp && completedKm > uCp.distanceFromStart) {
    const t = (completedKm - uCp.distanceFromStart) / (uNp.distanceFromStart - uCp.distanceFromStart);
    uNX = uCa.nx + (uCb.nx-uCa.nx)*t;
    uNY = uCa.ny + (uCb.ny-uCa.ny)*t;
  }
  const uX = (uNX/100)*w;
  const uY = (uNY/100)*h;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <filter id={filterId} x="-60%" y="-30%" width="220%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color}/>
          <stop offset="100%" stopColor={color2}/>
        </linearGradient>
      </defs>

      {/* Full route — dashed white */}
      <path d={fullPath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 4"/>

      {/* Completed — glow */}
      {progressPath && completedKm > 0 && (
        <>
          <path d={progressPath} fill="none" stroke={`url(#${gradId})`} strokeWidth="7" strokeLinecap="round" opacity="0.28"/>
          <path d={progressPath} fill="none" stroke={`url(#${gradId})`} strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId})`}/>
        </>
      )}

      {/* Checkpoints */}
      {cps.map((cp, i) => {
        const coord = usedCoords[i];
        if (!coord) return null;
        const cx = (coord.nx/100)*w;
        const cy = (coord.ny/100)*h;
        const done = completedKm >= cp.distanceFromStart;
        const isStart = i === 0;
        const isEnd = i === cps.length - 1;
        const isCurr = i === currentIdx && completedKm > 0;
        const showLbl = isStart || isEnd || isCurr || i === currentIdx + 1;
        const lblLeft = coord.nx < 52;
        const lblX = lblLeft ? cx + 8 : cx - 8;
        const anchor = lblLeft ? "start" : "end";

        return (
          <g key={i}>
            {isCurr && <circle cx={cx} cy={cy} r="10" fill={color} opacity="0.2"/>}
            {done ? (
              <circle cx={cx} cy={cy} r={isStart || isEnd ? 6 : 4} fill={color} stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
            ) : (
              <circle cx={cx} cy={cy} r={isStart || isEnd ? 6 : 4} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.42)" strokeWidth="1.8"/>
            )}
            {showLbl && (
              <text x={lblX} y={cy+1} textAnchor={anchor} dominantBaseline="middle"
                fontSize="8.5" fill={done ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.32)"}
                fontFamily="system-ui" fontWeight={isCurr ? "700" : "400"}>
                {cp.name}
              </text>
            )}
          </g>
        );
      })}

      {/* I'm here */}
      {completedKm > 0 && (
        <g>
          <circle cx={uX} cy={uY} r="5.5" fill={color} stroke="white" strokeWidth="2"/>
          <rect x={uX+9} y={uY-9} width={42} height={18} rx="9" fill={color}/>
          <text x={uX+30} y={uY+1} textAnchor="middle" dominantBaseline="middle"
            fontSize="7.5" fill="white" fontFamily="system-ui" fontWeight="700">
            I&apos;m here
          </text>
        </g>
      )}
    </svg>
  );
}

export default function SharePage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
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

  const handleSaveToGallery = async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3, useCORS: true, allowTaint: true, backgroundColor: null, logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `move-${currentRoute.replace(/[\s']/g,"-").toLowerCase()}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const currentRoute = user?.currentRoute ?? "Cox's Bazar";
  const completedKm  = user?.completedKm ?? 0;
  const color        = ROUTE_COLOR[currentRoute] ?? "#3B82F6";
  const color2       = ROUTE_COLOR2[currentRoute] ?? "#2563EB";
  const routeData    = ROUTE_LIST.find(r => r.name === currentRoute) ?? ROUTE_LIST[0];
  const runs         = user?.runs ?? [];

  const todayRuns = runs.filter(r => new Date(r.date).toDateString() === new Date().toDateString() && r.km > 0);
  const todayKm   = todayRuns.reduce((s, r) => s + r.km, 0);
  const totalCals = todayRuns.reduce((s, r) => s + (r.calories ?? 0), 0);
  const lastRun   = runs.filter(r => r.km > 0).slice(-1)[0];
  const timeStr   = lastRun?.duration ?? "—";
  const paceVal   = lastRun?.pace ?? 0;
  const paceStr   = paceVal > 0
    ? `${Math.floor(paceVal)}'${String(Math.round((paceVal%1)*60)).padStart(2,"0")}"`
    : "—";
  const kmLeft    = Math.max(routeData.totalKm - completedKm, 0);
  const percent   = Math.min(Math.round((completedKm / routeData.totalKm) * 100), 100);
  const activityLabel = ACTIVITY_LABEL[lastRun?.activity ?? "running"] ?? "OUTDOOR RUN";
  const dateStr   = new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }).toUpperCase();

  if (loading) return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0A0A0A" }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:`3px solid ${color}`, borderTopColor:"transparent", animation:"sp 0.8s linear infinite" }}/>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <main style={{ minHeight:"100vh", background:"#0A0A0A", fontFamily:"'Archivo Black',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", padding:"0 0 48px" }}>

      {/* TOP BAR */}
      <div style={{ width:"100%", maxWidth:440, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"52px 20px 20px" }}>
        <button onClick={() => router.back()} style={{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"50%", width:38, height:38, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <p style={{ color:"white", fontSize:13, fontWeight:900, letterSpacing:3, margin:0 }}>SHARE CARD</p>
        <div style={{ width:38 }}/>
      </div>

      {/* ═══ CARD — 4:5 Instagram ratio ═══ */}
      <div ref={cardRef} style={{
        position:"relative",
        width:380,
        height:475,
        borderRadius:20,
        overflow:"hidden",
        flexShrink:0,
        background:"#0D1117",
      }}>

        {/* BG PHOTO */}
        {bgImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bgImage} alt="bg" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", objectPosition:"center top" }}/>
        ) : (
          <div style={{ position:"absolute", inset:0, background:"linear-gradient(160deg,#0D1117 0%,#1a2236 40%,#0f2027 100%)" }}/>
        )}

        {/* Vignette — edges dark, center bright for face */}
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse at 50% 38%, transparent 28%, rgba(0,0,0,0.42) 100%)", pointerEvents:"none" }}/>
        {/* Bottom dark fade */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:200, background:"linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.4) 55%,transparent 100%)", pointerEvents:"none" }}/>
        {/* Top dark fade */}
        <div style={{ position:"absolute", top:0, left:0, right:0, height:80, background:"linear-gradient(to bottom,rgba(0,0,0,0.65) 0%,transparent 100%)", pointerEvents:"none" }}/>

        {/* TOP: MOVE + activity badge */}
        <div style={{ position:"absolute", top:16, left:18, right:18, display:"flex", justifyContent:"space-between", alignItems:"center", zIndex:3 }}>
          <div>
            <span style={{ color:"white", fontSize:16, fontWeight:900, letterSpacing:5 }}>MOVE</span>
            <p style={{ color:"rgba(255,255,255,0.32)", fontSize:7, letterSpacing:2, margin:"1px 0 0", fontFamily:"system-ui" }}>RUN · CONQUER · REPEAT</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, background:"rgba(0,0,0,0.45)", border:"1px solid rgba(255,255,255,0.14)", borderRadius:20, padding:"4px 10px" }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:color, boxShadow:`0 0 5px ${color}` }}/>
            <span style={{ color:"rgba(255,255,255,0.82)", fontSize:7.5, letterSpacing:1.5, fontWeight:700, fontFamily:"system-ui" }}>{activityLabel}</span>
          </div>
        </div>

        {/* RIGHT: Route map */}
        <div style={{ position:"absolute", right:12, top:58, width:90, height:290, zIndex:3 }}>
          <RouteMapSVG routeName={currentRoute} completedKm={completedKm} w={90} h={290}/>
        </div>

        {/* BOTTOM SECTION */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:3, padding:"0 14px 14px" }}>

          {/* Route name */}
          <div style={{ marginBottom:8 }}>
            <p style={{ color:"rgba(255,255,255,0.38)", fontSize:7.5, letterSpacing:2, fontFamily:"system-ui", margin:"0 0 2px" }}>JOURNEY · {dateStr}</p>
            <p style={{ color:"white", fontSize:14, fontWeight:900, margin:0 }}>Dhaka → {currentRoute}</p>
          </div>

          {/* STATS ROW — 4 compact cards */}
          <div style={{ display:"flex", gap:5, marginBottom:7 }}>
            {[
              { icon:"⏱", label:"TIME", value:timeStr, color:"#F59E0B" },
              { icon:"📍", label:"KM", value:`${todayKm.toFixed(1)}`, color:"#3B82F6" },
              { icon:"🔥", label:"KCAL", value:String(totalCals || (lastRun?.calories ?? 0)), color:"#EF4444" },
              { icon:"⚡", label:"PACE", value:paceStr, color:"#A78BFA" },
            ].map((s, i) => (
              <div key={i} style={{ flex:1, background:"rgba(0,0,0,0.58)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"7px 8px" }}>
                <p style={{ color:"rgba(255,255,255,0.38)", fontSize:6.5, letterSpacing:1, fontFamily:"system-ui", margin:"0 0 2px" }}>{s.icon} {s.label}</p>
                <p style={{ color:s.color, fontSize:15, fontWeight:900, margin:0, lineHeight:1 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* ROUTE PROGRESS BAR */}
          <div style={{ background:"rgba(0,0,0,0.58)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"8px 10px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
              <span style={{ color:"rgba(255,255,255,0.38)", fontSize:7, letterSpacing:1, fontFamily:"system-ui" }}>🗺️ ROUTE PROGRESS</span>
              <span style={{ color:"rgba(255,255,255,0.45)", fontSize:7.5, fontFamily:"system-ui" }}>{kmLeft.toFixed(0)} km left</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ width:`${percent}%`, height:"100%", background:`linear-gradient(90deg,${color},${color2})`, borderRadius:2, boxShadow:`0 0 6px ${color}55` }}/>
              </div>
              <span style={{ color:color, fontSize:11, fontWeight:900, whiteSpace:"nowrap" }}>{completedKm.toFixed(1)} / {routeData.totalKm} KM</span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:7 }}>
            <span style={{ color:"rgba(255,255,255,0.2)", fontSize:7.5, letterSpacing:1, fontFamily:"system-ui" }}>#RunYourWorld</span>
            <span style={{ color:"rgba(255,255,255,0.18)", fontSize:7.5, fontFamily:"system-ui" }}>move-app.vercel.app</span>
          </div>
        </div>
      </div>
      {/* ═══ END CARD ═══ */}

      {/* CONTROLS */}
      <div style={{ width:"100%", maxWidth:440, padding:"16px 20px 0" }}>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }}/>

        {/* Add photo */}
        <button onClick={() => fileInputRef.current?.click()}
          style={{ width:"100%", padding:"13px", borderRadius:14, background:bgImage ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)", border:bgImage ? `1px solid ${color}55` : "1px solid rgba(255,255,255,0.10)", cursor:"pointer", color:bgImage ? color : "rgba(255,255,255,0.55)", fontSize:13, fontWeight:700, marginBottom:10, display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"system-ui" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          {bgImage ? "✓ Photo Added — Change" : "Add Your Photo as Background"}
        </button>

        {/* Save to Gallery */}
        <button onClick={handleSaveToGallery} disabled={saving}
          style={{ width:"100%", padding:"16px", borderRadius:14, background:saving ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg,${color},${color2})`, border:"none", cursor:saving ? "not-allowed" : "pointer", fontSize:15, fontWeight:900, color:"white", boxShadow:saving ? "none" : `0 8px 24px ${color}33`, letterSpacing:1, marginBottom:10, opacity:saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : saved ? "✓ Saved!" : "⬇ SAVE TO GALLERY"}
        </button>

        {/* Done */}
        <button onClick={() => router.back()}
          style={{ width:"100%", padding:"13px", borderRadius:14, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", cursor:"pointer", color:"rgba(255,255,255,0.45)", fontSize:13, fontWeight:700, fontFamily:"system-ui" }}>
          Done
        </button>

        <p style={{ color:"rgba(255,255,255,0.16)", fontSize:10, textAlign:"center", marginTop:10, fontFamily:"system-ui" }}>
          Instagram/Facebook ready · 4:5 ratio · Share anywhere
        </p>
      </div>
    </main>
  );
}