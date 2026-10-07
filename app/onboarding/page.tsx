"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Onboarding() {
  const router = useRouter();
  const [weight, setWeight] = useState("65");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isUpdate, setIsUpdate] = useState(false);

  const [uid, setUid] = useState<string | null>(null);

  // auth.currentUser is empty right after a page load; wait for the auth state instead of reading it once.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;
          if (!user) {
            router.replace("/login");
            return;
          }
          setUid(user.uid);
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (!cancelled && snap.exists() && snap.data().onboarded) {
              setIsUpdate(true);
              if (snap.data().weight) setWeight(String(snap.data().weight));
            }
          } catch (err) {
            console.error(err);
          }
        });
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [router]);

  const handleSubmit = async () => {
    const w = parseFloat(weight);
    if (!w || w < 30 || w > 200) {
      setError("Please enter a valid weight (30-200 kg)");
      return;
    }
    if (!uid) {
      setError("Still signing you in. Please try again in a moment.");
      return;
    }
    setLoading(true);
    try {
      const { db } = await import("../firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      await updateDoc(doc(db, "users", uid), { weight: w, onboarded: true });
      router.push(isUpdate ? "/profile" : "/");
    } catch (err) {
      console.error(err);
      setError("Couldn't save your weight. Check your connection and try again.");
      setLoading(false);
    }
  };

  return (
    <main className="app nonav stack">
      <div>
        {isUpdate && (
          <button className="icon-btn" aria-label="Back" onClick={() => router.push("/profile")} style={{ marginBottom: 20 }}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/move-mark.png" alt="Move" width={48} height={33} style={{ width: 48, height: "auto", filter: "var(--mark-filter, none)" }} />

        <p className="lab" style={{ marginTop: 28 }}>{isUpdate ? "Update weight" : "Step 1 of 1"}</p>
        <h1 className="title-blk" style={{ marginTop: 10, fontSize: 34, textTransform: "none", whiteSpace: "pre-line" }}>
          {isUpdate ? "Update your\nweight." : "One quick\nthing."}
        </h1>
        <p className="body mute" style={{ marginTop: 12, lineHeight: "22px" }}>
          Your weight helps us calculate accurate calories burned during your activities.
        </p>
      </div>

      <div style={{ flex: 1, marginTop: 32 }}>
        <label htmlFor="weight" className="lab">Your weight</label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 8 }}>
          <input
            id="weight"
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={e => { setWeight(e.target.value); setError(""); }}
            placeholder="65"
            aria-invalid={Boolean(error)}
            className="blk"
            style={{ flex: 1, minWidth: 0, fontSize: 56, color: "var(--ink)", border: 0, borderBottom: `3px solid ${error ? "var(--danger)" : weight ? "var(--accent)" : "var(--hair)"}`, outline: "none", padding: "8px 0", background: "transparent" }}
          />
          <span className="mute" style={{ fontSize: 22, fontWeight: 700 }}>kg</span>
        </div>
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p>}

        <p className="lab" style={{ marginTop: 28 }}>Quick select</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {[50, 55, 60, 65, 70, 75, 80, 85, 90].map(w => (
            <button key={w} onClick={() => { setWeight(String(w)); setError(""); }} aria-pressed={weight === String(w)}
              style={{ minWidth: 56, minHeight: 44, padding: "0 16px", borderRadius: 14, border: weight === String(w) ? "2px solid var(--accent)" : "2px solid transparent", background: "var(--surf)", color: weight === String(w) ? "var(--acc-text)" : "var(--ink)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {w}
            </button>
          ))}
        </div>

        <div className="card" style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          <p className="body mute" style={{ fontSize: 13, lineHeight: "19px" }}>Your weight is only used for calorie calculation and is never shared with anyone.</p>
        </div>

        <button className="btn btn-go" onClick={handleSubmit} disabled={loading || !weight} style={{ marginTop: 24 }}>
          {loading ? "Saving..." : isUpdate ? "Save weight" : "Let's Start Moving"}
        </button>

        {!isUpdate && (
          <button className="btn btn-ghost" style={{ marginTop: 8 }} disabled={loading}
            onClick={async () => {
    const w = 70;
    setWeight("70");
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
  }}>
            Skip for now (use 70 kg default)
          </button>
        )}
      </div>
    </main>
  );
}
