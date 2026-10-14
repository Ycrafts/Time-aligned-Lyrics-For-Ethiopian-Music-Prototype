import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface ConfettiHandle { burst: (x: number, y: number, count?: number) => void }
interface P { x: number; y: number; vx: number; vy: number; r: number; life: number; c: string; rot: number; vr: number }
const COLORS = ["#ff7a18", "#ff9340", "#ffc08a", "#ffffff", "#c75a08"];

const Confetti = forwardRef<ConfettiHandle>((_, ref) => {
  const cv = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const raf = useRef(0);
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const loop = () => {
    const c = cv.current; if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    parts.current = parts.current.filter((p) => p.life > 0 && p.y < c.height + 20);
    for (const p of parts.current) {
      p.vy += 0.22; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.min(1, p.life / 25);
      g.fillStyle = p.c; g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); g.restore();
    }
    raf.current = parts.current.length ? requestAnimationFrame(loop) : 0;
  };

  useImperativeHandle(ref, () => ({
    burst(x, y, count = 40) {
      if (reduce) return;
      const c = cv.current; if (!c) return;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
        parts.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, r: 3 + Math.random() * 4, life: 60 + Math.random() * 40,
          c: COLORS[Math.floor(Math.random() * COLORS.length)], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    },
  }));

  useEffect(() => {
    const fit = () => { const c = cv.current; if (c) { c.width = window.innerWidth; c.height = window.innerHeight; } };
    fit(); window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); cancelAnimationFrame(raf.current); };
  }, []);

  return <canvas ref={cv} className="confetti" aria-hidden="true" />;
});
export default Confetti;
