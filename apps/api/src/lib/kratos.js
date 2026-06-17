import { KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL, KRATOS_ADMIN_TOKEN } from "./state.js";
import { fetchWithTimeout } from "./helpers.js";

export function getKratosAdminBaseUrl() {
  return KRATOS_ADMIN_URL || KRATOS_PUBLIC_URL;
}

async function parseKratosError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error?.reason || body.error?.message || body.message || `Kratos error ${response.status}`;
  }
  const text = await response.text().catch(() => "");
  return text || `Kratos error ${response.status}`;
}

export async function kratosAdminRequest(pathname, options = {}) {
  const adminBase = getKratosAdminBaseUrl();
  if (!adminBase) {
    throw new Error("KRATOS_ADMIN_URL (or KRATOS_PUBLIC_URL fallback) is not configured.");
  }

  const url = new URL(pathname, adminBase.endsWith("/") ? adminBase : `${adminBase}/`);
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (KRATOS_ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${KRATOS_ADMIN_TOKEN}`;
  }
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    8000
  );

  if (!response.ok) {
    throw new Error(await parseKratosError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (options.includeHeaders) {
    const data = contentType.includes("application/json") ? await response.json() : null;
    return { data, headers: response.headers };
  }
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}

/** Parse Kratos Link header to extract next/prev page tokens */
export function parseLinkHeader(linkHeader) {
  if (!linkHeader) return { next: null, prev: null };
  const result = { next: null, prev: null };
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="(\w+)"/);
    if (!match) continue;
    const [, url, rel] = match;
    try {
      const parsed = new URL(url);
      const token = parsed.searchParams.get("page_token");
      if (token && (rel === "next" || rel === "prev")) {
        result[rel] = token;
      }
    } catch { /* ignore malformed URLs */ }
  }
  return result;
}

export async function kratosPublicRegistration(email, password) {
  if (!KRATOS_PUBLIC_URL) {
    throw new Error("KRATOS_PUBLIC_URL is not configured.");
  }

  const publicBase = KRATOS_PUBLIC_URL.endsWith("/") ? KRATOS_PUBLIC_URL : `${KRATOS_PUBLIC_URL}/`;
  const initUrl = new URL("/self-service/registration/api", publicBase).toString();
  const initResponse = await fetchWithTimeout(
    initUrl,
    { headers: { Accept: "application/json" } },
    8000
  );
  if (!initResponse.ok) {
    throw new Error(await parseKratosError(initResponse));
  }
  const flow = await initResponse.json();
  if (!flow?.id) {
    throw new Error("Failed to initialize Kratos registration flow.");
  }

  const submitUrl = new URL(`/self-service/registration?flow=${encodeURIComponent(flow.id)}`, publicBase).toString();
  const submitResponse = await fetchWithTimeout(
    submitUrl,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ method: "password", password, traits: { email } }),
    },
    8000
  );
  if (!submitResponse.ok) {
    throw new Error(await parseKratosError(submitResponse));
  }

  const payload = await submitResponse.json();
  return payload.identity || payload.session?.identity || null;
}
