"use client";
import { useState } from "react";

export default function Home() {
  const [started, setStarted] = useState(false);

  return (
    <main className="min-h-screen bg-[#080808] text-[#F5F5F0] flex flex-col">
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 h-16 border-b border-white/10 bg-[#080808]/90 backdrop-blur-xl">
        <span className="text-[#C6F135] text-2xl font-black tracking-[8px]">MOVE</span>
        <button className="font-mono text-xs tracking-widest uppercase bg-[#C6F135] text-black px-5 py-2 font-medium hover:bg-white transition-all">
          Sign Up
        </button>
      </nav>

      <section className="flex-1 flex flex-col justify-center items-center text-center px-6 pt-24 pb-8">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-2 h-2 rounded-full bg-[#C6F135] animate-pulse"></div>
          <span className="font-mono text-[10px] tracking-[4px] uppercase text-[#C6F135]">
            Bangladesh First Virtual Run App
          </span>
        </div>

        <h1 className="text-[100px] leading-none font-black text-[#F5F5F0] mb-2" style={{ fontFamily: "Impact, sans-serif" }}>
          MOVE
        </h1>
        <p className="text-2xl font-black text-white/50 mb-2">Run your street.</p>
        <p className="text-2xl font-black text-[#C6F135] mb-8">Conquer the world.</p>

        <p className="text-base text-white/50 max-w-sm mb-10 leading-relaxed font-light">
          Every KM you run moves you closer on the map. Start in Dhaka. Reach Cox's Bazar. Then the world.
        </p>

        <button
          onClick={() => setStarted(true)}
          className="bg-[#C6F135] text-black font-black text-lg tracking-wider uppercase px-10 py-5 hover:bg-white transition-all duration-300"
        >
          {started ? "Tracking..." : "Start Moving"}
        </button>

        <div className="flex gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-[#C6F135] animate-bounce"></div>
          <div className="w-2 h-2 rounded-full bg-[#FF5C1A] animate-bounce" style={{ animationDelay: "150ms" }}></div>
          <div className="w-2 h-2 rounded-full bg-[#C6F135] animate-bounce" style={{ animationDelay: "300ms" }}></div>
        </div>
      </section>

      <section className="px-6 pb-6">
        <div className="border border-white/10 bg-[#181818] p-5 max-w-md mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="font-mono text-[9px] tracking-[3px] uppercase text-white/30 mb-1">Current Journey</p>
              <p className="font-black text-lg">Dhaka to Cox's Bazar</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] tracking-[2px] uppercase text-white/30 mb-1">Progress</p>
              <p className="font-black text-[#C6F135] text-xl">59%</p>
            </div>
          </div>

          <div className="relative h-1 bg-white/10 mb-8">
            <div className="absolute left-0 top-0 bottom-0 w-[59%] bg-gradient-to-r from-[#C6F135] to-[#FF5C1A]"></div>
            <div className="absolute top-[-24px]" style={{ left: "59%", transform: "translateX(-50%)" }}>
              <div className="bg-[#C6F135] text-black font-black text-[9px] px-2 py-1 whitespace-nowrap">
                Comilla
              </div>
              <div className="w-2 h-2 rounded-full bg-[#C6F135] mx-auto mt-1"></div>
            </div>
          </div>

          <div className="flex justify-between font-mono text-[10px] mb-4">
            <span className="text-[#C6F135]">245 km completed</span>
            <span className="text-white/30">169 km remaining</span>
          </div>

          <div className="grid grid-cols-3 border border-white/10">
            <div className="p-3 border-r border-white/10 text-center">
              <p className="font-black text-2xl text-white" style={{ fontFamily: "Impact, sans-serif" }}>4.5km</p>
              <p className="font-mono text-[9px] uppercase text-white/30 mt-1">Today</p>
            </div>
            <div className="p-3 border-r border-white/10 text-center">
              <p className="font-black text-2xl text-white" style={{ fontFamily: "Impact, sans-serif" }}>245km</p>
              <p className="font-mono text-[9px] uppercase text-white/30 mt-1">Total</p>
            </div>
            <div className="p-3 text-center">
              <p className="font-black text-2xl text-[#FF5C1A]" style={{ fontFamily: "Impact, sans-serif" }}>18</p>
              <p className="font-mono text-[9px] uppercase text-white/30 mt-1">Streak</p>
            </div>
          </div>
        </div>
      </section>

      <nav className="sticky bottom-0 border-t border-white/10 bg-[#080808] grid grid-cols-4">
        <a href="/" className="flex flex-col items-center gap-1 py-4 text-[#C6F135]">
          <span className="text-xl">🏃</span>
          <span className="font-mono text-[8px] uppercase">Run</span>
        </a>
        <a href="/journey" className="flex flex-col items-center gap-1 py-4 text-white/30">
          <span className="text-xl">🗺️</span>
          <span className="font-mono text-[8px] uppercase">Journey</span>
        </a>
        <a href="/leaderboard" className="flex flex-col items-center gap-1 py-4 text-white/30">
          <span className="text-xl">🏆</span>
          <span className="font-mono text-[8px] uppercase">Board</span>
        </a>
        <a href="/profile" className="flex flex-col items-center gap-1 py-4 text-white/30">
          <span className="text-xl">👤</span>
          <span className="font-mono text-[8px] uppercase">Profile</span>
        </a>
      </nav>
    </main>
  );
}