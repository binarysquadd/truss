// RlsDebugger.tsx — RLS policy debugger (extracted from DatabasePanel.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  MagnifyingGlass,
  Play,
  Prohibit,
  Shield,
  ShieldCheck,
  Table,
  Warning,
} from "@phosphor-icons/react";
import { apiFetch } from "../../types";

type RlsPolicy = {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string[] | string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
};

type RlsTable = {
  schemaname: string;
  tablename: string;
  rowsecurity: boolean;
  forcerowsecurity: boolean;
};

type RlsTestResult = {
  success: boolean;
  rows: Record<string, unknown>[];
  columns: string[];
  row_count: number;
  duration_ms: number;
  policies_on_tables: RlsPolicy[];
  error: string | null;
  is_rls_error?: boolean;
};

type MatrixEntry = {
  allowed: boolean;
  reason: string;
  policies?: string[];
};

type MatrixRole = {
  role: string;
  is_superuser: boolean;
  can_login: boolean;
  access: Record<string, MatrixEntry>;
};

type RlsMatrixResult = {
  schema: string;
  table: string;
  rls_enabled: boolean;
  force_rls: boolean;
  policies: RlsPolicy[];
  matrix: MatrixRole[];
};

type RlsDebuggerTab = "policies" | "debug" | "matrix";

export function RlsDebugger({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [tab, setTab] = useState<RlsDebuggerTab>("policies");
  const [policies, setPolicies] = useState<RlsPolicy[]>([]);
  const [tables, setTables] = useState<RlsTable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [policiesLoaded, setPoliciesLoaded] = useState(false);

  // Policy browser state
  const [policySearch, setPolicySearch] = useState("");
  const [policyFilterCmd, setPolicyFilterCmd] = useState<string>("all");

  // Debug playground state
  const [debugRole, setDebugRole] = useState("");
  const [debugQuery, setDebugQuery] = useState("SELECT * FROM public.your_table LIMIT 10;");
  const [debugResult, setDebugResult] = useState<RlsTestResult | null>(null);
  const [isDebugging, setIsDebugging] = useState(false);

  // Matrix state
  const [matrixSchema, setMatrixSchema] = useState("public");
  const [matrixTable, setMatrixTable] = useState("");
  const [matrixResult, setMatrixResult] = useState<RlsMatrixResult | null>(null);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);

  const loadPoliciesAndTables = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const [pRes, tRes] = await Promise.all([
        apiFetch(`${apiBaseUrl}/api/rls/policies`),
        apiFetch(`${apiBaseUrl}/api/rls/tables`),
      ]);
      if (pRes.ok) {
        const pData = await pRes.json();
        setPolicies(pData.policies || []);
      }
      if (tRes.ok) {
        const tData = await tRes.json();
        setTables(tData.tables || []);
      }
      setPoliciesLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load RLS data.");
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!policiesLoaded) {
      loadPoliciesAndTables();
    }
  }, [policiesLoaded, loadPoliciesAndTables]);

  const runDebugTest = async () => {
    if (!debugRole || !debugQuery) return;
    setIsDebugging(true);
    setDebugResult(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/rls/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: debugRole, query: debugQuery }),
      });
      const data = await res.json();
      setDebugResult(data);
    } catch (e) {
      setDebugResult({
        success: false, rows: [], columns: [], row_count: 0, duration_ms: 0,
        policies_on_tables: [], error: e instanceof Error ? e.message : "Request failed.",
      });
    } finally {
      setIsDebugging(false);
    }
  };

  const loadMatrix = async () => {
    if (!matrixTable) return;
    setIsMatrixLoading(true);
    setMatrixResult(null);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/rls/matrix/${encodeURIComponent(matrixSchema)}/${encodeURIComponent(matrixTable)}`);
      if (res.ok) {
        const data = await res.json();
        setMatrixResult(data);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to load access matrix.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access matrix.");
    } finally {
      setIsMatrixLoading(false);
    }
  };

  const parseRoles = (roles: string[] | string): string[] => {
    if (Array.isArray(roles)) return roles;
    return String(roles ?? "").replace(/^\{|\}$/g, "").split(",").filter(Boolean);
  };

  // Group policies by table for the browser
  const groupedPolicies: Record<string, RlsPolicy[]> = {};
  const filteredPolicies = policies.filter((p) => {
    if (policyFilterCmd !== "all" && p.cmd !== policyFilterCmd && p.cmd !== "ALL") return false;
    if (policySearch) {
      const s = policySearch.toLowerCase();
      return (
        p.policyname.toLowerCase().includes(s) ||
        p.tablename.toLowerCase().includes(s) ||
        p.schemaname.toLowerCase().includes(s) ||
        parseRoles(p.roles).some((r) => r.toLowerCase().includes(s))
      );
    }
    return true;
  });
  for (const p of filteredPolicies) {
    const key = `${p.schemaname}.${p.tablename}`;
    if (!groupedPolicies[key]) groupedPolicies[key] = [];
    groupedPolicies[key].push(p);
  }

  // Tables with RLS enabled
  const rlsEnabledTables = tables.filter((t) => t.rowsecurity);
  const rlsDisabledTables = tables.filter((t) => !t.rowsecurity);

  const tabClasses = (t: RlsDebuggerTab) =>
    `rounded-t border-b-2 px-4 py-2 text-xs font-medium transition-colors ${
      tab === t
        ? "border-accent-500 text-accent-300"
        : "border-transparent text-slate-400 hover:text-slate-200"
    }`;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} weight="regular" className="text-accent-400" />
          <h2 className="text-sm font-medium text-slate-100">RLS Debugger</h2>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{policies.length} policies</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{rlsEnabledTables.length}/{tables.length} tables with RLS</span>
        </div>
        <button
          onClick={loadPoliciesAndTables}
          disabled={isLoading}
          className="truss-btn rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          {isLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
          Refresh
        </button>
      </div>

      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-slate-800">
        <button className={tabClasses("policies")} onClick={() => setTab("policies")}>Policies</button>
        <button className={tabClasses("debug")} onClick={() => setTab("debug")}>Debug</button>
        <button className={tabClasses("matrix")} onClick={() => setTab("matrix")}>Access Matrix</button>
      </div>

      {/* ── Policies Tab ── */}
      {tab === "policies" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search policies, tables, roles..."
                value={policySearch}
                onChange={(e) => setPolicySearch(e.target.value)}
                className="w-full rounded border border-slate-700 bg-slate-900/60 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
              />
            </div>
            <select
              value={policyFilterCmd}
              onChange={(e) => setPolicyFilterCmd(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
            >
              <option value="all">All Commands</option>
              <option value="SELECT">SELECT</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>

          {/* RLS status summary */}
          {rlsDisabledTables.length > 0 && (
            <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-300">
              <Warning size={13} weight="regular" className="mr-1 inline" />
              {rlsDisabledTables.length} table{rlsDisabledTables.length !== 1 ? "s" : ""} without RLS:{" "}
              <span className="text-amber-400/80">
                {rlsDisabledTables.slice(0, 8).map((t) => `${t.schemaname}.${t.tablename}`).join(", ")}
                {rlsDisabledTables.length > 8 ? ` +${rlsDisabledTables.length - 8} more` : ""}
              </span>
            </div>
          )}

          {/* Grouped policy list */}
          {Object.keys(groupedPolicies).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10 text-center">
              <Shield size={24} weight="regular" className="mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No RLS policies found{policySearch ? " matching your search" : ""}.</p>
              <p className="mt-1 text-xs text-slate-600">Create policies using CREATE POLICY in the SQL Editor.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(groupedPolicies).map(([tableKey, tablePolicies]) => {
                const tableInfo = tables.find((t) => `${t.schemaname}.${t.tablename}` === tableKey);
                return (
                  <div key={tableKey} className="rounded border border-slate-800 bg-slate-900/40 overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/40 px-4 py-2">
                      <Table size={13} weight="regular" className="text-slate-500" />
                      <code className="text-xs font-medium text-slate-200">{tableKey}</code>
                      {tableInfo?.rowsecurity ? (
                        <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">RLS ON</span>
                      ) : (
                        <span className="rounded bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-300">RLS OFF</span>
                      )}
                      {tableInfo?.forcerowsecurity && (
                        <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">FORCE</span>
                      )}
                      <span className="ml-auto text-[10px] text-slate-500">{tablePolicies.length} {tablePolicies.length === 1 ? "policy" : "policies"}</span>
                    </div>
                    <div className="divide-y divide-slate-800/60">
                      {tablePolicies.map((p) => (
                        <div key={p.policyname} className="px-4 py-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <code className="text-xs font-medium text-accent-300">{p.policyname}</code>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.permissive === "PERMISSIVE" ? "bg-accent-500/10 border border-accent-500/30 text-accent-300" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                              {p.permissive}
                            </span>
                            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{p.cmd}</span>
                            {parseRoles(p.roles).map((role) => (
                              <span key={role} className="rounded bg-violet-500/10 border border-violet-500/30 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">{role}</span>
                            ))}
                          </div>
                          {p.qual && (
                            <p className="text-[11px]">
                              <span className="text-slate-500">USING </span>
                              <code className="text-slate-400">{p.qual}</code>
                            </p>
                          )}
                          {p.with_check && (
                            <p className="mt-1 text-[11px]">
                              <span className="text-slate-500">WITH CHECK </span>
                              <code className="text-slate-400">{p.with_check}</code>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Debug Tab ── */}
      {tab === "debug" && (
        <div className="space-y-4">
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300">Test a Query as a Role</p>
            <p className="text-[11px] text-slate-500">Execute a read-only query as a specific PostgreSQL role to see what RLS policies allow or block. The query runs inside a rolled-back transaction.</p>

            {/* Role + Query inputs */}
            <div className="flex gap-3">
              <div className="w-48 shrink-0">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Role</label>
                <input
                  type="text"
                  placeholder="e.g. anon, authenticated"
                  value={debugRole}
                  onChange={(e) => setDebugRole(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">SQL Query (SELECT only)</label>
                <textarea
                  value={debugQuery}
                  onChange={(e) => setDebugQuery(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none resize-none"
                  placeholder="SELECT * FROM public.your_table LIMIT 10;"
                />
              </div>
            </div>

            <button
              onClick={runDebugTest}
              disabled={isDebugging || !debugRole || !debugQuery}
              className="rounded border border-accent-600 bg-accent-600/20 px-4 py-2 text-xs font-medium text-accent-200 hover:bg-accent-600/30 disabled:opacity-50"
            >
              {isDebugging ? <span className="truss-spinner mr-1.5 inline-block" /> : <Play size={13} weight="regular" className="mr-1 inline" />}
              Test Query
            </button>
          </div>

          {/* Results */}
          {debugResult && (
            <div className="space-y-3">
              {/* Status banner */}
              <div className={`rounded border p-3 text-xs ${debugResult.success ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300" : "border-red-500/30 bg-red-950/20 text-red-300"}`}>
                {debugResult.success ? (
                  <>
                    <CheckCircle size={13} weight="regular" className="mr-1 inline" />
                    Query succeeded as <code className="font-medium">{debugRole}</code> — {debugResult.row_count} row{debugResult.row_count !== 1 ? "s" : ""} returned in {debugResult.duration_ms}ms
                  </>
                ) : (
                  <>
                    <Prohibit size={13} weight="regular" className="mr-1 inline" />
                    Query failed as <code className="font-medium">{debugRole}</code>: {debugResult.error}
                    {debugResult.is_rls_error && (
                      <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium">RLS BLOCKED</span>
                    )}
                  </>
                )}
              </div>

              {/* Result rows */}
              {debugResult.success && debugResult.rows.length > 0 && (
                <div className="overflow-auto rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70">
                      <tr>
                        {debugResult.columns.map((col) => (
                          <th key={col} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {debugResult.rows.slice(0, 100).map((row, i) => (
                        <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                          {debugResult.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-slate-300 font-mono max-w-[300px] truncate">
                              {row[col] === null ? <span className="text-slate-600 italic">null</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {debugResult.row_count > 100 && (
                    <p className="border-t border-slate-800/60 px-3 py-2 text-[10px] text-slate-500">Showing 100 of {debugResult.row_count} rows</p>
                  )}
                </div>
              )}

              {/* Related policies */}
              {debugResult.policies_on_tables.length > 0 && (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">
                    <Shield size={13} weight="regular" className="mr-1 inline" />
                    Related Policies ({debugResult.policies_on_tables.length})
                  </p>
                  <div className="space-y-1.5">
                    {debugResult.policies_on_tables.map((p, i) => (
                      <div key={i} className="rounded border border-slate-800/60 bg-slate-950/30 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <code className="font-medium text-accent-300">{p.policyname}</code>
                          <span className="text-slate-600">on</span>
                          <code className="text-slate-300">{p.schemaname}.{p.tablename}</code>
                          <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[10px] text-slate-400">{p.cmd}</span>
                          <span className={`rounded px-1 py-0.5 text-[10px] ${p.permissive === "PERMISSIVE" ? "bg-accent-500/10 text-accent-300" : "bg-red-500/10 text-red-300"}`}>{p.permissive}</span>
                          {parseRoles(p.roles).map((r) => (
                            <span key={r} className="rounded bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-300">{r}</span>
                          ))}
                        </div>
                        {p.qual && <p className="mt-1 text-[10px] text-slate-500">USING: <code className="text-slate-400">{p.qual}</code></p>}
                        {p.with_check && <p className="mt-0.5 text-[10px] text-slate-500">WITH CHECK: <code className="text-slate-400">{p.with_check}</code></p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Access Matrix Tab ── */}
      {tab === "matrix" && (
        <div className="space-y-4">
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300">Policy Impact Analyzer</p>
            <p className="text-[11px] text-slate-500">Select a table to see which roles have access via which policies, broken down by operation.</p>

            <div className="flex items-end gap-3">
              <div className="w-40">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Schema</label>
                <select
                  value={matrixSchema}
                  onChange={(e) => setMatrixSchema(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2 text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
                >
                  {Array.from(new Set(tables.map((t) => t.schemaname))).sort().map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Table</label>
                <select
                  value={matrixTable}
                  onChange={(e) => setMatrixTable(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2 text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
                >
                  <option value="">Select a table...</option>
                  {tables.filter((t) => t.schemaname === matrixSchema).map((t) => (
                    <option key={t.tablename} value={t.tablename}>{t.tablename}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={loadMatrix}
                disabled={isMatrixLoading || !matrixTable}
                className="rounded border border-accent-600 bg-accent-600/20 px-4 py-2 text-xs font-medium text-accent-200 hover:bg-accent-600/30 disabled:opacity-50"
              >
                {isMatrixLoading ? <span className="truss-spinner mr-1.5 inline-block" /> : null}
                Analyze
              </button>
            </div>
          </div>

          {matrixResult && (
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center gap-2 text-xs">
                <code className="font-medium text-slate-200">{matrixResult.schema}.{matrixResult.table}</code>
                {matrixResult.rls_enabled ? (
                  <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">RLS ON</span>
                ) : (
                  <span className="rounded bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-medium text-red-300">RLS OFF</span>
                )}
                {matrixResult.force_rls && (
                  <span className="rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">FORCE RLS</span>
                )}
                <span className="text-slate-500">{matrixResult.policies.length} policies</span>
              </div>

              {/* Matrix grid */}
              <div className="overflow-auto rounded border border-slate-800">
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-950/70">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500 sticky left-0 bg-slate-950/70">Role</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-slate-500">SELECT</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-slate-500">INSERT</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-slate-500">UPDATE</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-slate-500">DELETE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixResult.matrix.map((entry) => (
                      <tr key={entry.role} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                        <td className="px-3 py-2 sticky left-0 bg-slate-900/80">
                          <div className="flex items-center gap-1.5">
                            <code className="font-medium text-slate-200">{entry.role}</code>
                            {entry.is_superuser && <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-300">SU</span>}
                            {entry.can_login && <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[9px] text-slate-400">LOGIN</span>}
                          </div>
                        </td>
                        {["SELECT", "INSERT", "UPDATE", "DELETE"].map((cmd) => {
                          const a = entry.access[cmd];
                          if (!a) return <td key={cmd} className="px-3 py-2 text-center text-slate-600">?</td>;
                          return (
                            <td key={cmd} className="px-3 py-2 text-center" title={a.reason + (a.policies ? `: ${a.policies.join(", ")}` : "")}>
                              {a.allowed ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircle size={14} weight="regular" className="text-emerald-400" />
                                  {a.reason === "superuser" && <span className="text-[9px] text-amber-400">SU</span>}
                                  {a.reason === "grant" && <span className="text-[9px] text-slate-500">grant</span>}
                                  {a.reason === "policy" && <span className="text-[9px] text-accent-400">{a.policies?.length}p</span>}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Prohibit size={14} weight="regular" className="text-red-400" />
                                  <span className="text-[9px] text-slate-500">
                                    {a.reason === "no_grant" ? "no grant" : "no policy"}
                                  </span>
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Policy details for this table */}
              {matrixResult.policies.length > 0 && (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">Policies on {matrixResult.schema}.{matrixResult.table}</p>
                  <div className="space-y-1.5">
                    {matrixResult.policies.map((p, i) => (
                      <div key={i} className="rounded border border-slate-800/60 bg-slate-950/30 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <code className="font-medium text-accent-300">{p.policyname}</code>
                          <span className={`rounded px-1 py-0.5 text-[10px] ${p.permissive === "PERMISSIVE" ? "bg-accent-500/10 text-accent-300" : "bg-red-500/10 text-red-300"}`}>{p.permissive}</span>
                          <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[10px] text-slate-400">{p.cmd}</span>
                          {parseRoles(p.roles).map((r) => (
                            <span key={r} className="rounded bg-violet-500/10 px-1 py-0.5 text-[10px] text-violet-300">{r}</span>
                          ))}
                        </div>
                        {p.qual && <p className="mt-1 text-[10px] text-slate-500">USING: <code className="text-slate-400">{p.qual}</code></p>}
                        {p.with_check && <p className="mt-0.5 text-[10px] text-slate-500">WITH CHECK: <code className="text-slate-400">{p.with_check}</code></p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
