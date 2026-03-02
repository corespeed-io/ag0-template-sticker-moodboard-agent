---
name: create-sticker
description: Generate LINE-style stickers of a character using Google Gemini image generation. Creates creative, unique poses with consistent character design. Use when user asks for sticker, 贴纸, LINE sticker.
---

# Create Sticker Skill

## Overview

Generate LINE-style character stickers using Google Gemini's image generation API. Each sticker has a creative, unique pose with consistent character appearance.

## How to Use

To create a sticker, run the create_sticker.ts script via terminal:

```bash
deno run --allow-all scripts/create_sticker.ts "pose and expression description"
```

Or with a custom character prompt:

```bash
deno run --allow-all scripts/create_sticker.ts "waving hello" --character "Chibi anime girl with blue hair and cat ears"
```

Or with a reference image:

```bash
deno run --allow-all scripts/create_sticker.ts "waving hello" --reference path/to/reference.jpg
```

## API Configuration

- **Model:** `gemini-2.0-flash-preview-image-generation` (Gemini image generation)
- **Authentication:** `GEMINI_API_KEY` environment variable (set via frontend settings)

## Output

Stickers are saved as PNG files in the `stickers/` directory. The moodboard panel in the UI automatically displays new stickers.

## Prompt Guidelines

### ✅ DO
- Keep action prompts **short and focused** on pose + expression + energy
- Describe **specific facial expressions** (half-lidded eyes, puffed cheeks, squinting)
- Use **dynamic verbs** (tilting, peeking, squeezing, leaning)

### ❌ DON'T
- Don't write long paragraphs — keep it concise
- Don't request full body — upper body framing works best for stickers
- Don't use thick/bold outline style — thin delicate lines only
