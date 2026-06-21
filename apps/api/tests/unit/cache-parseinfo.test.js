/**
 * Unit tests for parseInfo — parses a Valkey/Redis INFO dump into
 * { section: { key: value } }. Pure function, no client needed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInfo } from "../../src/lib/cache.js";

const SAMPLE = [
  "# Server",
  "redis_version:7.2.4",
  "uptime_in_seconds:5538",
  "",
  "# Memory",
  "used_memory_human:1.05M",
  "maxmemory:0",
  "",
  "# Stats",
  "keyspace_hits:1",
  "keyspace_misses:0",
].join("\r\n");

describe("parseInfo", () => {
  it("groups keys under lowercased section names", () => {
    const out = parseInfo(SAMPLE);
    assert.equal(out.server.redis_version, "7.2.4");
    assert.equal(out.memory.used_memory_human, "1.05M");
    assert.equal(out.stats.keyspace_hits, "1");
  });

  it("handles values that contain colons", () => {
    const out = parseInfo("# Replication\nmaster_host:127.0.0.1:6379");
    assert.equal(out.replication.master_host, "127.0.0.1:6379");
  });

  it("ignores blank lines and lines without a colon", () => {
    const out = parseInfo("# Server\nredis_version:7.2.4\n\ngarbage_line\n");
    assert.deepEqual(out.server, { redis_version: "7.2.4" });
  });

  it("puts pre-section keys under 'general'", () => {
    const out = parseInfo("loose_key:1\n# Server\nredis_version:7.2.4");
    assert.equal(out.general.loose_key, "1");
  });

  it("returns an empty object for empty input", () => {
    assert.deepEqual(parseInfo(""), {});
  });
});
