/**
 * API Router
 *
 * This module defines the backend API. All routes defined
 * here are mounted under `/api` by `main.ts`.
 *
 * Includes:
 *   /api/agent/*    — Zypher Agent (chat, streaming, message history)
 *   /api/config     — Get/set Gemini API key
 *   /api/stickers   — List / delete sticker images
 *   /api/sticker    — Serve individual sticker image
 *   /api/ws         — WebSocket for file-change notifications
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { relative, resolve } from "@std/path";
import { walk } from "@std/fs/walk";
import { createZypherAgentRouter } from "./agent.ts";
import {
  getFalApiKey,
  isFalApiKeySet,
  setFalApiKey,
} from "./config.ts";

const PROJECT_ROOT = Deno.cwd();
const STICKERS_DIR = resolve(PROJECT_ROOT, "stickers");

// Ensure stickers directory exists
try {
  await Deno.mkdir(STICKERS_DIR, { recursive: true });
} catch {
  // ignore
}

// ── WebSocket file-change broadcaster ──────────────────────────────────────

const wsClients = new Set<WebSocket>();

function broadcast(data: object) {
  const msg = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// Start file watcher in background — watches for .png stickers
(async () => {
  const debounce = new Map<string, ReturnType<typeof setTimeout>>();
  try {
    const watcher = Deno.watchFs(STICKERS_DIR, { recursive: true });
    for await (const event of watcher) {
      for (const p of event.paths) {
        if (!p.endsWith(".png") && !p.endsWith(".webp") && !p.endsWith(".jpg")) continue;
        if (p.includes("node_modules") || p.includes(".git")) continue;

        clearTimeout(debounce.get(p));
        debounce.set(
          p,
          setTimeout(() => {
            const eventType = event.kind === "create"
              ? "add"
              : event.kind === "remove"
              ? "unlink"
              : "change";
            broadcast({ event: eventType, path: relative(PROJECT_ROOT, p) });
          }, 300),
        );
      }
    }
  } catch (err) {
    console.error("[Watcher] Error:", err);
  }
})();

// ── Build router ───────────────────────────────────────────────────────────

const app = new Hono()
  .use(cors())
  // Zypher Agent API
  .route("/agent", await createZypherAgentRouter())

  // ── Config endpoints ─────────────────────────────────────────────────────

  .get("/config", (c) => {
    return c.json({
      hasApiKey: isFalApiKeySet(),
      // Return masked key for display
      apiKeyPreview: getFalApiKey()
        ? `${getFalApiKey()!.slice(0, 8)}...${getFalApiKey()!.slice(-4)}`
        : null,
    });
  })

  .post("/config", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.falApiKey || typeof body.falApiKey !== "string") {
        return c.json({ error: "falApiKey is required" }, 400);
      }
      setFalApiKey(body.falApiKey.trim());
      return c.json({ ok: true, hasApiKey: true });
    } catch (err) {
      console.error("[API] Error setting config:", err);
      return c.json({ error: "Failed to set config" }, 500);
    }
  })

  // ── WebSocket for file-change events ─────────────────────────────────────

  .get("/ws", (c) => {
    if (c.req.header("upgrade") !== "websocket") {
      return c.text("Expected WebSocket upgrade", 426);
    }
    const { socket, response } = Deno.upgradeWebSocket(c.req.raw);
    socket.onopen = async () => {
      wsClients.add(socket);
      // Replay existing sticker files so reconnecting clients see current state
      try {
        for await (
          const entry of walk(STICKERS_DIR, {
            exts: [".png", ".webp", ".jpg"],
            includeDirs: false,
          })
        ) {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(
              JSON.stringify({
                event: "add",
                path: relative(PROJECT_ROOT, entry.path),
              }),
            );
          }
        }
      } catch (err) {
        console.error("[WS] Error replaying files:", err);
      }
    };
    socket.onclose = () => wsClients.delete(socket);
    socket.onerror = (e) => console.error("[WS] Error:", e);
    return response;
  })

  // ── Sticker listing ──────────────────────────────────────────────────────

  .get("/stickers", async (c) => {
    const stickers: { path: string; name: string; createdAt: number }[] = [];
    try {
      for await (
        const entry of walk(STICKERS_DIR, {
          exts: [".png", ".webp", ".jpg"],
          includeDirs: false,
        })
      ) {
        const stat = await Deno.stat(entry.path);
        stickers.push({
          path: relative(PROJECT_ROOT, entry.path),
          name: entry.name.replace(/\.\w+$/, "").replace(/_/g, " "),
          createdAt: stat.mtime?.getTime() ?? Date.now(),
        });
      }
      stickers.sort((a, b) => b.createdAt - a.createdAt);
      return c.json(stickers);
    } catch (err) {
      console.error("[API] Error listing stickers:", err);
      return c.json([], 200);
    }
  })

  // ── Delete all stickers ──────────────────────────────────────────────────

  .delete("/stickers", async (c) => {
    try {
      for await (
        const entry of walk(STICKERS_DIR, {
          exts: [".png", ".webp", ".jpg"],
          includeDirs: false,
        })
      ) {
        await Deno.remove(entry.path);
      }
      return c.json({ ok: true });
    } catch (err) {
      console.error("[API] Error deleting stickers:", err);
      return c.json({ error: "Failed to delete stickers" }, 500);
    }
  })

  // ── Serve sticker image ──────────────────────────────────────────────────

  .get("/sticker", async (c) => {
    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query param required" }, 400);

    const absPath = resolve(PROJECT_ROOT, filePath);
    if (!absPath.startsWith(PROJECT_ROOT)) {
      return c.json({ error: "Path traversal not allowed" }, 403);
    }

    try {
      const file = await Deno.readFile(absPath);
      const ext = absPath.split(".").pop()?.toLowerCase();
      const contentType =
        ext === "png"
          ? "image/png"
          : ext === "webp"
          ? "image/webp"
          : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "application/octet-stream";
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return c.json({ error: "File not found" }, 404);
      }
      return c.json({ error: "Failed to read file" }, 500);
    }
  });

export default app;
