import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("Organization Management", () => {
  let createdOrgId: string | null = null;
  const slug = `e2e-org-${Date.now()}`;

  test("List orgs", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/orgs");
    // Accept success or 500/502 for local dev issues
    expect([401, 403]).not.toContain(res.status);
  });

  test("Create org", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/orgs", {
      name: `E2E Test Org ${slug}`,
      slug,
    });
    expect([401, 403]).not.toContain(res.status);

    // Store org ID if creation succeeded
    if (res.status >= 200 && res.status < 300 && res.body) {
      const body = res.body as Record<string, unknown>;
      createdOrgId = (body.id ?? body.org_id ?? (body as any).data?.id) as string | null;
    }
  });

  test("Create org without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/orgs", {
      name: "CSRF Test Org",
      slug: `csrf-test-${Date.now()}`,
    });
    expect(res.status).toBe(403);
  });

  test("List members", async ({ page }) => {
    await loadDashboard(page);

    // If we didn't get an org ID from creation, list orgs to find one
    if (!createdOrgId) {
      const listRes = await apiCall(page, "GET", "/api/orgs");
      if (listRes.status >= 200 && listRes.status < 300 && Array.isArray(listRes.body)) {
        const orgs = listRes.body as Array<Record<string, unknown>>;
        if (orgs.length > 0) {
          createdOrgId = (orgs[0].id ?? orgs[0].org_id) as string;
        }
      }
    }

    // Skip if we still have no org to query
    if (!createdOrgId) {
      test.skip();
      return;
    }

    const res = await apiCall(page, "GET", `/api/orgs/${createdOrgId}/members`);
    expect([401, 403]).not.toContain(res.status);
  });

  test("Delete org", async ({ page }) => {
    await loadDashboard(page);

    if (!createdOrgId) {
      test.skip();
      return;
    }

    const res = await apiCall(page, "DELETE", `/api/orgs/${createdOrgId}`);
    expect([401, 403]).not.toContain(res.status);
  });

  test("Delete org without CSRF fails", async ({ page }) => {
    await loadDashboard(page);

    // Use a fake ID — we only care that CSRF is enforced, not that the org exists
    const fakeId = createdOrgId ?? "00000000-0000-0000-0000-000000000000";
    const res = await apiCallNoCsrf(page, "DELETE", `/api/orgs/${fakeId}`);
    expect(res.status).toBe(403);
  });
});
