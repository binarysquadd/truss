/**
 * Unit tests for pure config helpers. No server, no DB, no network.
 * These also serve as regression tests for two production bugs:
 *   - flagd URL dropped its port when the host carried a scheme (connected:false)
 *   - session cookie forced Secure over plain HTTP (login never stuck)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFlagdUrl, decideCookieSecure } from "../../src/lib/config-helpers.js";

describe("buildFlagdUrl", () => {
  it("bare host gets scheme + port", () => {
    assert.equal(buildFlagdUrl("flagd", "8013"), "http://flagd:8013");
  });

  it("defaults like localhost get the port too", () => {
    assert.equal(buildFlagdUrl("localhost", "8013"), "http://localhost:8013");
  });

  // Regression: FLAGD_HOST=http://flagd previously resolved to :80 (port dropped).
  it("scheme-prefixed host still gets the port appended", () => {
    assert.equal(buildFlagdUrl("http://flagd", "8013"), "http://flagd:8013");
  });

  it("keeps an explicit port on the host", () => {
    assert.equal(buildFlagdUrl("http://flagd:9000", "8013"), "http://flagd:9000");
  });

  it("an explicit FLAGD_URL wins over host/port", () => {
    assert.equal(buildFlagdUrl("flagd", "8013", "http://override:1234"), "http://override:1234");
  });

  it("no port configured leaves the host as-is", () => {
    assert.equal(buildFlagdUrl("flagd", ""), "http://flagd");
  });
});

describe("decideCookieSecure", () => {
  // Regression: NODE_ENV=production forced Secure even on http://localhost.
  it("http public URL is not Secure even in production", () => {
    assert.equal(decideCookieSecure({ cookieSecureEnv: "", publicUrl: "http://localhost:3000", isProduction: true }), false);
  });

  it("https public URL is Secure", () => {
    assert.equal(decideCookieSecure({ cookieSecureEnv: "", publicUrl: "https://app.example.com", isProduction: false }), true);
  });

  it("explicit COOKIE_SECURE=true overrides everything", () => {
    assert.equal(decideCookieSecure({ cookieSecureEnv: "true", publicUrl: "http://localhost:3000", isProduction: false }), true);
  });

  it("explicit COOKIE_SECURE=false overrides an https URL", () => {
    assert.equal(decideCookieSecure({ cookieSecureEnv: "false", publicUrl: "https://app.example.com", isProduction: true }), false);
  });

  it("falls back to NODE_ENV when no public URL is set", () => {
    assert.equal(decideCookieSecure({ cookieSecureEnv: "", publicUrl: "", isProduction: true }), true);
    assert.equal(decideCookieSecure({ cookieSecureEnv: "", publicUrl: "", isProduction: false }), false);
  });
});
