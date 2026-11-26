import { handleTtsScene } from "../../server/geminiHandlers.ts";
import {
  readJsonBody,
  sendJson,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../../server/vercelAdapter.ts";

export default async function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return;
  }
  const body = await readJsonBody(req);
  const result = await handleTtsScene(body);
  sendJson(res, result.status, result.body);
}
