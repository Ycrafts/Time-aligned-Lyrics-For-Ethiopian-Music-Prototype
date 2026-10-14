import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Waveform from "./Waveform";
import { AnnotationExport, WordSegment, WordStatus, sha256Hex, tokenize, validate } from "./schema";

const DEMO_LYRICS = "Replace this text with lyrics you have permission to use";

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

  const applyTokens = useCallback(() => {
    const toks = tokenize(lyrics);
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

  const update = (i: number, patch: Partial<WordSegment>) =>
    setSegments((s) =>
      s.map((x) => {
        if (x.index !== i) return x;
        const n = { ...x, ...patch };
        const both = n.start !== null && n.end !== null;
        if (both && n.status === "untimed") n.status = "timed";
        if (!both && n.status === "timed") n.status = "untimed";
        return n;
      })
    );

  const setBoundary = (which: "start" | "end") => {
    if (sel === null) return;
    update(sel, { [which]: Math.round(current * 1000) / 1000 });
  };

  const markStatus = (st: WordStatus) => sel !== null && update(sel, { status: st });
  const seek = (t: number) => { if (audioRef.current) { audioRef.current.currentTime = Math.max(0, t); setCurrent(t); } };
  const playRegion = () => {
    if (sel === null || !audioRef.current) return;
    const s = segments[sel];
    if (s.start === null) return;
    seek(s.start); audioRef.current.play();
    if (s.end !== null) {
      const stopAt = s.end;
      const h = () => { if (audioRef.current && audioRef.current.currentTime >= stopAt) { audioRef.current.pause(); audioRef.current.removeEventListener("timeupdate", h); } };
      audioRef.current.addEventListener("timeupdate", h);
    }
  };

  const issues = useMemo(() => validate(segments, duration), [segments, duration]);
  const timed = segments.filter((s) => s.start !== null && s.end !== null).length;
  const reviewed = segments.filter((s) => s.status === "reviewed").length;

  function exportJson() {
    const segs = segments;
    const out: AnnotationExport = {
      schema_version: "0.1", is_sample: false,
      generated_by: "ethio-lyric-align prototype (proof of concept)",
      created_at: new Date().toISOString(),
      audio: { file_name: fileName, duration_s: duration, sha256: hash },
      language, tokenization: "whitespace", segments: segs,
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = (fileName.replace(/\.[^.]+$/, "") || "annotation") + ".alignment.json";
    a.click(); URL.revokeObjectURL(a.href);
  }

  const wfSegs = segments.map((s) => ({ start: s.start, end: s.end, selected: s.index === sel }));

  return (
    <main>
      <h1>Word-level lyric alignment <small>proof of concept</small></h1>
      <p className="note">
        Runs entirely in your browser. Audio and lyrics are never uploaded. There are no accounts, database, reviewer queue,
        payments or cloud saving: export the JSON to keep your work. Only load recordings and lyrics you are permitted to use.
      </p>

      <section>
        <label>1. Audio file <input type="file" accept="audio/*" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        {msg && <p className="note">{msg}</p>}
        {url && <audio ref={audioRef} src={url} controls onLoadedMetadata={(e) => setDuration((d) => d ?? e.currentTarget.duration)} />}
        <Waveform peaks={peaks} duration={duration ?? 0} current={current} segments={wfSegs} onSeek={seek} />
        <div className="row">
          <span>Playhead: {current.toFixed(3)} s</span>
          <button onClick={() => seek(current - 2)}>-2 s</button>
          <button onClick={() => seek(current + 2)}>+2 s</button>
          <label>Speed <select onChange={(e) => audioRef.current && (audioRef.current.playbackRate = Number(e.target.value))} defaultValue="1">
            <option>0.5</option><option>0.75</option><option>1</option></select></label>
        </div>
      </section>

      <section>
        <label>2. Lyrics (one or more lines) and language tag
          <input className="lang" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="BCP-47 language tag" />
        </label>
        <textarea rows={4} value={lyrics} onChange={(e) => setLyrics(e.target.value)} lang={language} />
        <button onClick={applyTokens}>Split into words (replaces current annotation)</button>
      </section>

      <section>
        <h2>3. Words ({timed}/{segments.length} timed, {reviewed} reviewed)</h2>
        <div className="words">
          {segments.map((s) => (
            <button key={s.index} className={`w ${s.status} ${s.index === sel ? "sel" : ""}`} onClick={() => setSel(s.index)} lang={language}>
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
            <button onClick={() => setBoundary("start")}>Set start = playhead</button>
            <button onClick={() => setBoundary("end")}>Set end = playhead</button>
            <button onClick={playRegion}>Play word</button>
            <button onClick={() => markStatus("reviewed")}>Mark reviewed</button>
            <button onClick={() => markStatus("uncertain")}>Mark uncertain</button>
            <button onClick={() => update(sel, { start: null, end: null, status: "untimed" })}>Clear</button>
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
        <h2>4. Checks and export</h2>
        {issues.length === 0 ? <p className="note">No structural problems found. This does not prove the boundaries match the audio.</p>
          : <ul className="issues">{issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
        <button onClick={exportJson} disabled={!segments.length}>Export JSON</button>
      </section>
    </main>
  );
}
