import dagre from "dagre";
import {
  ArrowsClockwise,
  ChartLine,
  ClockCounterClockwise,
  CloudArrowDown,
  Code,
  Cpu,
  Cube,
  Function,
  Gauge,
  GitBranch,
  Graph,
  HardDrives,
  Lightning,
  LinkSimple,
  ListNumbers,
  LockKey,
  LockLaminated,
  Package,
  PuzzlePiece,
  Shield,
  ShieldCheck,
  Speedometer,
  Table,
  Timer,
  TreeStructure,
  Users,
  Waveform,
  Wrench,
} from "@phosphor-icons/react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  useEdgesState,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  truncated: boolean;
  maxRows: number;
};

export type ConnectionInfo = {
  database_name: string;
  db_user: string;
  current_schema: string;
  server_version: string;
};

export type SqlMetadata = {
  connection: ConnectionInfo;
  schemas: Array<{
    name: string;
    tables: string[];
  }>;
};

export type QueryTab = {
  id: string;
  title: string;
  sql: string;
  result: QueryResult | null;
  error: string;
};

export type QueryHistoryItem = {
  id: string;
  tabTitle: string;
  sql: string;
  status: "success" | "error";
  durationMs: number;
  rowCount: number;
  executedAt: string;
};

export type SavedQuery = {
  id: string;
  name: string;
  sql: string;
  tags: string[];
  createdAt: string;
};

export type PrimaryNav = "home" | "database" | "sql" | "authn" | "authz" | "storage" | "edge" | "realtime" | "search" | "webhooks" | "oauth2" | "gateway" | "flags" | "cache" | "settings";
export type SqlMainView = "editor" | "erd" | "history";
/** @deprecated Use SqlMainView instead — identical type kept for backward compat */
export type SqlTool = SqlMainView;
export type HomeView = "projects" | "stack" | "hierarchy";
export type SettingsView = "account" | "general" | "team" | "api-keys" | "notifications" | "integrations" | "data-export" | "audit-logs" | "danger";
export type ConnectionMethod = "uri" | "fields" | "guides";
export type DeploymentMode = "managed";
export type DatabaseView =
  | "sql-editor"
  | "sql-history"
  | "schema-visualizer"
  | "tables"
  | "functions"
  | "triggers"
  | "enumerated-types"
  | "extensions"
  | "indexes"
  | "publications"
  | "configuration"
  | "roles"
  | "policies"
  | "platform-migrations"
  | "wrappers"
  | "security-advisor"
  | "performance-advisor"
  | "query-performance"
  | "slow-queries"
  | "overview"
  | "autovacuum"
  | "branches"
  | "backups"
  | "locks"
  | "consumption"
  | "vectors"
  | "rls-debugger"
  | "performance";
export type ThemeMode = "system" | "dark" | "light";
export type AuthView = "overview" | "users" | "providers" | "sessions" | "security" | "developer" | "audit-logs";
export type AuthzView = "overview" | "permissions" | "roles" | "model" | "graph" | "developer";
export type EdgeView = "developer" | "playground";
export type StorageView = "overview" | "buckets" | "configuration" | "developer";
export type OAuth2View = "overview" | "clients" | "tokens" | "configuration" | "testing" | "developer";
export type SearchView = "overview" | "playground" | "setup" | "developer";
export type WebhooksView = "list" | "detail" | "create" | "developer";
export type GatewayView = "overview" | "rules" | "testing" | "pipeline" | "developer";
export type FlagsView = "list" | "detail" | "segments" | "playground" | "activity" | "developer";
export type CacheView = "browser" | "stats" | "developer";
export type RealtimeView = "main" | "developer";

export type AuthScreenView = "login" | "register" | "recovery";

export type SubscriptionStatus = "active" | "cancelled" | "past_due" | "on_trial" | "paused" | "expired" | "unpaid" | "none";
export type Subscription = {
  status: SubscriptionStatus;
  plan: string;
  plan_name: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_ends_at: string | null;
  renews_at: string | null;
  ends_at: string | null;
  customer_portal_url: string | null;
  update_payment_method_url: string | null;
  ls_configured: boolean;
  grace_period_end?: string | null;
};
export type GraceStatus = {
  inGracePeriod: boolean;
  daysRemaining: number;
  gracePeriodEnd: string | null;
  expired?: boolean;
};
export type DowngradeBlocker = {
  resource: string;
  current: string;
  planLimit: string;
};
export type Invoice = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  receipt_url: string | null;
};

export type TenantSession = {
  id: string;
  identityId: string;
  email: string;
  displayName: string;
  plan: string;
  isAdmin: boolean;
  isDemo?: boolean;
  trialExpiresAt?: string | null;
  trialStartedAt?: string | null;
};

export type UserPermissions = {
  tenantId: string;
  isAdmin: boolean;
  plan: string;
  orgs: { id: string; name: string; role: string }[];
  projects: { id: string; slug: string; name: string; role: string }[];
  abilities: string[];
};

export type BillingPlanKey = "starter" | "pro" | "team" | "business";
export type BillingPlanMeta = {
  name: string;
  price_monthly: number;
  db_size_gb: number;
  storage_size_gb: number;
  auth_mau: number;
  bandwidth_gb: number;
  projects: number;
  branches: number;
  backups: string;
  rate_limit: number;
  support: string;
};
export type BoosterPack = { name: string; price_monthly: number; unit: string };
export type EnforcementMode = "active" | "shadow";
export type ActiveBooster = {
  id: string;
  booster_key: string;
  quantity: number;
  purchased_at: string;
};
export type BillingUsage = {
  plan: { key: BillingPlanKey } & BillingPlanMeta;
  limits: { db_size_gb: number; storage_size_gb: number; auth_mau: number; bandwidth_gb: number; projects: number; branches: number; rate_limit: number };
  base_limits: { db_size_gb: number; storage_size_gb: number; auth_mau: number; bandwidth_gb: number };
  current: {
    db_size_bytes: number;
    db_size_gb: number;
    storage_size_bytes: number;
    storage_size_gb: number;
    auth_mau: number;
    bandwidth_bytes: number;
    bandwidth_gb: number;
  };
  enforcement_mode: EnforcementMode;
  active_boosters: ActiveBooster[];
  billing_period: { id: string; start: string; end: string } | null;
  snapshots: Array<{
    id: number;
    db_size_bytes: number;
    storage_size_bytes: number;
    auth_mau: number;
    captured_at: string;
  }>;
};

export type ETable = {
  schema: string;
  name: string;
  columns: Array<{ name: string; type: string }>;
};

export type ERelationship = {
  name: string;
  from: { schema: string; table: string; column: string };
  to: { schema: string; table: string; column: string };
};

export type ErdPayload = {
  tables: ETable[];
  relationships: ERelationship[];
};

export type ConnectionProfile = {
  id: string;
  name: string;
  databaseUrl: string;
  createdAt: string;
};

export type CurrentConnection = {
  source: "default" | "custom";
  maskedUrl: string;
  fingerprint: string;
  connection: ConnectionInfo | null;
};

export type IntegrationsStatus = {
  auth: {
    provider: string;
    publicUrl: string | null;
    adminUrl: string | null;
    adminTokenConfigured: boolean;
    configured: boolean;
    reachable: boolean;
    status?: number;
    message: string;
    admin: {
      configured: boolean;
      reachable: boolean;
      status?: number;
      message: string;
    };
  };
  storage: {
    provider: string;
    consoleUrl: string | null;
    s3Endpoint: string | null;
    hasCredentials: boolean;
    console: {
      configured: boolean;
      reachable: boolean;
      status?: number;
      message: string;
    };
    s3: {
      configured: boolean;
      reachable: boolean;
      status?: number;
      message: string;
    };
  };
};

export type AuthIdentity = {
  id: string;
  state?: string;
  traits?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AuthProvider = {
  id: string;
  displayName: string;
  configured: boolean;
  callbackUrl: string;
  docs: string;
};

export type AuthSession = {
  id: string;
  active?: boolean;
  expires_at?: string;
  authenticated_at?: string;
  identity?: {
    id?: string;
    traits?: Record<string, unknown>;
  };
};

export type StorageBucket = {
  name: string;
  createdAt: string | null;
};

export type StorageObject = {
  key: string;
  size: number;
  lastModified: string | null;
  etag: string | null;
  storageClass: string | null;
};

export type DatabaseCatalog = {
  functions: Array<Record<string, unknown>>;
  triggers: Array<Record<string, unknown>>;
  enums: Array<Record<string, unknown>>;
  extensions: Array<Record<string, unknown>>;
  indexes: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
  roles: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  config: Array<Record<string, unknown>>;
};

export type SqlDiagnostics = {
  connection: ConnectionInfo | null;
  pingMs: number;
  activity: Array<{ state: string | null; count: number }>;
  longTransactions: Array<Record<string, unknown>>;
  lockWaits: Array<Record<string, unknown>>;
  pgStatStatements: Array<Record<string, unknown>>;
};

export type SecurityAdvisor = {
  tablesWithoutRls: Array<Record<string, unknown>>;
  publicSchemaAcl: Record<string, unknown> | null;
};

export type PerformanceAdvisor = {
  unusedIndexes: Array<Record<string, unknown>>;
  deadTupleTables: Array<Record<string, unknown>>;
};

export type MigrationStatus = {
  migrations: Array<{
    name: string;
    status: "applied" | "pending";
    appliedAt: string | null;
  }>;
  appliedCount: number;
  pendingCount: number;
};

export type IdempotentMigrationState = "applied" | "pending" | "modified" | "orphaned";

export type IdempotentMigration = {
  name: string;
  state: IdempotentMigrationState;
  applied_at: string | null;
  stored_hash: string | null;
  file_hash: string | null;
};

export type IdempotentMigrationStatus = {
  framework: string | null;
  tracking_table: string | null;
  detected_tables: Array<{ schema: string; table: string; framework: string }>;
  migrations: IdempotentMigration[];
  summary: { applied: number; pending: number; modified: number; orphaned: number };
};

export type SchemaDetectionResult = {
  findings: Array<{ type: string; name: string; exists: boolean }>;
  all_objects_exist: boolean;
  some_objects_exist: boolean;
  recommendation: string;
};

export type TableBrowserResult = {
  schema: string;
  table: string;
  columns: string[];
  columnMeta: Array<{ name: string; data_type: string; is_nullable: string }>;
  rows: Record<string, unknown>[];
  rowCount: number;
  totalCount: number;
  offset: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  search: string;
  searchColumn: string | null;
};

export type TableBrowserTab = {
  id: string;
  schema: string;
  table: string;
  search: string;
  searchColumn: string;
  limit: number;
  offset: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  loading: boolean;
  error: string;
  result: TableBrowserResult | null;
  lastQueryKey: string;
  selectedRowIndex: number | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_SQL = `select now() as server_time, current_database() as database_name;`;

export const SNIPPETS = [
  {
    label: "Current DB Context",
    sql: "select current_database(), current_user, current_schema();",
  },
  {
    label: "Top 10 Rows",
    sql: "select * from public.table_name limit 10;",
  },
  {
    label: "Table Row Estimates",
    sql: "select relname as table_name, n_live_tup as est_rows from pg_stat_user_tables order by n_live_tup desc;",
  },
];



export const DATABASE_NAV_SECTIONS: Array<{
  title: string;
  items: Array<{ id: DatabaseView; label: string; status: "available" | "wip" }>;
}> = [
  {
    title: "Query",
    items: [
      { id: "overview", label: "Overview", status: "available" },
      { id: "sql-editor", label: "SQL Editor", status: "available" },
      { id: "sql-history", label: "Query History", status: "available" },
    ],
  },
  {
    title: "Schema",
    items: [
      { id: "tables", label: "Tables", status: "available" },
      { id: "schema-visualizer", label: "Schema Visualizer", status: "available" },
      { id: "indexes", label: "Indexes", status: "available" },
      { id: "functions", label: "Functions", status: "available" },
      { id: "triggers", label: "Triggers", status: "available" },
      { id: "enumerated-types", label: "Enumerated Types", status: "available" },
    ],
  },
  {
    title: "Access",
    items: [
      { id: "roles", label: "Roles", status: "available" },
      { id: "policies", label: "Policies", status: "available" },
      { id: "rls-debugger", label: "RLS Debugger", status: "available" },
      { id: "extensions", label: "Extensions", status: "available" },
      { id: "vectors", label: "Vectors", status: "available" },
      { id: "publications", label: "Publications", status: "available" },
      { id: "wrappers", label: "FDW", status: "available" },
      { id: "configuration", label: "Configuration", status: "available" },
    ],
  },
  {
    title: "Operations",
    items: [
      { id: "consumption", label: "Consumption", status: "available" },
      { id: "branches", label: "Branches", status: "available" },
      { id: "backups", label: "Backups", status: "available" },
    ],
  },
  {
    title: "Advisors",
    items: [
      { id: "performance", label: "Diagnostics", status: "available" },
      { id: "security-advisor", label: "Security Advisor", status: "available" },
      { id: "performance-advisor", label: "Index & Vacuum Advisor", status: "available" },
      { id: "query-performance", label: "Query Performance", status: "available" },
      { id: "locks", label: "Locks & Waits", status: "available" },
      { id: "autovacuum", label: "Autovacuum Health", status: "available" },
      { id: "platform-migrations", label: "Migrations", status: "available" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function databaseIcon(view: DatabaseView) {
  const size = 18;
  const w = "regular" as const;
  switch (view) {
    case "sql-editor": return <Code size={size} weight={w} />;
    case "sql-history": return <ClockCounterClockwise size={size} weight={w} />;
    case "schema-visualizer": return <TreeStructure size={size} weight={w} />;
    case "tables": return <Table size={size} weight={w} />;
    case "functions": return <Function size={size} weight={w} />;
    case "triggers": return <Lightning size={size} weight={w} />;
    case "enumerated-types": return <Cube size={size} weight={w} />;
    case "extensions": return <PuzzlePiece size={size} weight={w} />;
    case "vectors": return <Waveform size={size} weight={w} />;
    case "indexes": return <ListNumbers size={size} weight={w} />;
    case "publications": return <Graph size={size} weight={w} />;
    case "configuration": return <Wrench size={size} weight={w} />;
    case "roles": return <Users size={size} weight={w} />;
    case "policies": return <Shield size={size} weight={w} />;
    case "rls-debugger": return <ShieldCheck size={size} weight={w} />;
    case "platform-migrations": return <HardDrives size={size} weight={w} />;
    case "wrappers": return <Package size={size} weight={w} />;
    case "performance": return <Gauge size={size} weight={w} />;
    case "slow-queries": return <Timer size={size} weight={w} />;
    case "security-advisor": return <LockKey size={size} weight={w} />;
    case "performance-advisor": return <Cpu size={size} weight={w} />;
    case "query-performance": return <Speedometer size={size} weight={w} />;
    case "overview": return <LinkSimple size={size} weight={w} />;
    case "autovacuum": return <ArrowsClockwise size={size} weight={w} />;
    case "consumption": return <ChartLine size={size} weight={w} />;
    case "branches": return <GitBranch size={size} weight={w} />;
    case "backups": return <CloudArrowDown size={size} weight={w} />;
    case "locks": return <LockLaminated size={size} weight={w} />;
    default: return <Code size={size} weight={w} />;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}

/** Delete a cookie from document.cookie by setting it expired on all possible domain scopes. */
export function deleteCookie(name: string) {
  // Clear on current path (no domain — same-origin scope)
  document.cookie = `${name}=; Max-Age=0; Path=/`;
  // Clear on parent domain scope (e.g., .binarysquad.org)
  const parts = window.location.hostname.split(".");
  if (parts.length >= 3) {
    const parentDomain = "." + parts.slice(-2).join(".");
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${parentDomain}`;
  }
}

// Active org ID for org-scoped requests — set by the dashboard when user switches org
let _activeOrgId: string | null = null;
export function setActiveOrgId(orgId: string | null) { _activeOrgId = orgId; }
export function getActiveOrgId(): string | null { return _activeOrgId; }

// Active environment ID — set by the dashboard when user switches environment
let _activeEnvironmentId: string | null = null;
export function setActiveEnvironmentIdGlobal(id: string | null) { _activeEnvironmentId = id; }
export function getActiveEnvironmentId(): string | null { return _activeEnvironmentId; }

// API base URL — set once on startup so global utilities (DeveloperSDK, etc.) can reach the API
let _apiBaseUrl = "";
export function setApiBaseUrl(url: string) { _apiBaseUrl = url; }
export function getApiBaseUrl(): string { return _apiBaseUrl; }

// Demo mode flag — set once on startup when URL contains /demo
let _demoMode = false;
export function setDemoMode(v: boolean) { _demoMode = v; }
export function isDemoMode(): boolean { return _demoMode; }

export const isSelfHosted = false;

// Callback for demo write attempts — set by App.tsx to show a toast/notification
let _onDemoWriteBlocked: (() => void) | null = null;
export function setOnDemoWriteBlocked(fn: (() => void) | null) { _onDemoWriteBlocked = fn; }

// Session expiry callback — set by useAuth to trigger re-check on 401
let _onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(fn: (() => void) | null) { _onSessionExpired = fn; }

/** Fetch wrapper that includes credentials (cookies), CSRF token, and org context for dashboard auth */
export function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const csrfToken = getCookie("truss_csrf");
  const headers = new Headers(opts.headers);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (_activeOrgId) headers.set("X-Org-Id", _activeOrgId);
  if (_activeEnvironmentId) headers.set("X-Environment-Id", _activeEnvironmentId);
  if (_demoMode) headers.set("X-Demo", "true");
  return fetch(url, { ...opts, headers, credentials: "include" as RequestCredentials }).then(resp => {
    // Auto-redirect to login on session expiry (401 on non-auth endpoints)
    if (resp.status === 401 && !url.includes("/api/auth/session") && !url.includes("/api/auth/login") && !_demoMode) {
      _onSessionExpired?.();
    }
    // Intercept demo write-protection responses and notify UI
    if (_demoMode && resp.status === 403) {
      resp.clone().json().then(body => {
        if (body?.demo) _onDemoWriteBlocked?.();
      }).catch(() => {});
    }
    return resp;
  });
}

// Platform (cloud) mode. Self-hosted/OSS builds leave this false → billing, plan
// upgrades, and other cloud-only surfaces are hidden. truss-cloud builds with
// VITE_IS_PLATFORM=true. (Mirrors Supabase's IS_PLATFORM / Appwrite's isCloud.)
export const IS_PLATFORM = import.meta.env.VITE_IS_PLATFORM === "true";

export function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) {
    return String(configured).replace(/\/$/, "");
  }
  const base = import.meta.env.BASE_URL || "/";
  return base === "/" ? "" : base.replace(/\/$/, "");
}

export async function parseApiResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return { error: text || `Request failed with status ${response.status}` };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toCsv(result: QueryResult) {
  const escapeCsv = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [
    result.columns.map((column) => escapeCsv(column)).join(","),
    ...result.rows.map((row) => result.columns.map((column) => escapeCsv(row[column])).join(",")),
  ];

  return lines.join("\n");
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Parse user agent string into a readable browser/OS label */
export function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  let browser = "Unknown";
  let os = "Unknown";
  // Browser detection
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("curl/")) browser = "curl";
  // OS detection
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";
  return `${browser} / ${os}`;
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export async function loadConnectionProfilesFromApi(apiBaseUrl: string): Promise<ConnectionProfile[]> {
  try {
    const res = await apiFetch(`${apiBaseUrl}/api/connections`);
    if (!res.ok) return [];
    const body = await res.json();
    return (body.connections || []).map((c: any) => ({
      id: String(c.id),
      name: c.name,
      databaseUrl: c.connection_url,
      createdAt: c.created_at,
    }));
  } catch {
    return [];
  }
}

export async function saveConnectionProfileToApi(apiBaseUrl: string, name: string, databaseUrl: string): Promise<ConnectionProfile | null> {
  try {
    const res = await apiFetch(`${apiBaseUrl}/api/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, connection_url: databaseUrl }),
    });
    if (!res.ok) return null;
    const c = await res.json();
    return { id: String(c.id), name: c.name, databaseUrl: c.connection_url, createdAt: c.created_at };
  } catch {
    return null;
  }
}

export async function deleteAllConnectionProfilesFromApi(apiBaseUrl: string, profiles: ConnectionProfile[]): Promise<void> {
  await Promise.all(profiles.map(p =>
    apiFetch(`${apiBaseUrl}/api/connections/${p.id}`, { method: "DELETE" }).catch(() => {})
  ));
}

// ---------------------------------------------------------------------------
// ERD components & helpers
// ---------------------------------------------------------------------------

export function ErdTableNode({ data }: { data: { schema: string; name: string; columns: Array<{ name: string; type: string; isPk: boolean; isFk: boolean }> } }) {
  return (
    <div className="erd-node rounded-lg border border-slate-700 bg-slate-900 shadow-lg shadow-black/30 overflow-hidden min-w-[220px]">
      <Handle type="target" position={Position.Left} className="!bg-cyan-400 !w-2 !h-2 !border-slate-900" />
      <Handle type="source" position={Position.Right} className="!bg-accent-400 !w-2 !h-2 !border-slate-900" />
      <div className="flex items-center gap-2 border-b border-slate-700 bg-slate-800/80 px-3 py-2">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] font-bold text-white tracking-wide">{data.name}</span>
        <span className="ml-auto rounded bg-slate-700 px-1.5 py-0.5 text-[9px] text-slate-300">{data.schema}</span>
      </div>
      <div className="divide-y divide-slate-800/60">
        {data.columns.map((col) => (
          <div key={col.name} className="flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-slate-800/40 transition-colors">
            <span className="flex items-center gap-1 min-w-0 flex-1">
              {col.isPk && <span className="shrink-0 rounded bg-amber-500/25 px-1 py-px text-[8px] font-bold text-amber-200">PK</span>}
              {col.isFk && <span className="shrink-0 rounded bg-cyan-500/25 px-1 py-px text-[8px] font-bold text-cyan-200">FK</span>}
              <span className={`truncate ${col.isPk ? "font-semibold text-white" : "text-slate-200"}`}>{col.name}</span>
            </span>
            <span className="shrink-0 text-slate-400 font-mono">{col.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ERD_NODE_TYPES = { erdTable: ErdTableNode };

export function InteractiveErd({ nodes: initialNodes, edges: initialEdges }: { nodes: Node[]; edges: Edge[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when source data changes (e.g. refresh button)
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={ERD_NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable
      panOnDrag
      zoomOnScroll
      fitView
    >
      <MiniMap />
      <Controls />
      <Background gap={20} size={1} color="var(--app-border)" />
    </ReactFlow>
  );
}

export function buildErdGraph(payload: ErdPayload): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", ranksep: 120, nodesep: 60 });
  graph.setDefaultEdgeLabel(() => ({}));

  // Build FK lookup: which columns are foreign keys
  const fkCols = new Set<string>();
  payload.relationships.forEach((r) => {
    fkCols.add(`${r.from.schema}.${r.from.table}.${r.from.column}`);
  });

  // Simple PK heuristic: column named 'id' or ending in '_id' on the target side
  const pkCols = new Set<string>();
  payload.relationships.forEach((r) => {
    pkCols.add(`${r.to.schema}.${r.to.table}.${r.to.column}`);
  });
  // Also mark any column literally named "id" as PK
  payload.tables.forEach((t) => {
    t.columns.forEach((c) => {
      if (c.name === "id") pkCols.add(`${t.schema}.${t.name}.${c.name}`);
    });
  });

  const nodes: Node[] = payload.tables.map((table) => {
    const id = `${table.schema}.${table.name}`;
    const maxCols = 12;
    const displayCols = table.columns.slice(0, maxCols).map((col) => ({
      name: col.name,
      type: col.type,
      isPk: pkCols.has(`${table.schema}.${table.name}.${col.name}`),
      isFk: fkCols.has(`${table.schema}.${table.name}.${col.name}`),
    }));
    if (table.columns.length > maxCols) {
      displayCols.push({ name: `+${table.columns.length - maxCols} more`, type: "", isPk: false, isFk: false });
    }
    const height = 38 + displayCols.length * 26;
    const width = 260;
    graph.setNode(id, { width, height });
    return {
      id,
      type: "erdTable",
      position: { x: 0, y: 0 },
      data: { schema: table.schema, name: table.name, columns: displayCols },
      style: { width },
    };
  });

  const edges: Edge[] = payload.relationships.map((relationship) => {
    const source = `${relationship.from.schema}.${relationship.from.table}`;
    const target = `${relationship.to.schema}.${relationship.to.table}`;
    graph.setEdge(source, target);
    return {
      id: `${relationship.name}-${source}-${target}`,
      source,
      target,
      animated: true,
      label: `${relationship.from.column} → ${relationship.to.column}`,
      style: { stroke: "#22d3ee", strokeWidth: 1.5, opacity: 0.7 },
      labelStyle: { fill: "#94a3b8", fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: "#0f172a", fillOpacity: 0.85 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#22d3ee", width: 16, height: 16 },
    };
  });

  dagre.layout(graph);

  const positioned = nodes.map((node) => {
    const point = graph.node(node.id);
    return {
      ...node,
      position: {
        x: point.x - 130,
        y: point.y - (point.height || 60) / 2,
      },
    };
  });

  return { nodes: positioned, edges };
}

// ─── WebAuthn / Passkey helpers ─────────────────────────────────────────────

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
