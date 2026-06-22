#!/usr/bin/env node
/**
 * Truss MCP server — hosted Streamable HTTP transport.
 *
 * A running Truss instance can serve MCP at POST /mcp. The caller authenticates with a
 * Truss service_role key, passed as `Authorization: Bearer truss_sk_...` (or an `apikey`
 * header); each request is scoped to that key. Stateless: one server per request, which
 * is fine because every tool is a stateless proxy to the Truss API.
 *
 * Env: TRUSS_API_URL (default http://localhost:8787), MCP_PORT (default 8765).
 */
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./server.js";
import { makeApiClient } from "./api-client.js";

const API_URL = process.env.TRUSS_API_URL || "http://localhost:8787";
const PORT = Number(process.env.MCP_PORT || 8765);

function bearer(req) {
  const auth = req.headers["authorization"];
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return (req.headers["apikey"] || "").toString() || null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 4_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : undefined); } catch { resolve(undefined); } });
    req.on("error", () => resolve(undefined));
  });
}

const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };

const httpServer = http.createServer(async (req, res) => {
  const path = (req.url || "").split("?")[0];

  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
  if (path !== "/mcp") return send(res, 404, { error: "Not found. MCP endpoint is POST /mcp." });

  const key = bearer(req);
  if (!key) return send(res, 401, { error: "Missing API key. Pass Authorization: Bearer truss_sk_... (a service_role key)." });

  const body = await readBody(req);
  const server = buildServer(makeApiClient(API_URL, key));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) send(res, 500, { error: `MCP error: ${e.message}` });
  }
});

httpServer.listen(PORT, () => {
  process.stderr.write(`truss-mcp (http): listening on :${PORT}/mcp, targeting ${API_URL}\n`);
});
