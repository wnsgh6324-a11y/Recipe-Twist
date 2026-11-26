import express from "express";
import type { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_SPEAKERS = new Set(["Mia", "Alex", "Judge"]);

const VOICE_PROFILES: Record<
  string,
  { voiceName: string; defaultStyle: string }
> = {
  Mia: {
    voiceName: "Kore",
    defaultStyle:
      "Warm, expressive young female university student speaking clear natural American English",
  },
  Alex: {
    voiceName: "Puck",
    defaultStyle:
      "Friendly, calm young male university student speaking clear natural American English",
  },
  Judge: {
    voiceName: "Charon",
    defaultStyle:
      "Composed, warm culinary judge speaking clear articulate English with genuine delight",
  },
};

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getTtsAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the server environment.");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient =
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("timeout");
      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
}

interface TtsLineInput {
  id: string;
  speaker: string;
  text: string;
  styleHint?: string;
}

async function synthesizeLineWav(
  ai: GoogleGenAI,
  line: TtsLineInput
): Promise<{ id: string; audioBase64: string; mimeType: string }> {
  const profile = VOICE_PROFILES[line.speaker] ?? VOICE_PROFILES.Mia;
  const style = line.styleHint?.trim()
    ? `${profile.defaultStyle}. Tone: ${line.styleHint.trim()}`
    : profile.defaultStyle;

  const interaction = await withRetry(() =>
    ai.interactions.create({
      model: "gemini-3.8-flash-tts",
      input: [
        {
          type: "text",
          text: line.text,
          annotations: [
            {
              type: "speech_metadata",
              style,
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [
          {
            language: "en-US",
            voice: profile.voiceName,
          },
        ],
      },
    })
  );

  const audio = interaction.output_audio;
  if (!audio?.data) {
    throw new Error(`No audio data returned for line "${line.id}".`);
  }
  return {
    id: line.id,
    audioBase64: audio.data,
    mimeType: audio.mime_type ?? "audio/wav",
  };
}

function getFriendlyErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("GEMINI_API_KEY is not configured")) {
    return { status: 500, message: "Server Gemini API key is not configured in Settings > Secrets." };
  }
  if (raw.includes("API_KEY_INVALID") || raw.includes("PERMISSION_DENIED") || raw.includes("403")) {
    return {
      status: 403,
      message: "Gemini API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (raw.includes("RESOURCE_EXHAUSTED") || raw.includes("429")) {
    return {
      status: 429,
      message: "Voice generation rate limit reached. Please wait a few seconds and try again.",
    };
  }
  return { status: 500, message: raw || "Unexpected server error." };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/tts/scene", async (req: Request, res: Response) => {
    try {
      const body = req.body as { lines?: unknown };
      if (!Array.isArray(body?.lines) || body.lines.length === 0 || body.lines.length > 8) {
        res.status(400).json({ error: "Provide 1 to 8 dialogue lines." });
        return;
      }

      const sanitizedLines: TtsLineInput[] = [];
      for (const item of body.lines) {
        if (!item || typeof item !== "object") {
          res.status(400).json({ error: "Invalid dialogue line item." });
          return;
        }
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.slice(0, 64) : "";
        const speaker = typeof record.speaker === "string" ? record.speaker : "";
        const text = typeof record.text === "string" ? record.text.trim().slice(0, 300) : "";
        const styleHint =
          typeof record.styleHint === "string" ? record.styleHint.trim().slice(0, 140) : undefined;

        if (!id || !VALID_SPEAKERS.has(speaker) || !text) {
          res.status(400).json({ error: "Each line requires a valid id, speaker, and non-empty text." });
          return;
        }
        sanitizedLines.push({ id, speaker, text, styleHint });
      }

      const ttsAi = getTtsAiClient();
      const results = [];
      for (const line of sanitizedLines) {
        const audio = await synthesizeLineWav(ttsAi, line);
        results.push(audio);
      }

      res.json({ audioLines: results });
    } catch (err: unknown) {
      const { status, message } = getFriendlyErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/scene/regenerate", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        sceneNumber?: unknown;
        label?: unknown;
        description?: unknown;
        lines?: unknown;
        expressions?: unknown;
      };

      const sceneNumber = Number(body?.sceneNumber);
      if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > 4) {
        res.status(400).json({ error: "sceneNumber must be 1, 2, 3, or 4." });
        return;
      }

      const label = typeof body?.label === "string" ? body.label.slice(0, 40) : "Scene";
      const description =
        typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
      const inputLines = Array.isArray(body?.lines) ? body.lines : [];
      const expressions = Array.isArray(body?.expressions) ? body.expressions : [];

      if (inputLines.length === 0 || inputLines.length > 4) {
        res.status(400).json({ error: "Provide 1 to 4 lines for the scene." });
        return;
      }

      const cleanLines = inputLines.map((l, idx) => {
        const rec = (l ?? {}) as Record<string, unknown>;
        const speaker = VALID_SPEAKERS.has(String(rec.speaker)) ? String(rec.speaker) : "Mia";
        return {
          id: typeof rec.id === "string" ? rec.id.slice(0, 64) : `s${sceneNumber}-l${idx + 1}`,
          speaker,
          text: typeof rec.text === "string" ? rec.text.trim().slice(0, 260) : "",
          koreanText: typeof rec.koreanText === "string" ? rec.koreanText.trim().slice(0, 260) : "",
          expressionId:
            typeof rec.expressionId === "string" ? rec.expressionId.slice(0, 32) : undefined,
        };
      });

      const exprList = expressions
        .slice(0, 5)
        .map((e) => {
          const rec = (e ?? {}) as Record<string, unknown>;
          return `- "${String(rec.phrase ?? "").slice(0, 120)}" (Korean: ${String(rec.koreanMeaning ?? "").slice(0, 120)})`;
        })
        .join("\n");

      const ai = getAiClient();
      const prompt = `You are polishing Scene ${sceneNumber} (${label}) of an original, family-friendly 30-second animated English-learning video titled "The Unexpected Recipe" for Korean university students.
Characters (original students, no celebrities or movie characters):
- Mia: nervous at first, thoughtful university student cook.
- Alex: calm, creative teammate.
- Judge: friendly culinary competition judge.

Scene visual description draft: "${description}"
Target expressions to preserve naturally if present in this scene:
${exprList}

Current dialogue lines:
${cleanLines
  .map((l) => `${l.id} | ${l.speaker}: "${l.text}" (current Korean: "${l.koreanText}")`)
  .join("\n")}

Task:
1. Keep the scene description vivid, concise (1-2 sentences), and 100% consistent with the cooking competition pancake story.
2. Keep each dialogue line's English concise (suitable for a 7-8 second animated clip and max 2 subtitle lines) and preserve any edited movie expression phrase in that line.
3. Provide natural, warm, accurate Korean subtitles for Korean university students matching each English line.
Return JSON matching the schema.`;

      const textResponse = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                lines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      speaker: { type: Type.STRING },
                      text: { type: Type.STRING },
                      koreanText: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        })
      );

      const rawJson = (textResponse.text ?? "{}").trim();
      const parsed = JSON.parse(rawJson) as {
        description?: string;
        lines?: Array<{ id?: string; speaker?: string; text?: string; koreanText?: string }>;
      };

      const updatedLines = cleanLines.map((orig, idx) => {
        const match =
          parsed.lines?.find((pl) => pl.id === orig.id) ?? parsed.lines?.[idx];
        const nextText = match?.text?.trim() || orig.text;
        const nextKorean = match?.koreanText?.trim() || orig.koreanText;
        return {
          ...orig,
          text: nextText,
          koreanText: nextKorean,
        };
      });

      const ttsAi = getTtsAiClient();
      const audioLines = [];
      for (const line of updatedLines) {
        const audio = await synthesizeLineWav(ttsAi, {
          id: line.id,
          speaker: line.speaker,
          text: line.text,
          styleHint:
            sceneNumber === 1 && line.speaker === "Mia"
              ? "Slightly nervous and excited"
              : sceneNumber === 4 && line.speaker === "Mia"
                ? "Surprised and delighted"
                : undefined,
        });
        audioLines.push(audio);
      }

      res.json({
        description: parsed.description?.trim() || description,
        lines: updatedLines,
        audioLines,
      });
    } catch (err: unknown) {
      const { status, message } = getFriendlyErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/expressions/translate", async (req: Request, res: Response) => {
    try {
      const body = req.body as { phrase?: unknown; sourceMovie?: unknown };
      const phrase = typeof body?.phrase === "string" ? body.phrase.trim().slice(0, 160) : "";
      const sourceMovie =
        typeof body?.sourceMovie === "string" ? body.sourceMovie.trim().slice(0, 80) : "";
      if (!phrase) {
        res.status(400).json({ error: "Phrase is required." });
        return;
      }

      const ai = getAiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: `Provide a natural, concise Korean meaning and a brief 1-sentence English usage tip for Korean university students learning the everyday English expression: "${phrase}" (source note: "${sourceMovie}").`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                koreanMeaning: { type: Type.STRING },
                nuanceNote: { type: Type.STRING },
              },
            },
          },
        })
      );

      const parsed = JSON.parse((response.text ?? "{}").trim()) as {
        koreanMeaning?: string;
        nuanceNote?: string;
      };
      res.json({
        koreanMeaning: parsed.koreanMeaning?.trim() || "",
        nuanceNote: parsed.nuanceNote?.trim() || "",
      });
    } catch (err: unknown) {
      const { status, message } = getFriendlyErrorMessage(err);
      res.status(status).json({ error: message });
    }
  });

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Recipe Twist server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
