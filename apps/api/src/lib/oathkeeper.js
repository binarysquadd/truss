import { OATHKEEPER_ADMIN_URL, OATHKEEPER_ADMIN_TOKEN } from "./state.js";
import { fetchWithTimeout } from "./helpers.js";

function getOathkeeperAdminBaseUrl() {
  return OATHKEEPER_ADMIN_URL || "";
}

async function parseOathkeeperError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error?.reason || body.error?.message || body.message || `Oathkeeper error ${response.status}`;
  }
  const text = await response.text().catch(() => "");
  return text || `Oathkeeper error ${response.status}`;
}

export async function oathkeeperAdminRequest(pathname, options = {}) {
  const adminBase = getOathkeeperAdminBaseUrl();
  if (!adminBase) {
    throw new Error("OATHKEEPER_ADMIN_URL is not configured.");
  }

  const url = new URL(pathname, adminBase.endsWith("/") ? adminBase : `${adminBase}/`);
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (OATHKEEPER_ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${OATHKEEPER_ADMIN_TOKEN}`;
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
    throw new Error(await parseOathkeeperError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}
