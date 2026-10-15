import { S3Client } from "@aws-sdk/client-s3";
import {
  STORAGE_S3_ENDPOINT, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY,
  STORAGE_REGION, STORAGE_FORCE_PATH_STYLE,
  getS3ClientInstance, setS3ClientInstance,
} from "./state.js";

export function getS3BaseUrl() {
  if (!STORAGE_S3_ENDPOINT) return "";
  if (/^https?:\/\//i.test(STORAGE_S3_ENDPOINT)) return STORAGE_S3_ENDPOINT;
  return `http://${STORAGE_S3_ENDPOINT}`;
}

export function getS3Client() {
  const endpoint = getS3BaseUrl();
  if (!endpoint || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
    throw new Error("Storage is not configured. Set STORAGE_S3_ENDPOINT, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY.");
  }
  const existing = getS3ClientInstance();
  if (existing) return existing;
  const client = new S3Client({
    region: STORAGE_REGION || "us-east-1",
    endpoint,
    forcePathStyle: STORAGE_FORCE_PATH_STYLE,
    credentials: { accessKeyId: STORAGE_ACCESS_KEY, secretAccessKey: STORAGE_SECRET_KEY },
  });
  setS3ClientInstance(client);
  return client;
}

export function isValidBucketName(name) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) return false;
  if (name.includes("..") || name.includes(".-") || name.includes("-.")) return false;
  return true;
}

export function parseStorageError(error, fallback) {
  if (!error) return fallback;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
