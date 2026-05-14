"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface UserData {
  completedKm: number;
  currentRoute: string;
  totalKm: number;
}

const ROUTES: Record<string, {
  name: string;
  tagline: string;
  totalKm: number;
  image: string;
  checkpoints: { name: string; km: number; badge: string }[];
}> = {
  chandpur: {
    name: "Cox's Bazar",
    tagline: "Home of the Hilsha",
    totalKm: 105,
    image: "/images/chandpur.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Narayanganj", km: 25, badge: "Narayanganj Conqueror" },
      { name: "Munshiganj", km: 60, badge: "Munshiganj Conqueror" },
      { name: "Chandpur", km: 105, badge: "Chandpur Conqueror" },
    ],
  },
  coxsbazar: {
    name: "Cox's Bazar",
    tagline: "World's longest natural sea beach",
    totalKm: 399,
    image: "/images/coxsbazar.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Narayanganj", km: 25, badge: "Narayanganj Conqueror" },
      { name: "Comilla", km: 116, badge: "Comilla Conqueror" },
      { name: "Feni", km: 172, badge: "Feni Conqueror" },
      { name: "Chittagong", km: 247, badge: "Chittagong Conqueror" },
      { name: "Cox's Bazar", km: 399, badge: "Cox's Bazar Conqueror" },
    ],
  },
  sylhet: {
    name: "Sylhet",
    tagline: "Misty land of tea gardens",
    totalKm: 317,
    image: "/images/sylhet.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Narsingdi", km: 57, badge: "Narsingdi Conqueror" },
      { name: "Brahmanbaria", km: 120, badge: "Brahmanbaria Conqueror" },
      { name: "Habiganj", km: 220, badge: "Habiganj Conqueror" },
      { name: "Sylhet", km: 317, badge: "Sylhet Conqueror" },
    ],
  },
  rajshahi: {
    name: "Rajshahi",
    tagline: "Cleanest city in South Asia",
    totalKm: 262,
    image: "/images/rajshahi.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Manikganj", km: 60, badge: "Manikganj Conqueror" },
      { name: "Sirajganj", km: 140, badge: "Sirajganj Conqueror" },
      { name: "Natore", km: 210, badge: "Natore Conqueror" },
      { name: "Rajshahi", km: 262, badge: "Rajshahi Conqueror" },
    ],
  },
  rangpur: {
    name: "Rangpur",
    tagline: "Where Kanchenjunga meets the horizon",
    totalKm: 318,
    image: "/images/rangpur.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Tangail", km: 95, badge: "Tangail Conqueror" },
      { name: "Bogura", km: 195, badge: "Bogura Conqueror" },
      { name: "Gaibandha", km: 270, badge: "Gaibandha Conqueror" },
      { name: "Rangpur", km: 318, badge: "Rangpur Conqueror" },
    ],
  },
  khulna: {
    name: "Khulna",
    tagline: "Where the Royal Bengal Tiger roams",
    totalKm: 333,
    image: "/images/khulna.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Faridpur", km: 100, badge: "Faridpur Conqueror" },
      { name: "Jessore", km: 210, badge: "Jessore Conqueror" },
      { name: "Khulna", km: 333, badge: "Khulna Conqueror" },
    ],
  },
  chittagong: {
    name: "Chittagong",
    tagline: "Port city of hills & sea",
    totalKm: 264,
    image: "/images/chittagong.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Comilla", km: 116, badge: "Comilla Conqueror" },
      { name: "Feni", km: 172, badge: "Feni Conqueror" },
      { name: "Chittagong", km: 264, badge: "Chittagong Conqueror" },
    ],
  },
  barisal: {
    name: "Barisal",
    tagline: "Countryside of canals & rivers",
    totalKm: 270,
    image: "/images/barisal.jpg",
    checkpoints: [
      { name: "Dhaka", km: 0, badge: "Starting Point" },
      { name: "Munshiganj", km: 55, badge: "Munshiganj Conqueror" },
      { name: "Madaripur", km: 130, badge: "Madaripur Conqueror" },
      { name: "Pirojpur", km: 200, badge: "Pirojpur Conqueror" },
      { name: "Barisal", km: 270, badge: "Barisal Conqueror" },
    ],
  },
};

export default function RouteDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const route = ROUTES[id];

  const [user, setUser] = useState<UserData | null>(null);
  const [selecting, setSelecting] = useState(false);

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
      } catch (err) {
        console.error(err);
      }
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
    } catch (err) {
      console.error(err);
    }
    setSelecting(false);
  };

  if (!route) return null;

  const completedKm = user?.completedKm || 0;
  const isCurrentRoute = user?.currentRoute === route.name;
  const percent = Math.min((completedKm / route.totalKm) * 100, 100);
  const toGo = Math.max(route.totalKm - completedKm, 0);

  // Find current checkpoint
  const currentCheckpointIndex = route.checkpoints.reduce((acc, cp, i) => {
    return completedKm >= cp.km ? i : acc;
  }, 0);

  const nextCheckpoint = route.checkpoints[currentCheckpointIndex + 1];
  const kmToNext = nextCheckpoint ? nextCheckpoint.km - completedKm : 0;

  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "100px" }}>

      {/* HERO IMAGE */}
      <div style={{ position: "relative", height: "240px", overflow: "hidden" }}>
        <img src={route.image} alt={route.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(0,0,0,0.7) 100%)" }} />

        {/* Back */}
        <button onClick={() => router.push("/journey")} style={{ position: "absolute", top: "52px", left: "16px", width: "40px", height: "40px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>

        {/* Route name on image */}
        <div style={{ position: "absolute", bottom: "20px", left: "20px", right: "20px" }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontFamily: "system-ui", marginBottom: "4px" }}>{route.tagline}</p>
          <h1 style={{ color: "white", fontSize: "28px", fontWeight: 900, lineHeight: 1, marginBottom: "4px" }}>
            Dhaka → {route.name}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontFamily: "system-ui" }}>{route.totalKm} km total</p>
        </div>
      </div>

      <div style={{ padding: "20px 20px 0" }}>

        {/* PROGRESS CARD */}
        {isCurrentRoute && (
          <div style={{ background: "linear-gradient(135deg, #4F6EF7 0%, #7C3AED 100%)", borderRadius: "20px", padding: "20px", marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "2px", fontFamily: "system-ui", marginBottom: "4px" }}>YOUR PROGRESS</p>
                <p style={{ color: "white", fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>
                  {completedKm.toFixed(2)} <span style={{ fontSize: "14px", fontWeight: 400 }}>km</span>
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "10px", letterSpacing: "2px", fontFamily: "system-ui", marginBottom: "4px" }}>TO GO</p>
                <p style={{ color: "white", fontSize: "28px", fontWeight: 900, lineHeight: 1 }}>
                  {toGo.toFixed(1)} <span style={{ fontSize: "14px", fontWeight: 400 }}>km</span>
                </p>
              </div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
              <div style={{ width: `${percent}%`, height: "100%", background: "white", borderRadius: "4px", minWidth: percent > 0 ? "8px" : "0" }} />
            </div>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>{percent.toFixed(1)}% conquered</p>

            {/* Next checkpoint motivation */}
            {nextCheckpoint && (
              <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.12)", borderRadius: "12px", padding: "12px 14px" }}>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: "12px", fontFamily: "system-ui" }}>
                  🏁 <strong style={{ color: "white" }}>{kmToNext.toFixed(1)} km</strong> left to reach <strong style={{ color: "#C6F135" }}>{nextCheckpoint.name}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* CHECKPOINT JOURNEY */}
        <p style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900, marginBottom: "20px" }}>JOURNEY MAP</p>

        <div style={{ position: "relative", paddingLeft: "40px" }}>

          {/* Vertical line */}
          <div style={{ position: "absolute", left: "19px", top: "20px", bottom: "20px", width: "2px", background: "#E5E7EB" }} />

          {/* Progress line */}
          <div style={{ position: "absolute", left: "19px", top: "20px", width: "2px", background: "#4F6EF7", height: `${Math.min(percent, 95)}%`, transition: "height 0.8s ease" }} />

          {route.checkpoints.map((cp, i) => {
            const isCompleted = completedKm >= cp.km;
            const isCurrent = i === currentCheckpointIndex && completedKm > 0 && completedKm < route.totalKm;
            const isNext = i === currentCheckpointIndex + 1;

            return (
              <div key={i} style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: i < route.checkpoints.length - 1 ? "32px" : "0" }}>

                {/* Node */}
                <div style={{
                  position: "absolute",
                  left: "-40px",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isCompleted ? "#4F6EF7" : isNext ? "#EEF2FF" : "#F3F4F6",
                  border: isNext ? "2px solid #4F6EF7" : isCompleted ? "none" : "2px solid #E5E7EB",
                  zIndex: 2,
                  boxShadow: isNext ? "0 0 0 4px rgba(79,110,247,0.15)" : "none",
                }}>
                  {isCompleted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isNext ? "#4F6EF7" : "#D1D5DB" }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingBottom: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{
                      color: isCompleted ? "#0F0F0F" : isNext ? "#4F6EF7" : "#9CA3AF",
                      fontSize: isNext ? "17px" : "15px",
                      fontWeight: 900,
                      marginBottom: "2px"
                    }}>
                      {cp.name}
                      {isNext && " 🎯"}
                    </p>
                    <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui" }}>{cp.km} km</p>
                  </div>

                  {isNext && (
                    <p style={{ color: "#6B7280", fontSize: "12px", fontFamily: "system-ui" }}>
                      {kmToNext.toFixed(1)} km away · Keep going!
                    </p>
                  )}

                  {isCompleted && cp.km > 0 && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#EEF2FF", borderRadius: "8px", padding: "2px 8px", marginTop: "4px" }}>
                      <span style={{ fontSize: "10px" }}>🏅</span>
                      <span style={{ color: "#4F6EF7", fontSize: "10px", fontWeight: 700 }}>{cp.badge}</span>
                    </div>
                  )}

                  {!isCompleted && !isNext && cp.km > 0 && (
                    <p style={{ color: "#D1D5DB", fontSize: "11px", fontFamily: "system-ui" }}>🔒 Locked</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BOTTOM BUTTON */}
      <div style={{ position: "fixed", bottom: "0", left: "0", right: "0", padding: "16px", background: "#FFFFFF", borderTop: "1px solid #F3F4F6" }}>
        {isCurrentRoute ? (
          <button onClick={() => router.push("/run")} style={{ width: "100%", padding: "16px", borderRadius: "16px", background: "#0F0F0F", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
            <div style={{ width: "0", height: "0", borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "12px solid #22C55E" }} />
            <span style={{ color: "#22C55E", fontSize: "15px", fontWeight: 900, letterSpacing: "2px" }}>CONTINUE RUNNING</span>
          </button>
        ) : (
          <button onClick={handleSelectRoute} disabled={selecting} style={{ width: "100%", padding: "16px", borderRadius: "16px", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", border: "none", cursor: "pointer" }}>
            <span style={{ color: "white", fontSize: "15px", fontWeight: 900, letterSpacing: "1px" }}>
              {selecting ? "Setting route..." : `Start Journey → ${route.name}`}
            </span>
          </button>
        )}
      </div>
    </main>
  );
}