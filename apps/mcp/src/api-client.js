/** Minimal Truss API client used by every tool. Authenticates with a service_role key. */
export function makeApiClient(baseUrl, apiKey) {
  const base = String(baseUrl).replace(/\/+$/, "");
  return {
    async request(method, path, { query, body } = {}) {
      const url = new URL(base + path);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        }
      }
      const headers = { accept: "application/json", apikey: apiKey };
      if (body !== undefined) headers["content-type"] = "application/json";
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      let data;
      try { data = await res.json(); } catch { data = null; }
      return { ok: res.ok, status: res.status, data };
    },
  };
}
