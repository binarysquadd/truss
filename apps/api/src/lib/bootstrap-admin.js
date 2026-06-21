// First-boot default admin (Grafana / ArgoCD style).
// If Kratos has no identities yet, seed a default admin so a self-hoster can log
// in immediately instead of self-registering. The identity is flagged admin via
// metadata_public.truss_admin (honored by session.js). Idempotent + best-effort:
// it skips the moment any identity exists, and never blocks/crashes startup.
//
//   TRUSS_BOOTSTRAP_ADMIN=false           disable entirely
//   TRUSS_BOOTSTRAP_ADMIN_EMAIL=...        default admin@truss.local
//   TRUSS_BOOTSTRAP_ADMIN_PASSWORD=...     if unset, a random one is generated + logged
import crypto from "node:crypto";
import { kratosAdminRequest, getKratosAdminBaseUrl } from "./kratos.js";
import { KRATOS_IDENTITY_SCHEMA_ID } from "./state.js";
import logger from "./logger.js";

const log = logger.child({ module: "bootstrap-admin" });

const ENABLED = process.env.TRUSS_BOOTSTRAP_ADMIN !== "false";
const EMAIL = (process.env.TRUSS_BOOTSTRAP_ADMIN_EMAIL || "admin@truss.local").trim();
const PASSWORD_ENV = (process.env.TRUSS_BOOTSTRAP_ADMIN_PASSWORD || "").trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function bootstrapAdmin() {
  if (!ENABLED || !getKratosAdminBaseUrl()) return; // disabled or no Kratos (e.g. dev no-auth)

  // Kratos may still be starting when the API boots — retry the probe a few times.
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const existing = await kratosAdminRequest("admin/identities?per_page=1");
      if (Array.isArray(existing) && existing.length > 0) return; // not first boot — done

      const password = PASSWORD_ENV || crypto.randomBytes(12).toString("base64url");
      await kratosAdminRequest("admin/identities", {
        method: "POST",
        body: {
          schema_id: KRATOS_IDENTITY_SCHEMA_ID,
          state: "active",
          traits: { email: EMAIL },
          credentials: { password: { config: { password } } },
          metadata_public: { truss_admin: true },
        },
      });
      log.warn(
        { email: EMAIL, password: PASSWORD_ENV ? "(set via TRUSS_BOOTSTRAP_ADMIN_PASSWORD)" : password },
        "Default admin account created on first boot — log in and CHANGE THE PASSWORD (Settings → Account)."
      );
      return;
    } catch (err) {
      if (attempt === 10) { log.error({ err: err.message }, "bootstrap admin: giving up (Kratos unreachable?)"); return; }
      await sleep(3000);
    }
  }
}
