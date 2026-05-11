"use client";
import { useState } from "react";
import { auth } from "../firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.href = "/";
    } catch (err) {
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080808] text-[#F5F5F0] flex flex-col items-center justify-center px-6">
      
      {/* Logo */}
      <div className="mb-12 text-center">
        <h1 className="text-[80px] leading-none font-black text-[#F5F5F0] mb-2" style={{ fontFamily: "Impact, sans-serif" }}>
          MOVE
        </h1>
        <p className="font-mono text-[10px] tracking-[4px] uppercase text-[#C6F135]">
          Run. Conquer. Repeat.
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm border border-white/10 bg-[#181818] p-8">
        <h2 className="font-black text-2xl mb-2">Get Started</h2>
        <p className="font-mono text-[11px] text-white/40 tracking-wider mb-8 uppercase">
          Join Bangladesh's first virtual run app
        </p>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-black font-black text-sm tracking-wider uppercase py-4 hover:bg-[#C6F135] transition-all duration-300 mb-4 disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>

        {error && (
          <p className="font-mono text-[10px] text-red-400 text-center mt-2">{error}</p>
        )}

        <div className="border-t border-white/10 mt-6 pt-6">
          <p className="font-mono text-[9px] text-white/20 text-center tracking-wider uppercase">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="mt-8 grid grid-cols-3 gap-4 max-w-sm w-full">
        <div className="text-center">
          <p className="text-2xl mb-1">🏃</p>
          <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Virtual Journey</p>
        </div>
        <div className="text-center">
          <p className="text-2xl mb-1">🏆</p>
          <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Leaderboard</p>
        </div>
        <div className="text-center">
          <p className="text-2xl mb-1">🌍</p>
          <p className="font-mono text-[9px] text-white/30 uppercase tracking-wider">Run The World</p>
        </div>
      </div>
    </main>
  );
}