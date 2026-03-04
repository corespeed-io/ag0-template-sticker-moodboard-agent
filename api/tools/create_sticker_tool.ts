/**
 * create_sticker — Zypher Agent Tool
 *
 * Generates a LINE-style character sticker using Google Gemini image generation
 * via Cloudflare AI Gateway (native generateContent endpoint).
 * Saves the result as a PNG in the stickers/ directory.
 */

import { resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { createTool } from "@zypher/agent/tools";
import { z } from "zod";
import { getRequiredEnv } from "@zypher/utils/env";

const STICKERS_DIR = resolve(Deno.cwd(), "stickers");

const GEMINI_MODEL = "gemini-2.5-flash-image";

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

// ── Gemini image generation via AI Gateway (native generateContent) ───

async function generateStickerImage(
  prompt: string,
): Promise<Uint8Array> {
  const gatewayBaseUrl = getRequiredEnv("AI_GATEWAY_BASE_URL");
  const apiToken = getRequiredEnv("AI_GATEWAY_API_TOKEN");

  const url = `${gatewayBaseUrl}/google-ai-studio/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

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

  // Find the inlineData part containing the image
  const parts = result.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error("No candidates in Gemini response");
  }

  const imagePart = parts.find(
    (p: { inlineData?: { mimeType?: string; data?: string } }) =>
      p.inlineData?.data,
  );
  if (!imagePart?.inlineData?.data) {
    throw new Error("No image in Gemini response");
  }

  const binaryString = atob(imagePart.inlineData.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ── Tool Definition ──────────────────────────────────────

export const CreateStickerTool = createTool({
  name: "create_sticker",
  description:
    "Generate a LINE-style character sticker image using Google Gemini image generation. " +
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
    const characterPrompt = params.character || DEFAULT_CHARACTER;
    const filename = sanitizeFilename(params.description);
    const fullPrompt = `${characterPrompt}\nAction/Pose: ${params.description}`;

    try {
      const imageBytes = await generateStickerImage(fullPrompt);

      await ensureDir(STICKERS_DIR);
      const outputPath = resolve(STICKERS_DIR, `${filename}.png`);
      await Deno.writeFile(outputPath, imageBytes);

      const relativePath = `stickers/${filename}.png`;

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Sticker created successfully!\n\n📁 Saved to: ${relativePath}\n🎨 Description: ${params.description}\n🖌️ Model: ${GEMINI_MODEL}\n\nThe sticker is now visible on the moodboard panel.`,
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
