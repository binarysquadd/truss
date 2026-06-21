/**
 * Integrations status integration test. Guards the regression where
 * /api/integrations/status was dropped during the de-cloud and 404'd,
 * leaving the dashboard's Auth + Storage health tiles stuck.
 */
import { describe, it } from "node:test";
import { api, assertStatus, assert, assertKeys } from "./helpers.js";

describe("Integrations status", () => {
  it("GET /api/integrations/status — returns the auth + storage shape", async () => {
    const res = await api("/api/integrations/status");
    assertStatus(res, 200, "integrations status");
    assertKeys(res.data, ["auth", "storage"], "top-level");
    assertKeys(res.data.auth, ["reachable", "admin", "configured"], "auth");
    assertKeys(res.data.auth.admin, ["reachable"], "auth.admin");
    assertKeys(res.data.storage, ["s3", "console"], "storage");
    assertKeys(res.data.storage.s3, ["reachable"], "storage.s3");
  });

  it("auth + storage are reachable in the test stack", async () => {
    const res = await api("/api/integrations/status");
    const authOk = res.data.auth.reachable === true || res.data.auth.admin.reachable === true;
    const storageOk = res.data.storage.s3.reachable === true || res.data.storage.console.reachable === true;
    assert(authOk, "Kratos should be reachable");
    assert(storageOk, "MinIO should be reachable");
  });
});
