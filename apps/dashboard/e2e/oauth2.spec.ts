import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

const CLIENT_BODY = {
  client_name: "e2e-test-client",
  grant_types: ["authorization_code"],
  redirect_uris: ["https://example.com/callback"],
  response_types: ["code"],
  scope: "openid",
};

/** 502/503 means Hydra isn't running locally — not a test failure. */
function isServiceDown(status: number) {
  return status === 502 || status === 503;
}

test.describe.serial("OAuth2 Clients", () => {
  let createdClientId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loadDashboard(page);
    await page.close();
  });

  test("List clients", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "GET", "/api/hydra/clients");
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("Create client", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCall(page, "POST", "/api/hydra/clients", CLIENT_BODY);
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);

    // Store the created client ID for subsequent tests
    const body = res.body as Record<string, unknown> | null;
    if (body && typeof body === "object" && "client_id" in body) {
      createdClientId = body.client_id as string;
    }
  });

  test("Create client without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    const res = await apiCallNoCsrf(page, "POST", "/api/hydra/clients", CLIENT_BODY);
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).toBe(403);
  });

  test("Get client by ID", async ({ page }) => {
    if (!createdClientId) {
      test.skip(true, "No client was created — skipping get-by-ID");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(page, "GET", `/api/hydra/clients/${createdClientId}`);
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("Delete client", async ({ page }) => {
    if (!createdClientId) {
      test.skip(true, "No client was created — skipping delete");
      return;
    }
    await loadDashboard(page);
    const res = await apiCall(page, "DELETE", `/api/hydra/clients/${createdClientId}`);
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("Delete client without CSRF fails", async ({ page }) => {
    await loadDashboard(page);
    // Use a fake ID — we only care that CSRF is enforced, not that the client exists
    const fakeId = createdClientId || "nonexistent-client-id";
    const res = await apiCallNoCsrf(page, "DELETE", `/api/hydra/clients/${fakeId}`);
    if (isServiceDown(res.status)) {
      test.skip(true, "Hydra not running (502/503)");
      return;
    }
    expect(res.status).toBe(403);
  });
});
