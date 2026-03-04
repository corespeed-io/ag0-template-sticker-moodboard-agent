# Sticker Moodboard Agent — Development Guide

## Project Overview

A Zypher-powered AI agent that generates LINE-style character stickers using Google Gemini via Cloudflare AI Gateway.
Layout: Chat panel (left) + Sticker moodboard canvas (right).

## Architecture

- **Backend** (Deno + Hono): `main.ts` → `api/mod.ts` → `api/agent.ts`
- **Frontend** (React + Vite): `ui/src/App.tsx` with `StickerPanel.tsx`
- **Agent SDK**: Zypher (`@zypher/agent`, `@zypher/http`) for agent loop, tools, streaming
- **Sticker Generation**: Gemini image gen via Cloudflare AI Gateway (BYOK)

## Key Files

| File | Purpose |
|------|---------|
| `api/agent.ts` | Zypher agent config, Gemini model, system prompt |
| `api/mod.ts` | API routes: `/api/stickers`, `/api/config`, `/api/ws` |
| `api/config.ts` | Runtime gateway configuration checks |
| `api/tools/create_sticker_tool.ts` | Gemini image generation tool (via AI Gateway) |
| `scripts/create_sticker.ts` | Gemini image generation CLI script |
| `ui/src/App.tsx` | Main UI: chat + moodboard layout |
| `ui/src/components/StickerPanel.tsx` | Sticker grid with preview/download |

## Commands

```bash
deno task dev          # Run both backend + frontend
deno task dev:api      # Backend only (port 8080)
deno task dev:ui       # Frontend only (port 5173)
cd ui && pnpm build    # Build frontend for production
```

## API Endpoints

- `GET /api/config` — Check if AI Gateway is configured
- `GET /api/stickers` — List all stickers
- `DELETE /api/stickers` — Delete all stickers
- `GET /api/sticker?path=...` — Serve sticker image
- `GET /api/ws` — WebSocket for real-time sticker file changes
- `/api/agent/*` — Zypher agent endpoints (chat, task, messages)

## Environment Variables

- `AI_GATEWAY_BASE_URL` — Cloudflare AI Gateway endpoint
- `AI_GATEWAY_API_TOKEN` — AI Gateway authentication token (BYOK for Gemini)
- `PORT` — Server port (default: 8080)
- `VITE_PORT` — Vite dev server port for proxy (default: 5173)
