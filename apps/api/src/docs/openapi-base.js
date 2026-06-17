// ─── Common response helpers ───
const err = (desc) => ({ description: desc, content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } });
const noKey = { description: "Missing API key" };
const forbidden = { description: "Requires service_role key" };
const rateLimit = { description: "Rate limit exceeded" };
const noDb = { description: "Database not configured" };
const svcRole = [{ ApiKeyAuth: [] }];
const noSession = { description: "Session required — not authenticated" };
const adminOnly = { description: "Requires admin privileges" };
const ok = (desc) => ({ description: desc, content: { "application/json": { schema: { type: "object" } } } });
const okArr = (desc) => ({ description: desc, content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } });
const noService = (name) => ({ description: `${name} is not configured` });

export const openApiBase = {
  openapi: "3.0.3",
  info: {
    title: "Truss Client API",
    version: "1.0.0",
    description:
      "Programmatic access to your **Truss** backend-as-a-service platform.\n\n" +
      "### Data API\n" +
      "Execute SQL (`POST /v1/sql`), run transactions (`POST /v1/sql/transaction`), " +
      "and perform REST-style CRUD on any table (`/v1/db/:table`) or call stored functions (`/v1/db/rpc/:fn`).\n\n" +
      "### Management API\n" +
      "Inspect platform status, manage API keys, browse database schema, and monitor " +
      "webhooks, realtime subscriptions, storage, authentication, authorization, and OAuth2.\n\n" +
      "### Authentication\n" +
      "All endpoints require an API key via the `apikey` header. " +
      "Data endpoints accept both `anon` and `service_role` keys (RLS is enforced for `anon`). " +
      "Management endpoints require a `service_role` key.\n\n" +
      "### Dashboard URL Routing\n" +
      "The dashboard uses a hierarchical URL scheme: `/{orgSlug}/{projectSlug}/{nav}/{subView}`. " +
      "Special slugs: `~` = personal workspace (no org), `_` = no project selected. " +
      "Example: `/acme/my-app/database/tables` navigates to the tables sub-view of the database panel for project `my-app` in org `acme`.\n\n" +
      "---\n" +
      "*Backend platform built on open-source infrastructure — Postgres, Auth, Permissions, Storage, and more.*",
    contact: { name: "Truss", url: "https://truss.dev" },
    license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
  },
  servers: [
    { url: "/v1", description: "Client API (API key auth)" },
    { url: "/", description: "Dashboard API (session auth)" },
  ],
  tags: [
    { name: "SQL", description: "Execute raw SQL queries and transactions" },
    { name: "Data", description: "PostgREST-style CRUD operations on tables and functions" },
    { name: "Management", description: "Platform status, projects, and configuration" },
    { name: "Keys", description: "API key lifecycle management" },
    { name: "Database", description: "Schema introspection, branches, and backups" },
    { name: "Storage", description: "S3-compatible object storage buckets" },
    { name: "Auth", description: "Identity management via Ory Kratos" },
    { name: "Webhooks", description: "Webhook configuration and delivery logs" },
    { name: "Realtime", description: "WebSocket realtime engine status" },
    { name: "OAuth2", description: "OAuth2/OIDC client management via Ory Hydra" },
    { name: "Gateway", description: "API Gateway rules via Ory Oathkeeper. Rule limits per plan: Starter 50, Pro 150, Team 500, Business unlimited." },
    { name: "Audit", description: "Audit log queries" },
    { name: "Search", description: "Full-text search configuration and testing" },
    { name: "Vectors", description: "pgvector collection and index management" },
    { name: "Connections", description: "Saved database connections" },
    { name: "Projects", description: "Project provisioning and management" },
    { name: "Settings", description: "Platform settings, SMTP, notifications, export, danger zone" },
    { name: "Organizations", description: "Organization management, members, invitations, seat limits" },
    { name: "Admin", description: "Admin-only analytics and tenant management" },
    { name: "SampleApp", description: "Sample application data loader" },
    { name: "Dev", description: "Development-mode tenant switching" },
    { name: "Migrations", description: "Database migration management" },
    { name: "Roles", description: "Postgres role and grant management" },
    { name: "Performance", description: "Query performance analysis and advisors" },
    { name: "RLS", description: "Row-Level Security policy management" },
    { name: "FDW", description: "Foreign Data Wrapper management" },
    { name: "Partitioning", description: "Table partitioning advisor" },
    { name: "Feature Flags", description: "Feature flag management, targeting, segments, and evaluation via flagd. Flag and segment creation is subject to plan quotas — exceeding your plan limit returns 403 QUOTA_EXCEEDED. Purchase +Flags or +Segments booster packs to raise limits." },
    { name: "Extensions", description: "PostgreSQL extension management — enable/disable 33 curated extensions" },
    { name: "Public", description: "Unauthenticated public endpoints (waitlist, etc.)" },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════════════
  paths: {

    // ─── SQL ───────────────────────────────────────────────────────────────
    "/sql": {
      post: {
        tags: ["SQL"],
        summary: "Execute SQL query",
        description:
          "Execute a single SQL statement against the database. Supports parameterized queries, " +
          "configurable timeouts, and automatic row limits. Mutations (INSERT/UPDATE/DELETE/DDL) " +
          "are subject to quota checks. Dangerous operations (COPY, pg_read_file, ALTER SYSTEM, etc.) are blocked.",
        security: svcRole,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["sql"],
                properties: {
                  sql: { type: "string", description: "SQL statement to execute", example: "SELECT id, name FROM users WHERE active = $1" },
                  params: { type: "array", items: {}, description: "Positional parameters ($1, $2, ...)", example: [true] },
                  timeout: { type: "integer", description: "Query timeout in milliseconds (max 30000)", default: 15000 },
                  row_limit: { type: "integer", description: "Maximum rows to return (max 50000)", default: 10000 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Query executed successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/SqlResult" } } } },
          400: err("SQL syntax error or query failure"),
          401: noKey,
          403: { description: "Requires service_role key, quota exceeded, or blocked operation" },
          429: rateLimit,
          500: noDb,
        },
      },
    },

    "/sql/transaction": {
      post: {
        tags: ["SQL"],
        summary: "Execute multi-statement transaction",
        description: "Execute up to 20 SQL statements in a single atomic transaction. All statements succeed or all are rolled back.",
        security: svcRole,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["statements"],
                properties: {
                  statements: {
                    type: "array",
                    maxItems: 20,
                    items: {
                      type: "object",
                      required: ["sql"],
                      properties: {
                        sql: { type: "string" },
                        params: { type: "array", items: {} },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Transaction committed successfully", content: { "application/json": { schema: { $ref: "#/components/schemas/TransactionResult" } } } },
          400: err("Statement error (transaction rolled back)"),
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Data API ──────────────────────────────────────────────────────────
    "/db/{table}": {
      get: {
        tags: ["Data"],
        summary: "List rows from a table",
        description:
          "PostgREST-style row selection with filtering, ordering, column selection, and pagination. " +
          "Filters are passed as query parameters using the format `column=operator.value`. " +
          "Supported operators: eq, neq, gt, gte, lt, lte, like, ilike, is, in.",
        security: svcRole,
        parameters: [
          { name: "table", in: "path", required: true, schema: { type: "string" }, description: "Table name" },
          { name: "select", in: "query", schema: { type: "string" }, description: "Comma-separated column names to return", example: "id,name,email" },
          { name: "order", in: "query", schema: { type: "string" }, description: "Comma-separated ordering: column.asc or column.desc", example: "created_at.desc" },
          { name: "limit", in: "query", schema: { type: "integer", default: 1000, maximum: 10000 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          200: {
            description: "Array of matching rows",
            headers: { "Content-Range": { schema: { type: "string" }, description: "Range of returned rows (e.g. 0-25/*)" } },
            content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TableRow" } } } },
          },
          400: err("Invalid table name or query error"),
          401: noKey,
          429: rateLimit,
          500: noDb,
        },
      },
      post: {
        tags: ["Data"],
        summary: "Insert row(s) into a table",
        description: "Insert one or more rows. Pass a single object or an array of objects. All inserted rows are returned with RETURNING *.",
        security: svcRole,
        parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/TableRow" },
                  { type: "array", items: { $ref: "#/components/schemas/TableRow" } },
                ],
              },
            },
          },
        },
        responses: {
          201: { description: "Inserted rows", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TableRow" } } } } },
          400: err("Invalid table name, empty body, or constraint violation"),
          401: noKey,
          403: { description: "Quota exceeded" },
          429: rateLimit,
          500: noDb,
        },
      },
      patch: {
        tags: ["Data"],
        summary: "Update rows matching filters",
        description: "Update rows that match query string filters. At least one filter is required to prevent accidental full-table updates. Updated rows are returned.",
        security: svcRole,
        parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TableRow" },
              example: { name: "Updated Name", active: false },
            },
          },
        },
        responses: {
          200: { description: "Updated rows", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TableRow" } } } } },
          400: err("Missing filter, invalid table, or constraint violation"),
          401: noKey,
          403: { description: "Quota exceeded" },
          429: rateLimit,
          500: noDb,
        },
      },
      delete: {
        tags: ["Data"],
        summary: "Delete rows matching filters",
        description: "Delete rows that match query string filters. At least one filter is required to prevent accidental full-table deletes. Deleted rows are returned.",
        security: svcRole,
        parameters: [{ name: "table", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Deleted rows", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TableRow" } } } } },
          400: err("Missing filter or invalid table name"),
          401: noKey,
          429: rateLimit,
          500: noDb,
        },
      },
    },

    "/db/rpc/{function}": {
      post: {
        tags: ["Data"],
        summary: "Call a database function",
        description: 'Invoke a Postgres function by name, passing arguments as a JSON object. Arguments are mapped to named parameters.',
        security: svcRole,
        parameters: [{ name: "function", in: "path", required: true, schema: { type: "string" }, description: "Function name" }],
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
              example: { user_id: 42, status: "active" },
            },
          },
        },
        responses: {
          200: { description: "Function result rows", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          400: err("Invalid function name or execution error"),
          401: noKey,
          429: rateLimit,
          500: noDb,
        },
      },
    },

    // ─── Management: Status ────────────────────────────────────────────────
    "/status": {
      get: {
        tags: ["Management"],
        summary: "Platform overview",
        description:
          "Comprehensive status snapshot of the entire Truss platform including database stats, " +
          "storage usage, auth MAU, plan limits, integration health, realtime status, and API metrics.",
        security: svcRole,
        responses: {
          200: {
            description: "Full platform status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    platform: { type: "object", properties: { name: { type: "string" }, environment: { type: "string" }, version: { type: "string" }, api_url: { type: "string" }, uptime_seconds: { type: "integer", nullable: true } } },
                    database: { type: "object", properties: { name: { type: "string" }, version: { type: "string" }, size_bytes: { type: "integer" }, size_gb: { type: "number" }, table_count: { type: "integer" }, schema_count: { type: "integer" }, active_connections: { type: "integer" } } },
                    storage: { type: "object", properties: { size_bytes: { type: "integer" }, size_gb: { type: "number" } } },
                    auth: { type: "object", properties: { mau: { type: "integer" } } },
                    plan: { type: "object", properties: { key: { type: "string" }, name: { type: "string" }, usage_pct: { type: "object" } } },
                    resources: { type: "object" },
                    integrations: { type: "object" },
                    modules: { type: "object" },
                    realtime: { type: "object" },
                    metrics: { type: "object" },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Management: Projects ──────────────────────────────────────────────
    "/projects": {
      get: {
        tags: ["Management"],
        summary: "List all projects",
        description: "List all non-deleted projects, optionally filtered by status.",
        security: svcRole,
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["provisioning", "active", "paused"] }, description: "Filter by project status" },
        ],
        responses: {
          200: { description: "Project list", content: { "application/json": { schema: { type: "object", properties: { total_count: { type: "integer" }, projects: { type: "array", items: { $ref: "#/components/schemas/Project" } } } } } } },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/projects/{id}": {
      get: {
        tags: ["Management"],
        summary: "Get project details",
        description: "Full project detail including API keys, tables, storage bucket info, and webhooks.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: {
            description: "Project details with related resources",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Project" },
                    { type: "object", properties: { connection_string: { type: "string", nullable: true }, api_keys: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } }, tables: { type: "array", items: { type: "string" } }, storage: { type: "object", nullable: true }, webhooks: { type: "object" } } },
                  ],
                },
              },
            },
          },
          404: { description: "Project not found" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
      patch: {
        tags: ["Management"],
        summary: "Update a project",
        description: "Update project name or status. Only non-deleted projects can be updated.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, status: { type: "string", enum: ["active", "paused"] } } } } },
        },
        responses: {
          200: { description: "Updated project", content: { "application/json": { schema: { $ref: "#/components/schemas/Project" } } } },
          400: { description: "No valid fields provided" },
          404: { description: "Project not found" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Keys ──────────────────────────────────────────────────────────────
    "/keys": {
      get: {
        tags: ["Keys"],
        summary: "List API keys",
        description: "List all API keys with live usage statistics (queries, bandwidth, last seen).",
        security: svcRole,
        parameters: [{ name: "project_id", in: "query", schema: { type: "string" }, description: "Filter keys by project ID" }],
        responses: {
          200: {
            description: "Key list with usage stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_count: { type: "integer" },
                    keys: {
                      type: "array",
                      items: {
                        allOf: [
                          { $ref: "#/components/schemas/ApiKey" },
                          { type: "object", properties: { usage: { type: "object", properties: { queries: { type: "integer" }, bandwidth_bytes: { type: "integer" }, last_seen: { type: "string", format: "date-time", nullable: true } } } } },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
      post: {
        tags: ["Keys"],
        summary: "Create API key",
        description: "Generate a new API key. The full secret is returned only once in the response. Store it securely -- it cannot be retrieved again.",
        security: svcRole,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  key_type: { type: "string", enum: ["anon", "service_role"], default: "anon" },
                  label: { type: "string", maxLength: 100 },
                  project_id: { type: "string", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Key created with secret",
            content: { "application/json": { schema: { type: "object", properties: { key: { $ref: "#/components/schemas/ApiKey" }, secret: { type: "string", description: "Full API key (shown only once)" } } } } },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/keys/{id}": {
      delete: {
        tags: ["Keys"],
        summary: "Revoke API key",
        description: "Soft-delete an API key by marking it as revoked. Revoked keys can no longer authenticate.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Revoked key details", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiKey" } } } },
          404: { description: "Key not found" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/keys/{id}/rotate": {
      post: {
        tags: ["Keys"],
        summary: "Rotate API key",
        description: "Atomically revoke an existing key and create a new one with the same type, label, and project association. The new secret is returned only once.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          201: {
            description: "New key created, old key revoked",
            content: { "application/json": { schema: { type: "object", properties: { old_key_id: { type: "integer" }, old_key_revoked: { type: "boolean" }, new_key: { $ref: "#/components/schemas/ApiKey" }, secret: { type: "string", description: "Full new API key (shown only once)" } } } } },
          },
          404: { description: "Key not found or already revoked" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Database ──────────────────────────────────────────────────────────
    "/database/schema": {
      get: {
        tags: ["Database"],
        summary: "Get full database schema",
        description: "Introspect the entire database schema including tables, columns, primary keys, foreign keys, indexes, and size estimates. Optionally filter by schema name.",
        security: svcRole,
        parameters: [{ name: "schema", in: "query", schema: { type: "string" }, description: 'Filter to a specific schema (e.g. "public")' }],
        responses: {
          200: {
            description: "Full schema introspection",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_size_bytes: { type: "integer" },
                    table_count: { type: "integer" },
                    tables: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          schema: { type: "string" },
                          name: { type: "string" },
                          column_count: { type: "integer" },
                          size_bytes: { type: "integer" },
                          estimated_rows: { type: "integer" },
                          columns: { type: "array", items: { type: "object" } },
                          primary_keys: { type: "array", items: { type: "string" } },
                          foreign_keys: { type: "array", items: { type: "object" } },
                          indexes: { type: "array", items: { type: "object" } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/database/tables/{schema}/{table}": {
      get: {
        tags: ["Database"],
        summary: "Get single table details",
        description: "Detailed introspection of a single table including columns, primary keys, foreign keys, indexes, triggers, and RLS policies.",
        security: svcRole,
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" }, example: "public" },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Table details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    schema: { type: "string" },
                    table: { type: "string" },
                    size_bytes: { type: "integer" },
                    estimated_rows: { type: "integer" },
                    columns: { type: "array", items: { type: "object" } },
                    primary_keys: { type: "array", items: { type: "string" } },
                    foreign_keys: { type: "array", items: { type: "object" } },
                    indexes: { type: "array", items: { type: "object" } },
                    triggers: { type: "array", items: { type: "object" } },
                    rls_policies: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          404: { description: "Table not found" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/branches": {
      get: {
        tags: ["Database"],
        summary: "List database branches",
        description: "List active database branches with size and masked connection strings.",
        security: svcRole,
        responses: {
          200: {
            description: "Branch list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_count: { type: "integer" },
                    branches: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer" }, parent_db: { type: "string" }, branch_db: { type: "string" }, label: { type: "string" }, status: { type: "string" }, ttl_hours: { type: "integer" }, size_bytes: { type: "integer" }, connection_string: { type: "string", nullable: true }, created_at: { type: "string", format: "date-time" } },
                      },
                    },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/backups": {
      get: {
        tags: ["Database"],
        summary: "List backups",
        description: "List the most recent 50 database backups.",
        security: svcRole,
        responses: {
          200: {
            description: "Backup list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_count: { type: "integer" },
                    backups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { id: { type: "integer" }, filename: { type: "string" }, size_bytes: { type: "integer" }, status: { type: "string" }, created_at: { type: "string", format: "date-time" }, completed_at: { type: "string", format: "date-time", nullable: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Webhooks ──────────────────────────────────────────────────────────
    "/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List webhooks",
        description: "List all webhooks with delivery statistics (total, successful, avg latency).",
        security: svcRole,
        responses: {
          200: { description: "Webhook list with delivery stats", content: { "application/json": { schema: { type: "object", properties: { total_count: { type: "integer" }, webhooks: { type: "array", items: { $ref: "#/components/schemas/Webhook" } } } } } } },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    "/webhooks/{id}": {
      get: {
        tags: ["Webhooks"],
        summary: "Get webhook details",
        description: "Get a single webhook with delivery stats and the 20 most recent delivery logs.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: {
            description: "Webhook with delivery stats and recent logs",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/Webhook" },
                    {
                      type: "object",
                      properties: {
                        delivery_stats: { type: "object", properties: { total: { type: "integer" }, successful: { type: "integer" }, avg_latency_ms: { type: "integer", nullable: true } } },
                        recent_logs: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, event_type: { type: "string" }, status_code: { type: "integer" }, latency_ms: { type: "integer" }, created_at: { type: "string", format: "date-time" } } } },
                      },
                    },
                  ],
                },
              },
            },
          },
          404: { description: "Webhook not found" },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Realtime ──────────────────────────────────────────────────────────
    "/realtime": {
      get: {
        tags: ["Realtime"],
        summary: "Realtime engine status",
        description: "Get the current state of the realtime engine including listener status, connected WebSocket clients, active channels, subscriptions, and webhook triggers.",
        security: svcRole,
        responses: {
          200: {
            description: "Realtime engine status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    listener_connected: { type: "boolean" },
                    ws_clients: { type: "integer" },
                    active_channels: { type: "array", items: { type: "string" } },
                    event_log_size: { type: "integer" },
                    recent_events: { type: "array", items: { type: "object" } },
                    subscriptions: { type: "array", items: { type: "object" } },
                    webhook_triggers: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── Storage ───────────────────────────────────────────────────────────
    "/storage/buckets": {
      get: {
        tags: ["Storage"],
        summary: "List storage buckets",
        description: "List all S3-compatible storage buckets with object counts and total sizes.",
        security: svcRole,
        responses: {
          200: { description: "Bucket list with stats", content: { "application/json": { schema: { type: "object", properties: { total_count: { type: "integer" }, buckets: { type: "array", items: { $ref: "#/components/schemas/Bucket" } } } } } } },
          401: noKey,
          403: forbidden,
          500: { description: "Storage not configured" },
        },
      },
    },

    // ─── Auth ──────────────────────────────────────────────────────────────
    "/auth/identities": {
      get: {
        tags: ["Auth"],
        summary: "List identities",
        description: "List authentication identities with pagination support.",
        security: svcRole,
        parameters: [
          { name: "page_size", in: "query", schema: { type: "integer", default: 50, maximum: 250 } },
          { name: "page_token", in: "query", schema: { type: "string" }, description: "Pagination token from a previous response" },
        ],
        responses: {
          200: { description: "Identity list", content: { "application/json": { schema: { type: "object", properties: { total_count: { type: "integer" }, identities: { type: "array", items: { type: "object" } } } } } } },
          401: noKey,
          403: forbidden,
          500: { description: "Auth service not available" },
        },
      },
    },

    "/auth/identities/{id}": {
      get: {
        tags: ["Auth"],
        summary: "Get identity details",
        description: "Get a single identity by ID, including OIDC credentials.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Identity details", content: { "application/json": { schema: { type: "object" } } } },
          401: noKey,
          403: forbidden,
          500: { description: "Auth service not available" },
        },
      },
    },

    // ─── Modules ───────────────────────────────────────────────────────────
    "/modules": {
      get: {
        tags: ["Management"],
        summary: "Get module configuration",
        description: "List all platform modules and their enabled status.",
        security: svcRole,
        responses: {
          200: { description: "Module configuration", content: { "application/json": { schema: { type: "object", properties: { modules: { type: "object", additionalProperties: { type: "boolean" } }, available: { type: "array", items: { type: "string" } } } } } } },
          401: noKey,
          403: forbidden,
        },
      },
    },

    // ─── Metrics ───────────────────────────────────────────────────────────
    "/metrics": {
      get: {
        tags: ["Management"],
        summary: "Get live consumption metrics",
        description: "Real-time API consumption metrics including total queries, bandwidth, per-key usage, and per-endpoint breakdowns.",
        security: svcRole,
        responses: {
          200: {
            description: "Live metrics",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_queries: { type: "integer" },
                    total_bandwidth_bytes: { type: "integer" },
                    tracking_since: { type: "string", format: "date-time" },
                    per_key: { type: "array", items: { type: "object", properties: { key_id: { type: "integer" }, queries: { type: "integer" }, bandwidth: { type: "integer" }, lastSeen: { type: "string", format: "date-time", nullable: true } } } },
                    per_endpoint: { type: "array", items: { type: "object", properties: { path: { type: "string" }, count: { type: "integer" }, bandwidth: { type: "integer" } } } },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
        },
      },
    },

    // ─── Audit Logs ────────────────────────────────────────────────────────
    "/audit-logs": {
      get: {
        tags: ["Audit"],
        summary: "Search audit logs",
        description: "Query audit logs with optional filters by action, resource type, and time range.",
        security: svcRole,
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "action", in: "query", schema: { type: "string" }, description: "Filter by action (e.g. create, delete, rotate)" },
          { name: "resource_type", in: "query", schema: { type: "string" }, description: "Filter by resource type (e.g. api_key)" },
          { name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Only return logs after this timestamp" },
        ],
        responses: {
          200: {
            description: "Audit log entries",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_count: { type: "integer" },
                    logs: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, actor: { type: "string" }, action: { type: "string" }, resource_type: { type: "string" }, resource_id: { type: "string" }, payload: { type: "object" }, created_at: { type: "string", format: "date-time" } } } },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          500: noDb,
        },
      },
    },

    // ─── OAuth2 ────────────────────────────────────────────────────────────
    "/oauth2/clients": {
      get: {
        tags: ["OAuth2"],
        summary: "List OAuth2 clients",
        description: "List all registered OAuth2/OIDC clients.",
        security: svcRole,
        responses: {
          200: {
            description: "OAuth2 client list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total_count: { type: "integer" },
                    clients: { type: "array", items: { type: "object", properties: { client_id: { type: "string" }, client_name: { type: "string" }, grant_types: { type: "array", items: { type: "string" } }, response_types: { type: "array", items: { type: "string" } }, scope: { type: "string" }, redirect_uris: { type: "array", items: { type: "string" } }, token_endpoint_auth_method: { type: "string" }, created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" } } } },
                  },
                },
              },
            },
          },
          401: noKey,
          403: forbidden,
          503: { description: "Hydra is not configured" },
        },
      },
      post: {
        tags: ["OAuth2"],
        summary: "Create OAuth2 client",
        description: "Register a new OAuth2/OIDC client.",
        security: svcRole,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  client_name: { type: "string" },
                  grant_types: { type: "array", items: { type: "string" } },
                  response_types: { type: "array", items: { type: "string" } },
                  scope: { type: "string" },
                  redirect_uris: { type: "array", items: { type: "string" } },
                  token_endpoint_auth_method: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "OAuth2 client created", content: { "application/json": { schema: { type: "object" } } } },
          400: { description: "Invalid client configuration" },
          401: noKey,
          403: forbidden,
          503: { description: "Hydra is not configured" },
        },
      },
    },

    "/oauth2/clients/{id}": {
      delete: {
        tags: ["OAuth2"],
        summary: "Delete OAuth2 client",
        description: "Delete an OAuth2/OIDC client by client ID.",
        security: svcRole,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "OAuth2 client ID" }],
        responses: {
          200: { description: "Client deleted", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" } } } } } },
          401: noKey,
          403: forbidden,
          503: { description: "Hydra is not configured" },
        },
      },
    },

    "/oauth2/discovery": {
      get: {
        tags: ["OAuth2"],
        summary: "OpenID Connect discovery",
        description: "Proxy the OIDC well-known configuration from the OAuth2 provider.",
        security: svcRole,
        responses: {
          200: { description: "OIDC discovery document", content: { "application/json": { schema: { type: "object" } } } },
          401: noKey,
          502: { description: "OAuth2 provider unreachable" },
          503: { description: "Hydra is not configured" },
        },
      },
    },

    // ─── Gateway ───────────────────────────────────────────────────────────
    "/gateway/health": {
      get: {
        tags: ["Gateway"],
        summary: "API Gateway health check",
        description: "Check the health status of the API Gateway.",
        security: svcRole,
        responses: {
          200: { description: "Gateway health status", content: { "application/json": { schema: { type: "object", properties: { health: { type: "object" }, adminConfigured: { type: "boolean" }, proxyUrl: { type: "string", nullable: true } } } } } },
          401: noKey,
          502: { description: "Gateway unreachable" },
          503: { description: "Oathkeeper is not configured" },
        },
      },
    },

    "/gateway/rules": {
      get: {
        tags: ["Gateway"],
        summary: "List API Gateway rules",
        description: "List all access rules configured in the API Gateway.",
        security: svcRole,
        responses: {
          200: { description: "Array of gateway rules", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } },
          401: noKey,
          403: forbidden,
          500: { description: "Failed to fetch rules" },
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // DASHBOARD API ENDPOINTS (session auth, /api prefix)
    // ═══════════════════════════════════════════════════════════════════════════

    // ─── Health & Connections (sql.js) ───────────────────────────────────
    "/api/health": {
      get: {
        tags: ["Management"],
        summary: "API health check",
        description: "Returns API health status, database connectivity, uptime, and build version. Returns API health status, database connectivity, uptime, and build version.",
        responses: {
          200: ok("Health status"),
        },
      },
    },

    "/api/connections/current": {
      get: {
        tags: ["Connections"],
        summary: "Get current database connection",
        description: "Returns the active database connection details (host, port, database name, user).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Current connection info"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/connections/switch": {
      post: {
        tags: ["Connections"],
        summary: "Switch database connection",
        description: "Switch the active database connection. Requires admin privileges. Validates connectivity before switching.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["connection_string"], properties: { connection_string: { type: "string", description: "PostgreSQL connection string" } } } } },
        },
        responses: {
          200: ok("Switched successfully"),
          400: err("Invalid connection string or unreachable"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    // ─── SQL Workbench (sql.js) ──────────────────────────────────────────
    "/api/sql/tables": {
      get: {
        tags: ["SQL"],
        summary: "List database tables",
        description: "List all tables and views with schema, row count, size, and column info.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "query", schema: { type: "string" }, description: "Filter by schema name" },
        ],
        responses: {
          200: okArr("Table list"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/metadata": {
      get: {
        tags: ["SQL"],
        summary: "Get database metadata",
        description: "Returns schemas, extensions, functions, types, enums, and database version info.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Database metadata"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/table-details": {
      get: {
        tags: ["SQL"],
        summary: "Get detailed table info",
        description: "Returns columns, constraints, indexes, triggers, and RLS policies for a specific table.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "query", required: true, schema: { type: "string" } },
          { name: "table", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Table details"),
          400: err("Missing schema or table"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/table-browser": {
      get: {
        tags: ["SQL"],
        summary: "Browse table data",
        description: "Paginated table data browser with sorting, filtering, and column selection.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "query", required: true, schema: { type: "string" } },
          { name: "table", in: "query", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50 } },
          { name: "sort", in: "query", schema: { type: "string" } },
          { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
        ],
        responses: {
          200: ok("Paginated table rows"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/erd": {
      get: {
        tags: ["SQL"],
        summary: "Get ERD data",
        description: "Returns table and foreign key data formatted for Entity-Relationship Diagram rendering.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "query", schema: { type: "string", default: "public" } },
        ],
        responses: {
          200: ok("ERD nodes and edges"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/query": {
      post: {
        tags: ["SQL"],
        summary: "Execute SQL query (dashboard)",
        description: "Execute a SQL query from the dashboard workbench. Read-only by default; mutations require explicit opt-in.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" }, params: { type: "array", items: {} }, timeout: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Query result with rows and columns"),
          400: err("SQL error"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/export": {
      post: {
        tags: ["SQL"],
        summary: "Export query results",
        description: "Execute a query and return results as CSV or JSON download.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" }, format: { type: "string", enum: ["csv", "json"], default: "csv" } } } } },
        },
        responses: {
          200: { description: "File download (CSV or JSON)" },
          400: err("SQL error"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/explain": {
      post: {
        tags: ["SQL"],
        summary: "Explain query plan",
        description: "Run EXPLAIN ANALYZE on a SQL statement and return the execution plan.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" }, analyze: { type: "boolean", default: true } } } } },
        },
        responses: {
          200: ok("Query execution plan"),
          400: err("SQL error"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/catalog": {
      get: {
        tags: ["SQL"],
        summary: "Get SQL catalog",
        description: "Returns functions, extensions, schemas, types, and operators for autocomplete.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Catalog data"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/diagnostics": {
      get: {
        tags: ["SQL"],
        summary: "Database diagnostics",
        description: "Returns database size, connection stats, cache hit ratios, long-running queries, and replication status.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Diagnostic data"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/locks": {
      get: {
        tags: ["SQL"],
        summary: "View active locks",
        description: "List active database locks including blocked and blocking queries.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Lock information"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/connection-inspector": {
      get: {
        tags: ["SQL"],
        summary: "Inspect connections",
        description: "List all active database connections with state, query, and duration.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Connection details"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/autovacuum": {
      get: {
        tags: ["SQL"],
        summary: "Autovacuum status",
        description: "Returns autovacuum activity, dead tuple counts, and last vacuum times per table.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Autovacuum data"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/slow-queries": {
      get: {
        tags: ["SQL"],
        summary: "Slow query log",
        description: "Returns the slowest queries from pg_stat_statements ordered by total execution time.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Slow query list"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/advisors/security": {
      get: {
        tags: ["SQL"],
        summary: "Security advisor",
        description: "Checks for common security issues: superuser roles, public schema exposure, unencrypted connections.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Security findings"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/advisors/performance": {
      get: {
        tags: ["SQL"],
        summary: "Performance advisor",
        description: "Checks for missing indexes, bloated tables, unused indexes, and configuration issues.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Performance findings"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/saved-queries": {
      get: {
        tags: ["SQL"],
        summary: "List saved queries",
        description: "List all saved SQL queries for the current tenant.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Saved queries"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["SQL"],
        summary: "Save a query",
        description: "Save a SQL query with a name and optional description.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "sql"], properties: { name: { type: "string" }, sql: { type: "string" }, description: { type: "string" } } } } },
        },
        responses: {
          200: ok("Saved query"),
          400: err("Missing name or sql"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/saved-queries/{id}": {
      patch: {
        tags: ["SQL"],
        summary: "Update saved query",
        description: "Update name, SQL, or description of a saved query.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, sql: { type: "string" }, description: { type: "string" } } } } },
        },
        responses: {
          200: ok("Updated query"),
          404: { description: "Query not found" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["SQL"],
        summary: "Delete saved query",
        description: "Delete a saved query by ID.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Deleted"),
          404: { description: "Query not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sql/fdw": {
      get: {
        tags: ["FDW"],
        summary: "List foreign data wrappers",
        description: "List all foreign servers, user mappings, and foreign tables.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("FDW configuration"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── FDW (features.js) ───────────────────────────────────────────────
    "/api/fdw/server": {
      post: {
        tags: ["FDW"],
        summary: "Create foreign server",
        description: "Create a new foreign data wrapper server with connection details.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "host", "port", "dbname"], properties: { name: { type: "string" }, host: { type: "string" }, port: { type: "integer" }, dbname: { type: "string" }, wrapper: { type: "string", default: "postgres_fdw" } } } } },
        },
        responses: {
          200: ok("Server created"),
          400: err("Invalid parameters"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/fdw/user-mapping": {
      post: {
        tags: ["FDW"],
        summary: "Create user mapping",
        description: "Create a user mapping for a foreign server with remote credentials.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["server", "remote_user", "remote_password"], properties: { server: { type: "string" }, remote_user: { type: "string" }, remote_password: { type: "string" } } } } },
        },
        responses: {
          200: ok("User mapping created"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/fdw/import": {
      post: {
        tags: ["FDW"],
        summary: "Import foreign tables",
        description: "Import foreign tables from a remote schema into a local schema.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["server", "remote_schema"], properties: { server: { type: "string" }, remote_schema: { type: "string" }, local_schema: { type: "string", default: "public" } } } } },
        },
        responses: {
          200: ok("Tables imported"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/fdw/server/{name}": {
      delete: {
        tags: ["FDW"],
        summary: "Delete foreign server",
        description: "Drop a foreign server and all dependent objects (CASCADE).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Server dropped"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Migrations (sql.js + features.js) ───────────────────────────────
    "/api/migrations/status": {
      get: {
        tags: ["Migrations"],
        summary: "Migration status",
        description: "Returns the current node-pg-migrate migration status and applied migrations.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Migration status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/migrations/up": {
      post: {
        tags: ["Migrations"],
        summary: "Run pending migrations",
        description: "Apply all pending migrations. Returns the list of applied migrations.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Migrations applied"),
          401: noSession,
          500: err("Migration failed"),
        },
      },
    },

    "/api/migrations/create": {
      post: {
        tags: ["Migrations"],
        summary: "Create migration file",
        description: "Generate a new timestamped migration file with the given name.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } },
        },
        responses: {
          200: ok("Migration file created"),
          400: err("Missing name"),
          401: noSession,
        },
      },
    },

    "/api/migrations/check": {
      post: {
        tags: ["Migrations"],
        summary: "Check migration SQL",
        description: "Validate migration SQL without executing it. Returns any syntax errors.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" } } } } },
        },
        responses: {
          200: ok("Validation result"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/migrations/preview/{filename}": {
      get: {
        tags: ["Migrations"],
        summary: "Preview migration file",
        description: "Read and return the contents of a migration file for preview.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "filename", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Migration file contents"),
          404: { description: "File not found" },
          401: noSession,
        },
      },
    },

    "/api/migrations/idempotent/status": {
      get: {
        tags: ["Migrations"],
        summary: "Idempotent migration status",
        description: "Get status of all tracked idempotent migrations and their applied state.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Idempotent migration status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/migrations/idempotent/run": {
      post: {
        tags: ["Migrations"],
        summary: "Run idempotent migration",
        description: "Execute an idempotent (re-runnable) migration SQL script.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" }, name: { type: "string" } } } } },
        },
        responses: {
          200: ok("Migration executed"),
          400: err("SQL error"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/migrations/idempotent/mark-applied": {
      post: {
        tags: ["Migrations"],
        summary: "Mark migration as applied",
        description: "Mark an idempotent migration as applied without actually running it.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } },
        },
        responses: {
          200: ok("Marked as applied"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/migrations/idempotent/detect-schema": {
      post: {
        tags: ["Migrations"],
        summary: "Detect schema from SQL",
        description: "Analyze SQL to detect which schemas, tables, and objects it creates or modifies.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["sql"], properties: { sql: { type: "string" } } } } },
        },
        responses: {
          200: ok("Detected schema objects"),
          401: noSession,
        },
      },
    },

    // ─── Roles (features.js) ─────────────────────────────────────────────
    "/api/roles": {
      get: {
        tags: ["Roles"],
        summary: "List database roles",
        description: "List all Postgres roles with attributes (superuser, createdb, login, etc.).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Role list"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Roles"],
        summary: "Create database role",
        description: "Create a new Postgres role with specified attributes and optional password.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, password: { type: "string" }, login: { type: "boolean" }, superuser: { type: "boolean" }, createdb: { type: "boolean" }, createrole: { type: "boolean" }, inherit: { type: "boolean" }, connection_limit: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Role created"),
          400: err("Invalid role name or duplicate"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/roles/{name}": {
      patch: {
        tags: ["Roles"],
        summary: "Update database role",
        description: "Alter a Postgres role's attributes (login, superuser, password, etc.).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { password: { type: "string" }, login: { type: "boolean" }, superuser: { type: "boolean" }, createdb: { type: "boolean" }, createrole: { type: "boolean" }, connection_limit: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Role updated"),
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Roles"],
        summary: "Drop database role",
        description: "Drop a Postgres role. Fails if the role owns objects.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Role dropped"),
          401: noSession,
          500: err("Role has dependent objects"),
        },
      },
    },

    "/api/roles/{name}/grants": {
      get: {
        tags: ["Roles"],
        summary: "List role grants",
        description: "List all object-level grants (tables, schemas, sequences) for a role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: okArr("Grant list"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/roles/{name}/grant": {
      post: {
        tags: ["Roles"],
        summary: "Grant privileges",
        description: "Grant specified privileges on a database object to a role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["privileges", "on_object"], properties: { privileges: { type: "array", items: { type: "string" } }, on_object: { type: "string" }, object_type: { type: "string", enum: ["table", "schema", "sequence", "function"] } } } } },
        },
        responses: {
          200: ok("Privileges granted"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/roles/{name}/revoke": {
      post: {
        tags: ["Roles"],
        summary: "Revoke privileges",
        description: "Revoke specified privileges on a database object from a role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["privileges", "on_object"], properties: { privileges: { type: "array", items: { type: "string" } }, on_object: { type: "string" }, object_type: { type: "string", enum: ["table", "schema", "sequence", "function"] } } } } },
        },
        responses: {
          200: ok("Privileges revoked"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Performance (features.js) ───────────────────────────────────────
    "/api/performance/latency": {
      get: {
        tags: ["Performance"],
        summary: "Query latency stats",
        description: "Returns per-query latency statistics from pg_stat_statements.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Latency data"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/performance/index-advisor": {
      get: {
        tags: ["Performance"],
        summary: "Index advisor",
        description: "Suggests missing indexes based on sequential scan patterns and query statistics.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Index suggestions"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/performance/bloat": {
      get: {
        tags: ["Performance"],
        summary: "Table bloat analysis",
        description: "Estimates table and index bloat across the database.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Bloat estimates"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/performance/top-queries": {
      get: {
        tags: ["Performance"],
        summary: "Top queries by execution time",
        description: "Returns top queries from pg_stat_statements with sorting options. Requires the pg_stat_statements extension to be installed.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "sort", in: "query", schema: { type: "string", enum: ["total_time", "calls", "mean_time", "rows", "cache_hit"] }, description: "Sort order" },
          { name: "limit", in: "query", schema: { type: "integer", default: 25 }, description: "Number of queries to return (max 100)" },
        ],
        responses: { 200: ok("Top queries with stats"), 401: noSession, 500: noDb },
      },
    },

    "/api/performance/reset-stats": {
      post: {
        tags: ["Performance"],
        summary: "Reset query statistics",
        description: "Calls pg_stat_statements_reset() to clear accumulated query stats.",
        security: [{ SessionAuth: [] }],
        responses: { 200: ok("Stats reset"), 401: noSession, 500: noDb },
      },
    },

    // ─── RLS (features.js) ───────────────────────────────────────────────
    "/api/rls/policies": {
      get: {
        tags: ["RLS"],
        summary: "List RLS policies",
        description: "List all Row-Level Security policies across all tables.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("RLS policies"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/rls/tables": {
      get: {
        tags: ["RLS"],
        summary: "List RLS-enabled tables",
        description: "List tables with their RLS status (enabled/disabled, force flag).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Tables with RLS status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/rls/test": {
      post: {
        tags: ["RLS"],
        summary: "Test RLS policies",
        description: "Test Row-Level Security policies by executing a query as a specific role.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["schema", "table", "role"], properties: { schema: { type: "string" }, table: { type: "string" }, role: { type: "string" }, operation: { type: "string", enum: ["SELECT", "INSERT", "UPDATE", "DELETE"] } } } } },
        },
        responses: {
          200: ok("Test results"),
          400: err("Missing required fields"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/rls/matrix/{schema}/{table}": {
      get: {
        tags: ["RLS"],
        summary: "RLS permission matrix",
        description: "Generate a matrix of RLS policy effects per role for a given table.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Permission matrix"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Partitioning (features.js) ──────────────────────────────────────
    "/api/partitioning/advisor": {
      get: {
        tags: ["Partitioning"],
        summary: "Partitioning advisor",
        description: "Analyze tables and suggest partitioning strategies based on size and access patterns.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Partitioning suggestions"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Auth Providers (features.js) ────────────────────────────────────
    "/api/auth/providers/config": {
      get: {
        tags: ["Auth"],
        summary: "Get auth provider config",
        description: "Returns the current authentication provider configuration (social logins, OIDC, SAML).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Provider configuration"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Update auth provider config",
        description: "Update authentication provider settings (enable/disable social logins, configure OIDC).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Configuration updated"),
          400: err("Invalid configuration"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/auth/providers": {
      get: {
        tags: ["Auth"],
        summary: "List auth providers",
        description: "List all supported authentication providers with their enabled status.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Provider list"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/audit-logs": {
      get: {
        tags: ["Auth"],
        summary: "List auth audit logs",
        description: "List authentication-related audit logs (logins, registrations, password changes).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Auth audit logs"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Create auth audit entry",
        description: "Manually insert an authentication audit log entry.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["action"], properties: { action: { type: "string" }, actor: { type: "string" }, meta: { type: "object" } } } } },
        },
        responses: {
          200: ok("Audit entry created"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Backup Schedule & WAL (features.js) ─────────────────────────────
    "/api/backups/schedule": {
      get: {
        tags: ["Database"],
        summary: "Get backup schedule",
        description: "Returns the current automated backup schedule configuration.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Backup schedule"),
          401: noSession,
          500: noDb,
        },
      },
      put: {
        tags: ["Database"],
        summary: "Update backup schedule",
        description: "Configure the automated backup schedule (cron expression, retention).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { enabled: { type: "boolean" }, cron: { type: "string" }, retention_days: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Schedule updated"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups/wal-config": {
      get: {
        tags: ["Database"],
        summary: "Get WAL archiving config",
        description: "Returns the current WAL archiving configuration for point-in-time recovery.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("WAL config"),
          401: noSession,
          500: noDb,
        },
      },
      put: {
        tags: ["Database"],
        summary: "Update WAL archiving config",
        description: "Configure WAL archiving settings for continuous backup and PITR.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { enabled: { type: "boolean" }, archive_command: { type: "string" } } } } },
        },
        responses: {
          200: ok("WAL config updated"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups/pitr": {
      post: {
        tags: ["Database"],
        summary: "Point-in-time recovery",
        description: "Restore the database to a specific point in time using WAL archives.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["target_time"], properties: { target_time: { type: "string", format: "date-time" } } } } },
        },
        responses: {
          200: ok("Recovery initiated"),
          400: err("Invalid target time"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Modules (features.js) ───────────────────────────────────────────
    "/api/modules": {
      get: {
        tags: ["Management"],
        summary: "Get module status",
        description: "Returns all platform modules and their enabled/disabled state.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Module configuration"),
          401: noSession,
        },
      },
      put: {
        tags: ["Management"],
        summary: "Update module status",
        description: "Enable or disable platform modules.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", additionalProperties: { type: "boolean" } } } },
        },
        responses: {
          200: ok("Modules updated"),
          401: noSession,
        },
      },
    },

    // ─── Dashboard Auth (auth.js) ────────────────────────────────────────
    "/api/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Get current session",
        description: "Returns the current authenticated session info including identity and tenant.",
        responses: {
          200: ok("Session info"),
          401: noSession,
        },
      },
    },

    "/api/auth/permissions": {
      get: {
        tags: ["Auth"],
        summary: "Get user permissions",
        description: "Returns the current user's permissions and role within the organization.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Permissions"),
          401: noSession,
        },
      },
    },

    "/api/auth/login": {
      get: {
        tags: ["Auth"],
        summary: "Get login flow",
        description: "Initialize a new Ory Kratos login flow and return the flow ID and UI fields.",
        responses: {
          200: ok("Login flow"),
          500: noService("Kratos"),
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Submit login",
        description: "Submit login credentials (email + password) to complete the login flow.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["flow", "email", "password"], properties: { flow: { type: "string" }, email: { type: "string" }, password: { type: "string" } } } } },
        },
        responses: {
          200: ok("Login successful with session"),
          400: err("Invalid credentials"),
          500: noService("Kratos"),
        },
      },
    },

    "/api/auth/login/magic-link": {
      post: {
        tags: ["Auth"],
        summary: "Send magic link",
        description: "Send a passwordless login magic link to the given email address.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } },
        },
        responses: {
          200: ok("Magic link sent"),
          400: err("Invalid email"),
          500: noService("Kratos"),
        },
      },
    },

    "/api/auth/login/passkey": {
      get: {
        tags: ["Auth"],
        summary: "Get passkey login options",
        description: "Get WebAuthn credential request options for passkey login.",
        responses: {
          200: ok("Passkey options"),
          500: noService("Kratos"),
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Submit passkey login",
        description: "Submit a WebAuthn assertion response to complete passkey login.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Login successful"),
          400: err("Invalid assertion"),
          500: noService("Kratos"),
        },
      },
    },

    "/api/auth/register": {
      get: {
        tags: ["Auth"],
        summary: "Get registration flow",
        description: "Initialize a new Ory Kratos registration flow.",
        responses: {
          200: ok("Registration flow"),
          500: noService("Kratos"),
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Submit registration",
        description: "Submit registration data to create a new identity.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Registration successful"),
          400: err("Validation errors"),
          500: noService("Kratos"),
        },
      },
    },

    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        description: "Destroy the current session and clear session cookies.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Logged out"),
          401: noSession,
        },
      },
    },

    "/api/auth/recovery": {
      get: {
        tags: ["Auth"],
        summary: "Initialize recovery flow",
        description: "Creates a Kratos recovery flow for password reset.",
        responses: { 200: ok("Recovery flow initialized") },
      },
      post: {
        tags: ["Auth"],
        summary: "Submit recovery flow",
        description: "Submits a recovery flow to Kratos (email-based password reset).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { flowId: { type: "string" }, email: { type: "string" }, method: { type: "string" } } } } },
        },
        responses: { 200: ok("Recovery submitted"), 400: err("Invalid flow") },
      },
    },

    "/api/auth/settings": {
      get: {
        tags: ["Auth"],
        summary: "Get settings flow",
        description: "Initialize an Ory Kratos settings flow for updating profile or password.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Settings flow"),
          401: noSession,
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Submit settings",
        description: "Submit updated settings (profile fields, password change, etc.).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Settings updated"),
          400: err("Validation errors"),
          401: noSession,
        },
      },
    },

    // ─── MFA (auth.js) ──────────────────────────────────────────────────
    "/api/auth/mfa/status": {
      get: {
        tags: ["Auth"],
        summary: "Get MFA status",
        description: "Returns which MFA methods are configured for the current user (TOTP, WebAuthn, recovery codes).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("MFA status"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/totp/setup": {
      post: {
        tags: ["Auth"],
        summary: "Setup TOTP",
        description: "Initialize TOTP (authenticator app) setup and return the QR code / secret.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("TOTP setup data with QR code"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/totp/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify TOTP setup",
        description: "Verify a TOTP code to confirm authenticator app setup.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } },
        },
        responses: {
          200: ok("TOTP verified and enabled"),
          400: err("Invalid code"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/totp": {
      delete: {
        tags: ["Auth"],
        summary: "Remove TOTP",
        description: "Disable and remove TOTP authentication for the current user.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("TOTP removed"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/webauthn/setup": {
      post: {
        tags: ["Auth"],
        summary: "Setup WebAuthn",
        description: "Initialize WebAuthn credential creation and return registration options.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("WebAuthn registration options"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/webauthn/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify WebAuthn setup",
        description: "Submit the WebAuthn attestation response to complete security key registration.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("WebAuthn credential registered"),
          400: err("Invalid attestation"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/webauthn": {
      delete: {
        tags: ["Auth"],
        summary: "Remove WebAuthn",
        description: "Remove a WebAuthn security key from the current user.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("WebAuthn removed"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/recovery-codes/generate": {
      post: {
        tags: ["Auth"],
        summary: "Generate recovery codes",
        description: "Generate a new set of recovery codes for the current user. Previous codes are invalidated.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Recovery codes (shown only once)"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/recovery-codes/confirm": {
      post: {
        tags: ["Auth"],
        summary: "Confirm recovery codes",
        description: "Confirm that the user has saved their recovery codes by submitting one back.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } },
        },
        responses: {
          200: ok("Recovery codes confirmed"),
          400: err("Invalid code"),
          401: noSession,
        },
      },
    },

    "/api/auth/mfa/recovery-codes": {
      delete: {
        tags: ["Auth"],
        summary: "Remove recovery codes",
        description: "Remove all recovery codes for the current user.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Recovery codes removed"),
          401: noSession,
        },
      },
    },

    // ─── Auth Admin (auth.js) ────────────────────────────────────────────
    "/api/auth/login-history": {
      get: {
        tags: ["Auth"],
        summary: "Login history",
        description: "Returns recent login attempts with success/failure status, IP, and user agent. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Login history entries"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/stats": {
      get: {
        tags: ["Auth"],
        summary: "Auth statistics",
        description: "Returns authentication statistics: total identities, MAU, login success rate, MFA adoption. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Auth statistics"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/security-config": {
      get: {
        tags: ["Auth"],
        summary: "Security configuration",
        description: "Returns Kratos security configuration: password policy, session lifespan, CSRF settings. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Security config"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/schemas": {
      get: {
        tags: ["Auth"],
        summary: "List identity schemas",
        description: "List all configured identity schemas in Kratos. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Identity schemas"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/schemas/{id}": {
      get: {
        tags: ["Auth"],
        summary: "Get identity schema",
        description: "Get a specific identity schema by ID. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Identity schema"),
          404: { description: "Schema not found" },
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities": {
      get: {
        tags: ["Auth"],
        summary: "List identities (dashboard)",
        description: "List all identities with pagination and search. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "page_size", in: "query", schema: { type: "integer", default: 50 } },
          { name: "page_token", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", schema: { type: "string" }, description: "Search by email or name" },
        ],
        responses: {
          200: ok("Identity list"),
          401: noSession,
          403: adminOnly,
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Create identity",
        description: "Create a new identity with specified traits and optional credentials. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["traits"], properties: { traits: { type: "object" }, credentials: { type: "object" }, schema_id: { type: "string" } } } } },
        },
        responses: {
          200: ok("Identity created"),
          400: err("Validation error"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/batch-action": {
      post: {
        tags: ["Auth"],
        summary: "Batch identity action",
        description: "Perform a batch action on multiple identities (delete, ban, unban). Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["ids", "action"], properties: { ids: { type: "array", items: { type: "string" } }, action: { type: "string", enum: ["delete", "ban", "unban"] } } } } },
        },
        responses: {
          200: ok("Batch action completed"),
          400: err("Invalid action or empty IDs"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/state": {
      patch: {
        tags: ["Auth"],
        summary: "Update identity state",
        description: "Set an identity's state (active/inactive). Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["state"], properties: { state: { type: "string", enum: ["active", "inactive"] } } } } },
        },
        responses: {
          200: ok("State updated"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/metadata": {
      put: {
        tags: ["Auth"],
        summary: "Update identity metadata",
        description: "Update an identity's admin metadata. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Metadata updated"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/ban": {
      post: {
        tags: ["Auth"],
        summary: "Ban identity",
        description: "Ban an identity, preventing all future logins. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Identity banned"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/unban": {
      post: {
        tags: ["Auth"],
        summary: "Unban identity",
        description: "Remove ban from an identity, restoring login access. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Identity unbanned"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}": {
      get: {
        tags: ["Auth"],
        summary: "Get identity (dashboard)",
        description: "Get a single identity with full details including credentials and sessions. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Identity details"),
          404: { description: "Identity not found" },
          401: noSession,
          403: adminOnly,
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "Delete identity",
        description: "Permanently delete an identity and all associated sessions. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Identity deleted"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset identity password",
        description: "Set a new password for an identity. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["password"], properties: { password: { type: "string" } } } } },
        },
        responses: {
          200: ok("Password reset"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/sessions": {
      delete: {
        tags: ["Auth"],
        summary: "Revoke identity sessions",
        description: "Revoke all active sessions for an identity, forcing re-login. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Sessions revoked"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/impersonate": {
      post: {
        tags: ["Auth"],
        summary: "Impersonate identity",
        description: "Create a session as another identity for debugging purposes. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Impersonation session created"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/send-verification": {
      post: {
        tags: ["Auth"],
        summary: "Send verification email",
        description: "Send an email verification link to an identity. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Verification email sent"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/send-recovery": {
      post: {
        tags: ["Auth"],
        summary: "Send recovery email",
        description: "Send a password recovery email to an identity. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Recovery email sent"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/identities/{id}/create-recovery-link": {
      post: {
        tags: ["Auth"],
        summary: "Create recovery link",
        description: "Generate a one-time recovery link for an identity without sending email. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Recovery link"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/users/export": {
      get: {
        tags: ["Auth"],
        summary: "Export users",
        description: "Export all identities as JSON or CSV. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"], default: "json" } },
        ],
        responses: {
          200: { description: "User export file" },
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/users/import": {
      post: {
        tags: ["Auth"],
        summary: "Import users",
        description: "Bulk import identities from JSON. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["identities"], properties: { identities: { type: "array", items: { type: "object" } } } } } },
        },
        responses: {
          200: ok("Import results"),
          400: err("Invalid import data"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/sessions": {
      get: {
        tags: ["Auth"],
        summary: "List active sessions",
        description: "List all active sessions across all identities. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "page_size", in: "query", schema: { type: "integer", default: 50 } },
          { name: "page_token", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: ok("Session list"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/sessions/{id}": {
      delete: {
        tags: ["Auth"],
        summary: "Revoke session",
        description: "Revoke a specific session by ID. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Session revoked"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/sessions/{id}/extend": {
      patch: {
        tags: ["Auth"],
        summary: "Extend session",
        description: "Extend a session's expiry time. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Session extended"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/email-templates": {
      get: {
        tags: ["Auth"],
        summary: "Get email templates",
        description: "Returns the current email template configuration for verification, recovery, etc. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Email templates"),
          401: noSession,
          403: adminOnly,
        },
      },
      put: {
        tags: ["Auth"],
        summary: "Update email templates",
        description: "Update email templates for authentication flows. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Templates updated"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/webhooks": {
      get: {
        tags: ["Auth"],
        summary: "Get auth webhooks",
        description: "Returns Kratos webhook configuration for auth events. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Auth webhook config"),
          401: noSession,
          403: adminOnly,
        },
      },
      put: {
        tags: ["Auth"],
        summary: "Update auth webhooks",
        description: "Configure webhooks triggered by authentication events. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Webhooks updated"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/auth/webhooks/test": {
      post: {
        tags: ["Auth"],
        summary: "Test auth webhook",
        description: "Send a test event to the configured auth webhook URL. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } } } } },
        },
        responses: {
          200: ok("Test result"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    // ─── Keto Dashboard (keto.js + auth.js) ──────────────────────────────
    "/api/keto/health": {
      get: {
        tags: ["Auth"],
        summary: "Keto health check",
        description: "Check the health of the Ory Keto authorization service. Cached for 30 seconds.",
        responses: {
          200: ok("Keto health status"),
          502: { description: "Keto unreachable" },
          503: noService("Keto"),
        },
      },
    },

    "/api/keto/namespaces": {
      get: {
        tags: ["Auth"],
        summary: "List Keto namespaces",
        description: "List OPL namespaces, filtered to the current tenant's scope.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Namespace list"),
          401: noSession,
          503: noService("Keto"),
        },
      },
    },

    "/api/keto/relation-tuples": {
      get: {
        tags: ["Auth"],
        summary: "List relation tuples",
        description: "List authorization relation tuples with optional namespace, object, relation, and subject filters.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "namespace", in: "query", schema: { type: "string" } },
          { name: "object", in: "query", schema: { type: "string" } },
          { name: "relation", in: "query", schema: { type: "string" } },
          { name: "subject_id", in: "query", schema: { type: "string" } },
          { name: "page_size", in: "query", schema: { type: "integer" } },
          { name: "page_token", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: ok("Relation tuples"),
          401: noSession,
          502: { description: "Keto unreachable" },
        },
      },
      put: {
        tags: ["Auth"],
        summary: "Create relation tuple",
        description: "Create a new authorization relation tuple (scoped to tenant namespace).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["namespace", "object", "relation"], properties: { namespace: { type: "string" }, object: { type: "string" }, relation: { type: "string" }, subject_id: { type: "string" }, subject_set: { type: "object", properties: { namespace: { type: "string" }, object: { type: "string" }, relation: { type: "string" } } } } } } },
        },
        responses: {
          201: ok("Tuple created"),
          401: noSession,
          502: { description: "Keto write unreachable" },
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "Delete relation tuple",
        description: "Delete an authorization relation tuple by specifying namespace, object, relation, and subject.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "namespace", in: "query", required: true, schema: { type: "string" } },
          { name: "object", in: "query", required: true, schema: { type: "string" } },
          { name: "relation", in: "query", required: true, schema: { type: "string" } },
          { name: "subject_id", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: ok("Tuple deleted"),
          401: noSession,
          502: { description: "Keto write unreachable" },
        },
      },
    },

    "/api/keto/check": {
      post: {
        tags: ["Auth"],
        summary: "Check permission",
        description: "Check if a subject has a specific permission/relation on an object.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["namespace", "object", "relation"], properties: { namespace: { type: "string" }, object: { type: "string" }, relation: { type: "string" }, subject_id: { type: "string" }, subject_set: { type: "object" } } } } },
        },
        responses: {
          200: ok("Permission check result with allowed boolean"),
          401: noSession,
          502: { description: "Keto unreachable" },
        },
      },
    },

    "/api/keto/batch-check": {
      post: {
        tags: ["Auth"],
        summary: "Batch permission check",
        description: "Check multiple permissions at once (max 50 per batch).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["checks"], properties: { checks: { type: "array", maxItems: 50, items: { type: "object" } } } } } },
        },
        responses: {
          200: ok("Batch check results"),
          400: err("Invalid checks array"),
          401: noSession,
          502: { description: "Keto unreachable" },
        },
      },
    },

    "/api/keto/expand": {
      get: {
        tags: ["Auth"],
        summary: "Expand permission tree",
        description: "Expand a permission tree to see all subjects that have a relation on an object.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "namespace", in: "query", required: true, schema: { type: "string" } },
          { name: "object", in: "query", required: true, schema: { type: "string" } },
          { name: "relation", in: "query", required: true, schema: { type: "string" } },
          { name: "max-depth", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: ok("Permission tree"),
          401: noSession,
          502: { description: "Keto unreachable" },
        },
      },
    },

    "/api/keto/opl-versions": {
      get: {
        tags: ["Auth"],
        summary: "List OPL versions",
        description: "List saved OPL (Ory Permission Language) configuration snapshots.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "name", in: "query", schema: { type: "string", default: "default" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          200: ok("OPL versions with total count"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Auth"],
        summary: "Save OPL version",
        description: "Save a new OPL configuration snapshot.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["content"], properties: { name: { type: "string", default: "default" }, content: { type: "string" } } } } },
        },
        responses: {
          200: ok("OPL version saved"),
          400: err("Content is required"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/keto/subject-tuples/{subjectId}": {
      get: {
        tags: ["Auth"],
        summary: "Get subject tuples",
        description: "List all relation tuples where the given subject appears. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "subjectId", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Subject tuples"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/keto/who-can-access": {
      post: {
        tags: ["Auth"],
        summary: "Who can access",
        description: "Find all subjects who have a given relation on an object. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["namespace", "object", "relation"], properties: { namespace: { type: "string" }, object: { type: "string" }, relation: { type: "string" } } } } },
        },
        responses: {
          200: ok("Access list"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/keto/relation-tuples/batch-delete": {
      post: {
        tags: ["Auth"],
        summary: "Batch delete tuples",
        description: "Delete multiple relation tuples at once. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["tuples"], properties: { tuples: { type: "array", items: { type: "object" } } } } } },
        },
        responses: {
          200: ok("Tuples deleted"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/keto/relation-tuples/import": {
      post: {
        tags: ["Auth"],
        summary: "Import relation tuples",
        description: "Bulk import relation tuples from a JSON array. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["tuples"], properties: { tuples: { type: "array", items: { type: "object" } } } } } },
        },
        responses: {
          200: ok("Import results"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    // ─── Hydra Dashboard (hydra.js) ──────────────────────────────────────
    "/api/hydra/health": {
      get: {
        tags: ["OAuth2"],
        summary: "Hydra health check",
        description: "Check the health status of the Ory Hydra OAuth2 server.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Hydra health status"),
          502: { description: "Hydra unreachable" },
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/discovery": {
      get: {
        tags: ["OAuth2"],
        summary: "OIDC discovery (dashboard)",
        description: "Proxy the OpenID Connect well-known configuration.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("OIDC discovery document"),
          502: { description: "Hydra unreachable" },
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/jwks": {
      get: {
        tags: ["OAuth2"],
        summary: "Get JSON Web Key Sets",
        description: "Return the JWKS (JSON Web Key Set) used for token verification.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("JWKS"),
          502: { description: "Hydra unreachable" },
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/clients": {
      get: {
        tags: ["OAuth2"],
        summary: "List OAuth2 clients (dashboard)",
        description: "List all registered OAuth2 clients with pagination.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("OAuth2 clients"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
      post: {
        tags: ["OAuth2"],
        summary: "Create OAuth2 client (dashboard)",
        description: "Register a new OAuth2/OIDC client with specified grant types, scopes, and redirect URIs.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { client_name: { type: "string" }, grant_types: { type: "array", items: { type: "string" } }, response_types: { type: "array", items: { type: "string" } }, scope: { type: "string" }, redirect_uris: { type: "array", items: { type: "string" } }, token_endpoint_auth_method: { type: "string" } } } } },
        },
        responses: {
          201: ok("Client created with secret"),
          400: err("Invalid client configuration"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/clients/{id}": {
      get: {
        tags: ["OAuth2"],
        summary: "Get OAuth2 client",
        description: "Get details of a specific OAuth2 client.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Client details"),
          404: { description: "Client not found" },
          401: noSession,
          503: noService("Hydra"),
        },
      },
      put: {
        tags: ["OAuth2"],
        summary: "Update OAuth2 client",
        description: "Update an OAuth2 client's configuration (replaces all fields).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Client updated"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
      delete: {
        tags: ["OAuth2"],
        summary: "Delete OAuth2 client (dashboard)",
        description: "Delete an OAuth2 client and revoke all associated tokens.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Client deleted"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/clients/{id}/secret": {
      post: {
        tags: ["OAuth2"],
        summary: "Rotate client secret",
        description: "Generate a new client secret. The old secret is invalidated immediately.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("New secret (shown only once)"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/clients/{id}/token-config": {
      patch: {
        tags: ["OAuth2"],
        summary: "Update token configuration",
        description: "Update token lifespans and configuration for an OAuth2 client.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { access_token_ttl: { type: "string" }, refresh_token_ttl: { type: "string" }, id_token_ttl: { type: "string" } } } } },
        },
        responses: {
          200: ok("Token config updated"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/keys": {
      post: {
        tags: ["OAuth2"],
        summary: "Create JSON Web Key",
        description: "Create a new JSON Web Key in a named key set.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["set", "alg", "use"], properties: { set: { type: "string" }, alg: { type: "string" }, use: { type: "string", enum: ["sig", "enc"] } } } } },
        },
        responses: {
          201: ok("Key created"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/keys/{set}/{kid}": {
      delete: {
        tags: ["OAuth2"],
        summary: "Delete JSON Web Key",
        description: "Delete a specific key from a key set.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "set", in: "path", required: true, schema: { type: "string" } },
          { name: "kid", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Key deleted"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/consent/{subject}": {
      get: {
        tags: ["OAuth2"],
        summary: "List consent sessions",
        description: "List all OAuth2 consent sessions for a subject.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "subject", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: okArr("Consent sessions"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
      delete: {
        tags: ["OAuth2"],
        summary: "Revoke consent sessions",
        description: "Revoke all OAuth2 consent sessions for a subject.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "subject", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Consent sessions revoked"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/introspect": {
      post: {
        tags: ["OAuth2"],
        summary: "Introspect token",
        description: "Introspect an OAuth2 access token to check validity and claims.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } },
        },
        responses: {
          200: ok("Token introspection result"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/revoke": {
      post: {
        tags: ["OAuth2"],
        summary: "Revoke token",
        description: "Revoke an OAuth2 access or refresh token.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } },
        },
        responses: {
          200: ok("Token revoked"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/logout": {
      post: {
        tags: ["OAuth2"],
        summary: "OAuth2 logout",
        description: "Initiate an OAuth2 logout and revoke associated sessions.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["subject"], properties: { subject: { type: "string" } } } } },
        },
        responses: {
          200: ok("Logout completed"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/claims-config": {
      get: {
        tags: ["OAuth2"],
        summary: "Get claims config",
        description: "Returns the custom claims mapping configuration for ID tokens.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Claims configuration"),
          401: noSession,
        },
      },
      put: {
        tags: ["OAuth2"],
        summary: "Update claims config",
        description: "Update the custom claims mapping for ID tokens.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Claims config updated"),
          401: noSession,
        },
      },
    },

    "/api/hydra/flush": {
      post: {
        tags: ["OAuth2"],
        summary: "Flush expired tokens",
        description: "Delete expired OAuth2 tokens and login/consent requests.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Flush completed"),
          401: noSession,
          503: noService("Hydra"),
        },
      },
    },

    "/api/hydra/bridge/login": {
      get: {
        tags: ["OAuth2"],
        summary: "Bridge: handle login challenge",
        description: "Handle an OAuth2 login challenge from Hydra, bridging to Kratos authentication.",
        parameters: [
          { name: "login_challenge", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Login challenge handled"),
          302: { description: "Redirect to login UI or back to Hydra" },
        },
      },
    },

    "/api/hydra/bridge/consent": {
      get: {
        tags: ["OAuth2"],
        summary: "Bridge: handle consent challenge",
        description: "Handle an OAuth2 consent challenge, showing the consent screen.",
        parameters: [
          { name: "consent_challenge", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Consent challenge data"),
          302: { description: "Redirect to consent UI" },
        },
      },
    },

    "/api/hydra/bridge/consent/info": {
      get: {
        tags: ["OAuth2"],
        summary: "Bridge: get consent info",
        description: "Get details about a consent challenge for rendering the consent UI.",
        parameters: [
          { name: "consent_challenge", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Consent challenge details"),
        },
      },
    },

    "/api/hydra/bridge/consent/accept": {
      post: {
        tags: ["OAuth2"],
        summary: "Bridge: accept consent",
        description: "Accept an OAuth2 consent request, granting the requested scopes.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["consent_challenge"], properties: { consent_challenge: { type: "string" }, grant_scope: { type: "array", items: { type: "string" } }, remember: { type: "boolean" } } } } },
        },
        responses: {
          200: ok("Consent accepted with redirect URL"),
        },
      },
    },

    "/api/hydra/bridge/consent/reject": {
      post: {
        tags: ["OAuth2"],
        summary: "Bridge: reject consent",
        description: "Reject an OAuth2 consent request.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["consent_challenge"], properties: { consent_challenge: { type: "string" }, error: { type: "string" } } } } },
        },
        responses: {
          200: ok("Consent rejected with redirect URL"),
        },
      },
    },

    "/api/hydra/bridge/status": {
      get: {
        tags: ["OAuth2"],
        summary: "Bridge: Kratos-Hydra bridge status",
        description: "Check the status of the Kratos-Hydra consent bridge.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Bridge status"),
          401: noSession,
        },
      },
    },

    // ─── Oathkeeper Dashboard (oathkeeper.js) ────────────────────────────
    "/api/oathkeeper/health": {
      get: {
        tags: ["Gateway"],
        summary: "Oathkeeper health (dashboard)",
        description: "Check the health of the Ory Oathkeeper API Gateway.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Gateway health"),
          502: { description: "Oathkeeper unreachable" },
          503: noService("Oathkeeper"),
        },
      },
    },

    "/api/oathkeeper/rules": {
      get: {
        tags: ["Gateway"],
        summary: "List gateway rules (dashboard)",
        description: "List all access rules configured in the API Gateway.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Gateway rules"),
          401: noSession,
          503: noService("Oathkeeper"),
        },
      },
      put: {
        tags: ["Gateway"],
        summary: "Create/update gateway rule",
        description: "Create or update an Oathkeeper access rule. Subject to plan gateway rule limits (Starter: 50, Pro: 150, Team: 500, Business: unlimited).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Rule saved"),
          401: noSession,
          403: { description: "QUOTA_EXCEEDED — gateway rule limit reached for current plan" },
          503: noService("Oathkeeper"),
        },
      },
    },

    "/api/oathkeeper/rules/{id}": {
      get: {
        tags: ["Gateway"],
        summary: "Get gateway rule",
        description: "Get a specific gateway access rule by ID.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Rule details"),
          404: { description: "Rule not found" },
          401: noSession,
          503: noService("Oathkeeper"),
        },
      },
      delete: {
        tags: ["Gateway"],
        summary: "Delete gateway rule",
        description: "Delete an Oathkeeper access rule.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Rule deleted"),
          401: noSession,
          503: noService("Oathkeeper"),
        },
      },
    },

    "/api/oathkeeper/credentials": {
      get: {
        tags: ["Gateway"],
        summary: "List credentials",
        description: "List Oathkeeper mutator credentials configuration.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Credentials config"),
          401: noSession,
          503: noService("Oathkeeper"),
        },
      },
    },

    "/api/oathkeeper/version": {
      get: {
        tags: ["Gateway"],
        summary: "Oathkeeper version",
        description: "Get the Oathkeeper version string.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Version info"),
          503: noService("Oathkeeper"),
        },
      },
    },

    "/api/oathkeeper/judge": {
      post: {
        tags: ["Gateway"],
        summary: "Judge request",
        description: "Submit a request to the Oathkeeper judge endpoint to test access rules.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["method", "url"], properties: { method: { type: "string" }, url: { type: "string" }, headers: { type: "object" } } } } },
        },
        responses: {
          200: ok("Judge result"),
          401: noSession,
          503: noService("Oathkeeper"),
        },
      },
    },

    // ─── Storage Dashboard (storage.js) ──────────────────────────────────
    "/api/storage/buckets": {
      get: {
        tags: ["Storage"],
        summary: "List buckets (dashboard)",
        description: "List all S3 storage buckets with object counts and sizes.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Bucket list"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
      post: {
        tags: ["Storage"],
        summary: "Create bucket",
        description: "Create a new S3-compatible storage bucket.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", pattern: "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$" } } } } },
        },
        responses: {
          200: ok("Bucket created"),
          400: err("Invalid bucket name or already exists"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}": {
      delete: {
        tags: ["Storage"],
        summary: "Delete bucket",
        description: "Delete a storage bucket. Bucket must be empty unless force is specified.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Bucket deleted"),
          400: err("Bucket not empty"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects": {
      get: {
        tags: ["Storage"],
        summary: "List objects",
        description: "List objects in a bucket with optional prefix filtering and pagination.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "name", in: "path", required: true, schema: { type: "string" } },
          { name: "prefix", in: "query", schema: { type: "string" } },
          { name: "delimiter", in: "query", schema: { type: "string", default: "/" } },
          { name: "max_keys", in: "query", schema: { type: "integer", default: 1000 } },
          { name: "continuation_token", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: ok("Object list with common prefixes"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
      delete: {
        tags: ["Storage"],
        summary: "Delete object",
        description: "Delete a single object from a bucket.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "name", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Object deleted"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/presign-upload": {
      post: {
        tags: ["Storage"],
        summary: "Presign upload URL",
        description: "Generate a presigned URL for uploading an object directly to S3.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key"], properties: { key: { type: "string" }, content_type: { type: "string" }, expires_in: { type: "integer", default: 3600 } } } } },
        },
        responses: {
          200: ok("Presigned upload URL"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/presign-download": {
      post: {
        tags: ["Storage"],
        summary: "Presign download URL",
        description: "Generate a presigned URL for downloading an object.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key"], properties: { key: { type: "string" }, expires_in: { type: "integer", default: 3600 } } } } },
        },
        responses: {
          200: ok("Presigned download URL"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/mkdir": {
      post: {
        tags: ["Storage"],
        summary: "Create folder",
        description: "Create a folder (zero-byte object with trailing slash) in a bucket.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["prefix"], properties: { prefix: { type: "string" } } } } },
        },
        responses: {
          200: ok("Folder created"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/bulk-delete": {
      post: {
        tags: ["Storage"],
        summary: "Bulk delete objects",
        description: "Delete multiple objects from a bucket at once.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["keys"], properties: { keys: { type: "array", items: { type: "string" } } } } } },
        },
        responses: {
          200: ok("Delete results"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/url-diagnostics": {
      post: {
        tags: ["Storage"],
        summary: "URL diagnostics",
        description: "Diagnose object URL accessibility by testing public and presigned URLs.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key"], properties: { key: { type: "string" } } } } },
        },
        responses: {
          200: ok("URL diagnostics results"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/upload-text": {
      post: {
        tags: ["Storage"],
        summary: "Upload text content",
        description: "Upload text content directly as an object (for creating files in the browser).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key", "content"], properties: { key: { type: "string" }, content: { type: "string" }, content_type: { type: "string", default: "text/plain" } } } } },
        },
        responses: {
          200: ok("Object uploaded"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/metadata": {
      get: {
        tags: ["Storage"],
        summary: "Get object metadata",
        description: "Get metadata (size, content type, last modified, custom metadata) for an object.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "name", in: "path", required: true, schema: { type: "string" } },
          { name: "key", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Object metadata"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
      patch: {
        tags: ["Storage"],
        summary: "Update object metadata",
        description: "Update custom metadata for an object (copy-on-write).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key", "metadata"], properties: { key: { type: "string" }, metadata: { type: "object" } } } } },
        },
        responses: {
          200: ok("Metadata updated"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/policy": {
      get: {
        tags: ["Storage"],
        summary: "Get bucket policy",
        description: "Get the S3 bucket policy JSON.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Bucket policy"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
      put: {
        tags: ["Storage"],
        summary: "Set bucket policy",
        description: "Set the S3 bucket policy. Pass a valid S3 policy JSON document.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Policy set"),
          400: err("Invalid policy"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/cors": {
      get: {
        tags: ["Storage"],
        summary: "Get CORS config",
        description: "Get the CORS configuration for a bucket.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("CORS config"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
      put: {
        tags: ["Storage"],
        summary: "Set CORS config",
        description: "Set CORS rules for a bucket.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("CORS config updated"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/multipart/init": {
      post: {
        tags: ["Storage"],
        summary: "Initiate multipart upload",
        description: "Start a multipart upload and get an upload ID.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key"], properties: { key: { type: "string" }, content_type: { type: "string" } } } } },
        },
        responses: {
          200: ok("Upload ID"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/multipart/presign-part": {
      post: {
        tags: ["Storage"],
        summary: "Presign part upload",
        description: "Get a presigned URL for uploading a single part of a multipart upload.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key", "upload_id", "part_number"], properties: { key: { type: "string" }, upload_id: { type: "string" }, part_number: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Presigned part URL"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/multipart/complete": {
      post: {
        tags: ["Storage"],
        summary: "Complete multipart upload",
        description: "Complete a multipart upload by providing the list of parts and ETags.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key", "upload_id", "parts"], properties: { key: { type: "string" }, upload_id: { type: "string" }, parts: { type: "array", items: { type: "object", properties: { PartNumber: { type: "integer" }, ETag: { type: "string" } } } } } } } },
        },
        responses: {
          200: ok("Upload completed"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    "/api/storage/buckets/{name}/objects/multipart/abort": {
      post: {
        tags: ["Storage"],
        summary: "Abort multipart upload",
        description: "Abort an in-progress multipart upload and clean up uploaded parts.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["key", "upload_id"], properties: { key: { type: "string" }, upload_id: { type: "string" } } } } },
        },
        responses: {
          200: ok("Upload aborted"),
          401: noSession,
          503: noService("MinIO"),
        },
      },
    },

    // ─── Webhooks Dashboard (webhooks.js) ────────────────────────────────
    "/api/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List webhooks (dashboard)",
        description: "List all webhooks with delivery statistics.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Webhook list"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Webhooks"],
        summary: "Create webhook",
        description: "Create a new webhook for database change notifications.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "url", "table_schema", "table_name", "events"], properties: { name: { type: "string" }, url: { type: "string", format: "uri" }, table_schema: { type: "string" }, table_name: { type: "string" }, events: { type: "array", items: { type: "string", enum: ["INSERT", "UPDATE", "DELETE"] } }, headers: { type: "object" }, active: { type: "boolean", default: true } } } } },
        },
        responses: {
          200: ok("Webhook created"),
          400: err("Missing required fields"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/webhooks/{id}": {
      patch: {
        tags: ["Webhooks"],
        summary: "Update webhook",
        description: "Update an existing webhook's URL, events, headers, or active state.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, events: { type: "array", items: { type: "string" } }, headers: { type: "object" }, active: { type: "boolean" } } } } },
        },
        responses: {
          200: ok("Webhook updated"),
          404: { description: "Webhook not found" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Webhooks"],
        summary: "Delete webhook",
        description: "Delete a webhook and its associated trigger function and logs.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Webhook deleted"),
          404: { description: "Webhook not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/webhooks/{id}/test": {
      post: {
        tags: ["Webhooks"],
        summary: "Test webhook",
        description: "Send a test payload to the webhook's URL and return the response.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Test delivery result"),
          404: { description: "Webhook not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/webhooks/{id}/logs": {
      get: {
        tags: ["Webhooks"],
        summary: "Get webhook logs",
        description: "List delivery logs for a specific webhook.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: {
          200: okArr("Delivery logs"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/webhooks/{id}/replay/{logId}": {
      post: {
        tags: ["Webhooks"],
        summary: "Replay webhook delivery",
        description: "Re-send a previous webhook delivery using the original payload.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "logId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          200: ok("Replay result"),
          404: { description: "Webhook or log not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Realtime Dashboard (realtime.js) ────────────────────────────────
    "/api/realtime/subscriptions": {
      get: {
        tags: ["Realtime"],
        summary: "List subscriptions",
        description: "List all active realtime subscriptions.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Subscriptions"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/realtime/subscribe": {
      post: {
        tags: ["Realtime"],
        summary: "Create subscription",
        description: "Create a new realtime subscription on a table for specific events.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["table_schema", "table_name", "events"], properties: { table_schema: { type: "string" }, table_name: { type: "string" }, events: { type: "array", items: { type: "string", enum: ["INSERT", "UPDATE", "DELETE"] } }, filter: { type: "string" } } } } },
        },
        responses: {
          200: ok("Subscription created"),
          400: err("Invalid subscription parameters"),
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Realtime"],
        summary: "Delete subscription",
        description: "Remove a realtime subscription.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Subscription removed"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/realtime/events": {
      get: {
        tags: ["Realtime"],
        summary: "Get recent events",
        description: "Get the recent realtime event log.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Recent events"),
          401: noSession,
        },
      },
    },

    "/api/realtime/status": {
      get: {
        tags: ["Realtime"],
        summary: "Realtime engine status (dashboard)",
        description: "Get listener status, connected clients, active channels, and subscriptions.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Realtime status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/realtime/clear-log": {
      post: {
        tags: ["Realtime"],
        summary: "Clear event log",
        description: "Clear the in-memory realtime event log.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Log cleared"),
          401: noSession,
        },
      },
    },

    "/api/realtime/tables": {
      get: {
        tags: ["Realtime"],
        summary: "List subscribable tables",
        description: "List tables available for realtime subscriptions.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Tables"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Search (search.js) ──────────────────────────────────────────────
    "/api/search/configs": {
      get: {
        tags: ["Search"],
        summary: "List search configs",
        description: "List all full-text search configurations (dictionaries, parsers, templates).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Search configurations"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/search/indexes": {
      get: {
        tags: ["Search"],
        summary: "List search indexes",
        description: "List all GIN/GiST indexes used for full-text search.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Search indexes"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/search/columns": {
      get: {
        tags: ["Search"],
        summary: "List searchable columns",
        description: "List columns that have tsvector type or full-text search indexes.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Searchable columns"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/search/eligible": {
      get: {
        tags: ["Search"],
        summary: "List eligible tables",
        description: "List tables with text columns eligible for full-text search indexing.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Eligible tables"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/search/test": {
      post: {
        tags: ["Search"],
        summary: "Test search query",
        description: "Execute a full-text search query against a table and return matching rows with highlights.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["table", "query"], properties: { table: { type: "string" }, query: { type: "string" }, config: { type: "string", default: "english" }, column: { type: "string" }, limit: { type: "integer", default: 20 } } } } },
        },
        responses: {
          200: ok("Search results with highlights"),
          400: err("Invalid query"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/search/setup": {
      post: {
        tags: ["Search"],
        summary: "Setup search index",
        description: "Create a tsvector column and GIN index on a table for full-text search.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["schema", "table", "columns"], properties: { schema: { type: "string" }, table: { type: "string" }, columns: { type: "array", items: { type: "string" } }, config: { type: "string", default: "english" }, weights: { type: "object" } } } } },
        },
        responses: {
          200: ok("Search index created"),
          400: err("Invalid configuration"),
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Search"],
        summary: "Remove search index",
        description: "Drop the tsvector column and associated index from a table.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["schema", "table"], properties: { schema: { type: "string" }, table: { type: "string" } } } } },
        },
        responses: {
          200: ok("Search index removed"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Vectors (vectors.js) ────────────────────────────────────────────
    "/api/vectors/status": {
      get: {
        tags: ["Vectors"],
        summary: "pgvector status",
        description: "Check if the pgvector extension is installed and get version info.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("pgvector status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/enable": {
      post: {
        tags: ["Vectors"],
        summary: "Enable pgvector",
        description: "Install the pgvector extension (CREATE EXTENSION vector).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("pgvector enabled"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections": {
      get: {
        tags: ["Vectors"],
        summary: "List vector collections",
        description: "List all tables containing vector columns with dimension and index info.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Vector collections"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Vectors"],
        summary: "Create vector collection",
        description: "Create a new table with an id, vector embedding column, and optional metadata column.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name", "dimensions"], properties: { name: { type: "string" }, schema: { type: "string", default: "public" }, dimensions: { type: "integer" }, metadata_columns: { type: "array", items: { type: "object" } } } } } },
        },
        responses: {
          200: ok("Collection created"),
          400: err("Invalid parameters"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections/{schema}/{table}": {
      get: {
        tags: ["Vectors"],
        summary: "Get vector collection details",
        description: "Get detailed info about a vector collection including columns, indexes, and row count.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Collection details"),
          404: { description: "Collection not found" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Vectors"],
        summary: "Delete vector collection",
        description: "Drop the vector collection table.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Collection deleted"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections/{schema}/{table}/items": {
      get: {
        tags: ["Vectors"],
        summary: "List vector items",
        description: "List items in a vector collection with pagination.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: {
          200: ok("Vector items"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections/{schema}/{table}/search": {
      post: {
        tags: ["Vectors"],
        summary: "Vector similarity search",
        description: "Search for similar vectors using cosine distance, L2 distance, or inner product.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["vector"], properties: { vector: { type: "array", items: { type: "number" } }, metric: { type: "string", enum: ["cosine", "l2", "inner_product"], default: "cosine" }, limit: { type: "integer", default: 10 }, filter: { type: "string" } } } } },
        },
        responses: {
          200: ok("Similar vectors with distances"),
          400: err("Invalid vector or parameters"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections/{schema}/{table}/indexes": {
      post: {
        tags: ["Vectors"],
        summary: "Create vector index",
        description: "Create an IVFFlat or HNSW index on a vector column for faster similarity search.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { type: { type: "string", enum: ["ivfflat", "hnsw"], default: "hnsw" }, metric: { type: "string", enum: ["cosine", "l2", "inner_product"], default: "cosine" }, lists: { type: "integer" }, m: { type: "integer" }, ef_construction: { type: "integer" } } } } },
        },
        responses: {
          200: ok("Index created"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/vectors/collections/{schema}/{table}/indexes/{name}": {
      delete: {
        tags: ["Vectors"],
        summary: "Delete vector index",
        description: "Drop a vector index by name.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "schema", in: "path", required: true, schema: { type: "string" } },
          { name: "table", in: "path", required: true, schema: { type: "string" } },
          { name: "name", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Index deleted"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Branches (branches.js) ──────────────────────────────────────────
    "/api/branches": {
      get: {
        tags: ["Database"],
        summary: "List branches (dashboard)",
        description: "List active database branches with size and connection info.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Branch list"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Database"],
        summary: "Create branch",
        description: "Create a new database branch by cloning the current database via pg_dump/restore.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["label"], properties: { label: { type: "string" }, ttl_hours: { type: "integer", default: 24 } } } } },
        },
        responses: {
          200: ok("Branch created"),
          400: err("Invalid label or limit reached"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/branches/{id}": {
      delete: {
        tags: ["Database"],
        summary: "Delete branch",
        description: "Delete a database branch and drop its backing database.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Branch deleted"),
          404: { description: "Branch not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/branches/{id}/connection-string": {
      get: {
        tags: ["Database"],
        summary: "Get branch connection string",
        description: "Returns the full connection string for a database branch.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Connection string"),
          404: { description: "Branch not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups": {
      get: {
        tags: ["Database"],
        summary: "List backups (dashboard)",
        description: "List the most recent database backups.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Backup list"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups/snapshot": {
      post: {
        tags: ["Database"],
        summary: "Create backup snapshot",
        description: "Trigger an immediate database backup via pg_dump.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Backup started"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups/{id}/restore": {
      post: {
        tags: ["Database"],
        summary: "Restore backup",
        description: "Restore the database from a specific backup. Creates a new branch with restored data.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Restore initiated"),
          404: { description: "Backup not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/backups/{id}": {
      delete: {
        tags: ["Database"],
        summary: "Delete backup",
        description: "Delete a backup file.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Backup deleted"),
          404: { description: "Backup not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/pool/stats": {
      get: {
        tags: ["Database"],
        summary: "Connection pool stats",
        description: "Get database connection pool statistics (total, idle, waiting, max).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Pool statistics"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/consumption": {
      get: {
        tags: ["Management"],
        summary: "Current consumption",
        description: "Get current resource consumption (database size, storage, bandwidth, MAU).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Consumption data"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/consumption/history": {
      get: {
        tags: ["Management"],
        summary: "Consumption history",
        description: "Get historical consumption data from usage snapshots.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", default: 30 } },
        ],
        responses: {
          200: ok("Historical consumption"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/consumption/live": {
      get: {
        tags: ["Management"],
        summary: "Live consumption metrics",
        description: "Get in-memory live consumption metrics (queries, bandwidth) since last restart.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Live metrics"),
          401: noSession,
        },
      },
    },

    // ─── Saved Connections (connections.js) ───────────────────────────────
    "/api/connections": {
      get: {
        tags: ["Connections"],
        summary: "List saved connections",
        description: "List all saved database connection configurations.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Saved connections"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Connections"],
        summary: "Save connection",
        description: "Save a database connection configuration with encrypted credentials.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["label", "connection_string"], properties: { label: { type: "string" }, connection_string: { type: "string" }, color: { type: "string" } } } } },
        },
        responses: {
          200: ok("Connection saved"),
          400: err("Missing label or connection string"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/connections/{id}": {
      delete: {
        tags: ["Connections"],
        summary: "Delete saved connection",
        description: "Delete a saved database connection configuration.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Connection deleted"),
          404: { description: "Connection not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Projects (projects.js) ──────────────────────────────────────────
    "/api/projects/provision": {
      post: {
        tags: ["Projects"],
        summary: "Provision project",
        description: "Provision a new project with database, storage bucket, and API keys.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, region: { type: "string" }, db_mode: { type: "string", enum: ["shared", "dedicated"] } } } } },
        },
        responses: {
          200: ok("Project provisioned"),
          400: err("Invalid name or quota exceeded"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects (dashboard)",
        description: "List all projects for the current tenant.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Project list"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/projects/by-slug/{slug}": {
      get: {
        tags: ["Projects"],
        summary: "Get project by slug",
        description: "Look up a project by its URL slug.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Project details"),
          404: { description: "Project not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/projects/{id}": {
      get: {
        tags: ["Projects"],
        summary: "Get project (dashboard)",
        description: "Get project details including API keys, tables, and storage info.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Project details"),
          404: { description: "Project not found" },
          401: noSession,
          500: noDb,
        },
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project (dashboard)",
        description: "Update project name or status.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, status: { type: "string", enum: ["active", "paused"] } } } } },
        },
        responses: {
          200: ok("Project updated"),
          404: { description: "Project not found" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete project",
        description: "Soft-delete a project (marks as deleted, schedules cleanup).",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Project deleted"),
          404: { description: "Project not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/admin/stats": {
      get: {
        tags: ["Admin"],
        summary: "Admin statistics",
        description: "Platform-wide statistics including tenant count, total DB size, and revenue. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Admin stats"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    // ─── Dashboard Keys (client-api.js) ──────────────────────────────────
    "/api/keys": {
      get: {
        tags: ["Keys"],
        summary: "List API keys (dashboard)",
        description: "List all API keys for the current tenant.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("API keys"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Keys"],
        summary: "Create API key (dashboard)",
        description: "Generate a new API key. The full secret is returned only once.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { key_type: { type: "string", enum: ["anon", "service_role"] }, label: { type: "string" } } } } },
        },
        responses: {
          201: ok("Key created with secret"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/keys/{id}": {
      delete: {
        tags: ["Keys"],
        summary: "Revoke API key (dashboard)",
        description: "Soft-delete an API key by marking it as revoked.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: ok("Key revoked"),
          404: { description: "Key not found" },
          401: noSession,
          500: noDb,
        },
      },
      patch: {
        tags: ["Keys"],
        summary: "Update API key label",
        description: "Update the label of an API key.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { label: { type: "string" } } } } },
        },
        responses: {
          200: ok("Key updated"),
          404: { description: "Key not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Settings (settings.js) ─────────────────────────────────────────
    "/api/integrations/status": {
      get: {
        tags: ["Management"],
        summary: "Integration status",
        description: "Health check for all integrations: database, Kratos, Keto, Hydra, Oathkeeper, MinIO.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Integration health status"),
          401: noSession,
        },
      },
    },

    "/api/settings/general": {
      get: {
        tags: ["Settings"],
        summary: "Get general settings",
        description: "Returns general platform settings (project name, timezone, etc.).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("General settings"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Settings"],
        summary: "Update general settings",
        description: "Update general platform settings.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: ok("Settings updated"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/smtp": {
      get: {
        tags: ["Settings"],
        summary: "Get SMTP settings",
        description: "Returns SMTP configuration (host, port, sender) with password masked.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("SMTP settings"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Settings"],
        summary: "Update SMTP settings",
        description: "Configure SMTP settings for outbound emails.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["host", "port", "from_email"], properties: { host: { type: "string" }, port: { type: "integer" }, from_email: { type: "string" }, from_name: { type: "string" }, username: { type: "string" }, password: { type: "string" } } } } },
        },
        responses: {
          200: ok("SMTP settings updated"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/test-email": {
      post: {
        tags: ["Settings"],
        summary: "Send test email",
        description: "Send a test email to verify SMTP configuration.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["to"], properties: { to: { type: "string", format: "email" } } } } },
        },
        responses: {
          200: ok("Test email sent"),
          400: err("SMTP not configured"),
          401: noSession,
        },
      },
    },

    "/api/audit-logs": {
      get: {
        tags: ["Audit"],
        summary: "Search audit logs (dashboard)",
        description: "Query audit logs with optional filters by action, resource, and time range.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "action", in: "query", schema: { type: "string" } },
          { name: "since", in: "query", schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          200: ok("Audit log entries"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/danger/clear-saved-queries": {
      post: {
        tags: ["Settings"],
        summary: "Clear saved queries",
        description: "Delete all saved queries. Danger zone operation.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Saved queries cleared"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/danger/clear-usage-snapshots": {
      post: {
        tags: ["Settings"],
        summary: "Clear usage snapshots",
        description: "Delete all usage snapshot history. Danger zone operation.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Snapshots cleared"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/danger/clear-audit-logs": {
      post: {
        tags: ["Settings"],
        summary: "Clear audit logs",
        description: "Delete all audit log entries. Danger zone operation.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Audit logs cleared"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/metrics/services": {
      get: {
        tags: ["Management"],
        summary: "Service metrics",
        description: "Get resource metrics for all integrated services.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Service metrics"),
          401: noSession,
        },
      },
    },

    // ─── Admin Analytics (admin-analytics.js) ────────────────────────────
    "/api/admin/analytics/overview": {
      get: {
        tags: ["Admin"],
        summary: "Analytics overview",
        description: "Platform-wide analytics: total tenants, revenue, API calls, errors. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Analytics overview"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/analytics/feature-usage": {
      get: {
        tags: ["Admin"],
        summary: "Feature usage analytics",
        description: "Breakdown of which features are most used across all tenants. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Feature usage data"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/analytics/errors": {
      get: {
        tags: ["Admin"],
        summary: "Error analytics",
        description: "Aggregate error rates by type and endpoint across the platform. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Error analytics"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/analytics/api-volume": {
      get: {
        tags: ["Admin"],
        summary: "API volume analytics",
        description: "API call volume over time with per-endpoint breakdown. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("API volume data"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/analytics/tenants": {
      get: {
        tags: ["Admin"],
        summary: "Tenant analytics",
        description: "Per-tenant resource usage, API activity, and billing status. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Tenant analytics"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/orgs": {
      get: {
        tags: ["Admin"],
        summary: "List organizations",
        description: "List all organizations with member counts and subscription info. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Organizations"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/orgs/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get organization details",
        description: "Get detailed information about an organization including members and projects. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Organization details"),
          404: { description: "Organization not found" },
          401: noSession,
          403: adminOnly,
        },
      },
    },

    "/api/admin/tenant-databases": {
      get: {
        tags: ["Admin"],
        summary: "List tenant databases",
        description: "List all tenant databases with size and connection info. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Tenant databases"),
          401: noSession,
          403: adminOnly,
        },
      },
    },

    // ─── Sample App (sample-app.js) ──────────────────────────────────────
    "/api/sample-app/status": {
      get: {
        tags: ["SampleApp"],
        summary: "Sample app status",
        description: "Check if the sample application data is loaded.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Sample app status"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sample-app/load": {
      post: {
        tags: ["SampleApp"],
        summary: "Load sample data",
        description: "Load the sample application schema and seed data into the database.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Sample data loaded"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/sample-app/unload": {
      delete: {
        tags: ["SampleApp"],
        summary: "Unload sample data",
        description: "Remove all sample application tables and data from the database.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Sample data removed"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Dev Mode (dev.js) ───────────────────────────────────────────────
    "/api/dev/tenants": {
      get: {
        tags: ["Dev"],
        summary: "List dev tenants",
        description: "List available development tenants. Only active in dev mode.",
        responses: {
          200: okArr("Dev tenants"),
          403: { description: "Not in dev mode" },
        },
      },
    },

    "/api/dev/switch-tenant": {
      post: {
        tags: ["Dev"],
        summary: "Switch dev tenant",
        description: "Switch the current session to a different development tenant. Sets a tenant cookie.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["tenant_id"], properties: { tenant_id: { type: "string" } } } } },
        },
        responses: {
          200: ok("Tenant switched"),
          400: err("Invalid tenant ID"),
          403: { description: "Not in dev mode" },
        },
      },
    },

    "/api/dev/status": {
      get: {
        tags: ["Dev"],
        summary: "Dev mode status",
        description: "Returns dev mode status and current tenant information.",
        responses: {
          200: ok("Dev status"),
        },
      },
    },

    // ─── Notification Preferences ──────────────────────────
    "/api/settings/notifications": {
      get: {
        tags: ["Settings"],
        summary: "Get notification preferences",
        description: "Returns the current tenant's notification preferences (security, usage, billing, team, deploy emails).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Notification preferences"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Settings"],
        summary: "Update notification preferences",
        description: "Update notification preference toggles for the current tenant.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["prefs"], properties: { prefs: { type: "object", properties: { security_email: { type: "boolean" }, usage_email: { type: "boolean" }, billing_email: { type: "boolean" }, team_email: { type: "boolean" }, deploy_email: { type: "boolean" } } } } } } },
        },
        responses: {
          200: ok("Preferences updated"),
          400: err("Invalid preferences"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Export (billing.js) ─────────────────────────────────────────────
    "/api/settings/export-sizes": {
      get: {
        tags: ["Settings"],
        summary: "Get export sizes",
        description: "Returns estimated export sizes for database, storage, and auth identity data.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Export size estimates", content: { "application/json": { schema: { type: "object", properties: { database_mb: { type: "number" }, storage_mb: { type: "number" }, storage_objects: { type: "integer" }, auth_identities: { type: "integer" } } } } } },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/settings/export": {
      post: {
        tags: ["Settings"],
        summary: "Export data",
        description: "Export platform data by type: config (settings + webhooks + saved queries), auth (Kratos identities), database (instructions), or storage (instructions).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["type"], properties: { type: { type: "string", enum: ["database", "storage", "auth", "config"] } } } } },
        },
        responses: {
          200: { description: "Exported data as JSON download or instructions" },
          400: err("Invalid export type or service not configured"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Danger Zone: Reset Settings (billing.js) ────────────────────────
    "/api/settings/danger/reset-settings": {
      post: {
        tags: ["Settings"],
        summary: "Reset all settings",
        description: "Delete all billing_config settings except plan and subscription fields. Irreversible.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Settings reset", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, cleared: { type: "integer" } } } } } },
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Account Deletion (billing.js) ───────────────────────────────────
    "/api/settings/account": {
      delete: {
        tags: ["Settings"],
        summary: "Delete account",
        description: "Permanently delete the current tenant's account, data, and Kratos identity. Requires email confirmation.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["confirm_email"], properties: { confirm_email: { type: "string", format: "email", description: "Must match the account email" } } } } },
        },
        responses: {
          200: ok("Account deleted"),
          400: err("Email confirmation does not match"),
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Organizations (orgs.js) ─────────────────────────────────────────
    "/api/orgs": {
      get: {
        tags: ["Organizations"],
        summary: "List organizations",
        description: "List all organizations the current tenant belongs to, with role and member count.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Organization list", content: { "application/json": { schema: { type: "object", properties: { orgs: { type: "array", items: { type: "object" } } } } } } },
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Organizations"],
        summary: "Create organization",
        description: "Create a new organization. The creating tenant becomes the owner.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, slug: { type: "string" } } } } },
        },
        responses: {
          201: ok("Organization created"),
          400: err("Missing name or invalid slug"),
          409: { description: "Slug already exists" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/active": {
      post: {
        tags: ["Organizations"],
        summary: "Set active organization",
        description: "Set the active organization context for the current tenant. Pass null orgId to clear (go solo).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { orgId: { type: "string", nullable: true, format: "uuid" } } } } },
        },
        responses: {
          200: ok("Active org set"),
          403: { description: "Not a member of the organization" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/{id}": {
      get: {
        tags: ["Organizations"],
        summary: "Get organization details",
        description: "Returns org details including members and pending invitations. Requires viewer role or above.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Organization details with members and invites"),
          403: { description: "Not a member or insufficient role" },
          404: { description: "Organization not found" },
          401: noSession,
          500: noDb,
        },
      },
      patch: {
        tags: ["Organizations"],
        summary: "Update organization",
        description: "Update organization name. Requires admin role or above.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } },
        },
        responses: {
          200: ok("Organization updated"),
          403: { description: "Requires admin role" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Organizations"],
        summary: "Delete organization",
        description: "Delete an organization and remove all member associations. Requires owner role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: ok("Organization deleted"),
          403: { description: "Requires owner role" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/{id}/members": {
      get: {
        tags: ["Organizations"],
        summary: "List organization members",
        description: "List all members of an organization with their roles. Requires viewer role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          200: { description: "Member list", content: { "application/json": { schema: { type: "object", properties: { members: { type: "array", items: { type: "object" } } } } } } },
          403: { description: "Not a member" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/{id}/members/{memberId}": {
      patch: {
        tags: ["Organizations"],
        summary: "Change member role",
        description: "Change an organization member's role. Requires admin role. Cannot change own role or equal/higher rank unless owner.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "memberId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["owner", "admin", "member", "viewer"] } } } } },
        },
        responses: {
          200: ok("Role changed"),
          400: err("Cannot change own role"),
          403: { description: "Insufficient role" },
          404: { description: "Member not found" },
          401: noSession,
          500: noDb,
        },
      },
      delete: {
        tags: ["Organizations"],
        summary: "Remove member",
        description: "Remove a member from the organization. Cannot remove the owner.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "memberId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Member removed"),
          400: err("Cannot remove owner"),
          403: { description: "Insufficient role" },
          404: { description: "Member not found" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/{id}/invite": {
      post: {
        tags: ["Organizations"],
        summary: "Invite member",
        description: "Send an invitation to join the organization. Enforces seat limits based on plan. Requires admin role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" }, role: { type: "string", enum: ["admin", "member", "viewer"], default: "member" } } } } },
        },
        responses: {
          201: ok("Invitation created"),
          400: err("Invalid email"),
          403: { description: "Seat limit reached or insufficient role" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/orgs/{id}/invites/{inviteId}": {
      delete: {
        tags: ["Organizations"],
        summary: "Revoke invitation",
        description: "Revoke a pending invitation. Requires admin role.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "inviteId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: ok("Invitation revoked"),
          404: { description: "Invitation not found" },
          403: { description: "Insufficient role" },
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/invites/{token}": {
      get: {
        tags: ["Organizations"],
        summary: "Get invitation details",
        description: "Look up an invitation by token. Returns org name, role, and expiration.",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Invitation details"),
          404: { description: "Invitation not found" },
          410: { description: "Invitation expired or already accepted" },
          500: noDb,
        },
      },
    },

    "/api/invites/{token}/accept": {
      post: {
        tags: ["Organizations"],
        summary: "Accept invitation",
        description: "Accept an invitation to join an organization. Creates membership with the invited role.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Invitation accepted"),
          404: { description: "Invitation not found" },
          409: { description: "Already a member" },
          410: { description: "Invitation expired or already accepted" },
          401: noSession,
          500: noDb,
        },
      },
    },

    // ─── Admin: Security Analytics (admin-analytics.js) ──────────────────
    "/api/admin/analytics/security": {
      get: {
        tags: ["Admin"],
        summary: "Security analytics",
        description: "Failed login counts, recent login attempts, and top IPs with failed logins. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Security data", content: { "application/json": { schema: { type: "object", properties: { failed_logins: { type: "object" }, recent_logins: { type: "array", items: { type: "object" } }, top_failed_ips: { type: "array", items: { type: "object" } } } } } } },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    // ─── Admin: Tenant Controls (admin-analytics.js) ─────────────────────
    "/api/admin/tenants/{id}/deactivate": {
      post: {
        tags: ["Admin"],
        summary: "Deactivate tenant",
        description: "Set a tenant's status to inactive. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Tenant deactivated"),
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/tenants/{id}/activate": {
      post: {
        tags: ["Admin"],
        summary: "Activate tenant",
        description: "Set a tenant's status to active. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Tenant activated"),
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/disk-usage": {
      get: {
        tags: ["Admin"],
        summary: "Disk usage overview",
        description: "Platform and per-tenant database sizes with total. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Disk usage data", content: { "application/json": { schema: { type: "object", properties: { platform_size_bytes: { type: "integer" }, tenant_databases: { type: "array", items: { type: "object" } }, total_size_bytes: { type: "integer" }, total_size_gb: { type: "number" } } } } } },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/tenants/{id}/backup": {
      post: {
        tags: ["Admin"],
        summary: "Trigger tenant backup",
        description: "Start a pg_dump backup for a specific tenant's database. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          202: { description: "Backup started", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, backup_id: { type: "string" }, filename: { type: "string" }, status: { type: "string" } } } } } },
          404: { description: "No active database for tenant" },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/waitlist": {
      post: {
        tags: ["Public"],
        summary: "Join waitlist",
        description: "Submit email to join the Truss waitlist. No authentication required.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } },
        },
        responses: { 200: ok("Added to waitlist"), 400: err("Invalid email") },
      },
    },

    "/api/admin/waitlist": {
      get: {
        tags: ["Admin"],
        summary: "List waitlist entries",
        description: "List all waitlist signups with email and source. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "Waitlist entries", content: { "application/json": { schema: { type: "object", properties: { total: { type: "integer" }, entries: { type: "array", items: { type: "object" } } } } } } },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/waitlist/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete waitlist entry",
        description: "Remove a waitlist entry by ID. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Entry deleted"),
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/audit-logs/export": {
      get: {
        tags: ["Admin"],
        summary: "Export audit logs",
        description: "Export audit logs as JSON or CSV for a given number of days. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "days", in: "query", schema: { type: "integer", default: 30, maximum: 365 } },
          { name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"], default: "json" } },
        ],
        responses: {
          200: { description: "Audit log export (JSON or CSV file download)" },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/tenants/{id}/contact": {
      post: {
        tags: ["Admin"],
        summary: "Contact tenant",
        description: "Send an email to a tenant. Requires SMTP to be configured. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["subject", "message"], properties: { subject: { type: "string" }, message: { type: "string" } } } } },
        },
        responses: {
          200: ok("Email sent"),
          400: err("Missing subject or message"),
          404: { description: "Tenant not found" },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/tenants/{id}/detail": {
      get: {
        tags: ["Admin"],
        summary: "Deep tenant detail",
        description: "Full tenant profile: projects, API keys, subscription, boosters, recent errors, audit log, and database info. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: ok("Tenant detail"),
          404: { description: "Tenant not found" },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/tenants/{id}/rate-limit": {
      post: {
        tags: ["Admin"],
        summary: "Override tenant rate limit",
        description: "Set a custom rate limit (requests/minute) for a tenant. Admin only.",
        security: [{ SessionAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["rate_limit"], properties: { rate_limit: { type: "integer", minimum: 10, maximum: 10000 } } } } },
        },
        responses: {
          200: ok("Rate limit set"),
          400: err("Invalid rate limit"),
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    "/api/admin/ip-blacklist": {
      get: {
        tags: ["Admin"],
        summary: "List blocked IPs",
        description: "Returns the current IP blacklist. Admin only.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: { description: "IP blacklist", content: { "application/json": { schema: { type: "object", properties: { ips: { type: "array", items: { type: "string" } } } } } } },
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Manage IP blacklist",
        description: "Add or remove an IP from the platform blacklist. Admin only.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["action", "ip"], properties: { action: { type: "string", enum: ["add", "remove"] }, ip: { type: "string" } } } } },
        },
        responses: {
          200: { description: "Updated blacklist", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, ips: { type: "array", items: { type: "string" } } } } } } },
          400: err("Invalid action or IP"),
          401: noSession,
          403: adminOnly,
          500: noDb,
        },
      },
    },

    // ─── Feature Flags ──────────────────────────────────────────────────
    "/api/flags": {
      get: {
        tags: ["Feature Flags"],
        summary: "List flags",
        description: "List all feature flags with optional filtering by state, tag, type, or search term.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "state", in: "query", schema: { type: "string", enum: ["ENABLED", "DISABLED"] }, description: "Filter by flag state" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag" },
          { name: "type", in: "query", schema: { type: "string" }, description: "Filter by flag type (VARIANT, BOOLEAN)" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by key or name" },
        ],
        responses: {
          200: okArr("List of feature flags"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Feature Flags"],
        summary: "Create flag",
        description: "Create a new feature flag with variants, targeting rules, and metadata.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["flagKey", "name", "flagType"], properties: {
            flagKey: { type: "string", description: "Unique flag key (slug)" },
            name: { type: "string", description: "Human-readable flag name" },
            description: { type: "string" },
            flagType: { type: "string", enum: ["BOOLEAN", "VARIANT"], description: "Flag type" },
            variants: { type: "object", description: "Variant definitions (key → value map)" },
            defaultVariant: { type: "string", description: "Default variant key" },
            targeting: { type: "object", description: "Targeting rules" },
            metadata: { type: "object", description: "Arbitrary key-value metadata" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for organizing flags" },
          } } } },
        },
        responses: {
          200: ok("Created flag"),
          400: err("Invalid flag definition"),
          401: noSession,
          403: { description: "Quota exceeded — flag limit reached for current plan", content: { "application/json": { schema: { type: "object", properties: { error: { type: "string", example: "Flag limit reached (15/15). Upgrade your plan for more flags." }, code: { type: "string", example: "QUOTA_EXCEEDED" } } } } } },
          500: noDb,
        },
      },
    },

    "/api/flags/config": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get flagd-compatible config",
        description: "Returns the full flag configuration in flagd-compatible JSON format for syncing.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("flagd JSON config"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/{key}": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get flag",
        description: "Get a single feature flag by its key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        responses: {
          200: ok("Flag details"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
      put: {
        tags: ["Feature Flags"],
        summary: "Update flag",
        description: "Update an existing feature flag by key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: {
            name: { type: "string" },
            description: { type: "string" },
            flagType: { type: "string", enum: ["BOOLEAN", "VARIANT"] },
            variants: { type: "object" },
            defaultVariant: { type: "string" },
            targeting: { type: "object" },
            metadata: { type: "object" },
            tags: { type: "array", items: { type: "string" } },
          } } } },
        },
        responses: {
          200: ok("Updated flag"),
          400: err("Invalid flag definition"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
      delete: {
        tags: ["Feature Flags"],
        summary: "Delete flag",
        description: "Delete a feature flag by key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        responses: {
          200: ok("Flag deleted"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/{key}/toggle": {
      patch: {
        tags: ["Feature Flags"],
        summary: "Toggle flag",
        description: "Toggle a flag between ENABLED and DISABLED states.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        responses: {
          200: ok("Toggled flag"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/bulk": {
      patch: {
        tags: ["Feature Flags"],
        summary: "Bulk toggle flags",
        description: "Toggle multiple flags to a given state in one request.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["flagKeys", "state"], properties: {
            flagKeys: { type: "array", items: { type: "string" }, description: "Array of flag keys to update" },
            state: { type: "string", enum: ["ENABLED", "DISABLED"], description: "Target state" },
          } } } },
        },
        responses: {
          200: ok("Bulk toggle result"),
          400: err("Invalid request"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/segments": {
      get: {
        tags: ["Feature Flags"],
        summary: "List segments",
        description: "List all targeting segments.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("List of segments"),
          401: noSession,
          500: noDb,
        },
      },
      post: {
        tags: ["Feature Flags"],
        summary: "Create segment",
        description: "Create a new targeting segment with rules.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["segmentKey", "name"], properties: {
            segmentKey: { type: "string", description: "Unique segment key" },
            name: { type: "string", description: "Segment display name" },
            description: { type: "string" },
            rules: { type: "array", items: { type: "object" }, description: "Segment matching rules" },
          } } } },
        },
        responses: {
          200: ok("Created segment"),
          400: err("Invalid segment definition"),
          401: noSession,
          403: { description: "Quota exceeded — segment limit reached for current plan", content: { "application/json": { schema: { type: "object", properties: { error: { type: "string", example: "Segment limit reached (10/10). Upgrade your plan for more segments." }, code: { type: "string", example: "QUOTA_EXCEEDED" } } } } } },
          500: noDb,
        },
      },
    },

    "/api/flags/segments/{key}": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get segment",
        description: "Get a single targeting segment by key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Segment key" },
        ],
        responses: {
          200: ok("Segment details"),
          401: noSession,
          404: err("Segment not found"),
          500: noDb,
        },
      },
      put: {
        tags: ["Feature Flags"],
        summary: "Update segment",
        description: "Update an existing targeting segment by key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Segment key" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: {
            name: { type: "string" },
            description: { type: "string" },
            rules: { type: "array", items: { type: "object" } },
          } } } },
        },
        responses: {
          200: ok("Updated segment"),
          400: err("Invalid segment definition"),
          401: noSession,
          404: err("Segment not found"),
          500: noDb,
        },
      },
      delete: {
        tags: ["Feature Flags"],
        summary: "Delete segment",
        description: "Delete a targeting segment by key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Segment key" },
        ],
        responses: {
          200: ok("Segment deleted"),
          401: noSession,
          404: err("Segment not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/{key}/environments": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get per-environment configs",
        description: "Get environment-specific configurations for a flag.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        responses: {
          200: okArr("Environment configs"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/{key}/environments/{env}": {
      put: {
        tags: ["Feature Flags"],
        summary: "Update environment config",
        description: "Update the flag configuration for a specific environment.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
          { name: "env", in: "path", required: true, schema: { type: "string" }, description: "Environment name" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: {
            state: { type: "string", enum: ["ENABLED", "DISABLED"], description: "Flag state in this environment" },
            targeting: { type: "object", description: "Environment-specific targeting rules" },
            rolloutPct: { type: "number", minimum: 0, maximum: 100, description: "Percentage rollout (0-100)" },
          } } } },
        },
        responses: {
          200: ok("Updated environment config"),
          400: err("Invalid config"),
          401: noSession,
          404: err("Flag or environment not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/{key}/promote": {
      post: {
        tags: ["Feature Flags"],
        summary: "Promote config between environments",
        description: "Copy flag configuration from one environment to another.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" }, description: "Flag key" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["from", "to"], properties: {
            from: { type: "string", description: "Source environment" },
            to: { type: "string", description: "Target environment" },
          } } } },
        },
        responses: {
          200: ok("Config promoted"),
          400: err("Invalid environments"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/evaluate": {
      post: {
        tags: ["Feature Flags"],
        summary: "Evaluate flag",
        description: "Evaluate a single feature flag for a given context (user attributes, environment, etc.).",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["flagKey"], properties: {
            flagKey: { type: "string", description: "Flag key to evaluate" },
            context: { type: "object", description: "Evaluation context (user ID, attributes, environment, etc.)" },
          } } } },
        },
        responses: {
          200: ok("Evaluation result with variant and reason"),
          400: err("Invalid request"),
          401: noSession,
          404: err("Flag not found"),
          500: noDb,
        },
      },
    },

    "/api/flags/evaluate/bulk": {
      post: {
        tags: ["Feature Flags"],
        summary: "Bulk evaluate flags",
        description: "Evaluate multiple feature flags at once for a given context.",
        security: [{ SessionAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["flagKeys"], properties: {
            flagKeys: { type: "array", items: { type: "string" }, description: "Array of flag keys to evaluate" },
            context: { type: "object", description: "Evaluation context" },
          } } } },
        },
        responses: {
          200: ok("Bulk evaluation results"),
          400: err("Invalid request"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/evaluation-log": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get evaluation log",
        description: "Returns recent flag evaluations with optional filtering by flag key.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "flagKey", in: "query", schema: { type: "string" }, description: "Filter by flag key" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Max entries to return" },
        ],
        responses: {
          200: okArr("Recent evaluation entries"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/status": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get flagd health and counts",
        description: "Returns flagd connection health status and flag/segment counts.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("flagd health status and counts"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/sync": {
      post: {
        tags: ["Feature Flags"],
        summary: "Force re-sync",
        description: "Force a re-sync of flag configuration with the flagd backend.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("Sync triggered"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/activity": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get activity log",
        description: "Returns the activity log of flag changes (creates, updates, deletes, toggles).",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("Activity log entries"),
          401: noSession,
          500: noDb,
        },
      },
    },

    "/api/flags/sdk-snippets": {
      get: {
        tags: ["Feature Flags"],
        summary: "Get SDK snippets",
        description: "Returns SDK code snippets for integrating feature flags in various languages and frameworks.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: ok("SDK code snippets by language"),
          401: noSession,
        },
      },
    },

    // ─── Extensions ───────────────────────────────────────────────────────────
    "/api/extensions": {
      get: {
        tags: ["Extensions"],
        summary: "List available extensions",
        description: "Returns 33 curated PostgreSQL extensions with their enabled/disabled status, version, and category.",
        security: [{ SessionAuth: [] }],
        responses: {
          200: okArr("List of curated extensions with status"),
          401: noSession,
          500: err("Failed to list extensions"),
        },
      },
    },
    "/api/extensions/{name}/toggle": {
      post: {
        tags: ["Extensions"],
        summary: "Toggle extension",
        description: "Enable or disable a PostgreSQL extension. Restricted to curated whitelist. Supports CASCADE for dropping dependent objects.",
        security: [{ SessionAuth: [] }],
        parameters: [
          { name: "name", in: "path", required: true, schema: { type: "string" }, description: "Extension name" },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  cascade: { type: "boolean", description: "Use CASCADE when dropping the extension" },
                },
              },
            },
          },
        },
        responses: {
          200: ok("Extension toggled successfully"),
          400: err("Extension not in curated whitelist"),
          401: noSession,
          409: err("Extension has dependent objects — retry with cascade"),
          500: err("Failed to toggle extension"),
        },
      },
    },
  },

  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "apikey",
        description:
          "API key for authentication. Pass as the `apikey` header. " +
          "Keys prefixed `truss_pk_` are anon keys (RLS enforced); " +
          "`truss_sk_` are service_role keys (bypass RLS, required for management endpoints).",
      },
      SessionAuth: {
        type: "apiKey",
        in: "cookie",
        name: "ory_kratos_session",
        description: "Ory Kratos session cookie. Obtained after login via the dashboard auth flow.",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string", description: "Human-readable error message" },
          code: { type: "string", nullable: true, description: "Postgres or application error code" },
          detail: { type: "string", nullable: true, description: "Additional detail from Postgres" },
          hint: { type: "string", nullable: true, description: "Hint for fixing the error" },
          position: { type: "string", nullable: true, description: "Character position of error in SQL" },
        },
        required: ["error"],
      },
      SqlColumn: {
        type: "object",
        properties: {
          name: { type: "string" },
          dataTypeID: { type: "integer", description: "Postgres OID of the column type" },
          typeName: { type: "string", nullable: true, description: "Resolved type name (e.g. int4, text)" },
        },
      },
      SqlResult: {
        type: "object",
        properties: {
          rows: { type: "array", items: { type: "object" }, description: "Result rows as key-value objects" },
          rowCount: { type: "integer", description: "Number of rows affected or returned" },
          columns: { type: "array", items: { $ref: "#/components/schemas/SqlColumn" } },
          command: { type: "string", description: "SQL command type (SELECT, INSERT, etc.)" },
          rowLimitApplied: { type: "boolean", description: "Whether an automatic row limit was applied" },
        },
      },
      TransactionResult: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rows: { type: "array", items: { type: "object" } },
                rowCount: { type: "integer" },
                columns: { type: "array", items: { $ref: "#/components/schemas/SqlColumn" } },
                command: { type: "string" },
              },
            },
          },
        },
      },
      TableRow: {
        type: "object",
        additionalProperties: true,
        description: "A database row represented as a JSON object with column names as keys",
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "integer" },
          key_type: { type: "string", enum: ["anon", "service_role"] },
          key_prefix: { type: "string", description: "First 12 characters of the key" },
          label: { type: "string" },
          project_id: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
          last_used_at: { type: "string", format: "date-time", nullable: true },
          revoked: { type: "boolean" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          region: { type: "string" },
          db_mode: { type: "string" },
          status: { type: "string", enum: ["provisioning", "active", "paused", "deleted"] },
          schema_name: { type: "string" },
          bucket_name: { type: "string" },
          api_url: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          table_schema: { type: "string" },
          table_name: { type: "string" },
          events: { type: "array", items: { type: "string" } },
          url: { type: "string", format: "uri" },
          active: { type: "boolean" },
          fail_count: { type: "integer" },
          last_fired_at: { type: "string", format: "date-time", nullable: true },
          created_at: { type: "string", format: "date-time" },
          total_deliveries: { type: "integer" },
          successful_deliveries: { type: "integer" },
          avg_latency_ms: { type: "integer", nullable: true },
        },
      },
      Bucket: {
        type: "object",
        properties: {
          name: { type: "string" },
          created_at: { type: "string", format: "date-time" },
          object_count: { type: "integer" },
          total_size_bytes: { type: "integer" },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
};
