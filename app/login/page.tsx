"use client";
import { useState, useEffect } from "react";

export default function Login() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.style.background = "#FFFFFF";
    document.documentElement.style.background = "#FFFFFF";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  const handleGoogleLogin = async () => {
  setLoading(true);
  try {
    const { auth, db } = await import("../firebase");
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const { doc, setDoc, getDoc, serverTimestamp } = await import("firebase/firestore");
    
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user already exists
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
  await setDoc(userRef, {
    uid: user.uid,
    name: user.displayName,
    email: user.email,
    photo: user.photoURL,
    createdAt: serverTimestamp(),
    totalKm: 0,
    streak: 0,
    currentRoute: "Chandpur",
    completedKm: 0,
    runs: [],
    weight: 0,
    onboarded: false,
  });
  window.location.href = "/onboarding";
} else {
  window.location.href = "/";
}
    window.location.href = "/";
  } catch (err) {
    console.error(err);
    setLoading(false);
  }
};

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif" }}>

      {/* HERO TOP */}
      <div style={{ position: "relative", width: "100%", height: "56vh", minHeight: "300px", flexShrink: 0, overflow: "hidden" }}>

        {/* Base dark gradient */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(155deg, #0D1117 0%, #1a2236 45%, #2d3a52 80%, #3d4e6a 100%)", zIndex: 0 }} />

        {/* Purple-blue glow */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 25% 60%, rgba(79,110,247,0.35) 0%, transparent 55%), radial-gradient(ellipse at 75% 25%, rgba(124,58,237,0.25) 0%, transparent 50%)", zIndex: 1 }} />

        {/* Horizon line */}
        <div style={{ position: "absolute", bottom: "18%", left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15) 50%, transparent)", zIndex: 2 }} />

        {/* Road lines */}
        {[-28, -14, 0, 14, 28].map((deg, i) => (
          <div key={i} style={{ position: "absolute", bottom: "10%", left: "50%", transform: `translateX(-50%) rotate(${deg}deg)`, width: "1px", height: "35%", background: "linear-gradient(to top, rgba(255,255,255,0.10), transparent)", transformOrigin: "bottom center", zIndex: 2 }} />
        ))}

        {/* 0 KM marker */}
        <div style={{ position: "absolute", bottom: "22%", left: "12%", opacity: 0.25, zIndex: 3, textAlign: "center" }}>
          <div style={{ width: "1px", height: "16px", background: "white", margin: "0 auto" }} />
          <p style={{ color: "white", fontSize: "8px", letterSpacing: "2px", marginTop: "4px", fontFamily: "monospace" }}>0 KM</p>
        </div>

        {/* ∞ marker */}
        <div style={{ position: "absolute", bottom: "22%", right: "14%", opacity: 0.25, zIndex: 3, textAlign: "center" }}>
          <div style={{ width: "1px", height: "16px", background: "white", margin: "0 auto" }} />
          <p style={{ color: "white", fontSize: "8px", letterSpacing: "2px", marginTop: "4px", fontFamily: "monospace" }}>∞</p>
        </div>

        {/* LOGO */}
        <div style={{ position: "absolute", top: "48px", left: "24px", display: "flex", alignItems: "center", gap: "10px", zIndex: 4 }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 12px #22C55E, 0 0 24px rgba(34,197,94,0.4)" }} />
          <span style={{ color: "white", fontSize: "22px", fontWeight: 900, letterSpacing: "8px" }}>MOVE</span>
        </div>

        {/* Tagline top right */}
        <div style={{ position: "absolute", top: "52px", right: "24px", textAlign: "right", zIndex: 4 }}>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", letterSpacing: "3px", lineHeight: 1.7, fontFamily: "monospace" }}>VIRTUAL JOURNEYS<br />REAL MILES</p>
        </div>

        {/* Hero text */}
        <div style={{ position: "absolute", bottom: "28%", left: "24px", right: "24px", zIndex: 4 }}>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", letterSpacing: "4px", marginBottom: "8px", fontFamily: "monospace" }}>DHAKA → COX'S BAZAR → THE WORLD</p>
          <h2 style={{ color: "white", fontSize: "28px", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.5px" }}>
            Every step moves<br />
            <span style={{ color: "#C6F135" }}>your world forward.</span>
          </h2>
        </div>

        {/* Fade to white */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "80px", background: "linear-gradient(to bottom, transparent, #FFFFFF)", zIndex: 5 }} />
      </div>

      {/* BOTTOM SHEET */}
      <div style={{ flex: 1, background: "#FFFFFF", padding: "4px 24px 36px" }}>

        <h1 style={{ color: "#0F0F0F", fontSize: "30px", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.5px", marginBottom: "10px" }}>
          Conquer the world<br />through motion.
        </h1>

        <p style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.65, fontWeight: 400, marginBottom: "24px", fontFamily: "system-ui, sans-serif" }}>
          Turn every real KM into a virtual journey.<br />
          Run your street. Reach Cox's Bazar. Then — the world.
        </p>

        {/* Social proof */}
        <div style={{ display: "flex", alignItems: "center", background: "#F8F9FA", borderRadius: "16px", padding: "14px 20px", marginBottom: "28px" }}>
          {[
            { value: "7", color: "#4F6EF7", label: "Routes" },
            { value: "5", color: "#7C3AED", label: "Worlds" },
            { value: "∞", color: "#22C55E", label: "Athletes" },
          ].map((item, i) => (
            <div key={item.label} style={{ flex: 1, display: "flex", alignItems: "center" }}>
              {i > 0 && <div style={{ width: "1px", height: "32px", background: "#E5E7EB" }} />}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ color: item.color, fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>{item.value}</span>
                <span style={{ color: "#9CA3AF", fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px", fontFamily: "system-ui" }}>{item.label}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Google Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
          onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          onTouchStart={e => (e.currentTarget.style.transform = "scale(0.97)")}
          onTouchEnd={e => (e.currentTarget.style.transform = "scale(1)")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
            padding: "17px 24px", borderRadius: "16px", border: "none", cursor: loading ? "not-allowed" : "pointer",
            background: loading ? "#374151" : "linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)",
            boxShadow: loading ? "none" : "0 8px 32px rgba(15,15,15,0.25)",
            opacity: loading ? 0.7 : 1, transition: "all 0.2s ease", marginBottom: "16px"
          }}
        >
          {!loading && (
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          <span style={{ color: loading ? "#9CA3AF" : "white", fontSize: "15px", fontWeight: 700, letterSpacing: "0.5px" }}>
            {loading ? "Starting your journey..." : "Start Free with Google"}
          </span>
        </button>

        <p style={{ color: "#D1D5DB", fontSize: "10px", textAlign: "center", lineHeight: 1.6, fontFamily: "system-ui" }}>
          By continuing, you agree to our{" "}
          <span style={{ color: "#9CA3AF", textDecoration: "underline" }}>Terms</span>
          {" & "}
          <span style={{ color: "#9CA3AF", textDecoration: "underline" }}>Privacy Policy</span>
        </p>
      </div>
    </main>
  );
}