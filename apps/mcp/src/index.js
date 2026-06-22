#!/usr/bin/env node
/**
 * Truss MCP server — stdio transport (local: Claude Code / Desktop / Cursor).
 * For the hosted HTTP transport see http.js.
 *
 * Env: TRUSS_API_URL (default http://localhost:8787), TRUSS_API_KEY (service_role, required).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { makeApiClient } from "./api-client.js";

const API_URL = process.env.TRUSS_API_URL || "http://localhost:8787";
const API_KEY = process.env.TRUSS_API_KEY || "";

if (!API_KEY) {
  process.stderr.write("truss-mcp: TRUSS_API_KEY is required (a service_role key, truss_sk_...).\n");
  process.exit(1);
}

const server = buildServer(makeApiClient(API_URL, API_KEY));
await server.connect(new StdioServerTransport());
process.stderr.write(`truss-mcp (stdio): targeting ${API_URL}\n`);
