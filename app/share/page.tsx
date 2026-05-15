"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UserData {
  name: string;
  totalKm: number;
  completedKm: number;
  currentRoute: string;
  runs: { km: number; duration: string; date: string }[];
}

const ROUTE_CHECKPOINTS: Record<string, { name: string; position: number }[]> = {
  "Chandpur": [
    { name: "Dhaka", position: 0 },
    { name: "Narayanganj", position: 20 },
    { name: "Munshiganj", position: 55 },
    { name: "Chandpur", position: 105 },
  ],
  "Cox's Bazar": [
    { name: "Dhaka", position: 0 },
    { name: "Comilla", position: 95 },
    { name: "Feni", position: 155 },
    { name: "Chittagong", position: 265 },
    { name: "Cox's Bazar", position: 399 },
  ],
  "Sylhet": [
    { name: "Dhaka", position: 0 },
    { name: "Narsingdi", position: 60 },
    { name: "Brahmanbaria", position: 120 },
    { name: "Habiganj", position: 210 },
    { name: "Sylhet", position: 317 },
  ],
  "Chittagong": [
    { name: "Dhaka", position: 0 },
    { name: "Comilla", position: 116 },
    { name: "Feni", position: 172 },
    { name: "Chittagong", position: 264 },
  ],
  "Rajshahi": [
    { name: "Dhaka", position: 0 },
    { name: "Manikganj", position: 55 },
    { name: "Sirajganj", position: 140 },
    { name: "Rajshahi", position: 262 },
  ],
  "Rangpur": [
    { name: "Dhaka", position: 0 },
    { name: "Tangail", position: 90 },
    { name: "Bogura", position: 175 },
    { name: "Rangpur", position: 318 },
  ],
  "Khulna": [
    { name: "Dhaka", position: 0 },
    { name: "Faridpur", position: 100 },
    { name: "Jashore", position: 230 },
    { name: "Khulna", position: 333 },
  ],
  "Barisal": [
    { name: "Dhaka", position: 0 },
    { name: "Munshiganj", position: 50 },
    { name: "Madaripur", position: 130 },
    { name: "Barisal", position: 270 },
  ],
};

const ROUTE_TOTAL: Record<string, number> = {
  "Chandpur": 105, "Cox's Bazar": 399, "Sylhet": 317,
  "Chittagong": 264, "Rajshahi": 262, "Rangpur": 318,
  "Khulna": 333, "Barisal": 270,
};

export default function SharePage() {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const firebaseModule = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(firebaseModule.auth, async (firebaseUser) => {
          if (firebaseUser) {
            const snap = await getDoc(doc(firebaseModule.db, "users", firebaseUser.uid));
            if (snap.exists()) setUser(snap.data() as UserData);
          }
          setLoading(false);
        });
      } catch { setLoading(false); }
    };
    load();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setBgImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current!, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        if (navigator.share) {
          const file = new File([blob], "move-journey.png", { type: "image/png" });
          await navigator.share({ files: [file], title: "MOVE — My Journey" });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "move-journey.png";
          a.click();
        }
      }, "image/png");
    } catch (e) { console.error(e); }
    setSharing(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0A" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #4F6EF7", borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const currentRoute = user?.currentRoute || "Cox's Bazar";
  const completedKm = user?.completedKm || 0;
  const totalKm = ROUTE_TOTAL[currentRoute] || 399;
  const checkpoints = ROUTE_CHECKPOINTS[currentRoute] || ROUTE_CHECKPOINTS["Cox's Bazar"];
  const runs = user?.runs || [];
  const todayKm = runs.filter(r => new Date(r.date).toDateString() === new Date().toDateString()).reduce((s, r) => s + r.km, 0);
  const lastRun = runs[runs.length - 1];
  const timeStr = lastRun?.duration || "0m 0s";

  // Current city
  const currentCpIdx = checkpoints.reduce((acc, cp, i) => completedKm >= cp.position ? i : acc, 0);
  const currentCity = checkpoints[currentCpIdx].name;
  const nextCity = checkpoints[currentCpIdx + 1]?.name;

  // Mini route map dimensions
  const mapW = 130;
  const mapH = 220;

  return (
    <main style={{ minHeight: "100vh", background: "#0A0A0A", fontFamily: "'Archivo Black', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 40px" }}>

      {/* TOP BAR */}
      <div style={{ width: "100%", maxWidth: 430, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 16px" }}>
        <button onClick={() => router.back()} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "50%", width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>
        <p style={{ color: "white", fontSize: 14, fontWeight: 900, letterSpacing: 2 }}>SHARE CARD</p>
        <div style={{ width: 38 }} />
      </div>

      {/* CARD */}
      <div ref={cardRef} style={{
        position: "relative",
        width: 360,
        height: 640,
        borderRadius: 24,
        overflow: "hidden",
        flexShrink: 0,
        background: "#0D1117",
      }}>

        {/* BG IMAGE */}
        {bgImage ? (
          <img src={bgImage} alt="bg" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #0D1117 0%, #1a2236 40%, #0f2027 100%)" }} />
        )}

        {/* Cinematic gradient overlay — only bottom half */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.88) 100%)" }} />

        {/* TOP — MOVE logo */}
        <div style={{ position: "absolute", top: 24, left: 24, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4F6EF7", boxShadow: "0 0 10px #4F6EF7" }} />
          <span style={{ color: "white", fontSize: 20, fontWeight: 900, letterSpacing: 6 }}>MOVE</span>
        </div>

        <div style={{ position: "absolute", top: 30, right: 24 }}>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
          </span>
        </div>

        {/* CENTER — Route title */}
        <div style={{ position: "absolute", top: "50%", left: 24, right: 24, transform: "translateY(-60%)" }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 4, margin: "0 0 6px", fontFamily: "system-ui" }}>JOURNEY</p>
          <h1 style={{ color: "white", fontSize: 38, fontWeight: 900, lineHeight: 1.05, margin: 0 }}>
            Dhaka<br />
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 24 }}>to</span><br />
            {currentRoute}
          </h1>
        </div>

        {/* BOTTOM SECTION */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 24px 28px" }}>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginBottom: 18 }} />

          {/* Stats + Mini Map */}
          <div style={{ display: "flex", gap: 16 }}>

            {/* Stats */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(79,110,247,0.2)", border: "1px solid rgba(79,110,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TODAY'S RUN</p>
                  <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0 }}>{todayKm.toFixed(2)} <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>km</span></p>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(79,110,247,0.2)", border: "1px solid rgba(79,110,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TOTAL JOURNEY</p>
                  <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0 }}>{completedKm.toFixed(1)} <span style={{ fontSize: 12, fontWeight: 400, color: "rgba(255,255,255,0.5)" }}>km</span></p>
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(79,110,247,0.2)", border: "1px solid rgba(79,110,247,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, letterSpacing: 2, margin: 0, fontFamily: "system-ui" }}>TIME</p>
                  <p style={{ color: "white", fontSize: 20, fontWeight: 900, margin: 0 }}>{timeStr}</p>
                </div>
              </div>
            </div>

            {/* Mini route map */}
            <div style={{ width: mapW, flexShrink: 0 }}>
              <svg width={mapW} height={mapH} viewBox={`0 0 ${mapW} ${mapH}`}>
                {/* Route line — dashed gray */}
                <line x1={mapW/2} y1={20} x2={mapW/2} y2={mapH - 20} stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" />

                {/* Completed line — blue glow */}
                {completedKm > 0 && (() => {
                  const startY = 20;
                  const endY = mapH - 20;
                  const totalH = endY - startY;
                  const lastCp = checkpoints[currentCpIdx];
                  const progressY = startY + (lastCp.position / totalKm) * totalH;
                  return (
                    <>
                      <line x1={mapW/2} y1={startY} x2={mapW/2} y2={progressY} stroke="#4F6EF7" strokeWidth="3" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #4F6EF7)" }} />
                    </>
                  );
                })()}

                {/* Checkpoints */}
                {checkpoints.map((cp, i) => {
                  const y = 20 + (cp.position / totalKm) * (mapH - 40);
                  const isCompleted = completedKm >= cp.position;
                  const isLast = i === checkpoints.length - 1;
                  const isCurrent = i === currentCpIdx;
                  const isNext = i === currentCpIdx + 1;
                  const showLabel = i === 0 || isLast || isCurrent || isNext;

                  return (
                    <g key={i}>
                      {isCurrent && completedKm > 0 && (
                        <circle cx={mapW/2} cy={y} r="10" fill="rgba(79,110,247,0.2)" />
                      )}
                      <circle cx={mapW/2} cy={y} r={isLast || i === 0 ? "6" : "4"}
                        fill={isCompleted ? "#4F6EF7" : "rgba(255,255,255,0.12)"}
                        stroke={isCompleted ? "#4F6EF7" : "rgba(255,255,255,0.25)"}
                        strokeWidth="1.5" />
                      {isLast && (
                        <text x={mapW/2} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white">🏁</text>
                      )}
                      {showLabel && (
                        <text
                          x={mapW/2 + (i % 2 === 0 ? 12 : -12)}
                          y={y + 1}
                          textAnchor={i % 2 === 0 ? "start" : "end"}
                          dominantBaseline="middle"
                          fontSize="9"
                          fill={isCompleted ? "white" : "rgba(255,255,255,0.4)"}
                          fontWeight={isCurrent || isNext ? "bold" : "normal"}
                          fontFamily="system-ui">
                          {cp.name}
                        </text>
                      )}
                      {/* I'm here badge */}
                      {isCurrent && completedKm > 0 && (
                        <>
                          <rect x={mapW/2 + 10} y={y - 10} width={48} height={20} rx="10" fill="#4F6EF7" />
                          <text x={mapW/2 + 34} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontFamily="system-ui" fontWeight="bold">I'm here</text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Bottom tagline */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace", letterSpacing: 2 }}>#RunYourWorld</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "system-ui" }}>moverunbd.vercel.app</span>
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{ width: "100%", maxWidth: 430, padding: "24px 20px 0" }}>

        {/* Upload photo */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
        <button onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "14px", borderRadius: 16, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          {bgImage ? "Change Background Photo" : "Add Your Photo"}
        </button>

        {/* Share button */}
        <button onClick={handleShare} disabled={sharing} style={{ width: "100%", padding: "16px", borderRadius: 16, background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", border: "none", cursor: sharing ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 900, color: "white", boxShadow: "0 8px 24px rgba(79,110,247,0.35)", opacity: sharing ? 0.7 : 1 }}>
          {sharing ? "Preparing..." : "Share This Card →"}
        </button>

        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, textAlign: "center", marginTop: 12, fontFamily: "system-ui" }}>
          Downloads as image · Share anywhere
        </p>
      </div>
    </main>
  );
}