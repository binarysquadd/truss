// HomePanel.tsx — Home panel rendering (extracted from App.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Broadcast,
  CheckCircle,
  Database,
  Flag,
  Flask,
  FolderSimple,
  GitBranch,
  HardDrives,
  Key,
  Lightning,
  LockKey,
  MagnifyingGlass,
  Package,
  PaintBucket,
  PencilSimple,
  Plug,
  Plus,
  Rocket,
  Shield,
  ShieldCheck,
  Trash,
  TreeStructure,
  UserList,
  Users,
  Waveform,
  Stack,
} from "@phosphor-icons/react";
import { apiFetch } from "../types";
import type { HomeView } from "../types";

/* ── helpers ─────────────────────────────────────────────────── */

const fmtBytes = (b: number) => {
  if (!b || b < 0) return "0 B";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const fmtNum = (n: number) => {
  if (!n) return "0";
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n > 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

/* ── Hierarchy Tree (own component — hooks must not be inside conditionals) ── */

function TreeNode({ icon, label, kind, badge, badgeColor, children, indent = 0, last = false }: {
  icon: React.ReactNode; label: string; kind?: string; badge?: string; badgeColor?: string;
  children?: React.ReactNode; indent?: number; last?: boolean;
}) {
  return (
    <div className={indent > 0 ? "relative ml-4 pl-4" : ""}>
      {indent > 0 && (
        <span className={`absolute left-0 top-0 ${last ? "h-3.5" : "h-full"} w-px bg-slate-700/40`} />
      )}
      {indent > 0 && (
        <span className="absolute left-0 top-3 h-px w-3.5 bg-slate-700/40" />
      )}
      <div className="flex items-center gap-2 py-1.5">
        <span className="flex-shrink-0 text-slate-500">{icon}</span>
        <span className="text-xs text-slate-200 truncate font-medium">{label}</span>
        {kind && (
          <span className="rounded border border-slate-700/50 px-1.5 py-px text-[8px] font-mono uppercase tracking-wider text-slate-500">
            {kind}
          </span>
        )}
        {badge && (
          <span className={`rounded-full px-1.5 py-px text-[9px] font-medium ${badgeColor || "bg-slate-800 text-slate-500"}`}>
            {badge}
          </span>
        )}
      </div>
      {children && <div>{children}</div>}
    </div>
  );
}

function HierarchyTree({ _s }: { _s: any }) {
  const { orgs, activeOrgId, branches, session, apiBaseUrl } = _s;
  const tenantName = session?.displayName || session?.email || "You";
  const plan = session?.plan || "starter";
  const orgList: any[] = orgs || [];
  const branchList: any[] = branches || [];

  const [allProjects, setAllProjects] = React.useState<any[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  // Single fetch — projects come back with environments + branches inlined
  React.useEffect(() => {
    const base = apiBaseUrl || "";
    apiFetch(`${base}/api/projects?all=true`)
      .then((r: Response) => r.ok ? r.json() : { projects: [] })
      .then((data: any) => { setAllProjects(data.projects || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const planColors: Record<string, string> = {
    trial: "bg-sky-500/15 text-sky-300",
    starter: "bg-slate-700 text-slate-300",
    pro: "bg-accent-600/15 text-accent-300",
    team: "bg-violet-500/15 text-violet-300",
    business: "bg-emerald-500/15 text-emerald-300",
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Workspace Hierarchy</h2>
        <p className="text-xs text-slate-500 mt-1">Your account, organizations, projects, environments, and branches.</p>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 py-6 justify-center">
          <span className="truss-spinner" />
          <span className="text-xs text-slate-500">Loading workspace...</span>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-0.5">
          {/* Account root */}
          <TreeNode
            icon={<Users size={14} weight="regular" />}
            label={tenantName}
            kind="account"
            badge={plan}
            badgeColor={planColors[plan] || planColors.starter}
          >
            {orgList.length === 0 && (
              <div className="ml-4 pl-4 py-1 text-[10px] text-slate-600 italic">No organizations yet</div>
            )}

            {orgList.map((org: any, oi: number) => {
              const isActive = org.id === activeOrgId;
              const orgProjects = allProjects.filter((p: any) => p.org_id === org.id);
              return (
                <TreeNode
                  key={org.id}
                  icon={<HardDrives size={13} weight="regular" />}
                  label={org.name || org.slug}
                  kind="org"
                  badge={isActive ? "active" : org.role || "member"}
                  badgeColor={isActive ? "bg-accent-600/15 text-accent-300" : "bg-slate-800 text-slate-500"}
                  indent={1}
                  last={oi === orgList.length - 1 && !allProjects.some((p: any) => !p.org_id)}
                >
                  {orgProjects.length === 0 && (
                    <div className="ml-4 pl-4 py-1 text-[10px] text-slate-600 italic">No projects</div>
                  )}
                  {orgProjects.map((proj: any, pi: number) => {
                    const envs: any[] = proj.environments || [];
                    const projBranches: any[] = (proj.branches || []).concat(
                      branchList.filter((b: any) => b.project_id === proj.id && b.status === "active")
                    );
                    // Dedupe branches by id
                    const seenBranch = new Set<string>();
                    const uniqueBranches = projBranches.filter((b: any) => {
                      if (seenBranch.has(b.id)) return false;
                      seenBranch.add(b.id);
                      return b.status === "active";
                    });
                    return (
                      <TreeNode
                        key={proj.id}
                        icon={<FolderSimple size={13} weight="regular" />}
                        label={proj.name || proj.slug}
                        kind="project"
                        badge={proj.status === "active" ? "live" : proj.status}
                        badgeColor={proj.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}
                        indent={2}
                        last={pi === orgProjects.length - 1}
                      >
                        {envs.map((env: any, ei: number) => (
                          <TreeNode
                            key={env.id}
                            icon={
                              <span className={`inline-block h-2 w-2 rounded-full ${
                                env.slug === "production" ? "bg-emerald-400" :
                                env.slug === "staging" ? "bg-amber-400" : "bg-slate-400"
                              }`} />
                            }
                            label={env.name}
                            kind="env"
                            badge={env.is_default ? "default" : undefined}
                            indent={3}
                            last={ei === envs.length - 1 && uniqueBranches.length === 0}
                          />
                        ))}
                        {uniqueBranches.map((br: any, bi: number) => (
                          <TreeNode
                            key={br.id}
                            icon={<GitBranch size={13} weight="regular" />}
                            label={br.label}
                            kind="branch"
                            indent={3}
                            last={bi === uniqueBranches.length - 1}
                          />
                        ))}
                      </TreeNode>
                    );
                  })}
                </TreeNode>
              );
            })}

            {/* Personal projects (no org) */}
            {allProjects.filter((p: any) => !p.org_id).length > 0 && (
              <TreeNode icon={<FolderSimple size={13} weight="regular" />} label="Personal Projects" indent={1} last>
                {allProjects.filter((p: any) => !p.org_id).map((proj: any, pi: number, arr: any[]) => {
                  const envs: any[] = proj.environments || [];
                  const projBranches: any[] = proj.branches || [];
                  return (
                    <TreeNode
                      key={proj.id}
                      icon={<FolderSimple size={13} weight="regular" />}
                      label={proj.name || proj.slug}
                      badge={proj.status === "active" ? "live" : proj.status}
                      badgeColor={proj.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}
                      indent={2}
                      last={pi === arr.length - 1}
                    >
                      {envs.map((env: any, ei: number) => (
                        <TreeNode
                          key={env.id}
                          icon={<span className={`inline-block h-2 w-2 rounded-full ${env.slug === "production" ? "bg-emerald-400" : env.slug === "staging" ? "bg-amber-400" : "bg-slate-400"}`} />}
                          label={env.name}
                          badge={env.is_default ? "default" : undefined}
                          indent={3}
                          last={ei === envs.length - 1 && projBranches.length === 0}
                        />
                      ))}
                      {projBranches.filter((b: any) => b.status === "active").map((br: any, bi: number, barr: any[]) => (
                        <TreeNode
                          key={br.id}
                          icon={<GitBranch size={13} weight="regular" />}
                          label={br.label}
                          indent={3}
                          last={bi === barr.length - 1}
                        />
                      ))}
                    </TreeNode>
                  );
                })}
              </TreeNode>
            )}
          </TreeNode>
        </div>
      )}
    </div>
  );
}

/* ── PaneB ───────────────────────────────────────────────────── */

export function renderHomePaneB(_s: any): React.ReactNode {
  const { primaryNav, homeView, setHomeView } = _s;
  if (primaryNav !== "home") return null;

  return (
    <div className="space-y-2">
      {([
        { id: "projects" as HomeView, icon: <FolderSimple size={18} weight="regular" />, label: "Projects" },
        { id: "hierarchy" as HomeView, icon: <TreeStructure size={18} weight="regular" />, label: "Hierarchy" },
        { id: "stack" as HomeView, icon: <Package size={18} weight="regular" />, label: "Your Stack" },
      ] as const).map((item) => (
        <button
          key={item.id}
          onClick={() => setHomeView(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            homeView === item.id
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ── Main panel ──────────────────────────────────────────────── */

export function renderHomeMain(_s: any): React.ReactNode {
  const {
    primaryNav, homeView, metadata, integrationsStatus, ketoHealth, hydraHealth,
    oathkeeperHealth, flagdHealth, cacheHealth, consumption, billingUsage, projects, projectsLoaded,
    activeProjectId, setActiveProjectId, setShowNewProjectModal, setProvisioningStep,
    setProvisioningError, setNewProjectName, setNewProjectDescription,
    setShowDescriptionField, setNewProjectBucketName, setNewProjectCreateBucket,
    setNewProjectGenerateKeys, setProvisionedProject, setTerminalLines,
    setProvisioningDone, setProvisioningStepProgress, projectDetail, setProjectDetail,
    isProjectDetailLoading, loadProjectDetail, renamingProjectId, setRenamingProjectId,
    renameValue, setRenameValue, deletingProjectId, setDeletingProjectId,
    copiedField, handleCopyField, sampleAppStatus, sampleAppLoading, sampleAppError,
    sampleAppTermLine, sampleAppTermDone, loadSampleApp, unloadSampleApp,
    latencyPercentiles, isLatencyLoading, loadLatencyPercentiles,
  } = _s;

  if (primaryNav !== "home") return null;

  const dbOk = Boolean(metadata);
  const authOk = integrationsStatus?.auth?.reachable === true || integrationsStatus?.auth?.admin?.reachable === true;
  const storageOk = integrationsStatus?.storage?.s3?.reachable === true || integrationsStatus?.storage?.console?.reachable === true;

  if (homeView === "projects") {
    /* ── Project detail page ── */
    if (projectDetail && !isProjectDetailLoading) {
      const pd = projectDetail;
      return (
        <div className="min-h-0 flex-1 overflow-auto p-5 space-y-5">
          {/* Back + title bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setProjectDetail(null)}
              className="truss-btn flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100 truncate">{pd.name}</h2>
                <span className={`flex items-center gap-1 rounded-full border px-1.5 py-px text-[8px] font-medium ${pd.status === "active" ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-400" : "border-amber-500/30 bg-amber-500/8 text-amber-400"}`}>
                  <span className={`h-1 w-1 rounded-full ${pd.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                  {pd.status === "active" ? "Live" : "Pending"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{pd.region} · Created {new Date(pd.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setRenamingProjectId(pd.id); setRenameValue(pd.name); }}
                className="truss-btn flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all"
              >
                <PencilSimple size={12} weight="regular" /> Rename
              </button>
              <button
                onClick={() => setDeletingProjectId(pd.id)}
                className="truss-btn flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all"
              >
                <Trash size={12} weight="regular" /> Delete
              </button>
            </div>
          </div>

          {/* Health row */}
          <div className="flex gap-4 text-xs">
            {[
              { label: "Database", ok: dbOk },
              { label: "Auth", ok: authOk },
              { label: "Permissions", ok: ketoHealth?.read?.status === "ok" },
              { label: "OAuth2", ok: hydraHealth?.health?.status === "ok" },
              { label: "Gateway", ok: oathkeeperHealth?.health?.status === "ok" },
              { label: "Storage", ok: storageOk },
              { label: "Flags", ok: flagdHealth?.connected === true },
              { label: "Cache", ok: cacheHealth?.ok === true },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${integrationsStatus || ketoHealth ? (s.ok ? "bg-emerald-400" : "bg-red-400") : "bg-slate-600 animate-pulse"}`} />
                <span className="text-slate-500 text-[10px]">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Environments */}
          {_s.environments && _s.environments.length > 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500">Environments</h3>
                <button
                  onClick={() => {
                    const slug = `preview-${Date.now().toString(36)}`;
                    const { apiBaseUrl } = _s as any;
                    apiFetch(`${apiBaseUrl || ""}/api/projects/${pd.id}/environments`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: "Preview", slug }),
                    }).then(() => _s.loadProjectDetail?.(pd.id));
                  }}
                  className="truss-btn flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <Plus size={10} weight="regular" /> Add
                </button>
              </div>
              <div className="space-y-1">
                {_s.environments.filter((e: any) => e.status === "active").map((env: any) => (
                  <div key={env.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        env.slug === "production" ? "bg-emerald-400" :
                        env.slug === "staging" ? "bg-amber-400" : "bg-slate-400"
                      }`} />
                      <span
                        className="text-slate-300 cursor-pointer hover:text-slate-100"
                        title="Click to rename"
                        onClick={() => {
                          const newName = window.prompt("Rename environment:", env.name);
                          if (!newName || newName.trim() === env.name) return;
                          const { apiFetch: af, apiBaseUrl: base } = _s as any;
                          (af || fetch)(`${base || ""}/api/environments/${env.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: newName.trim() }),
                          }).then(() => _s.loadProjectDetail?.(pd.id));
                        }}
                      >{env.name}</span>
                      {env.is_default && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[8px] text-slate-500">default</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-slate-600 font-mono">{env.schema_name}</span>
                      {!env.is_default && (
                        <button
                          onClick={() => {
                            if (!confirm(`Delete environment "${env.name}"?`)) return;
                            const { apiFetch, apiBaseUrl } = _s as any;
                            (apiFetch || fetch)(`${apiBaseUrl || ""}/api/environments/${env.id}`, { method: "DELETE" })
                              .then(() => _s.loadProjectDetail?.(pd.id));
                          }}
                          className="truss-btn text-slate-600 hover:text-red-400"
                        >
                          <Trash size={11} weight="regular" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          {consumption && (
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
              {[
                { label: "DB Size", value: fmtBytes(consumption.db_size_bytes) },
                { label: "Storage", value: fmtBytes(consumption.storage_size_bytes) },
                { label: "MAU", value: String(consumption.auth_mau) },
                { label: "Tables", value: String(consumption.table_count) },
                { label: "Branches", value: String(consumption.active_branches) },
                { label: "Queries", value: fmtNum(consumption.total_queries) },
                { label: "Rows", value: fmtNum(consumption.total_rows_processed) },
              ].map((m) => (
                <div key={m.label} className="rounded border border-slate-800 bg-slate-900/40 px-2.5 py-2">
                  <p className="text-[8px] uppercase tracking-widest text-slate-500">{m.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-100">{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Usage bars */}
          {billingUsage && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2.5">
              {[
                { label: "Database", current: billingUsage.current?.db_size_gb, limit: billingUsage.limits?.db_size_gb, unit: "GB" },
                { label: "Storage", current: billingUsage.current?.storage_size_gb, limit: billingUsage.limits?.storage_size_gb, unit: "GB" },
                { label: "MAU", current: billingUsage.current?.auth_mau, limit: billingUsage.limits?.auth_mau, unit: "" },
              ].map((bar) => {
                if (bar.current === undefined || bar.limit === undefined) return null;
                const pct = Math.min(100, bar.limit > 0 ? (bar.current / bar.limit) * 100 : 0);
                return (
                  <div key={bar.label}>
                    <div className="mb-1 flex justify-between text-[10px]">
                      <span className="text-slate-400">{bar.label}</span>
                      <span className="text-slate-500">{bar.current < 1 ? bar.current.toFixed(3) : bar.current.toFixed(1)} / {bar.limit} {bar.unit}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div className={`h-full rounded-full ${pct >= 95 ? "bg-red-400" : pct >= 80 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Query Latency Percentiles */}
          {latencyPercentiles?.enabled && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-widest text-slate-500">Query Latency (pg_stat_statements)</p>
                <button onClick={loadLatencyPercentiles} disabled={isLatencyLoading}
                  className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors">
                  {isLatencyLoading ? "..." : "Refresh"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "p50", value: latencyPercentiles.p50, color: "text-emerald-400" },
                  { label: "p95", value: latencyPercentiles.p95, color: "text-amber-400" },
                  { label: "p99", value: latencyPercentiles.p99, color: "text-red-400" },
                ].map((p) => (
                  <div key={p.label} className="rounded border border-slate-800 bg-slate-950 px-2.5 py-2 text-center">
                    <p className="text-[8px] uppercase tracking-widest text-slate-500">{p.label}</p>
                    <p className={`mt-0.5 text-sm font-semibold ${p.color}`}>
                      {p.value != null ? `${p.value} ms` : "--"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-600">
                <span>{latencyPercentiles.tracked_statements} statements tracked</span>
                <span>avg {latencyPercentiles.avg_ms ?? "--"} ms</span>
              </div>
            </div>
          )}

          {/* Connection info */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">Connection Details</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "Project ID", value: pd.id },
                { label: "Schema", value: pd.schema_name },
                { label: "Storage Bucket", value: pd.bucket_name },
                { label: "API URL", value: pd.api_url },
              ].map((row) => (
                <div key={row.label} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-slate-500">{row.label}</span>
                    <button onClick={() => handleCopyField(row.value || "", row.label)} className={`text-[9px] transition-colors flex items-center gap-0.5 ${copiedField === row.label ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}>
                      {copiedField === row.label ? <><CheckCircle size={10} weight="fill" /> Copied!</> : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 font-mono truncate">{row.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">API Keys</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-amber-400">Anon Key (public)</span>
                  <button onClick={() => handleCopyField(pd.anon_key || "", "Anon Key")} className={`text-[9px] transition-colors flex items-center gap-0.5 ${copiedField === "Anon Key" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}>
                    {copiedField === "Anon Key" ? <><CheckCircle size={10} weight="fill" /> Copied!</> : "Copy"}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-amber-300/80 break-all">{pd.anon_key || "—"}</p>
              </div>
              <div className="rounded-lg border border-red-900/30 bg-red-950/20 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-red-400">Service Role Key (secret)</span>
                  <button onClick={() => handleCopyField(pd.service_role_key || "", "Service Role Key")} className={`text-[9px] transition-colors flex items-center gap-0.5 ${copiedField === "Service Role Key" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}>
                    {copiedField === "Service Role Key" ? <><CheckCircle size={10} weight="fill" /> Copied!</> : "Copy"}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-red-300/80 break-all">{pd.service_role_key || "—"}</p>
              </div>
            </div>
          </div>

          {pd.db_connection_string && (
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">Database</p>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">Connection String</span>
                  <button onClick={() => handleCopyField(pd.db_connection_string, "Connection String")} className={`text-[9px] transition-colors flex items-center gap-0.5 ${copiedField === "Connection String" ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"}`}>
                    {copiedField === "Connection String" ? <><CheckCircle size={10} weight="fill" /> Copied!</> : "Copy"}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-slate-300 break-all">{pd.db_connection_string}</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    /* ── Loading spinner between list and detail ── */
    if (isProjectDetailLoading) {
      return (
        <div className="min-h-0 flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-slate-300" />
            <p className="text-xs text-slate-500">Loading project…</p>
          </div>
        </div>
      );
    }

    /* ── Project list ── */
    return (
      <div className="min-h-0 flex-1 overflow-auto p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Projects</h2>
          <button
            onClick={() => { setShowNewProjectModal(true); setProvisioningStep("input"); setProvisioningError(""); setNewProjectName(""); setNewProjectDescription(""); setShowDescriptionField(false); setNewProjectBucketName("default"); setNewProjectCreateBucket(true); setNewProjectGenerateKeys(true); setProvisionedProject(null); setTerminalLines([]); setProvisioningDone(false); setProvisioningStepProgress(0); }}
            className="truss-btn flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 transition-all"
          >
            <Plus size={11} weight="bold" /> New Project
          </button>
        </div>

        {/* ── Sample App Hero Card ── */}
        <div className={`sample-app-card rounded-xl border p-5 transition-all ${sampleAppStatus?.loaded ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-accent-500/20 bg-gradient-to-r from-accent-500/[0.06] to-slate-900/40"}`}>
          {/* Terminal log view during loading/unloading */}
          {sampleAppTermLine ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">truss deploy</span>
                </div>
                {sampleAppTermDone && sampleAppStatus?.loaded && (
                  <span className="text-[10px] font-semibold text-emerald-400">Ready to explore!</span>
                )}
              </div>
              <div className="sample-app-terminal rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 font-mono text-[12px] leading-relaxed flex items-center min-h-[44px]">
                <span className="text-slate-500 mr-2 select-none">$</span>
                <span className={`${sampleAppError ? "text-red-400" : sampleAppTermDone ? "text-emerald-400 font-semibold" : "text-slate-300"} transition-opacity duration-200`}>
                  {sampleAppTermLine}
                  {!sampleAppTermDone && !sampleAppError && <span className="animate-pulse ml-1 text-accent-400">|</span>}
                </span>
              </div>
              {sampleAppError && (
                <p className="mt-2 text-[10px] text-red-400">{sampleAppError}</p>
              )}
              {sampleAppTermDone && sampleAppStatus?.loaded && (
                <div className="sample-app-checklist mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {([
                    { icon: <Database size={13} weight="regular" />, label: `Database: ${sampleAppStatus.tables} tables, ${sampleAppStatus.totalRows ?? 0} rows`, ok: true },
                    { icon: <HardDrives size={13} weight="regular" />, label: sampleAppStatus.storageBucket?.exists ? `Storage: ${sampleAppStatus.storageBucket.objects} objects` : "Storage: no bucket", ok: sampleAppStatus.storageBucket?.exists ?? false, na: sampleAppStatus.storageBucket === null },
                    { icon: <Users size={13} weight="regular" />, label: sampleAppStatus.authIdentities != null ? `Auth: ${sampleAppStatus.authIdentities} identities` : "Auth: unavailable", ok: sampleAppStatus.authIdentities != null && sampleAppStatus.authIdentities > 0, na: sampleAppStatus.authIdentities === null },
                    { icon: <Shield size={13} weight="regular" />, label: sampleAppStatus.ketoTuples != null ? `AuthZ: ${sampleAppStatus.ketoTuples} tuples` : "AuthZ: unavailable", ok: sampleAppStatus.ketoTuples != null && sampleAppStatus.ketoTuples !== 0, na: sampleAppStatus.ketoTuples === null },
                    { icon: <Broadcast size={13} weight="regular" />, label: `Realtime: ${sampleAppStatus.realtimeCount} subscription${sampleAppStatus.realtimeCount !== 1 ? "s" : ""}`, ok: (sampleAppStatus.realtimeCount ?? 0) > 0 },
                    { icon: <Waveform size={13} weight="regular" />, label: `Webhooks: ${sampleAppStatus.webhookCount} configured`, ok: (sampleAppStatus.webhookCount ?? 0) > 0 },
                    { icon: <MagnifyingGlass size={13} weight="regular" />, label: "Full-Text Search: configured", ok: sampleAppStatus.ftsConfigured ?? false },
                    { icon: <LockKey size={13} weight="regular" />, label: `RLS: ${sampleAppStatus.rlsPolicies} ${sampleAppStatus.rlsPolicies === 1 ? "policy" : "policies"} active`, ok: (sampleAppStatus.rlsPolicies ?? 0) > 0 },

                    { icon: <Key size={13} weight="regular" />, label: `API Keys: ${sampleAppStatus.apiKeyCount}`, ok: (sampleAppStatus.apiKeyCount ?? 0) > 0 },
                  ] as { icon: React.ReactNode; label: string; ok: boolean; na?: boolean }[]).map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span className={f.na ? "text-slate-600" : f.ok ? "text-emerald-400" : "text-slate-600"}>
                        {f.icon}
                      </span>
                      <span className={`text-[10px] ${f.na ? "text-slate-600" : f.ok ? "text-slate-300" : "text-slate-600"}`}>
                        {f.label}
                      </span>
                      {f.ok && <CheckCircle size={10} weight="regular" className="text-emerald-400 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
              {sampleAppTermDone && sampleAppStatus?.loaded && (
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={unloadSampleApp}
                    disabled={sampleAppLoading}
                    className="sample-app-unload-btn truss-btn flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all disabled:opacity-50"
                  >
                    <Trash size={12} weight="regular" />
                    Unload
                  </button>
                </div>
              )}
            </div>
          ) : sampleAppStatus?.loaded ? (
            /* Loaded state -- compact summary with checklist */
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <Flask size={20} weight="regular" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">Sample App</span>
                      <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {sampleAppStatus.tables} tables &middot; {sampleAppStatus.totalRows ?? (Object.values(sampleAppStatus.rows || {}) as number[]).reduce((a: number, b: number) => a + b, 0)} rows in sample_app schema
                    </p>
                  </div>
                </div>
                <button
                  onClick={unloadSampleApp}
                  disabled={sampleAppLoading}
                  className="sample-app-unload-btn truss-btn flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all disabled:opacity-50"
                >
                  <Trash size={12} weight="regular" />
                  Unload
                </button>
              </div>
              {sampleAppError && (
                <p className="mt-2 text-[10px] text-red-400">{sampleAppError}</p>
              )}
              <div className="sample-app-checklist mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                {([
                  { icon: <Database size={13} weight="regular" />, label: `Database: ${sampleAppStatus.tables} tables, ${sampleAppStatus.totalRows ?? 0} rows`, ok: true },
                  { icon: <HardDrives size={13} weight="regular" />, label: sampleAppStatus.storageBucket?.exists ? `Storage: ${sampleAppStatus.storageBucket.objects} objects` : "Storage: no bucket", ok: sampleAppStatus.storageBucket?.exists ?? false, na: sampleAppStatus.storageBucket === null },
                  { icon: <Users size={13} weight="regular" />, label: sampleAppStatus.authIdentities != null ? `Auth: ${sampleAppStatus.authIdentities} identities` : "Auth: unavailable", ok: sampleAppStatus.authIdentities != null && sampleAppStatus.authIdentities > 0, na: sampleAppStatus.authIdentities === null },
                  { icon: <Shield size={13} weight="regular" />, label: sampleAppStatus.ketoTuples != null ? `AuthZ: ${sampleAppStatus.ketoTuples} tuples` : "AuthZ: unavailable", ok: sampleAppStatus.ketoTuples != null && sampleAppStatus.ketoTuples !== 0, na: sampleAppStatus.ketoTuples === null },
                  { icon: <Broadcast size={13} weight="regular" />, label: `Realtime: ${sampleAppStatus.realtimeCount} subscription${sampleAppStatus.realtimeCount !== 1 ? "s" : ""}`, ok: (sampleAppStatus.realtimeCount ?? 0) > 0 },
                  { icon: <Waveform size={13} weight="regular" />, label: `Webhooks: ${sampleAppStatus.webhookCount} configured`, ok: (sampleAppStatus.webhookCount ?? 0) > 0 },
                  { icon: <MagnifyingGlass size={13} weight="regular" />, label: "Full-Text Search: configured", ok: sampleAppStatus.ftsConfigured ?? false },
                  { icon: <LockKey size={13} weight="regular" />, label: `RLS: ${sampleAppStatus.rlsPolicies} ${sampleAppStatus.rlsPolicies === 1 ? "policy" : "policies"} active`, ok: (sampleAppStatus.rlsPolicies ?? 0) > 0 },
                  { icon: <Key size={13} weight="regular" />, label: `API Keys: ${sampleAppStatus.apiKeyCount}`, ok: (sampleAppStatus.apiKeyCount ?? 0) > 0 },
                ] as { icon: React.ReactNode; label: string; ok: boolean; na?: boolean }[]).map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 py-0.5">
                    <span className={f.na ? "text-slate-600" : f.ok ? "text-emerald-400" : "text-slate-600"}>
                      {f.icon}
                    </span>
                    <span className={`text-[10px] ${f.na ? "text-slate-600" : f.ok ? "text-slate-300" : "text-slate-600"}`}>
                      {f.label}
                    </span>
                    {f.ok && <CheckCircle size={10} weight="regular" className="text-emerald-400 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Unloaded state -- hero CTA */
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 border border-accent-500/20 text-accent-400">
                <Flask size={24} weight="regular" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-slate-100">Try the Sample App</span>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">
                  Populate your database with a sample blog app -- tables, users, RLS policies, webhooks, search, and more. The fastest way to explore everything Truss can do.
                </p>
                {sampleAppError && (
                  <p className="mt-1 text-[10px] text-red-400">{sampleAppError}</p>
                )}
              </div>
              <button
                onClick={loadSampleApp}
                disabled={sampleAppLoading}
                className="truss-btn flex items-center gap-2 rounded-xl border border-accent-500/30 bg-accent-500/15 px-4 py-2.5 text-xs font-semibold text-accent-300 hover:bg-accent-500/25 hover:border-accent-500/50 transition-all disabled:opacity-50 shrink-0 shadow-[0_0_20px_-8px_rgba(159,18,57,0.3)]"
              >
                <Rocket size={14} weight="regular" />
                Load Sample App
              </button>
            </div>
          )}
        </div>

        {/* ── Onboarding welcome card ── */}
        {projectsLoaded && projects.length === 0 && !localStorage.getItem("truss.onboarding.seen") && (
          <div className="rounded-xl border border-accent-500/20 bg-accent-500/[0.04] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">Welcome to Truss!</h3>
            <p className="text-xs text-slate-400 leading-relaxed">Get started in a few steps:</p>
            <ul className="space-y-1.5 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[9px] font-bold text-accent-300">1</span>Create your first project</li>
              <li className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[9px] font-bold text-accent-300">2</span>Explore the SQL workbench</li>
              <li className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[9px] font-bold text-accent-300">3</span>Set up authentication</li>
              <li className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-[9px] font-bold text-accent-300">4</span>Configure storage</li>
            </ul>
            <button
              onClick={() => { localStorage.setItem("truss.onboarding.seen", "1"); setShowNewProjectModal(true); setProvisioningStep("input"); setProvisioningError(""); setNewProjectName(""); }}
              className="truss-btn flex items-center gap-2 rounded-lg border border-accent-500/30 bg-accent-500/15 px-4 py-2 text-xs font-semibold text-accent-300 hover:bg-accent-500/25 transition-all"
            >
              Get Started
            </button>
          </div>
        )}

        {!projectsLoaded ? (
          <div className="space-y-1.5">
            {[1,2,3].map(i => (
              <div key={i} className="skeleton-row rounded-lg border border-slate-800 bg-slate-900/40 px-3">
                <div className="skeleton skeleton-circle" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton skeleton-text" />
                  <div className="skeleton skeleton-text-sm" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">No projects yet. Click "New Project" above to get started.</p>
        ) : (
          <div className="space-y-1.5">
            {projects.map((proj: any) => {
              const isActive = activeProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  onClick={() => { setActiveProjectId(proj.id); loadProjectDetail(proj.id); }}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${isActive ? "border-slate-600 bg-slate-800/60" : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
                    <FolderSimple size={15} weight="regular" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100 truncate">{proj.name}</span>
                      <span className={`flex items-center gap-1 rounded-full border px-1.5 py-px text-[8px] font-medium ${proj.status === "active" ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-400" : "border-amber-500/30 bg-amber-500/8 text-amber-400"}`}>
                        <span className={`h-1 w-1 rounded-full ${proj.status === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                        {proj.status === "active" ? "Live" : "Pending"}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{proj.region} · <span className="font-mono">{proj.schema_name}</span></p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 16 16" className="text-slate-600 shrink-0"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              );
            })}
          </div>
        )}

      </div>
    );
  }

  if (homeView === "hierarchy") {
    return <HierarchyTree _s={_s} />;
  }

  /* homeView === "stack" — flat-pack: all features always active */
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-100">Your Stack</h2>
      <p className="text-xs text-slate-500">All features are included in every plan. Resource limits are managed via billing.</p>
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="divide-y divide-slate-800/60">
          {([
            { key: "database", label: "Database", desc: "Postgres — SQL, branching, backups, PITR", icon: <Database size={16} weight="regular" /> },
            { key: "authn", label: "Authentication", desc: "Ory Kratos — users, sessions, social login", icon: <UserList size={16} weight="regular" /> },
            { key: "authz", label: "Permissions", desc: "Ory Keto — permissions, roles, RBAC", icon: <ShieldCheck size={16} weight="regular" /> },
            { key: "storage", label: "Storage", desc: "MinIO — S3-compatible file storage", icon: <PaintBucket size={16} weight="regular" /> },
            { key: "edge", label: "API", desc: "SQL-over-HTTP, REST API, serverless queries", icon: <Lightning size={16} weight="regular" /> },
            { key: "realtime", label: "Realtime", desc: "WAL-based WebSocket subscriptions", icon: <Broadcast size={16} weight="regular" /> },
            { key: "search", label: "Full-Text Search", desc: "Postgres FTS — tsvector, ranking, highlights", icon: <MagnifyingGlass size={16} weight="regular" /> },
            { key: "webhooks", label: "Webhooks", desc: "HTTP callbacks on row changes — free Zapier", icon: <Waveform size={16} weight="regular" /> },
            { key: "oauth2", label: "OAuth2 Server", desc: "Ory Hydra — issue tokens, client apps", icon: <LockKey size={16} weight="regular" /> },
            { key: "gateway", label: "Routes", desc: "Ory Oathkeeper — route auth, zero-trust", icon: <Plug size={16} weight="regular" /> },
            { key: "flags", label: "Feature Flags", desc: "flagd (CNCF) — toggles, rollouts, A/B variants", icon: <Flag size={16} weight="regular" /> },
            { key: "cache", label: "Cache / KV", desc: "Valkey — Redis-compatible cache & key/value store", icon: <Stack size={16} weight="regular" /> },
          ] as const).map((mod) => {
              // Compute health status: true = healthy, false = down, null = loading
              let healthy: boolean | null = null;
              switch (mod.key) {
                case "database":
                case "edge":
                case "realtime":
                case "search":
                case "webhooks":
                  healthy = true; // same-server services, always available if dashboard loaded
                  break;
                case "authn":
                  healthy = integrationsStatus ? (integrationsStatus.auth?.reachable === true || integrationsStatus.auth?.admin?.reachable === true) : null;
                  break;
                case "authz":
                  healthy = ketoHealth ? (ketoHealth.read?.status === "ok") : null;
                  break;
                case "storage":
                  healthy = integrationsStatus ? (integrationsStatus.storage?.s3?.reachable === true || integrationsStatus.storage?.console?.reachable === true) : null;
                  break;
                case "oauth2":
                  healthy = hydraHealth ? (hydraHealth.health?.status === "ok") : null;
                  break;
                case "gateway":
                  healthy = oathkeeperHealth ? (oathkeeperHealth.health?.status === "ok") : null;
                  break;
                case "flags":
                  if (flagdHealth?.connected === true) healthy = true;
                  else if (flagdHealth && !flagdHealth.connected) healthy = false;
                  else healthy = null;
                  break;
                case "cache":
                  if (cacheHealth?.ok === true) healthy = true;
                  else if (cacheHealth && cacheHealth.ok !== true) healthy = false;
                  else healthy = null;
                  break;
              }
              return (
              <div key={mod.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${healthy === false ? "bg-slate-500/10 text-slate-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {mod.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-slate-200">{mod.label}</span>
                  <p className="truncate text-[10px] text-slate-500">{mod.desc}</p>
                </div>
                {healthy === true
                  ? <CheckCircle size={16} weight="fill" className="shrink-0 text-emerald-400" />
                  : healthy === false
                    ? <span className="shrink-0 text-[10px] text-slate-500 font-medium">Not connected</span>
                    : <span className="shrink-0 h-3 w-3 rounded-full bg-slate-600 animate-pulse" />
                }
              </div>
              );
          })}
        </div>
      </div>
    </div>
  );
}
