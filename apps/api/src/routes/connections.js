import express from "express";
import crypto from "crypto";
import { getPool } from "../lib/state.js";
import { ensureInternalSchema } from "../lib/internal.js";
import logger from "../lib/logger.js";

const log = logger.child({ module: "connections" });

const isProd = process.env.NODE_ENV === "production";

export const router = express.Router();

// ─── Encryption helpers for connection URLs ───

const ALGORITHM = "aes-256-gcm";
// Fixed app-specific salt for scrypt key derivation. Changing this value (or the
// KDF below) invalidates ALL previously-encrypted ciphertext — they will fail to
// decrypt. Acceptable pre-1.0 because decryptValue falls back to legacy-plaintext
// passthrough and self-hosters generally have no saved-connection data yet.
const KEY_SALT = "truss-connection-encryption-v1";

let _encryptionKeyWarned = false;
function getEncryptionKey() {
  if (!process.env.ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production. Set a 32+ character random string.");
    }
    if (!_encryptionKeyWarned) {
      log.warn("ENCRYPTION_KEY not set — falling back to DATABASE_URL hash. Set ENCRYPTION_KEY for production use.");
      _encryptionKeyWarned = true;
    }
  }
  const source = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || "";
  // scrypt is a memory-hard KDF: it makes brute-forcing a low-entropy
  // ENCRYPTION_KEY far more expensive than an unsalted single SHA-256 hash.
  // NOTE: changing the KDF or KEY_SALT invalidates previously-encrypted values.
  return crypto.scryptSync(source, KEY_SALT, 32);
}

export function encryptValue(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + tag + ":" + encrypted;
}

export function decryptValue(encrypted) {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) return encrypted; // not encrypted (legacy plaintext)
  const [ivHex, tagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function maskConnectionUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^@/]+)@/, ":***@");
  }
}

// ─── GET /api/connections — list saved connections for current tenant ───

router.get("/api/connections", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();
    const result = await getPool().query(
      `SELECT id, name, connection_url, created_at
       FROM truss_internal.saved_connections
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    const connections = result.rows.map((row) => ({
      ...row,
      connection_url: maskConnectionUrl(decryptValue(row.connection_url)),
    }));
    return res.json({ connections });
  } catch (error) {
    log.error({ err: error.message }, "failed to list connections");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : error.message });
  }
});

// ─── POST /api/connections — save a new connection ───

router.post("/api/connections", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  const name = (req.body?.name || "").trim();
  const connectionUrl = (req.body?.connection_url || "").trim();

  if (!name) return res.status(400).json({ error: "name is required." });
  if (!connectionUrl) return res.status(400).json({ error: "connection_url is required." });

  try {
    await ensureInternalSchema();
    const encryptedUrl = encryptValue(connectionUrl);
    const result = await getPool().query(
      `INSERT INTO truss_internal.saved_connections (tenant_id, name, connection_url)
       VALUES ($1, $2, $3)
       RETURNING id, name, connection_url, created_at`,
      [tenantId, name, encryptedUrl]
    );
    const row = result.rows[0];
    row.connection_url = maskConnectionUrl(connectionUrl);
    log.info({ connectionId: row.id, name }, "connection profile saved");
    return res.status(201).json(row);
  } catch (error) {
    // Unique constraint violation (duplicate name for tenant)
    if (error.code === "23505") {
      log.warn({ name }, "duplicate connection name");
      return res.status(409).json({ error: `A connection named "${name}" already exists.` });
    }
    log.error({ err: error.message }, "failed to save connection");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : error.message });
  }
});

// ─── DELETE /api/connections/:id — delete a saved connection ───

router.delete("/api/connections/:id", async (req, res) => {
  if (!getPool()) return res.status(500).json({ error: "DATABASE_URL is not set." });
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Unauthorized." });

  try {
    await ensureInternalSchema();
    const result = await getPool().query(
      `DELETE FROM truss_internal.saved_connections
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [req.params.id, tenantId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Connection not found." });
    }
    log.info({ connectionId: req.params.id }, "connection profile deleted");
    return res.json({ ok: true });
  } catch (error) {
    log.error({ connectionId: req.params.id, err: error.message }, "failed to delete connection");
    return res.status(500).json({ error: isProd ? "An internal error occurred" : error.message });
  }
});
