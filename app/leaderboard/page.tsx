"use client";
import Link from "next/link";
import { useState } from "react";

const weekly = [
  { rank: 1, name: "Rakib Hassan", loc: "Mirpur, Dhaka", km: 58.3, pin: "Comilla", top: true },
  { rank: 2, name: "Siam Ahmed", loc: "Dhanmondi, Dhaka", km: 51.7, pin: "Narayanganj", top: true },
  { rank: 3, name: "Farhan Islam", loc: "Uttara, Dhaka", km: 44.2, pin: "Tongi", top: true },
  { rank: 4, name: "Nadia Rahman", loc: "Gulshan, Dhaka", km: 38.9, pin: "Dhaka", top: false },
  { rank: 5, name: "You", loc: "Your location", km: 0, pin: "Join!", top: false, you: true },
];

const monthly = [
  { rank: 1, name: "Rakib Hassan", loc: "Mirpur, Dhaka", km: 210.3, pin: "Cox's Bazar", top: true },
  { rank: 2, name: "Nadia Rahman", loc: "Gulshan, Dhaka", km: 189.5, pin: "Comilla", top: true },
  { rank: 3, name: "Siam Ahmed", loc: "Dhanmondi, Dhaka", km: 175.1, pin: "Chandpur", top: true },
  { rank: 4, name: "Farhan Islam", loc: "Uttara, Dhaka", km: 160.8, pin: "Narayanganj", top: false },
  { rank: 5, name: "You", loc: "Your location", km: 0, pin: "Join!", top: false, you: true },
];

export default function Leaderboard() {
  const [tab, setTab] = useState("weekly");
  const data = tab === "weekly" ? weekly : monthly;

  return (
    <main className="min-h-screen bg-[#080808] text-[#F5F5F0] pb-24">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 border-b border-white/10 bg-[#080808]/90 backdrop-blur-xl">
        <span className="text-[#C6F135] text-2xl font-black tracking-[8px]">MOVE</span>
        <span className="font-mono text-[10px] tracking-[3px] uppercase text-white/40">Leaderboard</span>
      </nav>

      <div className="pt-20 px-4 max-w-md mx-auto">

        {/* TABS */}
        <div className="flex mb-4">
          <button
            onClick={() => setTab("weekly")}
            className={`flex-1 py-3 font-mono text-[10px] tracking-[2px] uppercase border transition-all ${tab === "weekly" ? "bg-[#C6F135] text-black border-[#C6F135] font-medium" : "bg-transparent text-white/30 border-white/10"}`}
          >
            This Week
          </button>
          <button
            onClick={() => setTab("monthly")}
            className={`flex-1 py-3 font-mono text-[10px] tracking-[2px] uppercase border border-l-0 transition-all ${tab === "monthly" ? "bg-[#C6F135] text-black border-[#C6F135] font-medium" : "bg-transparent text-white/30 border-white/10"}`}
          >
            This Month
          </button>
        </div>

        {/* RESET INFO */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="w-1.5 h-1.5 rounded-full bg-[#FF5C1A]"></div>
          <span className="font-mono text-[9px] text-white/30 tracking-wider uppercase">
            {tab === "weekly" ? "Resets every Monday" : "Resets every 1st"}
          </span>
        </div>

        {/* LEADERBOARD TABLE */}
        <div className="border border-white/10">
          {data.map((user, i) => (
            <div
              key={i}
              className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-4 border-b border-white/10 last:border-b-0 transition-all
                ${user.you ? "bg-[#C6F135]/8 border-l-2 border-l-[#C6F135]" : ""}
                ${!user.you ? "hover:bg-white/5" : ""}
              `}
            >
              {/* Rank */}
              <div className={`font-black text-2xl text-center ${user.top ? "text-[#C6F135]" : "text-white/20"}`}
                style={{ fontFamily: "Impact, sans-serif" }}>
                {user.rank}
              </div>

              {/* User Info */}
              <div>
                <p className={`font-black text-sm ${user.you ? "text-[#C6F135]" : "text-white"}`}>
                  {user.name}
                </p>
                <p className="font-mono text-[9px] text-white/30 mt-0.5">{user.loc}</p>
                <p className={`font-mono text-[9px] mt-0.5 ${user.you ? "text-[#C6F135]" : "text-white/20"}`}>
                  📍 {user.pin}
                </p>
              </div>

              {/* KM */}
              <div className="text-right">
                <p className={`font-black text-lg ${user.you ? "text-[#C6F135]" : "text-white"}`}
                  style={{ fontFamily: "Impact, sans-serif" }}>
                  {user.km > 0 ? `${user.km}` : "—"}
                </p>
                <p className="font-mono text-[8px] text-white/20 uppercase tracking-wider">km</p>
              </div>
            </div>
          ))}
        </div>

        {/* JOIN CTA */}
        <div className="border border-[#C6F135]/20 bg-[#C6F135]/5 p-5 mt-4 text-center">
          <p className="font-black text-lg mb-1">Rakib is already ahead.</p>
          <p className="font-mono text-[10px] text-white/40 tracking-wider mb-4">Start running to claim your spot.</p>
          <Link href="/">
            <button className="bg-[#C6F135] text-black font-black text-sm tracking-wider uppercase px-8 py-3 hover:bg-white transition-all"
              style={{ clipPath: "polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))" }}>
              🏃 Start Moving
            </button>
          </Link>
        </div>

        {/* BOARDS INFO */}
        <div className="mt-4 grid grid-cols-1 gap-2">
          <div className="border border-white/10 p-4 flex gap-3 items-start">
            <span className="text-lg">👥</span>
            <div>
              <p className="font-black text-sm">Friends Board</p>
              <p className="font-mono text-[10px] text-white/30 mt-1">Only people you know. Jealousy hits harder.</p>
            </div>
          </div>
          <div className="border border-white/10 p-4 flex gap-3 items-start">
            <span className="text-lg">🌏</span>
            <div>
              <p className="font-black text-sm">Global Board</p>
              <p className="font-mono text-[10px] text-white/30 mt-1">Unlocks after 30 days of running.</p>
            </div>
          </div>
        </div>

      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#080808] grid grid-cols-4">
        <Link href="/" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
          <span className="text-xl">🏃</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Run</span>
        </Link>
        <Link href="/journey" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
          <span className="text-xl">🗺️</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Journey</span>
        </Link>
        <Link href="/leaderboard" className="flex flex-col items-center gap-1 py-4 text-[#C6F135]">
          <span className="text-xl">🏆</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Board</span>
        </Link>
        <Link href="/profile" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
          <span className="text-xl">👤</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Profile</span>
        </Link>
      </nav>

    </main>
  );
}