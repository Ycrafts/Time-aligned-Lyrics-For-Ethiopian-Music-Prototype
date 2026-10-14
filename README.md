# ethio-lyric-align (proof of concept)

A small browser tool for marking word-level start and end times of lyrics against a local audio file.
It accompanies the paper "Time-Aligned Lyrics for Ethiopian Music: A Dataset Design and Annotation Workflow for Amharic Songs".

## Status and limits

- Proof of concept. Not a production annotation platform.
- Everything runs in the browser. Audio and lyrics are not uploaded anywhere.
- No accounts, database, reviewer queue, payments, rights checks or cloud saving. Export the JSON to keep your work.
- Tokenization is whitespace splitting plus removal of Ethiopic and other punctuation at token edges. Correct the lyric text if a split is wrong.
- Waveform decoding loads the whole file into memory, so use short excerpts.
- Tested: `npm run build` succeeds; one scripted headless-Chromium run loaded a generated WAV, tokenized Amharic text, set timestamps by typing and by playhead, and exported JSON. It has not been usability-tested with real annotators or on mobile browsers.
- Only load recordings and lyrics you have permission to use.

## Game layer (v0.2 UI)

- Tap-along mode: play the song and tap (button or Space) as each word starts; E closes the last open word. This gives a rough first pass to refine.
- A word can only be marked "checked" after you replay it with Play word.
- XP, levels, badges and a progress ring are cosmetic and stored only in this browser (localStorage). They reward timing and checking steps, not speed, and are not payments or accuracy scores. They have not been validated as an incentive (see the paper, Section 8).
- Karaoke-style highlight shows the word under the playhead. Animations respect the reduced-motion setting.
- Tested: build succeeds; a scripted headless-Chromium run exercised tap-along, the replay-before-check rule, XP and JSON export. Not tested by real annotators or on mobile.

## Run locally

```bash
npm install
npm run dev        # development server
npm run build      # type-check and build into dist/
npm run preview    # serve the production build
```

Requires Node.js 18 or newer.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose "Add New Project" and import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`. No environment variables are needed.
4. Deploy. (Alternatively: `npm i -g vercel && vercel` from this folder.)

## Export format

`*.alignment.json` with `schema_version` 0.1, audio file name, duration, SHA-256 of the audio, language tag, and a list of word segments (`index`, `text`, `start`, `end`, `status`, `note`). Status values: `untimed`, `timed`, `reviewed`, `uncertain`. Times are seconds from the start of the file.
See `sample/synthetic-example.json` for a record built from placeholder values (not a real annotation).
