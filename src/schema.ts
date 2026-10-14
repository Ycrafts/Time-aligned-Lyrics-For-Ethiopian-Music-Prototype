export type WordStatus = "untimed" | "timed" | "reviewed" | "uncertain";

export interface WordSegment {
  index: number;
  text: string;
  start: number | null;
  end: number | null;
  status: WordStatus;
  note: string;
}

export interface AnnotationExport {
  schema_version: "0.1";
  is_sample: false;
  generated_by: "ethio-lyric-align prototype (proof of concept)";
  created_at: string;
  audio: { file_name: string; duration_s: number | null; sha256: string | null };
  language: string;
  tokenization: "whitespace";
  segments: WordSegment[];
}

const ETHIOPIC_PUNCT = /[፡-፨]/g;

export function tokenize(lyrics: string): string[] {
  return lyrics
    .split(/\s+/)
    .map((t) => t.replace(ETHIOPIC_PUNCT, "").replace(/^[\p{P}]+|[\p{P}]+$/gu, ""))
    .filter((t) => t.length > 0);
}

export function validate(segments: WordSegment[], duration: number | null): string[] {
  const issues: string[] = [];
  for (const s of segments) {
    if (s.start === null && s.end === null) continue;
    if (s.start === null || s.end === null) {
      issues.push(`#${s.index + 1} "${s.text}": only one boundary is set`);
      continue;
    }
    if (s.start < 0) issues.push(`#${s.index + 1} "${s.text}": start is negative`);
    if (s.end <= s.start) issues.push(`#${s.index + 1} "${s.text}": end must be after start`);
    if (duration !== null && s.end > duration + 1e-6)
      issues.push(`#${s.index + 1} "${s.text}": end exceeds audio duration`);
    if (s.end - s.start > 10) issues.push(`#${s.index + 1} "${s.text}": interval longer than 10 s, check`);
  }
  let prevStart = -Infinity;
  for (const s of segments) {
    if (s.start === null) continue;
    if (s.start < prevStart)
      issues.push(`#${s.index + 1} "${s.text}": starts before the previous timed word (allowed only for overlapping vocals)`);
    prevStart = s.start;
  }
  return issues;
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
