/**
 * Runtime configuration store for the fal.ai API key.
 *
 * The fal.ai key is used for sticker image generation (Nano Banana 2),
 * NOT for the agent chat model (which uses Cloudflare AI Gateway).
 *
 * Can be set:
 *   1. Via environment variable FAL_KEY (in .env)
 *   2. Via the frontend settings panel (POST /api/config)
 */

let _falApiKey: string | null = null;

export function getFalApiKey(): string | null {
  return _falApiKey || Deno.env.get("FAL_KEY") || null;
}

export function setFalApiKey(key: string): void {
  _falApiKey = key;
  Deno.env.set("FAL_KEY", key);
}

export function isFalApiKeySet(): boolean {
  return !!getFalApiKey();
}
