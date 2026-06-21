import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loader } from "@monaco-editor/react";
import { registerSqlCompletion } from "./editorConfig";
import {
  Broadcast,
  CaretDown,
  PaintBucket,
  CheckCircle,
  ClipboardText,
  Warning,
  CloudArrowDown,
  Code,
  ClockCounterClockwise,
  Database,
  FileArrowUp,
  Flag,
  Flask,
  FolderSimple,
  Function,
  GearSix,
  GitBranch,
  HardDrives,
  House,
  IdentificationCard,
  Lightning,
  LinkSimple,
  Key,
  LockKey,
  ListNumbers,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  Plug,
  PuzzlePiece,
  Rocket,
  ShieldCheck,
  Shield,
  SignOut,
  Sparkle,
  Speedometer,
  Table,
  Timer,
  Trash,
  TreeStructure,
  User,
  UserList,
  Users,
  Stack,
  Waveform,
  Wrench,
  ArrowSquareOut,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import "@xyflow/react/dist/style.css";
import {
  type QueryResult, type SqlMetadata, type QueryTab, type QueryHistoryItem,
  type SavedQuery, type PrimaryNav, type SqlMainView, type SqlTool, type SettingsView,
  type ConnectionMethod, type DeploymentMode, type DatabaseView, type ThemeMode,
  type AuthView, type AuthzView, type EdgeView, type StorageView, type OAuth2View, type SearchView, type WebhooksView, type GatewayView, type FlagsView, type CacheView, type RealtimeView,
  type HomeView,
  type ErdPayload, type ConnectionProfile, type CurrentConnection,
  type IntegrationsStatus, type AuthIdentity, type AuthProvider, type AuthSession,
  type StorageBucket, type StorageObject, type DatabaseCatalog, type SqlDiagnostics,
  type SecurityAdvisor, type PerformanceAdvisor, type MigrationStatus,
  type IdempotentMigrationStatus, type SchemaDetectionResult,
  type TableBrowserResult, type TableBrowserTab,
  DEFAULT_SQL,
  SNIPPETS,
  DATABASE_NAV_SECTIONS,
  databaseIcon, resolveApiBaseUrl, parseApiResponse, makeId, toCsv, apiFetch, setApiBaseUrl, setActiveEnvironmentIdGlobal,
  downloadFile, loadConnectionProfilesFromApi, saveConnectionProfileToApi,
  ERD_NODE_TYPES, InteractiveErd, buildErdGraph,
} from "./types";
import { renderDatabaseMain, renderDatabasePaneB } from "./DatabasePanel";
import { renderModulesMain, renderModulesPaneB } from "./ModulePanels";
import { renderSqlMain, renderSqlPaneB } from "./panels/SqlPanel";
import { renderHomeMain, renderHomePaneB } from "./panels/HomePanel";
import { useAuth } from "./hooks/useAuth";
import { useBilling } from "./hooks/useBilling";

// ─── OAuth2 Consent Screen (standalone, rendered before auth gate) ───────────
function ConsentScreen({ challenge, apiBaseUrl }: { challenge: string; apiBaseUrl: string }) {
  const [consent, setConsent] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    apiFetch(`${apiBaseUrl}/api/hydra/bridge/consent/info?consent_challenge=${encodeURIComponent(challenge)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setConsent(data);
        setSelectedScopes(data.requested_scope || []);
        setLoading(false);
      })
      .catch(e => { setError(e.message || "Failed to load consent"); setLoading(false); });
  }, [challenge, apiBaseUrl]);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/hydra/bridge/consent/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, grant_scope: selectedScopes, remember }),
      });
      const data = await r.json();
      if (data.redirect_to) window.location.href = data.redirect_to;
      else setError(data.error || "Failed to accept consent");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    setSubmitting(false);
  };

  const handleDeny = async () => {
    setSubmitting(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/hydra/bridge/consent/reject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge, error: "access_denied", error_description: "The user denied the request" }),
      });
      const data = await r.json();
      if (data.redirect_to) window.location.href = data.redirect_to;
      else setError(data.error || "Failed to reject consent");
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    setSubmitting(false);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const SCOPE_DESCRIPTIONS: Record<string, string> = {
    openid: "Verify your identity",
    profile: "Access your name and profile information",
    email: "Access your email address",
    offline_access: "Stay signed in (refresh token)",
    offline: "Stay signed in (refresh token)",
    address: "Access your physical address",
    phone: "Access your phone number",
  };

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Loading consent...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6 max-w-sm text-center">
        <p className="text-sm text-red-300 mb-2">Consent Error</p>
        <p className="text-xs text-slate-400">{error}</p>
      </div>
    </div>
  );

  const client = consent?.client || {};
  const scopes = consent?.requested_scope || [];

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-slate-100 tracking-tight">truss</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">Authorization Request</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
          {/* Accent bar */}
          <div className="h-1 bg-gradient-to-r from-accent-600 to-accent-400" />

          <div className="p-6">
            {/* Client identity */}
            <div className="flex items-center gap-3 mb-5">
              {client.logo_uri ? (
                <img src={client.logo_uri} alt="" className="w-10 h-10 rounded-lg border border-slate-700" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-accent-500/20 border border-accent-500/30 flex items-center justify-center">
                  <span className="text-accent-300 text-sm font-bold">{(client.client_name || client.client_id || "?")[0].toUpperCase()}</span>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-slate-100">{client.client_name || client.client_id}</p>
                <p className="text-[10px] text-slate-500 font-mono">{client.client_id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-4">
              <span className="font-medium text-slate-100">{client.client_name || client.client_id}</span> is requesting access to your account
              {consent?.subject && <span className="text-slate-500"> ({consent.subject})</span>}.
            </p>

            {/* Scopes */}
            {scopes.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Permissions requested</p>
                <div className="space-y-1.5">
                  {scopes.map((scope: string) => (
                    <label key={scope} className="flex items-start gap-2.5 rounded border border-slate-800 bg-slate-950/40 p-2.5 cursor-pointer hover:bg-slate-800/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={() => toggleScope(scope)}
                        className="mt-0.5 accent-accent-500"
                      />
                      <div>
                        <p className="text-xs text-slate-200 font-medium font-mono">{scope}</p>
                        {SCOPE_DESCRIPTIONS[scope] && <p className="text-[10px] text-slate-500 mt-0.5">{SCOPE_DESCRIPTIONS[scope]}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Remember */}
            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-accent-500" />
              <span className="text-[11px] text-slate-400">Remember this decision</span>
            </label>

            {/* Links */}
            {(client.tos_uri || client.policy_uri) && (
              <div className="flex gap-3 mb-4 text-[10px] text-slate-500">
                {client.tos_uri && <a href={client.tos_uri} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">Terms of Service</a>}
                {client.policy_uri && <a href={client.policy_uri} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">Privacy Policy</a>}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleDeny}
                disabled={submitting}
                className="flex-1 rounded border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                Deny
              </button>
              <button
                onClick={handleAccept}
                disabled={submitting || selectedScopes.length === 0}
                className="flex-1 rounded border border-accent-600 bg-accent-600 px-4 py-2 text-xs text-white hover:bg-accent-500 disabled:opacity-40 transition-colors font-medium"
              >
                {submitting ? "..." : "Allow"}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-600 mt-4">
          Powered by Truss OAuth2
        </p>
      </div>
    </div>
  );
}

// Two-key chord state for "g then X" shortcuts (module-level, not React state)
let _pendingKey: string | null = null;
let _pendingKeyTimer: ReturnType<typeof setTimeout> | null = null;

function App() {
  const [tabs, setTabs] = useState<QueryTab[]>([
    {
      id: "tab-1",
      title: "Query 1",
      sql: DEFAULT_SQL,
      result: null,
      error: "",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [metadata, setMetadata] = useState<SqlMetadata | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState("");
  const [selectedSchema, setSelectedSchema] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableBrowserTabs, setTableBrowserTabs] = useState<TableBrowserTab[]>([]);
  const [activeTableBrowserTabId, setActiveTableBrowserTabId] = useState("");
  const [tableDetails, setTableDetails] = useState<{ schema: string, table: string, columns: any[], indexes: any[], foreignKeys: any[] } | null>(null);
  const [tableInspectorTab, setTableInspectorTab] = useState<"columns" | "indexes" | "relations" | "row">("columns");
  const [isTableDetailsLoading, setIsTableDetailsLoading] = useState(false);
  const [showTableRowDetails, setShowTableRowDetails] = useState(false);
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem("truss.queryHistory");
      return stored ? (JSON.parse(stored) as QueryHistoryItem[]).slice(0, 100) : [];
    } catch { return []; }
  });
  const [resultFilter, setResultFilter] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [sqlSplitView, setSqlSplitView] = useState(false);
  const [sqlBranchDb, setSqlBranchDb] = useState("");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState("");

  const [primaryNav, setPrimaryNav] = useState<PrimaryNav>("home");
  const [homeView, setHomeView] = useState<HomeView>("projects");
  const [databaseView, setDatabaseView] = useState<DatabaseView>("tables");
  const [sqlMainView, setSqlMainView] = useState<SqlMainView>("editor");
  const [sqlTool, setSqlTool] = useState<SqlTool>("editor");
  const [authView, setAuthView] = useState<AuthView>("overview");
  const [authzView, setAuthzView] = useState<AuthzView>("overview");
  const [storageView, setStorageView] = useState<StorageView>("overview");
  const [edgeView, setEdgeView] = useState<EdgeView>("developer");
  const [settingsView, setSettingsView] = useState<SettingsView>("account");
  const [projects, setProjects] = useState<Array<Record<string, any>>>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>("managed");
  const [projectsLoaded, setProjectsLoaded] = useState(false);

  // --- New Project Wizard State ---
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [provisioningStep, setProvisioningStep] = useState<"input" | "provisioning">("input");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [newProjectRegion, setNewProjectRegion] = useState("india-mumbai");
  const [newProjectCreateBucket, setNewProjectCreateBucket] = useState(true);
  const [newProjectBucketName, setNewProjectBucketName] = useState("default");
  const [newProjectGenerateKeys, setNewProjectGenerateKeys] = useState(true);
  const [provisioningProgress, setProvisioningStepProgress] = useState(0);
  const [provisioningMessage, setProvisioningMessage] = useState("");
  const [provisionedProject, setProvisionedProject] = useState<Record<string, any> | null>(null);
  const [provisioningError, setProvisioningError] = useState("");
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; color?: string }>>([]);
  const [provisioningDone, setProvisioningDone] = useState(false);
  const [provisioningElapsed, setProvisioningElapsed] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);

  // --- Org Switcher State ---
  const [orgs, setOrgs] = useState<any[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);

  // --- Environment Switcher State ---
  const [environments, setEnvironments] = useState<any[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamingLoading, setRenamingLoading] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [projectDetail, setProjectDetail] = useState<Record<string, any> | null>(null);
  const [isProjectDetailLoading, setIsProjectDetailLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const handleCopyField = useCallback((text: string, label: string) => {
    const doCopy = async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopiedField(label);
        setTimeout(() => setCopiedField((prev) => prev === label ? null : prev), 2000);
      } catch { /* ignore */ }
    };
    doCopy();
  }, []);

  // --- Sample App ---
  const [sampleAppStatus, setSampleAppStatus] = useState<{
    loaded: boolean; tables?: number; rows?: Record<string, number>; totalRows?: number;
    rlsPolicies?: number; ftsConfigured?: boolean; hasEmbeddings?: boolean;
    realtimeCount?: number; webhookCount?: number; apiKeyCount?: number;
    storageBucket?: { exists: boolean; objects: number } | null;
    authIdentities?: number | null; ketoTuples?: number | string | null;
  } | null>(null);
  const [sampleAppLoading, setSampleAppLoading] = useState(false);
  const [sampleAppError, setSampleAppError] = useState<string | null>(null);
  const [sampleAppResult, setSampleAppResult] = useState<Record<string, any> | null>(null);
  const [sampleAppTermLine, setSampleAppTermLine] = useState("");
  const [sampleAppTermDone, setSampleAppTermDone] = useState(false);
  const sampleAppTermIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- S4: Branches ---
  const [branches, setBranches] = useState<Array<Record<string, any>>>([]);
  const [isBranchesLoading, setIsBranchesLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  // --- S5: Backups ---
  const [backups, setBackups] = useState<Array<Record<string, any>>>([]);
  const [isBackupsLoading, setIsBackupsLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

  // --- S7: Consumption ---
  const [consumption, setConsumption] = useState<Record<string, any> | null>(null);
  const [consumptionHistory, setConsumptionHistory] = useState<Array<Record<string, any>>>([]);
  const [isConsumptionLoading, setIsConsumptionLoading] = useState(false);
  const [consumptionLive, setConsumptionLive] = useState<{ totalQueries: number; totalBandwidth: number; startedAt: string; perKey: Array<Record<string, any>>; topEndpoints: Array<Record<string, any>> } | null>(null);
  const [consumptionDays, setConsumptionDays] = useState(7);

  // --- Realtime ---
  const [realtimeStatus, setRealtimeStatus] = useState<{ connected: boolean; wsClients: number; activeChannels: number; channels: string[] } | null>(null);
  const [realtimeSubscriptions, setRealtimeSubscriptions] = useState<Array<{ id: string; schema_name: string; table_name: string; active: boolean; created_at: string }>>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<Array<Record<string, any>>>([]);
  const [realtimeTables, setRealtimeTables] = useState<Array<{ table_schema: string; table_name: string }>>([]);
  const [isRealtimeLoading, setIsRealtimeLoading] = useState(false);
  const [realtimeWs, setRealtimeWs] = useState<WebSocket | null>(null);
  const [realtimeWsConnected, setRealtimeWsConnected] = useState(false);
  const [realtimePaused, setRealtimePaused] = useState(false);
  const [realtimeSubSchema, setRealtimeSubSchema] = useState("public");
  const [realtimeSubTable, setRealtimeSubTable] = useState("");
  const [realtimeFilter, setRealtimeFilter] = useState("");
  const [realtimeView, setRealtimeView] = useState<RealtimeView>("main");
  // Presence
  const [presenceUserId] = useState(() => crypto.randomUUID());
  const [presenceChannel, setPresenceChannel] = useState("lobby");
  const [presenceName, setPresenceName] = useState("Admin");
  const [presenceJoined, setPresenceJoined] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<Array<{ user_id: string; meta: Record<string, any>; joinedAt: string; lastSeen: string }>>([]);

  // --- Lock viewer ---
  const [lockData, setLockData] = useState<Record<string, any> | null>(null);
  const [isLocksLoading, setIsLocksLoading] = useState(false);

  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>("uri");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("truss.theme");
    return stored === "dark" || stored === "light" || stored === "system" ? stored : "system";
  });
  const editorTheme = useMemo(() => {
    if (themeMode === "light") return "truss-light";
    if (themeMode === "dark") return "truss-dark";
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches ? "truss-light" : "truss-dark";
  }, [themeMode]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiKeys, setApiKeys] = useState<Array<Record<string, any>>>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({});

  const [erdPayload, setErdPayload] = useState<ErdPayload | null>(null);
  const [erdError, setErdError] = useState("");
  const [isErdLoading, setIsErdLoading] = useState(false);

  const [connectionProfiles, setConnectionProfiles] = useState<ConnectionProfile[]>([]);
  const [newConnectionUrl, setNewConnectionUrl] = useState("");
  const [fieldHost, setFieldHost] = useState("");
  const [fieldPort, setFieldPort] = useState("5432");
  const [fieldDatabase, setFieldDatabase] = useState("");
  const [fieldUser, setFieldUser] = useState("");
  const [fieldPassword, setFieldPassword] = useState("");
  const [fieldSslMode, setFieldSslMode] = useState("prefer");
  const [connectionsMessage, setConnectionsMessage] = useState("");
  const [newConnectionName, setNewConnectionName] = useState("");
  const [connStrPassword, setConnStrPassword] = useState("");
  const [connStrTab, setConnStrTab] = useState<"direct" | "orms" | "frameworks">("direct");
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const [platformNavExpanded, setPlatformNavExpanded] = useState(true);
  const [connectSection, setConnectSection] = useState<"overview" | "snippets" | "pool" | "extensions">("overview");
  const [currentConnection, setCurrentConnection] = useState<CurrentConnection | null>(null);
  const [isSwitchingConnection, setIsSwitchingConnection] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [savedQuerySearch, setSavedQuerySearch] = useState("");
  const [savedQueryTagFilter, setSavedQueryTagFilter] = useState("");
  const [integrationsStatus, setIntegrationsStatus] = useState<IntegrationsStatus | null>(null);
  const [isIntegrationsLoading, setIsIntegrationsLoading] = useState(false);
  const [authIdentities, setAuthIdentities] = useState<AuthIdentity[]>([]);
  const [isAuthUsersLoading, setIsAuthUsersLoading] = useState(false);
  const [authUsersError, setAuthUsersError] = useState("");
  const [authUsersInfo, setAuthUsersInfo] = useState("");
  const [authUsersNextToken, setAuthUsersNextToken] = useState<string | null>(null);
  const [authUsersPrevToken, setAuthUsersPrevToken] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isBatchActionLoading, setIsBatchActionLoading] = useState(false);
  const [newAuthEmail, setNewAuthEmail] = useState("");
  const [newAuthPassword, setNewAuthPassword] = useState("");
  const [isCreatingAuthUser, setIsCreatingAuthUser] = useState(false);
  const [sampleUserCredentials, setSampleUserCredentials] = useState("");
  const [authProviders, setAuthProviders] = useState<AuthProvider[]>([]);
  const [authProvidersError, setAuthProvidersError] = useState("");
  const [authKratosHealthy, setAuthKratosHealthy] = useState<boolean | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [isImportingUsers, setIsImportingUsers] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; failed: number; errors: Array<{ email: string; error: string }> } | null>(null);
  const [importError, setImportError] = useState("");
  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [authSessionsError, setAuthSessionsError] = useState("");
  const [isAuthSessionsLoading, setIsAuthSessionsLoading] = useState(false);
  const [authSessionsNextToken, setAuthSessionsNextToken] = useState<string | null>(null);
  const [authSessionsPrevToken, setAuthSessionsPrevToken] = useState<string | null>(null);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [loginHistoryTotal, setLoginHistoryTotal] = useState(0);
  const [loginHistoryOffset, setLoginHistoryOffset] = useState(0);
  const [isLoginHistoryLoading, setIsLoginHistoryLoading] = useState(false);
  const [loginHistoryFilter, setLoginHistoryFilter] = useState<"all" | "success" | "failed">("all");
  const [authStats, setAuthStats] = useState<{ logins_24h: number; logins_7d: number; failed_logins_24h: number; recent_logins: any[] } | null>(null);
  const [authSecurityConfig, setAuthSecurityConfig] = useState<any>(null);
  const [hasLoadedSecurityConfig, setHasLoadedSecurityConfig] = useState(false);
  const [hasLoadedAuthUsers, setHasLoadedAuthUsers] = useState(false);
  const [hasLoadedAuthProviders, setHasLoadedAuthProviders] = useState(false);
  const [hasLoadedAuthSessions, setHasLoadedAuthSessions] = useState(false);
  const [sessionsSubTab, setSessionsSubTab] = useState<"active" | "history">("active");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [selectedAuthSnippet, setSelectedAuthSnippet] = useState<any>(null);
  const [selectedStorageSnippet, setSelectedStorageSnippet] = useState<any>(null);
  const [storageBuckets, setStorageBuckets] = useState<StorageBucket[]>([]);
  const [storageBucketsError, setStorageBucketsError] = useState("");
  const [storageBucketsInfo, setStorageBucketsInfo] = useState("");
  const [isStorageBucketsLoading, setIsStorageBucketsLoading] = useState(false);
  const [isCreatingStorageBucket, setIsCreatingStorageBucket] = useState(false);
  const [deletingBucketName, setDeletingBucketName] = useState("");
  const [hasLoadedStorageBuckets, setHasLoadedStorageBuckets] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [selectedStorageBucket, setSelectedStorageBucket] = useState("");
  const [storageObjects, setStorageObjects] = useState<StorageObject[]>([]);
  const [storageObjectsError, setStorageObjectsError] = useState("");
  const [storageObjectsInfo, setStorageObjectsInfo] = useState("");
  const [isStorageObjectsLoading, setIsStorageObjectsLoading] = useState(false);
  const [isUploadingStorageObject, setIsUploadingStorageObject] = useState(false);
  const [deletingObjectKey, setDeletingObjectKey] = useState("");
  const [storageObjectPrefix, setStorageObjectPrefix] = useState("");
  const [newObjectKey, setNewObjectKey] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [storageSearch, setStorageSearch] = useState("");
  const [latestDownloadUrl, setLatestDownloadUrl] = useState("");
  const [selectedObjectKeys, setSelectedObjectKeys] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [urlDiagKey, setUrlDiagKey] = useState<string | null>(null);
  const [urlDiag, setUrlDiag] = useState<Record<string, unknown> | null>(null);
  const [metadataEditKey, setMetadataEditKey] = useState<string | null>(null);
  const [metadataEditData, setMetadataEditData] = useState<Record<string, string>>({});
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [corsConfig, setCorsConfig] = useState<{ allowedOrigins: string; allowedMethods: string; allowedHeaders: string; maxAge: string }>({ allowedOrigins: "*", allowedMethods: "GET, HEAD", allowedHeaders: "*", maxAge: "3600" });
  const [isCorsLoading, setIsCorsLoading] = useState(false);
  const [fdwData, setFdwData] = useState<{ wrappers: any[]; foreignTables: any[] } | null>(null);
  const [isFdwLoading, setIsFdwLoading] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<{ filename: string; content: string } | null>(null);
  const [migrationSafetyCheck, setMigrationSafetyCheck] = useState<Record<string, any> | null>(null);
  const [isMigrationChecking, setIsMigrationChecking] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, any>>({});
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [auditLogAction, setAuditLogAction] = useState("");
  const [auditLogSearch, setAuditLogSearch] = useState("");
  const [auditLogSince, setAuditLogSince] = useState("");
  const [auditLogOffset, setAuditLogOffset] = useState(0);
  const [auditLogDistinctActions, setAuditLogDistinctActions] = useState<string[]>([]);
  const [backupSchedule, setBackupSchedule] = useState({ enabled: false, frequency: "daily", hour: 3, retention_days: 7 });
  const [walConfig, setWalConfig] = useState<Record<string, any>>({});
  const [isWalConfigLoading, setIsWalConfigLoading] = useState(false);
  // All modules always enabled — flat-pack billing (differentiated by resource limits, not features)
  const [edgePlaygroundSql, setEdgePlaygroundSql] = useState("SELECT now()");
  const [edgePlaygroundKey, setEdgePlaygroundKey] = useState("");
  const [edgePlaygroundResult, setEdgePlaygroundResult] = useState<string | null>(null);
  const [isEdgePlaygroundLoading, setIsEdgePlaygroundLoading] = useState(false);

  // ─── pgvector state ──────────────────────────────────────────────────────────
  const [vectorStatus, setVectorStatus] = useState<{ installed: boolean; version: string | null } | null>(null);
  const [vectorCollections, setVectorCollections] = useState<any[]>([]);
  const [isVectorLoading, setIsVectorLoading] = useState(false);
  const [selectedVectorCollection, setSelectedVectorCollection] = useState<string | null>(null);
  const [vectorDetail, setVectorDetail] = useState<any>(null);
  const [vectorItems, setVectorItems] = useState<any[]>([]);
  const [vectorSearchResults, setVectorSearchResults] = useState<any[] | null>(null);
  const [vectorSearchInput, setVectorSearchInput] = useState("");
  const [vectorSearchMetric, setVectorSearchMetric] = useState("cosine");
  const [vectorSearchTopK, setVectorSearchTopK] = useState(10);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const [showCreateVectorModal, setShowCreateVectorModal] = useState(false);
  const [newVectorName, setNewVectorName] = useState("");
  const [newVectorDims, setNewVectorDims] = useState("1536");
  const [newVectorMetric, setNewVectorMetric] = useState("cosine");

  // ─── Full-Text Search state ──────────────────────────────────────────────────
  const [searchView, setSearchView] = useState<SearchView>("overview");
  const [ftsIndexedColumns, setFtsIndexedColumns] = useState<any[]>([]);
  const [ftsIndexes, setFtsIndexes] = useState<any[]>([]);
  const [ftsConfigs, setFtsConfigs] = useState<any[]>([]);
  const [ftsEligible, setFtsEligible] = useState<any[]>([]);
  const [isFtsLoading, setIsFtsLoading] = useState(false);
  const [ftsLoaded, setFtsLoaded] = useState(false);
  const [ftsQuery, setFtsQuery] = useState("");
  const [ftsTable, setFtsTable] = useState("");
  const [ftsColumn, setFtsColumn] = useState("");
  const [ftsConfig, setFtsConfig] = useState("english");
  const [ftsResults, setFtsResults] = useState<any[] | null>(null);
  const [isFtsSearching, setIsFtsSearching] = useState(false);
  const [showFtsSetupModal, setShowFtsSetupModal] = useState(false);
  const [ftsSetupTable, setFtsSetupTable] = useState("");
  const [ftsSetupColumns, setFtsSetupColumns] = useState<Array<{ name: string; weight: string }>>([]);
  const [ftsSetupConfig, setFtsSetupConfig] = useState("english");

  // ─── Webhooks state ──────────────────────────────────────────────────────────
  const [webhooksView, setWebhooksView] = useState<WebhooksView>("list");
  const [webhooksList, setWebhooksList] = useState<any[]>([]);
  const [isWebhooksLoading, setIsWebhooksLoading] = useState(false);
  const [webhooksLoaded, setWebhooksLoaded] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [isWebhookLogsLoading, setIsWebhookLogsLoading] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookTable, setNewWebhookTable] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(["INSERT", "UPDATE", "DELETE"]);
  const [newWebhookSecret, setNewWebhookSecret] = useState("");
  const [webhookTables, setWebhookTables] = useState<any[]>([]);

  // ─── OAuth2 (Hydra) state ──────────────────────────────────────────────────
  const [oauth2View, setOAuth2View] = useState<OAuth2View>("overview");
  const [hydraHealth, setHydraHealth] = useState<any>(null);
  const [hydraClients, setHydraClients] = useState<any[]>([]);
  const [isHydraLoading, setIsHydraLoading] = useState(false);
  const [hydraLoaded, setHydraLoaded] = useState(false);
  const [hydraDiscovery, setHydraDiscovery] = useState<any>(null);
  const [hydraJwks, setHydraJwks] = useState<any>(null);
  const [selectedHydraClient, setSelectedHydraClient] = useState<any>(null);
  const [showCreateClientModal, setShowCreateClientModal] = useState(false);
  const [editingHydraClient, setEditingHydraClient] = useState<any>(null);
  const [selectedOAuth2Snippet, setSelectedOAuth2Snippet] = useState(0);

  // ─── API Gateway (Oathkeeper) state ─────────────────────────────────────────
  const [gatewayView, setGatewayView] = useState<GatewayView>("overview");
  const [oathkeeperHealth, setOathkeeperHealth] = useState<any>(null);
  const [oathkeeperRules, setOathkeeperRules] = useState<any[]>([]);
  const [isOathkeeperLoading, setIsOathkeeperLoading] = useState(false);
  const [oathkeeperLoaded, setOathkeeperLoaded] = useState(false);
  const [oathkeeperVersion, setOathkeeperVersion] = useState<any>(null);
  const [selectedGatewayRule, setSelectedGatewayRule] = useState<any>(null);
  const [selectedGatewaySnippet, setSelectedGatewaySnippet] = useState(0);

  // ─── Feature Flags state ────────────────────────────────────────────────────
  const [flagsView, setFlagsView] = useState<FlagsView>("list");
  const [cacheView, setCacheView] = useState<CacheView>("browser");
  const [flagdHealth, setFlagdHealth] = useState<{ connected?: boolean } | null>(null);
  const [cacheHealth, setCacheHealth] = useState<{ ok?: boolean; configured?: boolean } | null>(null);

  // ─── AuthZ (Keto) state ────────────────────────────────────────────────────
  const [ketoNamespaces, setKetoNamespaces] = useState<Array<{ name: string }>>([]);
  const [ketoTuples, setKetoTuples] = useState<Array<{ namespace: string; object: string; relation: string; subject_id?: string; subject_set?: { namespace: string; object: string; relation: string } }>>([]);
  const [ketoTuplesNextToken, setKetoTuplesNextToken] = useState("");
  const [isKetoLoading, setIsKetoLoading] = useState(false);
  const [ketoHealth, setKetoHealth] = useState<{ read?: { status: string }; writeConfigured?: boolean } | null>(null);
  // Permission checker
  const [ketoCheckNs, setKetoCheckNs] = useState("");
  const [ketoCheckObj, setKetoCheckObj] = useState("");
  const [ketoCheckRel, setKetoCheckRel] = useState("");
  const [ketoCheckSub, setKetoCheckSub] = useState("");
  const [ketoCheckResult, setKetoCheckResult] = useState<{ allowed?: boolean; error?: string } | null>(null);
  const [isKetoChecking, setIsKetoChecking] = useState(false);
  const [ketoExpandResult, setKetoExpandResult] = useState<unknown>(null);
  // Tuple filter
  const [ketoFilterNs, setKetoFilterNs] = useState("");
  const [ketoFilterObj, setKetoFilterObj] = useState("");
  const [ketoFilterRel, setKetoFilterRel] = useState("");
  // Create tuple form
  const [ketoNewNs, setKetoNewNs] = useState("");
  const [ketoNewObj, setKetoNewObj] = useState("");
  const [ketoNewRel, setKetoNewRel] = useState("");
  const [ketoNewSub, setKetoNewSub] = useState("");
  const [isKetoCreating, setIsKetoCreating] = useState(false);
  // User detail panel (AuthN ↔ AuthZ bridge)
  const [selectedIdentityId, setSelectedIdentityId] = useState<string | null>(null);
  const [selectedIdentityDetail, setSelectedIdentityDetail] = useState<{ identity: AuthIdentity & { credentials?: Record<string, unknown>; recovery_addresses?: Array<{ value: string; via: string }>; verifiable_addresses?: Array<{ value: string; verified: boolean; status: string }> }; sessions: AuthSession[] } | null>(null);
  const [selectedIdentityTuples, setSelectedIdentityTuples] = useState<typeof ketoTuples>([]);
  const [isIdentityDetailLoading, setIsIdentityDetailLoading] = useState(false);
  // Who can access
  const [whoCanAccessNs, setWhoCanAccessNs] = useState("");
  const [whoCanAccessObj, setWhoCanAccessObj] = useState("");
  const [whoCanAccessResult, setWhoCanAccessResult] = useState<{ tuples: typeof ketoTuples; relations: string[]; accessMap: Array<{ subject: string; permissions: Record<string, boolean> }> } | null>(null);
  const [isWhoCanAccessLoading, setIsWhoCanAccessLoading] = useState(false);
  // Assign from user picker
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignNs, setAssignNs] = useState("");
  const [assignObj, setAssignObj] = useState("");
  const [assignRel, setAssignRel] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  // User search
  const [authUserSearch, setAuthUserSearch] = useState("");
  // Password reset
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  // Bulk tuple select
  const [selectedTupleIndices, setSelectedTupleIndices] = useState<Set<number>>(new Set());
  const [isBulkDeletingTuples, setIsBulkDeletingTuples] = useState(false);
  // Import/export
  const [showImportTuplesModal, setShowImportTuplesModal] = useState(false);
  const [importTuplesJson, setImportTuplesJson] = useState("");
  const [importTuplesResult, setImportTuplesResult] = useState<{ imported: number; failed: number } | null>(null);
  const [isImportingTuples, setIsImportingTuples] = useState(false);
  // Permission check history
  const [ketoCheckHistory, setKetoCheckHistory] = useState<Array<{ ns: string; obj: string; rel: string; sub: string; allowed: boolean }>>([]);

  const [isUrlDiagLoading, setIsUrlDiagLoading] = useState(false);
  const [bucketPolicyText, setBucketPolicyText] = useState("{}");
  const [bucketPolicyError, setBucketPolicyError] = useState("");
  const [bucketPolicyInfo, setBucketPolicyInfo] = useState("");
  const [isBucketPolicyLoading, setIsBucketPolicyLoading] = useState(false);
  const [isBucketPolicySaving, setIsBucketPolicySaving] = useState(false);
  const [databaseCatalog, setDatabaseCatalog] = useState<DatabaseCatalog | null>(null);
  const [databaseCatalogError, setDatabaseCatalogError] = useState("");
  const [isDatabaseCatalogLoading, setIsDatabaseCatalogLoading] = useState(false);
  const [sqlDiagnostics, setSqlDiagnostics] = useState<SqlDiagnostics | null>(null);
  const [sqlDiagnosticsError, setSqlDiagnosticsError] = useState("");
  const [slowQueries, setSlowQueries] = useState<{ enabled: boolean; queries: Array<Record<string, unknown>> } | null>(null);
  const [isSlowQueriesLoading, setIsSlowQueriesLoading] = useState(false);
  const [slowQueriesError, setSlowQueriesError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [connInspector, setConnInspector] = useState<Record<string, any> | null>(null);
  const [isConnInspectorLoading, setIsConnInspectorLoading] = useState(false);
  const [connInspectorError, setConnInspectorError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [autovacuumData, setAutovacuumData] = useState<Record<string, any> | null>(null);
  const [isAutovacuumLoading, setIsAutovacuumLoading] = useState(false);
  const [autovacuumError, setAutovacuumError] = useState("");
  const [slowQueriesFilter, setSlowQueriesFilter] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [topQueries, setTopQueries] = useState<{ available: boolean; queries: Array<Record<string, any>>; stats: Record<string, any>; sort: string; message?: string } | null>(null);
  const [isTopQueriesLoading, setIsTopQueriesLoading] = useState(false);
  const [topQueriesError, setTopQueriesError] = useState("");
  const [topQueriesSort, setTopQueriesSort] = useState("total_time");
  const [expandedTopQuery, setExpandedTopQuery] = useState<string | null>(null);
  const [expandedSlowQuery, setExpandedSlowQuery] = useState<string | null>(null);
  const [isSqlDiagnosticsLoading, setIsSqlDiagnosticsLoading] = useState(false);
  const [securityAdvisor, setSecurityAdvisor] = useState<SecurityAdvisor | null>(null);
  const [securityAdvisorError, setSecurityAdvisorError] = useState("");
  const [securityAdvisorInfo, setSecurityAdvisorInfo] = useState("");
  const [isSecurityAdvisorLoading, setIsSecurityAdvisorLoading] = useState(false);
  const [performanceAdvisor, setPerformanceAdvisor] = useState<PerformanceAdvisor | null>(null);
  const [performanceAdvisorError, setPerformanceAdvisorError] = useState("");
  const [performanceAdvisorInfo, setPerformanceAdvisorInfo] = useState("");
  const [isPerformanceAdvisorLoading, setIsPerformanceAdvisorLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [latencyPercentiles, setLatencyPercentiles] = useState<Record<string, any> | null>(null);
  const [isLatencyLoading, setIsLatencyLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [indexAdvisor, setIndexAdvisor] = useState<Record<string, any> | null>(null);
  const [indexAdvisorError, setIndexAdvisorError] = useState("");
  const [isIndexAdvisorLoading, setIsIndexAdvisorLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bloatData, setBloatData] = useState<Record<string, any> | null>(null);
  const [bloatError, setBloatError] = useState("");
  const [isBloatLoading, setIsBloatLoading] = useState(false);
  const [perfTab, setPerfTab] = useState<"slow-queries" | "index-advisor" | "bloat" | "partitioning">("slow-queries");
  const [partitioningData, setPartitioningData] = useState<Record<string, any> | null>(null);
  const [partitioningError, setPartitioningError] = useState("");
  const [isPartitioningLoading, setIsPartitioningLoading] = useState(false);
  const [explainPlan, setExplainPlan] = useState<Record<string, unknown> | null>(null);
  const [explainError, setExplainError] = useState("");
  const [isExplainLoading, setIsExplainLoading] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isMigrationStatusLoading, setIsMigrationStatusLoading] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [migrationInfo, setMigrationInfo] = useState("");
  const [migrationAppliedNow, setMigrationAppliedNow] = useState<string[]>([]);
  const [migrationRawOutput, setMigrationRawOutput] = useState("");
  const [showMigrationLogs, setShowMigrationLogs] = useState(false);
  const [isMigrationRunning, setIsMigrationRunning] = useState(false);
  const [newMigrationName, setNewMigrationName] = useState("");
  const [isMigrationCreating, setIsMigrationCreating] = useState(false);
  const [idempotentStatus, setIdempotentStatus] = useState<IdempotentMigrationStatus | null>(null);
  const [isIdempotentLoading, setIsIdempotentLoading] = useState(false);
  const [idempotentError, setIdempotentError] = useState("");
  const [idempotentRunning, setIdempotentRunning] = useState(false);
  const [idempotentResult, setIdempotentResult] = useState<{ ok: boolean; summary: string; applied: Array<{ name: string; hash: string | null }>; failed: { name: string; error: string; statement: string | null } | null } | null>(null);
  const [schemaDetection, setSchemaDetection] = useState<Record<string, SchemaDetectionResult>>({});
  const [migrationDiffTarget, setMigrationDiffTarget] = useState<string | null>(null);
  const [appEnvironment, setAppEnvironment] = useState<"development" | "staging" | "production">("development");
  // accountView removed — use settingsView
  const [userAccount, setUserAccount] = useState({ name: "Dev User", email: "dev@truss.local", avatar: "" });
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string, actor: string, action: string, resource_type: string, resource_id: string, payload: any, created_at: string }>>([]);
  const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountInfo, setAccountInfo] = useState("");
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [cmdPaletteQuery, setCmdPaletteQuery] = useState("");
  const [cmdPaletteIndex, setCmdPaletteIndex] = useState(0);

  const apiBaseUrl = useMemo(resolveApiBaseUrl, []);
  // Store globally so DeveloperSDK and other utilities can reach the API
  useMemo(() => setApiBaseUrl(apiBaseUrl), [apiBaseUrl]);

  // ─── Auth hook (session, auth gate, dev tenants, profile password) ─────────
  const {
    authChecked, authRequired, session, setSession, permissions, authScreenView, setAuthScreenView,
    authGateEmail, setAuthGateEmail, authGatePassword, setAuthGatePassword,
    authGateError, setAuthGateError, authGateLoading, setAuthGateLoading,
    authGateDisplayName, setAuthGateDisplayName, authLoginMethod, setAuthLoginMethod,
    authGateCode, setAuthGateCode, authCodeSent, setAuthCodeSent,
    showDemoWelcome, setShowDemoWelcome, demoToastVisible,
    devTenants, devCurrentTenant, setDevCurrentTenant, showDevTenantDropdown, setShowDevTenantDropdown,
    profileNewPassword, setProfileNewPassword, profileConfirmPassword, setProfileConfirmPassword,
    profilePasswordError, setProfilePasswordError, profilePasswordSuccess, setProfilePasswordSuccess,
    refreshSession, handleLogin, handleCodeLogin, handleMagicLink, handlePasskeyLogin,
    handleRegister, handleLogout, handleDevTenantSwitch, changePassword,
  } = useAuth(apiBaseUrl);

  // ─── Billing hook (resource-limit usage for write-gating + home widget) ────
  // Billing/plan MANAGEMENT UI is cloud-only and lives in truss-cloud.
  const {
    billingUsage, setBillingUsage, isBillingLoading, setIsBillingLoading,
    billingError, setBillingError,
    billingRestrictions,
    loadBillingUsage,
  } = useBilling(apiBaseUrl);

  const loadAuditLogs = useCallback(async (opts?: { action?: string; search?: string; since?: string; range?: string; offset?: number }) => {
    setIsAuditLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (opts?.action) params.set("action", opts.action);
      if (opts?.search) params.set("search", opts.search);
      if (opts?.since) params.set("since", opts.since);
      if (opts?.range) params.set("range", opts.range);
      if (opts?.offset) params.set("offset", String(opts.offset));
      const response = await apiFetch(`${apiBaseUrl}/api/audit-logs?${params.toString()}`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load audit logs.");
      setAuditLogs(body.logs || []);
      if (body.total != null) setAuditLogsTotal(body.total);
      if (body.distinct_actions) setAuditLogDistinctActions(body.distinct_actions);
      if (opts?.offset !== undefined) setAuditLogOffset(opts.offset);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Failed to load audit logs.");
    } finally {
      setIsAuditLogsLoading(false);
    }
  }, [apiBaseUrl]);

  // ─── Keto callbacks ─────────────────────────────────────────────────────────

  const loadKetoHealth = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/keto/health`);
      const data = await r.json();
      setKetoHealth(data);
    } catch { setKetoHealth(null); }
  }, [apiBaseUrl]);

  const loadKetoNamespaces = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/keto/namespaces`);
      const data = await r.json();
      setKetoNamespaces(data.namespaces || []);
      if (!ketoCheckNs && data.namespaces?.length) setKetoCheckNs(data.namespaces[0].name);
      if (!ketoFilterNs && data.namespaces?.length) setKetoFilterNs(data.namespaces[0].name);
      if (!ketoNewNs && data.namespaces?.length) setKetoNewNs(data.namespaces[0].name);
    } catch { setKetoNamespaces([]); }
  }, [apiBaseUrl, ketoCheckNs, ketoFilterNs, ketoNewNs]);

  const loadKetoTuples = useCallback(async (ns?: string, obj?: string, rel?: string, token?: string) => {
    setIsKetoLoading(true);
    try {
      const qs = new URLSearchParams();
      const n = ns ?? ketoFilterNs;
      if (n) qs.set("namespace", n);
      if (obj ?? ketoFilterObj) qs.set("object", (obj ?? ketoFilterObj));
      if (rel ?? ketoFilterRel) qs.set("relation", (rel ?? ketoFilterRel));
      if (token) qs.set("page_token", token);
      qs.set("page_size", "100");
      const r = await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples?${qs.toString()}`);
      const data = await r.json();
      setKetoTuples(token ? [...ketoTuples, ...(data.relation_tuples || [])] : data.relation_tuples || []);
      setKetoTuplesNextToken(data.next_page_token || "");
    } catch { setKetoTuples([]); }
    finally { setIsKetoLoading(false); }
  }, [apiBaseUrl, ketoFilterNs, ketoFilterObj, ketoFilterRel, ketoTuples]);

  const checkKetoPermission = useCallback(async () => {
    if (!ketoCheckNs || !ketoCheckObj || !ketoCheckRel || !ketoCheckSub) return;
    setIsKetoChecking(true);
    setKetoCheckResult(null);
    setKetoExpandResult(null);
    try {
      const checkBody: Record<string, unknown> = { namespace: ketoCheckNs, object: ketoCheckObj, relation: ketoCheckRel };
      if (ketoCheckSub.includes(":") && ketoCheckSub.includes("#")) {
        const [nsObj, rel] = ketoCheckSub.split("#");
        const [ns, obj] = nsObj.split(":");
        checkBody.subject_set = { namespace: ns, object: obj, relation: rel };
      } else {
        checkBody.subject_id = ketoCheckSub;
      }
      const r = await apiFetch(`${apiBaseUrl}/api/keto/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkBody),
      });
      const data = await r.json();
      setKetoCheckResult(data);
      // Save to history
      setKetoCheckHistory(prev => [{ ns: ketoCheckNs, obj: ketoCheckObj, rel: ketoCheckRel, sub: ketoCheckSub, allowed: data.allowed ?? false }, ...prev].slice(0, 20));
      // Also expand
      try {
        const qs = new URLSearchParams({ namespace: ketoCheckNs, object: ketoCheckObj, relation: ketoCheckRel, "max-depth": "5" });
        const er = await apiFetch(`${apiBaseUrl}/api/keto/expand?${qs.toString()}`);
        const ed = await er.json();
        setKetoExpandResult(ed);
      } catch { /* expand optional */ }
    } catch (e) {
      setKetoCheckResult({ error: e instanceof Error ? e.message : "Check failed" });
    } finally { setIsKetoChecking(false); }
  }, [apiBaseUrl, ketoCheckNs, ketoCheckObj, ketoCheckRel, ketoCheckSub]);

  const [batchCheckResults, setBatchCheckResults] = useState<Array<{ namespace: string; object: string; relation: string; subject_id?: string; allowed: boolean }>>([]);
  const [isBatchChecking, setIsBatchChecking] = useState(false);
  const batchCheckKetoPermissions = useCallback(async (checks: Array<{ namespace: string; object: string; relation: string; subject_id?: string; subject_set?: { namespace: string; object: string; relation: string } }>) => {
    setIsBatchChecking(true);
    setBatchCheckResults([]);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/keto/batch-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks }),
      });
      const data = await r.json();
      setBatchCheckResults(data.results || []);
    } catch {
      setBatchCheckResults([]);
    } finally { setIsBatchChecking(false); }
  }, [apiBaseUrl]);


  const createKetoTuple = useCallback(async () => {
    if (!ketoNewNs || !ketoNewObj || !ketoNewRel || !ketoNewSub) return;
    setIsKetoCreating(true);
    try {
      const body: Record<string, unknown> = { namespace: ketoNewNs, object: ketoNewObj, relation: ketoNewRel };
      if (ketoNewSub.includes(":") && ketoNewSub.includes("#")) {
        const [nsObj, rel] = ketoNewSub.split("#");
        const [ns, obj] = nsObj.split(":");
        body.subject_set = { namespace: ns, object: obj, relation: rel };
      } else {
        body.subject_id = ketoNewSub;
      }
      const r = await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setKetoNewObj("");
        setKetoNewSub("");
        loadKetoTuples();
      }
    } catch (err) { console.error("Failed to create tuple:", err); }
    finally { setIsKetoCreating(false); }
  }, [apiBaseUrl, ketoNewNs, ketoNewObj, ketoNewRel, ketoNewSub, loadKetoTuples]);

  const deleteKetoTuple = useCallback(async (tuple: typeof ketoTuples[0]) => {
    try {
      const qs = new URLSearchParams({ namespace: tuple.namespace, object: tuple.object, relation: tuple.relation });
      if (tuple.subject_id) qs.set("subject_id", tuple.subject_id);
      if (tuple.subject_set) {
        qs.set("subject_set.namespace", tuple.subject_set.namespace);
        qs.set("subject_set.object", tuple.subject_set.object);
        qs.set("subject_set.relation", tuple.subject_set.relation);
      }
      await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples?${qs.toString()}`, { method: "DELETE" });
      setKetoTuples(ketoTuples.filter(t => t !== tuple));
    } catch (err) { console.error("Failed to delete tuple:", err); }
  }, [apiBaseUrl, ketoTuples]);

  // Load identity detail + their Keto tuples
  const loadIdentityDetail = useCallback(async (id: string) => {
    setSelectedIdentityId(id);
    setIsIdentityDetailLoading(true);
    setSelectedIdentityDetail(null);
    setSelectedIdentityTuples([]);
    try {
      const [detailR, tuplesR] = await Promise.all([
        apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}`),
        apiFetch(`${apiBaseUrl}/api/keto/subject-tuples/${encodeURIComponent(id)}`).catch(() => null),
      ]);
      const detail = await detailR.json();
      if (detailR.ok) setSelectedIdentityDetail(detail);
      if (tuplesR?.ok) {
        const td = await tuplesR.json();
        setSelectedIdentityTuples(td.relation_tuples || []);
      }
    } catch { /* */ }
    finally { setIsIdentityDetailLoading(false); }
  }, [apiBaseUrl]);

  // Who can access lookup
  const loadWhoCanAccess = useCallback(async () => {
    if (!whoCanAccessNs || !whoCanAccessObj) return;
    setIsWhoCanAccessLoading(true);
    setWhoCanAccessResult(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/keto/who-can-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace: whoCanAccessNs, object: whoCanAccessObj }),
      });
      const data = await r.json();
      if (r.ok) setWhoCanAccessResult(data);
    } catch { /* */ }
    finally { setIsWhoCanAccessLoading(false); }
  }, [apiBaseUrl, whoCanAccessNs, whoCanAccessObj]);

  // Assign role from modal (creates tuple)
  const assignRole = useCallback(async () => {
    if (!assignNs || !assignObj || !assignRel || !assignSubjectId) return;
    try {
      await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace: assignNs, object: assignObj, relation: assignRel, subject_id: assignSubjectId }),
      });
      setShowAssignModal(false);
      loadKetoTuples();
      // Reload identity detail if viewing
      if (selectedIdentityId === assignSubjectId) loadIdentityDetail(assignSubjectId);
    } catch (err) { console.error("Failed to assign role:", err); }
  }, [apiBaseUrl, assignNs, assignObj, assignRel, assignSubjectId, loadKetoTuples, loadIdentityDetail, selectedIdentityId]);

  // Admin password reset
  const resetUserPassword = useCallback(async (id: string, password: string) => {
    setIsResettingPassword(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to reset password");
      setResetPasswordId(null);
      setResetPasswordValue("");
      setAuthUsersInfo("Password reset successfully.");
    } catch (e) {
      setAuthUsersError(e instanceof Error ? e.message : "Password reset failed.");
    } finally { setIsResettingPassword(false); }
  }, [apiBaseUrl]);

  // Force logout all sessions for a user
  const forceLogoutUser = useCallback(async (id: string) => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}/sessions`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to revoke sessions");
      setAuthUsersInfo("All sessions revoked.");
      if (selectedIdentityId === id) loadIdentityDetail(id);
    } catch (e) {
      setAuthUsersError(e instanceof Error ? e.message : "Failed to revoke sessions.");
    }
  }, [apiBaseUrl, selectedIdentityId, loadIdentityDetail]);

  // Bulk delete tuples
  const bulkDeleteTuples = useCallback(async () => {
    const tuplesToDelete = ketoTuples.filter((_, i) => selectedTupleIndices.has(i));
    if (tuplesToDelete.length === 0) return;
    setIsBulkDeletingTuples(true);
    try {
      await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuples: tuplesToDelete }),
      });
      setSelectedTupleIndices(new Set());
      loadKetoTuples();
    } catch (err) { console.error("Failed to bulk-delete tuples:", err); }
    finally { setIsBulkDeletingTuples(false); }
  }, [apiBaseUrl, ketoTuples, selectedTupleIndices, loadKetoTuples]);

  // Import tuples
  const importTuples = useCallback(async () => {
    setIsImportingTuples(true);
    setImportTuplesResult(null);
    try {
      const tuples = JSON.parse(importTuplesJson);
      if (!Array.isArray(tuples)) throw new Error("Must be a JSON array");
      const r = await apiFetch(`${apiBaseUrl}/api/keto/relation-tuples/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tuples }),
      });
      const data = await r.json();
      setImportTuplesResult(data);
      if (data.imported > 0) loadKetoTuples();
    } catch (e) {
      setImportTuplesResult({ imported: 0, failed: -1 });
    } finally { setIsImportingTuples(false); }
  }, [apiBaseUrl, importTuplesJson, loadKetoTuples]);

  const loadApiKeys = useCallback(async () => {
    setIsApiKeysLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/keys`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load API keys.");
      setApiKeys(body.keys || []);
    } catch {
      setApiKeys([]);
    } finally {
      setIsApiKeysLoading(false);
    }
  }, [apiBaseUrl]);

  const createApiKey = useCallback(async (keyType: string, label: string) => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyType, label }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to create API key.");
      setNewKeySecret(body.secret);
      setApiKeyCopied(false);
      loadApiKeys();
    } catch {
      // handled silently
    }
  }, [apiBaseUrl, loadApiKeys]);

  const revokeApiKey = useCallback(async (id: string) => {
    try {
      await apiFetch(`${apiBaseUrl}/api/keys/${id}`, { method: "DELETE" });
      loadApiKeys();
    } catch {
      // handled silently
    }
  }, [apiBaseUrl, loadApiKeys]);

  const updateApiKeyRateLimit = useCallback(async (id: string, rateLimit: number | null) => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate_limit: rateLimit }),
      });
      if (!response.ok) throw new Error("Failed to update rate limit.");
      loadApiKeys();
    } catch {
      // handled silently
    }
  }, [apiBaseUrl, loadApiKeys]);

  // --- S4: Branch callbacks ---
  const loadFdw = useCallback(async () => {
    setIsFdwLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/fdw`);
      const body = await parseApiResponse(response);
      if (response.ok) setFdwData(body as any);
    } catch {} finally { setIsFdwLoading(false); }
  }, [apiBaseUrl]);

  const runMigrationSafetyCheck = useCallback(async () => {
    setIsMigrationChecking(true);
    setMigrationSafetyCheck(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/check`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (response.ok) setMigrationSafetyCheck(body as any);
    } catch {} finally { setIsMigrationChecking(false); }
  }, [apiBaseUrl]);

  const loadMigrationPreview = useCallback(async (filename: string) => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/preview/${encodeURIComponent(filename)}`);
      const body = await parseApiResponse(response);
      if (response.ok) setMigrationPreview(body as any);
    } catch {}
  }, [apiBaseUrl]);

  const loadProviderConfigs = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/providers/config`);
      const body = await parseApiResponse(response);
      if (response.ok) setProviderConfigs((body as any).configs || {});
    } catch {}
  }, [apiBaseUrl]);

  const saveProviderConfig = useCallback(async (providerId: string, clientId: string, clientSecret: string, enabled: boolean) => {
    try {
      await apiFetch(`${apiBaseUrl}/api/auth/providers/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, clientId, clientSecret, enabled }),
      });
      loadProviderConfigs();
    } catch {}
  }, [apiBaseUrl, loadProviderConfigs]);

  const loadBackupSchedule = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups/schedule`);
      const body = await parseApiResponse(response);
      if (response.ok) setBackupSchedule((body as any).schedule || { enabled: false, frequency: "daily", hour: 3, retention_days: 7 });
    } catch {}
  }, [apiBaseUrl]);

  const saveBackupSchedule = useCallback(async () => {
    try {
      await apiFetch(`${apiBaseUrl}/api/backups/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: backupSchedule }),
      });
    } catch {}
  }, [apiBaseUrl, backupSchedule]);

  const loadWalConfig = useCallback(async () => {
    setIsWalConfigLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups/wal-config`);
      const body = await parseApiResponse(response);
      if (response.ok) setWalConfig(body as any);
    } catch {} finally { setIsWalConfigLoading(false); }
  }, [apiBaseUrl]);

  const requestPitr = useCallback(async (targetTime: string) => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups/pitr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTime }),
      });
      return await parseApiResponse(response);
    } catch { return null; }
  }, [apiBaseUrl]);

  // Module toggles removed — flat-pack billing means all features always enabled.
  // loadEnabledModules / saveEnabledModules are no longer needed.

  const loadLocks = useCallback(async () => {
    setIsLocksLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/locks`);
      const body = await parseApiResponse(response);
      if (response.ok) setLockData(body);
    } catch {
      // silent
    } finally {
      setIsLocksLoading(false);
    }
  }, [apiBaseUrl]);

  // --- Realtime callbacks ---
  const loadRealtimeStatus = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/realtime/status`);
      const data = await r.json();
      setRealtimeStatus(data);
    } catch { /* */ }
  }, [apiBaseUrl]);

  const loadRealtimeSubscriptions = useCallback(async () => {
    setIsRealtimeLoading(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/realtime/subscriptions`);
      const data = await r.json();
      setRealtimeSubscriptions(data.subscriptions || []);
    } catch { /* */ }
    finally { setIsRealtimeLoading(false); }
  }, [apiBaseUrl]);

  const loadRealtimeEvents = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/realtime/events`);
      const data = await r.json();
      setRealtimeEvents(data.events || []);
    } catch { /* */ }
  }, [apiBaseUrl]);

  const loadRealtimeTables = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/realtime/tables`);
      const data = await r.json();
      setRealtimeTables(data.tables || []);
    } catch { /* */ }
  }, [apiBaseUrl]);

  const subscribeRealtime = useCallback(async (schema: string, table: string) => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/realtime/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, table }),
      });
      if (r.ok) {
        loadRealtimeSubscriptions();
        loadRealtimeStatus();
      }
    } catch { /* */ }
  }, [apiBaseUrl, loadRealtimeSubscriptions, loadRealtimeStatus]);

  const unsubscribeRealtime = useCallback(async (schema: string, table: string) => {
    try {
      await apiFetch(`${apiBaseUrl}/api/realtime/subscribe?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`, { method: "DELETE" });
      loadRealtimeSubscriptions();
      loadRealtimeStatus();
    } catch { /* */ }
  }, [apiBaseUrl, loadRealtimeSubscriptions, loadRealtimeStatus]);

  const clearRealtimeLog = useCallback(async () => {
    try {
      await apiFetch(`${apiBaseUrl}/api/realtime/clear-log`, { method: "POST" });
      setRealtimeEvents([]);
    } catch { /* */ }
  }, [apiBaseUrl]);

  // WebSocket connection for live events
  const connectRealtimeWs = useCallback(() => {
    if (realtimeWs) { realtimeWs.close(); }
    const wsUrl = apiBaseUrl.replace(/^http/, "ws") + "/realtime";
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setRealtimeWsConnected(true);
    ws.onclose = () => { setRealtimeWsConnected(false); setRealtimeWs(null); };
    ws.onerror = () => { setRealtimeWsConnected(false); };
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "connected") return;
        if (data.type === "presence_state") {
          setPresenceUsers(data.users || []);
          return;
        }
        if (data.type === "presence_update") {
          setPresenceUsers(prev => {
            let next = prev.filter((u) => !data.leaves.includes(u.user_id));
            for (const join of (data.joins || [])) {
              if (!next.find((u) => u.user_id === join.user_id)) next = [...next, join];
            }
            return next;
          });
          return;
        }
        setRealtimeEvents(prev => [data, ...prev].slice(0, 200));
      } catch { /* */ }
    };
    setRealtimeWs(ws);
  }, [apiBaseUrl, realtimeWs]);

  const disconnectRealtimeWs = useCallback(() => {
    if (realtimeWs) { realtimeWs.close(); setRealtimeWs(null); }
    setRealtimeWsConnected(false);
    setPresenceJoined(false);
    setPresenceUsers([]);
  }, [realtimeWs]);

  const joinPresenceChannel = useCallback((channel: string, userId: string, meta: Record<string, any>) => {
    if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
    realtimeWs.send(JSON.stringify({ type: "presence_join", channel, user_id: userId, meta }));
    setPresenceJoined(true);
  }, [realtimeWs]);

  const leavePresenceChannel = useCallback((channel: string) => {
    if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
    realtimeWs.send(JSON.stringify({ type: "presence_leave", channel }));
    setPresenceJoined(false);
    setPresenceUsers([]);
  }, [realtimeWs]);

  const loadBranches = useCallback(async () => {
    setIsBranchesLoading(true);
    setBranchError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/branches`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load branches.");
      setBranches(body.branches || []);
    } catch (err: any) {
      setBranchError(err.message);
      setBranches([]);
    } finally {
      setIsBranchesLoading(false);
    }
  }, [apiBaseUrl]);

  const createBranch = useCallback(async (label: string, ttlHours: number) => {
    setBranchError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, ttlHours }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to create branch.");
      loadBranches();
    } catch (err: any) {
      setBranchError(err.message);
    }
  }, [apiBaseUrl, loadBranches]);

  const deleteBranch = useCallback(async (id: string) => {
    setBranchError(null);
    try {
      await apiFetch(`${apiBaseUrl}/api/branches/${id}`, { method: "DELETE" });
      loadBranches();
    } catch (err: any) {
      setBranchError(err.message);
    }
  }, [apiBaseUrl, loadBranches]);

  // --- S5: Backup callbacks ---
  const loadBackups = useCallback(async () => {
    setIsBackupsLoading(true);
    setBackupError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load backups.");
      setBackups(body.backups || []);
    } catch (err: any) {
      setBackupError(err.message);
      setBackups([]);
    } finally {
      setIsBackupsLoading(false);
    }
  }, [apiBaseUrl]);

  const createBackup = useCallback(async () => {
    setBackupError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups/snapshot`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to start backup.");
      loadBackups();
    } catch (err: any) {
      setBackupError(err.message);
    }
  }, [apiBaseUrl, loadBackups]);

  const restoreBackup = useCallback(async (id: string) => {
    setBackupError(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/backups/${id}/restore`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to start restore.");
    } catch (err: any) {
      setBackupError(err.message);
    }
  }, [apiBaseUrl]);

  const deleteBackup = useCallback(async (id: string) => {
    setBackupError(null);
    try {
      await apiFetch(`${apiBaseUrl}/api/backups/${id}`, { method: "DELETE" });
      loadBackups();
    } catch (err: any) {
      setBackupError(err.message);
    }
  }, [apiBaseUrl, loadBackups]);

  // --- S7: Consumption callbacks ---
  const loadConsumption = useCallback(async (days?: number) => {
    setIsConsumptionLoading(true);
    try {
      const d = days ?? consumptionDays;
      const [currentRes, historyRes, liveRes] = await Promise.all([
        apiFetch(`${apiBaseUrl}/api/consumption`),
        apiFetch(`${apiBaseUrl}/api/consumption/history?days=${d}`),
        apiFetch(`${apiBaseUrl}/api/consumption/live`),
      ]);
      const currentBody = await parseApiResponse(currentRes);
      const historyBody = await parseApiResponse(historyRes);
      const liveBody = await parseApiResponse(liveRes);
      if (currentRes.ok) setConsumption(currentBody);
      if (historyRes.ok) setConsumptionHistory(historyBody.snapshots || []);
      if (liveRes.ok) setConsumptionLive(liveBody);
    } catch {}
    setIsConsumptionLoading(false);
  }, [apiBaseUrl, consumptionDays]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  const currentDatabaseName =
    currentConnection?.connection?.database_name || metadata?.connection.database_name || "database";
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeEnvironment = environments.find(e => e.id === activeEnvironmentId);
  const currentProjectName = activeProject?.name || (deploymentMode === "managed" ? "Default Instance" : "Self-Hosted Instance");
  const databaseViewLabel =
    DATABASE_NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.id === databaseView)
      ?.label || "Database";
  const moduleCrumb =
    primaryNav === "home"
      ? { label: "Home", icon: <House size={15} weight="regular" /> }
      : primaryNav === "database"
        ? { label: "Database", icon: <Database size={15} weight="regular" /> }
        : primaryNav === "authn"
          ? { label: "Authentication", icon: <UserList size={15} weight="regular" /> }
          : primaryNav === "authz"
            ? { label: "Authorization", icon: <ShieldCheck size={15} weight="regular" /> }
            : primaryNav === "storage"
            ? { label: "Storage", icon: <PaintBucket size={15} weight="regular" /> }
            : primaryNav === "realtime"
              ? { label: "Realtime", icon: <Broadcast size={15} weight="regular" /> }
              : primaryNav === "sql"
                ? { label: "SQL", icon: <Code size={15} weight="regular" /> }
                : primaryNav === "edge"
                  ? { label: "Edge Functions", icon: <Lightning size={15} weight="regular" /> }
                  : primaryNav === "search"
                    ? { label: "Full-Text Search", icon: <MagnifyingGlass size={15} weight="regular" /> }
                    : primaryNav === "webhooks"
                      ? { label: "Webhooks", icon: <Waveform size={15} weight="regular" /> }
                      : primaryNav === "oauth2"
                        ? { label: "OAuth2", icon: <LockKey size={15} weight="regular" /> }
                        : primaryNav === "gateway"
                          ? { label: "API Gateway", icon: <Plug size={15} weight="regular" /> }
                          : primaryNav === "flags"
                            ? { label: "Feature Flags", icon: <Flag size={15} weight="regular" /> }
                            : { label: "Settings", icon: <GearSix size={15} weight="regular" /> };

  const sectionCrumb =
    primaryNav === "home"
      ? homeView === "projects"
        ? projectDetail && !isProjectDetailLoading
          ? { label: projectDetail.name, icon: <FolderSimple size={15} weight="regular" /> }
          : { label: "Projects", icon: <FolderSimple size={15} weight="regular" /> }
        : { label: "Your Stack", icon: <Package size={15} weight="regular" /> }
      : primaryNav === "database"
        ? {
            label:
              databaseView === "sql-editor"
                ? "SQL Editor"
                : databaseView === "sql-history"
                  ? "Query History"
                  : databaseViewLabel,
            icon: databaseIcon(databaseView),
          }
        : primaryNav === "authn"
          ? authView === "overview"
            ? { label: "Overview", icon: <ShieldCheck size={15} weight="regular" /> }
            : authView === "users"
              ? { label: "Users", icon: <User size={15} weight="regular" /> }
              : authView === "providers"
                ? { label: "Providers", icon: <Plug size={15} weight="regular" /> }
                : authView === "sessions"
                  ? { label: "Sessions", icon: <IdentificationCard size={15} weight="regular" /> }
                  : authView === "security"
                    ? { label: "Security", icon: <ShieldCheck size={15} weight="regular" /> }
                    : authView === "developer"
                      ? { label: "Developer", icon: <Code size={15} weight="regular" /> }
                      : { label: "Audit Logs", icon: <ClipboardText size={15} weight="regular" /> }
          : primaryNav === "authz"
            ? authzView === "overview"
              ? { label: "Overview", icon: <ShieldCheck size={15} weight="regular" /> }
              : authzView === "permissions"
                ? { label: "Permissions", icon: <ShieldCheck size={15} weight="regular" /> }
                : authzView === "roles"
                  ? { label: "Roles", icon: <Users size={15} weight="regular" /> }
                  : authzView === "model"
                    ? { label: "Model Editor", icon: <Code size={15} weight="regular" /> }
                    : { label: "Graph", icon: <TreeStructure size={15} weight="regular" /> }
            : primaryNav === "storage"
            ? storageView === "overview"
              ? { label: "Overview", icon: <PaintBucket size={15} weight="regular" /> }
              : storageView === "buckets"
                ? { label: "Buckets", icon: <Package size={15} weight="regular" /> }
                : { label: "Configuration", icon: <GearSix size={15} weight="regular" /> }
            : primaryNav === "sql"
              ? sqlMainView === "editor"
                ? { label: "SQL Editor", icon: <Code size={15} weight="regular" /> }
                : sqlMainView === "erd"
                  ? { label: "ER Diagram", icon: <TreeStructure size={15} weight="regular" /> }
                  : { label: "History", icon: <ClockCounterClockwise size={15} weight="regular" /> }
              : primaryNav === "realtime"
                ? { label: "Realtime", icon: <Broadcast size={15} weight="regular" /> }
                : primaryNav === "edge"
                ? edgeView === "developer"
                  ? { label: "API Reference", icon: <Code size={15} weight="regular" /> }
                  : { label: "Playground", icon: <Lightning size={15} weight="regular" /> }
                : primaryNav === "search"
                  ? searchView === "playground"
                    ? { label: "Playground", icon: <MagnifyingGlass size={15} weight="regular" /> }
                    : searchView === "setup"
                      ? { label: "Setup", icon: <GearSix size={15} weight="regular" /> }
                      : { label: "Overview", icon: <MagnifyingGlass size={15} weight="regular" /> }
                : primaryNav === "webhooks"
                  ? webhooksView === "create"
                    ? { label: "Create", icon: <Waveform size={15} weight="regular" /> }
                    : webhooksView === "detail"
                      ? { label: selectedWebhook?.name || "Detail", icon: <Waveform size={15} weight="regular" /> }
                      : { label: "All Webhooks", icon: <Waveform size={15} weight="regular" /> }
                : primaryNav === "oauth2"
                  ? oauth2View === "clients"
                    ? { label: "Clients", icon: <LockKey size={15} weight="regular" /> }
                    : oauth2View === "tokens"
                      ? { label: "Tokens", icon: <Key size={15} weight="regular" /> }
                      : oauth2View === "configuration"
                        ? { label: "Configuration", icon: <LockKey size={15} weight="regular" /> }
                        : oauth2View === "testing"
                          ? { label: "Testing", icon: <LockKey size={15} weight="regular" /> }
                          : { label: "Overview", icon: <LockKey size={15} weight="regular" /> }
                : primaryNav === "gateway"
                  ? gatewayView === "rules"
                    ? { label: "Rules", icon: <Plug size={15} weight="regular" /> }
                    : gatewayView === "testing"
                      ? { label: "Testing", icon: <Plug size={15} weight="regular" /> }
                      : gatewayView === "pipeline"
                        ? { label: "Pipeline", icon: <Plug size={15} weight="regular" /> }
                        : { label: "Overview", icon: <Plug size={15} weight="regular" /> }
                : primaryNav === "flags"
                  ? flagsView === "segments"
                    ? { label: "Segments", icon: <Flag size={15} weight="regular" /> }
                    : flagsView === "playground"
                      ? { label: "Playground", icon: <Flag size={15} weight="regular" /> }
                      : flagsView === "activity"
                        ? { label: "Activity", icon: <Flag size={15} weight="regular" /> }
                        : flagsView === "developer"
                          ? { label: "Developer", icon: <Flag size={15} weight="regular" /> }
                          : flagsView === "detail"
                            ? { label: "Flag Detail", icon: <Flag size={15} weight="regular" /> }
                            : { label: "All Flags", icon: <Flag size={15} weight="regular" /> }
                : settingsView === "account"
                  ? { label: "Account", icon: <User size={15} weight="regular" /> }
                  : settingsView === "team"
                  ? { label: "Team & Orgs", icon: <Users size={15} weight="regular" /> }
                  : settingsView === "api-keys"
                  ? { label: "API Keys", icon: <GearSix size={15} weight="regular" /> }
                  : settingsView === "notifications"
                  ? { label: "Notifications", icon: <GearSix size={15} weight="regular" /> }
                  : settingsView === "integrations"
                  ? { label: "Integrations", icon: <Plug size={15} weight="regular" /> }
                  : settingsView === "audit-logs"
                    ? { label: "Audit Logs", icon: <ClipboardText size={15} weight="regular" /> }
                    : settingsView === "data-export"
                      ? { label: "Data Export", icon: <GearSix size={15} weight="regular" /> }
                      : settingsView === "danger"
                        ? { label: "Danger Zone", icon: <Trash size={15} weight="regular" /> }
                        : { label: "General", icon: <GearSix size={15} weight="regular" /> };

  const tenantCrumb = devCurrentTenant && devCurrentTenant !== "local"
    ? [{ label: devTenants.find(t => t.id === devCurrentTenant)?.displayName || devCurrentTenant, icon: <Users size={15} weight="regular" /> }]
    : [];
  const breadcrumbs = [
    ...tenantCrumb,
    ...(activeOrgId && orgs.length > 0 ? [{
      label: orgs.find(o => o.id === activeOrgId)?.name || "Org",
      icon: <Users size={15} weight="regular" />
    }] : []),
    { label: currentProjectName, icon: <FolderSimple size={15} weight="regular" /> },
    ...(environments.length > 1 ? [{
      label: activeEnvironment?.name || "Production",
      icon: <TreeStructure size={15} weight="regular" />
    }] : []),
    moduleCrumb,
    sectionCrumb,
    ...(primaryNav === "database" && databaseView === "sql-editor" && activeTab?.title
      ? [{ label: activeTab.title, icon: <Code size={15} weight="regular" /> }]
      : []),
    ...(primaryNav === "storage" && storageView === "buckets" && selectedStorageBucket
      ? [{ label: selectedStorageBucket, icon: <PaintBucket size={15} weight="regular" /> }]
      : []),
  ];
  const composedDatabaseUrl = useMemo(() => {
    if (!fieldHost || !fieldDatabase || !fieldUser) {
      return "";
    }
    const safeUser = encodeURIComponent(fieldUser);
    const safePassword = encodeURIComponent(fieldPassword);
    const auth = fieldPassword ? `${safeUser}:${safePassword}` : safeUser;
    const sslSuffix = fieldSslMode ? `?sslmode=${encodeURIComponent(fieldSslMode)}` : "";
    return `postgres://${auth}@${fieldHost}:${fieldPort || "5432"}/${fieldDatabase}${sslSuffix}`;
  }, [fieldDatabase, fieldHost, fieldPassword, fieldPort, fieldSslMode, fieldUser]);

  const filteredResultRows = useMemo(() => {
    if (!activeTab?.result) {
      return [];
    }
    const rows = activeTab.result.rows;
    const term = resultFilter.trim().toLowerCase();
    if (!term) {
      return rows;
    }
    return rows.filter((row) =>
      activeTab.result?.columns.some((column) =>
        String(row[column] ?? "").toLowerCase().includes(term)
      )
    );
  }, [activeTab, resultFilter]);

  const flattenedTables = useMemo(() => {
    if (!metadata?.schemas) {
      return [] as Array<{ schema: string; table: string }>;
    }
    return metadata.schemas.flatMap((schema) =>
      schema.tables.map((table) => ({ schema: schema.name, table }))
    );
  }, [metadata]);

  // Re-register SQL autocomplete when table metadata changes
  useEffect(() => {
    if (flattenedTables.length > 0) {
      loader.init().then(monaco => registerSqlCompletion(monaco, flattenedTables));
    }
  }, [flattenedTables]);

  const activeTableBrowserTab = useMemo(
    () => tableBrowserTabs.find((tab) => tab.id === activeTableBrowserTabId) ?? null,
    [tableBrowserTabs, activeTableBrowserTabId]
  );

  const filteredStorageObjects = useMemo(() => {
    const term = storageSearch.trim().toLowerCase();
    if (!term) {
      return storageObjects;
    }
    return storageObjects.filter((item) => item.key.toLowerCase().includes(term));
  }, [storageObjects, storageSearch]);

  const erdGraph = useMemo(() => {
    if (!erdPayload) {
      return { nodes: [], edges: [] };
    }
    return buildErdGraph(erdPayload);
  }, [erdPayload]);

  const updateActiveTab = useCallback(
    (updater: (tab: QueryTab) => QueryTab) => {
      setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? updater(tab) : tab)));
    },
    [activeTabId]
  );

  const fetchMetadata = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/metadata`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        // Silently skip when no DB is configured — not an error state
        if (response.status === 400 && String(body.error).includes("DATABASE_URL")) return;
        throw new Error(body.error || "Failed to load metadata.");
      }
      const nextMetadata = body as SqlMetadata;
      setMetadata(nextMetadata);
      setSelectedSchema((current) => current || nextMetadata.schemas[0]?.name || "");
      setGlobalError("");
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed to load metadata.");
    }
  }, [apiBaseUrl]);

  const fetchCurrentConnection = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/connections/current`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load current connection.");
      }
      setCurrentConnection(body as CurrentConnection);
    } catch {
      setCurrentConnection(null);
    }
  }, [apiBaseUrl]);

  const fetchIntegrationsStatus = useCallback(async () => {
    setIsIntegrationsLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/integrations/status`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load integrations status.");
      }
      setIntegrationsStatus(body as IntegrationsStatus);
    } catch {
      setIntegrationsStatus(null);
    } finally {
      setIsIntegrationsLoading(false);
    }
  }, [apiBaseUrl]);

  const loadDatabaseCatalog = useCallback(async () => {
    setIsDatabaseCatalogLoading(true);
    setDatabaseCatalogError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/catalog`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load catalog.");
      }
      setDatabaseCatalog(body as DatabaseCatalog);
    } catch (error) {
      setDatabaseCatalog(null);
      setDatabaseCatalogError(error instanceof Error ? error.message : "Failed to load catalog.");
    } finally {
      setIsDatabaseCatalogLoading(false);
    }
  }, [apiBaseUrl]);

  const loadSqlDiagnostics = useCallback(async () => {
    setIsSqlDiagnosticsLoading(true);
    setSqlDiagnosticsError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/diagnostics`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load diagnostics.");
      }
      setSqlDiagnostics(body as SqlDiagnostics);
    } catch (error) {
      setSqlDiagnostics(null);
      setSqlDiagnosticsError(error instanceof Error ? error.message : "Failed to load diagnostics.");
    } finally {
      setIsSqlDiagnosticsLoading(false);
    }
  }, [apiBaseUrl]);

  const loadConnInspector = useCallback(async () => {
    setIsConnInspectorLoading(true);
    setConnInspectorError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/connection-inspector`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load connection inspector.");
      setConnInspector(body);
    } catch (error) {
      setConnInspector(null);
      setConnInspectorError(error instanceof Error ? error.message : "Failed to load connection inspector.");
    } finally {
      setIsConnInspectorLoading(false);
    }
  }, [apiBaseUrl]);

  const loadAutovacuum = useCallback(async () => {
    setIsAutovacuumLoading(true);
    setAutovacuumError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/autovacuum`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load autovacuum stats.");
      setAutovacuumData(body);
    } catch (error) {
      setAutovacuumData(null);
      setAutovacuumError(error instanceof Error ? error.message : "Failed to load autovacuum stats.");
    } finally {
      setIsAutovacuumLoading(false);
    }
  }, [apiBaseUrl]);

  const loadSlowQueries = useCallback(async () => {
    setIsSlowQueriesLoading(true);
    setSlowQueriesError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/slow-queries`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load slow queries.");
      setSlowQueries(body);
    } catch (error) {
      setSlowQueriesError(error instanceof Error ? error.message : "Failed to load slow queries.");
    } finally {
      setIsSlowQueriesLoading(false);
    }
  }, [apiBaseUrl]);

  const loadTopQueries = useCallback(async (sort?: string) => {
    setIsTopQueriesLoading(true);
    setTopQueriesError("");
    try {
      const s = sort || topQueriesSort;
      const response = await apiFetch(`${apiBaseUrl}/api/performance/top-queries?sort=${s}&limit=25`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load top queries.");
      setTopQueries(body);
    } catch (error) {
      setTopQueriesError(error instanceof Error ? error.message : "Failed to load top queries.");
    } finally {
      setIsTopQueriesLoading(false);
    }
  }, [apiBaseUrl, topQueriesSort]);

  const resetTopQueriesStats = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/performance/reset-stats`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to reset stats.");
      setTopQueries(null);
      loadTopQueries();
    } catch (error) {
      setTopQueriesError(error instanceof Error ? error.message : "Failed to reset stats.");
    }
  }, [apiBaseUrl, loadTopQueries]);

  const loadSecurityAdvisor = useCallback(async () => {
    setIsSecurityAdvisorLoading(true);
    setSecurityAdvisorError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/advisors/security`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load security advisor.");
      }
      setSecurityAdvisor(body as SecurityAdvisor);
    } catch (error) {
      setSecurityAdvisor(null);
      setSecurityAdvisorError(
        error instanceof Error ? error.message : "Failed to load security advisor."
      );
    } finally {
      setIsSecurityAdvisorLoading(false);
    }
  }, [apiBaseUrl]);

  const loadPerformanceAdvisor = useCallback(async () => {
    setIsPerformanceAdvisorLoading(true);
    setPerformanceAdvisorError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/advisors/performance`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load performance advisor.");
      }
      setPerformanceAdvisor(body as PerformanceAdvisor);
    } catch (error) {
      setPerformanceAdvisor(null);
      setPerformanceAdvisorError(
        error instanceof Error ? error.message : "Failed to load performance advisor."
      );
    } finally {
      setIsPerformanceAdvisorLoading(false);
    }
  }, [apiBaseUrl]);

  const loadLatencyPercentiles = useCallback(async () => {
    setIsLatencyLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/performance/latency`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load latency.");
      setLatencyPercentiles(body);
    } catch {
      setLatencyPercentiles(null);
    } finally {
      setIsLatencyLoading(false);
    }
  }, [apiBaseUrl]);

  const loadIndexAdvisor = useCallback(async () => {
    setIsIndexAdvisorLoading(true);
    setIndexAdvisorError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/performance/index-advisor`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load index advisor.");
      setIndexAdvisor(body);
    } catch (error) {
      setIndexAdvisor(null);
      setIndexAdvisorError(error instanceof Error ? error.message : "Failed to load index advisor.");
    } finally {
      setIsIndexAdvisorLoading(false);
    }
  }, [apiBaseUrl]);

  const loadBloatData = useCallback(async () => {
    setIsBloatLoading(true);
    setBloatError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/performance/bloat`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load bloat data.");
      setBloatData(body);
    } catch (error) {
      setBloatData(null);
      setBloatError(error instanceof Error ? error.message : "Failed to load bloat data.");
    } finally {
      setIsBloatLoading(false);
    }
  }, [apiBaseUrl]);

  const loadPartitioningData = useCallback(async () => {
    setIsPartitioningLoading(true);
    setPartitioningError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/partitioning/advisor`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load partitioning data.");
      setPartitioningData(body);
    } catch (error) {
      setPartitioningData(null);
      setPartitioningError(error instanceof Error ? error.message : "Failed to load partitioning data.");
    } finally {
      setIsPartitioningLoading(false);
    }
  }, [apiBaseUrl]);

  // Redirect orphaned "sql" nav to "database"
  useEffect(() => {
    if (primaryNav === "sql") setPrimaryNav("database");
  }, [primaryNav]);

  // ─── URL Routing (History API) ──────────────────────────────────────────────
  // Project-scoped hierarchy: /p/:slug/database, /p/:slug/auth, etc.
  // Global routes (no project prefix): /billing/*, /settings/*
  const _skipUrlPush = useRef(false);
  const _initialUrlApplied = useRef(false);
  const _navFromUrl = useRef(false); // true when initial URL set a non-home nav
  const _pendingProjectId = useRef<string | null>(null);
  const _pendingProjectSlug = useRef<string | null>(null);

  // Detect proxy base path (e.g. "/proxy/5173", "/absproxy/5173") and/or /demo prefix from initial URL
  const _basePath = useRef<string>("");
  if (!_basePath.current) {
    let base = "";
    const proxyMatch = window.location.pathname.match(/^(\/(?:abs)?proxy\/\d+)/);
    if (proxyMatch) base = proxyMatch[1];
    // Append /demo to base path if present (keeps demo prefix in all generated URLs)
    const afterProxy = window.location.pathname.slice(base.length);
    if (afterProxy.match(/^\/demo(\/|$)/)) base += "/demo";
    if (base) _basePath.current = base;
  }

  // Nav key → URL slug mapping
  const NAV_TO_URL_SLUG: Record<string, string> = {
    home: "home", database: "database", sql: "database", authn: "auth", authz: "authz",
    storage: "storage", edge: "edge", realtime: "realtime", search: "search",
    webhooks: "webhooks", oauth2: "oauth2", gateway: "gateway", flags: "flags",
    settings: "settings",
  };

  // URL slug → nav key mapping (reverse)
  const URL_SLUG_TO_NAV: Record<string, PrimaryNav> = {
    home: "home", database: "database", auth: "authn", authz: "authz",
    storage: "storage", edge: "edge", realtime: "realtime", search: "search",
    webhooks: "webhooks", oauth2: "oauth2", gateway: "gateway", flags: "flags",
    settings: "settings",
  };

  // Set of known flat nav slugs for backward compat detection
  const KNOWN_NAV_SLUGS = new Set(Object.keys(URL_SLUG_TO_NAV).filter(Boolean));

  // Build URL path from current navigation state
  const buildUrlPath = useCallback((): string => {
    const nav = primaryNav;
    const slug = activeProject?.slug;

    // Sub-view slug (only if not the default for that nav)
    const getSubView = (): string => {
      if (nav === "home") {
        if (homeView !== "projects") return `/${homeView}`;
        if (projectDetail) return `/${projectDetail.id}`;
        return "";
      } else if (nav === "database" || nav === "sql") {
        let sub = databaseView !== "overview" ? `/${databaseView}` : "";
        if (databaseView === "performance" && perfTab !== "slow-queries") sub += `~${perfTab}`;
        if (databaseView === "tables" && tableInspectorTab !== "columns") sub += `~${tableInspectorTab}`;
        return sub;
      } else if (nav === "authn") {
        let sub = authView !== "overview" ? `/${authView}` : "";
        if (authView === "sessions" && sessionsSubTab !== "active") sub += `~${sessionsSubTab}`;
        return sub;
      } else if (nav === "authz") {
        return authzView !== "overview" ? `/${authzView}` : "";
      } else if (nav === "storage") {
        let sub = storageView !== "overview" ? `/${storageView}` : "";
        if (storageView === "buckets" && selectedStorageBucket) sub += `~${encodeURIComponent(selectedStorageBucket)}`;
        return sub;
      } else if (nav === "edge") {
        return edgeView !== "developer" ? `/${edgeView}` : "";
      } else if (nav === "search") {
        return searchView !== "overview" ? `/${searchView}` : "";
      } else if (nav === "webhooks") {
        return webhooksView !== "list" ? `/${webhooksView}` : "";
      } else if (nav === "oauth2") {
        return oauth2View !== "overview" ? `/${oauth2View}` : "";
      } else if (nav === "gateway") {
        return gatewayView !== "overview" ? `/${gatewayView}` : "";
      } else if (nav === "flags") {
        return flagsView !== "list" ? `/${flagsView}` : "";
      } else if (nav === "settings") {
        return settingsView !== "account" ? `/${settingsView}` : "";
      }
      return "";
    };

    const sub = getSubView();

    const base = _basePath.current;
    // Prepend tenant prefix when a dev tenant is active (not "local")
    const tp = devCurrentTenant && devCurrentTenant !== "local" ? `/@${devCurrentTenant}` : "";

    // Org context: use org slug if active, "~" for personal workspace
    const orgCtx = activeOrgId
      ? (orgs.find(o => o.id === activeOrgId)?.slug || activeOrgId)
      : "~";

    // All routes: /{orgSlug}/{projectSlug}/{nav}/{subView}
    // Also support legacy /p/{slug} for backward compat (handled in applyUrlPath)
    // When no project is loaded, use "_" as placeholder so nav state is still in URL
    const projectCtx = slug || "_";
    const navSlug = NAV_TO_URL_SLUG[nav] ?? "";
    const prefix = `${base}${tp}/${orgCtx}/${projectCtx}`;
    if (nav === "settings") return `${prefix}/settings${sub}`;
    if (!navSlug) return prefix;
    return `${prefix}/${navSlug}${sub}`;
  }, [
    primaryNav, homeView, projectDetail, databaseView, authView, authzView,
    storageView, edgeView, searchView, webhooksView, oauth2View, gatewayView, flagsView,
    settingsView, activeProject, devCurrentTenant, activeOrgId, orgs,
    perfTab, tableInspectorTab, sessionsSubTab, selectedStorageBucket,
  ]);

  // Apply sub-view state from a segment string for a given nav
  const applySubView = useCallback((nav: PrimaryNav, sub: string) => {
    // Split on ~ to get main view + optional sub-tab
    const [mainView, subTab] = sub.split("~");

    if (nav === "home") {
      setHomeView((mainView || "projects") as HomeView);
      setProjectDetail(null);
    } else if (nav === "database") {
      setDatabaseView((mainView || "overview") as DatabaseView);
      if (subTab) {
        if (!mainView || mainView === "overview") setConnectSection(subTab as any);
        if (mainView === "performance") setPerfTab(subTab as any);
        if (mainView === "tables") setTableInspectorTab(subTab as any);
      }
    } else if (nav === "authn") {
      setAuthView((mainView || "overview") as AuthView);
      if (subTab && mainView === "sessions") setSessionsSubTab(subTab as any);
    } else if (nav === "authz") {
      setAuthzView((mainView || "overview") as AuthzView);
    } else if (nav === "storage") {
      setStorageView((mainView || "overview") as StorageView);
      if (subTab && mainView === "buckets") setSelectedStorageBucket(decodeURIComponent(subTab));
    } else if (nav === "edge") {
      setEdgeView((mainView || "developer") as EdgeView);
    } else if (nav === "search") {
      setSearchView((mainView || "overview") as SearchView);
    } else if (nav === "webhooks") {
      setWebhooksView((mainView || "list") as WebhooksView);
    } else if (nav === "oauth2") {
      setOAuth2View((mainView || "overview") as OAuth2View);
    } else if (nav === "gateway") {
      setGatewayView((mainView || "overview") as GatewayView);
    } else if (nav === "flags") {
      setFlagsView((mainView || "list") as FlagsView);
    } else if (nav === "settings") {
      setSettingsView((mainView || "account") as SettingsView);
    }
  }, []);

  // Parse URL path and set navigation state (no external callback deps — uses ref for deferred project load)
  const applyUrlPath = useCallback((path: string) => {
    _skipUrlPush.current = true;
    // Strip proxy base path prefix before parsing
    let cleanPath = path;
    if (_basePath.current && cleanPath.startsWith(_basePath.current)) {
      cleanPath = cleanPath.slice(_basePath.current.length) || "/";
    }
    // Detect and strip /@tenantId prefix from URL
    const tenantMatch = cleanPath.match(/^\/@([^/]+)(\/.*)?$/);
    if (tenantMatch) {
      const urlTenantId = tenantMatch[1];
      cleanPath = tenantMatch[2] || "/";
      // If a different tenant is in the URL, switch to it
      if (urlTenantId !== devCurrentTenant && devTenants.some(t => t.id === urlTenantId)) {
        handleDevTenantSwitch(urlTenantId);
        return;
      }
    }
    const segments = cleanPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    // Ignore auth gate paths — they're managed by the auth gate, not the router
    if (segments.length === 1 && (segments[0] === "login" || segments[0] === "register" || segments[0] === "recovery")) {
      _skipUrlPush.current = false;
      return;
    }

    // ── /{orgSlug}/{projectSlug}/... — org-scoped project routes ──
    // Also support legacy /p/{slug}/... for backward compat
    let projectSlug: string | null = null;
    let navSlug = "";
    let sub = "";
    let urlOrgSlug: string | null = null;

    if (segments[0] === "p" && segments[1]) {
      // Legacy: /p/{slug}/{nav}/{sub}
      projectSlug = segments[1];
      navSlug = segments[2] || "";
      sub = segments[3] || "";
    } else if (segments[0] && !KNOWN_NAV_SLUGS.has(segments[0]) && segments[0] !== "billing" && segments[0] !== "settings" && segments[0] !== "project" && segments[1]) {
      // New: /{orgSlug}/{projectSlug}/{nav}/{sub}
      urlOrgSlug = segments[0];
      projectSlug = segments[1] === "_" ? null : segments[1]; // "_" = no project placeholder
      navSlug = segments[2] || "";
      sub = segments[3] || "";

      // Resolve org from slug
      if (urlOrgSlug === "~") {
        // Personal workspace
        if (activeOrgId !== null) setActiveOrgId(null);
      } else {
        const matchedOrg = orgs.find(o => o.slug === urlOrgSlug || o.id === urlOrgSlug);
        if (matchedOrg && matchedOrg.id !== activeOrgId) {
          setActiveOrgId(matchedOrg.id);
        } else if (!matchedOrg && orgs.length > 0) {
          // URL has an org slug the user doesn't belong to (e.g. leftover from demo/another session)
          // Redirect to their default org
          setActiveOrgId(orgs[0].id);
        }
      }
    }

    if (projectSlug || urlOrgSlug) {
      // Special case: /project/:id — defer project detail load
      if (navSlug === "project" && sub && projectSlug) {
        _pendingProjectSlug.current = projectSlug;
        _pendingProjectId.current = sub;
        setPrimaryNav("home");
        setHomeView("projects");
        _skipUrlPush.current = false;
        return;
      }

      // Billing is a cloud-only feature (truss-cloud); redirect legacy /billing → settings.
      if (navSlug === "billing") {
        if (projectSlug) _pendingProjectSlug.current = projectSlug;
        setPrimaryNav("settings");
        setSettingsView("account");
        _skipUrlPush.current = false;
        return;
      }

      const nav = URL_SLUG_TO_NAV[navSlug] ?? "home";
      if (projectSlug) _pendingProjectSlug.current = projectSlug;
      setPrimaryNav(nav);
      applySubView(nav, sub);
      _skipUrlPush.current = false;
      return;
    }

    // ── Global routes: legacy /billing → redirect to settings (cloud-only feature) ──
    if (segments[0] === "billing") {
      setPrimaryNav("settings");
      setSettingsView("account");
      _skipUrlPush.current = false;
      return;
    }
    if (segments[0] === "settings") {
      setPrimaryNav("settings");
      applySubView("settings", segments[1] || "");
      _skipUrlPush.current = false;
      return;
    }

    // ── Legacy /project/:id route ──
    if (segments[0] === "project" && segments[1]) {
      setPrimaryNav("home");
      setHomeView("projects");
      setActiveProjectId(segments[1]);
      _pendingProjectId.current = segments[1];
      _skipUrlPush.current = false;
      return;
    }

    // ── Backward compat: legacy flat URLs like /database/tables ──
    if (segments[0] && KNOWN_NAV_SLUGS.has(segments[0])) {
      const nav = URL_SLUG_TO_NAV[segments[0]] ?? "home";
      setPrimaryNav(nav);
      applySubView(nav, segments[1] || "");
      _skipUrlPush.current = false;
      return;
    }

    // ── Root or unknown — go home ──
    setPrimaryNav("home");
    setHomeView("projects");
    setProjectDetail(null);
    _skipUrlPush.current = false;
  }, [applySubView, orgs, activeOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync URL when navigation state changes (pushState)
  useEffect(() => {
    // Don't sync URL until the initial URL has been parsed — prevents the URL sync
    // from overwriting the initial path (e.g. /billing → /) before applyUrlPath runs
    if (!_initialUrlApplied.current) return;
    if (_skipUrlPush.current) return;
    // Don't sync URL when not authenticated — avoids pushing ugly /~/_
    if (!session) return;
    const target = buildUrlPath();
    if (target !== window.location.pathname) {
      window.history.pushState(null, "", target);
    }
  }, [buildUrlPath, session]);

  // On mount: parse initial URL + listen for browser back/forward
  useEffect(() => {
    const path = window.location.pathname;
    const base = _basePath.current;
    // Determine if the initial URL has a meaningful path beyond the base
    const cleanForCheck = base && path.startsWith(base) ? path.slice(base.length) : path;
    const hasPath = cleanForCheck && cleanForCheck !== "/" && cleanForCheck !== "";
    if (hasPath) {
      applyUrlPath(path);
      // Track that the URL directed us to a specific nav (not root)
      _navFromUrl.current = true;
    }
    _initialUrlApplied.current = true;
    const onPopState = () => applyUrlPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Root redirect: when at "/" and projects are loaded, redirect to first project.
  // Skip if the initial URL directed us to a specific nav (e.g. /billing, /~/my-project/database).
  useEffect(() => {
    if (_navFromUrl.current) return;
    const base = _basePath.current;
    const tp = devCurrentTenant && devCurrentTenant !== "local" ? `/@${devCurrentTenant}` : "";
    const atRoot = window.location.pathname === `${base}/` || window.location.pathname === `${base}${tp}/` || window.location.pathname === base || window.location.pathname === "/";
    if (projectsLoaded && atRoot) {
      const orgCtx = activeOrgId
        ? (orgs.find(o => o.id === activeOrgId)?.slug || activeOrgId)
        : "~";
      const firstSlug = projects.length > 0 ? projects[0]?.slug : "_";
      if (firstSlug) {
        window.history.replaceState(null, "", `${base}${tp}/${orgCtx}/${firstSlug}/home`);
      }
    }
  }, [projectsLoaded, projects, activeOrgId, orgs, devCurrentTenant]);

  const loadEnvironment = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/general`);
      if (!res.ok) return;
      const body = await res.json();
      if (body.environment && ["development", "staging", "production"].includes(body.environment)) {
        setAppEnvironment(body.environment);
      }
    } catch { /* ignore */ }
  }, [apiBaseUrl]);

  const loadSavedQueriesFromServer = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/saved-queries`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load saved queries.");
      }
      setSavedQueries(Array.isArray(body.queries) ? (body.queries as SavedQuery[]) : []);
    } catch {
      // fall back silently to existing in-memory state
    }
  }, [apiBaseUrl]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/projects`);
      const body = await parseApiResponse(res);
      if (res.ok && body.projects) {
        setProjects(body.projects as Record<string, any>[]);
        if (!activeProjectId && (body.projects as any[]).length > 0) {
          setActiveProjectId((body.projects as any[])[0].id);
        }
      }
    } catch {}
    setProjectsLoaded(true);
  }, [apiBaseUrl, activeProjectId]);

  const loadOrgs = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs`);
      const body = await parseApiResponse(res);
      if (res.ok && body.orgs) {
        const orgList = body.orgs as any[];
        setOrgs(orgList);
        // Auto-select first org if none selected or current org not in user's list
        // (prevents demo org ID lingering after switching from demo to real account)
        if (orgList.length > 0) {
          const currentValid = activeOrgId && orgList.some((o: any) => o.id === activeOrgId);
          if (!currentValid) {
            setActiveOrgId(orgList[0].id);
          }
        }
      }
    } catch {}
  }, [apiBaseUrl, activeOrgId]);

  // Load environments when active project changes
  useEffect(() => {
    if (!activeProjectId) { setEnvironments([]); return; }
    apiFetch(`${apiBaseUrl}/api/projects/${activeProjectId}/environments`)
      .then(r => r.ok ? r.json() : { environments: [] })
      .then(data => {
        const envs = data.environments || [];
        setEnvironments(envs);
        const defaultEnv = envs.find((e: any) => e.is_default);
        if (defaultEnv && activeEnvironmentId !== defaultEnv.id) {
          setActiveEnvironmentId(defaultEnv.id);
          setActiveEnvironmentIdGlobal(defaultEnv.id);
        }
      })
      .catch(() => setEnvironments([]));
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const renameProject = useCallback(async (id: string, name: string) => {
    setRenamingLoading(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
        setRenamingProjectId(null);
      }
    } catch (err) { console.error("Failed to rename project:", err); setAccountError("Failed to rename project."); }
    setRenamingLoading(false);
  }, [apiBaseUrl]);

  const deleteProject = useCallback(async (id: string) => {
    setDeletingLoading(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        setProjects(prev => prev.filter(p => p.id !== id));
        if (activeProjectId === id) {
          setActiveProjectId(projects.find(p => p.id !== id)?.id ?? null);
        }
        setDeletingProjectId(null);
      }
    } catch (err) { console.error("Failed to delete project:", err); setAccountError("Failed to delete project."); }
    setDeletingLoading(false);
  }, [apiBaseUrl, activeProjectId, projects]);

  const loadProjectDetail = useCallback(async (id: string) => {
    setIsProjectDetailLoading(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/projects/${id}`);
      const body = await parseApiResponse(res);
      if (res.ok && body.project) {
        setProjectDetail(body.project as Record<string, any>);
      }
    } catch {}
    setIsProjectDetailLoading(false);
  }, [apiBaseUrl]);

  // Resolve pending project deep-link from URL routing (deferred until loadProjectDetail is available)
  useEffect(() => {
    if (_pendingProjectId.current) {
      const id = _pendingProjectId.current;
      _pendingProjectId.current = null;
      loadProjectDetail(id);
    }
  }, [loadProjectDetail]);

  // Resolve pending project slug from URL routing (/p/:slug/...)
  useEffect(() => {
    if (!_pendingProjectSlug.current) return;
    const slug = _pendingProjectSlug.current;
    _pendingProjectSlug.current = null;

    // Try to find project in already-loaded projects array
    const found = projects.find(p => p.slug === slug);
    if (found) {
      setActiveProjectId(found.id);
      return;
    }

    // If projects are loaded but slug not found locally, fetch from API
    if (projectsLoaded) {
      (async () => {
        try {
          const res = await apiFetch(`${apiBaseUrl}/api/projects/by-slug/${encodeURIComponent(slug)}`);
          const body = await parseApiResponse(res);
          if (res.ok && body.project) {
            const proj = body.project as Record<string, any>;
            setProjects(prev => prev.some(p => p.id === proj.id) ? prev : [...prev, proj]);
            setActiveProjectId(proj.id);
          }
        } catch { /* slug not found — stay on current project */ }
      })();
    }
  }, [projects, projectsLoaded, apiBaseUrl]);

  // --- Sample App callbacks ---
  const loadSampleAppStatus = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/sample-app/status`);
      const body = await parseApiResponse(res);
      if (res.ok) setSampleAppStatus(body as any);
    } catch { /* ignore */ }
  }, [apiBaseUrl]);

  const loadSampleApp = useCallback(async () => {
    setSampleAppLoading(true);
    setSampleAppError(null);
    setSampleAppResult(null);
    setSampleAppTermDone(false);

    const loadLines = [
      "Warming up the engines...",
      "Conjuring tables out of thin air",
      "Populating 10 fictional humans",
      "Ghost-writing 30 blog posts",
      "Generating 80 suspiciously positive comments",
      "Teaching Postgres to read between the lines",
      "Locking down rows like a bouncer",
      "Tuning into realtime frequencies",
      "Setting up webhooks — we'll call you back",
      "Filling the storage bucket with goodies",
      "Minting auth identities for Alice, Bob & Carol",
      "Weaving permission tuples — zero trust, maximum fun",
      "Polishing the API keys",
    ];

    let lineIdx = 0;
    setSampleAppTermLine(loadLines[0]);
    lineIdx = 1;

    const iv = setInterval(() => {
      if (lineIdx < loadLines.length) {
        setSampleAppTermLine(loadLines[lineIdx]);
        lineIdx++;
      }
    }, 400);
    sampleAppTermIntervalRef.current = iv;

    try {
      const res = await apiFetch(`${apiBaseUrl}/api/sample-app/load`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      clearInterval(iv);
      sampleAppTermIntervalRef.current = null;
      if (!res.ok) {
        setSampleAppTermLine((body as any).error || "Something went sideways");
        setSampleAppError((body as any).error || "Failed to load sample app");
      } else {
        setSampleAppResult((body as any).stats || body);
        setSampleAppTermLine("All systems go — your playground is ready!");
        setSampleAppTermDone(true);
        await loadSampleAppStatus();
        fetchMetadata();
        setTimeout(() => { setSampleAppTermLine(""); setSampleAppTermDone(false); }, 6000);
      }
    } catch (e: any) {
      clearInterval(iv);
      sampleAppTermIntervalRef.current = null;
      setSampleAppTermLine(e.message || "Connection lost — try again");
      setSampleAppError(e.message || "Failed to load sample app");
    }
    setSampleAppLoading(false);
  }, [apiBaseUrl, loadSampleAppStatus, fetchMetadata]);

  const unloadSampleApp = useCallback(async () => {
    setSampleAppLoading(true);
    setSampleAppError(null);
    setSampleAppResult(null);
    setSampleAppTermDone(false);

    const unloadLines = [
      "Rolling up the red carpet...",
      "Dropping tables — cascading with style",
      "Emptying the storage bucket — Marie Kondo approves",
      "Retiring auth identities — they had a good run",
    ];

    let lineIdx = 0;
    setSampleAppTermLine(unloadLines[0]);
    lineIdx = 1;

    const iv = setInterval(() => {
      if (lineIdx < unloadLines.length) {
        setSampleAppTermLine(unloadLines[lineIdx]);
        lineIdx++;
      }
    }, 400);
    sampleAppTermIntervalRef.current = iv;

    try {
      const res = await apiFetch(`${apiBaseUrl}/api/sample-app/unload`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      clearInterval(iv);
      sampleAppTermIntervalRef.current = null;
      if (!res.ok) {
        setSampleAppTermLine((body as any).error || "Cleanup hit a snag");
        setSampleAppError((body as any).error || "Failed to unload sample app");
      } else {
        setSampleAppTermLine("Clean slate — ready for your next idea!");
        setSampleAppTermDone(true);
        setSampleAppStatus({ loaded: false });
        fetchMetadata();
        setTimeout(() => { setSampleAppTermLine(""); setSampleAppTermDone(false); }, 2000);
      }
    } catch (e: any) {
      clearInterval(iv);
      sampleAppTermIntervalRef.current = null;
      setSampleAppTermLine(e.message || "Cleanup failed — try again");
      setSampleAppError(e.message || "Failed to unload sample app");
    }
    setSampleAppLoading(false);
  }, [apiBaseUrl, fetchMetadata]);

  useEffect(() => {
    fetchMetadata();
    fetchCurrentConnection();
    fetchIntegrationsStatus();
    loadConsumption();
    loadConnectionProfilesFromApi(apiBaseUrl).then(setConnectionProfiles);
    loadSavedQueriesFromServer();
    loadEnvironment();
    loadProjects();
    loadKetoHealth();
    loadOrgs();
    loadSampleAppStatus();
    // Load Hydra health on startup
    apiFetch(`${apiBaseUrl}/api/hydra/health`).then(r => r.json()).then(setHydraHealth).catch(() => {});
    // Load Oathkeeper health on startup
    apiFetch(`${apiBaseUrl}/api/oathkeeper/health`).then(r => r.json()).then(setOathkeeperHealth).catch(() => {});
    // Load flagd health on startup
    apiFetch(`${apiBaseUrl}/api/flags/status`).then(r => r.json()).then(setFlagdHealth).catch(() => {});
    // Load Valkey cache health on startup
    apiFetch(`${apiBaseUrl}/api/cache/status`).then(r => r.json()).then(setCacheHealth).catch(() => {});
    // Load latency percentiles for Home widget
    loadLatencyPercentiles();
  }, [fetchMetadata, fetchCurrentConnection, fetchIntegrationsStatus, loadConsumption, loadSavedQueriesFromServer, loadEnvironment, loadProjects, loadKetoHealth, loadOrgs, loadLatencyPercentiles, loadSampleAppStatus, apiBaseUrl]);

  // Cleanup terminal interval on unmount
  useEffect(() => {
    return () => {
      if (sampleAppTermIntervalRef.current) clearInterval(sampleAppTermIntervalRef.current);
    };
  }, []);

  // Persist query history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("truss.queryHistory", JSON.stringify(history.slice(0, 100)));
    } catch { /* quota exceeded — ignore */ }
  }, [history]);

  const startProvisioning = useCallback(async () => {
    const projName = newProjectName || "Untitled Project";
    const startTime = Date.now();
    setProvisioningStep("provisioning");
    setProvisioningError("");
    setProvisionedProject(null);
    setProvisioningDone(false);
    setProvisioningElapsed("");
    setTerminalLines([]);
    setProvisioningStepProgress(0);

    // Cosmetic terminal lines fired on a timer while the real API call runs
    const cosmeticLines: Array<{ text: string; pct: number; color?: string }> = [
      { text: `[deploy] Creating project "${projName}"...`, pct: 5 },
      { text: `[deploy] Initializing database schema...`, pct: 15 },
      { text: `[deploy] Provisioning database schema`, pct: 25 },
      ...(newProjectCreateBucket ? [
        { text: `[deploy] Setting up storage bucket "${newProjectBucketName || "default"}"...`, pct: 40 },
      ] : []),
      ...(newProjectGenerateKeys ? [
        { text: `[deploy] Generating API keys...`, pct: 55 },
        { text: `[deploy]   anon key: truss_anon_****`, pct: 60, color: "text-slate-500" },
        { text: `[deploy]   service_role key: truss_svc_****`, pct: 65, color: "text-slate-500" },
      ] : []),
      { text: `[deploy] Configuring project settings...`, pct: 75 },
      { text: `[deploy] Running health checks...`, pct: 85 },
    ];

    let lineIdx = 0;
    const iv = setInterval(() => {
      if (lineIdx < cosmeticLines.length) {
        const line = cosmeticLines[lineIdx];
        setTerminalLines(prev => [...prev, { text: line.text, color: line.color }]);
        setProvisioningStepProgress(line.pct);
        lineIdx++;
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
    }, 250);

    try {
      const res = await apiFetch(`${apiBaseUrl}/api/projects/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projName, region: newProjectRegion }),
      });
      const body = await parseApiResponse(res);
      clearInterval(iv);

      if (!res.ok) {
        throw new Error(body.error || "Provisioning failed");
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Fire remaining cosmetic lines quickly then show success
      const remaining = cosmeticLines.slice(lineIdx);
      let delay = 0;
      for (const line of remaining) {
        delay += 80;
        setTimeout(() => {
          setTerminalLines(prev => [...prev, { text: line.text, color: line.color }]);
          setProvisioningStepProgress(line.pct);
        }, delay);
      }

      setTimeout(() => {
        setTerminalLines(prev => [
          ...prev,
          { text: `[deploy] Health checks passed`, color: "text-emerald-400" },
          { text: `` },
          { text: `[deploy] Project "${projName}" is live!`, color: "text-emerald-400" },
          { text: `[deploy] Total time: ${elapsed}s`, color: "text-slate-500" },
        ]);
        setProvisioningStepProgress(100);
        setProvisioningElapsed(elapsed);
        setProvisionedProject(body.project as Record<string, any>);
        setProjects(prev => [...prev, body.project as Record<string, any>]);
        setActiveProjectId((body.project as any).id);
        if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;

        // Brief pause before showing success state
        setTimeout(() => {
          setProvisioningDone(true);
        }, 800);
      }, delay + 150);

    } catch (err) {
      clearInterval(iv);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setTerminalLines(prev => [
        ...prev,
        { text: `` },
        { text: `[error] ${err instanceof Error ? err.message : "Provisioning failed"}`, color: "text-red-400" },
        { text: `[deploy] Failed after ${elapsed}s`, color: "text-red-400" },
      ]);
      setProvisioningError(err instanceof Error ? err.message : "Provisioning failed");
      if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [apiBaseUrl, newProjectName, newProjectRegion, newProjectCreateBucket, newProjectBucketName, newProjectGenerateKeys]);

  const runExplain = useCallback(async () => {
    if (!activeTab?.sql.trim()) {
      setExplainError("Write a read-only query in SQL Editor first.");
      return;
    }
    setIsExplainLoading(true);
    setExplainError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: activeTab.sql }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to run EXPLAIN.");
      }
      setExplainPlan((body.plan || null) as Record<string, unknown> | null);
    } catch (error) {
      setExplainPlan(null);
      setExplainError(error instanceof Error ? error.message : "Failed to run EXPLAIN.");
    } finally {
      setIsExplainLoading(false);
    }
  }, [activeTab?.sql, apiBaseUrl]);

  const loadMigrationStatus = useCallback(async () => {
    setIsMigrationStatusLoading(true);
    setMigrationError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/status`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load migration status.");
      }
      setMigrationStatus(body as MigrationStatus);
    } catch (error) {
      setMigrationStatus(null);
      setMigrationError(error instanceof Error ? error.message : "Failed to load migration status.");
    } finally {
      setIsMigrationStatusLoading(false);
    }
  }, [apiBaseUrl]);

  const runPendingMigrations = useCallback(async () => {
    setIsMigrationRunning(true);
    setMigrationError("");
    setMigrationInfo("");
    setMigrationAppliedNow([]);
    setMigrationRawOutput("");
    setShowMigrationLogs(false);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/up`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to run pending migrations.");
      }
      setMigrationInfo(String(body.summary || "Migrations applied."));
      setMigrationAppliedNow(Array.isArray(body.appliedNow) ? (body.appliedNow as string[]) : []);
      setMigrationRawOutput(typeof body.rawOutput === "string" ? body.rawOutput : "");
      await loadMigrationStatus();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Failed to run pending migrations.");
    } finally {
      setIsMigrationRunning(false);
    }
  }, [apiBaseUrl, loadMigrationStatus]);

  const createMigrationFile = useCallback(async () => {
    const name = newMigrationName.trim();
    if (!name) {
      setMigrationError("Migration name is required.");
      return;
    }
    setIsMigrationCreating(true);
    setMigrationError("");
    setMigrationInfo("");
    setMigrationAppliedNow([]);
    setMigrationRawOutput("");
    setShowMigrationLogs(false);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to create migration.");
      }
      setMigrationInfo(String(body.summary || (body.file ? `Created migration file: ${body.file}` : "Migration file created.")));
      setMigrationRawOutput(typeof body.rawOutput === "string" ? body.rawOutput : "");
      setNewMigrationName("");
      await loadMigrationStatus();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Failed to create migration.");
    } finally {
      setIsMigrationCreating(false);
    }
  }, [apiBaseUrl, loadMigrationStatus, newMigrationName]);

  const loadIdempotentStatus = useCallback(async () => {
    setIsIdempotentLoading(true);
    setIdempotentError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/idempotent/status`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load idempotent migration status.");
      setIdempotentStatus(body as IdempotentMigrationStatus);
    } catch (error) {
      setIdempotentStatus(null);
      setIdempotentError(error instanceof Error ? error.message : "Failed to load idempotent migration status.");
    } finally {
      setIsIdempotentLoading(false);
    }
  }, [apiBaseUrl]);

  const runIdempotentMigrations = useCallback(async (migrations?: string[]) => {
    setIdempotentRunning(true);
    setIdempotentError("");
    setIdempotentResult(null);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/idempotent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migrations: migrations || [] }),
      });
      const body = await parseApiResponse(response);
      setIdempotentResult(body as any);
      if (!response.ok) {
        setIdempotentError(body.summary || body.error || "Migration failed.");
      }
      await loadIdempotentStatus();
    } catch (error) {
      setIdempotentError(error instanceof Error ? error.message : "Failed to run migrations.");
    } finally {
      setIdempotentRunning(false);
    }
  }, [apiBaseUrl, loadIdempotentStatus]);

  const markMigrationApplied = useCallback(async (migration: string) => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/migrations/idempotent/mark-applied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ migration }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to mark migration as applied.");
      await loadIdempotentStatus();
    } catch (error) {
      setIdempotentError(error instanceof Error ? error.message : "Failed to mark migration.");
    }
  }, [apiBaseUrl, loadIdempotentStatus]);

  const detectMigrationSchema = useCallback(async (migrationName: string) => {
    try {
      // First get the file content
      const previewRes = await apiFetch(`${apiBaseUrl}/api/migrations/preview/${encodeURIComponent(migrationName)}`);
      const previewBody = await parseApiResponse(previewRes);
      if (!previewRes.ok) return;

      const response = await apiFetch(`${apiBaseUrl}/api/migrations/idempotent/detect-schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: previewBody.content }),
      });
      const body = await parseApiResponse(response);
      if (response.ok) {
        setSchemaDetection((prev) => ({ ...prev, [migrationName]: body as SchemaDetectionResult }));
      }
    } catch {}
  }, [apiBaseUrl]);

  const copyText = useCallback(async (text: string, onSuccess: (message: string) => void, onError: (message: string) => void, successMessage: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure HTTP contexts (e.g. code-server over HTTP)
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      onSuccess(successMessage);
    } catch {
      onError("Failed to copy to clipboard.");
    }
  }, []);

  const loadAuthUsers = useCallback(async (pageToken?: string, search?: string) => {
    setIsAuthUsersLoading(true);
    setAuthUsersError("");
    setHasLoadedAuthUsers(true);
    try {
      const params = new URLSearchParams({ page_size: "50" });
      if (pageToken) params.set("page_token", pageToken);
      if (search) params.set("search", search);
      const response = await apiFetch(`${apiBaseUrl}/api/auth/identities?${params.toString()}`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load users.");
      }
      const identities = Array.isArray(body.identities) ? body.identities : [];
      setAuthIdentities(identities as AuthIdentity[]);
      setAuthUsersNextToken(body.next_page_token || null);
      setAuthUsersPrevToken(body.prev_page_token || null);
    } catch (error) {
      setAuthUsersError(error instanceof Error ? error.message : "Failed to load users.");
      setAuthIdentities([]);
    } finally {
      setIsAuthUsersLoading(false);
    }
  }, [apiBaseUrl]);

  const createAuthUser = useCallback(async () => {
    const email = newAuthEmail.trim().toLowerCase();
    const password = newAuthPassword;
    if (!email || !password) {
      setAuthUsersError("Email and password are required.");
      return;
    }
    setIsCreatingAuthUser(true);
    setAuthUsersError("");
    setAuthUsersInfo("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/identities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to create user.");
      }
      if (body.warning) {
        setAuthUsersInfo(String(body.warning));
      } else if (body.mode === "admin_api") {
        setAuthUsersInfo("User created via Kratos Admin API.");
      } else {
        setAuthUsersInfo("User created.");
      }
      setNewAuthEmail("");
      setNewAuthPassword("");
      if (integrationsStatus?.auth.admin?.reachable) {
        await loadAuthUsers();
      } else if (body.identity && body.identity.id) {
        setAuthIdentities((prev) => [body.identity as AuthIdentity, ...prev]);
      }
    } catch (error) {
      setAuthUsersError(error instanceof Error ? error.message : "Failed to create user.");
    } finally {
      setIsCreatingAuthUser(false);
    }
  }, [apiBaseUrl, integrationsStatus?.auth.admin?.reachable, loadAuthUsers, newAuthEmail, newAuthPassword]);

  const setAuthUserState = useCallback(
    async (id: string, state: "active" | "inactive") => {
      setAuthUsersError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}/state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to update user state.");
        }
        await loadAuthUsers();
      } catch (error) {
        setAuthUsersError(error instanceof Error ? error.message : "Failed to update user state.");
      }
    },
    [apiBaseUrl, loadAuthUsers]
  );

  const deleteAuthUser = useCallback(
    async (id: string) => {
      setAuthUsersError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to delete user.");
        }
        await loadAuthUsers();
      } catch (error) {
        setAuthUsersError(error instanceof Error ? error.message : "Failed to delete user.");
      }
    },
    [apiBaseUrl, loadAuthUsers]
  );

  const banAuthUser = useCallback(
    async (id: string) => {
      setAuthUsersError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}/ban`, { method: "POST" });
        const body = await parseApiResponse(response);
        if (!response.ok) throw new Error(body.error || "Failed to ban user.");
        await loadAuthUsers();
      } catch (error) {
        setAuthUsersError(error instanceof Error ? error.message : "Failed to ban user.");
      }
    },
    [apiBaseUrl, loadAuthUsers]
  );

  const unbanAuthUser = useCallback(
    async (id: string) => {
      setAuthUsersError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(id)}/unban`, { method: "POST" });
        const body = await parseApiResponse(response);
        if (!response.ok) throw new Error(body.error || "Failed to unban user.");
        await loadAuthUsers();
      } catch (error) {
        setAuthUsersError(error instanceof Error ? error.message : "Failed to unban user.");
      }
    },
    [apiBaseUrl, loadAuthUsers]
  );

  const impersonateUser = useCallback(async (identityId: string) => {
    setAuthUsersError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/${encodeURIComponent(identityId)}/impersonate`, { method: "POST" });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to impersonate user");
      if (body.session_token) {
        // Open a new tab with the session token set
        const kratosPublicUrl = integrationsStatus?.auth.publicUrl || "";
        if (kratosPublicUrl) {
          setAuthUsersInfo(`Impersonation session created. Token: ${body.session_token.slice(0, 12)}...`);
        } else {
          setAuthUsersInfo(`Impersonation session token: ${body.session_token}`);
        }
      }
    } catch (error) {
      setAuthUsersError(error instanceof Error ? error.message : "Failed to impersonate user");
    }
  }, [apiBaseUrl, integrationsStatus]);

  const batchActionUsers = useCallback(async (action: "deactivate" | "activate" | "delete") => {
    if (selectedUserIds.size === 0) return;
    setIsBatchActionLoading(true);
    setAuthUsersError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/identities/batch-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedUserIds), action }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Batch action failed");
      setAuthUsersInfo(`Batch ${action}: ${body.success} succeeded${body.failed ? `, ${body.failed} failed` : ""}`);
      setSelectedUserIds(new Set());
      await loadAuthUsers();
    } catch (error) {
      setAuthUsersError(error instanceof Error ? error.message : "Batch action failed");
    } finally {
      setIsBatchActionLoading(false);
    }
  }, [apiBaseUrl, selectedUserIds, loadAuthUsers]);

  const createSampleAuthUser = useCallback(async () => {
    const stamp = Date.now().toString().slice(-6);
    const email = `sample.${stamp}@truss.local`;
    const password = "TrussDemo!234";
    setNewAuthEmail(email);
    setNewAuthPassword(password);
    setSampleUserCredentials(`${email} / ${password}`);
    setAuthUsersInfo(`Prepared sample credentials: ${email}`);
  }, []);

  const loadAuthProviders = useCallback(async () => {
    setAuthProvidersError("");
    setHasLoadedAuthProviders(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/providers`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load providers.");
      }
      setAuthProviders(Array.isArray(body.providers) ? (body.providers as AuthProvider[]) : []);
      setAuthKratosHealthy(typeof body.kratosHealthy === "boolean" ? body.kratosHealthy : null);
    } catch (error) {
      setAuthProviders([]);
      setAuthProvidersError(error instanceof Error ? error.message : "Failed to load providers.");
    }
  }, [apiBaseUrl]);

  const importAuthUsers = useCallback(async () => {
    setImportError("");
    setImportResult(null);
    if (!importCsvText.trim()) {
      setImportError("Paste CSV data (email,password) or JSON array first.");
      return;
    }
    setIsImportingUsers(true);
    try {
      // Parse CSV: header row + data rows, or JSON array
      let users: Array<{ email: string; password?: string }> = [];
      const trimmed = importCsvText.trim();
      if (trimmed.startsWith("[")) {
        users = JSON.parse(trimmed);
      } else {
        const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
        const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
        const emailIdx = header.indexOf("email");
        const passIdx = header.indexOf("password");
        if (emailIdx === -1) throw new Error("CSV must have an 'email' column.");
        for (const line of lines.slice(1)) {
          const cols = line.split(",").map((c) => c.trim());
          const email = cols[emailIdx] || "";
          const password = passIdx !== -1 ? cols[passIdx] || "" : "";
          if (email) users.push({ email, ...(password ? { password } : {}) });
        }
      }
      if (users.length === 0) throw new Error("No valid users found in input.");
      const response = await apiFetch(`${apiBaseUrl}/api/auth/users/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Import failed.");
      setImportResult(body);
      if (body.imported > 0) setHasLoadedAuthUsers(false); // trigger reload
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setIsImportingUsers(false);
    }
  }, [apiBaseUrl, importCsvText]);

  const loadAuthSessions = useCallback(async (pageToken?: string) => {
    setIsAuthSessionsLoading(true);
    setAuthSessionsError("");
    setHasLoadedAuthSessions(true);
    try {
      const params = new URLSearchParams({ page_size: "50" });
      if (pageToken) params.set("page_token", pageToken);
      const response = await apiFetch(`${apiBaseUrl}/api/auth/sessions?${params.toString()}`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load sessions.");
      }
      setAuthSessions(Array.isArray(body.sessions) ? (body.sessions as AuthSession[]) : []);
      setAuthSessionsNextToken(body.next_page_token || null);
      setAuthSessionsPrevToken(body.prev_page_token || null);
    } catch (error) {
      setAuthSessions([]);
      setAuthSessionsError(error instanceof Error ? error.message : "Failed to load sessions.");
    } finally {
      setIsAuthSessionsLoading(false);
    }
  }, [apiBaseUrl]);

  const revokeAuthSession = useCallback(
    async (sessionId: string) => {
      setAuthSessionsError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        });
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to revoke session.");
        }
        await loadAuthSessions();
      } catch (error) {
        setAuthSessionsError(error instanceof Error ? error.message : "Failed to revoke session.");
      }
    },
    [apiBaseUrl, loadAuthSessions]
  );

  const extendAuthSession = useCallback(
    async (sessionId: string) => {
      setAuthSessionsError("");
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/auth/sessions/${encodeURIComponent(sessionId)}/extend`, { method: "PATCH" });
        const body = await parseApiResponse(response);
        if (!response.ok) throw new Error(body.error || "Failed to extend session.");
        await loadAuthSessions();
      } catch (error) {
        setAuthSessionsError(error instanceof Error ? error.message : "Failed to extend session.");
      }
    },
    [apiBaseUrl, loadAuthSessions]
  );

  const loadLoginHistory = useCallback(async (offset = 0, filter: "all" | "success" | "failed" = "all") => {
    setIsLoginHistoryLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: String(offset) });
      if (filter === "success") params.set("success", "true");
      else if (filter === "failed") params.set("success", "false");
      const response = await apiFetch(`${apiBaseUrl}/api/auth/login-history?${params.toString()}`);
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to load login history");
      setLoginHistory(body.logins || []);
      setLoginHistoryTotal(body.total || 0);
      setLoginHistoryOffset(offset);
    } catch {
      setLoginHistory([]);
    } finally {
      setIsLoginHistoryLoading(false);
    }
  }, [apiBaseUrl]);

  const loadAuthStats = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/stats`);
      const body = await parseApiResponse(response);
      if (response.ok) setAuthStats(body);
    } catch { /* ignore */ }
  }, [apiBaseUrl]);

  const loadAuthSecurityConfig = useCallback(async () => {
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/auth/security-config`);
      const body = await parseApiResponse(response);
      if (response.ok) setAuthSecurityConfig(body);
    } catch { /* ignore */ }
    setHasLoadedSecurityConfig(true);
  }, [apiBaseUrl]);

  const loadStorageBuckets = useCallback(async () => {
    setIsStorageBucketsLoading(true);
    setStorageBucketsError("");
    setHasLoadedStorageBuckets(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/storage/buckets`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load buckets.");
      }
      const buckets = Array.isArray(body.buckets) ? (body.buckets as StorageBucket[]) : [];
      setStorageBuckets(buckets);
      setSelectedStorageBucket((current) => {
        if (current && buckets.some((bucket) => bucket.name === current)) {
          return current;
        }
        return buckets[0]?.name || "";
      });
    } catch (error) {
      setStorageBuckets([]);
      setStorageBucketsError(error instanceof Error ? error.message : "Failed to load buckets.");
    } finally {
      setIsStorageBucketsLoading(false);
    }
  }, [apiBaseUrl]);

  const createStorageBucket = useCallback(async () => {
    const name = newBucketName.trim().toLowerCase();
    if (!name) {
      setStorageBucketsError("Bucket name is required.");
      return;
    }
    setStorageBucketsError("");
    setStorageBucketsInfo("");
    setIsCreatingStorageBucket(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/storage/buckets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to create bucket.");
      }
      setStorageBucketsInfo(`Bucket created: ${name}`);
      setNewBucketName("");
      await loadStorageBuckets();
    } catch (error) {
      setStorageBucketsError(error instanceof Error ? error.message : "Failed to create bucket.");
    } finally {
      setIsCreatingStorageBucket(false);
    }
  }, [apiBaseUrl, loadStorageBuckets, newBucketName]);

  const deleteStorageBucket = useCallback(
    async (name: string) => {
      setStorageBucketsError("");
      setStorageBucketsInfo("");
      setDeletingBucketName(name);
      try {
        const response = await apiFetch(`${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(name)}?force=true`, {
          method: "DELETE",
        });
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to delete bucket.");
        }
        setStorageBucketsInfo(`Bucket removed: ${name}`);
        await loadStorageBuckets();
        if (selectedStorageBucket === name) {
          setStorageObjects([]);
        }
      } catch (error) {
        setStorageBucketsError(error instanceof Error ? error.message : "Failed to delete bucket.");
      } finally {
        setDeletingBucketName("");
      }
    },
    [apiBaseUrl, loadStorageBuckets, selectedStorageBucket]
  );

  const loadStorageObjects = useCallback(async () => {
    if (!selectedStorageBucket) {
      setStorageObjects([]);
      return;
    }
    setIsStorageObjectsLoading(true);
    setStorageObjectsError("");
    try {
      const query = new URLSearchParams();
      if (storageObjectPrefix.trim()) {
        query.set("prefix", storageObjectPrefix.trim());
      }
      query.set("max_keys", "500");
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects?${query.toString()}`
      );
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load objects.");
      }
      setStorageObjects(Array.isArray(body.objects) ? (body.objects as StorageObject[]) : []);
    } catch (error) {
      setStorageObjects([]);
      setStorageObjectsError(error instanceof Error ? error.message : "Failed to load objects.");
    } finally {
      setIsStorageObjectsLoading(false);
    }
  }, [apiBaseUrl, selectedStorageBucket, storageObjectPrefix]);

  const uploadStorageObject = useCallback(async () => {
    if (!selectedStorageBucket) {
      setStorageObjectsError("Select a bucket first.");
      return;
    }
    if (!uploadFile) {
      setStorageObjectsError("Choose a file to upload.");
      return;
    }

    const key = newObjectKey.trim() || uploadFile.name;
    setStorageObjectsError("");
    setStorageObjectsInfo("");
    setIsUploadingStorageObject(true);
    const MULTIPART_THRESHOLD = 10 * 1024 * 1024; // 10MB
    const PART_SIZE = 5 * 1024 * 1024; // 5MB per part
    try {
      if (uploadFile.size > MULTIPART_THRESHOLD) {
        // Multipart upload for large files
        const bucket = encodeURIComponent(selectedStorageBucket);
        const contentType = uploadFile.type || "application/octet-stream";
        // 1. Init
        const initRes = await apiFetch(`${apiBaseUrl}/api/storage/buckets/${bucket}/objects/multipart/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, contentType }),
        });
        const initBody = await parseApiResponse(initRes);
        if (!initRes.ok) throw new Error(initBody.error || "Multipart init failed.");
        const { uploadId } = initBody;
        // 2. Upload parts
        const totalParts = Math.ceil(uploadFile.size / PART_SIZE);
        const parts: { ETag: string; PartNumber: number }[] = [];
        for (let i = 0; i < totalParts; i++) {
          const start = i * PART_SIZE;
          const end = Math.min(start + PART_SIZE, uploadFile.size);
          const blob = uploadFile.slice(start, end);
          const presignRes = await apiFetch(`${apiBaseUrl}/api/storage/buckets/${bucket}/objects/multipart/presign-part`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, uploadId, partNumber: i + 1 }),
          });
          const presignBody = await parseApiResponse(presignRes);
          if (!presignRes.ok) throw new Error(presignBody.error || `Failed to presign part ${i + 1}.`);
          const partUpload = await fetch(String(presignBody.url), { method: "PUT", body: blob });
          if (!partUpload.ok) throw new Error(`Part ${i + 1} upload failed (${partUpload.status}).`);
          parts.push({ ETag: partUpload.headers.get("etag") || "", PartNumber: i + 1 });
          setStorageObjectsInfo(`Uploading: part ${i + 1}/${totalParts}`);
        }
        // 3. Complete
        const completeRes = await apiFetch(`${apiBaseUrl}/api/storage/buckets/${bucket}/objects/multipart/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, uploadId, parts }),
        });
        const completeBody = await parseApiResponse(completeRes);
        if (!completeRes.ok) throw new Error(completeBody.error || "Multipart complete failed.");
        setStorageObjectsInfo(`Uploaded: ${key} (${totalParts} parts)`);
      } else {
        // Simple presigned upload for small files
        const presignResponse = await apiFetch(
          `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/presign-upload`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key,
              contentType: uploadFile.type || "application/octet-stream",
              expiresIn: 900,
            }),
          }
        );
        const presignBody = await parseApiResponse(presignResponse);
        if (!presignResponse.ok) {
          throw new Error(presignBody.error || "Failed to generate upload URL.");
        }
        const headers = new Headers();
        headers.set("Content-Type", uploadFile.type || "application/octet-stream");
        const directUpload = await fetch(String(presignBody.url), {
          method: "PUT",
          headers,
          body: uploadFile,
        });
        if (!directUpload.ok) {
          throw new Error(
            `Direct upload failed (${directUpload.status}). Check bucket CORS and endpoint host for browser access.`
          );
        }
        setStorageObjectsInfo(`Uploaded: ${key}`);
      }
      setUploadFile(null);
      setNewObjectKey("");
      await loadStorageObjects();
    } catch (error) {
      setStorageObjectsError(error instanceof Error ? error.message : "Failed to upload object.");
    } finally {
      setIsUploadingStorageObject(false);
    }
  }, [apiBaseUrl, loadStorageObjects, newObjectKey, selectedStorageBucket, uploadFile]);

  const deleteStorageObject = useCallback(
    async (key: string) => {
      if (!selectedStorageBucket) {
        return;
      }
      setStorageObjectsError("");
      setStorageObjectsInfo("");
      setDeletingObjectKey(key);
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
          }
        );
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to delete object.");
        }
        setStorageObjectsInfo(`Deleted: ${key}`);
        await loadStorageObjects();
      } catch (error) {
        setStorageObjectsError(error instanceof Error ? error.message : "Failed to delete object.");
      } finally {
        setDeletingObjectKey("");
      }
    },
    [apiBaseUrl, loadStorageObjects, selectedStorageBucket]
  );

  const openDownloadForObject = useCallback(
    async (key: string) => {
      if (!selectedStorageBucket) {
        return;
      }
      setStorageObjectsError("");
      setLatestDownloadUrl("");
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/presign-download`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, expiresIn: 900 }),
          }
        );
        const body = await parseApiResponse(response);
        if (!response.ok) {
          throw new Error(body.error || "Failed to generate download URL.");
        }
        const url = String(body.url);
        setLatestDownloadUrl(url);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        setStorageObjectsError(error instanceof Error ? error.message : "Failed to open download URL.");
      }
    },
    [apiBaseUrl, selectedStorageBucket]
  );

  const createStorageFolder = useCallback(async () => {
    if (!selectedStorageBucket || !newFolderName.trim()) return;
    setIsCreatingFolder(true);
    setStorageObjectsError("");
    setStorageObjectsInfo("");
    try {
      const prefix = (storageObjectPrefix ? `${storageObjectPrefix.replace(/\/$/, "")}/` : "") + newFolderName.trim().replace(/\/+$/, "");
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/mkdir`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prefix }),
        }
      );
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to create folder.");
      setStorageObjectsInfo(`Folder created: ${prefix}/`);
      setNewFolderName("");
      setShowNewFolderInput(false);
      await loadStorageObjects();
    } catch (error) {
      setStorageObjectsError(error instanceof Error ? error.message : "Failed to create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  }, [apiBaseUrl, loadStorageObjects, newFolderName, selectedStorageBucket, storageObjectPrefix]);

  const bulkDeleteStorageObjects = useCallback(async () => {
    if (!selectedStorageBucket || selectedObjectKeys.size === 0) return;
    setIsBulkDeleting(true);
    setStorageObjectsError("");
    setStorageObjectsInfo("");
    try {
      const keys = Array.from(selectedObjectKeys);
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys }),
        }
      );
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to bulk delete.");
      setStorageObjectsInfo(`Deleted ${body.deleted} object${body.deleted !== 1 ? "s" : ""}${body.errors > 0 ? `, ${body.errors} failed` : ""}.`);
      setSelectedObjectKeys(new Set());
      await loadStorageObjects();
    } catch (error) {
      setStorageObjectsError(error instanceof Error ? error.message : "Failed to bulk delete.");
    } finally {
      setIsBulkDeleting(false);
    }
  }, [apiBaseUrl, loadStorageObjects, selectedObjectKeys, selectedStorageBucket]);

  const loadUrlDiagnostics = useCallback(async (key: string) => {
    if (!selectedStorageBucket) return;
    setUrlDiagKey(key);
    setUrlDiag(null);
    setIsUrlDiagLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/url-diagnostics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        }
      );
      const body = await parseApiResponse(response);
      if (!response.ok) throw new Error(body.error || "Failed to generate diagnostics.");
      setUrlDiag(body as Record<string, unknown>);
    } catch (error) {
      setUrlDiag({ error: error instanceof Error ? error.message : "Failed." });
    } finally {
      setIsUrlDiagLoading(false);
    }
  }, [apiBaseUrl, selectedStorageBucket]);

  const loadObjectMetadata = useCallback(async (key: string) => {
    if (!selectedStorageBucket) return;
    setMetadataEditKey(key);
    setMetadataEditData({});
    setIsMetadataLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/metadata?key=${encodeURIComponent(key)}`
      );
      const body = await parseApiResponse(response);
      if (response.ok) {
        setMetadataEditData({
          contentType: (body as any).contentType || "",
          cacheControl: (body as any).cacheControl || "",
          contentDisposition: (body as any).contentDisposition || "",
        });
      }
    } catch {
      // silent
    } finally {
      setIsMetadataLoading(false);
    }
  }, [apiBaseUrl, selectedStorageBucket]);

  const saveObjectMetadata = useCallback(async () => {
    if (!selectedStorageBucket || !metadataEditKey) return;
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/objects/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: metadataEditKey, ...metadataEditData }),
        }
      );
      if (response.ok) setMetadataEditKey(null);
    } catch {
      // silent
    }
  }, [apiBaseUrl, selectedStorageBucket, metadataEditKey, metadataEditData]);

  const loadCorsBucket = useCallback(async () => {
    if (!selectedStorageBucket) return;
    setIsCorsLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/cors`);
      const body = await parseApiResponse(response);
      if (response.ok && (body as any).cors) {
        const c = (body as any).cors;
        setCorsConfig({
          allowedOrigins: Array.isArray(c.allowedOrigins) ? c.allowedOrigins.join(", ") : String(c.allowedOrigins || "*"),
          allowedMethods: Array.isArray(c.allowedMethods) ? c.allowedMethods.join(", ") : String(c.allowedMethods || "GET, HEAD"),
          allowedHeaders: Array.isArray(c.allowedHeaders) ? c.allowedHeaders.join(", ") : String(c.allowedHeaders || "*"),
          maxAge: String(c.maxAge || "3600"),
        });
      }
    } catch {
      // silent
    } finally {
      setIsCorsLoading(false);
    }
  }, [apiBaseUrl, selectedStorageBucket]);

  const saveCorsBucket = useCallback(async () => {
    if (!selectedStorageBucket) return;
    try {
      await apiFetch(`${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/cors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cors: {
            allowedOrigins: corsConfig.allowedOrigins.split(",").map((s) => s.trim()).filter(Boolean),
            allowedMethods: corsConfig.allowedMethods.split(",").map((s) => s.trim()).filter(Boolean),
            allowedHeaders: corsConfig.allowedHeaders.split(",").map((s) => s.trim()).filter(Boolean),
            maxAge: parseInt(corsConfig.maxAge) || 3600,
          },
        }),
      });
    } catch {
      // silent
    }
  }, [apiBaseUrl, selectedStorageBucket, corsConfig]);

  const loadBucketPolicy = useCallback(async () => {
    if (!selectedStorageBucket) {
      setBucketPolicyText("{}");
      return;
    }
    setIsBucketPolicyLoading(true);
    setBucketPolicyError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/policy`
      );
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load policy.");
      }
      setBucketPolicyText(JSON.stringify(body.policy || {}, null, 2));
    } catch (error) {
      setBucketPolicyText("{}");
      setBucketPolicyError(error instanceof Error ? error.message : "Failed to load policy.");
    } finally {
      setIsBucketPolicyLoading(false);
    }
  }, [apiBaseUrl, selectedStorageBucket]);

  const saveBucketPolicy = useCallback(async () => {
    if (!selectedStorageBucket) {
      setBucketPolicyError("Select a bucket first.");
      return;
    }
    setBucketPolicyError("");
    setBucketPolicyInfo("");
    setIsBucketPolicySaving(true);
    try {
      const parsedPolicy = JSON.parse(bucketPolicyText);
      const response = await fetch(
        `${apiBaseUrl}/api/storage/buckets/${encodeURIComponent(selectedStorageBucket)}/policy`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ policy: parsedPolicy }),
        }
      );
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to save policy.");
      }
      setBucketPolicyInfo("Bucket policy saved.");
    } catch (error) {
      setBucketPolicyError(error instanceof Error ? error.message : "Failed to save policy.");
    } finally {
      setIsBucketPolicySaving(false);
    }
  }, [apiBaseUrl, bucketPolicyText, selectedStorageBucket]);

  const fetchErd = useCallback(async () => {
    setIsErdLoading(true);
    setErdError("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/erd`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to load ER diagram.");
      }
      setErdPayload(body as ErdPayload);
    } catch (err) {
      setErdPayload(null);
      setErdError(err instanceof Error ? err.message : "Failed to load ER diagram.");
    } finally {
      setIsErdLoading(false);
    }
  }, [apiBaseUrl]);

  const runQuery = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    const startedAt = Date.now();
    setIsLoading(true);
    updateActiveTab((tab) => ({ ...tab, error: "" }));

    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: activeTab.sql, ...(sqlBranchDb ? { database: sqlBranchDb } : {}) }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Query failed.");
      }

      const result = body as QueryResult;
      updateActiveTab((tab) => ({ ...tab, result, error: "" }));
      const item: QueryHistoryItem = {
        id: makeId("hist"),
        tabTitle: activeTab.title,
        sql: activeTab.sql,
        status: "success",
        durationMs: result.durationMs,
        rowCount: result.rowCount,
        executedAt: new Date().toISOString(),
      };
      setHistory((prev) => [item, ...prev].slice(0, 100));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      updateActiveTab((tab) => ({ ...tab, result: null, error: message }));
      const item: QueryHistoryItem = {
        id: makeId("hist"),
        tabTitle: activeTab.title,
        sql: activeTab.sql,
        status: "error",
        durationMs: Date.now() - startedAt,
        rowCount: 0,
        executedAt: new Date().toISOString(),
      };
      setHistory((prev) => [item, ...prev].slice(0, 100));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, apiBaseUrl, updateActiveTab, sqlBranchDb]);

  const exportQueryResult = useCallback(async (format: "csv" | "json") => {
    if (!activeTab?.sql.trim()) return;
    setIsExporting(true);
    setShowExportMenu(false);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: activeTab.sql, format, ...(sqlBranchDb ? { database: sqlBranchDb } : {}) }),
      });
      if (!response.ok) {
        const body = await parseApiResponse(response);
        throw new Error(body.error || "Export failed.");
      }
      const blob = await response.blob();
      const ext = format === "csv" ? "csv" : "json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      updateActiveTab((tab) => ({ ...tab, error: message }));
    } finally {
      setIsExporting(false);
    }
  }, [activeTab, apiBaseUrl, sqlBranchDb, updateActiveTab]);

  useEffect(() => {
    if (
      primaryNav === "authn" &&
      authView === "users" &&
      !hasLoadedAuthUsers &&
      !isAuthUsersLoading
    ) {
      loadAuthUsers();
    }
  }, [primaryNav, authView, hasLoadedAuthUsers, isAuthUsersLoading, loadAuthUsers]);

  // Load auth stats when overview is shown
  const [hasLoadedAuthStats, setHasLoadedAuthStats] = useState(false);
  useEffect(() => {
    if (primaryNav === "authn" && authView === "overview" && !hasLoadedAuthStats) {
      setHasLoadedAuthStats(true);
      loadAuthStats();
    }
  }, [primaryNav, authView, hasLoadedAuthStats, loadAuthStats]);

  // Load security config when auth overview is shown
  useEffect(() => {
    if (primaryNav === "authn" && authView === "overview" && !hasLoadedSecurityConfig) {
      loadAuthSecurityConfig();
    }
  }, [primaryNav, authView, hasLoadedSecurityConfig, loadAuthSecurityConfig]);

  useEffect(() => {
    if (primaryNav === "authn" && authView === "providers" && !hasLoadedAuthProviders) {
      loadAuthProviders();
      loadProviderConfigs();
    }
  }, [primaryNav, authView, hasLoadedAuthProviders, loadAuthProviders, loadProviderConfigs]);

  useEffect(() => {
    if (
      primaryNav === "authn" &&
      authView === "sessions" &&
      !hasLoadedAuthSessions &&
      !isAuthSessionsLoading
    ) {
      loadAuthSessions();
    }
  }, [primaryNav, authView, hasLoadedAuthSessions, isAuthSessionsLoading, loadAuthSessions]);

  // Load Keto data when AuthZ tab is opened
  const [hasLoadedKeto, setHasLoadedKeto] = useState(false);
  useEffect(() => {
    if (primaryNav === "authz" && !hasLoadedKeto) {
      setHasLoadedKeto(true);
      loadKetoHealth();
      loadKetoNamespaces();
      loadKetoTuples();
    }
  }, [primaryNav, hasLoadedKeto, loadKetoHealth, loadKetoNamespaces, loadKetoTuples]);

  // Load Realtime data when Realtime tab is opened
  const [hasLoadedRealtime, setHasLoadedRealtime] = useState(false);
  useEffect(() => {
    if (primaryNav === "realtime" && !hasLoadedRealtime) {
      setHasLoadedRealtime(true);
      loadRealtimeStatus();
      loadRealtimeSubscriptions();
      loadRealtimeTables();
      loadRealtimeEvents();
    }
  }, [primaryNav, hasLoadedRealtime, loadRealtimeStatus, loadRealtimeSubscriptions, loadRealtimeTables, loadRealtimeEvents]);

  useEffect(() => {
    if (
      primaryNav === "storage" &&
      (storageView === "overview" ||
        storageView === "buckets" ||
        storageView === "configuration") &&
      !hasLoadedStorageBuckets &&
      !isStorageBucketsLoading
    ) {
      loadStorageBuckets();
    }
  }, [
    hasLoadedStorageBuckets,
    isStorageBucketsLoading,
    loadStorageBuckets,
    primaryNav,
    storageView,
  ]);

  useEffect(() => {
    if (primaryNav === "storage" && storageView === "buckets" && selectedStorageBucket) {
      loadStorageObjects();
    }
  }, [primaryNav, storageView, selectedStorageBucket, storageObjectPrefix, loadStorageObjects]);

  useEffect(() => {
    if (primaryNav === "storage" && storageView === "configuration" && selectedStorageBucket) {
      loadBucketPolicy();
      loadCorsBucket();
    }
  }, [primaryNav, storageView, selectedStorageBucket, loadBucketPolicy, loadCorsBucket]);

  useEffect(() => {
    if (primaryNav !== "database") {
      return;
    }
    if (
      ["functions", "triggers", "enumerated-types", "extensions", "indexes", "publications", "policies", "configuration"].includes(
        databaseView
      ) &&
      !isDatabaseCatalogLoading &&
      !databaseCatalog
    ) {
      loadDatabaseCatalog();
    }
    if (databaseView === "query-performance" && !isSqlDiagnosticsLoading && !sqlDiagnostics) {
      loadSqlDiagnostics();
    }
    if (databaseView === "query-performance" && !isTopQueriesLoading && !topQueries) {
      loadTopQueries();
    }
    if (databaseView === "slow-queries" && !isSlowQueriesLoading && !slowQueries) {
      loadSlowQueries();
    }
    if (databaseView === "overview" && !isConnInspectorLoading && !connInspector) {
      loadConnInspector();
    }
    if (databaseView === "autovacuum" && !isAutovacuumLoading && !autovacuumData) {
      loadAutovacuum();
    }
    if (databaseView === "consumption" && !consumption) {
      loadConsumption();
    }
    if (databaseView === "branches" && !isBranchesLoading && branches.length === 0) {
      loadBranches();
    }
    if (databaseView === "backups" && !isBackupsLoading && backups.length === 0) {
      loadBackups();
      loadBackupSchedule();
      loadWalConfig();
    }
    if (databaseView === "locks" && !isLocksLoading && !lockData) {
      loadLocks();
    }
    if (databaseView === "wrappers" && !isFdwLoading && !fdwData) {
      loadFdw();
    }
    if (databaseView === "security-advisor" && !isSecurityAdvisorLoading && !securityAdvisor) {
      loadSecurityAdvisor();
    }
    if (databaseView === "performance-advisor" && !isPerformanceAdvisorLoading && !performanceAdvisor) {
      loadPerformanceAdvisor();
    }
    if (databaseView === "performance" && !isIndexAdvisorLoading && !indexAdvisor) {
      loadIndexAdvisor();
    }
    if (databaseView === "performance" && !isBloatLoading && !bloatData) {
      loadBloatData();
    }
    if (databaseView === "performance" && !isSlowQueriesLoading && !slowQueries) {
      loadSlowQueries();
    }
    if (databaseView === "performance" && !isPartitioningLoading && !partitioningData) {
      loadPartitioningData();
    }
    if (databaseView === "platform-migrations" && !isMigrationStatusLoading && !migrationStatus) {
      loadMigrationStatus();
    }
    if (databaseView === "platform-migrations" && !isIdempotentLoading && !idempotentStatus) {
      loadIdempotentStatus();
    }
  }, [
    databaseCatalog,
    databaseView,
    isDatabaseCatalogLoading,
    isLocksLoading,
    isPerformanceAdvisorLoading,
    isSecurityAdvisorLoading,
    isSqlDiagnosticsLoading,
    loadDatabaseCatalog,
    loadLocks,
    loadPerformanceAdvisor,
    loadSecurityAdvisor,
    loadSqlDiagnostics,
    loadMigrationStatus,
    loadIdempotentStatus,
    loadIndexAdvisor,
    loadBloatData,
    loadSlowQueries,
    loadPartitioningData,
    lockData,
    migrationStatus,
    idempotentStatus,
    isIdempotentLoading,
    performanceAdvisor,
    indexAdvisor,
    bloatData,
    slowQueries,
    partitioningData,
    primaryNav,
    securityAdvisor,
    sqlDiagnostics,
  ]);

  useEffect(() => {
    if (primaryNav !== "database" || databaseView !== "tables") {
      return;
    }
    if (!activeTableBrowserTabId) {
      return;
    }
    const active = tableBrowserTabs.find((tab) => tab.id === activeTableBrowserTabId);
    if (!active) {
      return;
    }
    const nextQueryKey = JSON.stringify({
      schema: active.schema,
      table: active.table,
      search: active.search,
      searchColumn: active.searchColumn,
      limit: active.limit,
      offset: active.offset,
      orderBy: active.orderBy,
      orderDir: active.orderDir,
    });
    if (!active.loading && nextQueryKey !== active.lastQueryKey) {
      loadTableBrowserTab(active.id);
    }
  }, [
    activeTableBrowserTabId,
    databaseView,
    loadTableBrowserTab,
    primaryNav,
    tableBrowserTabs,
  ]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved =
        themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode;
      document.documentElement.setAttribute("data-theme", resolved);
    };
    localStorage.setItem("truss.theme", themeMode);
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeMode]);

  useEffect(() => {
    if (
      (primaryNav === "sql" && sqlMainView === "erd") ||
      (primaryNav === "database" && databaseView === "schema-visualizer")
    ) {
      if (!erdPayload && !isErdLoading) {
        fetchErd();
      }
    }
  }, [primaryNav, sqlMainView, databaseView, erdPayload, isErdLoading, fetchErd]);

  useEffect(() => {
    if (!metadata) {
      return;
    }

    if (!selectedSchema) {
      setSelectedTable("");
      return;
    }

    const schema = metadata.schemas.find((item) => item.name === selectedSchema);
    if (!schema) {
      setSelectedTable("");
      return;
    }

    if (!schema.tables.includes(selectedTable)) {
      setSelectedTable(schema.tables[0] || "");
    }
  }, [metadata, selectedSchema, selectedTable]);

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = ["INPUT", "TEXTAREA"].includes(tag) || (e.target as HTMLElement).closest(".monaco-editor");

      if (e.key === "?" && !isInput) {
        setIsShortcutsModalOpen(prev => !prev);
      }
      if (e.ctrlKey && e.key === "/") {
        setIsShortcutsModalOpen(prev => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
        setCmdPaletteQuery("");
        setCmdPaletteIndex(0);
      }
      if (e.key === "Escape" && showCommandPalette) {
        setShowCommandPalette(false);
      }
      if (e.key === "Escape" && isShortcutsModalOpen) {
        setIsShortcutsModalOpen(false);
      }

      // Two-key "g then X" chord navigation
      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const gChordMap: Record<string, PrimaryNav> = {
          d: "database", s: "storage", h: "home", a: "authn",
        };
        if (_pendingKey === "g" && gChordMap[e.key]) {
          e.preventDefault();
          setPrimaryNav(gChordMap[e.key]);
          _pendingKey = null;
          if (_pendingKeyTimer) { clearTimeout(_pendingKeyTimer); _pendingKeyTimer = null; }
        } else if (e.key === "g") {
          _pendingKey = "g";
          if (_pendingKeyTimer) clearTimeout(_pendingKeyTimer);
          _pendingKeyTimer = setTimeout(() => { _pendingKey = null; _pendingKeyTimer = null; }, 500);
        } else {
          _pendingKey = null;
        }
      }
    };
    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [isShortcutsModalOpen, showCommandPalette]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        const isSqlEditor =
          (primaryNav === "sql" && sqlMainView === "editor") ||
          (primaryNav === "database" && databaseView === "sql-editor");
        if (!isSqlEditor) {
          return;
        }
        event.preventDefault();
        if (!isLoading) {
          runQuery();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading, primaryNav, sqlMainView, databaseView, runQuery]);

  useEffect(() => {
    setResultFilter("");
  }, [activeTabId]);


  function addTab() {
    const nextIndex = tabs.length + 1;
    const id = makeId("tab");
    const tab: QueryTab = {
      id,
      title: `Query ${nextIndex}`,
      sql: "select now();",
      result: null,
      error: "",
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
  }

  function closeTab(tabId: string) {
    if (tabs.length <= 1) {
      return;
    }

    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    setTabs(nextTabs);

    if (activeTabId === tabId) {
      const fallback = nextTabs[Math.max(0, closingIndex - 1)] || nextTabs[0];
      setActiveTabId(fallback.id);
    }
  }

  function beginRenameTab(tabId: string, currentTitle: string) {
    setEditingTabId(tabId);
    setEditingTabTitle(currentTitle);
  }

  function commitRenameTab() {
    if (!editingTabId) {
      return;
    }
    const nextTitle = editingTabTitle.trim();
    if (nextTitle) {
      setTabs((prev) =>
        prev.map((tab) => (tab.id === editingTabId ? { ...tab, title: nextTitle } : tab))
      );
    }
    setEditingTabId(null);
    setEditingTabTitle("");
  }

  function cancelRenameTab() {
    setEditingTabId(null);
    setEditingTabTitle("");
  }

  function applyTableToEditor() {
    if (!selectedSchema || !selectedTable) {
      return;
    }
    updateActiveTab((tab) => ({
      ...tab,
      sql: `select * from ${selectedSchema}.${selectedTable} limit 50;`,
      title: selectedTable,
      result: null,
    }));
    setPrimaryNav("database");
    setDatabaseView("sql-editor");
  }

  function openSpecificTable(schema: string, table: string) {
    setSelectedSchema(schema);
    setSelectedTable(table);
    updateActiveTab((tab) => ({
      ...tab,
      sql: `select * from ${schema}.${table} limit 50;`,
      title: table,
      result: null,
      error: "",
    }));
    setPrimaryNav("database");
    setDatabaseView("sql-editor");
  }

  function openTableBrowser(schema: string, table: string) {
    const existing = tableBrowserTabs.find((tab) => tab.schema === schema && tab.table === table);
    if (existing) {
      setActiveTableBrowserTabId(existing.id);
      // Auto-load if tab exists but has no data yet
      if (!existing.result && !existing.loading) {
        setTimeout(() => loadTableBrowserTab(existing.id), 0);
      }
      return;
    }

    const id = makeId("tbl");
    const next: TableBrowserTab = {
      id,
      schema,
      table,
      search: "",
      searchColumn: "",
      limit: 50,
      offset: 0,
      orderBy: "",
      orderDir: "asc",
      loading: false,
      error: "",
      result: null,
      lastQueryKey: "",
      selectedRowIndex: null,
    };
    setTableBrowserTabs((prev) => [...prev, next]);
    setActiveTableBrowserTabId(id);
    // Auto-load data after state flushes
    setTimeout(() => loadTableBrowserTab(id), 0);
  }

  function closeTableBrowser(tabId: string) {
    setTableBrowserTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== tabId);
      if (activeTableBrowserTabId === tabId) {
        setActiveTableBrowserTabId(next[0]?.id || "");
      }
      return next;
    });
  }

  function patchTableBrowserTab(tabId: string, patch: Partial<TableBrowserTab>) {
    setTableBrowserTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }

  async function loadTableBrowserTab(tabId: string) {
    const tab = tableBrowserTabs.find((item) => item.id === tabId);
    if (!tab) {
      return;
    }
    const queryKey = JSON.stringify({
      schema: tab.schema,
      table: tab.table,
      search: tab.search,
      searchColumn: tab.searchColumn,
      limit: tab.limit,
      offset: tab.offset,
      orderBy: tab.orderBy,
      orderDir: tab.orderDir,
    });
    patchTableBrowserTab(tabId, { loading: true, error: "" });
    try {
      const query = new URLSearchParams();
      query.set("schema", tab.schema);
      query.set("table", tab.table);
      query.set("limit", String(tab.limit));
      query.set("offset", String(tab.offset));
      if (tab.search) {
        query.set("search", tab.search);
      }
      if (tab.searchColumn) {
        query.set("search_column", tab.searchColumn);
      }
      if (tab.orderBy) {
        query.set("order_by", tab.orderBy);
      }
      query.set("order_dir", tab.orderDir);

      const response = await apiFetch(`${apiBaseUrl}/api/sql/table-browser?${query.toString()}`);
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to browse table.");
      }
      const result = body as TableBrowserResult;
      patchTableBrowserTab(tabId, {
        loading: false,
        error: "",
        result,
        orderBy: result.orderBy || tab.orderBy,
        lastQueryKey: queryKey,
        selectedRowIndex: null,
      });

      // Also fetch detailed metadata for the sidebar
      fetchTableDetails(tab.schema, tab.table);
    } catch (error) {
      patchTableBrowserTab(tabId, {
        loading: false,
        error: error instanceof Error ? error.message : "Failed to browse table.",
      });
    }
  }

  async function fetchTableDetails(schema: string, table: string) {
    setIsTableDetailsLoading(true);
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/table-details?schema=${schema}&table=${table}`);
      const body = await parseApiResponse(response);
      if (response.ok) {
        setTableDetails(body);
      }
    } catch {
      setTableDetails(null);
    } finally {
      setIsTableDetailsLoading(false);
    }
  }

  function applySnippet() {
    const snippet = SNIPPETS.find((item) => item.label === selectedSnippet);
    if (!snippet) {
      return;
    }
    updateActiveTab((tab) => ({ ...tab, sql: snippet.sql, result: null, error: "" }));
    setPrimaryNav("database");
    setDatabaseView("sql-editor");
  }

  function loadHistorySql(sql: string) {
    updateActiveTab((tab) => ({ ...tab, sql }));
    setPrimaryNav("database");
    setDatabaseView("sql-history");
  }

  function exportResultCsv() {
    if (!activeTab?.result) {
      return;
    }
    downloadFile("query-result.csv", toCsv(activeTab.result), "text/csv;charset=utf-8");
  }

  function exportResultJson() {
    if (!activeTab?.result) {
      return;
    }
    downloadFile(
      "query-result.json",
      JSON.stringify(activeTab.result.rows, null, 2),
      "application/json;charset=utf-8"
    );
  }

  async function saveConnectionProfile() {
    const name = newProjectName || "New Profile";
    const databaseUrl =
      connectionMethod === "fields" ? composedDatabaseUrl.trim() : newConnectionUrl.trim();
    if (!databaseUrl) {
      setAccountError("Database URL is required.");
      return;
    }
    if (!databaseUrl.startsWith("postgres://") && !databaseUrl.startsWith("postgresql://")) {
      setAccountError("URL must start with postgres:// or postgresql://");
      return;
    }

    const saved = await saveConnectionProfileToApi(apiBaseUrl, name, databaseUrl);
    if (saved) {
      setConnectionProfiles([saved, ...connectionProfiles]);
      setAccountInfo("Connection saved. Use Connect to activate it.");
    } else {
      setAccountError("Failed to save connection profile.");
    }
  }

  async function switchConnection(databaseUrl: string) {
    setIsSwitchingConnection(true);
    setConnectionsMessage("");
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/connections/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ databaseUrl }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to switch connection.");
      }
      setConnectionsMessage("Connected. SQL metadata has been refreshed.");
      await Promise.all([fetchCurrentConnection(), fetchMetadata()]);
      setPrimaryNav("database");
      setDatabaseView("sql-editor");
    } catch (err) {
      setConnectionsMessage(err instanceof Error ? err.message : "Failed to switch connection.");
    } finally {
      setIsSwitchingConnection(false);
    }
  }

  async function saveCurrentQuery() {
    if (!activeTab?.sql.trim()) {
      return;
    }
    const defaultName = activeTab.title || "Saved Query";
    const input = window.prompt("Save query as (name #tag1 #tag2):", defaultName)?.trim();
    if (!input) {
      return;
    }
    const tagMatches = input.match(/#[\w-]+/g) || [];
    const tags = tagMatches.map((t) => t.slice(1));
    const name = input.replace(/#[\w-]+/g, "").trim() || defaultName;
    try {
      const response = await apiFetch(`${apiBaseUrl}/api/sql/saved-queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sql: activeTab.sql, tags }),
      });
      const body = await parseApiResponse(response);
      if (!response.ok) {
        throw new Error(body.error || "Failed to save query.");
      }
      if (body.query) {
        setSavedQueries((prev) => [body.query as SavedQuery, ...prev].slice(0, 200));
      }
    } catch {
      // Fallback: save locally so work isn't lost
      const next: SavedQuery = {
        id: makeId("saved"),
        name,
        sql: activeTab.sql,
        tags,
        createdAt: new Date().toISOString(),
      };
      setSavedQueries((prev) => [next, ...prev].slice(0, 200));
    }
  }

  function loadSavedQuery(sql: string) {
    updateActiveTab((tab) => ({ ...tab, sql, result: null, error: "" }));
    setPrimaryNav("database");
    setDatabaseView("sql-editor");
  }

  async function deleteSavedQuery(id: string) {
    setSavedQueries((prev) => prev.filter((item) => item.id !== id));
    try {
      await apiFetch(`${apiBaseUrl}/api/sql/saved-queries/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    } catch {
      // optimistic delete already applied; re-sync on next load
    }
  }

  async function updateSavedQueryTags(id: string, tags: string[]) {
    setSavedQueries((prev) => prev.map((q) => (q.id === id ? { ...q, tags } : q)));
    try {
      await apiFetch(`${apiBaseUrl}/api/sql/saved-queries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
    } catch {
      // optimistic update already applied
    }
  }

  const allSavedQueryTags = useMemo(() => {
    const tagSet = new Set<string>();
    savedQueries.forEach((q) => q.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [savedQueries]);

  const filteredSavedQueries = useMemo(() => {
    let result = savedQueries;
    if (savedQuerySearch) {
      const q = savedQuerySearch.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sql.toLowerCase().includes(q) ||
          item.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (savedQueryTagFilter) {
      result = result.filter((item) => item.tags?.includes(savedQueryTagFilter));
    }
    return result;
  }, [savedQueries, savedQuerySearch, savedQueryTagFilter]);

  function formatCurrentSql() {
    if (!activeTab?.sql) {
      return;
    }

    const keywords = [
      "select",
      "from",
      "where",
      "group by",
      "order by",
      "limit",
      "offset",
      "join",
      "left join",
      "right join",
      "inner join",
      "outer join",
      "on",
      "and",
      "or",
      "with",
      "union",
      "as",
    ];

    let formatted = activeTab.sql
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .trim();

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(" ", "\\s+")}\\b`, "gi");
      formatted = formatted.replace(regex, keyword.toUpperCase());
    }

    formatted = formatted
      .replace(/\b(FROM|WHERE|GROUP BY|ORDER BY|LIMIT|OFFSET|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|UNION)\b/g, "\n$1")
      .replace(/\b(AND|OR)\b/g, "\n  $1")
      .trim();

    updateActiveTab((tab) => ({ ...tab, sql: formatted }));
  }

  const _s = {
    tabs, setTabs, activeTabId, setActiveTabId, isLoading, setIsLoading, globalError, setGlobalError,
    metadata, setMetadata, selectedSnippet, setSelectedSnippet, selectedSchema, setSelectedSchema,
    selectedTable, setSelectedTable, tableBrowserTabs, setTableBrowserTabs, activeTableBrowserTabId,
    setActiveTableBrowserTabId, tableDetails, setTableDetails, tableInspectorTab, setTableInspectorTab,
    isTableDetailsLoading, setIsTableDetailsLoading, showTableRowDetails, setShowTableRowDetails,
    history, setHistory, resultFilter, setResultFilter, sqlSplitView, setSqlSplitView, sqlBranchDb,
    setSqlBranchDb, editingTabId, setEditingTabId, editingTabTitle, setEditingTabTitle, primaryNav,
    setPrimaryNav, databaseView, setDatabaseView, sqlMainView, setSqlMainView, sqlTool, setSqlTool,
    authView, setAuthView, authzView, setAuthzView, storageView, setStorageView, edgeView, setEdgeView,
    settingsView, setSettingsView, projects, setProjects, activeProjectId, setActiveProjectId,
    deploymentMode, setDeploymentMode, activeOrgId, setActiveOrgId, showNewProjectModal, setShowNewProjectModal, provisioningStep,
    setProvisioningStep, newProjectName, setNewProjectName, newProjectDescription, setNewProjectDescription, newProjectRegion, setNewProjectRegion,
    newProjectCreateBucket, setNewProjectCreateBucket, newProjectBucketName, setNewProjectBucketName,
    newProjectGenerateKeys, setNewProjectGenerateKeys,
    provisioningProgress, setProvisioningStepProgress, provisioningMessage, setProvisioningMessage,
    branches, setBranches, isBranchesLoading, setIsBranchesLoading, branchError, setBranchError,
    backups, setBackups, isBackupsLoading, setIsBackupsLoading, backupError, setBackupError, consumption,
    setConsumption, consumptionHistory, setConsumptionHistory, isConsumptionLoading, setIsConsumptionLoading,
    consumptionLive, setConsumptionLive, consumptionDays, setConsumptionDays, realtimeStatus, setRealtimeStatus,
    realtimeSubscriptions, setRealtimeSubscriptions, realtimeEvents, setRealtimeEvents, realtimeTables,
    setRealtimeTables, isRealtimeLoading, setIsRealtimeLoading, realtimeWs, setRealtimeWs, realtimeWsConnected,
    setRealtimeWsConnected, realtimePaused, setRealtimePaused, realtimeSubSchema, setRealtimeSubSchema,
    realtimeSubTable, setRealtimeSubTable, realtimeFilter, setRealtimeFilter, realtimeView, setRealtimeView,
    presenceUserId, presenceChannel, setPresenceChannel, presenceName, setPresenceName,
    presenceJoined, setPresenceJoined, presenceUsers, joinPresenceChannel, leavePresenceChannel,
    lockData, setLockData,
    isLocksLoading, setIsLocksLoading, connectionMethod, setConnectionMethod, themeMode, setThemeMode, editorTheme,
    apiKeys, setApiKeys, isApiKeysLoading, setIsApiKeysLoading, newKeySecret, setNewKeySecret,
    apiKeyCopied, setApiKeyCopied, expandedSchemas, setExpandedSchemas, erdPayload, setErdPayload,
    erdError, setErdError, isErdLoading, setIsErdLoading, connectionProfiles, setConnectionProfiles,
    newConnectionUrl, setNewConnectionUrl, fieldHost, setFieldHost, fieldPort, setFieldPort, fieldDatabase,
    setFieldDatabase, fieldUser, setFieldUser, fieldPassword, setFieldPassword, fieldSslMode, setFieldSslMode,
    connectionsMessage, setConnectionsMessage, newConnectionName, setNewConnectionName, connStrPassword,
    setConnStrPassword, connStrTab, setConnStrTab, copiedBlock, setCopiedBlock, connectSection,
    setConnectSection, currentConnection, setCurrentConnection, isSwitchingConnection, setIsSwitchingConnection,
    savedQueries, setSavedQueries, savedQuerySearch, setSavedQuerySearch, savedQueryTagFilter,
    setSavedQueryTagFilter, integrationsStatus, setIntegrationsStatus, isIntegrationsLoading, setIsIntegrationsLoading,
    authIdentities, setAuthIdentities, isAuthUsersLoading, setIsAuthUsersLoading, authUsersError,
    setAuthUsersError, authUsersInfo, setAuthUsersInfo, authUsersNextToken, authUsersPrevToken,
    selectedUserIds, setSelectedUserIds, isBatchActionLoading, batchActionUsers, impersonateUser,
    newAuthEmail, setNewAuthEmail, newAuthPassword,
    setNewAuthPassword, isCreatingAuthUser, setIsCreatingAuthUser, sampleUserCredentials, setSampleUserCredentials,
    authProviders, setAuthProviders, authProvidersError, setAuthProvidersError, authKratosHealthy,
    setAuthKratosHealthy, showImportModal, setShowImportModal, importCsvText, setImportCsvText,
    isImportingUsers, setIsImportingUsers, importResult, setImportResult, importError, setImportError,
    authSessions, setAuthSessions, authSessionsError, setAuthSessionsError, isAuthSessionsLoading,
    setIsAuthSessionsLoading, authSessionsNextToken, authSessionsPrevToken,
    loginHistory, loginHistoryTotal, loginHistoryOffset, isLoginHistoryLoading, loginHistoryFilter,
    setLoginHistoryFilter, loadLoginHistory, authStats, loadAuthStats, authSecurityConfig, loadAuthSecurityConfig,
    sessionsSubTab, setSessionsSubTab,
    hasLoadedAuthUsers, setHasLoadedAuthUsers, hasLoadedAuthProviders,
    setHasLoadedAuthProviders, hasLoadedAuthSessions, setHasLoadedAuthSessions, showAuthPassword,
    setShowAuthPassword, selectedAuthSnippet, setSelectedAuthSnippet, selectedStorageSnippet, setSelectedStorageSnippet,
    storageBuckets, setStorageBuckets, storageBucketsError, setStorageBucketsError, storageBucketsInfo,
    setStorageBucketsInfo, isStorageBucketsLoading, setIsStorageBucketsLoading, isCreatingStorageBucket,
    setIsCreatingStorageBucket, deletingBucketName, setDeletingBucketName, hasLoadedStorageBuckets,
    setHasLoadedStorageBuckets, newBucketName, setNewBucketName, selectedStorageBucket, setSelectedStorageBucket,
    storageObjects, setStorageObjects, storageObjectsError, setStorageObjectsError, storageObjectsInfo,
    setStorageObjectsInfo, isStorageObjectsLoading, setIsStorageObjectsLoading, isUploadingStorageObject,
    setIsUploadingStorageObject, deletingObjectKey, setDeletingObjectKey, storageObjectPrefix,
    setStorageObjectPrefix, newObjectKey, setNewObjectKey, uploadFile, setUploadFile, storageSearch,
    setStorageSearch, latestDownloadUrl, setLatestDownloadUrl, selectedObjectKeys, setSelectedObjectKeys,
    isBulkDeleting, setIsBulkDeleting, newFolderName, setNewFolderName, showNewFolderInput, setShowNewFolderInput,
    isCreatingFolder, setIsCreatingFolder, urlDiagKey, setUrlDiagKey, urlDiag, setUrlDiag, metadataEditKey,
    setMetadataEditKey, metadataEditData, setMetadataEditData, isMetadataLoading, setIsMetadataLoading,
    corsConfig, setCorsConfig, isCorsLoading, setIsCorsLoading, fdwData, setFdwData, isFdwLoading,
    setIsFdwLoading, migrationPreview, setMigrationPreview, migrationSafetyCheck, setMigrationSafetyCheck,
    isMigrationChecking, setIsMigrationChecking, providerConfigs, setProviderConfigs, auditLogsTotal,
    setAuditLogsTotal, backupSchedule, setBackupSchedule, walConfig, setWalConfig, isWalConfigLoading,
    setIsWalConfigLoading, edgePlaygroundSql, setEdgePlaygroundSql,
    edgePlaygroundKey, setEdgePlaygroundKey, edgePlaygroundResult, setEdgePlaygroundResult, isEdgePlaygroundLoading,
    setIsEdgePlaygroundLoading, ketoNamespaces, setKetoNamespaces, ketoTuples, setKetoTuples, ketoTuplesNextToken,
    setKetoTuplesNextToken, isKetoLoading, setIsKetoLoading, ketoHealth, setKetoHealth, ketoCheckNs,
    setKetoCheckNs, ketoCheckObj, setKetoCheckObj, ketoCheckRel, setKetoCheckRel, ketoCheckSub,
    setKetoCheckSub, ketoCheckResult, setKetoCheckResult, isKetoChecking, setIsKetoChecking, ketoExpandResult,
    setKetoExpandResult, ketoFilterNs, setKetoFilterNs, ketoFilterObj, setKetoFilterObj, ketoFilterRel,
    setKetoFilterRel, ketoNewNs, setKetoNewNs, ketoNewObj, setKetoNewObj, ketoNewRel, setKetoNewRel,
    ketoNewSub, setKetoNewSub, isKetoCreating, setIsKetoCreating, selectedIdentityId, setSelectedIdentityId,
    selectedIdentityDetail, setSelectedIdentityDetail, selectedIdentityTuples, setSelectedIdentityTuples,
    isIdentityDetailLoading, setIsIdentityDetailLoading, whoCanAccessNs, setWhoCanAccessNs, whoCanAccessObj,
    setWhoCanAccessObj, whoCanAccessResult, setWhoCanAccessResult, isWhoCanAccessLoading, setIsWhoCanAccessLoading,
    showAssignModal, setShowAssignModal, assignNs, setAssignNs, assignObj, setAssignObj, assignRel,
    setAssignRel, assignSubjectId, setAssignSubjectId, assignSearch, setAssignSearch, authUserSearch,
    setAuthUserSearch, resetPasswordId, setResetPasswordId, resetPasswordValue, setResetPasswordValue,
    isResettingPassword, setIsResettingPassword, selectedTupleIndices, setSelectedTupleIndices,
    isBulkDeletingTuples, setIsBulkDeletingTuples, showImportTuplesModal, setShowImportTuplesModal,
    importTuplesJson, setImportTuplesJson, importTuplesResult, setImportTuplesResult, isImportingTuples,
    setIsImportingTuples, ketoCheckHistory, setKetoCheckHistory, isUrlDiagLoading, setIsUrlDiagLoading,
    bucketPolicyText, setBucketPolicyText, bucketPolicyError, setBucketPolicyError, bucketPolicyInfo,
    setBucketPolicyInfo, isBucketPolicyLoading, setIsBucketPolicyLoading, isBucketPolicySaving,
    setIsBucketPolicySaving, databaseCatalog, setDatabaseCatalog, databaseCatalogError, setDatabaseCatalogError,
    isDatabaseCatalogLoading, setIsDatabaseCatalogLoading, sqlDiagnostics, setSqlDiagnostics, sqlDiagnosticsError,
    setSqlDiagnosticsError, slowQueries, setSlowQueries, isSlowQueriesLoading, setIsSlowQueriesLoading,
    slowQueriesError, setSlowQueriesError, connInspector, setConnInspector, isConnInspectorLoading,
    setIsConnInspectorLoading, connInspectorError, setConnInspectorError, autovacuumData, setAutovacuumData,
    isAutovacuumLoading, setIsAutovacuumLoading, autovacuumError, setAutovacuumError, slowQueriesFilter,
    setSlowQueriesFilter, expandedSlowQuery, setExpandedSlowQuery, isSqlDiagnosticsLoading, setIsSqlDiagnosticsLoading,
    topQueries, isTopQueriesLoading, topQueriesError, topQueriesSort, setTopQueriesSort, expandedTopQuery, setExpandedTopQuery,
    loadTopQueries, resetTopQueriesStats,
    securityAdvisor, setSecurityAdvisor, securityAdvisorError, setSecurityAdvisorError, securityAdvisorInfo,
    setSecurityAdvisorInfo, isSecurityAdvisorLoading, setIsSecurityAdvisorLoading, performanceAdvisor,
    setPerformanceAdvisor, performanceAdvisorError, setPerformanceAdvisorError, performanceAdvisorInfo,
    setPerformanceAdvisorInfo, isPerformanceAdvisorLoading, setIsPerformanceAdvisorLoading,
    latencyPercentiles, isLatencyLoading, loadLatencyPercentiles,
    indexAdvisor, indexAdvisorError, isIndexAdvisorLoading, loadIndexAdvisor,
    bloatData, bloatError, isBloatLoading, loadBloatData,
    partitioningData, partitioningError, isPartitioningLoading, loadPartitioningData,
    perfTab, setPerfTab,
    explainPlan,
    setExplainPlan, explainError, setExplainError, isExplainLoading, setIsExplainLoading, migrationStatus,
    setMigrationStatus, isMigrationStatusLoading, setIsMigrationStatusLoading, migrationError,
    setMigrationError, migrationInfo, setMigrationInfo, migrationAppliedNow, setMigrationAppliedNow,
    migrationRawOutput, setMigrationRawOutput, showMigrationLogs, setShowMigrationLogs, isMigrationRunning,
    setIsMigrationRunning, newMigrationName, setNewMigrationName, isMigrationCreating, setIsMigrationCreating,
    idempotentStatus, setIdempotentStatus, isIdempotentLoading, idempotentError, setIdempotentError,
    idempotentRunning, idempotentResult, setIdempotentResult, schemaDetection, migrationDiffTarget, setMigrationDiffTarget,
    loadIdempotentStatus, runIdempotentMigrations, markMigrationApplied, detectMigrationSchema,
    appEnvironment, setAppEnvironment, billingUsage, setBillingUsage,
    isBillingLoading, setIsBillingLoading, billingError, setBillingError,
    userAccount, setUserAccount, session, permissions, authRequired, handleLogout,
    profileNewPassword, setProfileNewPassword, profileConfirmPassword, setProfileConfirmPassword,
    profilePasswordError, setProfilePasswordError, profilePasswordSuccess, setProfilePasswordSuccess, changePassword,
    auditLogs, setAuditLogs, auditLogAction, setAuditLogAction, auditLogSearch, setAuditLogSearch,
    auditLogSince, setAuditLogSince, auditLogOffset, setAuditLogOffset, auditLogDistinctActions,
    isAuditLogsLoading, setIsAuditLogsLoading, accountError, setAccountError, accountInfo, setAccountInfo,
    isShortcutsModalOpen, setIsShortcutsModalOpen, apiBaseUrl, loadAuditLogs, loadKetoHealth,
    loadKetoNamespaces, loadKetoTuples, checkKetoPermission, batchCheckKetoPermissions, batchCheckResults, isBatchChecking, createKetoTuple, deleteKetoTuple,
    loadIdentityDetail, loadWhoCanAccess, assignRole, resetUserPassword, forceLogoutUser, bulkDeleteTuples,
    importTuples, loadApiKeys, createApiKey, revokeApiKey, updateApiKeyRateLimit, loadFdw, runMigrationSafetyCheck, loadMigrationPreview,
    loadProviderConfigs, saveProviderConfig, loadBackupSchedule, saveBackupSchedule, loadWalConfig,
    requestPitr, loadProjects, provisionedProject, provisioningError, projectsLoaded, loadLocks, loadRealtimeStatus, loadRealtimeSubscriptions,
    loadRealtimeEvents, loadRealtimeTables, subscribeRealtime, unsubscribeRealtime, clearRealtimeLog,
    connectRealtimeWs, disconnectRealtimeWs, loadBranches, createBranch, deleteBranch, loadBackups,
    createBackup, restoreBackup, deleteBackup, loadConsumption, billingRestrictions, activeTab,
    currentDatabaseName, currentProjectName, databaseViewLabel, moduleCrumb, sectionCrumb, breadcrumbs,
    composedDatabaseUrl, filteredResultRows, flattenedTables, activeTableBrowserTab, filteredStorageObjects,
    erdGraph, updateActiveTab, fetchMetadata, fetchCurrentConnection, fetchIntegrationsStatus,
    loadDatabaseCatalog, loadSqlDiagnostics, loadConnInspector, loadAutovacuum, loadSlowQueries,
    loadSecurityAdvisor, loadPerformanceAdvisor, loadBillingUsage,
    loadEnvironment, loadSavedQueriesFromServer, startProvisioning, runExplain,
    loadMigrationStatus, runPendingMigrations, createMigrationFile, copyText, loadAuthUsers, createAuthUser,
    setAuthUserState, deleteAuthUser, banAuthUser, unbanAuthUser, createSampleAuthUser, loadAuthProviders, importAuthUsers,
    loadAuthSessions, revokeAuthSession, extendAuthSession, loadStorageBuckets, createStorageBucket, deleteStorageBucket,
    loadStorageObjects, uploadStorageObject, deleteStorageObject, openDownloadForObject, createStorageFolder,
    bulkDeleteStorageObjects, loadUrlDiagnostics, loadObjectMetadata, saveObjectMetadata, loadCorsBucket,
    saveCorsBucket, loadBucketPolicy, saveBucketPolicy, fetchErd, runQuery, hasLoadedKeto, setHasLoadedKeto,
    hasLoadedRealtime, setHasLoadedRealtime, allSavedQueryTags, filteredSavedQueries,
    addTab, closeTab, beginRenameTab, commitRenameTab, cancelRenameTab, applyTableToEditor, openSpecificTable, openTableBrowser, closeTableBrowser, patchTableBrowserTab, loadTableBrowserTab, fetchTableDetails, applySnippet, loadHistorySql, exportResultCsv, exportResultJson, saveConnectionProfile, switchConnection, saveCurrentQuery, loadSavedQuery, deleteSavedQuery, updateSavedQueryTags, formatCurrentSql,
    vectorStatus, setVectorStatus, vectorCollections, setVectorCollections, isVectorLoading, setIsVectorLoading,
    selectedVectorCollection, setSelectedVectorCollection, vectorDetail, setVectorDetail, vectorItems, setVectorItems,
    vectorSearchResults, setVectorSearchResults, vectorSearchInput, setVectorSearchInput, vectorSearchMetric,
    setVectorSearchMetric, vectorSearchTopK, setVectorSearchTopK, isVectorSearching, setIsVectorSearching,
    showCreateVectorModal, setShowCreateVectorModal, newVectorName, setNewVectorName, newVectorDims, setNewVectorDims,
    newVectorMetric, setNewVectorMetric,
    searchView, setSearchView, ftsIndexedColumns, setFtsIndexedColumns, ftsIndexes, setFtsIndexes,
    ftsConfigs, setFtsConfigs, ftsEligible, setFtsEligible, isFtsLoading, setIsFtsLoading, ftsLoaded, setFtsLoaded,
    ftsQuery, setFtsQuery, ftsTable, setFtsTable, ftsColumn, setFtsColumn, ftsConfig, setFtsConfig,
    ftsResults, setFtsResults, isFtsSearching, setIsFtsSearching, showFtsSetupModal, setShowFtsSetupModal,
    ftsSetupTable, setFtsSetupTable, ftsSetupColumns, setFtsSetupColumns, ftsSetupConfig, setFtsSetupConfig,
    webhooksView, setWebhooksView, webhooksList, setWebhooksList, isWebhooksLoading, setIsWebhooksLoading, webhooksLoaded, setWebhooksLoaded,
    selectedWebhook, setSelectedWebhook, webhookLogs, setWebhookLogs, isWebhookLogsLoading, setIsWebhookLogsLoading,
    newWebhookName, setNewWebhookName, newWebhookTable, setNewWebhookTable, newWebhookUrl, setNewWebhookUrl,
    newWebhookEvents, setNewWebhookEvents, newWebhookSecret, setNewWebhookSecret, webhookTables, setWebhookTables,
    oauth2View, setOAuth2View, hydraHealth, setHydraHealth, hydraClients, setHydraClients,
    isHydraLoading, setIsHydraLoading, hydraLoaded, setHydraLoaded, hydraDiscovery, setHydraDiscovery,
    hydraJwks, setHydraJwks, selectedHydraClient, setSelectedHydraClient,
    showCreateClientModal, setShowCreateClientModal,
    editingHydraClient, setEditingHydraClient,
    flagsView, setFlagsView, flagdHealth, cacheHealth,
    cacheView, setCacheView,
    gatewayView, setGatewayView, oathkeeperHealth, setOathkeeperHealth, oathkeeperRules, setOathkeeperRules,
    isOathkeeperLoading, setIsOathkeeperLoading, oathkeeperLoaded, setOathkeeperLoaded,
    oathkeeperVersion, setOathkeeperVersion, selectedGatewayRule, setSelectedGatewayRule,
    showExportMenu, setShowExportMenu, isExporting, setIsExporting, exportQueryResult,
    orgs,
    environments, setEnvironments, activeEnvironmentId, setActiveEnvironmentId,
    activeEnvironment, showEnvDropdown, setShowEnvDropdown,
    homeView, setHomeView, projectDetail, setProjectDetail, isProjectDetailLoading, loadProjectDetail,
    renamingProjectId, setRenamingProjectId, renameValue, setRenameValue,
    deletingProjectId, setDeletingProjectId, copiedField, handleCopyField,
    sampleAppStatus, sampleAppLoading, sampleAppError, sampleAppTermLine, sampleAppTermDone,
    loadSampleApp, unloadSampleApp, showDescriptionField, setShowDescriptionField,
    terminalLines, setTerminalLines, provisioningDone, setProvisioningDone,
  };

  function renderPaneB() {
    { const r = renderHomePaneB(_s); if (r) return r; }

    { const r = renderSqlPaneB(_s); if (r) return r; }

    { const r = renderDatabasePaneB(_s); if (r) return r; }

    { const r = renderModulesPaneB(_s); if (r) return r; }

    return null;
  }

  function renderMainPanel() {
    { const r = renderHomeMain(_s); if (r) return r; }

    { const r = renderDatabaseMain(_s); if (r) return r; }

    { const r = renderModulesMain(_s); if (r) return r; }
    { const r = renderSqlMain(_s); if (r) return r; }
    return null;
  }

  // ─── OAuth2 Consent Screen ─────────────────────────────────────────────────
  // When Hydra redirects end-users here with ?consent_challenge=..., show a
  // standalone consent approval screen (no dashboard chrome).
  const consentChallenge = new URLSearchParams(window.location.search).get("consent_challenge");
  if (consentChallenge) {
    return <ConsentScreen challenge={consentChallenge} apiBaseUrl={apiBaseUrl} />;
  }

  // Auth gate: loading
  if (!authChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Auth gate: login/register screen
  if (!session) {
    // Show a clean URL for the auth screen instead of /~/_
    const base = _basePath.current;
    const authPath = `${base}/${authScreenView === "register" ? "register" : authScreenView === "recovery" ? "recovery" : "login"}`;
    if (window.location.pathname !== authPath) {
      window.history.replaceState(null, "", authPath);
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 p-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">truss</h1>
            <p className="text-xs text-slate-500 mt-1">Backend-as-a-Service Console</p>
            <p className="text-[11px] text-slate-600 mt-2">Database, auth, storage, and APIs — all in one place.</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">
              {authScreenView === "recovery" ? "Reset your password" : authScreenView === "login" ? "Sign in to your account" : "Create your account"}
            </h2>

            {authGateError && (
              <div className="mb-4 rounded-lg bg-red-950/30 border border-red-900/50 px-3 py-2 text-xs text-red-300">
                {authGateError}
              </div>
            )}

            {/* Password recovery form */}
            {authScreenView === "recovery" && (
              <div>
                {!authCodeSent ? (
                  <>
                    <p className="text-xs text-slate-400 mb-3">Enter your email address and we'll send you a recovery code.</p>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setAuthGateLoading(true);
                      setAuthGateError("");
                      try {
                        const base = (import.meta as any).env.VITE_API_BASE_URL || "";
                        const flowRes = await fetch(`${base}/api/auth/recovery`, { credentials: "include" });
                        if (!flowRes.ok) throw new Error("Failed to start recovery flow");
                        const flow = await flowRes.json();
                        (window as any).__recoveryFlowId = flow.id;
                        const submitRes = await fetch(`${base}/api/auth/recovery`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ flowId: flow.id, method: "code", email: authGateEmail }),
                        });
                        if (!submitRes.ok) {
                          const data = await submitRes.json();
                          throw new Error(data.ui?.messages?.[0]?.text || data.error || "Recovery request failed");
                        }
                        setAuthCodeSent(true);
                      } catch (err: any) {
                        setAuthGateError(err.message || "Recovery request failed");
                      } finally {
                        setAuthGateLoading(false);
                      }
                    }}>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-400 mb-1">Email</label>
                        <input
                          type="email"
                          value={authGateEmail}
                          onChange={(e) => setAuthGateEmail(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                          placeholder="you@example.com"
                          required
                          autoFocus
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={authGateLoading || !authGateEmail}
                        className="mt-5 w-full rounded-xl bg-accent-500 py-2.5 text-xs font-bold text-white hover:bg-accent-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(159,18,57,0.3)]"
                      >
                        {authGateLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </span>
                        ) : "Send Recovery Email"}
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 mb-4">
                      <p className="text-xs text-emerald-300">Recovery code sent to <strong>{authGateEmail}</strong>. Check your inbox.</p>
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      setAuthGateLoading(true);
                      setAuthGateError("");
                      try {
                        const base = (import.meta as any).env.VITE_API_BASE_URL || "";
                        const flowId = (window as any).__recoveryFlowId;
                        if (!flowId) throw new Error("Recovery flow expired. Please start over.");
                        const submitRes = await fetch(`${base}/api/auth/recovery`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          credentials: "include",
                          body: JSON.stringify({ flowId, method: "code", code: authGateCode }),
                        });
                        const data = await submitRes.json();
                        if (!submitRes.ok) {
                          throw new Error(data.ui?.messages?.[0]?.text || data.error || "Invalid code");
                        }
                        // After code verification, Kratos returns a settings flow for password change
                        if (data.session_token || data.session) {
                          // Code verified — user is now in a privileged session
                          setAuthCodeSent(false);
                          setAuthGateCode("");
                          setAuthGateError("");
                          setAuthScreenView("login");
                          setAuthGateError("Password reset successful. Please sign in with your new credentials.");
                          refreshSession();
                        } else if (data.redirect_to || data.continue_with) {
                          // Kratos wants us to continue — typically to set a new password
                          setAuthCodeSent(false);
                          setAuthGateCode("");
                          setAuthScreenView("login");
                          refreshSession();
                        } else {
                          // Fallback: redirect to login
                          setAuthCodeSent(false);
                          setAuthGateCode("");
                          setAuthScreenView("login");
                          refreshSession();
                        }
                      } catch (err: any) {
                        setAuthGateError(err.message || "Recovery failed");
                      } finally {
                        setAuthGateLoading(false);
                      }
                    }}>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-400 mb-1">Recovery Code</label>
                          <input
                            type="text"
                            value={authGateCode}
                            onChange={(e) => setAuthGateCode(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30 font-mono tracking-widest text-center"
                            placeholder="Enter 6-digit code"
                            required
                            autoFocus
                            autoComplete="one-time-code"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={authGateLoading || !authGateCode}
                        className="mt-5 w-full rounded-xl bg-accent-500 py-2.5 text-xs font-bold text-white hover:bg-accent-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(159,18,57,0.3)]"
                      >
                        {authGateLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </span>
                        ) : "Verify Code & Reset Password"}
                      </button>
                    </form>
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={() => { setAuthCodeSent(false); setAuthGateCode(""); setAuthGateError(""); }}
                        className="text-[10px] text-slate-500 hover:text-accent-400 transition-colors"
                      >
                        Didn't receive the code? Send again
                      </button>
                    </div>
                  </>
                )}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => { setAuthScreenView("login"); setAuthGateError(""); setAuthCodeSent(false); setAuthGateCode(""); }}
                    className="text-xs text-slate-500 hover:text-accent-400 transition-colors"
                  >
                    Back to sign in
                  </button>
                </div>
              </div>
            )}

            {/* Login method tabs (only on login screen) */}
            {authScreenView === "login" && (
              <div className="flex mb-4 rounded-lg bg-slate-800/60 p-0.5">
                <button
                  type="button"
                  onClick={() => { setAuthLoginMethod("password"); setAuthGateError(""); setAuthCodeSent(false); }}
                  className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all ${authLoginMethod === "password" ? "bg-slate-700 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthLoginMethod("code"); setAuthGateError(""); setAuthCodeSent(false); }}
                  className={`flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all ${authLoginMethod === "code" ? "bg-slate-700 text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
                >
                  Email Code
                </button>
                {/* Magic Link removed — requires callback handler not yet implemented */}
              </div>
            )}

            {authScreenView !== "recovery" && <><form onSubmit={(e) => {
              e.preventDefault();
              if (authScreenView === "register") handleRegister();
              else if (authLoginMethod === "magic-link") handleMagicLink();
              else if (authLoginMethod === "code") handleCodeLogin();
              else handleLogin();
            }}>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={authGateEmail}
                    onChange={(e) => setAuthGateEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                    placeholder="you@example.com"
                    required
                    autoFocus
                    disabled={(authLoginMethod === "code" || authLoginMethod === "magic-link") && authCodeSent}
                  />
                </div>
                {/* Magic link sent confirmation */}
                {authLoginMethod === "magic-link" && authCodeSent && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-center">
                    <p className="text-xs text-emerald-300">Check your email for a login link.</p>
                    <p className="mt-1 text-[10px] text-slate-500">If an account exists, you'll receive a link to sign in instantly.</p>
                  </div>
                )}
                {/* Password field — shown for password method + register */}
                {(authLoginMethod === "password" || authScreenView === "register") && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Password</label>
                    <div className="relative">
                      <input
                        type={showAuthPassword ? "text" : "password"}
                        value={authGatePassword}
                        onChange={(e) => setAuthGatePassword(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
                        placeholder="••••••••"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowAuthPassword((v) => !v)}
                        aria-label={showAuthPassword ? "Hide password" : "Show password"}
                        title={showAuthPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showAuthPassword ? <EyeSlash size={16} weight="regular" /> : <Eye size={16} weight="regular" />}
                      </button>
                    </div>
                    {authScreenView === "login" && authLoginMethod === "password" && (
                      <div className="mt-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => { setAuthScreenView("recovery"); setAuthGateError(""); setAuthCodeSent(false); }}
                          className="text-[10px] text-slate-500 hover:text-accent-400 transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {/* Code field — shown after code is sent */}
                {authLoginMethod === "code" && authScreenView === "login" && authCodeSent && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Verification Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={authGateCode}
                      onChange={(e) => setAuthGateCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30 tracking-[0.3em] text-center font-mono"
                      placeholder="Enter code"
                      required
                      autoFocus
                    />
                    <p className="mt-1.5 text-[10px] text-slate-500">Check your email for a login code.</p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={authGateLoading || !authGateEmail || (authLoginMethod === "password" && !authGatePassword) || (authLoginMethod === "code" && authCodeSent && !authGateCode) || (authLoginMethod === "magic-link" && authCodeSent)}
                className="mt-5 w-full rounded-xl bg-accent-500 py-2.5 text-xs font-bold text-white hover:bg-accent-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(159,18,57,0.3)]"
              >
                {authGateLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {authLoginMethod === "magic-link" ? "Sending link..." : authLoginMethod === "code" && !authCodeSent ? "Sending code..." : authScreenView === "login" ? "Signing in..." : "Creating account..."}
                  </span>
                ) : (
                  authLoginMethod === "magic-link"
                    ? (authCodeSent ? "Link Sent — Check Email" : "Send Magic Link")
                    : authLoginMethod === "code" && authScreenView === "login"
                    ? (authCodeSent ? "Verify Code" : "Send Login Code")
                    : (authScreenView === "login" ? "Sign In" : "Create Account")
                )}
              </button>
            </form>

            {/* Resend code link */}
            {authLoginMethod === "code" && authCodeSent && authScreenView === "login" && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => { setAuthCodeSent(false); setAuthGateCode(""); setAuthGateError(""); }}
                  className="text-[10px] text-slate-500 hover:text-accent-400 transition-colors"
                >
                  Didn't receive the code? Try again
                </button>
              </div>
            )}
            </>}

            {/* Passkey login divider + button (only on login screen) */}
            {authScreenView === "login" && typeof window !== "undefined" && window.PublicKeyCredential && (
              <>
                <div className="relative mt-4 mb-3">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700/50" /></div>
                  <div className="relative flex justify-center"><span className="bg-slate-900/80 px-2 text-[10px] text-slate-500">or</span></div>
                </div>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={authGateLoading}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/60 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>
                  Sign in with Passkey
                </button>
              </>
            )}

            {authScreenView !== "recovery" && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => { setAuthScreenView(authScreenView === "login" ? "register" : "login"); setAuthGateError(""); setAuthCodeSent(false); setAuthLoginMethod("password"); }}
                  className="text-xs text-slate-500 hover:text-accent-400 transition-colors"
                >
                  {authScreenView === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              </div>
            )}
          </div>

          {import.meta.env.VITE_DEV_MODE === "true" && (
            <div className="mt-4 rounded-lg border border-slate-800/50 bg-slate-900/40 px-3 py-2.5 text-center">
              <p className="text-[10px] text-slate-500">
                <span className="text-amber-400/80 font-medium">Dev credentials pre-filled.</span>{" "}
                First time? Click "Sign up" above to register, then sign in.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const _paneBJsx = renderPaneB();

  return (
    <main className="app-shell flex h-screen flex-col overflow-hidden">
      {/* Demo mode banner */}
      {session?.isDemo && (
        <div className="flex items-center justify-center gap-3 bg-accent-900/80 border-b border-accent-700/40 px-4 py-2.5 text-xs text-accent-100 shrink-0">
          <span>This is a live demo with sample data — click around, break things.</span>
          <span className="text-accent-500/60">|</span>
          <span className="text-accent-200">Want this for your next project?</span>
          <a
            href="https://truss.binarysquad.org/#waitlist"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 hover:bg-accent-500 px-3 py-1 text-[11px] font-semibold text-white transition-colors"
          >
            Join the waitlist
          </a>
        </div>
      )}
      {/* Demo write-blocked toast */}
      {demoToastVisible && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-slate-900 px-4 py-2.5 shadow-lg">
            <span className="text-amber-400 text-sm">Read-only demo</span>
            <span className="text-slate-400 text-xs">— sign up for write access</span>
          </div>
        </div>
      )}
      {/* Demo welcome modal */}
      {showDemoWelcome && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowDemoWelcome(false)}>
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-100 mb-2">Welcome to the Truss Demo</h2>
            <p className="text-sm text-slate-300 mb-4">
              You're exploring a live, read-only instance of Truss. Browse the full dashboard — database, auth, storage, permissions, and more — with real sample data.
            </p>
            <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 mb-5">
              <p className="text-xs text-amber-300/90">
                <span className="font-semibold">Read-only mode:</span> All write operations (create, update, delete) are disabled. You can explore everything, run SELECT queries, and browse all panels freely.
              </p>
            </div>
            <button
              onClick={() => setShowDemoWelcome(false)}
              className="w-full rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 transition-colors"
            >
              Start Exploring
            </button>
          </div>
        </div>
      )}
      <header className="border-b border-slate-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="truss-logo" aria-hidden="true">
              <svg viewBox="0 0 32 26" width="16" height="13" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="2" y1="4" x2="30" y2="4" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="2" y1="22" x2="30" y2="22" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="2" y1="4" x2="2" y2="22" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="16" y1="4" x2="16" y2="22" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="30" y1="4" x2="30" y2="22" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="2" y1="22" x2="16" y2="4" stroke="#f8fafc" strokeWidth="1.6" strokeLinecap="round" opacity=".4"/>
                <line x1="16" y1="22" x2="30" y2="4" stroke="#f8fafc" strokeWidth="1.6" strokeLinecap="round" opacity=".4"/>
                <circle cx="2" cy="4" r="2.5" fill="#f8fafc"/>
                <circle cx="16" cy="4" r="2.5" fill="#f8fafc"/>
                <circle cx="30" cy="4" r="2.5" fill="#f8fafc"/>
                <circle cx="2" cy="22" r="2.5" fill="#f8fafc"/>
                <circle cx="16" cy="22" r="2.5" fill="#f8fafc"/>
                <circle cx="30" cy="22" r="2.5" fill="#f8fafc"/>
              </svg>
            </span>
            <h1 className="text-xl font-semibold tracking-tight">Truss</h1>

            {/* Org Switcher — hidden when dev tenant switching is active */}
            {(import.meta.env.VITE_DEV_MODE !== "true" || devTenants.length === 0) && <div className="relative ml-3 pl-3 border-l border-slate-700">
              <button
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <span className="truncate max-w-[140px]">
                  {activeOrgId ? (orgs.find(o => o.id === activeOrgId)?.name || "Org") : "Personal"}
                </span>
                <CaretDown size={12} weight="regular" className={`shrink-0 transition-transform ${showOrgDropdown ? "rotate-180" : ""}`} />
              </button>
              {showOrgDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowOrgDropdown(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-md border border-slate-700 bg-slate-950 py-1 shadow-xl">
                    <button
                      onClick={() => { setActiveOrgId(null); setShowOrgDropdown(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                        activeOrgId === null ? "bg-accent-600/10 text-accent-400" : "text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <User size={14} weight="regular" className="shrink-0 opacity-60" />
                      <span className="truncate">Personal</span>
                    </button>
                    {orgs.length > 0 && <div className="my-1 border-t border-slate-800" />}
                    {orgs.map(org => (
                      <button
                        key={org.id}
                        onClick={() => { setActiveOrgId(org.id); setShowOrgDropdown(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                          activeOrgId === org.id ? "bg-accent-600/10 text-accent-400" : "text-slate-300 hover:bg-slate-900"
                        }`}
                      >
                        <Users size={14} weight="regular" className="shrink-0 opacity-60" />
                        <span className="truncate flex-1">{org.name}</span>
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">{org.my_role}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>}

            {/* Environment Switcher — shown when project has multiple environments */}
            {environments.length > 1 && (
              <div className="relative ml-2">
                <button
                  onClick={() => setShowEnvDropdown(!showEnvDropdown)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] transition-all hover:bg-slate-800"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    activeEnvironment?.slug === "production" ? "bg-emerald-400" :
                    activeEnvironment?.slug === "staging" ? "bg-amber-400" : "bg-slate-400"
                  }`} />
                  <span className="text-slate-300">{activeEnvironment?.name || "Production"}</span>
                  <CaretDown size={10} className="text-slate-500" />
                </button>
                {showEnvDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEnvDropdown(false)} />
                    <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl">
                      {environments.filter(e => e.status === "active").map(env => (
                        <button
                          key={env.id}
                          onClick={() => {
                            setActiveEnvironmentId(env.id);
                            setActiveEnvironmentIdGlobal(env.id);
                            setShowEnvDropdown(false);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-all ${
                            env.id === activeEnvironmentId ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            env.slug === "production" ? "bg-emerald-400" :
                            env.slug === "staging" ? "bg-amber-400" : "bg-slate-400"
                          }`} />
                          {env.name}
                          {env.is_default && <span className="ml-auto text-[9px] text-slate-600">default</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Dev Tenant Switcher — only visible in dev mode */}
            {import.meta.env.VITE_DEV_MODE === "true" && devTenants.length > 1 && (
              <div className="relative mr-2">
                <button
                  onClick={() => setShowDevTenantDropdown(!showDevTenantDropdown)}
                  className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-950/60 transition-colors"
                >
                  <Wrench size={13} weight="regular" />
                  <span className="truncate max-w-[120px]">
                    {devTenants.find(t => t.id === devCurrentTenant)?.displayName || "Tenant"}
                  </span>
                  <CaretDown size={11} weight="regular" className={`shrink-0 transition-transform ${showDevTenantDropdown ? "rotate-180" : ""}`} />
                </button>
                {showDevTenantDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowDevTenantDropdown(false)} />
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-amber-500/30 bg-slate-950 py-1 shadow-xl">
                      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/70">Dev Tenants</div>
                      {devTenants.map(tenant => (
                        <button
                          key={tenant.id}
                          onClick={() => {
                            setShowDevTenantDropdown(false);
                            if (tenant.id !== devCurrentTenant) {
                              handleDevTenantSwitch(tenant.id);
                            }
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                            tenant.id === devCurrentTenant
                              ? "bg-amber-500/10 text-amber-300"
                              : "text-slate-300 hover:bg-slate-900"
                          }`}
                        >
                          <span className="truncate flex-1">{tenant.displayName}</span>
                          {tenant.plan && <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">{tenant.plan}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => setThemeMode("light")}
              className={`rounded border p-1.5 transition-all hover:scale-105 ${
                themeMode === "light"
                  ? "border-slate-600 bg-slate-800 text-slate-100"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
              aria-label="Light mode"
              title="Light mode"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M12 8a4 4 0 100 8 4 4 0 000-8zm0-6h1v3h-1V2zm0 17h1v3h-1v-3zM2 11h3v1H2v-1zm17 0h3v1h-3v-1zM4.9 4.2l.7-.7 2.1 2.1-.7.7-2.1-2.1zm11.3 11.3l.7-.7 2.1 2.1-.7.7-2.1-2.1zM4.9 19.1l2.1-2.1.7.7-2.1 2.1-.7-.7zm12-12l2.1-2.1.7.7-2.1 2.1-.7-.7z" />
              </svg>
            </button>
            <button
              onClick={() => setThemeMode("dark")}
              className={`rounded border p-1.5 transition-all hover:scale-105 ${
                themeMode === "dark"
                  ? "border-slate-600 bg-slate-800 text-slate-100"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
              aria-label="Dark mode"
              title="Dark mode"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M20 14.5A8.5 8.5 0 119.5 4 7 7 0 0020 14.5z" />
              </svg>
            </button>
            <button
              onClick={() => setThemeMode("system")}
              className={`rounded border p-1.5 transition-all hover:scale-105 ${
                themeMode === "system"
                  ? "border-slate-600 bg-slate-800 text-slate-100"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
              aria-label="System theme"
              title="System theme"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M3 4h18v12H3V4zm1 1v10h16V5H4zm4 13h8v1H8v-1z" />
              </svg>
            </button>

            {/* Admin quick-links — only for admin tenant in dev mode */}
            {import.meta.env.VITE_DEV_MODE === "true" && devCurrentTenant === "local" && (() => {
              // Build proxy-aware URLs: detect /absproxy/{port} pattern and swap port
              const proxyMatch = window.location.pathname.match(/^\/(abs)?proxy\/(\d+)/);
              const makeUrl = (port: number, path = "/") => {
                if (proxyMatch) return `${window.location.origin}/${proxyMatch[1] || ""}proxy/${port}${path}`;
                return `http://localhost:${port}${path}`;
              };
              const btnCls = "rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 transition-all flex items-center gap-1";
              return (
                <div className="ml-3 pl-3 border-l border-slate-700 flex items-center gap-1">
                  <button onClick={() => window.open(makeUrl(5173, "/v1/docs"), "_blank")} className={btnCls} title="OpenAPI / Swagger Docs">
                    Swagger <ArrowSquareOut size={11} weight="regular" />
                  </button>
                  <button onClick={() => window.open(makeUrl(5175, "/"), "_blank")} className={btnCls} title="Public Docs (Starlight)">
                    Docs <ArrowSquareOut size={11} weight="regular" />
                  </button>
                  <button onClick={() => window.open(makeUrl(5174, "/"), "_blank")} className={btnCls} title="Admin Dashboard">
                    Admin <ArrowSquareOut size={11} weight="regular" />
                  </button>
                  <button onClick={() => window.open(makeUrl(5176, "/"), "_blank")} className={btnCls} title="Landing Page">
                    Landing <ArrowSquareOut size={11} weight="regular" />
                  </button>
                </div>
              );
            })()}

            <div className="ml-3 pl-3 border-l border-slate-700 flex items-center gap-2">
              <span className="text-xs text-slate-400 truncate max-w-[160px]" title={session?.email}>
                {session?.displayName || session?.email || "User"}
              </span>
              <button
                onClick={handleLogout}
                className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                aria-label="Sign out"
                title="Sign out"
              >
                <SignOut size={14} weight="regular" />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center overflow-auto whitespace-nowrap text-[11px]">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${crumb.label}-${index}`} className="flex items-center">
                {index > 0 && (
                  <svg width="16" height="16" viewBox="0 0 16 16" className="text-slate-700 shrink-0 -mx-0.5">
                    <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 transition-colors ${isLast ? "bg-accent-600/8 text-accent-400 font-medium" : "text-slate-500 hover:text-slate-300"}`}>
                  <span className="opacity-60 shrink-0 [&>svg]:h-3 [&>svg]:w-3">{crumb.icon}</span>
                  {crumb.label}
                </span>
              </span>
            );
          })}
        </div>
      </header>

      {/* Trial countdown banner */}
      {session && !session.isDemo && session.plan === "trial" && session.trialExpiresAt && (() => {
        const msLeft = new Date(session.trialExpiresAt).getTime() - Date.now();
        const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
        const expired = msLeft <= 0;
        const urgent = daysLeft <= 3;
        return (
          <div className={`flex items-center justify-between px-6 py-2 text-xs font-medium border-b ${expired ? "bg-red-950/30 border-red-900/50 text-red-300" : urgent ? "bg-amber-950/30 border-amber-900/50 text-amber-300" : "bg-accent-950/20 border-accent-800/30 text-accent-300"}`}>
            <div className="flex items-center gap-2">
              <Timer size={14} weight="regular" />
              {expired
                ? "Your 14-day trial has expired."
                : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left on your free trial`}
            </div>
          </div>
        );
      })()}

      <section className={`grid min-h-0 flex-1 grid-cols-1 ${_paneBJsx ? "lg:grid-cols-[200px_240px_1fr]" : "lg:grid-cols-[200px_1fr]"}`}>
        <aside className="border-r border-slate-800 bg-slate-900/40 p-3 flex flex-col gap-4">
          {/* Core nav */}
          <div className="space-y-0.5">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-bold px-1">Core</p>
            {([
              { id: "home" as PrimaryNav, icon: <House size={18} weight="regular" />, label: "Home", moduleKey: null },
              { id: "database" as PrimaryNav, icon: <Database size={18} weight="regular" />, label: "Database", moduleKey: "database" },
              { id: "authn" as PrimaryNav, icon: <UserList size={18} weight="regular" />, label: "Authentication", moduleKey: "authn" },
              { id: "storage" as PrimaryNav, icon: <PaintBucket size={18} weight="regular" />, label: "Storage", moduleKey: "storage" },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setPrimaryNav(item.id);
                  if (item.id === "home") setHomeView("projects");
                  if (item.id === "database") setDatabaseView("overview");
                  if (item.id === "authn") setAuthView("overview");
                  if (item.id === "storage") setStorageView("overview");
                }}
                className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-xs ${
                  primaryNav === item.id
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          {/* Platform nav — collapsible */}
          <div className="space-y-0.5">
            <button
              onClick={() => setPlatformNavExpanded(!platformNavExpanded)}
              className="mb-2 flex w-full items-center justify-between px-1 group"
            >
              <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Platform</p>
              <CaretDown size={10} weight="bold" className={`text-slate-600 transition-transform ${platformNavExpanded ? "" : "-rotate-90"}`} />
            </button>
            {platformNavExpanded && ([
              { id: "edge" as PrimaryNav, icon: <Lightning size={18} weight="regular" />, label: "API", moduleKey: "edge" },
              { id: "authz" as PrimaryNav, icon: <ShieldCheck size={18} weight="regular" />, label: "Permissions", moduleKey: "authz" },
              { id: "realtime" as PrimaryNav, icon: <Broadcast size={18} weight="regular" />, label: "Realtime", moduleKey: "realtime" },
              { id: "webhooks" as PrimaryNav, icon: <Waveform size={18} weight="regular" />, label: "Webhooks", moduleKey: "webhooks" },
              { id: "search" as PrimaryNav, icon: <MagnifyingGlass size={18} weight="regular" />, label: "Search", moduleKey: "search" },
              { id: "oauth2" as PrimaryNav, icon: <LockKey size={18} weight="regular" />, label: "OAuth2", moduleKey: "oauth2" },
              { id: "gateway" as PrimaryNav, icon: <Plug size={18} weight="regular" />, label: "API Gateway", moduleKey: "gateway" },
              { id: "flags" as PrimaryNav, icon: <Flag size={18} weight="regular" />, label: "Feature Flags", moduleKey: "flags" },
              { id: "cache" as PrimaryNav, icon: <Stack size={18} weight="regular" />, label: "Cache", moduleKey: "cache" },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setPrimaryNav(item.id);
                  if (item.id === "authz") setAuthzView("overview");
                  if (item.id === "edge") setEdgeView("developer");
                  if (item.id === "search") setSearchView("overview");
                  if (item.id === "webhooks") setWebhooksView("list");
                  if (item.id === "oauth2") setOAuth2View("overview");
                  if (item.id === "gateway") setGatewayView("overview");
                  if (item.id === "flags") setFlagsView("list");
                  if (item.id === "cache") setCacheView("browser");
                }}
                className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-xs ${
                  primaryNav === item.id
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          {/* Admin nav — gated by permissions */}
          {(() => {
            const adminNavItems = ([
              { id: "settings" as PrimaryNav, icon: <GearSix size={18} weight="regular" />, label: "Settings", ability: "settings.view", onSelect: () => { setSettingsView("account"); } },
            ] as const).filter(item => {
              // Show all if permissions haven't loaded yet (avoid flicker) or if admin
              if (!permissions || permissions.isAdmin) return true;
              return permissions.abilities.includes(item.ability);
            });
            if (adminNavItems.length === 0) return null;
            return (
              <div className="space-y-0.5">
                <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-600 font-bold px-1">Admin</p>
                {adminNavItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setPrimaryNav(item.id); item.onSelect(); }}
                    className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-xs ${
                      primaryNav === item.id
                        ? "border-slate-600 bg-slate-800 text-slate-100"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            );
          })()}
          {/* Build version */}
          <p className="mt-auto pt-3 text-[9px] text-slate-600 font-mono px-1" title={`Built ${(typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "").replace("T", " ").slice(0, 19)}`}>
            v{typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "dev"}
          </p>
        </aside>

        {_paneBJsx && (
          <aside className="overflow-auto border-r border-slate-800 bg-slate-900/20 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-cyan-400/80">Submodules</p>
            {_paneBJsx}
          </aside>
        )}

        <div className="flex min-h-0 flex-col">
          {(primaryNav === "database" || primaryNav === "sql")
            ? renderMainPanel()
            : <div className="mx-auto w-full max-w-[1200px] min-h-0 flex-1 flex flex-col">{renderMainPanel()}</div>
          }
        </div>
      </section>

      {showNewProjectModal && (
        <div className="wizard-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="wizard-modal w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">

            {/* -- Phase 1: Input (single screen) -- */}
            {provisioningStep === "input" && (
              <div className="p-8" style={{ animation: "wizardFadeIn 0.3s ease-out" }}>
                <h3 className="text-lg font-bold text-slate-100 mb-1">Create Project</h3>
                <p className="text-xs text-slate-500 mb-6">Set up a new project with database, storage, and API keys.</p>

                {provisioningError && (
                  <div className="wizard-error mb-5 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-300 flex items-center gap-2">
                    <Warning size={14} weight="regular" className="flex-shrink-0" /> {provisioningError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Project Name</label>
                    <input
                      autoFocus
                      value={newProjectName}
                      onChange={e => setNewProjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newProjectName.trim()) startProvisioning(); }}
                      placeholder="My Awesome App"
                      className="wizard-input w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500/50 transition-all placeholder:text-slate-600"
                    />
                  </div>

                  {!showDescriptionField ? (
                    <button
                      onClick={() => setShowDescriptionField(true)}
                      className="text-[11px] font-medium text-accent-400 hover:text-accent-300 transition-colors"
                    >
                      + Add description
                    </button>
                  ) : (
                    <div style={{ animation: "wizardFadeIn 0.2s ease-out" }}>
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-2">Description</label>
                      <textarea
                        autoFocus
                        value={newProjectDescription}
                        onChange={e => setNewProjectDescription(e.target.value)}
                        placeholder="A short description of what this project is for..."
                        rows={2}
                        className="wizard-input w-full rounded-xl border border-slate-700 bg-slate-950 p-3.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500/50 transition-all resize-none placeholder:text-slate-600"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>Includes: database schema, storage bucket, API keys</span>
                  </div>
                </div>

                <div className="wizard-footer flex justify-between items-center pt-6 mt-2 border-t border-slate-800/50">
                  <button
                    onClick={() => { setShowNewProjectModal(false); setProvisioningError(""); }}
                    className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!newProjectName.trim()}
                    onClick={startProvisioning}
                    className="rounded-xl bg-accent-500 px-8 py-3 text-xs font-bold text-white hover:bg-accent-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(159,18,57,0.4)] flex items-center gap-2"
                  >
                    <Rocket size={14} weight="regular" /> Create Project
                  </button>
                </div>
              </div>
            )}

            {/* -- Phase 2: Provisioning with terminal logs -- */}
            {provisioningStep === "provisioning" && (
              <div style={{ animation: "wizardFadeIn 0.3s ease-out" }}>
                <div className="px-8 pt-7 pb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-100">
                      {provisioningDone ? "Project created successfully!" : "Creating project..."}
                    </h3>
                    <span className={`text-xs font-bold tabular-nums transition-colors duration-500 ${
                      provisioningProgress >= 100 ? "text-emerald-400" : "text-accent-400"
                    }`}>{provisioningProgress}%</span>
                  </div>
                  <div className="wizard-progress-track relative h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`wizard-progress-fill absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
                        provisioningProgress >= 100
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : "bg-gradient-to-r from-accent-600 to-accent-400"
                      }`}
                      style={{ width: `${provisioningProgress}%` }}
                    />
                    {provisioningProgress >= 100 && (
                      <div className="absolute inset-0 rounded-full bg-emerald-400/20" style={{ animation: "wizardProgressPulse 1.5s ease-in-out" }} />
                    )}
                  </div>
                </div>

                <div className="px-4 pb-2">
                  <div
                    ref={terminalRef}
                    className="wizard-terminal rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-[11px] leading-5 overflow-y-auto"
                    style={{ height: "250px" }}
                  >
                    {terminalLines.map((line, i) => (
                      <div key={i} className={line.color || "text-slate-300"} style={{ animation: "wizardTermLine 0.15s ease-out" }}>
                        {line.text || "\u00A0"}
                      </div>
                    ))}
                    {!provisioningDone && !provisioningError && (
                      <span className="inline-block w-1.5 h-3.5 bg-accent-400 ml-0.5" style={{ animation: "wizardCursorBlink 1s step-end infinite" }} />
                    )}
                  </div>
                </div>

                {provisioningDone && provisionedProject && (
                  <div className="px-8 pb-2 pt-2" style={{ animation: "wizardFadeIn 0.4s ease-out" }}>
                    <div className="wizard-summary rounded-xl border border-slate-800 bg-slate-950/50 p-1 text-left divide-y divide-slate-800/50">
                      {[
                        { label: "Project ID", value: provisionedProject.id },
                        { label: "Schema", value: provisionedProject.schema_name },
                        ...(provisionedProject.bucket_name ? [{ label: "Bucket", value: provisionedProject.bucket_name }] : []),
                      ].map((row) => (
                        <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-[11px] text-slate-500">{row.label}</span>
                          <code className="wizard-summary-code text-[11px] text-slate-300 font-mono bg-slate-800/50 px-2 py-0.5 rounded">{row.value}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-8 pb-6 pt-3">
                  {provisioningDone && provisionedProject ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          const pid = provisionedProject.id;
                          setShowNewProjectModal(false);
                          setProvisioningStep("input");
                          setNewProjectName("");
                          setNewProjectDescription("");
                          setShowDescriptionField(false);
                          setProvisionedProject(null);
                          setTerminalLines([]);
                          setProvisioningDone(false);
                          setProvisioningStepProgress(0);
                          loadProjectDetail(pid);
                        }}
                        className="flex-1 rounded-xl bg-accent-500 py-3 text-sm font-bold text-white hover:bg-accent-400 transition-all shadow-[0_0_20px_-5px_rgba(159,18,57,0.4)]"
                      >
                        Go to Project
                      </button>
                      <button
                        onClick={() => {
                          setProvisioningStep("input");
                          setNewProjectName("");
                          setNewProjectDescription("");
                          setShowDescriptionField(false);
                          setProvisionedProject(null);
                          setTerminalLines([]);
                          setProvisioningDone(false);
                          setProvisioningStepProgress(0);
                          setProvisioningError("");
                        }}
                        className="px-4 py-3 text-xs font-medium text-slate-500 hover:text-slate-200 transition-colors"
                      >
                        Create Another
                      </button>
                    </div>
                  ) : provisioningError ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setProvisioningStep("input");
                          setTerminalLines([]);
                          setProvisioningStepProgress(0);
                        }}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-medium text-slate-200 hover:bg-slate-700 transition-all"
                      >
                        Back to Form
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

          </div>
        </div>
      )}


      {/* Rename Project Modal */}
      {renamingProjectId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl p-8">
            <h3 className="text-lg font-bold text-slate-100 mb-1">Rename Project</h3>
            <p className="text-xs text-slate-500 mb-5">Update the display name for this project.</p>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && renameValue.trim()) renameProject(renamingProjectId, renameValue.trim()); }}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-accent-500/50 transition-all"
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setRenamingProjectId(null)}
                className="px-5 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!renameValue.trim() || renamingLoading}
                onClick={() => renameProject(renamingProjectId, renameValue.trim())}
                className="rounded-xl bg-accent-500 px-6 py-2 text-xs font-bold text-slate-950 hover:bg-accent-400 transition-all disabled:opacity-50 shadow-[0_0_20px_-5px_rgba(159,18,57,0.4)]"
              >
                {renamingLoading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {deletingProjectId && (() => {
        const proj = projects.find(p => p.id === deletingProjectId);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-900/50 bg-slate-900 shadow-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                  <Trash size={20} weight="regular" className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-100">Delete Project</h3>
                  <p className="text-xs text-slate-500">This action cannot be undone.</p>
                </div>
              </div>
              <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4 mb-6 space-y-1.5">
                <p className="text-xs text-red-300">Deleting <strong className="text-red-200">{proj?.name}</strong> will permanently:</p>
                <ul className="text-[11px] text-red-400/80 space-y-1 ml-3">
                  <li>• Drop the database schema <code className="text-red-300/80 font-mono">{proj?.schema_name}</code></li>
                  <li>• Remove the storage bucket and all files</li>
                  <li>• Revoke all API keys for this project</li>
                </ul>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingProjectId(null)}
                  className="px-5 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={deletingLoading}
                  onClick={() => deleteProject(deletingProjectId)}
                  className="rounded-xl bg-red-600 px-6 py-2 text-xs font-bold text-white hover:bg-red-500 transition-all disabled:opacity-50"
                >
                  {deletingLoading ? "Deleting…" : "Delete Project"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* User Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <FileArrowUp size={18} weight="regular" className="text-accent-400" />
                <h3 className="text-sm font-semibold text-slate-100">Import Users</h3>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-slate-400">
                Paste a CSV with <code className="rounded bg-slate-800 px-1">email,password</code> header, or a JSON array of <code className="rounded bg-slate-800 px-1">{`[{email,password}]`}</code> objects. Max 500 users per batch. Password is optional — omit to create passwordless identities.
              </p>
              <textarea
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                rows={10}
                placeholder={`email,password\nuser1@example.com,secret123\nuser2@example.com,secret456`}
                className="w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
              />
              {importError && <p className="text-xs text-amber-300">{importError}</p>}
              {importResult && (
                <div className={`rounded border p-3 text-xs ${importResult.failed > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-accent-500/40 bg-accent-500/5"}`}>
                  <p className="font-semibold text-slate-200 mb-1">
                    {importResult.imported} imported, {importResult.failed} failed
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-amber-300"><span className="text-slate-400">{e.email}:</span> {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                onClick={importAuthUsers}
                disabled={isImportingUsers || !importCsvText.trim()}
                className="truss-btn rounded border border-accent-500/50 bg-accent-500/10 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImportingUsers ? <span className="truss-spinner" /> : <FileArrowUp size={14} />}
                {isImportingUsers ? "Importing..." : "Import Users"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCommandPalette && (() => {
        type CmdItem = { id: string; label: string; group: string; icon: React.ReactNode; shortcut?: string; action: () => void };

        const navItems: CmdItem[] = [
          { id: "nav-home", label: "Home", group: "Navigation", icon: <House size={16} weight="regular" />, shortcut: "G H", action: () => { setPrimaryNav("home"); setHomeView("projects"); } },
          { id: "nav-database", label: "Database", group: "Navigation", icon: <Database size={16} weight="regular" />, shortcut: "G D", action: () => { setPrimaryNav("database"); setDatabaseView("overview"); } },
          { id: "nav-authn", label: "Authentication", group: "Navigation", icon: <UserList size={16} weight="regular" />, shortcut: "G A", action: () => { setPrimaryNav("authn"); setAuthView("overview"); } },
          { id: "nav-authz", label: "Authorization", group: "Navigation", icon: <ShieldCheck size={16} weight="regular" />, action: () => { setPrimaryNav("authz"); setAuthzView("overview"); } },
          { id: "nav-storage", label: "Storage", group: "Navigation", icon: <PaintBucket size={16} weight="regular" />, shortcut: "G S", action: () => { setPrimaryNav("storage"); setStorageView("overview"); } },
          { id: "nav-realtime", label: "Realtime", group: "Navigation", icon: <Broadcast size={16} weight="regular" />, action: () => { setPrimaryNav("realtime"); } },
          { id: "nav-edge", label: "Edge", group: "Navigation", icon: <Lightning size={16} weight="regular" />, action: () => { setPrimaryNav("edge"); setEdgeView("developer"); } },
          { id: "nav-search", label: "Search", group: "Navigation", icon: <MagnifyingGlass size={16} weight="regular" />, action: () => { setPrimaryNav("search"); setSearchView("overview"); } },
          { id: "nav-webhooks", label: "Webhooks", group: "Navigation", icon: <Waveform size={16} weight="regular" />, action: () => { setPrimaryNav("webhooks"); setWebhooksView("list"); } },
          { id: "nav-oauth2", label: "OAuth2", group: "Navigation", icon: <LockKey size={16} weight="regular" />, action: () => { setPrimaryNav("oauth2"); setOAuth2View("overview"); } },
          { id: "nav-gateway", label: "API Gateway", group: "Navigation", icon: <Plug size={16} weight="regular" />, action: () => { setPrimaryNav("gateway"); setGatewayView("overview"); } },
          { id: "nav-flags", label: "Feature Flags", group: "Navigation", icon: <Flag size={16} weight="regular" />, action: () => { setPrimaryNav("flags"); setFlagsView("list"); } },
          { id: "nav-cache", label: "Cache", group: "Navigation", icon: <Stack size={16} weight="regular" />, action: () => { setPrimaryNav("cache"); setCacheView("browser"); } },
          { id: "nav-settings", label: "Settings", group: "Navigation", icon: <GearSix size={16} weight="regular" />, action: () => { setPrimaryNav("settings"); setSettingsView("account"); } },
        ];

        const dbItems: CmdItem[] = [
          { id: "db-tables", label: "Tables", group: "Database", icon: <Table size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("tables"); } },
          { id: "db-schema", label: "Schema Visualizer", group: "Database", icon: <TreeStructure size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("schema-visualizer"); } },
          { id: "db-sql", label: "SQL Editor", group: "Database", icon: <Code size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("sql-editor"); } },
          { id: "db-functions", label: "Functions", group: "Database", icon: <Function size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("functions"); } },
          { id: "db-connections", label: "Overview", group: "Database", icon: <LinkSimple size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("overview"); } },
          { id: "db-branches", label: "Branches", group: "Database", icon: <GitBranch size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("branches"); } },
          { id: "db-backups", label: "Backups", group: "Database", icon: <CloudArrowDown size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("backups"); } },
          { id: "db-vectors", label: "Vectors (pgvector)", group: "Database", icon: <Waveform size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("vectors"); } },
          { id: "db-indexes", label: "Indexes", group: "Database", icon: <ListNumbers size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("indexes"); } },
          { id: "db-roles", label: "Roles", group: "Database", icon: <Users size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("roles"); } },
          { id: "db-policies", label: "Policies", group: "Database", icon: <Shield size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("policies"); } },
          { id: "db-performance", label: "Query Performance", group: "Database", icon: <Speedometer size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("query-performance"); } },
          { id: "db-slow", label: "Slow Queries", group: "Database", icon: <Timer size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("slow-queries"); } },
          { id: "db-extensions", label: "Extensions", group: "Database", icon: <PuzzlePiece size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("extensions"); } },
        ];

        const actionItems: CmdItem[] = [
          { id: "act-new-query", label: "New SQL Query", group: "Actions", icon: <Plus size={16} weight="regular" />, action: () => { setPrimaryNav("database"); setDatabaseView("sql-editor"); addTab(); } },
          { id: "act-toggle-theme", label: `Toggle Theme (current: ${themeMode})`, group: "Actions", icon: <Sparkle size={16} weight="regular" />, action: () => { setThemeMode(themeMode === "dark" ? "light" : themeMode === "light" ? "system" : "dark"); } },
          { id: "act-shortcuts", label: "Show Keyboard Shortcuts", group: "Actions", icon: <Lightning size={16} weight="regular" />, shortcut: "?", action: () => { setIsShortcutsModalOpen(true); } },
        ];

        const allItems = [...navItems, ...dbItems, ...actionItems];
        const q = cmdPaletteQuery.toLowerCase();
        const filtered = q ? allItems.filter(item => item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)) : allItems;
        const clampedIndex = Math.min(cmdPaletteIndex, Math.max(0, filtered.length - 1));

        // Group filtered results
        const groups: Record<string, CmdItem[]> = {};
        for (const item of filtered) {
          if (!groups[item.group]) groups[item.group] = [];
          groups[item.group].push(item);
        }
        const groupOrder = ["Navigation", "Database", "Actions"];
        const orderedGroups = groupOrder.filter(g => groups[g]);

        // Build flat indexed list for keyboard nav
        let flatIndex = 0;
        const flatMap: { groupIndex: number; itemIndex: number; globalIndex: number }[] = [];
        for (const g of orderedGroups) {
          for (let i = 0; i < groups[g].length; i++) {
            flatMap.push({ groupIndex: orderedGroups.indexOf(g), itemIndex: i, globalIndex: flatIndex++ });
          }
        }

        const executeItem = (item: CmdItem) => {
          setShowCommandPalette(false);
          item.action();
        };

        return (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setShowCommandPalette(false)}
          >
            <div
              className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
                <MagnifyingGlass size={18} weight="regular" className="text-slate-500 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Type a command..."
                  value={cmdPaletteQuery}
                  onChange={(e) => { setCmdPaletteQuery(e.target.value); setCmdPaletteIndex(0); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCmdPaletteIndex(prev => Math.min(prev + 1, filtered.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCmdPaletteIndex(prev => Math.max(prev - 1, 0));
                    } else if (e.key === "Enter" && filtered.length > 0) {
                      e.preventDefault();
                      executeItem(filtered[clampedIndex]);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowCommandPalette(false);
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none"
                />
                <kbd className="hidden sm:inline-block rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-[10px] text-slate-400">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-[360px] overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">No results found</p>
                )}
                {(() => {
                  let runningIndex = 0;
                  return orderedGroups.map((groupName) => (
                    <div key={groupName}>
                      <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-slate-600 font-bold">{groupName}</p>
                      {groups[groupName].map((item) => {
                        const thisIndex = runningIndex++;
                        const isActive = thisIndex === clampedIndex;
                        return (
                          <button
                            key={item.id}
                            onMouseEnter={() => setCmdPaletteIndex(thisIndex)}
                            onClick={() => executeItem(item)}
                            className={`w-full flex items-center gap-3 px-4 py-2 text-left text-xs transition-colors ${
                              isActive
                                ? "bg-accent-600/15 text-accent-300"
                                : "text-slate-300 hover:bg-slate-800/60"
                            }`}
                          >
                            <span className={`shrink-0 ${isActive ? "text-accent-400" : "text-slate-500"}`}>{item.icon}</span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.shortcut && (
                              <kbd className={`rounded px-1.5 py-0.5 text-[10px] border ${
                                isActive
                                  ? "bg-accent-600/20 border-accent-600/30 text-accent-300"
                                  : "bg-slate-800 border-slate-700 text-slate-500"
                              }`}>{item.shortcut}</kbd>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2">
                <div className="flex items-center gap-3 text-[10px] text-slate-600">
                  <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 border border-slate-700 text-slate-400">&uarr;</kbd><kbd className="rounded bg-slate-800 px-1 py-0.5 border border-slate-700 text-slate-400">&darr;</kbd> navigate</span>
                  <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 border border-slate-700 text-slate-400">&crarr;</kbd> select</span>
                  <span className="flex items-center gap-1"><kbd className="rounded bg-slate-800 px-1 py-0.5 border border-slate-700 text-slate-400">esc</kbd> close</span>
                </div>
                <span className="text-[10px] text-slate-600">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {isShortcutsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Keyboard Shortcuts</h3>
              <button onClick={() => setIsShortcutsModalOpen(false)} className="text-slate-500 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">General</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Command Palette</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">{navigator.platform.toUpperCase().indexOf("MAC") >= 0 ? "\u2318" : "Ctrl"} + K</kbd>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Show Shortcuts</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">?</kbd>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Toggle Sidebar</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">Ctrl + \</kbd>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">SQL Editor</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Run Query</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">Ctrl + Enter</kbd>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">New Tab</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">Alt + N</kbd>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Navigation</p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Go to Database</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">G then D</kbd>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Go to Storage</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 border border-slate-700 text-slate-200">G then S</kbd>
                </div>
              </div>
            </div>
            <div className="bg-slate-950/50 p-3 rounded-b-xl border-t border-slate-800">
              <p className="text-[10px] text-center text-slate-500 italic">Press ESC to close</p>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

export default App;
