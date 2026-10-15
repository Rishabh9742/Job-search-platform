export class RateLimitError extends Error {
  constructor(
    public provider: string,
    public retryAfterSeconds: number,
  ) {
    super(`${provider} rate limited; retry after ${retryAfterSeconds}s`);
  }
}

export class HttpStatusError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

const UA = "JobPilotAI/0.1 (+personal job search assistant)";

/** fetch with timeout, typed errors, and retry on transient network/5xx failures. */
export async function fetchWithRetry(url: string, init: RequestInit & { timeoutMs?: number; retries?: number; provider?: string } = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, provider = new URL(url).host, ...rest } = init;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...rest,
        headers: { "User-Agent": UA, Accept: "application/json", ...(rest.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get("retry-after")) || 60;
        throw new RateLimitError(provider, ra);
      }
      if (res.status >= 500 && attempt < retries) {
        lastErr = new HttpStatusError(res.status, url, "");
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastErr = err;
      if (attempt < retries) await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string, init: Parameters<typeof fetchWithRetry>[1] = {}): Promise<T> {
  const res = await fetchWithRetry(url, init);
  if (!res.ok) throw new HttpStatusError(res.status, url, (await res.text()).slice(0, 500));
  return (await res.json()) as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
