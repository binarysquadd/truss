import express from "express";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketPolicyCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client, isValidBucketName, parseStorageError, getS3BaseUrl } from "../lib/s3.js";
import {
  MINIO_CONSOLE_URL,
  MINIO_REGION,
  MINIO_FORCE_PATH_STYLE,
  MINIO_S3_ENDPOINT,
  getPool,
} from "../lib/state.js";
import { ensureInternalSchema, upsertSettingsKey } from "../lib/internal.js";
import logger from "../lib/logger.js";
import { trackFeature } from "../lib/observability.js";

const log = logger.child({ module: "storage" });

export const router = express.Router();

// ─── Tenant scoping helpers ───

/** Return Set of bucket_name values owned by this tenant */
async function getTenantBuckets(tenantId) {
  const pool = getPool();
  if (!tenantId || !pool) return null; // null = no scoping (platform admin / no tenant)
  const result = await pool.query(
    `SELECT bucket_name FROM truss_internal.projects WHERE tenant_id = $1 AND status != 'deleted'`,
    [tenantId]
  );
  return new Set(result.rows.map((r) => r.bucket_name));
}

/** Returns true if the bucket belongs to the tenant (or no tenant is set) */
async function assertBucketOwnership(req, bucketName) {
  const tenantId = req.tenant?.id;
  if (!tenantId) return true; // no tenant context = platform admin, allow all
  const owned = await getTenantBuckets(tenantId);
  if (!owned) return false;
  return owned.has(bucketName);
}

// ─── List buckets ───

router.get("/api/storage/buckets", async (_req, res) => {
  try {
    const client = getS3Client();
    const ownedBuckets = await getTenantBuckets(_req.tenant?.id);
    const result = await client.send(new ListBucketsCommand({}));
    const buckets = (result.Buckets || [])
      .map((bucket) => ({
        name: bucket.Name || "",
        createdAt: bucket.CreationDate ? bucket.CreationDate.toISOString() : null,
      }))
      .filter((bucket) => Boolean(bucket.name))
      .filter((bucket) => !ownedBuckets || ownedBuckets.has(bucket.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({
      buckets,
      count: buckets.length,
      endpoint: getS3BaseUrl(),
      region: MINIO_REGION || "us-east-1",
      forcePathStyle: MINIO_FORCE_PATH_STYLE,
    });
  } catch (error) {
    log.error({ err: parseStorageError(error, "Failed to load buckets.") }, "failed to list buckets");
    return res.status(400).json({
      error: parseStorageError(error, "Failed to load buckets."),
    });
  }
});

// ─── Create bucket ───

router.post("/api/storage/buckets", async (req, res) => {
  const name = String(req.body?.name || "")
    .trim()
    .toLowerCase();
  if (!name) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!isValidBucketName(name)) {
    return res.status(400).json({
      error: "Invalid bucket name. Use lowercase letters, numbers, dots, and hyphens (3-63 chars).",
    });
  }
  // Tenant scoping: if tenant present, bucket must be registered to them in projects
  // (bucket creation for tenants is handled by project provisioning — direct creation
  // is only allowed for platform admins with no tenant context)
  if (req.tenant?.id) {
    return res.status(403).json({ error: "Buckets are created automatically when provisioning a project." });
  }
  try {
    const client = getS3Client();
    await client.send(new CreateBucketCommand({ Bucket: name }));
    log.info({ bucket: name }, "bucket created");
    return res.status(201).json({ ok: true, bucket: { name } });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to create bucket."),
    });
  }
});

// ─── Empty bucket helper ───

async function emptyBucket(client, bucketName) {
  let continuationToken = undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    const objects = listed.Contents || [];
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: objects
              .map((item) => ({ Key: item.Key || "" }))
              .filter((item) => Boolean(item.Key)),
            Quiet: true,
          },
        })
      );
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

// ─── Delete bucket ───

router.delete("/api/storage/buckets/:name", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const force = req.query.force === "true";
  if (!name) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    if (force) {
      await emptyBucket(client, name);
    }
    await client.send(new DeleteBucketCommand({ Bucket: name }));
    log.info({ bucket: name, force }, "bucket deleted");
    return res.json({ ok: true });
  } catch (error) {
    log.error({ bucket: name, err: parseStorageError(error, "unknown") }, "failed to delete bucket");
    return res.status(400).json({
      error: parseStorageError(
        error,
        "Failed to delete bucket. If bucket is not empty, retry with force=true."
      ),
    });
  }
});

// ─── List objects ───

router.get("/api/storage/buckets/:name/objects", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const prefix = String(req.query.prefix || "");
  const continuationToken = String(req.query.continuation_token || "");
  const maxKeysValue = Number(req.query.max_keys || 200);
  const maxKeys = Number.isFinite(maxKeysValue) ? Math.min(Math.max(maxKeysValue, 1), 1000) : 200;

  if (!name) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: name,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken || undefined,
        MaxKeys: maxKeys,
      })
    );
    const objects = (result.Contents || []).map((item) => ({
      key: item.Key || "",
      size: item.Size || 0,
      lastModified: item.LastModified ? item.LastModified.toISOString() : null,
      etag: item.ETag || null,
      storageClass: item.StorageClass || null,
    }));
    return res.json({
      bucket: name,
      prefix,
      objects,
      count: objects.length,
      isTruncated: Boolean(result.IsTruncated),
      continuationToken: result.NextContinuationToken || null,
    });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to list objects."),
    });
  }
});

// ─── Presign upload ───

router.post("/api/storage/buckets/:name/objects/presign-upload", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const contentType = String(req.body?.contentType || "application/octet-stream").trim();
  const requestedExpires = Number(req.body?.expiresIn || 900);
  const expiresIn = Number.isFinite(requestedExpires)
    ? Math.min(Math.max(requestedExpires, 60), 604800)
    : 900;

  if (!name || !key) {
    return res.status(400).json({ error: "Bucket and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {

    // Enforce per-file size limit (100MB)
    const maxSizeBytes = 100 * 1024 * 1024;
    if (req.body?.size && Number(req.body.size) > maxSizeBytes) {
      return res.status(400).json({ error: `File size exceeds maximum of ${maxSizeBytes / (1024 * 1024)}MB per file` });
    }

    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: name,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(client, command, { expiresIn });
    return res.json({
      method: "PUT",
      url,
      key,
      bucket: name,
      expiresIn,
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to create upload URL."),
    });
  }
});

// ─── Presign download ───

router.post("/api/storage/buckets/:name/objects/presign-download", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const requestedExpires = Number(req.body?.expiresIn || 900);
  const expiresIn = Number.isFinite(requestedExpires)
    ? Math.min(Math.max(requestedExpires, 60), 604800)
    : 900;

  if (!name || !key) {
    return res.status(400).json({ error: "Bucket and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const command = new GetObjectCommand({
      Bucket: name,
      Key: key,
    });
    const url = await getSignedUrl(client, command, { expiresIn });
    return res.json({
      method: "GET",
      url,
      key,
      bucket: name,
      expiresIn,
    });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to create download URL."),
    });
  }
});

// ─── Create folder (mkdir) ───

router.post("/api/storage/buckets/:name/objects/mkdir", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const prefix = String(req.body?.prefix || "").trim().replace(/\/+$/, "");
  if (!name || !prefix) {
    return res.status(400).json({ error: "Bucket name and prefix are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  const key = `${prefix}/.keep`;
  try {
    const client = getS3Client();
    await client.send(new PutObjectCommand({
      Bucket: name,
      Key: key,
      Body: "",
      ContentType: "application/x-directory",
    }));
    return res.status(201).json({ ok: true, key, bucket: name });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to create folder.") });
  }
});

// ─── Bulk delete objects ───

router.post("/api/storage/buckets/:name/objects/bulk-delete", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.map((k) => String(k)).filter(Boolean) : [];
  if (!name || keys.length === 0) {
    return res.status(400).json({ error: "Bucket name and non-empty keys array are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  if (keys.length > 1000) {
    return res.status(400).json({ error: "Maximum 1000 keys per bulk delete." });
  }
  try {
    const client = getS3Client();
    const result = await client.send(new DeleteObjectsCommand({
      Bucket: name,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
    }));
    const deleted = (result.Deleted || []).map((d) => d.Key);
    const errored = (result.Errors || []).map((e) => ({ key: e.Key, error: e.Message }));
    log.info({ bucket: name, deletedCount: deleted.length, errorCount: errored.length }, "bulk delete completed");
    return res.json({ deleted: deleted.length, errors: errored.length, deletedKeys: deleted, errorDetails: errored });
  } catch (error) {
    log.error({ bucket: name, err: parseStorageError(error, "unknown") }, "bulk delete failed");
    return res.status(400).json({ error: parseStorageError(error, "Failed to bulk delete objects.") });
  }
});

// ─── URL diagnostics ───

router.post("/api/storage/buckets/:name/objects/url-diagnostics", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const expiresIn = 900;
  if (!name || !key) {
    return res.status(400).json({ error: "Bucket name and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const command = new GetObjectCommand({ Bucket: name, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn });
    const parsed = new URL(url);
    const configuredEndpoint = MINIO_S3_ENDPOINT
      ? new URL(MINIO_S3_ENDPOINT.startsWith("http") ? MINIO_S3_ENDPOINT : `https://${MINIO_S3_ENDPOINT}`)
      : null;
    const hostMatch = configuredEndpoint ? parsed.hostname === configuredEndpoint.hostname : null;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return res.json({
      url,
      key,
      bucket: name,
      expiresIn,
      expiresAt,
      signedHost: parsed.hostname,
      configuredHost: configuredEndpoint?.hostname || null,
      hostMatch,
      curlCommand: `curl -o "${key.split("/").pop()}" "${url}"`,
      warnings: [
        ...(!hostMatch && hostMatch !== null ? [`Host mismatch: signed URL uses ${parsed.hostname} but MINIO_S3_ENDPOINT is ${configuredEndpoint?.hostname}. Browser uploads will fail.`] : []),
        ...(parsed.protocol === "http:" ? ["URL uses HTTP. Browsers may block mixed-content requests from HTTPS pages."] : []),
      ],
    });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to generate signed URL.") });
  }
});

// ─── Upload text content ───

router.post("/api/storage/buckets/:name/objects/upload-text", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const contentType = String(req.body?.contentType || "text/plain; charset=utf-8").trim();
  if (!name || !key) {
    return res.status(400).json({ error: "Bucket and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {

    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: name,
        Key: key,
        Body: content,
        ContentType: contentType,
      })
    );
    log.info({ bucket: name, key }, "object uploaded");
    trackFeature(req.tenant?.id || null, "storage", "upload");
    return res.status(201).json({ ok: true, key, bucket: name });
  } catch (error) {
    log.error({ bucket: name, key, err: parseStorageError(error, "unknown") }, "failed to upload object");
    return res.status(400).json({
      error: parseStorageError(error, "Failed to upload object."),
    });
  }
});

// ─── Delete single object ───

router.delete("/api/storage/buckets/:name/objects", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  if (!name || !key) {
    return res.status(400).json({ error: "Bucket and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: name,
        Key: key,
      })
    );
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to delete object."),
    });
  }
});

// ─── Object metadata: GET ───

router.get("/api/storage/buckets/:name/objects/metadata", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.query.key || "").trim();
  if (!name || !key) {
    return res.status(400).json({ error: "Bucket name and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const head = await client.send(new HeadObjectCommand({ Bucket: name, Key: key }));
    return res.json({
      contentType: head.ContentType || "",
      contentLength: head.ContentLength || 0,
      cacheControl: head.CacheControl || "",
      contentDisposition: head.ContentDisposition || "",
      contentEncoding: head.ContentEncoding || "",
      eTag: head.ETag || "",
      lastModified: head.LastModified || null,
      metadata: head.Metadata || {},
    });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to get object metadata.") });
  }
});

// ─── Object metadata: PATCH (copy-in-place with new metadata) ───

router.patch("/api/storage/buckets/:name/objects/metadata", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  if (!name || !key) {
    return res.status(400).json({ error: "Bucket name and key are required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const params = {
      Bucket: name,
      Key: key,
      CopySource: `${name}/${key}`,
      MetadataDirective: "REPLACE",
      ContentType: req.body?.contentType || undefined,
      CacheControl: req.body?.cacheControl || undefined,
      ContentDisposition: req.body?.contentDisposition || undefined,
      Metadata: req.body?.metadata || undefined,
    };
    // Remove undefined keys
    Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
    await client.send(new CopyObjectCommand(params));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to update object metadata.") });
  }
});

// ─── Bucket policy: GET ───

router.get("/api/storage/buckets/:name/policy", async (req, res) => {
  const name = String(req.params.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    const result = await client.send(new GetBucketPolicyCommand({ Bucket: name }));
    let policy = null;
    if (typeof result.Policy === "string" && result.Policy.trim()) {
      try {
        policy = JSON.parse(result.Policy);
      } catch {
        policy = result.Policy;
      }
    }
    return res.json({ bucket: name, policy });
  } catch (error) {
    const message = parseStorageError(error, "Failed to load bucket policy.");
    if (message.toLowerCase().includes("nosuchbucketpolicy")) {
      return res.json({ bucket: name, policy: null });
    }
    return res.status(400).json({ error: message });
  }
});

// ─── Bucket policy: PUT ───

router.put("/api/storage/buckets/:name/policy", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const policy = req.body?.policy;
  if (!name) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!policy || typeof policy !== "object") {
    return res.status(400).json({ error: "policy object is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const client = getS3Client();
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: name,
        Policy: JSON.stringify(policy),
      })
    );
    return res.json({ ok: true, bucket: name });
  } catch (error) {
    return res.status(400).json({
      error: parseStorageError(error, "Failed to set bucket policy."),
    });
  }
});

// ─── CORS config per bucket — stored in truss_internal.billing_config ───

router.get("/api/storage/buckets/:name/cors", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const pool = getPool();
  if (!name || !pool) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    await ensureInternalSchema();
    const configKey = `cors_${name}`;
    const tenantId = req.tenant?.id || null;
    const result = tenantId
      ? await pool.query(`select value from truss_internal.billing_config where key = $1 and (tenant_id = $2 OR tenant_id IS NULL) order by tenant_id nulls last limit 1`, [configKey, tenantId])
      : await pool.query(`select value from truss_internal.billing_config where key = $1 and tenant_id IS NULL`, [configKey]);
    const raw = result.rows[0]?.value;
    const cors = raw ? JSON.parse(raw) : { allowedOrigins: ["*"], allowedMethods: ["GET", "HEAD"], allowedHeaders: ["*"], maxAge: 3600 };
    return res.json({ bucket: name, cors });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load CORS config." });
  }
});

router.put("/api/storage/buckets/:name/cors", async (req, res) => {
  const name = String(req.params.name || "").trim();
  const pool = getPool();
  if (!name || !pool) {
    return res.status(400).json({ error: "Bucket name is required." });
  }
  if (!(await assertBucketOwnership(req, name))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  const cors = req.body?.cors;
  if (!cors || typeof cors !== "object") {
    return res.status(400).json({ error: "cors object is required." });
  }
  try {
    await ensureInternalSchema();
    const configKey = `cors_${name}`;
    const tenantId = req.tenant?.id || null;
    await upsertSettingsKey(configKey, JSON.stringify(cors), tenantId);
    return res.json({ ok: true, bucket: name });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save CORS config." });
  }
});

// ─── Feature: Multipart upload ───

router.post("/api/storage/buckets/:name/objects/multipart/init", async (req, res) => {
  const bucket = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const contentType = req.body?.contentType || "application/octet-stream";
  if (!bucket || !key) return res.status(400).json({ error: "Bucket and key are required." });
  if (!(await assertBucketOwnership(req, bucket))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {

    const { CreateMultipartUploadCommand } = await import("@aws-sdk/client-s3");
    const client = getS3Client();
    const result = await client.send(new CreateMultipartUploadCommand({
      Bucket: bucket, Key: key, ContentType: contentType,
    }));
    return res.json({ uploadId: result.UploadId, bucket, key });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to init multipart upload.") });
  }
});

router.post("/api/storage/buckets/:name/objects/multipart/presign-part", async (req, res) => {
  const bucket = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  const partNumber = Number(req.body?.partNumber || 0);
  if (!bucket || !key || !uploadId || !partNumber) {
    return res.status(400).json({ error: "bucket, key, uploadId, and partNumber are required." });
  }
  if (!(await assertBucketOwnership(req, bucket))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const { UploadPartCommand } = await import("@aws-sdk/client-s3");
    const client = getS3Client();
    const command = new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    const url = await getSignedUrl(client, command, { expiresIn: 3600 });
    return res.json({ url, partNumber });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to presign part.") });
  }
});

router.post("/api/storage/buckets/:name/objects/multipart/complete", async (req, res) => {
  const bucket = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
  if (!bucket || !key || !uploadId || parts.length === 0) {
    return res.status(400).json({ error: "bucket, key, uploadId, and parts are required." });
  }
  if (!(await assertBucketOwnership(req, bucket))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const { CompleteMultipartUploadCommand } = await import("@aws-sdk/client-s3");
    const client = getS3Client();
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }));
    return res.json({ ok: true, bucket, key });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to complete multipart upload.") });
  }
});

router.post("/api/storage/buckets/:name/objects/multipart/abort", async (req, res) => {
  const bucket = String(req.params.name || "").trim();
  const key = String(req.body?.key || "").trim();
  const uploadId = String(req.body?.uploadId || "").trim();
  if (!bucket || !key || !uploadId) return res.status(400).json({ error: "bucket, key, and uploadId are required." });
  if (!(await assertBucketOwnership(req, bucket))) {
    return res.status(403).json({ error: "Bucket not found or access denied." });
  }
  try {
    const { AbortMultipartUploadCommand } = await import("@aws-sdk/client-s3");
    const client = getS3Client();
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: parseStorageError(error, "Failed to abort multipart upload.") });
  }
});
