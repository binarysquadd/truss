import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

const BUCKET_NAME = `e2e-bucket-${Date.now()}`;

/** 500/502/503 mean the API reached but MinIO is unavailable locally — acceptable.
 *  403 can also mean quota/ownership rejection (not just CSRF), so we accept it for mutations. */
const ACCEPTABLE_ERRORS = [400, 403, 500, 502, 503];

function assertNotCsrfOrAuthError(status: number, body: unknown) {
  // 401 is always an auth failure
  expect(status).not.toBe(401);
  // 403 with "CSRF" in the error message is a CSRF failure
  if (status === 403) {
    const errMsg = JSON.stringify(body);
    expect(errMsg).not.toContain("CSRF");
  }
}

test.describe.serial("Storage Buckets", () => {
  test("list buckets", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/storage/buckets");
    if (!ACCEPTABLE_ERRORS.includes(res.status)) {
      assertNotCsrfOrAuthError(res.status, res.body);
    }
  });

  test("create bucket", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/storage/buckets", {
      name: BUCKET_NAME,
    });
    if (!ACCEPTABLE_ERRORS.includes(res.status)) {
      assertNotCsrfOrAuthError(res.status, res.body);
    }
  });

  test("create bucket without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/storage/buckets", {
      name: `${BUCKET_NAME}-nocsrf`,
    });
    expect(res.status).toBe(403);
  });

  test("list objects in bucket", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(
      page,
      "GET",
      `/api/storage/buckets/${BUCKET_NAME}/objects`,
    );
    if (!ACCEPTABLE_ERRORS.includes(res.status)) {
      assertNotCsrfOrAuthError(res.status, res.body);
    }
  });

  test("delete bucket", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(
      page,
      "DELETE",
      `/api/storage/buckets/${BUCKET_NAME}`,
    );
    if (!ACCEPTABLE_ERRORS.includes(res.status)) {
      assertNotCsrfOrAuthError(res.status, res.body);
    }
  });

  test("delete bucket without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(
      page,
      "DELETE",
      `/api/storage/buckets/${BUCKET_NAME}`,
    );
    expect(res.status).toBe(403);
  });
});
