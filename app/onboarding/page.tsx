"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Onboarding() {
  const router = useRouter();
  const [weight, setWeight] = useState("65");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isUpdate, setIsUpdate] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const user = auth.currentUser;
        if (user) {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists() && snap.data().onboarded) {
            setIsUpdate(true);
            if (snap.data().weight) {
              setWeight(String(snap.data().weight));
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkUser();
  }, []);

  const handleSubmit = async () => {
    const w = parseFloat(weight);
    if (!w || w < 30 || w > 200) {
      setError("Please enter a valid weight (30-200 kg)");
      return;
    }
    setLoading(true);
    try {
      const { auth, db } = await import("../firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(db, "users", user.uid), {
          weight: w,
          onboarded: true,
        });
      }
      router.push("/");
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif", display: "flex", flexDirection: "column", padding: "0 24px" }}>

      {/* TOP */}
      <div style={{ paddingTop: "56px", marginBottom: "32px" }}>

        {/* Back button — only for update */}
        {isUpdate && (
          <button onClick={() => router.push("/profile")}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", color: "#6B7280", fontSize: "14px", marginBottom: "24px", padding: 0 }}>
            ← Back
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 12px #22C55E" }} />
          <span style={{ color: "#0F0F0F", fontSize: "22px", fontWeight: 900, letterSpacing: "6px" }}>MOVE</span>
        </div>

        <p style={{ color: "#9CA3AF", fontSize: "11px", letterSpacing: "3px", marginBottom: "12px" }}>
          {isUpdate ? "UPDATE WEIGHT" : "STEP 1 OF 1"}
        </p>
        <h1 style={{ color: "#0F0F0F", fontSize: "32px", fontWeight: 900, lineHeight: 1.15, marginBottom: "12px" }}>
          {isUpdate ? "Update your\nweight." : "One quick\nthing."}
        </h1>
        <p style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.6, fontFamily: "system-ui" }}>
          Your weight helps us calculate accurate calories burned during your runs.
        </p>
      </div>

      {/* WEIGHT INPUT */}
      <div style={{ flex: 1 }}>
        <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "3px", marginBottom: "12px" }}>YOUR WEIGHT</p>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <input
            type="number"
            value={weight}
            onChange={e => { setWeight(e.target.value); setError(""); }}
            placeholder="65"
            style={{
              flex: 1, fontSize: "52px", fontWeight: 900, color: "#0F0F0F",
              border: "none", borderBottom: `3px solid ${error ? "#EF4444" : weight ? "#4F6EF7" : "#E5E7EB"}`,
              outline: "none", padding: "8px 0", background: "transparent",
              fontFamily: "'Archivo Black', sans-serif",
            }}
          />
          <span style={{ color: "#9CA3AF", fontSize: "24px", fontWeight: 900 }}>kg</span>
        </div>

        {error && <p style={{ color: "#EF4444", fontSize: "12px", fontFamily: "system-ui", marginBottom: "8px" }}>{error}</p>}

        {/* Quick select */}
        <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "2px", marginBottom: "10px", marginTop: "24px" }}>QUICK SELECT</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "32px" }}>
          {[50, 55, 60, 65, 70, 75, 80, 85, 90].map(w => (
            <button key={w} onClick={() => { setWeight(String(w)); setError(""); }}
              style={{
                padding: "10px 18px", borderRadius: "12px",
                border: weight === String(w) ? "2px solid #4F6EF7" : "1px solid #E5E7EB",
                background: weight === String(w) ? "#EEF2FF" : "#F8F9FA",
                color: weight === String(w) ? "#4F6EF7" : "#6B7280",
                fontSize: "15px", fontWeight: 700, cursor: "pointer",
              }}>
              {w}
            </button>
          ))}
        </div>

        {/* Privacy note */}
        <div style={{ background: "#F8F9FA", borderRadius: "14px", padding: "14px 16px", marginBottom: "24px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px" }}>🔒</span>
          <p style={{ color: "#6B7280", fontSize: "12px", fontFamily: "system-ui", lineHeight: 1.5 }}>
            Your weight is only used for calorie calculation and is never shared with anyone.
          </p>
        </div>

        {/* Submit button */}
        <button onClick={handleSubmit} disabled={loading || !weight}
          style={{
            width: "100%", padding: "17px", borderRadius: "16px", border: "none",
            cursor: loading || !weight ? "not-allowed" : "pointer",
            background: !weight ? "#F3F4F6" : "linear-gradient(135deg, #0F0F0F 0%, #1a1a2e 100%)",
            color: !weight ? "#9CA3AF" : "white",
            fontSize: "15px", fontWeight: 700, letterSpacing: "0.5px",
            boxShadow: !weight ? "none" : "0 8px 32px rgba(15,15,15,0.25)",
            transition: "all 0.2s ease", marginBottom: "12px"
          }}>
          {loading ? "Saving..." : isUpdate ? "Save Weight →" : "Let's Start Moving →"}
        </button>

        {/* Skip — only for new users */}
        {!isUpdate && (
          <button onClick={() => {
            setWeight("70");
            handleSubmit();
          }}
            style={{ width: "100%", padding: "14px", borderRadius: "16px", border: "1px solid #E5E7EB", background: "transparent", color: "#9CA3AF", fontSize: "14px", cursor: "pointer" }}>
            Skip for now (use 70 kg default)
          </button>
        )}
      </div>
    </main>
  );
}