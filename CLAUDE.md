# Sticker Moodboard Agent — Development Guide

## Project Overview

A Zypher-powered AI agent that generates LINE-style character stickers using Google Gemini.
Layout: Chat panel (left) + Sticker moodboard canvas (right).

## Architecture

- **Backend** (Deno + Hono): `main.ts` → `api/mod.ts` → `api/agent.ts`
- **Frontend** (React + Vite): `ui/src/App.tsx` with `StickerPanel.tsx` + `ApiKeyDialog.tsx`
- **Agent SDK**: Zypher (`@zypher/agent`, `@zypher/http`) for agent loop, tools, streaming
- **Sticker Generation**: `scripts/create_sticker.ts` calls Gemini image gen API

## Key Files

| File | Purpose |
|------|---------|
| `api/agent.ts` | Zypher agent config, Gemini model, system prompt |
| `api/mod.ts` | API routes: `/api/stickers`, `/api/config`, `/api/ws` |
| `api/config.ts` | Runtime API key store |
| `scripts/create_sticker.ts` | Gemini image generation script |
| `ui/src/App.tsx` | Main UI: chat + moodboard layout |
| `ui/src/components/StickerPanel.tsx` | Sticker grid with preview/download |
| `ui/src/components/ApiKeyDialog.tsx` | API key input modal |

## Commands

```bash
deno task dev          # Run both backend + frontend
deno task dev:api      # Backend only (port 8080)
deno task dev:ui       # Frontend only (port 5173)
cd ui && pnpm build    # Build frontend for production
```

## API Endpoints

- `GET /api/config` — Check if API key is set
- `POST /api/config` — Set Gemini API key `{ geminiApiKey: "..." }`
- `GET /api/stickers` — List all stickers
- `DELETE /api/stickers` — Delete all stickers
- `GET /api/sticker?path=...` — Serve sticker image
- `GET /api/ws` — WebSocket for real-time sticker file changes
- `/api/agent/*` — Zypher agent endpoints (chat, task, messages)

## Environment Variables

- `GEMINI_API_KEY` — Google Gemini API key (can also be set via frontend)
- `PORT` — Server port (default: 8080)
- `VITE_PORT` — Vite dev server port for proxy (default: 5173)
