/**
 * Cache / KV (Valkey) integration smoke tests.
 * Runs against a live API with a reachable Valkey. Dev mode (auth off) gives
 * admin access for the write paths; the demo tenant is used to prove the
 * admin gate on flush.
 */
import { describe, it, after } from "node:test";
import { api, demoApi, assertStatus, assert } from "./helpers.js";

const KEY = "test:cache:smoke";

describe("Cache / KV — status + info", () => {
  it("GET /api/cache/status — reports configured + ok", async () => {
    const res = await api("/api/cache/status");
    assertStatus(res, 200, "cache status");
    assert(res.data.configured === true, "should be configured");
    assert(res.data.ok === true, "Valkey should be reachable in the test stack");
  });

  it("GET /api/cache/info — returns parsed INFO sections", async () => {
    const res = await api("/api/cache/info");
    assertStatus(res, 200, "cache info");
    assert(res.data.ok === true && typeof res.data.info === "object", "should return info sections");
  });
});

describe("Cache / KV — key lifecycle", () => {
  it("PUT /api/cache/keys/:key — sets a string with ttl", async () => {
    const res = await api(`/api/cache/keys/${KEY}`, { method: "PUT", json: { value: "hello", ttl: 60 } });
    assertStatus(res, 200, "set key");
    assert(res.data.ok === true, "set should succeed");
  });

  it("GET /api/cache/keys/:key — reads it back with ttl + type", async () => {
    const res = await api(`/api/cache/keys/${KEY}`);
    assertStatus(res, 200, "get key");
    assert(res.data.value === "hello", "value round-trips");
    assert(res.data.type === "string", "type is string");
    assert(Number(res.data.ttl) > 0, "ttl is positive");
  });

  it("GET /api/cache/keys — scan finds the key by pattern", async () => {
    const res = await api(`/api/cache/keys?pattern=test:cache:*`);
    assertStatus(res, 200, "scan");
    assert(Array.isArray(res.data.keys), "keys is an array");
    assert(res.data.keys.some((k) => k.key === KEY), "scan includes our key");
  });

  it("PUT without a value — rejected 400", async () => {
    const res = await api(`/api/cache/keys/${KEY}:novalue`, { method: "PUT", json: {} });
    assertStatus(res, 400, "missing value");
  });

  it("DELETE /api/cache/keys/:key — removes it", async () => {
    const res = await api(`/api/cache/keys/${KEY}`, { method: "DELETE" });
    assertStatus(res, 200, "delete key");
    const after = await api(`/api/cache/keys/${KEY}`);
    assertStatus(after, 404, "gone after delete");
  });
});

describe("Cache / KV — admin gate", () => {
  it("POST /api/cache/flush — blocked for a non-admin (demo) tenant", async () => {
    const res = await demoApi("/api/cache/flush", { method: "POST" });
    assertStatus(res, 403, "flush is admin-gated");
  });
});

after(async () => {
  // best-effort cleanup
  await api(`/api/cache/keys/${KEY}`, { method: "DELETE" }).catch(() => {});
  await api(`/api/cache/keys/${KEY}:novalue`, { method: "DELETE" }).catch(() => {});
});
