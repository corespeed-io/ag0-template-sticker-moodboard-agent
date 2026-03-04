#!/usr/bin/env -S deno run --allow-all
/**
 * Create Sticker — Generate LINE-style stickers using Google Gemini via AI Gateway.
 * Uses OpenAI-compatible images/generations endpoint.
 *
 * Usage:
 *   deno run --allow-all scripts/create_sticker.ts "waving hello cheerfully"
 *   deno run --allow-all scripts/create_sticker.ts "thumbs up" --character "chibi girl with cat ears"
 *   deno run --allow-all scripts/create_sticker.ts --ideas
 */

import { resolve, dirname, fromFileUrl } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";
import { parseArgs } from "jsr:@std/cli/parse-args";

const SCRIPT_DIR = dirname(fromFileUrl(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const STICKERS_DIR = resolve(PROJECT_ROOT, "stickers");

const DEFAULT_MODEL = "gemini-2.5-flash-image";

const DEFAULT_CHARACTER = `Chibi sticker of a cute character.
Keep the shading and rendering style, but in chibi proportions (large head, small body, 2.5 head ratio).
Upper body framing. Thin delicate outlines.
Solid flat light gray background RGB(240,240,240). No extra decorations, no border.`;

const STICKER_IDEAS = [
  "waving hello cheerfully with big smile",
  "giving thumbs up with wink",
  "holding a magnifying glass investigating",
  "drinking bubble tea happily",
  "sleeping on desk with zzz",
  "typing on laptop intensely",
  "jumping with excitement arms raised",
  "crying dramatically with waterfall tears",
  "angry with puffed cheeks",
  "making heart shape with hands",
  "running late with toast in mouth",
  "reading a book deeply focused",
  "taking notes with sparkle eyes",
  "confused with question marks",
  "victory pose with both peace signs",
  "embarrassed covering face blushing",
  "pointing forward determinedly",
  "sitting and hugging knees shyly",
  "laughing so hard holding stomach",
  "shocked jaw drop with sweat drop",
];

// ── Helpers ──────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const val = Deno.env.get(name);
  if (!val) {
    console.error(`Error: ${name} environment variable is not set.`);
    Deno.exit(1);
  }
  return val;
}

function sanitizeFilename(desc: string): string {
  let name = desc.toLowerCase().trim().replace(/\s+/g, "_");
  name = name.replace(/[^a-z0-9_]/g, "");
  while (name.includes("__")) name = name.replace(/__/g, "_");
  name = name.replace(/^_|_$/g, "");
  return name.slice(0, 60) || `sticker_${Date.now()}`;
}

// ── Gemini Image Generation via AI Gateway (OpenAI-compatible) ───

async function generateSticker(
  prompt: string,
  gatewayBaseUrl: string,
  apiToken: string,
  model: string,
): Promise<Uint8Array> {
  const url = `${gatewayBaseUrl}/google-ai-studio/v1beta/openai/images/generations`;

  const body = {
    model,
    prompt,
    n: 1,
    response_format: "b64_json",
  };

  console.log(`  Calling ${model} via AI Gateway (OpenAI-compatible)...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const result = await res.json();

  const b64Data = result.data?.[0]?.b64_json;
  if (!b64Data) {
    throw new Error("No image in Gemini response");
  }

  const binaryString = atob(b64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["character", "model"],
    boolean: ["ideas", "help"],
    default: { model: DEFAULT_MODEL },
  });

  if (args.help) {
    console.log(`Usage: create_sticker.ts "pose description" [options]

Options:
  --character   Character description prompt
  --model       Gemini model (default: ${DEFAULT_MODEL})
  --ideas       Print sticker ideas
  --help        Show this help

Environment:
  AI_GATEWAY_BASE_URL   Cloudflare AI Gateway base URL
  AI_GATEWAY_API_TOKEN  AI Gateway auth token`);
    return;
  }

  if (args.ideas) {
    console.log("Sticker ideas:");
    for (let i = 0; i < STICKER_IDEAS.length; i++) {
      console.log(`  ${(i + 1).toString().padStart(2)}. ${STICKER_IDEAS[i]}`);
    }
    return;
  }

  const description = args._[0]?.toString();
  if (!description) {
    console.error('Usage: create_sticker.ts "sticker description"');
    console.error("       create_sticker.ts --ideas");
    Deno.exit(1);
  }

  const gatewayBaseUrl = getRequiredEnv("AI_GATEWAY_BASE_URL");
  const apiToken = getRequiredEnv("AI_GATEWAY_API_TOKEN");
  const characterPrompt = args.character || DEFAULT_CHARACTER;
  const filename = sanitizeFilename(description);

  console.log(`Generating sticker: ${description}`);

  const fullPrompt = `${characterPrompt}\nAction/Pose: ${description}`;

  const imageBytes = await generateSticker(
    fullPrompt, gatewayBaseUrl, apiToken, args.model,
  );
  console.log("  Generated!");

  await ensureDir(STICKERS_DIR);
  const outputPath = resolve(STICKERS_DIR, `${filename}.png`);
  await Deno.writeFile(outputPath, imageBytes);
  console.log(`  Saved: ${outputPath}`);

  console.log(`\nSticker ready: ${outputPath}`);
  console.log(`STICKER_PATH:stickers/${filename}.png`);
}

if (import.meta.main) {
  await main();
}
