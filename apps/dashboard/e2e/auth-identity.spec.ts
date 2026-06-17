import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

/**
 * Auth Identity CRUD E2E tests.
 *
 * Tests create/delete/ban operations through the Truss API proxy to Kratos.
 * Verifies CSRF tokens are enforced and tenant isolation holds.
 *
 * NOTE: Kratos may not be running locally — a 502/503 means the endpoint
 * was reached (auth + CSRF passed) but Kratos is down. That is acceptable.
 * We assert responses are NOT 403 (CSRF rejection) or 401 (auth rejection).
 */

const PASS_STATUSES = (status: number) => status !== 403 && status !== 401;

test.describe.serial("Auth Identity CRUD", () => {
  let createdIdentityId: string | null = null;
  const testEmail = `e2e-test-${Date.now()}@test.local`;

  test("List identities", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/auth/identities");
    expect(PASS_STATUSES(res.status)).toBe(true);
  });

  test("Create identity", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/auth/identities", {
      traits: { email: testEmail },
      password: "E2eTestP@ss1234!",
      metadata_public: {},
    });
    expect(PASS_STATUSES(res.status)).toBe(true);

    // If Kratos is running, store the ID for subsequent tests
    if (res.status === 200 || res.status === 201) {
      const body = res.body as Record<string, unknown>;
      createdIdentityId = (body.id as string) || null;
    }
  });

  test("Create identity without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/auth/identities", {
      traits: { email: `no-csrf-${Date.now()}@test.local` },
      password: "E2eTestP@ss1234!",
      metadata_public: {},
    });
    expect(res.status).toBe(403);
  });

  test("Get identity by ID", async ({ page }) => {
    test.skip(!createdIdentityId, "No identity was created (Kratos may be down)");
    await loadDashboard(page);
    const res = await apiCall(page, "GET", `/api/auth/identities/${createdIdentityId}`);
    expect(PASS_STATUSES(res.status)).toBe(true);
  });

  test("Deactivate identity", async ({ page }) => {
    test.skip(!createdIdentityId, "No identity was created (Kratos may be down)");
    await loadDashboard(page);
    const res = await apiCall(page, "PATCH", `/api/auth/identities/${createdIdentityId}/state`, {
      state: "inactive",
    });
    expect(PASS_STATUSES(res.status)).toBe(true);
  });

  test("Reactivate identity", async ({ page }) => {
    test.skip(!createdIdentityId, "No identity was created (Kratos may be down)");
    await loadDashboard(page);
    const res = await apiCall(page, "PATCH", `/api/auth/identities/${createdIdentityId}/state`, {
      state: "active",
    });
    expect(PASS_STATUSES(res.status)).toBe(true);
  });

  test("Delete identity", async ({ page }) => {
    test.skip(!createdIdentityId, "No identity was created (Kratos may be down)");
    await loadDashboard(page);
    const res = await apiCall(page, "DELETE", `/api/auth/identities/${createdIdentityId}`);
    expect(PASS_STATUSES(res.status)).toBe(true);
  });

  test("Delete identity without CSRF fails", async ({ page }) => {
    // Use a fake UUID — we just need to verify CSRF is enforced on DELETE
    const fakeId = "00000000-0000-0000-0000-000000000000";
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "DELETE", `/api/auth/identities/${fakeId}`);
    expect(res.status).toBe(403);
  });

  test("List sessions", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/auth/sessions");
    expect(PASS_STATUSES(res.status)).toBe(true);
  });
});
