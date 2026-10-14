import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Waveform from "./Waveform";
import Confetti, { ConfettiHandle } from "./Confetti";
import { AnnotationExport, WordSegment, sha256Hex, tokenize, validate } from "./schema";

const DEMO_LYRICS = "Replace this text with lyrics you have permission to use";
const XP_PER_LEVEL = 200;
const XP_TIMED = 10;
const XP_REVIEWED = 25;
const XP_CLEAN = 100;

const BADGES: Record<string, { name: string; hint: string }> = {
  first: { name: "First Word", hint: "Time your first word" },
  ten: { name: "Ten Down", hint: "Review 10 words" },
  tapper: { name: "In the Groove", hint: "Tap along to time 5 words" },
  clean: { name: "Clean Sweep", hint: "Review every word with zero check warnings" },
};

interface Profile { xp: number; badges: string[] }
function loadProfile(): Profile {
  try {
    const r = localStorage.getItem("lyricalign.profile");
    if (r) { const p = JSON.parse(r); return { xp: Number(p.xp) || 0, badges: Array.isArray(p.badges) ? p.badges : [] }; }
  } catch {}
  return { xp: 0, badges: [] };
}

interface Toast { id: number; text: string; kind: "xp" | "badge" | "level" }

function computePeaks(buf: AudioBuffer, bins = 2000): Float32Array {
  const ch = buf.getChannelData(0);
  const block = Math.max(1, Math.floor(ch.length / bins));
  const out = new Float32Array(bins);
  let max = 0;
  for (let i = 0; i < bins; i++) {
    let m = 0;
    const s = i * block, e = Math.min(ch.length, s + block);
    for (let j = s; j < e; j++) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    out[i] = m; if (m > max) max = m;
  }
  if (max > 0) for (let i = 0; i < bins; i++) out[i] /= max;
  return out;
}

const fmt = (t: number | null) => (t === null ? "" : t.toFixed(3));

export default function App() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const confetti = useRef<ConfettiHandle>(null);
  const awarded = useRef<Set<string>>(new Set());
  const tapCount = useRef(0);
  const toastId = useRef(0);

  const [fileName, setFileName] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [current, setCurrent] = useState(0);
  const [lyrics, setLyrics] = useState(DEMO_LYRICS);
  const [language, setLanguage] = useState("am");
  const [segments, setSegments] = useState<WordSegment[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [tapMode, setTapMode] = useState(false);
  const [heard, setHeard] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const level = Math.floor(profile.xp / XP_PER_LEVEL) + 1;
  const xpInLevel = profile.xp % XP_PER_LEVEL;

  useEffect(() => {
    try { localStorage.setItem("lyricalign.profile", JSON.stringify(profile)); } catch {}
  }, [profile]);

  const toast = useCallback((text: string, kind: Toast["kind"]) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const burstAtEl = useCallback((el: Element | null, count = 36) => {
    const r = el?.getBoundingClientRect();
    confetti.current?.burst(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : 200, count);
  }, []);

  const giveXp = useCallback((key: string, amount: number, label: string) => {
    if (awarded.current.has(key)) return false;
    awarded.current.add(key);
    setProfile((p) => {
      const before = Math.floor(p.xp / XP_PER_LEVEL) + 1;
      const xp = p.xp + amount;
      const after = Math.floor(xp / XP_PER_LEVEL) + 1;
      if (after > before) setTimeout(() => { toast(`Level ${after}`, "level"); confetti.current?.burst(window.innerWidth / 2, 120, 90); }, 0);
      return { ...p, xp };
    });
    toast(`+${amount} XP ${label}`, "xp");
    return true;
  }, [toast]);

  const giveBadge = useCallback((id: string) => {
    setProfile((p) => {
      if (p.badges.includes(id)) return p;
      setTimeout(() => { toast(`Badge: ${BADGES[id].name}`, "badge"); confetti.current?.burst(window.innerWidth / 2, 160, 70); }, 0);
      return { ...p, badges: [...p.badges, id] };
    });
  }, [toast]);

  const applyTokens = useCallback(() => {
    const toks = tokenize(lyrics);
    awarded.current = new Set();
    tapCount.current = 0;
    setHeard(new Set());
    setSegments(toks.map((text, index) => ({ index, text, start: null, end: null, status: "untimed", note: "" })));
    setSel(toks.length ? 0 : null);
  }, [lyrics]);

  useEffect(() => {
    let raf = 0;
    const tick = () => { if (audioRef.current) setCurrent(audioRef.current.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setFileName(f.name); setPeaks(null); setMsg("Decoding audio locally in your browser. Nothing is uploaded.");
    setUrl(URL.createObjectURL(f));
    const buf = await f.arrayBuffer();
    setHash(await sha256Hex(buf.slice(0)));
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      setDuration(decoded.duration); setPeaks(computePeaks(decoded)); ctx.close();
      setMsg("");
    } catch {
      setMsg("Could not decode this file for the waveform. Playback and manual timestamps still work if the browser can play it.");
    }
  }

  const update = useCallback((i: number, patch: Partial<WordSegment>) =>
    setSegments((s) =>
      s.map((x) => {
        if (x.index !== i) return x;
        const n = { ...x, ...patch };
        const both = n.start !== null && n.end !== null;
        if (("start" in patch || "end" in patch) && x.status === "reviewed" && !("status" in patch)) n.status = both ? "timed" : "untimed";
        if (both && n.status === "untimed") n.status = "timed";
        if (!both && n.status === "timed") n.status = "untimed";
        return n;
      })
    ), []);

  const seek = (t: number) => { if (audioRef.current) { audioRef.current.currentTime = Math.max(0, t); setCurrent(t); } };

  const setBoundary = (which: "start" | "end") => {
    if (sel === null) return;
    update(sel, { [which]: Math.round(current * 1000) / 1000 });
    setHeard((h) => { const n = new Set(h); n.delete(sel); return n; });
  };

  const tap = useCallback(() => {
    if (sel === null || !audioRef.current) return;
    const t = Math.round(audioRef.current.currentTime * 1000) / 1000;
    update(sel, { start: t });
    if (sel > 0 && segments[sel - 1].end === null && segments[sel - 1].start !== null && t > (segments[sel - 1].start as number))
      update(sel - 1, { end: t });
    tapCount.current += 1;
    if (tapCount.current >= 5) giveBadge("tapper");
    setHeard((h) => { const n = new Set(h); n.delete(sel); return n; });
    if (sel < segments.length - 1) setSel(sel + 1);
  }, [sel, segments, update, giveBadge]);

  const endHere = useCallback(() => {
    if (sel === null && segments.length === 0) return;
    const open = [...segments].reverse().find((s) => s.start !== null && s.end === null);
    const target = open ? open.index : sel;
    if (target === null || !audioRef.current) return;
    const t = Math.round(audioRef.current.currentTime * 1000) / 1000;
    if (segments[target].start !== null && t <= (segments[target].start as number)) return;
    update(target, { end: t });
  }, [sel, segments, update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (tapMode && e.code === "Space") { e.preventDefault(); tap(); }
      else if (tapMode && e.key.toLowerCase() === "e") { e.preventDefault(); endHere(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tapMode, tap, endHere]);

  const playRegion = (idx = sel) => {
    if (idx === null || !audioRef.current) return;
    const s = segments[idx];
    if (s.start === null) return;
    seek(s.start); audioRef.current.play();
    if (s.end !== null) {
      const stopAt = s.end;
      const h = () => { if (audioRef.current && audioRef.current.currentTime >= stopAt) { audioRef.current.pause(); audioRef.current.removeEventListener("timeupdate", h); } };
      audioRef.current.addEventListener("timeupdate", h);
      setHeard((p) => new Set(p).add(idx));
    }
  };

  const issues = useMemo(() => validate(segments, duration), [segments, duration]);
  const timed = segments.filter((s) => s.start !== null && s.end !== null).length;
  const reviewed = segments.filter((s) => s.status === "reviewed").length;
  const progress = segments.length ? reviewed / segments.length : 0;
  const run = (() => { let n = 0; for (const s of segments) { if (s.status === "reviewed") n++; else break; } return n; })();
  const live = segments.findIndex((s) => s.start !== null && s.end !== null && current >= s.start && current < s.end);

  useEffect(() => {
    segments.forEach((s) => {
      if (s.start !== null && s.end !== null && s.end > s.start) {
        if (giveXp(`t${s.index}`, XP_TIMED, "word timed")) giveBadge("first");
      }
      if (s.status === "reviewed") {
        if (giveXp(`r${s.index}`, XP_REVIEWED, "word checked")) {
          const el = document.querySelector(`[data-w="${s.index}"]`);
          burstAtEl(el, 28);
        }
      }
    });
    if (reviewed >= 10) giveBadge("ten");
    if (segments.length > 0 && reviewed === segments.length && issues.length === 0) {
      if (giveXp("clean", XP_CLEAN, "clean sweep")) { giveBadge("clean"); confetti.current?.burst(window.innerWidth / 2, 220, 140); }
    }
  }, [segments, reviewed, issues.length, giveXp, giveBadge, burstAtEl]);

  function markReviewed() {
    if (sel === null) return;
    const s = segments[sel];
    if (s.start === null || s.end === null || s.end <= s.start) { toast("Set a valid start and end first", "xp"); return; }
    if (!heard.has(sel)) { toast("Play the word first to check it", "xp"); return; }
    update(sel, { status: "reviewed" });
    if (sel < segments.length - 1) setSel(sel + 1);
  }

  function exportJson() {
    const out: AnnotationExport = {
      schema_version: "0.1", is_sample: false,
      generated_by: "ethio-lyric-align prototype (proof of concept)",
      created_at: new Date().toISOString(),
      audio: { file_name: fileName, duration_s: duration, sha256: hash },
      language, tokenization: "whitespace", segments,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = (fileName.replace(/\.[^.]+$/, "") || "annotation") + ".alignment.json";
    a.click(); URL.revokeObjectURL(a.href);
  }

  const wfSegs = segments.map((s) => ({ start: s.start, end: s.end, selected: s.index === sel }));
  const R = 26, C = 2 * Math.PI * R;

  return (
    <main>
      <Confetti ref={confetti} />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>

      <header className="hero">
        <div className="brand"><span className="dot" />Lyric<span className="accent">Align</span><span className="badge">proof of concept</span></div>
        <h1>Time every word.<br /><span className="accent">Keep every file private.</span></h1>
        <p className="lead">
          Word-level lyric timing for Amharic and other Ethiopian songs. Everything runs in your browser: audio and lyrics are never uploaded.
          There are no accounts, database, reviewer queue, payments or cloud saving, so export the JSON to keep your work.
          Only load recordings and lyrics you are permitted to use.
        </p>
      </header>

      <div className="stats" role="group" aria-label="Your progress">
        <div className="ring">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r={R} className="ring-bg" />
            <circle cx="32" cy="32" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 32 32)" />
          </svg>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="level">
          <div className="lvl">Level {level}</div>
          <div className="xpbar"><div className="xpfill" style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} /></div>
          <div className="xptxt">{xpInLevel} / {XP_PER_LEVEL} XP</div>
        </div>
        <div className={`runbox ${run >= 3 ? "hot" : ""}`}><strong>{run}</strong><span>checked in a row</span></div>
        <div className="badges">
          {Object.entries(BADGES).map(([id, b]) => (
            <span key={id} className={`bdg ${profile.badges.includes(id) ? "on" : ""}`} title={`${b.name}: ${b.hint}`}>{b.name}</span>
          ))}
        </div>
      </div>
      <p className="fine">XP, levels, and badges are a local game layer stored only in this browser. They reward careful steps (timing a word, replaying it before you mark it checked), not speed, and they are not payments or accuracy scores.</p>

      <section>
        <h2><span className="step">1</span>Audio</h2>
        <label className="file">Choose audio file <input type="file" accept="audio/*" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        {msg && <p className="note">{msg}</p>}
        {url && <audio ref={audioRef} src={url} controls onLoadedMetadata={(e) => { const d = e.currentTarget.duration; setDuration((p) => p ?? d); }} />}
        <Waveform peaks={peaks} duration={duration ?? 0} current={current} segments={wfSegs} onSeek={seek} />
        <div className="row">
          <span className="mono">Playhead {current.toFixed(3)} s</span>
          <button onClick={() => seek(current - 2)}>-2 s</button>
          <button onClick={() => seek(current + 2)}>+2 s</button>
          <label>Speed <select onChange={(e) => audioRef.current && (audioRef.current.playbackRate = Number(e.target.value))} defaultValue="1">
            <option>0.5</option><option>0.75</option><option>1</option></select></label>
        </div>
      </section>

      <section>
        <h2><span className="step">2</span>Lyrics</h2>
        <label className="langrow">Language tag (BCP-47)
          <input className="lang" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="BCP-47 language tag" />
        </label>
        <textarea rows={4} value={lyrics} onChange={(e) => setLyrics(e.target.value)} lang={language} />
        <button className="primary" onClick={applyTokens}>Split into words (replaces current annotation)</button>
      </section>

      <section>
        <h2><span className="step">3</span>Words <em>({timed}/{segments.length} timed, {reviewed} checked)</em></h2>

        <div className={`tapzone ${tapMode ? "on" : ""}`}>
          <label className="switch">
            <input type="checkbox" checked={tapMode} onChange={(e) => setTapMode(e.target.checked)} />
            <span className="track"><span className="knob" /></span>
            Tap-along mode
          </label>
          {tapMode ? (
            <>
              <button className="tapbtn" onClick={tap} disabled={sel === null || !url}>TAP<small>when the word starts (Space)</small></button>
              <button onClick={endHere} disabled={!url}>End here <small>(E)</small></button>
              <p className="note">Play the song and tap each word as you hear it begin. Taps give a rough first pass: each tap sets the next word's start, and closes the previous word if it has no end. Then refine, replay, and check each word.</p>
            </>
          ) : (
            <p className="note">Turn on tap-along to time words like a rhythm game, then polish each one.</p>
          )}
        </div>

        <div className="words">
          {segments.map((s) => (
            <button key={s.index + s.status} data-w={s.index}
              className={`w ${s.status} ${s.index === sel ? "sel" : ""} ${s.index === live ? "live" : ""}`}
              onClick={() => setSel(s.index)} lang={language}>
              {s.text}
            </button>
          ))}
        </div>

        {sel !== null && segments[sel] && (
          <div className="editor">
            <strong lang={language}>{segments[sel].text}</strong>
            <label>Start (s) <input type="number" step="0.001" value={fmt(segments[sel].start)}
              onChange={(e) => update(sel, { start: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <label>End (s) <input type="number" step="0.001" value={fmt(segments[sel].end)}
              onChange={(e) => update(sel, { end: e.target.value === "" ? null : Number(e.target.value) })} /></label>
            <button className="accentbtn" onClick={() => setBoundary("start")}>Set start = playhead</button>
            <button className="accentbtn" onClick={() => setBoundary("end")}>Set end = playhead</button>
            <button onClick={() => playRegion()}>Play word</button>
            <button className="primary" onClick={markReviewed} title="Play the word first, then mark it checked">
              {heard.has(sel) ? "Mark checked" : "Play it, then check"}
            </button>
            <button onClick={() => update(sel, { status: "uncertain" })}>Mark uncertain</button>
            <button onClick={() => { update(sel, { start: null, end: null, status: "untimed" }); setHeard((h) => { const n = new Set(h); n.delete(sel); return n; }); }}>Clear</button>
            <input className="noteinput" placeholder="Note (e.g. melisma, backing vocal)" value={segments[sel].note}
              onChange={(e) => update(sel, { note: e.target.value })} />
            <div className="row">
              <button disabled={sel === 0} onClick={() => setSel(sel - 1)}>Previous word</button>
              <button disabled={sel >= segments.length - 1} onClick={() => setSel(sel + 1)}>Next word</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2><span className="step">4</span>Checks and export</h2>
        {issues.length === 0 ? <p className="note">No structural problems found. This does not prove the boundaries match the audio.</p>
          : <ul className="issues">{issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
        <button className="primary" onClick={exportJson} disabled={!segments.length}>Export JSON</button>
      </section>
    </main>
  );
}
