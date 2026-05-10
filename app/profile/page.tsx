"use client";
import Link from "next/link";

const levels = [
  { num: 1, name: "Run The BD", flag: "🇧🇩", unlocked: true, badge: "Son of Soil" },
  { num: 2, name: "Subcontinent", flag: "🌏", unlocked: false, badge: "Subcontinent Legend" },
  { num: 3, name: "Silk Road", flag: "⚔️", unlocked: false, badge: "Silk Road Warrior" },
  { num: 4, name: "Run The World", flag: "🌍", unlocked: false, badge: "World Runner" },
];

export default function Profile() {
  return (
    <main className="min-h-screen bg-[#080808] text-[#F5F5F0] pb-24">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 border-b border-white/10 bg-[#080808]/90 backdrop-blur-xl">
        <span className="text-[#C6F135] text-2xl font-black tracking-[8px]">MOVE</span>
        <span className="font-mono text-[10px] tracking-[3px] uppercase text-white/40">Profile</span>
      </nav>

      <div className="pt-20 px-4 max-w-md mx-auto">

        {/* PROFILE HEADER */}
        <div className="border border-white/10 bg-[#181818] p-5 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#C6F135] to-[#FF5C1A] flex items-center justify-center text-2xl font-black text-black">
              R
            </div>
            <div>
              <p className="font-black text-xl">Rahul Ahmed</p>
              <p className="font-mono text-[10px] text-white/30 mt-1">📍 Dhaka, Bangladesh</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="font-mono text-[8px] tracking-wider uppercase border border-[#C6F135]/40 text-[#C6F135] px-2 py-1">🇧🇩 Run The BD</span>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 border border-white/10">
            <div className="p-3 text-center border-r border-white/10">
              <p className="font-black text-2xl text-[#C6F135]" style={{ fontFamily: "Impact, sans-serif" }}>245</p>
              <p className="font-mono text-[8px] text-white/30 uppercase tracking-wider mt-1">Total KM</p>
            </div>
            <div className="p-3 text-center border-r border-white/10">
              <p className="font-black text-2xl text-[#FF5C1A]" style={{ fontFamily: "Impact, sans-serif" }}>🔥18</p>
              <p className="font-mono text-[8px] text-white/30 uppercase tracking-wider mt-1">Day Streak</p>
            </div>
            <div className="p-3 text-center">
              <p className="font-black text-2xl text-white" style={{ fontFamily: "Impact, sans-serif" }}>#2</p>
              <p className="font-mono text-[8px] text-white/30 uppercase tracking-wider mt-1">Friends Rank</p>
            </div>
          </div>
        </div>

        {/* CURRENT JOURNEY MINI */}
        <div className="border border-white/10 bg-[#181818] p-5 mb-4">
          <div className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-3">Current Journey</div>
          <div className="flex justify-between items-center mb-3">
            <p className="font-black">Dhaka → Cox's Bazar</p>
            <p className="font-black text-[#C6F135]">59%</p>
          </div>
          <div className="relative h-1 bg-white/10">
            <div className="absolute left-0 top-0 bottom-0 w-[59%] bg-gradient-to-r from-[#C6F135] to-[#FF5C1A]"
              style={{ boxShadow: "0 0 10px rgba(198,241,53,0.5)" }}></div>
          </div>
          <div className="flex justify-between font-mono text-[9px] mt-2">
            <span className="text-[#C6F135]">📍 Now in Comilla</span>
            <span className="text-white/30">169 km left</span>
          </div>
        </div>

        {/* WEEKLY STATS */}
        <div className="border border-white/10 bg-[#181818] p-5 mb-4">
          <div className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-3">This Week</div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Mon", km: 3.2 },
              { label: "Tue", km: 4.5 },
              { label: "Wed", km: 0 },
              { label: "Thu", km: 5.1 },
              { label: "Fri", km: 3.8 },
              { label: "Sat", km: 4.5 },
              { label: "Sun", km: 0 },
            ].map((d, i) => (
              <div key={i} className={`flex justify-between items-center px-3 py-2 border ${d.km > 0 ? "border-[#C6F135]/20 bg-[#C6F135]/5" : "border-white/5"}`}>
                <span className="font-mono text-[10px] text-white/40 uppercase">{d.label}</span>
                <span className={`font-black text-sm ${d.km > 0 ? "text-[#C6F135]" : "text-white/20"}`}>
                  {d.km > 0 ? `${d.km}km` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* LEVELS */}
        <div className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-3">Level Progression</div>
        <div className="flex flex-col gap-2 mb-4">
          {levels.map((l, i) => (
            <div key={i} className={`border p-4 flex items-center gap-4 transition-all
              ${l.unlocked ? "border-[#C6F135]/40 bg-[#C6F135]/5" : i === 1 ? "border-white/10 bg-[#181818] opacity-60" : "border-white/5 bg-[#181818] opacity-30"}
            `}>
              <span className="text-2xl">{l.flag}</span>
              <div className="flex-1">
                <p className={`font-black text-sm ${l.unlocked ? "text-white" : "text-white/40"}`}>
                  Level {l.num} — {l.name}
                </p>
                <p className={`font-mono text-[9px] mt-1 ${l.unlocked ? "text-[#C6F135]" : "text-white/20"}`}>
                  {l.unlocked ? `✅ ${l.badge}` : `🔒 ${i === 1 ? "Complete BD to unlock" : "???"}`}
                </p>
              </div>
              {l.unlocked && (
                <div className="font-mono text-[8px] border border-[#C6F135]/40 text-[#C6F135] px-2 py-1 uppercase tracking-wider">
                  Active
                </div>
              )}
            </div>
          ))}
        </div>

        {/* SHARE BUTTON */}
        <button className="w-full bg-[#C6F135] text-black font-black text-sm tracking-wider uppercase py-4 hover:bg-white transition-all mb-2"
          style={{ clipPath: "polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))" }}>
          📸 Share My Progress Card
        </button>

        <button className="w-full border border-white/10 text-white/30 font-mono text-[10px] tracking-[2px] uppercase py-3 hover:border-white/30 hover:text-white transition-all">
          Sign Out
        </button>

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
        <Link href="/leaderboard" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
          <span className="text-xl">🏆</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Board</span>
        </Link>
        <Link href="/profile" className="flex flex-col items-center gap-1 py-4 text-[#C6F135]">
          <span className="text-xl">👤</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Profile</span>
        </Link>
      </nav>

    </main>
  );
}