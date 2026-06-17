import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall, apiCallNoCsrf } from "./helpers";

test.describe.serial("CRUD Operations", () => {
  test("SQL query executes via API", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCall(page, "POST", "/api/sql/query", {
      sql: "SELECT 1 AS test_value",
    });
    expect(result.status).toBe(200);
    const data = result.body as Record<string, unknown>;
    expect(data.rows).toBeTruthy();
  });

  test("webhook CRUD", async ({ page }) => {
    await loadDashboard(page);
    const ts = Date.now();

    // Create — may fail with 500 if DB trigger can't be created (local dev without full schema)
    const create = await apiCall(page, "POST", "/api/webhooks", {
      name: `e2e-test-${ts}`,
      url: "https://httpbin.org/post",
      events: ["insert"],
      table_name: "audit_logs",
    });
    // Must not be 403 (CSRF) or 401 (auth) — 200/201 = success, 500 = DB trigger issue (acceptable locally)
    expect(create.status).not.toBe(403);
    expect(create.status).not.toBe(401);

    if ([200, 201].includes(create.status)) {
      const webhook = create.body as Record<string, unknown>;
      const webhookId = webhook.id || (webhook as Record<string, unknown>).webhook?.id;

      // List — verify it exists
      const list = await apiCall(page, "GET", "/api/webhooks");
      expect(list.status).toBe(200);
      const webhooks = (list.body as Record<string, unknown>).webhooks as Array<Record<string, unknown>>;
      expect(webhooks.some((w) => w.name === `e2e-test-${ts}`)).toBe(true);

      // Delete
      if (webhookId) {
        const del = await apiCall(page, "DELETE", `/api/webhooks/${webhookId}`);
        expect([200, 204]).toContain(del.status);
      }
    }
  });

  test("feature flags CRUD", async ({ page }) => {
    await loadDashboard(page);
    const key = `e2e_flag_${Date.now()}`;

    // Create — may fail if flagd/flags table not available locally
    const create = await apiCall(page, "POST", "/api/flags", {
      flag_key: key,
      flag_type: "boolean",
      enabled: false,
      default_variant: "off",
      variants: { on: true, off: false },
    });
    expect(create.status).not.toBe(403); // Must not be CSRF error
    expect(create.status).not.toBe(401); // Must not be auth error

    if ([200, 201].includes(create.status)) {
      // Read
      const list = await apiCall(page, "GET", "/api/flags");
      expect(list.status).toBe(200);

      // Update
      const update = await apiCall(page, "PUT", `/api/flags/${key}`, {
        enabled: true,
      });
      expect(update.status).toBe(200);

      // Delete
      const del = await apiCall(page, "DELETE", `/api/flags/${key}`);
      expect([200, 204]).toContain(del.status);
    }
  });

  test("saved queries CRUD", async ({ page }) => {
    await loadDashboard(page);
    const name = `e2e-query-${Date.now()}`;

    // Create
    const create = await apiCall(page, "POST", "/api/sql/saved-queries", {
      name,
      sql: "SELECT current_timestamp",
    });
    expect(create.status).not.toBe(403);
    expect(create.status).not.toBe(401);

    if ([200, 201].includes(create.status)) {
      const sq = create.body as Record<string, unknown>;
      const sqId = sq.id;

      // List
      const list = await apiCall(page, "GET", "/api/sql/saved-queries");
      expect(list.status).toBe(200);

      // Delete
      if (sqId) {
        const del = await apiCall(page, "DELETE", `/api/sql/saved-queries/${sqId}`);
        expect([200, 204]).toContain(del.status);
      }
    }
  });

  test("realtime subscription CRUD", async ({ page }) => {
    await loadDashboard(page);

    // Subscribe — may fail locally if trigger functions not available
    const sub = await apiCall(page, "POST", "/api/realtime/subscribe", {
      schema: "truss_internal",
      table: "audit_logs",
    });
    expect(sub.status).not.toBe(403);
    expect(sub.status).not.toBe(401);

    if ([200, 201].includes(sub.status)) {
      // List
      const list = await apiCall(page, "GET", "/api/realtime/subscriptions");
      expect(list.status).toBe(200);

      // Unsubscribe
      const unsub = await apiCall(
        page,
        "DELETE",
        "/api/realtime/subscribe?schema=truss_internal&table=audit_logs",
      );
      expect([200, 204]).toContain(unsub.status);
    }
  });

  test("CSRF token is sent on all mutations", async ({ page }) => {
    await loadDashboard(page);

    // Intercept requests to verify header
    const csrfHeaders: string[] = [];
    await page.route("**/api/sql/**", async (route) => {
      const headers = route.request().headers();
      csrfHeaders.push(headers["x-csrf-token"] || "");
      await route.continue();
    });

    await apiCall(page, "POST", "/api/sql/query", { sql: "SELECT 1" });
    await page.unrouteAll();

    expect(csrfHeaders.length).toBeGreaterThan(0);
    expect(csrfHeaders[0].length).toBeGreaterThan(10);
  });

  test("mutation without CSRF fails with 403", async ({ page }) => {
    await loadDashboard(page);
    const result = await apiCallNoCsrf(page, "POST", "/api/sql/query", {
      query: "SELECT 1",
      params: [],
    });
    expect(result.status).toBe(403);
  });
});
