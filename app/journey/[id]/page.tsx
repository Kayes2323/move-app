"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserData {
  completedKm: number;
  currentRoute: string;
  name: string;
  photo: string;
}

const ROUTES: Record<string, {
  name: string;
  tagline: string;
  totalKm: number;
  image: string;
  checkpoints: { name: string; km: number; desc: string }[];
}> = {
  chandpur: {
    name: "Chandpur",
    tagline: "Home of the Hilsha",
    totalKm: 105,
    image: "/images/chandpur.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Narayanganj", km: 25, desc: "River gateway" },
      { name: "Munshiganj", km: 60, desc: "Ancient riverside town" },
      { name: "Chandpur", km: 105, desc: "Home of the Hilsha" },
    ],
  },
  coxsbazar: {
    name: "Cox's Bazar",
    tagline: "World's longest natural sea beach",
    totalKm: 399,
    image: "/images/coxsbazar.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Narayanganj", km: 25, desc: "River gateway" },
      { name: "Comilla", km: 116, desc: "City of Heritage" },
      { name: "Feni", km: 172, desc: "Gateway to Chittagong" },
      { name: "Chittagong", km: 247, desc: "Port City" },
      { name: "Cox's Bazar", km: 399, desc: "World's longest beach" },
    ],
  },
  sylhet: {
    name: "Sylhet",
    tagline: "Misty land of tea gardens",
    totalKm: 317,
    image: "/images/sylhet.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Narsingdi", km: 57, desc: "Industrial gateway" },
      { name: "Bhairab", km: 98, desc: "Meghna riverside" },
      { name: "Brahmanbaria", km: 140, desc: "Cultural heartland" },
      { name: "Habiganj", km: 230, desc: "Gateway to Sylhet" },
      { name: "Sylhet", km: 317, desc: "Tea garden paradise" },
    ],
  },
  rajshahi: {
    name: "Rajshahi",
    tagline: "Cleanest city in South Asia",
    totalKm: 262,
    image: "/images/rajshahi.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Manikganj", km: 60, desc: "River crossing" },
      { name: "Sirajganj", km: 135, desc: "Jamuna riverside" },
      { name: "Bogura", km: 195, desc: "Gateway to North" },
      { name: "Natore", km: 230, desc: "Royal city" },
      { name: "Rajshahi", km: 262, desc: "Cleanest city" },
    ],
  },
  rangpur: {
    name: "Rangpur",
    tagline: "Where Kanchenjunga meets the horizon",
    totalKm: 318,
    image: "/images/rangpur.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Tangail", km: 95, desc: "Historic weaving town" },
      { name: "Bogura", km: 195, desc: "Gateway to North" },
      { name: "Gaibandha", km: 270, desc: "Flood plains" },
      { name: "Rangpur", km: 318, desc: "Kanchenjunga on horizon" },
    ],
  },
  khulna: {
    name: "Khulna",
    tagline: "Where the Royal Bengal Tiger roams",
    totalKm: 333,
    image: "/images/khulna.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Faridpur", km: 100, desc: "Padma riverside" },
      { name: "Magura", km: 165, desc: "Southwest gateway" },
      { name: "Jashore", km: 230, desc: "Cultural hub" },
      { name: "Khulna", km: 333, desc: "Tiger territory" },
    ],
  },
  chittagong: {
    name: "Chittagong",
    tagline: "Port city of hills & sea",
    totalKm: 264,
    image: "/images/chittagong.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Comilla", km: 116, desc: "City of Heritage" },
      { name: "Feni", km: 172, desc: "Gateway to Chittagong" },
      { name: "Chittagong", km: 264, desc: "Port city of hills & sea" },
    ],
  },
  barisal: {
    name: "Barisal",
    tagline: "Countryside of canals & rivers",
    totalKm: 270,
    image: "/images/barisal.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, desc: "Journey begins" },
      { name: "Munshiganj", km: 55, desc: "River delta" },
      { name: "Madaripur", km: 130, desc: "Padma crossing" },
      { name: "Pirojpur", km: 200, desc: "Canal city" },
      { name: "Barisal", km: 270, desc: "Countryside of rivers" },
    ],
  },
};

// Bangladesh SVG map paths (simplified)
const BD_OUTLINE = "M 185 20 L 220 25 L 245 40 L 260 60 L 270 90 L 265 120 L 275 145 L 270 170 L 255 195 L 240 215 L 220 235 L 200 250 L 180 260 L 160 265 L 140 260 L 120 250 L 100 240 L 85 225 L 75 205 L 70 185 L 65 165 L 70 145 L 65 125 L 70 105 L 80 85 L 90 70 L 105 55 L 125 40 L 150 28 L 170 20 Z";

const ROUTE_PATHS: Record<string, string> = {
  coxsbazar: "M 155 55 L 160 80 L 165 110 L 170 135 L 175 160 L 185 185 L 195 210 L 205 235",
  chittagong: "M 155 55 L 160 80 L 165 110 L 170 135 L 175 160 L 185 185",
  sylhet: "M 155 55 L 175 58 L 200 65 L 220 75 L 240 85",
  rajshahi: "M 155 55 L 145 70 L 130 90 L 118 115 L 110 135 L 105 155",
  rangpur: "M 155 55 L 145 70 L 130 90 L 118 115 L 115 140 L 112 165 L 108 185",
  khulna: "M 155 55 L 148 78 L 140 100 L 128 125 L 118 148 L 112 170 L 108 195",
  chandpur: "M 155 55 L 158 75 L 162 100 L 165 125",
  barisal: "M 155 55 L 150 78 L 145 102 L 140 128 L 138 155 L 135 180",
};

const CHECKPOINT_POSITIONS: Record<string, {x: number, y: number}[]> = {
  coxsbazar: [{x:155,y:55},{x:160,y:80},{x:165,y:110},{x:170,y:135},{x:185,y:185},{x:205,y:235}],
  chittagong: [{x:155,y:55},{x:165,y:110},{x:170,y:135},{x:185,y:185}],
  sylhet: [{x:155,y:55},{x:175,y:58},{x:200,y:65},{x:220,y:75},{x:232,y:82},{x:240,y:85}],
  rajshahi: [{x:155,y:55},{x:145,y:70},{x:130,y:90},{x:118,y:115},{x:110,y:135},{x:105,y:155}],
  rangpur: [{x:155,y:55},{x:145,y:70},{x:130,y:90},{x:118,y:115},{x:112,y:165},{x:108,y:185}],
  khulna: [{x:155,y:55},{x:148,y:78},{x:140,y:100},{x:128,y:125},{x:112,y:170}],
  chandpur: [{x:155,y:55},{x:158,y:75},{x:162,y:100},{x:165,y:125}],
  barisal: [{x:155,y:55},{x:150,y:78},{x:145,y:102},{x:140,y:128},{x:135,y:180}],
};

export default function RouteDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const route = ROUTES[id];

  const [user, setUser] = useState<UserData | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { auth, db } = await import("../../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
            const snap = await getDoc(doc(db, "users", firebaseUser.uid));
            if (snap.exists()) setUser(snap.data() as UserData);
          }
        });
      } catch (err) { console.error(err); }
    };
    load();
  }, []);

  const handleSelectRoute = async () => {
    setSelecting(true);
    try {
      const { auth, db } = await import("../../firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        await updateDoc(doc(db, "users", firebaseUser.uid), {
          currentRoute: route.name,
          completedKm: 0,
        });
        router.push("/");
      }
    } catch (err) { console.error(err); }
    setSelecting(false);
  };

  if (!route) return null;

  const completedKm = user?.completedKm || 0;
  const isCurrentRoute = user?.currentRoute === route.name;
  const percent = Math.min((completedKm / route.totalKm) * 100, 100);
  const toGo = Math.max(route.totalKm - completedKm, 0);

  const currentCpIndex = route.checkpoints.reduce((acc, cp, i) =>
    completedKm >= cp.km ? i : acc, 0);
  const nextCp = route.checkpoints[currentCpIndex + 1];
  const kmToNext = nextCp ? nextCp.km - completedKm : 0;

  const positions = CHECKPOINT_POSITIONS[id] || [];
  const routePath = ROUTE_PATHS[id] || "";

  // Current position on map
  const currentPos = positions[currentCpIndex];
  const nextPos = positions[currentCpIndex + 1];
  let userX = currentPos?.x || 155;
  let userY = currentPos?.y || 55;
  if (nextPos && nextCp) {
    const segmentProgress = (completedKm - route.checkpoints[currentCpIndex].km) /
      (nextCp.km - route.checkpoints[currentCpIndex].km);
    userX = currentPos.x + (nextPos.x - currentPos.x) * segmentProgress;
    userY = currentPos.y + (nextPos.y - currentPos.y) * segmentProgress;
  }

  const motivationText = nextCp
    ? `${kmToNext.toFixed(1)} km left to conquer ${nextCp.name}`
    : "Journey complete! 🎉";

  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "90px" }}>

      {/* HERO */}
      <div style={{ position: "relative", height: "200px", overflow: "hidden" }}>
        <img src={route.image} alt={route.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.7) 100%)" }} />

        <button onClick={() => router.push("/journey")} style={{ position: "absolute", top: "52px", left: "16px", width: "38px", height: "38px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>

        <button onClick={() => setShowShare(true)} style={{ position: "absolute", top: "52px", right: "16px", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "20px", padding: "6px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span style={{ color: "white", fontSize: "12px", fontWeight: 700 }}>Share</span>
        </button>

        <div style={{ position: "absolute", bottom: "16px", left: "20px", right: "20px" }}>
          <h1 style={{ color: "white", fontSize: "24px", fontWeight: 900, marginBottom: "2px" }}>
            Dhaka → {route.name}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontFamily: "system-ui" }}>
            {route.totalKm} km · {percent.toFixed(1)}% conquered
          </p>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* PROGRESS BAR */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ color: "#4F6EF7", fontSize: "13px", fontWeight: 700 }}>{completedKm.toFixed(2)} km done</span>
            <span style={{ color: "#9CA3AF", fontSize: "13px", fontFamily: "system-ui" }}>{toGo.toFixed(1)} km to go</span>
          </div>
          <div style={{ background: "#EEF2FF", borderRadius: "6px", height: "8px" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "linear-gradient(90deg, #4F6EF7, #7C3AED)", borderRadius: "6px", minWidth: percent > 0 ? "10px" : "0", transition: "width 0.8s ease" }} />
          </div>
        </div>

        {/* MOTIVATION */}
        {isCurrentRoute && nextCp && (
          <div style={{ background: "#EEF2FF", borderRadius: "16px", padding: "14px 16px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#4F6EF7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: "18px" }}>🎯</span>
            </div>
            <div>
              <p style={{ color: "#4F6EF7", fontSize: "13px", fontWeight: 900, marginBottom: "2px" }}>
                {nextCp.name} is calling you!
              </p>
              <p style={{ color: "#6B7280", fontSize: "12px", fontFamily: "system-ui" }}>{motivationText}</p>
            </div>
          </div>
        )}

        {/* BANGLADESH MAP */}
        <div style={{ background: "#F8F9FF", borderRadius: "20px", padding: "16px", marginBottom: "20px", border: "1px solid #E0E7FF" }}>
          <p style={{ color: "#0F0F0F", fontSize: "11px", letterSpacing: "2px", fontWeight: 900, marginBottom: "12px" }}>ROUTE MAP</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <svg width="280" height="300" viewBox="0 0 320 290" style={{ overflow: "visible" }}>

              {/* BD outline */}
              <path d={BD_OUTLINE} fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1.5" />

              {/* Route path — gray (full) */}
              {routePath && (
                <path d={routePath} fill="none" stroke="#C7D2FE" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" />
              )}

              {/* Route path — blue (completed) */}
              {routePath && percent > 0 && (
                <path d={routePath} fill="none" stroke="#4F6EF7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={`${percent * 3} 300`} />
              )}

              {/* Checkpoint dots */}
              {positions.map((pos, i) => {
                const cp = route.checkpoints[i];
                if (!cp) return null;
                const isCompleted = completedKm >= cp.km;
                const isNext = i === currentCpIndex + 1;

                return (
                  <g key={i}>
                    {isNext && (
                      <circle cx={pos.x} cy={pos.y} r="12" fill="rgba(79,110,247,0.15)" />
                    )}
                    <circle cx={pos.x} cy={pos.y} r={i === 0 || i === positions.length - 1 ? "7" : "5"}
                      fill={isCompleted ? "#4F6EF7" : isNext ? "#FFFFFF" : "#E5E7EB"}
                      stroke={isCompleted ? "#4F6EF7" : isNext ? "#4F6EF7" : "#D1D5DB"}
                      strokeWidth="2" />
                    {isCompleted && i > 0 && (
                      <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle" fontSize="6" fill="white" fontWeight="bold">✓</text>
                    )}
                    {/* City label */}
                    <text x={pos.x + (pos.x > 160 ? 10 : -10)} y={pos.y + 1}
                      textAnchor={pos.x > 160 ? "start" : "end"}
                      dominantBaseline="middle"
                      fontSize="9"
                      fill={isCompleted ? "#4F6EF7" : isNext ? "#4F6EF7" : "#9CA3AF"}
                      fontWeight={isNext ? "bold" : "normal"}>
                      {cp.name}
                    </text>
                  </g>
                );
              })}

              {/* User position dot */}
              {isCurrentRoute && completedKm > 0 && (
                <g>
                  <circle cx={userX} cy={userY} r="10" fill="rgba(79,110,247,0.2)" />
                  <circle cx={userX} cy={userY} r="6" fill="#4F6EF7" stroke="white" strokeWidth="2" />
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* CHECKPOINT LIST */}
        <p style={{ color: "#0F0F0F", fontSize: "11px", letterSpacing: "2px", fontWeight: 900, marginBottom: "16px" }}>CHECKPOINTS</p>

        <div style={{ position: "relative", paddingLeft: "36px" }}>
          <div style={{ position: "absolute", left: "15px", top: "14px", bottom: "14px", width: "2px", background: "#E5E7EB" }} />
          <div style={{ position: "absolute", left: "15px", top: "14px", width: "2px", background: "#4F6EF7", height: `${Math.min(percent * 1.8, 100)}%` }} />

          {route.checkpoints.map((cp, i) => {
            const isCompleted = completedKm >= cp.km;
            const isNext = i === currentCpIndex + 1;

            return (
              <div key={i} style={{ position: "relative", display: "flex", alignItems: "flex-start", marginBottom: i < route.checkpoints.length - 1 ? "28px" : "0" }}>
                <div style={{
                  position: "absolute", left: "-36px",
                  width: "24px", height: "24px", borderRadius: "50%",
                  background: isCompleted ? "#4F6EF7" : isNext ? "#FFFFFF" : "#F3F4F6",
                  border: isNext ? "2px solid #4F6EF7" : isCompleted ? "none" : "2px solid #E5E7EB",
                  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
                  boxShadow: isNext ? "0 0 0 4px rgba(79,110,247,0.12)" : "none"
                }}>
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: isNext ? "#4F6EF7" : "#D1D5DB" }} />
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ color: isCompleted ? "#0F0F0F" : isNext ? "#4F6EF7" : "#9CA3AF", fontSize: isNext ? "16px" : "14px", fontWeight: 900 }}>
                      {cp.name} {isNext ? "🎯" : ""}
                    </p>
                    <p style={{ color: "#9CA3AF", fontSize: "11px", fontFamily: "system-ui" }}>{cp.km} km</p>
                  </div>
                  <p style={{ color: isNext ? "#6B7280" : "#B0B7C3", fontSize: "11px", fontFamily: "system-ui", marginTop: "1px" }}>
                    {isNext ? `${kmToNext.toFixed(1)} km away · ${cp.desc}` : cp.desc}
                  </p>
                  {isCompleted && cp.km > 0 && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#EEF2FF", borderRadius: "8px", padding: "2px 8px", marginTop: "4px" }}>
                      <span style={{ fontSize: "10px" }}>🏅</span>
                      <span style={{ color: "#4F6EF7", fontSize: "10px", fontWeight: 700 }}>{cp.name} Conqueror</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SHARE MODAL */}
      {showShare && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "white", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <p style={{ fontWeight: 900, fontSize: "16px" }}>Share Progress</p>
              <button onClick={() => setShowShare(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#6B7280" }}>✕</button>
            </div>

            {/* Share card preview */}
            <div id="share-card" style={{ background: "linear-gradient(135deg, #4F6EF7 0%, #7C3AED 100%)", borderRadius: "20px", padding: "24px", marginBottom: "20px" }}>
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", letterSpacing: "3px", marginBottom: "8px" }}>MOVE · BANGLADESH</p>
              <h2 style={{ color: "white", fontSize: "22px", fontWeight: 900, marginBottom: "6px" }}>
                Dhaka → {route.name}
              </h2>
              {nextCp ? (
                <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", fontFamily: "system-ui", marginBottom: "16px" }}>
                  📍 Currently near {route.checkpoints[currentCpIndex].name}
                </p>
              ) : (
                <p style={{ color: "#C6F135", fontSize: "14px", fontFamily: "system-ui", marginBottom: "16px" }}>
                  🏆 Journey Complete!
                </p>
              )}
              <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <p style={{ color: "white", fontSize: "24px", fontWeight: 900 }}>{completedKm.toFixed(2)}</p>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "1px" }}>KM DONE</p>
                </div>
                <div style={{ width: "1px", background: "rgba(255,255,255,0.2)" }} />
                <div>
                  <p style={{ color: "white", fontSize: "24px", fontWeight: 900 }}>{percent.toFixed(0)}%</p>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "1px" }}>CONQUERED</p>
                </div>
                <div style={{ width: "1px", background: "rgba(255,255,255,0.2)" }} />
                <div>
                  <p style={{ color: "white", fontSize: "24px", fontWeight: 900 }}>{toGo.toFixed(0)}</p>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "1px" }}>KM LEFT</p>
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "8px", height: "6px" }}>
                <div style={{ width: `${percent}%`, height: "100%", background: "white", borderRadius: "8px", minWidth: "6px" }} />
              </div>
            </div>

            <button
              onClick={async () => {
                const text = `🏃 আমি এখন ${route.checkpoints[currentCpIndex].name} তে আছি!\nDestination: Dhaka → ${route.name}\nMOVE app এ ${completedKm.toFixed(2)} km complete!\n\nজয়েন করো: moverunbd.vercel.app`;
                if (navigator.share) {
                  await navigator.share({ title: "MOVE - My Run", text });
                } else {
                  await navigator.clipboard.writeText(text);
                  alert("Copied to clipboard!");
                }
              }}
              style={{ width: "100%", padding: "16px", borderRadius: "16px", background: "#0F0F0F", border: "none", cursor: "pointer" }}>
              <span style={{ color: "white", fontSize: "15px", fontWeight: 700 }}>Share My Progress</span>
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM CTA */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px", background: "#FFFFFF", borderTop: "1px solid #F3F4F6" }}>
        {isCurrentRoute ? (
          <button onClick={() => router.push("/run")} style={{ width: "100%", padding: "16px", borderRadius: "16px", background: "#0F0F0F", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <div style={{ width: "0", height: "0", borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "12px solid #22C55E" }} />
            <span style={{ color: "#22C55E", fontSize: "15px", fontWeight: 900, letterSpacing: "2px" }}>CONTINUE RUNNING</span>
          </button>
        ) : (
          <button onClick={handleSelectRoute} disabled={selecting} style={{ width: "100%", padding: "16px", borderRadius: "16px", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", border: "none", cursor: "pointer" }}>
            <span style={{ color: "white", fontSize: "15px", fontWeight: 900 }}>
              {selecting ? "Setting route..." : `Start Journey → ${route.name}`}
            </span>
          </button>
        )}
      </div>
    </main>
  );
}