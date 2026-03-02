/**
 * create_sticker — Zypher Agent Tool
 *
 * Generates a LINE-style character sticker using fal.ai Nano Banana 2
 * (Google Gemini 3.1 Flash Image architecture).
 * Saves the result as a PNG in the stickers/ directory.
 */

import { resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { createTool } from "@zypher/agent/tools";
import { z } from "zod";
import { getFalApiKey } from "../config.ts";

const STICKERS_DIR = resolve(Deno.cwd(), "stickers");

const DEFAULT_CHARACTER = `Chibi sticker of a cute character.
Keep the shading and rendering style, but in chibi proportions (large head, small body, 2.5 head ratio).
Upper body framing. Thin delicate outlines.
Solid flat light gray background RGB(240,240,240). No extra decorations, no border.`;

// ── Helpers ──────────────────────────────────────────────

function sanitizeFilename(desc: string): string {
  let name = desc.toLowerCase().trim().replace(/\s+/g, "_");
  name = name.replace(/[^a-z0-9_]/g, "");
  while (name.includes("__")) name = name.replace(/__/g, "_");
  name = name.replace(/^_|_$/g, "");
  return name.slice(0, 60) || `sticker_${Date.now()}`;
}

// ── fal.ai Nano Banana 2 image generation ────────────────

async function generateStickerImage(
  prompt: string,
  apiKey: string,
): Promise<Uint8Array> {
  // fal.ai synchronous endpoint
  const url = "https://fal.run/fal-ai/nano-banana-2";

  const body = {
    prompt,
    aspect_ratio: "1:1",
    resolution: "1K",
    num_images: 1,
    output_format: "png",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai API error ${res.status}: ${errText}`);
  }

  const result = await res.json();

  // fal.ai returns { images: [{ url, content_type }], ... }
  const imageUrl = result?.images?.[0]?.url;
  if (!imageUrl) {
    throw new Error(
      `No image in fal.ai response: ${JSON.stringify(result).slice(0, 500)}`,
    );
  }

  // Download the image
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image: ${imgRes.status}`);
  }

  return new Uint8Array(await imgRes.arrayBuffer());
}

// ── Tool Definition ──────────────────────────────────────

export const CreateStickerTool = createTool({
  name: "create_sticker",
  description:
    "Generate a LINE-style character sticker image using fal.ai Nano Banana 2 (Gemini 3.1 Flash Image). " +
    "Provide a short action/pose description (e.g. 'chibi cat girl waving hello cheerfully'). " +
    "Optionally provide a character description to prepend to the prompt. " +
    "The sticker is saved as a PNG in the stickers/ directory and appears on the moodboard automatically.",
  schema: z.object({
    description: z
      .string()
      .describe(
        "Short action/pose description for the sticker, e.g. 'waving hello with big smile', 'drinking bubble tea happily'",
      ),
    character: z
      .string()
      .optional()
      .describe(
        "Character description/prompt. If omitted, uses default chibi character prompt.",
      ),
  }),
  async execute(params) {
    const apiKey = getFalApiKey();
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: FAL_KEY is not configured. Please click the ⚙️ Settings icon in the UI to enter your fal.ai API key (get one at https://fal.ai/dashboard/keys).",
          },
        ],
        isError: true,
      };
    }

    const characterPrompt = params.character || DEFAULT_CHARACTER;
    const filename = sanitizeFilename(params.description);
    const fullPrompt = `${characterPrompt}\nAction/Pose: ${params.description}`;

    try {
      // Generate
      const imageBytes = await generateStickerImage(fullPrompt, apiKey);

      // Save
      await ensureDir(STICKERS_DIR);
      const outputPath = resolve(STICKERS_DIR, `${filename}.png`);
      await Deno.writeFile(outputPath, imageBytes);

      const relativePath = `stickers/${filename}.png`;

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Sticker created successfully!\n\n📁 Saved to: ${relativePath}\n🎨 Description: ${params.description}\n🖌️ Model: Nano Banana 2 (Gemini 3.1 Flash Image)\n\nThe sticker is now visible on the moodboard panel.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `❌ Failed to generate sticker: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  },
});
