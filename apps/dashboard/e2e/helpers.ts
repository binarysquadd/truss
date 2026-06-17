import { type Page, expect } from "@playwright/test";

/**
 * Shared E2E test helpers for Truss Dashboard.
 *
 * In local dev (AUTH_REQUIRED=false), the dashboard auto-provisions
 * an admin tenant — there is no login gate. Tests start with
 * the dashboard already loaded.
 */

/** Navigate to root and wait for the dashboard to fully load. */
export async function loadDashboard(page: Page) {
  await page.goto("/");
  // Wait for nav buttons to appear (dashboard is loaded)
  await page.waitForFunction(
    () => document.querySelectorAll("button").length > 5,
    { timeout: 15_000 },
  );
  // Small extra wait for React to settle
  await page.waitForTimeout(500);
}

// Platform tabs that may be under a collapsible group
const PLATFORM_LABELS = ["api", "permissions", "realtime", "webhooks", "search", "oauth2", "routes", "feature flags"];

/** Click a Pane A navigation item by its visible text label. */
export async function navigateTo(page: Page, label: string) {
  // If it's a Platform tab, ensure the Platform group is expanded
  if (PLATFORM_LABELS.includes(label.toLowerCase())) {
    const targetBtn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
    // Only expand Platform if the target button isn't already visible
    if (!await targetBtn.isVisible().catch(() => false)) {
      const platformBtn = page.locator("button").filter({ hasText: /^Platform$/i }).first();
      if (await platformBtn.isVisible().catch(() => false)) {
        await platformBtn.click();
        await page.waitForTimeout(300);
      }
    }
  }

  // Find the nav button by its text content
  const btn = page.locator("button").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
  await btn.click({ timeout: 5_000 });
  await page.waitForTimeout(500);
}

/** Assert the current page is NOT showing demo data. */
export async function assertNotDemo(page: Page) {
  const url = page.url();
  expect(url).not.toContain("/demo");
  const body = await page.textContent("body");
  expect(body).not.toContain("demo@truss.dev");
}

/** Assert no CSRF, 403 errors, or React crashes visible on page. */
export async function assertNoErrors(page: Page) {
  const body = await page.textContent("body") || "";
  expect(body).not.toContain("CSRF token mismatch");
  expect(body).not.toContain("\"error\":\"CSRF");
  expect(body).not.toContain("Something went wrong");
  expect(body).not.toContain("Rendered more hooks");
}

/** Make an authenticated API call from the browser context with CSRF. */
export async function apiCall(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const csrf =
        document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("truss_csrf="))
          ?.split("=")[1] || "";
      const opts: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        credentials: "include",
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      const json = await res.json().catch(() => null);
      return { status: res.status, body: json };
    },
    { method, path, body },
  );
}

/** Make a raw API call WITHOUT CSRF token (for testing rejection). */
export async function apiCallNoCsrf(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      };
      if (body !== undefined) opts.body = JSON.stringify(body);
      const res = await fetch(path, opts);
      const json = await res.json().catch(() => null);
      return { status: res.status, body: json };
    },
    { method, path, body },
  );
}
