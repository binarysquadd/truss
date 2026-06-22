/**
 * Truss MCP server definition — tools, resources, and prompts.
 * Transport-agnostic: index.js (stdio) and http.js (Streamable HTTP) both build a
 * server from here. It is a thin wrapper over Truss's API-key-authed `/v1/*` API.
 */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const ok = (data) => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (msg) => ({ content: [{ type: "text", text: String(msg) }], isError: true });
const filtersToQuery = (filters) => (filters && typeof filters === "object" ? { ...filters } : {});

// `api` is an injected client: { request(method, path, {query, body}) -> {ok, status, data} }.
// This lets stdio (one fixed key) and HTTP (per-request key) share all the definitions.
export function buildServer(api) {
  const call = async (method, path, opts) => {
    try {
      const r = await api.request(method, path, opts);
      if (!r.ok) return fail(`HTTP ${r.status}: ${r.data?.error || JSON.stringify(r.data)}`);
      return ok(r.data);
    } catch (e) {
      return fail(`Request failed: ${e.message}`);
    }
  };
  const getJson = async (path, opts) => {
    const r = await api.request("GET", path, opts);
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.data?.error || "request failed"}`);
    return r.data;
  };

  const server = new McpServer({ name: "truss", version: "0.2.0" });

  const READ = { readOnlyHint: true };
  const WRITE = { readOnlyHint: false, destructiveHint: false };
  const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true };

  // ── Introspection (read) ──
  server.registerTool("truss_status", { description: "Platform status: database size, table/schema counts, plan, and which integrations are configured.", inputSchema: {}, annotations: READ },
    () => call("GET", "/v1/status"));
  server.registerTool("truss_list_modules", { description: "List the modules/features available on this instance.", inputSchema: {}, annotations: READ },
    () => call("GET", "/v1/modules"));
  server.registerTool("truss_database_schema", { description: "List all tables and columns (schema introspection).", inputSchema: {}, annotations: READ },
    () => call("GET", "/v1/database/schema"));
  server.registerTool("truss_describe_table", { description: "Describe one table: columns, types, constraints.", inputSchema: { schema: z.string().describe("schema, e.g. public"), table: z.string() }, annotations: READ },
    ({ schema, table }) => call("GET", `/v1/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`));

  // ── SQL + data ──
  server.registerTool("truss_run_sql", { description: "Run a read-only SQL query (SELECT / WITH / EXPLAIN). Mutations are blocked server-side.", inputSchema: { sql: z.string().describe("SQL query") }, annotations: READ },
    ({ sql }) => call("POST", "/v1/sql", { body: { sql } }));
  server.registerTool("truss_query_table", { description: "Read rows from a table. Filters are PostgREST-style: { column: 'op.value' }, e.g. { status: 'eq.active' }.", inputSchema: { table: z.string(), select: z.string().optional(), filters: z.record(z.string()).optional(), order: z.string().optional().describe("e.g. created_at.desc"), limit: z.number().int().positive().max(10000).optional() }, annotations: READ },
    ({ table, select, filters, order, limit }) => call("GET", `/v1/db/${encodeURIComponent(table)}`, { query: { select, order, limit, ...filtersToQuery(filters) } }));
  server.registerTool("truss_insert_rows", { description: "Insert one or more rows into a table.", inputSchema: { table: z.string(), rows: z.array(z.record(z.any())).min(1) }, annotations: WRITE },
    ({ table, rows }) => call("POST", `/v1/db/${encodeURIComponent(table)}`, { body: rows }));
  server.registerTool("truss_update_rows", { description: "Update rows matching filters. Filters are REQUIRED so this never touches the whole table.", inputSchema: { table: z.string(), filters: z.record(z.string()), changes: z.record(z.any()) }, annotations: WRITE },
    ({ table, filters, changes }) => {
      if (!filters || Object.keys(filters).length === 0) return fail("Refusing to update without filters (would affect every row).");
      return call("PATCH", `/v1/db/${encodeURIComponent(table)}`, { query: filtersToQuery(filters), body: changes });
    });
  server.registerTool("truss_delete_rows", { description: "Delete rows matching filters. Filters are REQUIRED so this never empties the table.", inputSchema: { table: z.string(), filters: z.record(z.string()) }, annotations: DESTRUCTIVE },
    ({ table, filters }) => {
      if (!filters || Object.keys(filters).length === 0) return fail("Refusing to delete without filters (would empty the table).");
      return call("DELETE", `/v1/db/${encodeURIComponent(table)}`, { query: filtersToQuery(filters) });
    });

  // ── Storage (read; buckets are provisioned per-project, not created ad-hoc) ──
  server.registerTool("truss_list_buckets", { description: "List S3 storage buckets.", inputSchema: {}, annotations: READ }, () => call("GET", "/v1/storage/buckets"));

  // ── API keys (control plane) ──
  server.registerTool("truss_list_api_keys", { description: "List API keys (prefixes + metadata; secrets are never returned).", inputSchema: {}, annotations: READ },
    () => call("GET", "/v1/keys"));
  server.registerTool("truss_create_api_key", { description: "Create an API key. The full secret is returned once.", inputSchema: { label: z.string().optional(), keyType: z.enum(["anon", "service_role"]).default("anon"), projectId: z.string().optional() }, annotations: WRITE },
    ({ label, keyType, projectId }) => call("POST", "/v1/keys", { body: { label, key_type: keyType, project_id: projectId } }));
  server.registerTool("truss_revoke_api_key", { description: "Revoke an API key by id.", inputSchema: { id: z.string() }, annotations: DESTRUCTIVE },
    ({ id }) => call("DELETE", `/v1/keys/${encodeURIComponent(id)}`));

  // ── OAuth2 clients (control plane, via Ory Hydra) ──
  server.registerTool("truss_list_oauth2_clients", { description: "List registered OAuth2 / OIDC clients.", inputSchema: {}, annotations: READ },
    () => call("GET", "/v1/oauth2/clients"));
  server.registerTool("truss_create_oauth2_client", { description: "Register an OAuth2 / OIDC client.", inputSchema: { name: z.string().describe("client_name"), redirectUris: z.array(z.string()).optional(), grantTypes: z.array(z.string()).optional(), scope: z.string().optional() }, annotations: WRITE },
    ({ name, redirectUris, grantTypes, scope }) => call("POST", "/v1/oauth2/clients", { body: { client_name: name, redirect_uris: redirectUris, grant_types: grantTypes, scope } }));
  server.registerTool("truss_delete_oauth2_client", { description: "Delete an OAuth2 client by id.", inputSchema: { id: z.string() }, annotations: DESTRUCTIVE },
    ({ id }) => call("DELETE", `/v1/oauth2/clients/${encodeURIComponent(id)}`));

  // ── Projects ──
  server.registerTool("truss_update_project", { description: "Update a project's name or status (active|paused).", inputSchema: { id: z.string(), name: z.string().optional(), status: z.enum(["active", "paused"]).optional() }, annotations: WRITE },
    ({ id, name, status }) => call("PATCH", `/v1/projects/${encodeURIComponent(id)}`, { body: { name, status } }));

  // ── Other pillars (read) ──
  server.registerTool("truss_list_identities", { description: "List auth identities (users).", inputSchema: { page: z.number().int().positive().optional(), perPage: z.number().int().positive().max(500).optional() }, annotations: READ },
    ({ page, perPage }) => call("GET", "/v1/auth/identities", { query: { page, per_page: perPage } }));
  server.registerTool("truss_list_projects", { description: "List projects.", inputSchema: {}, annotations: READ }, () => call("GET", "/v1/projects"));
  server.registerTool("truss_list_webhooks", { description: "List configured webhooks.", inputSchema: {}, annotations: READ }, () => call("GET", "/v1/webhooks"));
  server.registerTool("truss_list_branches", { description: "List database branches.", inputSchema: {}, annotations: READ }, () => call("GET", "/v1/branches"));
  server.registerTool("truss_list_backups", { description: "List database backups.", inputSchema: {}, annotations: READ }, () => call("GET", "/v1/backups"));

  // ── Resources (browsable read-only context) ──
  const textResource = (uri, data) => ({ contents: [{ uri, mimeType: "application/json", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
  server.registerResource("status", "truss://status", { description: "Platform status snapshot", mimeType: "application/json" },
    async (uri) => textResource(uri.href, await getJson("/v1/status")));
  server.registerResource("schema", "truss://schema", { description: "Full database schema (tables + columns)", mimeType: "application/json" },
    async (uri) => textResource(uri.href, await getJson("/v1/database/schema")));
  server.registerResource("modules", "truss://modules", { description: "Modules available on this instance", mimeType: "application/json" },
    async (uri) => textResource(uri.href, await getJson("/v1/modules")));
  server.registerResource("table", new ResourceTemplate("truss://table/{schema}/{table}", { list: undefined }), { description: "A single table's definition", mimeType: "application/json" },
    async (uri, { schema, table }) => textResource(uri.href, await getJson(`/v1/database/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}`)));

  // ── Prompts (canned workflows) ──
  server.registerPrompt("explore_database", { description: "Explore the database: summarize schema, key tables, and notable columns.", argsSchema: {} },
    () => ({ messages: [{ role: "user", content: { type: "text", text: "Use truss_database_schema to read the schema, then summarize the database: the main tables, their purpose, key columns, and relationships. Call out anything that looks like PII." } }] }));
  server.registerPrompt("audit_identities", { description: "Audit the auth identities and summarize who has access.", argsSchema: {} },
    () => ({ messages: [{ role: "user", content: { type: "text", text: "Use truss_list_identities to list users, then summarize how many there are, which are admins, and anything unusual (e.g. unverified emails, stale accounts)." } }] }));

  return server;
}
