"use client";
import { useState, useEffect, useRef } from "react";
import { ROUTES } from "../data/routes";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const signingIn = useRef(false);

  // Someone who is already signed in has no reason to see the login screen.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth } = await import("../firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user && !signingIn.current) window.location.replace("/");
        });
      } catch (err) {
        console.error(err);
      }
    })();
    return () => unsubscribe?.();
  }, []);

  const handleGoogleLogin = async () => {
  setLoading(true);
  setError("");
  signingIn.current = true;
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
  return;
} else {
  window.location.href = "/";
  return;
}
  } catch (err) {
    console.error(err);
    signingIn.current = false;
    const code = (err as { code?: string }).code;
    // Closing the popup is a choice, not an error.
    if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
      setError(
        code === "auth/popup-blocked" ? "Your browser blocked the sign-in pop-up. Allow pop-ups for this site and try again."
        : code === "auth/network-request-failed" ? "No connection. Check your internet and try again."
        : "Sign-in didn't work. Please try again."
      );
    }
    setLoading(false);
  }
};

  return (
    <main className="app nonav" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
      {/* HERO: always dark, it is the brand moment */}
      <div style={{ position: "relative", height: "52vh", minHeight: 300, overflow: "hidden", background: "#0A0A0C", color: "#F5F5F7", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 20% 70%, rgba(79,110,247,0.38) 0%, transparent 58%), radial-gradient(ellipse at 80% 20%, rgba(124,58,237,0.28) 0%, transparent 52%)" }} />
        <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden="true">
          <path d="M-10 250 C 70 240, 90 170, 160 165 S 270 190, 300 120 S 360 60, 410 40" fill="none" stroke="#33333D" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" />
          <path d="M-10 250 C 70 240, 90 170, 160 165 S 230 175, 262 150" fill="none" stroke="#6F8AFF" strokeWidth="5" strokeLinecap="round" />
          <circle cx="262" cy="150" r="7" fill="#0A0A0C" stroke="#6F8AFF" strokeWidth="4" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/move-mark.png" alt="Move" width={56} height={38} style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 36px)", left: 24, width: 56, height: "auto" }} />
        <div style={{ position: "absolute", bottom: 28, left: 24, right: 24 }}>
          <p className="lab" style={{ color: "#9A9AA6" }}>Virtual journeys · real miles</p>
          <h2 className="title-blk" style={{ marginTop: 10, fontSize: 32, lineHeight: 1.08, textTransform: "none" }}>
            Every step moves<br />
            <span style={{ background: "linear-gradient(135deg,#8EA2FF,#B79CFF)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>your world forward.</span>
          </h2>
        </div>
      </div>

      <div style={{ flex: 1, padding: "28px 24px calc(env(safe-area-inset-bottom, 0px) + 32px)" }}>
        <h1 className="h1">Conquer the world<br />through motion.</h1>
        <p className="body mute" style={{ marginTop: 10, lineHeight: "22px" }}>
          Turn every real kilometre into a virtual journey. Run your street, reach Cox&apos;s Bazar, then keep going.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", margin: "22px 0 24px", borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
          {[
            { value: String(ROUTES.length), label: "Routes" },
            { value: `${ROUTES.reduce((n, r) => n + r.totalKm, 0)}`, label: "Km of roads" },
          ].map((item, i) => (
            <div key={item.label} style={{ padding: "14px 0", paddingLeft: i ? 20 : 0, borderLeft: i ? "1px solid var(--hair)" : 0 }}>
              <p className="blk" style={{ fontSize: 26 }}>{item.value}</p>
              <p className="lab" style={{ marginTop: 4 }}>{item.label}</p>
            </div>
          ))}
        </div>

        <button className="btn btn-solid" onClick={handleGoogleLogin} disabled={loading} style={{ textTransform: "none", letterSpacing: 0, fontSize: 16 }}>
          {!loading && (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          {loading ? "Starting your journey..." : "Start Free with Google"}
        </button>
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, textAlign: "center", marginTop: 14 }}>{error}</p>}

        <p className="mute" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.6, marginTop: 18 }}>
          By continuing, you agree to our Terms &amp; Privacy Policy
        </p>
      </div>
    </main>
  );
}
