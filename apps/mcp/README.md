# @truss/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI agent
(Claude Code, Claude Desktop, Cursor, ...) operate a running Truss instance: inspect the
schema, run read-only SQL, read and write table rows, and manage API keys, OAuth2 clients,
and projects.

It is a thin wrapper over Truss's API-key-authed `/v1/*` client API. No model calls, no AI
in the server itself; it is purely an interface, so there is no lock-in and nothing to pay for.

## Auth

It needs a **service_role** key (`truss_sk_...`, create one in the dashboard under
Settings → API Keys). The server inherits the key's scope, issue a dedicated key for the
agent and rotate it like any credential.

## Transports

**stdio** (local, runs as a subprocess of the agent):

```bash
# Claude Code
claude mcp add truss -- env TRUSS_API_URL=http://localhost:8787 TRUSS_API_KEY=truss_sk_xxx \
  node /path/to/truss/apps/mcp/src/index.js
```

```json
// Claude Desktop / Cursor (mcpServers)
{
  "mcpServers": {
    "truss": {
      "command": "node",
      "args": ["/path/to/truss/apps/mcp/src/index.js"],
      "env": { "TRUSS_API_URL": "http://localhost:8787", "TRUSS_API_KEY": "truss_sk_xxx" }
    }
  }
}
```

**HTTP** (hosted, Streamable HTTP at `POST /mcp`): the bundled Compose and Helm setups run
this for you (`truss-mcp`, port `8765`). The caller passes its key as
`Authorization: Bearer truss_sk_...`; the server is stateless and scopes each request to
that key. Point your agent at `https://your-truss.example.com/mcp` (front it with your
ingress). Run it standalone with `npm run start:http -w @truss/mcp`.

| Env | Default | |
|-----|---------|--|
| `TRUSS_API_URL` | `http://localhost:8787` | base URL of the Truss API |
| `TRUSS_API_KEY` | (required, stdio only) | a `truss_sk_` service-role key |
| `MCP_PORT` | `8765` | HTTP transport port |

## Tools (22)

- **Introspection**: `truss_status`, `truss_list_modules`, `truss_database_schema`, `truss_describe_table`
- **SQL + data**: `truss_run_sql` (read-only), `truss_query_table`, `truss_insert_rows`, `truss_update_rows`, `truss_delete_rows`
- **Control plane**: `truss_list_api_keys` / `truss_create_api_key` / `truss_revoke_api_key`, `truss_list_oauth2_clients` / `truss_create_oauth2_client` / `truss_delete_oauth2_client`, `truss_update_project`
- **Reads**: `truss_list_buckets`, `truss_list_identities`, `truss_list_projects`, `truss_list_webhooks`, `truss_list_branches`, `truss_list_backups`

Tools carry `readOnlyHint` / `destructiveHint` annotations. `truss_update_rows` /
`truss_delete_rows` refuse to run without filters, so they never touch a whole table.
Row filters are PostgREST-style: `{ "status": "eq.active" }`.

## Resources

Browsable read-only context, so the agent can pull state without spending a tool call:
`truss://status`, `truss://schema`, `truss://modules`, and the template
`truss://table/{schema}/{table}`.

## Prompts

`explore_database`, `audit_identities` — canned workflows the agent can invoke.

## Not (yet) included

Control-plane verbs that don't fit the `/v1` key model are intentionally out of scope:
ad-hoc bucket creation (buckets are provisioned per project) and flag mutation (flags use a
variant/targeting model, not a simple toggle). Both would need a dedicated admin surface.
Full OAuth 2.1 auth for the HTTP transport is also future work; bearer service-role keys
over HTTPS are the current model.
