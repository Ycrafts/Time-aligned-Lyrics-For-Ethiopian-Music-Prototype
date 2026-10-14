import { useEffect, useRef } from "react";

interface Props {
  peaks: Float32Array | null;
  duration: number;
  current: number;
  segments: { start: number | null; end: number | null; selected: boolean }[];
  onSeek: (t: number) => void;
}

export default function Waveform({ peaks, duration, current, segments, onSeek }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    if (!peaks || duration <= 0) return;

    for (const s of segments) {
      if (s.start === null || s.end === null) continue;
      g.fillStyle = s.selected ? "rgba(220,120,20,0.35)" : "rgba(40,120,200,0.18)";
      g.fillRect((s.start / duration) * w, 0, Math.max(1, ((s.end - s.start) / duration) * w), h);
    }
    g.fillStyle = "#33415c";
    const n = peaks.length, mid = h / 2;
    for (let x = 0; x < w; x++) {
      const p = peaks[Math.min(n - 1, Math.floor((x / w) * n))];
      const bar = Math.max(1, p * h * 0.95);
      g.fillRect(x, mid - bar / 2, 1, bar);
    }
    g.fillStyle = "#c1121f";
    g.fillRect((current / duration) * w, 0, 2, h);
  }, [peaks, duration, current, segments]);

  return (
    <canvas
      ref={ref}
      className="waveform"
      aria-label="Audio waveform. Click to seek."
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * duration);
      }}
    />
  );
}
