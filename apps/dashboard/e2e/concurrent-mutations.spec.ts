import { test, expect } from "@playwright/test";
import { loadDashboard, apiCall } from "./helpers";

test.describe.serial("Concurrent Mutations", () => {
  test("5 concurrent SQL queries all return 200", async ({ page }) => {
    await loadDashboard(page);

    const results = await page.evaluate(async () => {
      const csrf =
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("truss_csrf="))
          ?.split("=")[1] || "";
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          fetch("/api/sql/query", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf,
            },
            credentials: "include",
            body: JSON.stringify({ sql: `SELECT ${i + 1}` }),
          }).then((r) => r.status),
        ),
      );
      return results;
    });

    expect(results).toHaveLength(5);
    for (const status of results) {
      expect(status).toBe(200);
    }
  });

  test("rapid sequential mutations across endpoints return no 403", async ({
    page,
  }) => {
    await loadDashboard(page);

    // 1. SQL query
    const sqlResult = await apiCall(page, "POST", "/api/sql/query", {
      sql: "SELECT 1 AS cross_endpoint_test",
    });
    expect(sqlResult.status).toBe(200);

    // 2. Webhooks — create attempt (may 400 due to missing fields, but must not 403)
    const webhookResult = await apiCall(page, "POST", "/api/webhooks", {
      url: "https://example.com/hook",
      events: ["insert"],
      table_name: "nonexistent_test_table",
    });
    expect(webhookResult.status).not.toBe(403);

    // 3. Feature flags — create attempt (may 400/404, but must not 403)
    const flagResult = await apiCall(page, "POST", "/api/flags", {
      key: "test-concurrent-flag",
      enabled: false,
    });
    expect(flagResult.status).not.toBe(403);
  });

  test("tab switch during mutation does not cause CSRF error", async ({
    page,
  }) => {
    await loadDashboard(page);

    // Fire a mutation and immediately click a nav button
    const mutationPromise = apiCall(page, "POST", "/api/sql/query", {
      sql: "SELECT 1 AS tab_switch_test",
    });

    // Click a nav item while the mutation is in flight
    const navBtn = page
      .locator("button")
      .filter({ hasText: /^Database$/i })
      .first();
    await navBtn.click().catch(() => {});

    const result = await mutationPromise;
    // Should not be 403 CSRF error
    expect(result.status).not.toBe(403);

    // Verify no CSRF error appeared on the page
    const body = (await page.textContent("body")) || "";
    expect(body).not.toContain("CSRF token mismatch");
  });

  test("10 rapid sequential SQL queries all succeed", async ({ page }) => {
    await loadDashboard(page);

    const results = await page.evaluate(async () => {
      const csrf =
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("truss_csrf="))
          ?.split("=")[1] || "";
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) {
        const res = await fetch("/api/sql/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf,
          },
          credentials: "include",
          body: JSON.stringify({ sql: `SELECT ${i + 1} AS rapid_seq` }),
        });
        statuses.push(res.status);
      }
      return statuses;
    });

    expect(results).toHaveLength(10);
    for (const status of results) {
      // 200 = success, 429 = rate limited (acceptable). Must NOT be 403 (CSRF).
      expect(status).not.toBe(403);
      expect([200, 429]).toContain(status);
    }
  });
});
