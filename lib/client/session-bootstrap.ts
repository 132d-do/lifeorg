type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createSessionFetch(fetcher: FetchLike = fetch) {
  let bootstrapped = false;
  let bootstrapPromise: Promise<Response> | null = null;

  const bootstrap = () => {
    bootstrapPromise ??= fetcher("/api/session", { method: "POST", credentials: "same-origin" }).finally(() => { bootstrapPromise = null; });
    return bootstrapPromise;
  };

  return async (input: RequestInfo | URL, init: RequestInit = {}) => {
    if (!bootstrapped) {
      const response = await bootstrap();
      if (!response.ok) return response;
      bootstrapped = true;
    }
    const requestInit = { ...init, credentials: "same-origin" as const };
    const first = await fetcher(input, requestInit);
    if (first.status !== 401) return first;
    const refreshed = await bootstrap();
    if (!refreshed.ok) return refreshed;
    return fetcher(input, requestInit);
  };
}

