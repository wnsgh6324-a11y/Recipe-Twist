import express from "express";
import type { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  handleHealth,
  handleRegenerateScene,
  handleTranslateExpression,
  handleTtsScene,
} from "./server/geminiHandlers.ts";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    const result = handleHealth();
    res.status(result.status).json(result.body);
  });

  app.post("/api/tts/scene", async (req: Request, res: Response) => {
    const result = await handleTtsScene(req.body);
    res.status(result.status).json(result.body);
  });

  app.post("/api/scene/regenerate", async (req: Request, res: Response) => {
    const result = await handleRegenerateScene(req.body);
    res.status(result.status).json(result.body);
  });

  app.post("/api/expressions/translate", async (req: Request, res: Response) => {
    const result = await handleTranslateExpression(req.body);
    res.status(result.status).json(result.body);
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
