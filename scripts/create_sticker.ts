#!/usr/bin/env -S deno run --allow-all
/**
 * Create Sticker — Generate LINE-style stickers using Google Gemini.
 *
 * Usage:
 *   deno run --allow-all scripts/create_sticker.ts "waving hello cheerfully"
 *   deno run --allow-all scripts/create_sticker.ts "thumbs up" --character "chibi girl with cat ears"
 *   deno run --allow-all scripts/create_sticker.ts "drinking tea" --reference assets/ref.jpg
 *   deno run --allow-all scripts/create_sticker.ts --ideas
 */

import { resolve, dirname, fromFileUrl } from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs";
import { parseArgs } from "jsr:@std/cli/parse-args";
import { encodeBase64 } from "jsr:@std/encoding/base64";

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

function getApiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) {
    console.error(
      "Error: GEMINI_API_KEY environment variable is not set.\n\n" +
      "To configure:\n" +
      "  1. Get an API key at https://aistudio.google.com/apikey\n" +
      '  2. export GEMINI_API_KEY="your-key-here"\n'
    );
    Deno.exit(1);
  }
  return key;
}

function sanitizeFilename(desc: string): string {
  let name = desc.toLowerCase().trim().replace(/\s+/g, "_");
  name = name.replace(/[^a-z0-9_]/g, "");
  while (name.includes("__")) name = name.replace(/__/g, "_");
  name = name.replace(/^_|_$/g, "");
  return name.slice(0, 60) || `sticker_${Date.now()}`;
}

async function readImageAsBase64(path: string): Promise<{ data: string; mimeType: string }> {
  const bytes = await Deno.readFile(path);
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeType = ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : "image/jpeg";
  return { data: encodeBase64(bytes), mimeType };
}

// ── Gemini Image Generation ──────────────────────────────

async function generateSticker(
  prompt: string,
  apiKey: string,
  model: string,
  referencePath?: string,
): Promise<Uint8Array> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build parts array
  const parts: unknown[] = [{ text: prompt }];

  // Add reference image if provided
  if (referencePath) {
    try {
      const { data, mimeType } = await readImageAsBase64(referencePath);
      parts.push({
        inlineData: { mimeType, data },
      });
      console.log(`  📎 Reference image: ${referencePath}`);
    } catch (err) {
      console.error(`  ⚠��  Failed to read reference image: ${err}`);
    }
  }

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      temperature: 1.0,
    },
  };

  console.log(`  🖌️  Calling ${model}...`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const result = await res.json();

  // Extract image from response
  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        // Decode base64 image
        const binaryString = atob(part.inlineData.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      }
    }
  }

  // Show text response for debugging
  for (const candidate of result.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) {
        console.error(`  Model response: ${part.text}`);
      }
    }
  }

  console.error("Full API response:", JSON.stringify(result, null, 2));
  throw new Error("No image in Gemini response");
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["character", "reference", "model"],
    boolean: ["ideas", "help"],
    default: {
      model: DEFAULT_MODEL,
    },
  });

  if (args.help) {
    console.log(`Usage: create_sticker.ts "pose description" [options]

Options:
  --character   Character description prompt
  --reference   Path to reference image
  --model       Gemini model (default: ${DEFAULT_MODEL})
  --ideas       Print sticker ideas
  --help        Show this help`);
    return;
  }

  if (args.ideas) {
    console.log("🎨 Sticker ideas:");
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

  const apiKey = getApiKey();
  const characterPrompt = args.character || DEFAULT_CHARACTER;
  const filename = sanitizeFilename(description);

  console.log(`🎨 Generating sticker: ${description}`);

  const fullPrompt = `${characterPrompt}\nAction/Pose: ${description}`;

  // 1. Generate
  const imageBytes = await generateSticker(
    fullPrompt,
    apiKey,
    args.model,
    args.reference,
  );
  console.log("  ✅ Generated!");

  // 2. Save
  await ensureDir(STICKERS_DIR);
  const outputPath = resolve(STICKERS_DIR, `${filename}.png`);
  await Deno.writeFile(outputPath, imageBytes);
  console.log(`  💾 Saved: ${outputPath}`);

  console.log(`\n✅ Sticker ready: ${outputPath}`);
  // Output path for programmatic use
  console.log(`STICKER_PATH:stickers/${filename}.png`);
}

if (import.meta.main) {
  await main();
}
