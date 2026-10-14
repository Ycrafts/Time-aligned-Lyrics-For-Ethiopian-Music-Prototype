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
