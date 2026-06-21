import { Router } from "express";
import {
  KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL, KRATOS_ADMIN_TOKEN,
  MINIO_S3_ENDPOINT, MINIO_CONSOLE_URL, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
} from "../lib/state.js";

export const router = Router();

// Probe a URL for reachability. Any HTTP response (even 4xx) counts as reachable —
// it means the service is up and answering; only a network/timeout error is "down".
async function probe(url, headers = {}) {
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    return { reachable: true, status: resp.status, message: `HTTP ${resp.status}` };
  } catch (e) {
    return { reachable: false, message: e instanceof Error ? e.message : "unreachable" };
  }
}

let _cache = null;
let _cachedAt = 0;

// GET /api/integrations/status — reachability of the backing auth + storage services.
// Feeds the dashboard's Home/Stack health tiles. Cached briefly to avoid hammering.
router.get("/api/integrations/status", async (_req, res) => {
  if (_cache && Date.now() - _cachedAt < 15000) return res.json(_cache);

  const authConfigured = Boolean(KRATOS_PUBLIC_URL);
  const adminConfigured = Boolean(KRATOS_ADMIN_URL);
  const s3Configured = Boolean(MINIO_S3_ENDPOINT);
  const consoleConfigured = Boolean(MINIO_CONSOLE_URL);

  const [authPublic, authAdmin, s3, console] = await Promise.all([
    authConfigured ? probe(`${KRATOS_PUBLIC_URL}/health/ready`) : { reachable: false, message: "not configured" },
    adminConfigured ? probe(`${KRATOS_ADMIN_URL}/admin/health/ready`, KRATOS_ADMIN_TOKEN ? { authorization: `Bearer ${KRATOS_ADMIN_TOKEN}` } : {}) : { reachable: false, message: "not configured" },
    s3Configured ? probe(`${MINIO_S3_ENDPOINT}/minio/health/live`) : { reachable: false, message: "not configured" },
    consoleConfigured ? probe(MINIO_CONSOLE_URL) : { reachable: false, message: "not configured" },
  ]);

  const result = {
    auth: {
      provider: "Ory Kratos",
      publicUrl: KRATOS_PUBLIC_URL || null,
      adminUrl: KRATOS_ADMIN_URL || null,
      adminTokenConfigured: Boolean(KRATOS_ADMIN_TOKEN),
      configured: authConfigured,
      reachable: authPublic.reachable,
      status: authPublic.status,
      message: authPublic.message,
      admin: {
        configured: adminConfigured,
        reachable: authAdmin.reachable,
        status: authAdmin.status,
        message: authAdmin.message,
      },
    },
    storage: {
      provider: "MinIO",
      consoleUrl: MINIO_CONSOLE_URL || null,
      s3Endpoint: MINIO_S3_ENDPOINT || null,
      hasCredentials: Boolean(MINIO_ACCESS_KEY && MINIO_SECRET_KEY),
      console: {
        configured: consoleConfigured,
        reachable: console.reachable,
        status: console.status,
        message: console.message,
      },
      s3: {
        configured: s3Configured,
        reachable: s3.reachable,
        status: s3.status,
        message: s3.message,
      },
    },
  };

  _cache = result;
  _cachedAt = Date.now();
  return res.json(result);
});
