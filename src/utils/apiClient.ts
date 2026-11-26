export async function postJson<T extends Record<string, unknown>>(
  url: string,
  payload: unknown
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (networkErr: unknown) {
    const msg =
      networkErr instanceof Error ? networkErr.message : "Network request failed";
    throw new Error(`서버에 연결할 수 없습니다 (${url}): ${msg}`);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const rawText = await res.text();
  const trimmed = rawText.trim();
  const looksLikeJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksLikeJson) {
    if (res.status === 404) {
      throw new Error(
        `API 경로(${url})를 찾을 수 없습니다 (404 Not Found). Vercel 배포 시 프로젝트 루트의 /api 서버리스 함수와 GEMINI_API_KEY 환경 변수가 포함되어 있는지 확인해 주세요.`
      );
    }
    const snippet = trimmed.slice(0, 100) || res.statusText || "Empty response";
    throw new Error(
      `서버가 JSON 대신 일반 텍스트/HTML을 반환했습니다 (HTTP ${res.status}): "${snippet}"`
    );
  }

  let parsed: T & { error?: string };
  try {
    parsed = JSON.parse(trimmed) as T & { error?: string };
  } catch {
    throw new Error(
      `서버 응답 JSON 파싱에 실패했습니다 (HTTP ${res.status}, 경로 ${url}).`
    );
  }

  if (!res.ok) {
    throw new Error(
      parsed.error ||
        `API 요청이 실패했습니다 (HTTP ${res.status} · ${url}).`
    );
  }

  return parsed;
}
