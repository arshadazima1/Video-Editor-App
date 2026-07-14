# 🎬 AI Video Studio

A desktop **AI-powered video editor for Windows** — a Premiere/CapCut-style timeline editor with built-in
**prompt-to-video generation** and **AI avatar creation**, purpose-built for **Instagram Reels** and
**Facebook posts**.

Built with Electron + React + TypeScript, rendering through a bundled FFmpeg (no separate install needed).

## Features

**Editing (Premiere/CapCut-style)**
- Multi-track timeline: 2 video tracks, text track, audio track
- Drag & drop clips from the media library, move, trim (edge handles), split (✂ / `S`), delete (`Del`)
- Real-time preview player with play/pause (`Space`), scrubbing, and zoomable timeline
- Per-clip effects: brightness, contrast, saturation, opacity, fade in/out, volume
- Text overlays with font size, color, position, and background box
- Canvas formats: Reel 9:16, Facebook 4:5, Square 1:1, Landscape 16:9

**AI generation (✨ AI Video tab)**
- **Replicate** — text-to-video (Wan 2.2 by default; use any Replicate video model, e.g. Kling, Hunyuan)
- **Runway** — text-to-video via the Runway dev API
- **Stability AI** — text-to-image for post graphics
- Pick an aspect ratio, write a prompt, and the result lands in your media library / timeline

**AI avatars (🧑‍🎤 Avatar tab) — HeyGen / Higgsfield-style**
- **HeyGen** — pick from your HeyGen avatars & voices, type a script, get a talking-avatar video
- **D-ID** — animate a photo (public image URL) with a spoken script

**Export**
- One-click MP4 export with social presets:
  - Instagram Reel / Story — 1080×1920
  - Facebook Post — 1080×1350
  - Square — 1080×1080
  - Landscape / YouTube — 1920×1080
- H.264 + AAC with `faststart` (upload-ready), live progress bar

## Requirements

- Windows 10/11 (also runs on macOS/Linux)
- [Node.js 20+](https://nodejs.org) (LTS)

## Getting started

```bash
npm install       # installs everything incl. a bundled ffmpeg binary
npm start         # launches the desktop app (Vite dev server + Electron)
```

Build an installable Windows app:

```bash
npm run dist      # produces an NSIS installer under release/
```

> `npm run dev` alone opens the editor in a browser — handy for playing with the timeline,
> but AI generation and export need the Electron app (`npm start`).

## API keys

Open **⚙ Settings** in the top bar and paste keys for the providers you want (all optional):

| Provider | Used for | Get a key |
|---|---|---|
| Replicate | Text → video | https://replicate.com/account/api-tokens |
| Runway | Text → video | https://dev.runwayml.com |
| Stability AI | Text → image | https://platform.stability.ai/account/keys |
| HeyGen | Avatar videos | https://app.heygen.com → Settings → Subscriptions & API |
| D-ID | Photo → talking avatar | https://studio.d-id.com → API |

Keys are stored locally (`%APPDATA%/ai-video-studio/settings.json`) and sent only to the
respective provider. Generation costs are billed by each provider per their pricing.

> AI model slugs evolve quickly. If a provider rejects the default model, paste a current
> model slug into the **Model** field in the AI panel (e.g. any text-to-video model from
> replicate.com/explore).

## Typical Reel workflow

1. Pick **Reel 9:16** in the top bar.
2. **✨ AI Video** tab → prompt → Generate (or import your own footage).
3. **🧑‍🎤 Avatar** tab → script → generate a talking-head intro.
4. Arrange clips on the timeline, add music on the audio track, add text overlays.
5. Tune effects/fades in the Inspector.
6. **⬆ Export** → Instagram Reel preset → upload.

## Project structure

```
electron/          # Main process: window, ffmpeg export, AI provider adapters, settings
  ffmpegExport.ts  #   timeline → ffmpeg filter_complex graph → MP4
  aiProviders.ts   #   Replicate / Runway / Stability / HeyGen / D-ID
shared/types.ts    # Data model shared by UI and backend
src/               # React renderer
  store/           #   zustand project store (tracks, clips, assets)
  components/      #   Timeline, Preview, Inspector, AI panels, dialogs
```

## Troubleshooting

- **`npm install` fails downloading ffmpeg** — corporate proxy? Retry with
  `npm install --ignore-scripts` then `npm rebuild ffmpeg-static` on an open network.
- **Exported text uses no font / wrong font** — point *Settings → Font file* at any `.ttf`,
  e.g. `C:/Windows/Fonts/segoeuib.ttf`.
- **Provider errors** — the exact API response is shown in the panel; most often the key is
  missing/invalid or the model slug needs updating.
