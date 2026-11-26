import { handleHealth } from "../server/geminiHandlers.ts";
import {
  sendJson,
  type ServerlessRequest,
  type ServerlessResponse,
} from "../server/vercelAdapter.ts";

export default function handler(
  req: ServerlessRequest,
  res: ServerlessResponse
) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET." });
    return;
  }
  const result = handleHealth();
  sendJson(res, result.status, result.body);
}
