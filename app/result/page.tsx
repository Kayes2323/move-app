"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function ResultContent() {
  const router = useRouter();
  const params = useSearchParams();
  const km = params.get("km") || "0.00";
  const time = params.get("time") || "00:00";
  const pace = params.get("pace") || "0.00";

  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #F0FDF4 0%, #FFFFFF 40%)",
      fontFamily: "'Archivo Black', sans-serif",
      padding: "0 20px 40px"
    }}>

      {/* CLOSE */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "56px", marginBottom: "40px" }}>
        <button onClick={() => router.push("/")}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#6B7280" }}>
          ✕
        </button>
      </div>

      {/* BADGE */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          background: "#DCFCE7", border: "1px solid #86EFAC",
          borderRadius: "20px", padding: "6px 14px"
        }}>
          <span style={{ fontSize: "14px" }}>✅</span>
          <span style={{ color: "#16A34A", fontSize: "11px", letterSpacing: "2px", fontWeight: 700 }}>RUN COMPLETE</span>
        </div>
      </div>

      {/* HEADLINE */}
      <h1 style={{ color: "#0F0F0F", fontSize: "36px", fontWeight: 900, lineHeight: 1.1, marginBottom: "8px" }}>
        You moved the needle.
      </h1>
      <p style={{ color: "#6B7280", fontSize: "14px", fontFamily: "system-ui", marginBottom: "32px" }}>
        +{km} km closer to Chandpur.
      </p>

      {/* RESULT CARD */}
      <div style={{
        background: "linear-gradient(135deg, #4F6EF7 0%, #6D28D9 60%, #7C3AED 100%)",
        borderRadius: "20px", padding: "24px", marginBottom: "32px",
        position: "relative", overflow: "hidden"
      }}>
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
          Dhaka → Chandpur
        </h2>

        {/* Stats */}
        <div style={{ display: "flex", gap: "0", marginBottom: "20px" }}>
          {[
            { label: "KM TODAY", value: km },
            { label: "DURATION", value: time },
            { label: "PACE", value: pace },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.15)" : "none", paddingLeft: i > 0 ? "16px" : "0" }}>
              <p style={{ color: "white", fontSize: "24px", fontWeight: 900, lineHeight: 1 }}>{s.value}</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
          <div style={{ width: "0.1%", height: "100%", background: "white", borderRadius: "4px" }} />
        </div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>
          0% of journey · 100 km to go
        </p>
      </div>

      {/* BUTTONS */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button style={{
          flex: 1, padding: "16px", borderRadius: "16px",
          background: "#0F0F0F", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span style={{ color: "white", fontSize: "14px", fontWeight: 700 }}>Share</span>
        </button>

        <button
          onClick={() => router.push("/")}
          style={{
            flex: 1, padding: "16px", borderRadius: "16px",
            background: "#F3F4F6", border: "none", cursor: "pointer"
          }}>
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