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

/** Things that count as "clickable" besides anything with a pointer cursor. */
const CLICKABLE = 'a[href], button, summary, select, label, [role="button"], [role="tab"], [role="menuitem"], [role="option"], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"], .press, .lift, .clickable';
const BLOCKED = ":disabled, [aria-disabled='true'], input:not([type]), input[type='text'], input[type='email'], input[type='password'], input[type='number'], input[type='search'], input[type='date'], textarea";
const MAX_DROPS = 10;

/**
 * Global water-drop ripple: concentric cyan/blue rings with a soft liquid distortion (SVG turbulence filter),
 * drawn on one fixed overlay so it is never clipped and never touches the clicked element or its handlers.
 * Works for mouse, touch and keyboard activation; skipped when the user prefers reduced motion.
 */
export function RippleListener() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = document.createElement("div");
    layer.id = "wd-layer"; layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<svg width="0" height="0" style="position:absolute"><filter id="wd-liquid" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.022" numOctaves="1" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
    document.body.appendChild(layer);
    const drops = new Set<HTMLElement>();

    const target = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null;
      if (!el || el.closest(BLOCKED)) return null;
      return el.closest<HTMLElement>(CLICKABLE) ?? (getComputedStyle(el).cursor === "pointer" ? (el as HTMLElement) : null);
    };
    const drop = (x: number, y: number) => {
      if (drops.size >= MAX_DROPS) drops.values().next().value?.remove();
      const d = document.createElement("div");
      d.className = "wd"; d.style.left = `${x}px`; d.style.top = `${y}px`;
      d.innerHTML = "<b></b><i></i><i></i><i></i>";
      layer.appendChild(d); drops.add(d);
      window.setTimeout(() => { d.remove(); drops.delete(d); }, 1100);
    };
    const onPointer = (e: PointerEvent) => { if (e.button === 0 && target(e.target)) drop(e.clientX, e.clientY); };
    // keyboard activation (Enter / Space) arrives as a click with detail 0: ripple from the element's centre
    const onClick = (e: MouseEvent) => {
      if (e.detail !== 0 || !e.isTrusted) return;
      const el = target(e.target); if (!el) return;
      const r = el.getBoundingClientRect(); drop(r.left + r.width / 2, r.top + r.height / 2);
    };
    document.addEventListener("pointerdown", onPointer, { passive: true, capture: true });
    document.addEventListener("click", onClick, { passive: true, capture: true });
    return () => { document.removeEventListener("pointerdown", onPointer, true); document.removeEventListener("click", onClick, true); layer.remove(); };
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
