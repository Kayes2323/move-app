"use client";
import Link from "next/link";

const destinations = [
  { name: "Chandpur", km: 105, emoji: "🌊" },
  { name: "Cox's Bazar", km: 414, emoji: "🏖️" },
  { name: "Sylhet", km: 244, emoji: "🍃" },
  { name: "Rajshahi", km: 253, emoji: "🌾" },
  { name: "Khulna", km: 332, emoji: "🐯" },
  { name: "Chittagong", km: 264, emoji: "⛵" },
];

const milestones = [
  { city: "Dhaka", km: 0, done: true },
  { city: "Narayanganj", km: 16, done: true },
  { city: "Comilla", km: 96, done: true },
  { city: "Chandpur", km: 105, done: false },
];

export default function Journey() {
  const totalKm = 414;
  const completedKm = 245;
  const percent = Math.round((completedKm / totalKm) * 100);

  return (
    <main className="min-h-screen bg-[#080808] text-[#F5F5F0] pb-24">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 border-b border-white/10 bg-[#080808]/90 backdrop-blur-xl">
        <span className="text-[#C6F135] text-2xl font-black tracking-[8px]">MOVE</span>
        <span className="font-mono text-[10px] tracking-[3px] uppercase text-white/40">My Journey</span>
      </nav>

      <div className="pt-20 px-4 max-w-md mx-auto">

        {/* CURRENT JOURNEY */}
        <div className="border border-white/10 bg-[#181818] p-5 mb-4">
          <div className="font-mono text-[9px] tracking-[3px] uppercase text-[#C6F135] mb-3">Current Journey</div>

          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="font-black text-xl">Dhaka → Cox's Bazar</p>
              <p className="font-mono text-[10px] text-white/30 mt-1">414 km total</p>
            </div>
            <p className="font-black text-3xl text-[#C6F135]">{percent}%</p>
          </div>

          {/* Progress Bar */}
          <div className="relative h-1 bg-white/10 mb-8">
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-[#C6F135] to-[#FF5C1A]"
              style={{ width: `${percent}%`, boxShadow: "0 0 10px rgba(198,241,53,0.5)" }}
            ></div>
            <div className="absolute top-[-22px]" style={{ left: `${percent}%`, transform: "translateX(-50%)" }}>
              <div className="bg-[#C6F135] text-black font-black text-[9px] px-2 py-1 whitespace-nowrap"
                style={{ clipPath: "polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))" }}>
                📍 Comilla
              </div>
              <div className="w-2 h-2 rounded-full bg-[#C6F135] mx-auto mt-1 shadow-[0_0_8px_#C6F135]"></div>
            </div>
          </div>

          <div className="flex justify-between font-mono text-[10px] mb-4">
            <span className="text-[#C6F135]">✅ {completedKm} km done</span>
            <span className="text-white/30">{totalKm - completedKm} km left 🏁</span>
          </div>
        </div>

        {/* MILESTONES */}
        <div className="border border-white/10 bg-[#181818] p-5 mb-4">
          <div className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-4">Milestones</div>
          <div className="flex flex-col gap-0">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${m.done ? "bg-[#C6F135] border-[#C6F135]" : "border-white/20 bg-transparent"}`}>
                    {m.done && <div className="w-1.5 h-1.5 rounded-full bg-black"></div>}
                  </div>
                  {i < milestones.length - 1 && (
                    <div className={`w-0.5 h-8 ${m.done ? "bg-[#C6F135]/40" : "bg-white/10"}`}></div>
                  )}
                </div>
                <div className="pb-6">
                  <p className={`font-black text-sm ${m.done ? "text-white" : "text-white/30"}`}>{m.city}</p>
                  <p className="font-mono text-[9px] text-white/20">{m.km} km from Dhaka</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CHOOSE DESTINATION */}
        <div className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-3">Choose Next Destination</div>
        <div className="grid grid-cols-2 gap-2">
          {destinations.map((d, i) => (
            <div key={i} className={`border p-4 cursor-pointer transition-all hover:border-[#C6F135]/50 hover:bg-[#C6F135]/5 ${i === 1 ? "border-[#C6F135]/40 bg-[#C6F135]/5" : "border-white/10 bg-[#181818]"}`}>
              <div className="text-2xl mb-2">{d.emoji}</div>
              <p className="font-black text-sm">{d.name}</p>
              <p className="font-mono text-[9px] text-white/30 mt-1">{d.km} km</p>
              {i === 1 && <p className="font-mono text-[8px] text-[#C6F135] mt-1 tracking-wider">ACTIVE ✓</p>}
            </div>
          ))}
        </div>

      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[#080808] grid grid-cols-4">
        <Link href="/" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
          <span className="text-xl">🏃</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Run</span>
        </Link>
        <Link href="/journey" className="flex flex-col items-center gap-1 py-4 text-[#C6F135]">
          <span className="text-xl">🗺️</span>
          <span className="font-mono text-[8px] tracking-widest uppercase">Journey</span>
        </Link>
        <Link href="/leaderboard" className="flex flex-col items-center gap-1 py-4 text-white/30 hover:text-white transition-colors">
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