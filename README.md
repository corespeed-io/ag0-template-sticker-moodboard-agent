# Sticker Moodboard Agent

![alt text](image.png)

AI agent for creating LINE-style character stickers using Google Gemini's image generation via Cloudflare AI Gateway. Features a chat-based interface on the left and a sticker moodboard canvas on the right.

## Features

- 🎨 **AI Sticker Generation** — Describe a pose/expression and the agent creates stickers via Google Gemini
- 🖼️ **Moodboard Canvas** — All generated stickers displayed in a grid with preview and download
- 💬 **Chat Interface** — Natural language conversation to create and manage stickers
- 🔄 **Real-time Updates** — WebSocket-powered live moodboard refresh

## Setup

### 1. Install Dependencies

```bash
# Backend
deno install

# Frontend
cd ui && pnpm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
AI_GATEWAY_BASE_URL=https://gateway.ai.c7d.dev
AI_GATEWAY_API_TOKEN=your-token-here
```

### 3. Run

```bash
# Start frontend (in a separate terminal)
cd ui && pnpm dev --port 5173

# Start backend (proxies frontend on port 8080)
deno task dev
```

Open **http://localhost:8080** in your browser.

## Architecture

```
├── main.ts                # Hono server entry point (port 8080, proxies frontend)
├── api/
│   ├── mod.ts             # API routes (stickers, config, WebSocket)
│   ├── agent.ts           # Zypher Agent with Gemini model via AI Gateway
│   ├── tools/
│   │   └── create_sticker_tool.ts  # Gemini image generation tool
│   └── middlewares/
│       └── proxy.ts       # Reverse proxy for Vite dev server
├── scripts/
│   └── create_sticker.ts  # Sticker generation CLI script
├── skills/
│   └── create-sticker/    # Agent skill definition
├── stickers/              # Generated sticker output (gitignored)
└── ui/                    # React frontend (Vite + Tailwind)
    └── src/
        ├── App.tsx                    # Main layout (chat + moodboard)
        ├── components/
        │   ├── StickerPanel.tsx       # Sticker moodboard grid
        │   └── ai-elements/          # Chat UI components
        └── lib/zypher-ui/            # Agent SDK hooks
```

## How It Works

1. User describes a sticker in the chat (e.g., "Create a cute cat waving hello")
2. The agent uses the `create_sticker` tool to generate the image via Gemini
3. The sticker is saved to `stickers/` directory
4. The moodboard panel auto-refreshes via WebSocket to show the new sticker
5. Users can preview, download, or request variations

## Tech Stack

- **Backend**: Deno + Hono + Zypher Agent SDK
- **Frontend**: React 19 + Vite + Tailwind CSS 4
- **AI**: Google Gemini image generation via Cloudflare AI Gateway
- **Real-time**: WebSocket file watcher for live updates
