import { readOpenAIConfiguration, type OpenAIRuntime } from "./key.ts";

export function getOpenAIStatus(runtime: OpenAIRuntime) {
  const configuration = readOpenAIConfiguration(runtime);
  return {
    configured: Boolean(configuration.apiKey),
    mode: configuration.apiKey ? "openai" as const : "structured_offline" as const,
    specialistModel: configuration.specialistModel,
    chiefModel: configuration.chiefModel,
  };
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function probeOpenAI(
  runtime: OpenAIRuntime,
  fetcher: FetchLike = fetch,
  options: { timeoutMs?: number; requestBody?: unknown } = {},
) {
  const configuration = readOpenAIConfiguration(runtime);
  if (!configuration.apiKey) return { ok: false as const, code: "not_configured" as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(options.timeoutMs ?? 8000, 50), 10000));
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${configuration.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: configuration.specialistModel,
        input: "Return the single word OK.",
        max_output_tokens: 8,
        store: false,
      }),
    });
    if (response.ok) return { ok: true as const, code: "connected" as const };
    if (response.status === 401 || response.status === 403) return { ok: false as const, code: "provider_rejected" as const };
    if (response.status === 429) return { ok: false as const, code: "rate_limited" as const };
    return { ok: false as const, code: "provider_error" as const };
  } catch (error) {
    return { ok: false as const, code: error instanceof DOMException && error.name === "AbortError" ? "timeout" as const : "network_error" as const };
  } finally { clearTimeout(timer); }
}
