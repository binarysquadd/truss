import { HYDRA_ADMIN_URL, HYDRA_ADMIN_TOKEN } from "./state.js";
import { fetchWithTimeout } from "./helpers.js";

function getHydraAdminBaseUrl() {
  return HYDRA_ADMIN_URL || "";
}

async function parseHydraError(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => ({}));
    return body.error_description || body.error?.reason || body.error?.message || body.message || `Hydra error ${response.status}`;
  }
  const text = await response.text().catch(() => "");
  return text || `Hydra error ${response.status}`;
}

export async function hydraAdminRequest(pathname, options = {}) {
  const adminBase = getHydraAdminBaseUrl();
  if (!adminBase) {
    throw new Error("HYDRA_ADMIN_URL is not configured.");
  }

  const url = new URL(pathname, adminBase.endsWith("/") ? adminBase : `${adminBase}/`);
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };
  if (HYDRA_ADMIN_TOKEN) {
    headers.Authorization = `Bearer ${HYDRA_ADMIN_TOKEN}`;
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
    throw new Error(await parseHydraError(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return null;
}
