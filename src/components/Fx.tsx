"use client";
import { useEffect } from "react";

/** Lightweight ambient background: pure CSS (grid, soft orbs, a few data-flow lines). */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <span className="orb a" /><span className="orb b" /><span className="orb c" />
      <span className="flow f1" /><span className="flow f2" /><span className="flow f3" />
    </div>
  );
}

/** One global listener adds a ripple to any button / .ripple element on press. */
export function RippleListener() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const on = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button:not([data-no-ripple]):not(:disabled), .ripple");
      if (!el) return;
      const r = el.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement("span");
      dot.className = "ripple-dot";
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    };
    document.addEventListener("pointerdown", on, { passive: true });
    return () => document.removeEventListener("pointerdown", on);
  }, []);
  return null;
}

/** Animated loading indicator (orbiting rings). */
export function Loader({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-10 ${className}`} role="status" aria-live="polite">
      <div className="loader"><i /><i /><i /></div>
      <span className="text-xs tracking-widest text-muted uppercase">{label}…</span>
    </div>
  );
}
