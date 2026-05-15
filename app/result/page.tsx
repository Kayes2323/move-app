"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";
import html2canvas from "html2canvas";

interface UserData {
  name: string;
  totalKm: number;
  completedKm: number;
  currentRoute: string;
}

const ROUTES: Record<string, number> = {
  Chandpur: 105,
  "Cox's Bazar": 414,
  Sylhet: 244,
  Rajshahi: 253,
  Khulna: 332,
  Chittagong: 264,
};

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const km = params.get("km") || "0.00";
  const time = params.get("time") || "00:00";
  const pace = params.get("pace") || "0.00";
  const [user, setUser] = useState<UserData | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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
      } catch (err) {
        console.error(err);
      }
    };
    loadUser();
  }, []);

  const currentRoute = user?.currentRoute || "Chandpur";
  const routeTotal = ROUTES[currentRoute] || 105;
  const completedKm = user?.completedKm || 0;
  const percent = Math.min((completedKm / routeTotal) * 100, 100);
  const toGo = Math.max(routeTotal - completedKm, 0);

  const handleShare = async () => {
    if (!cardRef.current) return;
    
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const file = new File([blob], "move-card.png", { type: "image/png" });
        
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "MOVE Run",
            text: `I just ran ${km} km in ${time}! 🏃`,
            files: [file],
          });
        } else {
          // Fallback: copy to clipboard or download
          const url = canvas.toDataURL("image/png");
          const link = document.createElement("a");
          link.href = url;
          link.download = "move-card.png";
          link.click();
        }
      }, "image/png");
    } catch (err) {
      console.error("Share failed:", err);
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 40%)",
      fontFamily: "'Archivo Black', sans-serif",
      padding: "0 20px 40px"
    }}>

      {/* CLOSE */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "56px", marginBottom: "40px" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#6B7280" }}>✕</button>
      </div>

      {/* BADGE */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#DCFCE7", border: "1px solid #86EFAC", borderRadius: "20px", padding: "6px 14px" }}>
          <span style={{ fontSize: "14px" }}>✅</span>
          <span style={{ color: "#16A34A", fontSize: "11px", letterSpacing: "2px", fontWeight: 700 }}>RUN COMPLETE</span>
        </div>
      </div>

      {/* HEADLINE */}
      <h1 style={{ color: "#0F0F0F", fontSize: "36px", fontWeight: 900, lineHeight: 1.1, marginBottom: "8px" }}>
        You moved the needle.
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", fontFamily: "system-ui", marginBottom: "32px" }}>
        +{km} km closer to {currentRoute}.
      </p>

      {/* RESULT CARD */}
      <div ref={cardRef} style={{ background: "linear-gradient(135deg, #4F6EF7 0%, #6D28D9 60%, #7C3AED 100%)", borderRadius: "20px", padding: "24px", marginBottom: "32px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

        {/* Card top */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ color: "white", fontSize: "13px", fontWeight: 900, letterSpacing: "2px" }}>MOVE</span>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "12px", fontFamily: "system-ui" }}>
            {new Date().toLocaleDateString("en-US")}
          </span>
        </div>

        {/* Route */}
        <h2 style={{ color: "white", fontSize: "26px", fontWeight: 900, marginBottom: "20px" }}>
          Dhaka → {currentRoute}
        </h2>

        {/* Stats */}
        <div style={{ display: "flex", gap: "0", marginBottom: "20px" }}>
          {[
            { label: "KM TODAY", value: km },
            { label: "DURATION", value: time },
            { label: "PACE", value: pace },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.15)" : "none", paddingLeft: i > 0 ? "16px" : "0" }}>
              <p style={{ color: "white", fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>{s.value}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
          <div style={{ width: `${percent}%`, height: "100%", background: "white", borderRadius: "4px", minWidth: percent > 0 ? "8px" : "0" }} />
        </div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>
          {percent.toFixed(1)}% of journey · {toGo.toFixed(1)} km to go
        </p>
      </div>

      {/* MOTIVATIONAL MESSAGE */}
      {percent >= 100 ? (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "16px", padding: "16px", marginBottom: "24px", textAlign: "center" }}>
          <p style={{ color: "#92400E", fontSize: "16px", fontWeight: 900 }}>🏆 Journey Complete!</p>
          <p style={{ color: "#B45309", fontSize: "13px", fontFamily: "system-ui", marginTop: "4px" }}>You conquered {currentRoute}! Pick your next route.</p>
        </div>
      ) : (
        <div style={{ background: "#EEF2FF", borderRadius: "16px", padding: "14px 16px", marginBottom: "24px" }}>
          <p style={{ color: "#4F6EF7", fontSize: "13px", fontFamily: "system-ui" }}>
            🗺️ <strong>{toGo.toFixed(1)} km</strong> left to reach {currentRoute}. Keep going!
          </p>
        </div>
      )}

      {/* BUTTONS */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button onClick={handleShare} style={{ flex: 1, padding: "16px", borderRadius: "16px", background: "#0F0F0F", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span style={{ color: "white", fontSize: "14px", fontWeight: 700 }}>Share</span>
        </button>

        <button onClick={() => router.push("/")} style={{ flex: 1, padding: "16px", borderRadius: "16px", background: "#F3F4F6", border: "none", cursor: "pointer" }}>
          <span style={{ color: "#0F0F0F", fontSize: "14px", fontWeight: 700 }}>Done</span>
        </button>
      </div>

    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense>
      <ResultContent />
    </Suspense>
  );
}