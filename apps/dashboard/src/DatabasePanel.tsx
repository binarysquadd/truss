// DatabasePanel.tsx — Database module rendering (extracted from App.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import { LazyEditor as Editor } from "./LazyEditor";
import { handleEditorWillMount, trussEditorOptions } from "./editorConfig";
import {
  ArrowsClockwise,
  MagnifyingGlass,
  ChartLine,
  CheckCircle,
  ClipboardText,
  Warning,
  Code,
  ClockCounterClockwise,
  Cpu,
  Cube,
  Database,
  GearSix,
  HardDrives,
  Lightning,
  LinkSimple,
  LockKey,
  Pause,
  Play,
  PlugsConnected,
  Plus,
  Plug,
  Prohibit,
  Sparkle,
  Table,
  Trash,
  User,
  Users,
  Waveform,
  X,
  Eye,
  Stamp,
  ArrowsLeftRight,
} from "@phosphor-icons/react";
// @xyflow/react components now used via InteractiveErd from types.tsx
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/light";
import { atomOneDark, atomOneLight } from "react-syntax-highlighter/dist/esm/styles/hljs";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import go from "react-syntax-highlighter/dist/esm/languages/hljs/go";
import java from "react-syntax-highlighter/dist/esm/languages/hljs/java";
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("java", java);
import {
  DATABASE_NAV_SECTIONS,
  databaseIcon, formatBytes,
  ERD_NODE_TYPES, InteractiveErd, apiFetch,
} from "./types";
import { VectorDocsCard } from "./panels/db/VectorDocsCard";
import { RolesManager } from "./panels/db/RolesManager";
import { RlsDebugger } from "./panels/db/RlsDebugger";
import { FdwPanel } from "./panels/db/FdwPanel";

// RolesManager, RlsDebugger, FdwPanel, VectorDocsCard extracted to panels/db/
// (see imports above)


/* ── ExtensionsView (self-contained hook-based component) ───────────── */
function ExtensionsView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [extensions, setExtensions] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("All");
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = React.useState<string | null>(null);
  const loadedRef = React.useRef(false);

  const loadExtensions = React.useCallback(() => {
    setLoading(true);
    apiFetch(`${apiBaseUrl}/api/extensions`)
      .then(r => r.json())
      .then(d => { setExtensions(d.extensions || []); setError(""); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiBaseUrl]);

  React.useEffect(() => {
    if (!loadedRef.current) { loadedRef.current = true; loadExtensions(); }
  }, [loadExtensions]);

  const toggle = async (name: string, cascade = false) => {
    setToggling(name);
    setConfirmDisable(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/extensions/${name}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cascade }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.dependencyError) {
          setConfirmDisable(name);
        } else {
          setError(d.error || "Failed to toggle extension");
        }
      } else {
        loadExtensions();
      }
    } catch (e: any) { setError(e.message); }
    finally { setToggling(null); }
  };

  const categories = ["All", ...Array.from(new Set(extensions.map(e => e.category).filter(Boolean)))];
  const filtered = extensions.filter(e => {
    if (category !== "All" && e.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.name.toLowerCase().includes(q) && !(e.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const enabledCount = extensions.filter(e => e.enabled).length;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-slate-100">Extensions</h2>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            {enabledCount} of {extensions.length} enabled
          </span>
        </div>
        <button onClick={loadExtensions} disabled={loading}
          className="truss-btn rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          {loading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 rounded border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-200"><X size={13} /></button>
        </div>
      )}

      {/* Search bar */}
      <div className="mb-3 relative">
        <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search extensions..."
          className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {/* Category pills */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              category === cat
                ? "border-accent-500/40 bg-accent-500/10 text-accent-300"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
            }`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="truss-spinner mr-2" />
          <span className="text-xs text-slate-500">Loading extensions...</span>
        </div>
      )}

      {/* Extension cards grid */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10 text-center">
          <p className="text-sm text-slate-500">No extensions found{search ? " matching your search" : ""}.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map(ext => (
            <div key={ext.name} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <code className="text-sm font-semibold text-accent-300 truncate">{ext.name}</code>
                  {ext.version && (
                    <span className="inline-flex shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">
                      v{ext.version}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => ext.enabled ? setConfirmDisable(ext.name) : toggle(ext.name)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${ext.enabled ? "bg-emerald-500" : "bg-slate-700"}`}
                  disabled={toggling === ext.name}
                  title={ext.enabled ? "Disable" : "Enable"}>
                  {toggling === ext.name
                    ? <span className="truss-spinner absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: 10, height: 10 }} />
                    : <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${ext.enabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {ext.category && (
                  <span className="inline-flex rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                    {ext.category}
                  </span>
                )}
                {ext.schema && (
                  <span className="text-[10px] text-slate-500">schema: <span className="text-slate-400">{ext.schema}</span></span>
                )}
              </div>
              {ext.description && (
                <p className="text-xs text-slate-400 leading-relaxed">{ext.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirm disable modal */}
      {confirmDisable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 max-w-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-100">Disable {confirmDisable}?</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Other database objects may depend on this extension. Disabling with CASCADE will drop all dependent objects (views, columns, functions, etc.).
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDisable(null)}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                Cancel
              </button>
              <button onClick={() => toggle(confirmDisable)}
                className="truss-btn rounded border border-amber-600/40 bg-amber-600/10 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-600/20">
                Disable
              </button>
              <button onClick={() => toggle(confirmDisable, true)}
                className="truss-btn rounded border border-red-600/40 bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700">
                Force Disable (CASCADE)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function renderDatabaseMain(s: any): React.JSX.Element | null {
  const {
    activeTab, activeTabId, activeTableBrowserTab, activeTableBrowserTabId, allSavedQueryTags,
    apiBaseUrl, autovacuumData, autovacuumError, backupError, backupSchedule, backups, billingRestrictions,
    branchError, branches, connInspector, connInspectorError, connStrPassword, connStrTab, connectSection,
    consumption, consumptionDays, consumptionHistory, consumptionLive, copiedBlock, copyText, createBackup,
    createBranch, createMigrationFile, currentConnection, databaseCatalog, databaseCatalogError,
    databaseView, databaseViewLabel, deleteBackup, deleteBranch, editingTabId, editingTabTitle,
    erdError, erdGraph, erdPayload, expandedSlowQuery, explainError, explainPlan, fdwData, fetchErd,
    filteredResultRows, filteredSavedQueries, flattenedTables, globalError, history, isAutovacuumLoading,
    isBackupsLoading, isBranchesLoading, isConnInspectorLoading, isConsumptionLoading, isDatabaseCatalogLoading,
    isErdLoading, isExplainLoading, isFdwLoading, isLoading, isLocksLoading, isMigrationChecking,
    isMigrationCreating, isMigrationStatusLoading, isPerformanceAdvisorLoading,
    isSecurityAdvisorLoading, isSlowQueriesLoading, isSqlDiagnosticsLoading, isTableDetailsLoading,
    isWalConfigLoading, loadAutovacuum, loadBackupSchedule, loadBackups, loadBranches, loadConnInspector,
    loadConsumption, loadDatabaseCatalog, loadFdw, loadLocks, loadMigrationPreview, loadMigrationStatus,
    loadPerformanceAdvisor, loadSecurityAdvisor, loadSlowQueries, loadSqlDiagnostics, loadWalConfig,
    lockData, metadata, migrationError, migrationInfo, migrationPreview,
    migrationSafetyCheck, newMigrationName, performanceAdvisor, performanceAdvisorError,
    performanceAdvisorInfo, primaryNav, requestPitr, restoreBackup, resultFilter, runExplain, runMigrationSafetyCheck,
    runQuery, saveBackupSchedule, savedQueries, savedQuerySearch, savedQueryTagFilter,
    securityAdvisor, securityAdvisorError, securityAdvisorInfo, selectedSchema, selectedTable,
    setActiveTabId, setActiveTableBrowserTabId, setAutovacuumData, setBackupError, setBackupSchedule,
    setBranchError, setConnInspector, setConnStrPassword, setConnStrTab, setConnectSection, setConsumptionDays,
    setCopiedBlock, setDatabaseView, setEditingTabTitle, setExpandedSlowQuery, setFdwData, setHistory,
    setLockData, setMigrationPreview, setMigrationSafetyCheck, setNewMigrationName, setPerformanceAdvisorError,
    setPerformanceAdvisorInfo, setResultFilter, setSavedQuerySearch, setSavedQueryTagFilter, setSecurityAdvisorError,
    setSecurityAdvisorInfo, setSelectedSchema, setSelectedTable, setShowTableRowDetails,
    setSlowQueriesFilter, setSqlBranchDb, setSqlSplitView, setTableInspectorTab,
    showTableRowDetails, slowQueries, slowQueriesError, slowQueriesFilter, sqlBranchDb, sqlDiagnostics,
    sqlDiagnosticsError, sqlSplitView, tableBrowserTabs, tableDetails, tableInspectorTab, tabs,
    themeMode, editorTheme, updateActiveTab, walConfig,
    addTab, closeTab, beginRenameTab, commitRenameTab, cancelRenameTab, openSpecificTable, openTableBrowser, closeTableBrowser, patchTableBrowserTab, loadTableBrowserTab, loadHistorySql, exportResultCsv, exportResultJson, switchConnection, saveCurrentQuery, loadSavedQuery, deleteSavedQuery, updateSavedQueryTags, formatCurrentSql,
    vectorStatus, setVectorStatus, vectorCollections, setVectorCollections, isVectorLoading, setIsVectorLoading,
    selectedVectorCollection, setSelectedVectorCollection, vectorDetail, setVectorDetail, vectorItems, setVectorItems,
    vectorSearchResults, setVectorSearchResults, vectorSearchInput, setVectorSearchInput, vectorSearchMetric,
    setVectorSearchMetric, vectorSearchTopK, setVectorSearchTopK, isVectorSearching, setIsVectorSearching,
    showCreateVectorModal, setShowCreateVectorModal, newVectorName, setNewVectorName, newVectorDims, setNewVectorDims,
    newVectorMetric, setNewVectorMetric,
    latencyPercentiles, isLatencyLoading, loadLatencyPercentiles,
    indexAdvisor, indexAdvisorError, isIndexAdvisorLoading, loadIndexAdvisor,
    bloatData, bloatError, isBloatLoading, loadBloatData,
    partitioningData, partitioningError, isPartitioningLoading, loadPartitioningData,
    perfTab, setPerfTab,
    topQueries, isTopQueriesLoading, topQueriesError, topQueriesSort, setTopQueriesSort, expandedTopQuery, setExpandedTopQuery,
    loadTopQueries, resetTopQueriesStats,
    idempotentStatus, isIdempotentLoading, idempotentError, setIdempotentError,
    idempotentRunning, idempotentResult, setIdempotentResult, schemaDetection, migrationDiffTarget, setMigrationDiffTarget,
    loadIdempotentStatus, runIdempotentMigrations, markMigrationApplied, detectMigrationSchema,
  } = s;

    if (primaryNav === "database") {
      if (databaseView === "sql-history") {
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-100">Query History</h2>
              <button
                onClick={() => setHistory([])}
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                Clear
              </button>
            </div>
            {history.length === 0 ? (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                No query history yet.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => loadHistorySql(item.sql)}
                    className="w-full rounded border border-slate-800 bg-slate-900/40 p-3 text-left hover:bg-slate-900"
                  >
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className={item.status === "success" ? "text-emerald-300" : "text-red-300"}>
                        {item.status.toUpperCase()}
                      </span>
                      <span className="text-slate-500">{new Date(item.executedAt).toLocaleString()}</span>
                    </div>
                    <p className="truncate text-xs text-slate-200">{item.sql.replace(/\s+/g, " ")}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.durationMs} ms · {item.rowCount} rows · {item.tabTitle}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-100">Saved Queries</h2>
              </div>
              <input
                type="text"
                placeholder="Search saved queries..."
                value={savedQuerySearch}
                onChange={(e) => setSavedQuerySearch(e.target.value)}
                className="mb-2 w-full rounded border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-slate-500"
              />
              {allSavedQueryTags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  <button
                    onClick={() => setSavedQueryTagFilter("")}
                    className={`rounded px-2 py-0.5 text-[11px] ${!savedQueryTagFilter ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
                  >
                    All
                  </button>
                  {allSavedQueryTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSavedQueryTagFilter(savedQueryTagFilter === tag ? "" : tag)}
                      className={`rounded px-2 py-0.5 text-[11px] ${savedQueryTagFilter === tag ? "bg-slate-600 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
              {filteredSavedQueries.length === 0 ? (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                  {savedQueries.length === 0 ? "No saved queries yet." : "No matching queries."}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSavedQueries.map((item) => (
                    <div
                      key={item.id}
                      className="rounded border border-slate-800 bg-slate-900/40 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <button onClick={() => loadSavedQuery(item.sql)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-xs text-slate-100">{item.name}</p>
                          <p className="truncate text-xs text-slate-500">{item.sql.replace(/\s+/g, " ")}</p>
                        </button>
                        <button
                          onClick={() => { if (window.confirm("Delete this saved query?")) deleteSavedQuery(item.id); }}
                          className="ml-3 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                        {item.tags?.map((t) => (
                          <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">#{t}</span>
                        ))}
                        <button
                          onClick={() => {
                            const input = window.prompt("Tags (space-separated):", (item.tags || []).join(" "))?.trim();
                            if (input !== null && input !== undefined) {
                              updateSavedQueryTags(item.id, input ? input.split(/\s+/) : []);
                            }
                          }}
                          className="text-[10px] text-slate-600 hover:text-slate-400"
                        >
                          {item.tags?.length ? "edit" : "+tag"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }

      if (databaseView === "sql-editor") {
        return (
          <>
            <div className="border-b border-slate-800 p-4">
              <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/20 p-1">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  return (
                    <div
                      key={tab.id}
                      className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all duration-150 ${
                        isActive
                          ? "border-slate-500 bg-slate-800 text-slate-100 shadow-sm"
                          : "border-transparent bg-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/20 hover:text-slate-200"
                      }`}
                    >
                      {editingTabId === tab.id ? (
                        <input
                          autoFocus
                          value={editingTabTitle}
                          onChange={(event) => setEditingTabTitle(event.target.value)}
                          onBlur={commitRenameTab}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              commitRenameTab();
                            }
                            if (event.key === "Escape") {
                              cancelRenameTab();
                            }
                          }}
                          className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                        />
                      ) : (
                        <button
                          onClick={() => setActiveTabId(tab.id)}
                          onDoubleClick={() => beginRenameTab(tab.id, tab.title)}
                          title="Double-click to rename"
                          className="whitespace-nowrap"
                        >
                          {tab.title}
                        </button>
                      )}
                      {tabs.length > 1 && (
                        <button
                          onClick={() => closeTab(tab.id)}
                          className="rounded px-1 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-100"
                          aria-label={`Close ${tab.title}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={addTab}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 transition-all hover:-translate-y-px hover:bg-slate-800"
                  title="New query tab"
                >
                  +
                </button>
              </div>

              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {branches.length > 0 && (
                    <select
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                      defaultValue=""
                      onChange={async (e) => {
                        const branchId = e.target.value;
                        e.target.value = "";
                        if (!branchId) return;
                        try {
                          const res = await apiFetch(`${apiBaseUrl}/api/branches/${branchId}/connection-string`);
                          const body = await res.json();
                          if (body.connectionString) switchConnection(body.connectionString);
                        } catch {}
                      }}
                    >
                      <option value="" disabled>Branch…</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={formatCurrentSql}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:-translate-y-px hover:bg-slate-800"
                  >
                    Format
                  </button>
                  <button
                    onClick={saveCurrentQuery}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:-translate-y-px hover:bg-slate-800"
                  >
                    Save
                  </button>
                  <button
                    onClick={exportResultCsv}
                    disabled={!activeTab?.result}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:-translate-y-px hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={exportResultJson}
                    disabled={!activeTab?.result}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:-translate-y-px hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={() => setSqlSplitView((v) => !v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-px ${sqlSplitView ? "border-accent-500/50 bg-accent-500/10 text-accent-300" : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"}`}
                    title="Toggle split view (editor + history)"
                  >
                    Split
                  </button>
                  {branches.filter(b => b.status === "active").length > 0 && (
                    <select
                      value={sqlBranchDb}
                      onChange={e => setSqlBranchDb(e.target.value)}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${sqlBranchDb ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-300"}`}
                      title="Run query against a branch database"
                    >
                      <option value="">Main DB</option>
                      {branches.filter(b => b.status === "active").map(b => (
                        <option key={b.id} value={b.branch_db}>{b.label || b.branch_db}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={runQuery}
                    disabled={isLoading || (!billingRestrictions.shadow && billingRestrictions.db && !/^\s*(select|with|explain)\b/i.test(activeTab?.sql || ""))}
                    title={billingRestrictions.db && !/^\s*(select|with|explain)\b/i.test(activeTab?.sql || "") ? (billingRestrictions.shadow ? "DB size limit reached (shadow mode — not blocking)." : "DB size limit reached. Upgrade your plan to perform write operations.") : ""}
                    className="rounded-lg bg-gradient-to-r from-accent-400 to-accent-300 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-950 transition-all hover:-translate-y-px hover:from-accent-300 hover:to-accent-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLoading ? "Running..." : `Run${sqlBranchDb ? ` (${sqlBranchDb})` : ""}`}
                  </button>
                </div>
              </div>
              <div className={sqlSplitView ? "grid grid-cols-2 gap-3" : ""}>
              <div className="overflow-hidden rounded-lg border border-slate-700/50 shadow-lg shadow-black/20">
                <Editor
                  height={sqlSplitView ? "420px" : "280px"}
                  defaultLanguage="sql"
                  value={activeTab?.sql || ""}
                  onChange={(value) => updateActiveTab((tab) => ({ ...tab, sql: value ?? "" }))}
                  theme={editorTheme}
                  beforeMount={handleEditorWillMount}
                  options={trussEditorOptions}
                />
              </div>
              {sqlSplitView && (
                <div className="overflow-auto rounded border border-slate-800 bg-slate-950 p-3" style={{ maxHeight: "420px" }}>
                  <h3 className="mb-2 text-xs font-medium text-slate-400">Query History</h3>
                  {history.length === 0 ? (
                    <p className="text-xs text-slate-500">No history yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {history.slice(0, 20).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => updateActiveTab((tab) => ({ ...tab, sql: item.sql, result: null, error: "" }))}
                          className="w-full rounded border border-slate-800 bg-slate-900/40 p-2 text-left hover:bg-slate-900"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={item.status === "success" ? "text-emerald-300" : "text-red-300"}>{item.status}</span>
                            <span className="text-slate-500">{item.durationMs}ms</span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-300">{item.sql.replace(/\s+/g, " ")}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {globalError && (
                <div className="mb-4 rounded border border-red-700 bg-red-950/50 p-3 text-sm text-red-300">
                  {globalError}
                </div>
              )}

              {activeTab?.error && (
                <div className="mb-4 rounded border border-red-700 bg-red-950/50 p-3 text-sm text-red-300">
                  {activeTab.error}
                </div>
              )}

              {!activeTab?.result ? (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                  Run a query to see results.
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <div className="shrink-0 border-b border-slate-800 pb-2 text-sm text-slate-300">
                    <div className="flex items-center gap-4">
                      <span>Rows: {activeTab.result.rowCount}</span>
                      {resultFilter.trim() && <span>Showing: {filteredResultRows.length}</span>}
                      <span>Time: {activeTab.result.durationMs} ms</span>
                      {activeTab.result.truncated && (
                        <span className="text-amber-300">Showing first {activeTab.result.maxRows} rows.</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <input
                        value={resultFilter}
                        onChange={(event) => setResultFilter(event.target.value)}
                        placeholder="Filter result rows..."
                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-800">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-900">
                        <tr>
                          {activeTab.result.columns.map((column) => (
                            <th
                              key={column}
                              className="border-b border-slate-800 px-3 py-2 text-left font-medium text-slate-200"
                            >
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResultRows.map((row, index) => (
                          <tr key={index} className="odd:bg-slate-950 even:bg-slate-900/40">
                            {activeTab.result?.columns.map((column) => (
                              <td
                                key={`${index}-${column}`}
                                className="max-w-[420px] truncate border-b border-slate-900 px-3 py-2 text-slate-300"
                                title={String(row[column] ?? "NULL")}
                              >
                                {row[column] === null ? "NULL" : String(row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        );
      }


      if (databaseView === "schema-visualizer") {
        return (
          <div className="min-h-0 flex flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-slate-400">Auto-generated from current database metadata</p>
              <button
                onClick={fetchErd}
                disabled={isErdLoading}
                className="rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isErdLoading ? "Refreshing..." : "Refresh Diagram"}
              </button>
            </div>
            {erdError && (
              <div className="mb-3 rounded border border-red-700 bg-red-950/50 p-3 text-sm text-red-300">
                {erdError}
              </div>
            )}
            {!isErdLoading && erdPayload && erdPayload.tables.length === 0 ? (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
                No tables found in this database.
              </div>
            ) : (
              <div className="min-h-0 flex-1 rounded border border-slate-800 bg-slate-950">
                <InteractiveErd nodes={erdGraph.nodes} edges={erdGraph.edges} />
              </div>
            )}
          </div>
        );
      }

      if (databaseView === "tables") {
        const schemaOptions = metadata?.schemas || [];
        const resolvedSchema =
          selectedSchema && schemaOptions.some((item) => item.name === selectedSchema)
            ? selectedSchema
            : schemaOptions[0]?.name || "";
        const resolvedSchemaTables =
          schemaOptions.find((item) => item.name === resolvedSchema)?.tables || [];
        const resolvedTable =
          selectedTable && resolvedSchemaTables.includes(selectedTable)
            ? selectedTable
            : resolvedSchemaTables[0] || "";

        return (
          <div className="min-h-0 flex-1 overflow-hidden p-4">
            <div className="flex h-full min-h-0 flex-col rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-100">Tables</h2>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-300">
                    {flattenedTables.length} total
                  </span>
                  <button
                    onClick={() => {
                      setDatabaseView("sql-editor");
                    }}
                    className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <Code size={15} />
                    Open SQL Editor
                  </button>
                </div>
              </div>
              <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[320px_1fr]">
                <div className="min-h-0 overflow-auto rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70 text-slate-400">
                      <tr>
                        <th className="border-r border-slate-800 px-3 py-2 text-left last:border-r-0">Schema</th>
                        <th className="border-r border-slate-800 px-3 py-2 text-left last:border-r-0">Table</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flattenedTables.length === 0 ? (
                        <tr className="border-t border-slate-800 bg-slate-950 text-slate-400">
                          <td className="px-3 py-3" colSpan={2}>
                            No tables available.
                          </td>
                        </tr>
                      ) : (
                        flattenedTables.map((row) => (
                          <tr
                            key={`${row.schema}.${row.table}`}
                            onClick={() => {
                              setSelectedSchema(row.schema);
                              setSelectedTable(row.table);
                              openTableBrowser(row.schema, row.table);
                            }}
                            className={`cursor-pointer border-t border-slate-800 text-slate-300 ${
                              resolvedSchema === row.schema && resolvedTable === row.table
                                ? "bg-slate-800/60"
                                : "bg-slate-950 hover:bg-slate-900/70"
                            }`}
                          >
                            <td className="border-r border-slate-800 px-3 py-2 last:border-r-0">{row.schema}</td>
                            <td className="border-r border-slate-800 px-3 py-2 last:border-r-0">{row.table}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                    <select
                      value={resolvedSchema}
                      onChange={(event) => {
                        const nextSchema = event.target.value;
                        const nextTable =
                          metadata?.schemas.find((item) => item.name === nextSchema)?.tables[0] || "";
                        setSelectedSchema(nextSchema);
                        setSelectedTable(nextTable);
                      }}
                      className="min-w-28 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100"
                    >
                      {schemaOptions.map((schema) => (
                        <option key={schema.name} value={schema.name}>
                          {schema.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={resolvedTable}
                      onChange={(event) => setSelectedTable(event.target.value)}
                      className="min-w-40 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100"
                    >
                      {resolvedSchemaTables.map((tableName) => (
                        <option key={tableName} value={tableName}>
                          {tableName}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => resolvedSchema && resolvedTable && openTableBrowser(resolvedSchema, resolvedTable)}
                      disabled={!resolvedSchema || !resolvedTable}
                      className="truss-btn rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Table size={13} />
                      Browse
                    </button>
                    <button
                      onClick={() => resolvedSchema && resolvedTable && openSpecificTable(resolvedSchema, resolvedTable)}
                      disabled={!resolvedSchema || !resolvedTable}
                      className="truss-btn rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <Code size={13} />
                      SQL
                    </button>
                    <select
                      value={activeTableBrowserTabId}
                      onChange={(event) => setActiveTableBrowserTabId(event.target.value)}
                      disabled={tableBrowserTabs.length === 0}
                      className="min-w-44 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-50"
                    >
                      {tableBrowserTabs.length === 0 ? (
                        <option value="">No open tabs</option>
                      ) : (
                        tableBrowserTabs.map((tab) => (
                          <option key={tab.id} value={tab.id}>
                            {tab.schema}.{tab.table}
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      onClick={() => activeTableBrowserTab && closeTableBrowser(activeTableBrowserTab.id)}
                      disabled={!activeTableBrowserTab}
                      className="truss-btn rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      title="Close active table tab"
                    >
                      <Trash size={13} />
                    </button>
                    <select
                      value={activeTableBrowserTab?.orderBy || ""}
                      onChange={(event) =>
                        activeTableBrowserTab &&
                        patchTableBrowserTab(activeTableBrowserTab.id, {
                          orderBy: event.target.value,
                          offset: 0,
                          selectedRowIndex: null,
                        })
                      }
                      disabled={!activeTableBrowserTab}
                      className="min-w-36 rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-50"
                    >
                      {(activeTableBrowserTab?.result?.columns || []).map((column) => (
                        <option key={column} value={column}>
                          Sort: {column}
                        </option>
                      ))}
                    </select>
                    <select
                      value={activeTableBrowserTab?.limit || 50}
                      onChange={(event) =>
                        activeTableBrowserTab &&
                        patchTableBrowserTab(activeTableBrowserTab.id, {
                          limit: Number(event.target.value),
                          offset: 0,
                          selectedRowIndex: null,
                        })
                      }
                      disabled={!activeTableBrowserTab}
                      className="rounded border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-xs text-slate-100 disabled:opacity-50"
                    >
                      {[25, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size} rows
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        activeTableBrowserTab &&
                        patchTableBrowserTab(activeTableBrowserTab.id, {
                          orderDir: activeTableBrowserTab.orderDir === "asc" ? "desc" : "asc",
                          offset: 0,
                          selectedRowIndex: null,
                        })
                      }
                      disabled={!activeTableBrowserTab}
                      className="truss-btn rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {activeTableBrowserTab?.orderDir?.toUpperCase() || "ASC"}
                    </button>
                    <button
                      onClick={() => activeTableBrowserTab && loadTableBrowserTab(activeTableBrowserTab.id)}
                      disabled={!activeTableBrowserTab || activeTableBrowserTab.loading}
                      className="truss-btn rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                    >
                      {activeTableBrowserTab?.loading ? (
                        <span className="truss-spinner" />
                      ) : (
                        <ArrowsClockwise size={13} />
                      )}
                    </button>
                    <button
                      onClick={() => setShowTableRowDetails((prev) => !prev)}
                      disabled={!activeTableBrowserTab}
                      className={`truss-btn rounded border px-2 py-1.5 text-xs disabled:opacity-50 ${
                        showTableRowDetails
                          ? "border-slate-600 bg-slate-800 text-slate-100"
                          : "border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {showTableRowDetails ? "Hide Details" : "Show Details"}
                    </button>
                  </div>
                  {tableBrowserTabs.length === 0 ? (
                    <div className="text-xs text-slate-400">
                      Select a table and click <strong>Browse</strong> to open a table browser tab.
                    </div>
                  ) : (
                    <>
                      {activeTableBrowserTab && (
                        <>
                          {activeTableBrowserTab.error && (
                            <p className="mb-2 text-xs text-amber-300">{activeTableBrowserTab.error}</p>
                          )}
                          <div
                            className={`grid min-h-0 flex-1 gap-2 ${
                              showTableRowDetails ? "xl:grid-cols-[1fr_320px]" : "grid-cols-1"
                            }`}
                          >
                            <div className="min-h-0 overflow-auto rounded border border-slate-800">
                              <table className="min-w-full border-collapse text-xs">
                                <thead className="sticky top-0 z-10 bg-slate-900">
                                  <tr>
                                    {(activeTableBrowserTab.result?.columns || []).map((column) => {
                                      const meta = activeTableBrowserTab.result?.columnMeta?.find(
                                        (item) => item.name === column
                                      );
                                      return (
                                        <th
                                          key={column}
                                          className="border-r border-b border-slate-800 px-3 py-2 text-left text-slate-300 last:border-r-0"
                                        >
                                          <div className="flex flex-col gap-1">
                                            <span>{column}</span>
                                            {meta && (
                                              <span className="inline-flex w-fit items-center gap-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-normal text-slate-400">
                                                {meta.data_type}
                                                {meta.is_nullable === "NO" ? "· not null" : "· nullable"}
                                              </span>
                                            )}
                                          </div>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(activeTableBrowserTab.result?.rows || []).length === 0 ? (
                                    <tr className="bg-slate-950 text-slate-400">
                                      <td
                                        className="px-3 py-3"
                                        colSpan={(activeTableBrowserTab.result?.columns || []).length || 1}
                                      >
                                        No rows found.
                                      </td>
                                    </tr>
                                  ) : (
                                    (activeTableBrowserTab.result?.rows || []).map((row, rowIdx) => (
                                      <tr
                                        key={rowIdx}
                                        onClick={() =>
                                          patchTableBrowserTab(activeTableBrowserTab.id, {
                                            selectedRowIndex: rowIdx,
                                          })
                                        }
                                        className={`cursor-pointer odd:bg-slate-950 even:bg-slate-900/40 ${
                                          activeTableBrowserTab.selectedRowIndex === rowIdx
                                            ? "ring-1 ring-inset ring-slate-600"
                                            : ""
                                        }`}
                                      >
                                        {(activeTableBrowserTab.result?.columns || []).map((column) => (
                                          <td
                                            key={`${rowIdx}-${column}`}
                                            className="max-w-[340px] truncate border-r border-b border-slate-900 px-3 py-2 text-slate-300 last:border-r-0"
                                            title={String(row[column] ?? "NULL")}
                                          >
                                            {row[column] === null
                                              ? "NULL"
                                              : typeof row[column] === "object"
                                                ? JSON.stringify(row[column])
                                                : String(row[column])}
                                          </td>
                                        ))}
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {showTableRowDetails && (
                              <div className="flex min-h-0 flex-col rounded border border-slate-800 bg-slate-900/40 p-0 overflow-hidden">
                                <div className="flex border-b border-slate-800 bg-slate-950/50">
                                  {[
                                    { id: "columns", label: "Columns" },
                                    { id: "indexes", label: "Indexes" },
                                    { id: "relations", label: "Relations" },
                                    { id: "row", label: "Row JSON" },
                                  ].map((t) => (
                                    <button
                                      key={t.id}
                                      onClick={() => setTableInspectorTab(t.id as any)}
                                      className={`px-3 py-2 text-[10px] uppercase tracking-wider font-semibold transition-all ${
                                        tableInspectorTab === t.id
                                          ? "bg-slate-800 text-accent-400 border-b border-accent-400"
                                          : "text-slate-500 hover:text-slate-300"
                                      }`}
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex-1 overflow-auto p-3">
                                  {tableInspectorTab === "row" && (
                                    <>
                                      <div className="mb-2 flex items-center justify-between">
                                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Selected Row</p>
                                        <button
                                          onClick={() =>
                                            patchTableBrowserTab(activeTableBrowserTab.id, {
                                              selectedRowIndex: null,
                                            })
                                          }
                                          className="text-[10px] text-slate-500 hover:text-white"
                                        >
                                          Clear
                                        </button>
                                      </div>
                                      {activeTableBrowserTab.selectedRowIndex === null ? (
                                        <p className="text-xs text-slate-500 italic mt-4 text-center">
                                          Click any row to inspect.
                                        </p>
                                      ) : (
                                        <pre className="h-full overflow-auto rounded border border-slate-800 bg-slate-950 p-2 text-[11px] text-slate-300">
                                          {JSON.stringify(
                                            activeTableBrowserTab.result?.rows?.[
                                              activeTableBrowserTab.selectedRowIndex
                                            ] || {},
                                            null,
                                            2
                                          )}
                                        </pre>
                                      )}
                                    </>
                                  )}

                                  {tableInspectorTab === "columns" && (
                                    <div className="space-y-2">
                                      {isTableDetailsLoading ? <span className="truss-spinner block mx-auto my-4" /> : 
                                       (tableDetails?.columns || []).map(c => (
                                        <div key={c.column_name} className="p-2 rounded border border-slate-800 bg-slate-950/50">
                                          <div className="flex justify-between items-center">
                                            <span className="text-xs font-mono text-slate-200">{c.column_name}</span>
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{c.data_type}</span>
                                          </div>
                                          {c.column_default && <p className="text-[9px] text-slate-600 mt-1">Default: {c.column_default}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {tableInspectorTab === "indexes" && (
                                    <div className="space-y-2">
                                      {isTableDetailsLoading ? <span className="truss-spinner block mx-auto my-4" /> : 
                                       (tableDetails?.indexes || []).length === 0 ? <p className="text-xs text-slate-500 text-center py-4">No indexes.</p> :
                                       (tableDetails?.indexes || []).map(idx => (
                                        <div key={idx.indexname} className="p-2 rounded border border-slate-800 bg-slate-950/50">
                                          <p className="text-xs font-semibold text-slate-300">{idx.indexname}</p>
                                          <p className="text-[9px] text-slate-500 mt-1 font-mono leading-tight">{idx.indexdef}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {tableInspectorTab === "relations" && (
                                    <div className="space-y-3">
                                      {isTableDetailsLoading ? <span className="truss-spinner block mx-auto my-4" /> : (
                                        <>
                                          <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Outbound (this table references)</p>
                                          {(tableDetails?.foreignKeys || []).length === 0 ? <p className="text-xs text-slate-500 py-2">None</p> :
                                           (tableDetails?.foreignKeys || []).map((fk: { constraint_name: string; source_column: string; target_schema: string; target_table: string; target_column: string }) => (
                                            <div key={fk.constraint_name} className="p-2 rounded border border-slate-800 bg-slate-950/50">
                                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                <LinkSimple size={12} className="text-accent-400" />
                                                <span className="text-slate-200 font-mono">{fk.source_column}</span>
                                                <span>&rarr;</span>
                                                <button
                                                  onClick={() => { setSelectedSchema(fk.target_schema); setSelectedTable(fk.target_table); }}
                                                  className="text-accent-400 hover:underline font-semibold"
                                                >
                                                  {fk.target_schema}.{fk.target_table}({fk.target_column})
                                                </button>
                                              </div>
                                              <p className="text-[9px] text-slate-600 mt-1 truncate">{fk.constraint_name}</p>
                                            </div>
                                          ))}
                                          <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 mt-3">Inbound (referenced by)</p>
                                          {(tableDetails?.inboundForeignKeys || []).length === 0 ? <p className="text-xs text-slate-500 py-2">None</p> :
                                           (tableDetails?.inboundForeignKeys || []).map((fk: { constraint_name: string; source_schema: string; source_table: string; source_column: string; target_column: string }) => (
                                            <div key={fk.constraint_name} className="p-2 rounded border border-slate-800 bg-slate-950/50">
                                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                <LinkSimple size={12} className="text-sky-400" />
                                                <button
                                                  onClick={() => { setSelectedSchema(fk.source_schema); setSelectedTable(fk.source_table); }}
                                                  className="text-sky-400 hover:underline font-semibold"
                                                >
                                                  {fk.source_schema}.{fk.source_table}({fk.source_column})
                                                </button>
                                                <span>&rarr;</span>
                                                <span className="text-slate-200 font-mono">{fk.target_column}</span>
                                              </div>
                                              <p className="text-[9px] text-slate-600 mt-1 truncate">{fk.constraint_name}</p>
                                            </div>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              Rows {activeTableBrowserTab.result?.offset || 0} -{" "}
                              {Math.min(
                                (activeTableBrowserTab.result?.offset || 0) +
                                  (activeTableBrowserTab.result?.rows?.length || 0),
                                activeTableBrowserTab.result?.totalCount || 0
                              )}{" "}
                              of {activeTableBrowserTab.result?.totalCount || 0}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  patchTableBrowserTab(activeTableBrowserTab.id, {
                                    offset: Math.max(
                                      0,
                                      activeTableBrowserTab.offset - activeTableBrowserTab.limit
                                    ),
                                    selectedRowIndex: null,
                                  })
                                }
                                className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() =>
                                  patchTableBrowserTab(activeTableBrowserTab.id, {
                                    offset: activeTableBrowserTab.offset + activeTableBrowserTab.limit,
                                    selectedRowIndex: null,
                                  })
                                }
                                className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (databaseView === "query-performance") {
        const sortOptions = [
          { id: "total_time", label: "Total Time" },
          { id: "calls", label: "Call Count" },
          { id: "mean_time", label: "Avg Time" },
          { id: "rows", label: "Rows" },
          { id: "cache_hit", label: "Cache Hit Rate" },
        ];
        const getCacheColor = (pct: number) =>
          pct >= 95 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : pct >= 80 ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : "border-red-500/30 bg-red-500/10 text-red-300";
        const getMsColor = (ms: number) =>
          ms >= 500 ? "text-red-300" : ms >= 100 ? "text-amber-300" : "text-emerald-300";
        // Reset confirm handled via window.confirm (no useState in conditional)

        return (
          <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-100">Query Performance</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { loadSqlDiagnostics(); loadTopQueries(); }}
                  disabled={isSqlDiagnosticsLoading || isTopQueriesLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {(isSqlDiagnosticsLoading || isTopQueriesLoading) ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                  Refresh
                </button>
                <button
                  onClick={runExplain}
                  disabled={isExplainLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isExplainLoading ? <span className="truss-spinner" /> : <ChartLine size={15} />}
                  Explain Active SQL
                </button>
              </div>
            </div>

            {/* Diagnostics error */}
            {sqlDiagnosticsError && <p className="text-xs text-amber-300">{sqlDiagnosticsError}</p>}

            {/* Live diagnostics cards */}
            {sqlDiagnostics && (
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                  <p className="text-slate-400">DB Ping</p>
                  <p className="mt-1 text-slate-200">{sqlDiagnostics.pingMs} ms</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                  <p className="text-slate-400">Active Sessions</p>
                  <p className="mt-1 text-slate-200">
                    {sqlDiagnostics.activity.reduce((sum, row) => sum + Number(row.count || 0), 0)}
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                  <p className="text-slate-400">Long Transactions</p>
                  <p className="mt-1 text-slate-200">{sqlDiagnostics.longTransactions.length}</p>
                </div>
              </div>
            )}

            {/* ── Top Queries (pg_stat_statements) ── */}
            {topQueriesError && <p className="text-xs text-amber-300">{topQueriesError}</p>}

            {topQueries && !topQueries.available && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="mb-2 text-xs font-medium text-amber-300">pg_stat_statements is not installed</p>
                <p className="mb-3 text-[11px] text-slate-400">{topQueries.message || "Enable it from Database > Extensions to track query execution statistics."}</p>
                <button
                  onClick={() => setDatabaseView("extensions")}
                  className="rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-500/20"
                >
                  Go to Extensions
                </button>
              </div>
            )}

            {topQueries?.available && (
              <>
                {/* Stats summary */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Tracked Queries</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{Number(topQueries.stats.total_tracked_queries || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Total Exec Time</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{Number(topQueries.stats.total_exec_time_ms || 0).toLocaleString()} ms</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Total Calls</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{Number(topQueries.stats.total_calls || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Avg Mean Time</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{topQueries.stats.avg_mean_time_ms || "0"} ms</p>
                  </div>
                </div>

                {/* Sort + reset controls */}
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-slate-500">Sort by</label>
                  <select
                    value={topQueriesSort}
                    onChange={(e) => { setTopQueriesSort(e.target.value); loadTopQueries(e.target.value); }}
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                  >
                    {sortOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <span className="ml-auto text-[11px] text-slate-600">{topQueries.queries.length} queries</span>
                  <button
                    onClick={() => { if (window.confirm("Reset all query performance statistics?")) resetTopQueriesStats(); }}
                    className="rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                  >
                    Reset Statistics
                  </button>
                </div>

                {/* Top queries table */}
                <div className="overflow-hidden rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">#</th>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Query</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Calls</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Total ms</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Avg ms</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Rows</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Cache Hit%</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Temp Blks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topQueries.queries.map((q, i) => {
                        const qid = String(q.queryid);
                        const isExpanded = expandedTopQuery === qid;
                        const meanMs = Number(q.mean_time_ms);
                        const cacheHit = Number(q.cache_hit_pct);
                        const tempBlks = Number(q.temp_blks_read || 0) + Number(q.temp_blks_written || 0);
                        return (
                          <tr key={i} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                            <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                            <td className="max-w-xs px-3 py-2">
                              <button onClick={() => setExpandedTopQuery(isExpanded ? null : qid)} className="w-full text-left">
                                <span className={`font-mono text-[11px] ${isExpanded ? "whitespace-pre-wrap text-slate-300" : "truncate text-slate-400"} block`}>
                                  {String(q.query)}
                                </span>
                                <span className="mt-0.5 text-[9px] text-slate-600">{isExpanded ? "collapse" : "expand"}</span>
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">{Number(q.calls).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-300">{Number(q.total_time_ms).toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${getMsColor(meanMs)}`}>{String(q.mean_time_ms)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-400">{Number(q.rows).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${getCacheColor(cacheHit)}`}>
                                {q.cache_hit_pct != null ? `${q.cache_hit_pct}%` : "--"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{tempBlks > 0 ? tempBlks.toLocaleString() : "--"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {topQueries.queries.length === 0 && (
                    <p className="py-8 text-center text-sm text-slate-500">No query statistics recorded yet.</p>
                  )}
                </div>
              </>
            )}

            {/* ── Session activity ── */}
            {sqlDiagnostics?.activity?.length ? (
              <div className="overflow-auto rounded border border-slate-800">
                <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">Session Activity</p>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-950/70 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Session State</th>
                      <th className="px-3 py-2 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sqlDiagnostics.activity.map((row, idx) => (
                      <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                        <td className="px-3 py-2">{row.state || "unknown"}</td>
                        <td className="px-3 py-2 text-right">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Long transactions */}
            {sqlDiagnostics?.longTransactions?.length ? (
              <div className="overflow-auto rounded border border-slate-800">
                <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                  Long Transactions
                </p>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-950/60 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">PID</th>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">State</th>
                      <th className="px-3 py-2 text-left">Age</th>
                      <th className="px-3 py-2 text-left">Query</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sqlDiagnostics.longTransactions.map((row, idx) => (
                      <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                        <td className="px-3 py-2">{String(row.pid || "-")}</td>
                        <td className="px-3 py-2">{String(row.user_name || "-")}</td>
                        <td className="px-3 py-2">{String(row.state || "-")}</td>
                        <td className="px-3 py-2">{String(row.tx_age || "-")}</td>
                        <td className="max-w-[420px] truncate px-3 py-2">{String(row.query || "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Lock waits */}
            {sqlDiagnostics?.lockWaits?.length ? (
              <div className="overflow-auto rounded border border-slate-800">
                <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                  Lock Waits
                </p>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-slate-950/60 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">PID</th>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">Age</th>
                      <th className="px-3 py-2 text-left">Query</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sqlDiagnostics.lockWaits.map((row, idx) => (
                      <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                        <td className="px-3 py-2">{String(row.pid || "-")}</td>
                        <td className="px-3 py-2">{String(row.user_name || "-")}</td>
                        <td className="px-3 py-2">{String(row.query_age || "-")}</td>
                        <td className="max-w-[420px] truncate px-3 py-2">{String(row.query || "-")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Explain plan */}
            {explainError && <p className="text-xs text-amber-300">{explainError}</p>}
            {explainPlan && (() => {
              type PlanNode = Record<string, unknown>;
              function renderPlanNode(node: PlanNode, depth: number, key: string) {
                const nodeType = String(node["Node Type"] || "Unknown");
                const startupCost = Number(node["Startup Cost"] || 0);
                const totalCost = Number(node["Total Cost"] || 0);
                const planRows = node["Plan Rows"];
                const actualTime = node["Actual Total Time"];
                const actualRows = node["Actual Rows"];
                const isExpensive = totalCost > 500;
                const plans = Array.isArray(node["Plans"]) ? (node["Plans"] as PlanNode[]) : [];
                const metaKeys = ["Relation Name", "Alias", "Index Name", "Join Type", "Hash Cond", "Filter", "Index Cond", "Recheck Cond"];
                const metas = metaKeys.filter((k) => node[k] !== undefined).map((k) => `${k}: ${node[k]}`);
                return (
                  <div key={key} className={depth > 0 ? "ml-4 border-l border-slate-700 pl-3" : ""}>
                    <div className={`mb-1 rounded border px-2 py-1.5 ${isExpensive ? "border-amber-400/30 bg-amber-400/5" : "border-slate-800 bg-slate-900/50"}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className={`text-xs font-semibold ${isExpensive ? "text-amber-300" : "text-slate-200"}`}>{nodeType}</span>
                        <span className="text-[10px] text-slate-500">cost={startupCost.toFixed(2)}..{totalCost.toFixed(2)}</span>
                        {planRows !== undefined && <span className="text-[10px] text-slate-500">est rows={String(planRows)}</span>}
                        {actualTime !== undefined && <span className="text-[10px] text-accent-400/80">actual={Number(actualTime).toFixed(3)} ms</span>}
                        {actualRows !== undefined && <span className="text-[10px] text-slate-400">rows={String(actualRows)}</span>}
                      </div>
                      {metas.length > 0 && <p className="mt-1 truncate text-[10px] text-slate-500">{metas.join(" · ")}</p>}
                    </div>
                    {plans.map((child, idx) => renderPlanNode(child, depth + 1, `${key}-${idx}`))}
                  </div>
                );
              }
              const rootPlan = explainPlan["Plan"] as PlanNode | undefined;
              const planningTime = explainPlan["Planning Time"];
              const executionTime = explainPlan["Execution Time"];
              return (
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-300">Query Plan</p>
                    <div className="flex gap-3 text-[10px] text-slate-500">
                      {planningTime !== undefined && <span>Planning: {Number(planningTime).toFixed(2)} ms</span>}
                      {executionTime !== undefined && <span>Execution: {Number(executionTime).toFixed(2)} ms</span>}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {rootPlan ? renderPlanNode(rootPlan, 0, "root") : (
                      <pre className="text-[11px] text-slate-400">{JSON.stringify(explainPlan, null, 2)}</pre>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      }

      if (databaseView === "roles") {
        return <RolesManager apiBaseUrl={apiBaseUrl} />;
      }

      if (
        ["functions", "triggers", "enumerated-types", "extensions", "vectors", "indexes", "publications", "policies", "configuration"].includes(
          databaseView
        )
      ) {
        const CatalogShell = ({ title, count, children }: { title: string; count: number; children: React.ReactNode }) => (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-slate-100">{title}</h2>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{count}</span>
              </div>
              <button onClick={loadDatabaseCatalog} disabled={isDatabaseCatalogLoading}
                className="truss-btn rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                {isDatabaseCatalogLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
                Refresh
              </button>
            </div>
            {databaseCatalogError && <p className="mb-3 text-xs text-amber-300">{databaseCatalogError}</p>}
            {children}
          </div>
        );
        const EmptyState = ({ label }: { label: string }) => (
          <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10 text-center">
            <p className="text-sm text-slate-500">No {label} found in this database.</p>
          </div>
        );
        const CatalogTable = ({ cols, rows }: { cols: string[]; rows: React.ReactNode[][] }) => (
          <div className="overflow-auto rounded border border-slate-800">
            <table className="min-w-full border-collapse text-xs">
              <thead className="bg-slate-950/70">
                <tr>{cols.map((c) => <th key={c} className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((cells, i) => (
                  <tr key={i} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                    {cells.map((cell, j) => <td key={j} className="max-w-xs px-3 py-2 text-slate-300">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        const Badge = ({ children, color = "slate" }: { children: React.ReactNode; color?: string }) => {
          const cls: Record<string, string> = {
            slate: "border-slate-700 bg-slate-800 text-slate-300",
            accent: "border-accent-500/30 bg-accent-500/10 text-accent-300",
            emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
            amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
            red: "border-red-500/30 bg-red-500/10 text-red-300",
            cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
            violet: "border-violet-500/30 bg-violet-500/10 text-violet-300",
          };
          return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls[color] || cls.slate}`}>{children}</span>;
        };

        if (databaseView === "functions") {
          const rows = databaseCatalog?.functions || [];
          return (
            <CatalogShell title="Functions & Procedures" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="functions" /> : (
                <CatalogTable
                  cols={["Schema", "Name", "Type", "Returns"]}
                  rows={rows.map((r) => [
                    <Badge>{String(r.schema_name)}</Badge>,
                    <code className="font-mono text-accent-300">{String(r.function_name)}</code>,
                    <Badge color={r.routine_type === "PROCEDURE" ? "violet" : "cyan"}>{String(r.routine_type)}</Badge>,
                    <span className="text-slate-400">{String(r.data_type || "—")}</span>,
                  ])}
                />
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "triggers") {
          const rows = databaseCatalog?.triggers || [];
          return (
            <CatalogShell title="Triggers" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="triggers" /> : (
                <CatalogTable
                  cols={["Table", "Trigger", "Timing", "Event", "Statement"]}
                  rows={rows.map((r) => [
                    <span><Badge>{String(r.schema_name)}</Badge><span className="ml-1 text-slate-300">{String(r.table_name)}</span></span>,
                    <code className="font-mono text-amber-300">{String(r.trigger_name)}</code>,
                    <Badge color={r.action_timing === "BEFORE" ? "amber" : "cyan"}>{String(r.action_timing)}</Badge>,
                    <Badge color="accent">{String(r.event_type)}</Badge>,
                    <span className="max-w-[240px] truncate text-[11px] text-slate-500" title={String(r.action_statement)}>{String(r.action_statement)}</span>,
                  ])}
                />
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "enumerated-types") {
          const rows = databaseCatalog?.enums || [];
          return (
            <CatalogShell title="Enumerated Types" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="enum types" /> : (
                <div className="space-y-2">
                  {rows.map((r, i) => {
                    const labels = Array.isArray(r.labels)
                      ? (r.labels as string[])
                      : String(r.labels ?? "").replace(/^{|}$/g, "").split(",").filter(Boolean);
                    return (
                      <div key={i} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
                        <div className="mb-2 flex items-center gap-2">
                          <Badge>{String(r.schema_name)}</Badge>
                          <code className="text-xs font-medium text-violet-300">{String(r.enum_name)}</code>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {labels.map((label) => (
                            <span key={label} className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300">{label}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "extensions") {
          return <ExtensionsView apiBaseUrl={apiBaseUrl} />;
        }

        if (databaseView === "vectors") {
          // Load vector status on first visit (deferred to avoid setState during render)
          if (!vectorStatus && !isVectorLoading) {
            setTimeout(() => {
              setIsVectorLoading(true);
              apiFetch(`${apiBaseUrl}/api/vectors/status`).then(r => r.json()).then(d => {
                setVectorStatus(d);
                if (d.installed) {
                  apiFetch(`${apiBaseUrl}/api/vectors/collections`).then(r => r.json()).then(c => setVectorCollections(c.collections || []));
                }
              }).catch(() => setVectorStatus({ installed: false, version: null })).finally(() => setIsVectorLoading(false));
            }, 0);
          }

          const loadCollections = () => {
            apiFetch(`${apiBaseUrl}/api/vectors/collections`).then(r => r.json()).then(c => setVectorCollections(c.collections || []));
          };
          const enableVector = () => {
            apiFetch(`${apiBaseUrl}/api/vectors/enable`, { method: "POST" }).then(r => r.json()).then(d => {
              setVectorStatus({ installed: true, version: d.version });
              loadCollections();
            });
          };
          const createCollection = () => {
            if (!newVectorName || !newVectorDims) return;
            apiFetch(`${apiBaseUrl}/api/vectors/collections`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: newVectorName, dimensions: Number(newVectorDims), metric: newVectorMetric }),
            }).then(r => r.json()).then(d => {
              if (d.ok) { loadCollections(); setShowCreateVectorModal(false); setNewVectorName(""); }
            });
          };
          const deleteCollection = (schema: string, table: string) => {
            if (!confirm(`Drop table ${schema}.${table}?`)) return;
            apiFetch(`${apiBaseUrl}/api/vectors/collections/${schema}/${table}`, { method: "DELETE" })
              .then(() => { loadCollections(); setSelectedVectorCollection(null); setVectorDetail(null); });
          };
          const selectCollection = (schema: string, table: string) => {
            setSelectedVectorCollection(`${schema}.${table}`);
            apiFetch(`${apiBaseUrl}/api/vectors/collections/${schema}/${table}`).then(r => r.json()).then(d => setVectorDetail(d));
            apiFetch(`${apiBaseUrl}/api/vectors/collections/${schema}/${table}/items`).then(r => r.json()).then(d => setVectorItems(d.items || []));
            setVectorSearchResults(null);
          };
          const runVectorSearch = () => {
            if (!vectorSearchInput || !selectedVectorCollection) return;
            setIsVectorSearching(true);
            const [schema, table] = selectedVectorCollection.split(".");
            let vector: number[];
            try { vector = JSON.parse(vectorSearchInput); } catch { setIsVectorSearching(false); return; }
            apiFetch(`${apiBaseUrl}/api/vectors/collections/${schema}/${table}/search`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vector, topK: vectorSearchTopK, metric: vectorSearchMetric, vectorColumn: vectorDetail?.vectorColumns?.[0] || "embedding" }),
            }).then(r => r.json()).then(d => setVectorSearchResults(d.results || [])).finally(() => setIsVectorSearching(false));
          };
          const createIndex = (type: string) => {
            if (!selectedVectorCollection) return;
            const [schema, table] = selectedVectorCollection.split(".");
            apiFetch(`${apiBaseUrl}/api/vectors/collections/${schema}/${table}/indexes`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type, column: vectorDetail?.vectorColumns?.[0] || "embedding", metric: vectorSearchMetric }),
            }).then(r => r.json()).then(() => selectCollection(schema, table));
          };

          // Not installed banner
          if (vectorStatus && !vectorStatus.installed) {
            return (
              <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
                <h2 className="text-sm font-medium text-slate-100">Vectors (pgvector)</h2>
                <div className="rounded border border-amber-800/50 bg-amber-950/30 p-4 space-y-3">
                  <p className="text-xs text-amber-200">pgvector extension is not installed on this database.</p>
                  <p className="text-[11px] text-slate-400">pgvector adds vector similarity search to Postgres. Store embeddings, build indexes, and run nearest-neighbor queries — all inside your database.</p>
                  <button onClick={enableVector} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60">
                    Enable pgvector Extension
                  </button>
                </div>
              </div>
            );
          }

          // Collection detail view
          if (selectedVectorCollection && vectorDetail) {
            const [detSchema, detTable] = selectedVectorCollection.split(".");
            return (
              <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setSelectedVectorCollection(null); setVectorDetail(null); }} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
                    <h2 className="text-sm font-medium text-slate-100">{selectedVectorCollection}</h2>
                    <span className="text-[11px] text-slate-500">{vectorDetail.dimensions}d &middot; {vectorDetail.rowCount} rows</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => createIndex("hnsw")} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">+ HNSW Index</button>
                    <button onClick={() => createIndex("ivfflat")} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">+ IVFFlat Index</button>
                    <button onClick={() => deleteCollection(detSchema, detTable)} className="truss-btn rounded border border-red-800/50 px-3 py-1 text-[11px] text-red-300 hover:bg-red-900/30">Drop Table</button>
                  </div>
                </div>

                {/* Indexes */}
                {vectorDetail.indexes?.length > 0 && (
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Indexes</p>
                    {vectorDetail.indexes.map((idx: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <code className="text-cyan-300">{idx.indexname}</code>
                        <span className="text-slate-500 max-w-[400px] truncate font-mono text-[10px]">{idx.indexdef}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Similarity Search */}
                <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-300">Similarity Search</p>
                  <div className="flex gap-2">
                    <textarea
                      value={vectorSearchInput}
                      onChange={e => setVectorSearchInput(e.target.value)}
                      placeholder="Paste vector as JSON array, e.g. [0.1, 0.2, ...]"
                      rows={2}
                      className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                    <div className="flex flex-col gap-1">
                      <select value={vectorSearchMetric} onChange={e => setVectorSearchMetric(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100">
                        <option value="cosine">Cosine</option>
                        <option value="l2">L2 (Euclidean)</option>
                        <option value="inner">Inner Product</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-slate-500">Top-K:</label>
                        <input type="number" value={vectorSearchTopK} onChange={e => setVectorSearchTopK(Number(e.target.value))} min={1} max={100} className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                      </div>
                      <button onClick={runVectorSearch} disabled={isVectorSearching} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-3 py-1 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
                        {isVectorSearching ? "Searching…" : "Search"}
                      </button>
                    </div>
                  </div>
                  {vectorSearchResults && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] text-slate-400">{vectorSearchResults.length} results</p>
                      <div className="max-h-[300px] overflow-auto rounded border border-slate-800">
                        <table className="w-full text-[11px] text-slate-300">
                          <thead><tr className="border-b border-slate-800 bg-slate-900/60 text-left">
                            <th className="px-2 py-1">ID</th><th className="px-2 py-1">Distance</th><th className="px-2 py-1">Metadata</th><th className="px-2 py-1">Content</th>
                          </tr></thead>
                          <tbody>
                            {vectorSearchResults.map((r: any, i: number) => (
                              <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                <td className="px-2 py-1 text-cyan-300">{r.id}</td>
                                <td className="px-2 py-1 text-amber-300">{Number(r.distance).toFixed(4)}</td>
                                <td className="px-2 py-1 max-w-[200px] truncate">{JSON.stringify(r.metadata)}</td>
                                <td className="px-2 py-1 max-w-[200px] truncate">{r.content}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Items browser */}
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Items ({vectorItems.length})</p>
                  {vectorItems.length === 0 ? (
                    <p className="text-xs text-slate-500">No items in this collection.</p>
                  ) : (
                    <div className="max-h-[300px] overflow-auto rounded border border-slate-800">
                      <table className="w-full text-[11px] text-slate-300">
                        <thead><tr className="border-b border-slate-800 bg-slate-900/60 text-left">
                          {Object.keys(vectorItems[0]).map(k => <th key={k} className="px-2 py-1">{k}</th>)}
                        </tr></thead>
                        <tbody>
                          {vectorItems.map((item: any, i: number) => (
                            <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                              {Object.values(item).map((v: any, j: number) => (
                                <td key={j} className="px-2 py-1 max-w-[200px] truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Columns */}
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Schema</p>
                  <div className="space-y-1">
                    {vectorDetail.columns?.map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <code className="text-cyan-300 w-32">{c.column_name}</code>
                        <span className="text-slate-500">{c.udt_name === 'vector' ? `vector(${vectorDetail.dimensions || '?'})` : c.data_type}</span>
                        {c.udt_name === 'vector' && <span className="rounded bg-accent-900/40 px-1.5 py-0.5 text-[10px] text-accent-300">vector</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // Collections list view
          return (
            <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-medium text-slate-100">Vectors (pgvector)</h2>
                  {vectorStatus && <span className="text-[11px] text-slate-500">v{vectorStatus.version}</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={loadCollections} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                    <ArrowsClockwise size={12} /> Refresh
                  </button>
                  <button onClick={() => setShowCreateVectorModal(true)} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-3 py-1 text-[11px] text-accent-200 hover:bg-accent-900/60">
                    + New Collection
                  </button>
                </div>
              </div>

              {isVectorLoading && <p className="text-xs text-slate-400">Loading…</p>}

              {vectorCollections.length === 0 && !isVectorLoading ? (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
                  <Waveform size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm text-slate-400">No vector collections yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">Create a collection to store embeddings and run similarity searches.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {vectorCollections.map((c: any, i: number) => (
                    <button key={i} onClick={() => selectCollection(c.table_schema, c.table_name)}
                      className="rounded border border-slate-800 bg-slate-900/40 p-4 text-left hover:border-slate-700 hover:bg-slate-900/60 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <code className="text-sm font-semibold text-accent-300">{c.table_schema}.{c.table_name}</code>
                        <Waveform size={16} className="text-slate-600" />
                      </div>
                      <div className="flex gap-4 text-[11px] text-slate-500">
                        <span>Col: <span className="text-slate-300">{c.column_name}</span></span>
                        <span>Rows: <span className="text-slate-300">{c.row_count ?? "?"}</span></span>
                        <span>Size: <span className="text-slate-300">{c.table_size || "?"}</span></span>
                      </div>
                      {c.vector_indexes && <p className="mt-1 text-[10px] text-accent-400/60 truncate">{c.vector_indexes}</p>}
                    </button>
                  ))}
                </div>
              )}

              {/* Docs */}
              <VectorDocsCard />

              {/* Create Collection Modal */}
              {showCreateVectorModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                  <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-slate-100">Create Vector Collection</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400">Table Name</label>
                        <input value={newVectorName} onChange={e => setNewVectorName(e.target.value)} placeholder="embeddings" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400">Dimensions</label>
                        <input value={newVectorDims} onChange={e => setNewVectorDims(e.target.value)} placeholder="1536" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none" />
                        <p className="mt-1 text-[10px] text-slate-500">OpenAI text-embedding-3-small: 1536, Ada-002: 1536, Cohere: 1024</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] text-slate-400">Distance Metric</label>
                        <select value={newVectorMetric} onChange={e => setNewVectorMetric(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                          <option value="cosine">Cosine (recommended)</option>
                          <option value="l2">L2 (Euclidean)</option>
                          <option value="inner">Inner Product</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowCreateVectorModal(false)} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                      <button onClick={createCollection} className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60">Create</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        if (databaseView === "indexes") {
          const rows = databaseCatalog?.indexes || [];
          return (
            <CatalogShell title="Indexes" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="indexes" /> : (
                <CatalogTable
                  cols={["Schema", "Table", "Index", "Definition"]}
                  rows={rows.map((r) => [
                    <Badge>{String(r.schema_name)}</Badge>,
                    <span className="text-slate-300">{String(r.table_name)}</span>,
                    <code className="font-mono text-cyan-300">{String(r.index_name)}</code>,
                    <span className="max-w-[320px] truncate font-mono text-[11px] text-slate-500" title={String(r.indexdef)}>{String(r.indexdef)}</span>,
                  ])}
                />
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "publications") {
          const rows = databaseCatalog?.publications || [];
          return (
            <CatalogShell title="Publications" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="publications" /> : (
                <div className="space-y-2">
                  {rows.map((r, i) => {
                    const tables = Array.isArray(r.tables)
                      ? (r.tables as string[])
                      : String(r.tables ?? "").replace(/^{|}$/g, "").split(",").filter(Boolean);
                    return (
                      <div key={i} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-medium text-violet-300">{String(r.publication_name)}</code>
                          {r.all_tables && <Badge color="amber">ALL TABLES</Badge>}
                        </div>
                        {!r.all_tables && tables.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tables.map((t) => (
                              <span key={t} className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "policies") {
          const rows = databaseCatalog?.policies || [];
          return (
            <CatalogShell title="Row-Level Security Policies" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="RLS policies" /> : (
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge>{String(r.schema_name)}</Badge>
                        <span className="text-xs text-slate-300">{String(r.table_name)}</span>
                        <span className="text-slate-600">·</span>
                        <code className="text-xs font-medium text-accent-300">{String(r.policy_name)}</code>
                        <Badge color={r.permissive === "PERMISSIVE" ? "accent" : "red"}>{String(r.permissive)}</Badge>
                        <Badge color="cyan">{String(r.command)}</Badge>
                        {(() => {
                          const roleList = Array.isArray(r.roles)
                            ? (r.roles as string[])
                            : String(r.roles ?? "").replace(/^{|}$/g, "").split(",").filter(Boolean);
                          return roleList.map((role) => <Badge key={role} color="violet">{role}</Badge>);
                        })()}
                      </div>
                      {r.using_expression && (
                        <p className="mt-1 text-[11px]"><span className="text-slate-500">USING </span><code className="text-slate-400">{String(r.using_expression)}</code></p>
                      )}
                      {r.check_expression && (
                        <p className="mt-1 text-[11px]"><span className="text-slate-500">WITH CHECK </span><code className="text-slate-400">{String(r.check_expression)}</code></p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CatalogShell>
          );
        }

        if (databaseView === "configuration") {
          const rows = databaseCatalog?.config || [];
          return (
            <CatalogShell title="Database Configuration" count={rows.length}>
              {rows.length === 0 ? <EmptyState label="config entries" /> : (
                <CatalogTable
                  cols={["Parameter", "Value", "Unit", "Description"]}
                  rows={rows.map((r) => [
                    <code className="font-mono text-amber-300">{String(r.name)}</code>,
                    <span className="font-medium text-slate-200">{String(r.setting)}</span>,
                    <span className="text-slate-500">{String(r.unit || "—")}</span>,
                    <span className="text-slate-500">{String(r.short_desc)}</span>,
                  ])}
                />
              )}
            </CatalogShell>
          );
        }

        return null;
      }

      if (databaseView === "rls-debugger") {
        return <RlsDebugger apiBaseUrl={apiBaseUrl} />;
      }

      if (databaseView === "performance") {
        const getMsColor = (ms: number) =>
          ms >= 500 ? "text-red-300" : ms >= 100 ? "text-amber-300" : "text-emerald-300";
        const getBloatColor = (status: string) =>
          status === "critical" ? "text-red-300" : status === "warning" ? "text-amber-300" : status === "moderate" ? "text-slate-300" : "text-emerald-300";
        const getBloatBg = (status: string) =>
          status === "critical" ? "border-red-500/30 bg-red-500/10" : status === "warning" ? "border-amber-500/30 bg-amber-500/10" : "border-slate-800 bg-slate-900/40";

        const filteredSlowQ = (slowQueries?.queries || []).filter(
          (q) => Number(q.mean_ms) >= slowQueriesFilter
        );

        return (
          <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-100">Performance</h2>
              <div className="flex items-center gap-2">
                {slowQueries && (
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${slowQueries.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                    {slowQueries.enabled ? "pg_stat_statements" : "pg_stat_statements off"}
                  </span>
                )}
              </div>
            </div>

            {/* Latency percentiles card */}
            {latencyPercentiles?.enabled && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Query Latency Percentiles</p>
                  <button onClick={loadLatencyPercentiles} disabled={isLatencyLoading}
                    className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 disabled:opacity-50">
                    {isLatencyLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={12} />}
                    Refresh
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "p50", value: latencyPercentiles.p50, color: "text-emerald-400" },
                    { label: "p95", value: latencyPercentiles.p95, color: "text-amber-400" },
                    { label: "p99", value: latencyPercentiles.p99, color: "text-red-400" },
                    { label: "avg", value: latencyPercentiles.avg_ms, color: "text-slate-200" },
                    { label: "stmts", value: latencyPercentiles.tracked_statements, color: "text-slate-200" },
                  ].map((p) => (
                    <div key={p.label} className="rounded border border-slate-800 bg-slate-950 px-2.5 py-2 text-center">
                      <p className="text-[8px] uppercase tracking-widest text-slate-500">{p.label}</p>
                      <p className={`mt-0.5 text-sm font-semibold ${p.color}`}>
                        {p.value != null ? (p.label === "stmts" ? String(p.value) : `${p.value} ms`) : "--"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-800 pb-1">
              {([
                { id: "slow-queries" as const, label: "Slow Queries" },
                { id: "index-advisor" as const, label: "Index Advisor" },
                { id: "bloat" as const, label: "Table Bloat" },
                { id: "partitioning" as const, label: "Partitioning" },
              ]).map((tab) => (
                <button key={tab.id} onClick={() => setPerfTab(tab.id)}
                  className={`rounded-t border border-b-0 px-3 py-1.5 text-xs transition-all ${perfTab === tab.id ? "border-slate-700 bg-slate-800 text-slate-100" : "border-transparent text-slate-500 hover:text-slate-300"}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab: Slow Queries */}
            {perfTab === "slow-queries" && (
              <div>
                {!slowQueries?.enabled && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="mb-2 text-xs font-medium text-amber-300">pg_stat_statements is not enabled</p>
                    <p className="mb-3 text-[11px] text-slate-400">Enable it to track query execution statistics.</p>
                    <code className="block rounded border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-accent-300">
                      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
                    </code>
                  </div>
                )}
                {slowQueries?.enabled && (
                  <>
                    <div className="mb-3 flex items-center gap-3">
                      <label className="text-[11px] text-slate-500">Min mean time</label>
                      <div className="flex items-center gap-1">
                        {[0, 10, 50, 100, 500].map((v) => (
                          <button key={v} onClick={() => setSlowQueriesFilter(v)}
                            className={`rounded border px-2 py-0.5 text-[10px] transition-all ${slowQueriesFilter === v ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                            {v === 0 ? "All" : `${v}ms`}
                          </button>
                        ))}
                      </div>
                      <span className="ml-auto text-[11px] text-slate-600">{filteredSlowQ.length} queries</span>
                      <button onClick={loadSlowQueries} disabled={isSlowQueriesLoading}
                        className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 disabled:opacity-50">
                        {isSlowQueriesLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={12} />}
                        Refresh
                      </button>
                    </div>
                    <div className="overflow-hidden rounded border border-slate-800">
                      <table className="min-w-full border-collapse text-xs">
                        <thead className="bg-slate-950/70">
                          <tr>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">#</th>
                            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Query</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Calls</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Mean ms</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Total ms</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Rows/call</th>
                            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Cache hit%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSlowQ.map((q, i) => {
                            const qid = String(q.queryid);
                            const isExpanded = expandedSlowQuery === qid;
                            const meanMs = Number(q.mean_ms);
                            return (
                              <tr key={i} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                                <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                                <td className="max-w-xs px-3 py-2">
                                  <button onClick={() => setExpandedSlowQuery(isExpanded ? null : qid)} className="w-full text-left">
                                    <span className={`font-mono text-[11px] ${isExpanded ? "whitespace-pre-wrap text-slate-300" : "truncate text-slate-400"} block`}>
                                      {String(q.query)}
                                    </span>
                                    <span className="mt-0.5 text-[9px] text-slate-600">{isExpanded ? "collapse" : "expand"}</span>
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-right text-slate-300">{Number(q.calls).toLocaleString()}</td>
                                <td className={`px-3 py-2 text-right font-medium ${getMsColor(meanMs)}`}>{String(q.mean_ms)}</td>
                                <td className="px-3 py-2 text-right text-slate-300">{Number(q.total_ms).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-slate-400">{String(q.rows_per_call ?? "--")}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${Number(q.cache_hit_pct) >= 90 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                                    {q.cache_hit_pct != null ? `${q.cache_hit_pct}%` : "--"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredSlowQ.length === 0 && (
                        <p className="py-8 text-center text-sm text-slate-500">No queries matching current filter.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tab: Index Advisor */}
            {perfTab === "index-advisor" && (
              <div className="space-y-4">
                {indexAdvisorError && <p className="text-xs text-amber-300">{indexAdvisorError}</p>}
                <div className="flex items-center justify-between">
                  <div className="grid grid-cols-3 gap-2 flex-1">
                    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Unused Indexes</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">{(indexAdvisor?.unused || []).length}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Missing FK Indexes</p>
                      <p className="mt-1 text-lg font-semibold text-amber-400">{(indexAdvisor?.missingFkIndexes || []).length}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Duplicate Indexes</p>
                      <p className="mt-1 text-lg font-semibold text-red-400">{(indexAdvisor?.duplicates || []).length}</p>
                    </div>
                  </div>
                  <button onClick={loadIndexAdvisor} disabled={isIndexAdvisorLoading}
                    className="truss-btn ml-3 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                    {isIndexAdvisorLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
                    Refresh
                  </button>
                </div>

                {/* Unused indexes */}
                {(indexAdvisor?.unused || []).length > 0 && (
                  <div className="overflow-hidden rounded border border-slate-800">
                    <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                      Unused Indexes (0 scans, not PK/unique)
                    </p>
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Index</th>
                          <th className="px-3 py-2 text-left">Table</th>
                          <th className="px-3 py-2 text-right">Size</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(indexAdvisor?.unused || []).map((row: any, idx: number) => {
                          const dropSql = `DROP INDEX IF EXISTS ${row.schema_name}.${row.index_name};`;
                          return (
                            <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                              <td className="px-3 py-2 font-mono text-[11px]">{row.index_name}</td>
                              <td className="px-3 py-2">{row.schema_name}.{row.table_name}</td>
                              <td className="px-3 py-2 text-right">{formatBytes(Number(row.index_size_bytes || 0))}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => { navigator.clipboard.writeText(dropSql); }}
                                  className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                                  <ClipboardText size={13} /> Copy DROP
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Missing FK indexes */}
                {(indexAdvisor?.missingFkIndexes || []).length > 0 && (
                  <div className="overflow-hidden rounded border border-amber-500/30">
                    <p className="border-b border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                      Missing Indexes on Foreign Key Columns
                    </p>
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Table</th>
                          <th className="px-3 py-2 text-left">FK Column</th>
                          <th className="px-3 py-2 text-left">Constraint</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(indexAdvisor?.missingFkIndexes || []).map((row: any, idx: number) => {
                          const createSql = `CREATE INDEX ON ${row.schema_name}.${row.table_name} (${row.column_name});`;
                          return (
                            <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                              <td className="px-3 py-2">{row.schema_name}.{row.table_name}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{row.column_name}</td>
                              <td className="px-3 py-2 text-slate-500 truncate max-w-[200px]">{row.constraint_name}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => { navigator.clipboard.writeText(createSql); }}
                                  className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                                  <ClipboardText size={13} /> Copy CREATE
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Duplicate indexes */}
                {(indexAdvisor?.duplicates || []).length > 0 && (
                  <div className="overflow-hidden rounded border border-red-500/30">
                    <p className="border-b border-red-500/20 bg-red-950/20 px-3 py-2 text-xs text-red-300">
                      Duplicate Indexes (same columns on same table)
                    </p>
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Table</th>
                          <th className="px-3 py-2 text-left">Index A</th>
                          <th className="px-3 py-2 text-left">Index B</th>
                          <th className="px-3 py-2 text-left">Columns</th>
                          <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(indexAdvisor?.duplicates || []).map((row: any, idx: number) => {
                          const dropSql = `-- Review which index to keep:\nDROP INDEX IF EXISTS ${row.schema_name}.${row.index_b};`;
                          return (
                            <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                              <td className="px-3 py-2">{row.schema_name}.{row.table_name}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{row.index_a}</td>
                              <td className="px-3 py-2 font-mono text-[11px]">{row.index_b}</td>
                              <td className="px-3 py-2 text-slate-500 text-[11px]">{row.columns}</td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => { navigator.clipboard.writeText(dropSql); }}
                                  className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
                                  <ClipboardText size={13} /> Copy DROP
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!indexAdvisor && !isIndexAdvisorLoading && (
                  <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10">
                    <p className="text-sm text-slate-500">Click Refresh to analyze indexes.</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Table Bloat */}
            {perfTab === "bloat" && (
              <div className="space-y-3">
                {bloatError && <p className="text-xs text-amber-300">{bloatError}</p>}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Estimated table bloat from dead tuples. Tables with high dead tuple ratios benefit from VACUUM or REINDEX.</p>
                  <button onClick={loadBloatData} disabled={isBloatLoading}
                    className="truss-btn ml-3 shrink-0 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                    {isBloatLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
                    Refresh
                  </button>
                </div>
                {(bloatData?.tables || []).length > 0 && (
                  <div className="overflow-hidden rounded border border-slate-800">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/70">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Table</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Live Rows</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Dead Rows</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Dead %</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Table Size</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Index Size</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Last Vacuum</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bloatData?.tables || []).map((row: any, idx: number) => {
                          const deadPct = Number(row.dead_pct || 0);
                          const vacuumSql = `VACUUM ANALYZE ${row.schema_name}.${row.table_name};`;
                          const reindexSql = `REINDEX TABLE ${row.schema_name}.${row.table_name};`;
                          const lastVac = row.last_autovacuum || row.last_vacuum;
                          return (
                            <tr key={idx} className={`border-t ${getBloatBg(row.bloat_status)}`}>
                              <td className="px-3 py-2 text-slate-300">{row.schema_name}.{row.table_name}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{Number(row.n_live_tup).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{Number(row.n_dead_tup).toLocaleString()}</td>
                              <td className={`px-3 py-2 text-right font-medium ${getBloatColor(row.bloat_status)}`}>{deadPct}%</td>
                              <td className="px-3 py-2 text-right text-slate-400">{formatBytes(Number(row.table_size_bytes || 0))}</td>
                              <td className="px-3 py-2 text-right text-slate-400">{formatBytes(Number(row.indexes_size_bytes || 0))}</td>
                              <td className="px-3 py-2 text-slate-500 text-[11px]">{lastVac ? new Date(lastVac).toLocaleDateString() : "never"}</td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => { navigator.clipboard.writeText(vacuumSql); }}
                                    className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">
                                    VACUUM
                                  </button>
                                  {deadPct >= 20 && (
                                    <button onClick={() => { navigator.clipboard.writeText(reindexSql); }}
                                      className="truss-btn rounded border border-amber-700/50 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-950/30">
                                      REINDEX
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!bloatData && !isBloatLoading && (
                  <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10">
                    <p className="text-sm text-slate-500">Click Refresh to estimate table bloat.</p>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Partitioning */}
            {perfTab === "partitioning" && (
              <div className="space-y-3">
                {partitioningError && <p className="text-xs text-amber-300">{partitioningError}</p>}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">Analyze tables for partitioning opportunities. Tables over 100 MB or 1M rows are flagged with recommendations.</p>
                  <button onClick={loadPartitioningData} disabled={isPartitioningLoading}
                    className="truss-btn ml-3 shrink-0 rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                    {isPartitioningLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
                    Refresh
                  </button>
                </div>

                {/* Summary cards */}
                {partitioningData && (() => {
                  const tables = partitioningData.tables || [];
                  const partitioned = tables.filter((t: any) => t.is_partitioned).length;
                  const withStrategy = tables.filter((t: any) => t.strategy).length;
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Total Tables</p>
                        <p className="mt-1 text-lg font-semibold text-slate-100">{tables.length}</p>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Already Partitioned</p>
                        <p className="mt-1 text-lg font-semibold text-emerald-400">{partitioned}</p>
                      </div>
                      <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Recommendations</p>
                        <p className="mt-1 text-lg font-semibold text-amber-400">{withStrategy}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Table listing */}
                {(partitioningData?.tables || []).length > 0 && (
                  <div className="overflow-hidden rounded border border-slate-800">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/70">
                        <tr>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Table</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Rows</th>
                          <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Size</th>
                          <th className="px-3 py-2 text-center text-[10px] uppercase tracking-wide text-slate-500">Partitioned?</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Strategy</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Candidate Keys</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(partitioningData?.tables || []).map((row: any, idx: number) => (
                          <tr key={idx} className={`border-t border-slate-800 ${row.is_large && !row.is_partitioned ? "bg-amber-950/10" : "odd:bg-slate-950 even:bg-slate-900/40"}`}>
                            <td className="px-3 py-2 text-slate-300">{row.schemaname}.{row.tablename}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{Number(row.row_count).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-400">{row.total_size}</td>
                            <td className="px-3 py-2 text-center">
                              {row.is_partitioned
                                ? <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">Yes</span>
                                : <span className="rounded border border-slate-700 bg-slate-800/50 px-1.5 py-0.5 text-[10px] text-slate-500">No</span>}
                            </td>
                            <td className="px-3 py-2">
                              {row.strategy
                                ? <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${row.strategy === "range" ? "border-accent-500/30 bg-accent-500/10 text-accent-300" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"}`}>
                                    {row.strategy.toUpperCase()}
                                  </span>
                                : <span className="text-slate-600">--</span>}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500">
                              {(row.candidate_keys || []).map((k: any) => k.column).join(", ") || "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Recommendation cards for large unpartitioned tables */}
                {(partitioningData?.tables || []).filter((t: any) => t.strategy).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-medium text-slate-300">Recommendations</h3>
                    {(partitioningData?.tables || []).filter((t: any) => t.strategy).map((row: any, idx: number) => (
                      <div key={idx} className="rounded border border-amber-500/30 bg-amber-950/10 p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-slate-200">{row.schemaname}.{row.tablename}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{row.total_size} / {Number(row.row_count).toLocaleString()} rows</p>
                          </div>
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${row.strategy === "range" ? "border-accent-500/30 bg-accent-500/10 text-accent-300" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"}`}>
                            PARTITION BY {row.strategy.toUpperCase()}
                          </span>
                        </div>
                        <p className="mb-3 text-[11px] text-slate-400">{row.reason}</p>
                        <div className="relative rounded border border-slate-700 bg-slate-950 p-3">
                          <pre className="overflow-x-auto text-[11px] leading-relaxed text-accent-300 font-mono">{row.example_ddl}</pre>
                          <button
                            onClick={() => { navigator.clipboard.writeText(row.example_ddl); }}
                            className="truss-btn absolute right-2 top-2 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">
                            <ClipboardText size={13} /> Copy SQL
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!partitioningData && !isPartitioningLoading && (
                  <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10">
                    <p className="text-sm text-slate-500">Click Refresh to analyze table partitioning.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      if (databaseView === "slow-queries") {
        const filtered = (slowQueries?.queries || []).filter(
          (q) => Number(q.mean_ms) >= slowQueriesFilter
        );
        const getMsColor = (ms: number) =>
          ms >= 500 ? "text-red-300" : ms >= 100 ? "text-amber-300" : "text-emerald-300";

        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-slate-100">Slow Query Insights</h2>
                {slowQueries && (
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${slowQueries.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                    {slowQueries.enabled ? "pg_stat_statements active" : "pg_stat_statements not installed"}
                  </span>
                )}
              </div>
              <button onClick={loadSlowQueries} disabled={isSlowQueriesLoading}
                className="truss-btn rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                {isSlowQueriesLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} />}
                Refresh
              </button>
            </div>

            {slowQueriesError && <p className="mb-3 text-xs text-amber-300">{slowQueriesError}</p>}

            {!slowQueries && !isSlowQueriesLoading && (
              <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10">
                <p className="text-sm text-slate-500">Click Refresh to load query statistics.</p>
              </div>
            )}

            {slowQueries && !slowQueries.enabled && (
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="mb-2 text-xs font-medium text-amber-300">pg_stat_statements is not enabled</p>
                <p className="mb-3 text-[11px] text-slate-400">Enable it to track query execution statistics across your database.</p>
                <code className="block rounded border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-accent-300">
                  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;<br />
                  -- Also add to postgresql.conf: shared_preload_libraries = 'pg_stat_statements'
                </code>
              </div>
            )}

            {slowQueries?.enabled && (
              <>
                {/* Summary stat cards */}
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Queries Tracked</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{slowQueries.queries.length}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Slowest Mean</p>
                    <p className={`mt-1 text-lg font-semibold ${getMsColor(Number(slowQueries.queries[0]?.mean_ms || 0))}`}>
                      {slowQueries.queries[0] ? `${slowQueries.queries[0].mean_ms} ms` : "—"}
                    </p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">Highest Total Time</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {slowQueries.queries[0] ? `${Number(slowQueries.queries[0].total_ms).toLocaleString()} ms` : "—"}
                    </p>
                  </div>
                </div>

                {/* Min mean ms filter */}
                <div className="mb-3 flex items-center gap-3">
                  <label className="text-[11px] text-slate-500">Show queries with mean ≥</label>
                  <div className="flex items-center gap-1">
                    {[0, 10, 50, 100, 500].map((v) => (
                      <button key={v} onClick={() => setSlowQueriesFilter(v)}
                        className={`rounded border px-2 py-0.5 text-[10px] transition-all ${slowQueriesFilter === v ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                        {v === 0 ? "All" : `${v}ms`}
                      </button>
                    ))}
                  </div>
                  <span className="ml-auto text-[11px] text-slate-600">{filtered.length} queries</span>
                </div>

                {/* Query table */}
                <div className="overflow-hidden rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">#</th>
                        <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Query</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Calls</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Mean ms</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Max ms</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Total ms</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Rows/call</th>
                        <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Cache hit%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((q, i) => {
                        const qid = String(q.queryid);
                        const isExpanded = expandedSlowQuery === qid;
                        const meanMs = Number(q.mean_ms);
                        return (
                          <tr key={i} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                            <td className="px-3 py-2 text-slate-600">{i + 1}</td>
                            <td className="max-w-xs px-3 py-2">
                              <button onClick={() => setExpandedSlowQuery(isExpanded ? null : qid)}
                                className="w-full text-left">
                                <span className={`font-mono text-[11px] ${isExpanded ? "whitespace-pre-wrap text-slate-300" : "truncate text-slate-400"} block`}>
                                  {String(q.query)}
                                </span>
                                <span className="mt-0.5 text-[9px] text-slate-600">{isExpanded ? "▲ collapse" : "▼ expand"}</span>
                              </button>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-300">{Number(q.calls).toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right font-medium ${getMsColor(meanMs)}`}>{String(q.mean_ms)}</td>
                            <td className="px-3 py-2 text-right text-slate-400">{String(q.max_ms)}</td>
                            <td className="px-3 py-2 text-right text-slate-300">{Number(q.total_ms).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-400">{String(q.rows_per_call ?? "—")}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] ${Number(q.cache_hit_pct) >= 90 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                                {q.cache_hit_pct != null ? `${q.cache_hit_pct}%` : "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="py-8 text-center text-sm text-slate-500">No queries matching current filter.</p>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }

      if (databaseView === "security-advisor") {
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-100">Security Advisor</h2>
                <button
                  onClick={loadSecurityAdvisor}
                  disabled={isSecurityAdvisorLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSecurityAdvisorLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                  Refresh
                </button>
              </div>
              {securityAdvisorInfo && <p className="mb-3 text-xs text-emerald-300">{securityAdvisorInfo}</p>}
              {securityAdvisorError && <p className="mb-3 text-xs text-amber-300">{securityAdvisorError}</p>}
              <div className="space-y-3 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <p className="text-slate-300">Tables without RLS</p>
                  <p className="mt-1 text-slate-500">
                    {(securityAdvisor?.tablesWithoutRls || []).length} table(s) with row level security disabled.
                  </p>
                  {(securityAdvisor?.tablesWithoutRls || []).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {(securityAdvisor?.tablesWithoutRls || []).map((row, idx) => {
                        const schema = String(row.schema_name || "public");
                        const table = String(row.table_name || "");
                        const fixSql = `alter table ${schema}.${table} enable row level security;`;
                        return (
                          <div
                            key={`${schema}.${table}.${idx}`}
                            className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5"
                          >
                            <span className="truncate text-[11px] text-slate-300">
                              {schema}.{table}
                            </span>
                            <button
                              onClick={() => {
                                setSecurityAdvisorInfo("");
                                setSecurityAdvisorError("");
                                copyText(
                                  fixSql,
                                  setSecurityAdvisorInfo,
                                  setSecurityAdvisorError,
                                  `Copied fix SQL for ${schema}.${table}`
                                );
                              }}
                              className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                            >
                              <ClipboardText size={13} />
                              Copy Fix SQL
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <p className="text-slate-300">Public schema ACL</p>
                  <p className="mt-1 break-all text-slate-500">
                    {String(securityAdvisor?.publicSchemaAcl?.acl || "Not available")}
                  </p>
                  <button
                    onClick={() => {
                      const revokeSql =
                        "revoke create on schema public from public;\nrevoke usage on schema public from public;";
                      setSecurityAdvisorInfo("");
                      setSecurityAdvisorError("");
                      copyText(
                        revokeSql,
                        setSecurityAdvisorInfo,
                        setSecurityAdvisorError,
                        "Copied public schema hardening SQL"
                      );
                    }}
                    className="truss-btn mt-2 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                  >
                    <ClipboardText size={13} />
                    Copy Hardening SQL
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      if (databaseView === "performance-advisor") {
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-100">Performance Advisor</h2>
                <button
                  onClick={loadPerformanceAdvisor}
                  disabled={isPerformanceAdvisorLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPerformanceAdvisorLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                  Refresh
                </button>
              </div>
              {performanceAdvisorInfo && <p className="mb-3 text-xs text-emerald-300">{performanceAdvisorInfo}</p>}
              {performanceAdvisorError && <p className="mb-3 text-xs text-amber-300">{performanceAdvisorError}</p>}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <p className="mb-2 text-xs text-slate-300">Unused Indexes</p>
                  <p className="text-[11px] text-slate-500">
                    {(performanceAdvisor?.unusedIndexes || []).length} potential cleanup candidate(s)
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <p className="mb-2 text-xs text-slate-300">High Dead Tuple Tables</p>
                  <p className="text-[11px] text-slate-500">
                    {(performanceAdvisor?.deadTupleTables || []).length} table(s) tracked for bloat risk
                  </p>
                </div>
              </div>
              {(performanceAdvisor?.unusedIndexes || []).length > 0 && (
                <div className="mt-4 overflow-auto rounded border border-slate-800">
                  <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                    Unused Indexes
                  </p>
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/60 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Index</th>
                        <th className="px-3 py-2 text-left">Table</th>
                        <th className="px-3 py-2 text-right">Scans</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(performanceAdvisor?.unusedIndexes || []).map((row, idx) => {
                        const schema = String(row.schema_name || "public");
                        const index = String(row.index_name || "");
                        const dropSql = `drop index if exists ${schema}.${index};`;
                        return (
                          <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                            <td className="px-3 py-2">{index}</td>
                            <td className="px-3 py-2">
                              {String(row.schema_name || "public")}.{String(row.table_name || "-")}
                            </td>
                            <td className="px-3 py-2 text-right">{String(row.idx_scan || "0")}</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  setPerformanceAdvisorInfo("");
                                  setPerformanceAdvisorError("");
                                  copyText(
                                    dropSql,
                                    setPerformanceAdvisorInfo,
                                    setPerformanceAdvisorError,
                                    `Copied review SQL for index ${index}`
                                  );
                                }}
                                className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              >
                                <ClipboardText size={13} />
                                Copy SQL
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {(performanceAdvisor?.deadTupleTables || []).length > 0 && (
                <div className="mt-4 overflow-auto rounded border border-slate-800">
                  <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                    Dead Tuple Hotspots
                  </p>
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/60 text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Table</th>
                        <th className="px-3 py-2 text-right">Live</th>
                        <th className="px-3 py-2 text-right">Dead</th>
                        <th className="px-3 py-2 text-right">Dead %</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(performanceAdvisor?.deadTupleTables || []).map((row, idx) => {
                        const schema = String(row.schema_name || "public");
                        const table = String(row.table_name || "");
                        const vacuumSql = `vacuum analyze ${schema}.${table};`;
                        return (
                          <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                            <td className="px-3 py-2">
                              {schema}.{table}
                            </td>
                            <td className="px-3 py-2 text-right">{String(row.n_live_tup || "0")}</td>
                            <td className="px-3 py-2 text-right">{String(row.n_dead_tup || "0")}</td>
                            <td className="px-3 py-2 text-right">{String(row.dead_pct || "0")}%</td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => {
                                  setPerformanceAdvisorInfo("");
                                  setPerformanceAdvisorError("");
                                  copyText(
                                    vacuumSql,
                                    setPerformanceAdvisorInfo,
                                    setPerformanceAdvisorError,
                                    `Copied maintenance SQL for ${schema}.${table}`
                                  );
                                }}
                                className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                              >
                                <ClipboardText size={13} />
                                Copy SQL
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      }

      if (databaseView === "platform-migrations") {
        const stateBadge = (state: string) => {
          switch (state) {
            case "applied": return "bg-emerald-400/10 text-emerald-300";
            case "pending": return "bg-sky-400/15 text-sky-300";
            case "modified": return "bg-amber-400/15 text-amber-300";
            case "orphaned": return "bg-red-400/15 text-red-300";
            default: return "bg-slate-700 text-slate-300";
          }
        };
        const iStatus = idempotentStatus;
        const sum = iStatus?.summary || { applied: 0, pending: 0, modified: 0, orphaned: 0 };

        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-slate-100">Migration Runner</h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">Idempotent migration state detection with fingerprint matching</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={runMigrationSafetyCheck}
                      disabled={isMigrationChecking}
                      className="truss-btn rounded border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-xs text-amber-200 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isMigrationChecking ? <span className="truss-spinner" /> : <Warning size={13} />}
                      Safety Check
                    </button>
                    <button
                      onClick={() => { loadMigrationStatus(); loadIdempotentStatus(); }}
                      disabled={isMigrationStatusLoading || isIdempotentLoading}
                      className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {(isMigrationStatusLoading || isIdempotentLoading) ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                      Refresh
                    </button>
                    <button
                      onClick={() => runIdempotentMigrations()}
                      disabled={idempotentRunning || sum.pending === 0}
                      className="truss-btn rounded border border-accent-400/60 bg-accent-400/10 px-3 py-2 text-xs text-accent-200 hover:bg-accent-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {idempotentRunning ? <span className="truss-spinner" /> : <Play size={13} />}
                      Run Pending
                    </button>
                  </div>
                </div>

                {/* Framework detection badge */}
                {iStatus && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    {iStatus.framework ? (
                      <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5">
                        <CheckCircle size={14} weight="fill" className="text-emerald-400" />
                        <span className="text-xs text-emerald-300">Detected: <strong>{iStatus.framework}</strong></span>
                        <span className="text-[10px] text-slate-500">({iStatus.tracking_table})</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-3 py-1.5">
                        <Warning size={14} className="text-slate-500" />
                        <span className="text-xs text-slate-400">No migration tracking table detected</span>
                      </div>
                    )}
                    {iStatus.detected_tables.length > 1 && (
                      <span className="text-[10px] text-slate-500">
                        +{iStatus.detected_tables.length - 1} other tracking table(s) found
                      </span>
                    )}
                  </div>
                )}

                {/* Summary cards */}
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                    <p className="text-slate-500">Applied</p>
                    <p className="mt-0.5 text-lg font-semibold text-emerald-300">{sum.applied}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                    <p className="text-slate-500">Pending</p>
                    <p className="mt-0.5 text-lg font-semibold text-sky-300">{sum.pending}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                    <p className="text-slate-500">Modified</p>
                    <p className={`mt-0.5 text-lg font-semibold ${sum.modified > 0 ? "text-amber-300" : "text-slate-600"}`}>{sum.modified}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                    <p className="text-slate-500">Orphaned</p>
                    <p className={`mt-0.5 text-lg font-semibold ${sum.orphaned > 0 ? "text-red-300" : "text-slate-600"}`}>{sum.orphaned}</p>
                  </div>
                </div>
              </div>

              {/* Error / result messages */}
              {(idempotentError || migrationError) && (
                <div className="rounded border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xs text-red-300">{idempotentError || migrationError}</p>
                  {idempotentResult?.failed && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] text-red-200">Failed migration: <strong>{idempotentResult.failed.name}</strong></p>
                      <p className="text-[11px] text-red-200/80">{idempotentResult.failed.error}</p>
                      {idempotentResult.failed.statement && (
                        <pre className="mt-1 max-h-40 overflow-auto rounded border border-red-900/30 bg-red-950/20 p-2 text-[10px] text-red-200/70">{idempotentResult.failed.statement}</pre>
                      )}
                    </div>
                  )}
                  <button onClick={() => { setIdempotentError(""); setIdempotentResult(null); }} className="mt-2 text-[10px] text-slate-500 hover:text-white">Dismiss</button>
                </div>
              )}
              {idempotentResult?.ok && (
                <div className="rounded border border-emerald-400/30 bg-emerald-400/10 p-3">
                  <p className="text-xs text-emerald-300">{idempotentResult.summary}</p>
                  {idempotentResult.applied.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {idempotentResult.applied.map((item) => (
                        <p key={item.name} className="text-[11px] text-emerald-200">
                          {item.name}
                        </p>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setIdempotentResult(null)} className="mt-2 text-[10px] text-slate-500 hover:text-white">Dismiss</button>
                </div>
              )}

              {/* Safety check results */}
              {migrationSafetyCheck && (
                <div className={`rounded border p-3 ${(migrationSafetyCheck.warnings as string[])?.length > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200">Safety Check Results</p>
                    <button onClick={() => setMigrationSafetyCheck(null)} className="text-slate-500 hover:text-white text-sm">{"\u00D7"}</button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 mb-2">
                    <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                      <p className="text-slate-500">Open Locks</p>
                      <p className={`mt-0.5 ${Number(migrationSafetyCheck.openLocks) > 0 ? "text-amber-300" : "text-slate-200"}`}>{String(migrationSafetyCheck.openLocks)}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                      <p className="text-slate-500">Active Transactions</p>
                      <p className={`mt-0.5 ${Number(migrationSafetyCheck.activeTransactions) > 0 ? "text-amber-300" : "text-slate-200"}`}>{String(migrationSafetyCheck.activeTransactions)}</p>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                      <p className="text-slate-500">Pending Migrations</p>
                      <p className="mt-0.5 text-slate-200">{String(migrationSafetyCheck.pendingCount)}</p>
                    </div>
                  </div>
                  {(migrationSafetyCheck.warnings as string[])?.length > 0 ? (
                    <div className="space-y-1">
                      {(migrationSafetyCheck.warnings as string[]).map((w: string, i: number) => (
                        <p key={i} className="flex items-start gap-2 text-xs text-amber-300">
                          <Warning size={13} className="mt-0.5 shrink-0" />
                          {w}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                      <CheckCircle size={13} weight="fill" />
                      All clear — safe to run migrations.
                    </p>
                  )}
                </div>
              )}

              {/* Migration preview */}
              {migrationPreview && (
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200">Preview: {migrationPreview.filename}</p>
                    <button onClick={() => setMigrationPreview(null)} className="text-slate-500 hover:text-white text-sm">{"\u00D7"}</button>
                  </div>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-slate-900/40 p-3 text-[11px] text-slate-300">{migrationPreview.content}</pre>
                </div>
              )}

              {/* Schema detection results */}
              {migrationDiffTarget && schemaDetection[migrationDiffTarget] && (
                <div className="rounded border border-slate-800 bg-slate-950 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200">Schema Detection: {migrationDiffTarget}</p>
                    <button onClick={() => setMigrationDiffTarget(null)} className="text-slate-500 hover:text-white text-sm">{"\u00D7"}</button>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-400">{schemaDetection[migrationDiffTarget].recommendation}</p>
                  {schemaDetection[migrationDiffTarget].findings.length > 0 && (
                    <div className="space-y-1">
                      {schemaDetection[migrationDiffTarget].findings.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          {f.exists ? (
                            <CheckCircle size={12} weight="fill" className="text-emerald-400 shrink-0" />
                          ) : (
                            <Plus size={12} className="text-sky-400 shrink-0" />
                          )}
                          <span className={f.exists ? "text-emerald-300" : "text-sky-300"}>{f.type}: {f.name}</span>
                          <span className="text-slate-600">{f.exists ? "(exists)" : "(new)"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {schemaDetection[migrationDiffTarget].all_objects_exist && (
                    <button
                      onClick={() => { markMigrationApplied(migrationDiffTarget); setMigrationDiffTarget(null); }}
                      className="truss-btn mt-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20"
                    >
                      <Stamp size={13} />
                      Mark as Applied
                    </button>
                  )}
                </div>
              )}

              {/* Create migration section */}
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs font-medium text-slate-200 mb-2">Create Migration</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={newMigrationName}
                    onChange={(event) => setNewMigrationName(event.target.value)}
                    placeholder="new-feature-name"
                    className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                    onKeyDown={(e) => { if (e.key === "Enter") createMigrationFile(); }}
                  />
                  <button
                    onClick={createMigrationFile}
                    disabled={isMigrationCreating}
                    className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isMigrationCreating ? <span className="truss-spinner" /> : <Plus size={13} />}
                    Create Migration File
                  </button>
                </div>
                {migrationInfo && (
                  <div className="mt-2 rounded border border-emerald-400/30 bg-emerald-400/10 p-2">
                    <p className="text-[11px] text-emerald-300">{migrationInfo}</p>
                  </div>
                )}
              </div>

              {/* Migration list */}
              {isIdempotentLoading && !iStatus ? (
                <div className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/40 p-6 justify-center">
                  <span className="truss-spinner" />
                  <span className="text-xs text-slate-400">Scanning migration state...</span>
                </div>
              ) : iStatus?.migrations?.length ? (
                <div className="overflow-auto rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Migration</th>
                        <th className="px-3 py-2 text-left">State</th>
                        <th className="px-3 py-2 text-left">Applied At</th>
                        <th className="px-3 py-2 text-left">Hash Match</th>
                        <th className="px-3 py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {iStatus.migrations.map((row) => (
                        <tr key={row.name} className="border-t border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900/60">
                          <td className="max-w-[360px] truncate px-3 py-2 text-cyan-300 cursor-pointer hover:underline" onClick={() => loadMigrationPreview(row.name)}>
                            {row.name}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${stateBadge(row.state)}`}>
                              {row.state}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {row.applied_at ? new Date(row.applied_at).toLocaleString() : "-"}
                          </td>
                          <td className="px-3 py-2">
                            {row.state === "applied" && row.file_hash && row.stored_hash ? (
                              row.stored_hash === row.file_hash ? (
                                <CheckCircle size={14} weight="fill" className="text-emerald-400" />
                              ) : (
                                <Warning size={14} className="text-amber-400" />
                              )
                            ) : row.state === "applied" ? (
                              <span className="text-[10px] text-slate-600">n/a</span>
                            ) : row.state === "modified" ? (
                              <Warning size={14} className="text-amber-400" />
                            ) : (
                              <span className="text-[10px] text-slate-600">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              {row.state !== "orphaned" && (
                                <button
                                  onClick={() => loadMigrationPreview(row.name)}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                                  title="Preview SQL"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                              {row.state === "pending" && (
                                <>
                                  <button
                                    onClick={() => { detectMigrationSchema(row.name); setMigrationDiffTarget(row.name); }}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                                    title="Detect existing schema objects"
                                  >
                                    <ArrowsLeftRight size={14} />
                                  </button>
                                  <button
                                    onClick={() => markMigrationApplied(row.name)}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                                    title="Mark as applied without running"
                                  >
                                    <Stamp size={14} />
                                  </button>
                                  <button
                                    onClick={() => runIdempotentMigrations([row.name])}
                                    disabled={idempotentRunning}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-accent-300 disabled:opacity-50"
                                    title="Run this migration"
                                  >
                                    <Play size={14} />
                                  </button>
                                </>
                              )}
                              {row.state === "modified" && (
                                <button
                                  onClick={() => loadMigrationPreview(row.name)}
                                  className="rounded p-1 text-amber-500 hover:bg-slate-800 hover:text-amber-300"
                                  title="View modified migration"
                                >
                                  <Warning size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
                  <HardDrives size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm text-slate-400">No migration files found</p>
                  <p className="mt-1 text-[11px] text-slate-600">Create a migration file above, or add SQL files to db/migrations/</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      if (databaseView === "overview") {
        const codeTheme = themeMode === "light" ? atomOneLight : atomOneDark;
        const parsed = (() => {
          try {
            const url = new URL(currentConnection?.maskedUrl || "");
            return {
              host: url.hostname || "localhost",
              port: url.port || "5432",
              database: url.pathname.replace(/^\//, "") || currentConnection?.connection?.database_name || "postgres",
              user: url.username || currentConnection?.connection?.db_user || "postgres",
            };
          } catch {
            return {
              host: "localhost",
              port: "5432",
              database: currentConnection?.connection?.database_name || "postgres",
              user: currentConnection?.connection?.db_user || "postgres",
            };
          }
        })();
        const pw = connStrPassword || "[password]";
        const { host, port, database, user } = parsed;
        const baseUrl = `postgresql://${user}:${pw}@${host}:${port}/${database}`;
        const ci = connInspector;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formatUptime = (u: any) => {
          if (!u) return "-";
          if (typeof u === "string") return u.split(".")[0];
          const parts: string[] = [];
          if (u.days) parts.push(`${u.days}d`);
          if (u.hours) parts.push(`${u.hours}h`);
          if (u.minutes) parts.push(`${u.minutes}m`);
          if (parts.length === 0 && u.seconds) parts.push(`${Math.floor(u.seconds)}s`);
          return parts.join(" ") || "0s";
        };
        const formatBytes = (bytes: number) => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };

        type ConnBlock = { label: string; lang: string; note?: string; code: string };
        const snippetTabs: Record<string, ConnBlock[]> = {
          direct: [
            { label: "DATABASE_URL", lang: "bash", code: `DATABASE_URL="${baseUrl}"` },
            { label: "psql CLI", lang: "bash", code: `psql "${baseUrl}"` },
            { label: "Connection Parameters", lang: "bash", code: `PGHOST="${host}"\nPGPORT="${port}"\nPGDATABASE="${database}"\nPGUSER="${user}"\nPGPASSWORD="${pw}"` },
          ],
          orms: [
            {
              label: "Prisma",
              lang: "javascript",
              note: "Use DIRECT_URL for migrations to avoid the P1001 pooler error. Use DATABASE_URL (with ?pgbouncer=true) for runtime queries.",
              code: `// .env\nDATABASE_URL="${baseUrl}?pgbouncer=true"\nDIRECT_URL="${baseUrl}"\n\n// schema.prisma\ndatasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}`,
            },
            { label: "Drizzle ORM", lang: "typescript", code: `import { drizzle } from "drizzle-orm/node-postgres";\nimport { Pool } from "pg";\n\nconst pool = new Pool({ connectionString: "${baseUrl}" });\nexport const db = drizzle(pool);` },
            { label: "Kysely", lang: "typescript", code: `import { Kysely, PostgresDialect } from "kysely";\nimport { Pool } from "pg";\n\nconst db = new Kysely<Database>({\n  dialect: new PostgresDialect({\n    pool: new Pool({ connectionString: "${baseUrl}" }),\n  }),\n});` },
          ],
          frameworks: [
            { label: "Node.js — pg", lang: "javascript", code: `import { Pool } from "pg";\n\nconst pool = new Pool({\n  host: "${host}",\n  port: ${port},\n  database: "${database}",\n  user: "${user}",\n  password: "${pw}",\n});\n\nexport default pool;` },
            { label: "Go — pgx", lang: "go", code: `import "github.com/jackc/pgx/v5/pgxpool"\n\npool, err := pgxpool.New(ctx, "${baseUrl}")` },
            { label: "Python — SQLAlchemy", lang: "python", code: `from sqlalchemy import create_engine\n\nengine = create_engine(\n    "postgresql+psycopg2://${user}:${pw}@${host}:${port}/${database}"\n)` },
            { label: "Python — psycopg2", lang: "python", code: `import psycopg2\n\nconn = psycopg2.connect(\n    host="${host}", port=${port},\n    dbname="${database}",\n    user="${user}", password="${pw}"\n)` },
            { label: "JDBC", lang: "java", code: `String url = "jdbc:postgresql://${host}:${port}/${database}";\nProperties props = new Properties();\nprops.setProperty("user", "${user}");\nprops.setProperty("password", "${pw}");\nConnection conn = DriverManager.getConnection(url, props);` },
          ],
        };
        const blocks = snippetTabs[connStrTab] || [];

        const handleCopy = (label: string, code: string) => {
          copyText(code, () => {
            setCopiedBlock(label);
            setTimeout(() => setCopiedBlock(null), 2000);
          }, () => {}, "Copied!");
        };

        const sectionNav: Array<{ id: "overview" | "snippets" | "pool" | "extensions"; icon: React.ReactNode; tip: string }> = [
          { id: "overview", icon: <Waveform size={18} weight="regular" />, tip: "Overview" },
          { id: "snippets", icon: <Code size={18} weight="regular" />, tip: "Snippets" },
          { id: "pool", icon: <HardDrives size={18} weight="regular" />, tip: "Pool" },
          { id: "extensions", icon: <PlugsConnected size={18} weight="regular" />, tip: "Extensions" },
        ];

        return (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Sticky status strip */}
            <div className="sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${currentConnection ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-slate-600"}`} />
              <span className="text-xs font-medium text-slate-300">
                {currentConnection ? `${user}@${host}:${port}/${database}` : "No active connection"}
              </span>
              {ci && (
                <div className="ml-auto flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><Lightning size={11} weight="fill" className="text-emerald-400" />{ci.pingMs}ms</span>
                  <span className="flex items-center gap-1"><Database size={11} weight="regular" />{formatBytes(ci.database.size_bytes)}</span>
                  <span className="flex items-center gap-1"><Table size={11} weight="regular" />{ci.database.user_tables} tables</span>
                  <span className="flex items-center gap-1"><ClockCounterClockwise size={11} weight="regular" />{formatUptime(ci.uptime.uptime)}</span>
                </div>
              )}
              <button
                onClick={() => { setConnInspector(null); loadConnInspector(); }}
                disabled={isConnInspectorLoading}
                title="Refresh stats"
                className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-all hover:bg-slate-800/60 hover:text-slate-300 disabled:opacity-40"
              >
                {isConnInspectorLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />}
              </button>
            </div>

            {connInspectorError && <p className="px-4 py-2 text-xs text-amber-300">{connInspectorError}</p>}

            {/* All sections stacked */}
            <div className="p-4 space-y-6">
              {/* Server Overview — compact, no heavy cards */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium flex items-center gap-2">
                  <Waveform size={14} weight="regular" /> Server
                </h3>
                {isConnInspectorLoading && !ci && <p className="text-xs text-slate-500">Loading...</p>}
                {ci && (
                  <>
                    {/* Compact key-value grid — no borders, no cards */}
                    <div className="grid gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 text-xs">
                      {[
                        { label: "Database", value: ci.connection.database_name },
                        { label: "User", value: ci.connection.db_user },
                        { label: "Schema", value: ci.connection.current_schema },
                        { label: "Address", value: ci.connection.server_addr ? `${ci.connection.server_addr}:${ci.connection.server_port}` : "local" },
                        { label: "Encoding", value: ci.database.server_encoding },
                        { label: "Timezone", value: ci.database.timezone },
                        { label: "Version", value: ci.connection.server_version },
                      ].map((item) => (
                        <div key={item.label}>
                          <span className="text-slate-500">{item.label}</span>
                          <p className="text-slate-200 font-mono truncate">{item.value || "-"}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>

              {/* Connection Strings */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium flex items-center gap-2">
                  <Code size={14} weight="regular" /> Connection Strings
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {(["direct", "orms", "frameworks"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setConnStrTab(tab)}
                        className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-all ${
                          connStrTab === tab
                            ? "bg-accent-500/15 text-accent-400"
                            : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                        }`}
                      >
                        {tab === "direct" ? "Direct" : tab === "orms" ? "ORMs" : "Frameworks"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 rounded border border-slate-700/50 bg-slate-950 px-2.5 py-1.5">
                    <LockKey size={12} className="text-slate-600" />
                    <input
                      type="password"
                      value={connStrPassword}
                      onChange={(e) => setConnStrPassword(e.target.value)}
                      placeholder="password"
                      className="w-32 bg-transparent text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {blocks.map((block) => {
                    const isCopied = copiedBlock === block.label;
                    return (
                      <div key={block.label} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
                        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2">
                          <span className="text-[11px] font-medium text-slate-300">{block.label}</span>
                          <button
                            onClick={() => handleCopy(block.label, block.code)}
                            className={`truss-btn flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] font-medium transition-all duration-200 ${
                              isCopied
                                ? "border-accent-500/50 bg-accent-500/10 text-accent-400"
                                : "border-slate-700 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                          >
                            {isCopied ? (
                              <>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Copied!
                              </>
                            ) : (
                              <>
                                <ClipboardText size={11} />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                        {block.note && (
                          <div className="border-b border-amber-500/20 bg-amber-500/5 px-3 py-2">
                            <p className="text-[10px] leading-relaxed text-amber-400">{block.note}</p>
                          </div>
                        )}
                        <SyntaxHighlighter
                          language={block.lang}
                          style={codeTheme}
                          customStyle={{ margin: 0, padding: "12px 14px", background: "transparent", fontSize: "11px", lineHeight: "1.6" }}
                          wrapLongLines
                        >
                          {block.code}
                        </SyntaxHighlighter>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Connection Pool */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium flex items-center gap-2">
                  <HardDrives size={14} weight="regular" /> Connection Pool
                </h3>
                {isConnInspectorLoading && !ci && <p className="text-xs text-slate-500">Loading pool stats...</p>}
                {ci && (
                  <>
                    {/* Pool utilization bar */}
                    {(() => {
                      const used = ci.pool.active + ci.pool.idle_in_transaction;
                      const max = ci.pool.max_connections || 100;
                      const pct = Math.min(100, Math.round((used / max) * 100));
                      const color = pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500";
                      return (
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="text-slate-400">Connection Utilization</span>
                            <span className="font-mono text-slate-200">{used} / {max} <span className="text-slate-500">({pct}%)</span></span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Postgres pool */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-3.5 py-2">
                        <Database size={14} weight="regular" className="text-slate-400" />
                        <span className="text-[11px] font-semibold text-slate-300">Postgres Connections</span>
                      </div>
                      <div className="grid gap-2.5 p-3.5 sm:grid-cols-5">
                        {[
                          { label: "Total", value: ci.pool.total_connections, icon: <Users size={15} weight="regular" className="text-slate-400" /> },
                          { label: "Active", value: ci.pool.active, icon: <Play size={15} weight="fill" className="text-emerald-400" /> },
                          { label: "Idle", value: ci.pool.idle, icon: <Pause size={15} weight="fill" className="text-sky-400" /> },
                          { label: "Idle in Tx", value: ci.pool.idle_in_transaction, icon: <Warning size={15} weight="regular" className="text-amber-400" /> },
                          { label: "Max", value: ci.pool.max_connections, icon: <Prohibit size={15} weight="regular" className="text-slate-500" /> },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900/50 p-2.5">
                            {item.icon}
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-slate-500">{item.label}</p>
                              <p className="text-sm font-semibold text-slate-200">{item.value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Node pool */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/60 px-3.5 py-2">
                        <Cpu size={14} weight="regular" className="text-slate-400" />
                        <span className="text-[11px] font-semibold text-slate-300">Node.js Pool (pg)</span>
                      </div>
                      <div className="grid gap-2.5 p-3.5 sm:grid-cols-3">
                        {[
                          { label: "Total", value: ci.nodePool.totalCount, icon: <Users size={15} weight="regular" className="text-slate-400" /> },
                          { label: "Idle", value: ci.nodePool.idleCount, icon: <Pause size={15} weight="fill" className="text-sky-400" /> },
                          { label: "Waiting", value: ci.nodePool.waitingCount, icon: <ClockCounterClockwise size={15} weight="regular" className="text-amber-400" /> },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900/50 p-2.5">
                            {item.icon}
                            <div>
                              <p className="text-[9px] uppercase tracking-wider text-slate-500">{item.label}</p>
                              <p className="text-sm font-semibold text-slate-200">{item.value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>

              {/* Installed Extensions */}
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 font-medium flex items-center gap-2">
                  <PlugsConnected size={14} weight="regular" /> Installed Extensions
                </h3>
                {isConnInspectorLoading && !ci && <p className="text-xs text-slate-500">Loading extensions...</p>}
                {ci?.extensions?.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ci.extensions.map((ext: { extname: string; extversion: string }) => (
                      <div key={ext.extname} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
                        <PlugsConnected size={15} weight="regular" className="shrink-0 text-emerald-400/70" />
                        <div>
                          <p className="text-xs font-medium text-slate-200">{ext.extname}</p>
                          <p className="text-[10px] text-slate-500">v{ext.extversion}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : ci ? (
                  <p className="py-8 text-center text-xs text-slate-500">No extensions installed.</p>
                ) : null}
              </section>
            </div>
          </div>
        );
      }

      if (databaseView === "autovacuum") {
        const formatBytes = (bytes: number) => {
          if (bytes < 1024) return `${bytes} B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        const av = autovacuumData;
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-100">Autovacuum Health</h2>
              <button
                onClick={() => { setAutovacuumData(null); loadAutovacuum(); }}
                disabled={isAutovacuumLoading}
                className="truss-btn rounded border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAutovacuumLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                Refresh
              </button>
            </div>
            {autovacuumError && <p className="mb-3 text-xs text-amber-300">{autovacuumError}</p>}
            {isAutovacuumLoading && !av && <p className="text-xs text-slate-500">Loading...</p>}
            {av && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <p className="text-slate-500">Tables</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{av.tables.length}</p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <p className="text-slate-500">Total Dead Tuples</p>
                    <p className="mt-1 text-lg font-semibold text-amber-400">
                      {av.tables.reduce((s: number, t: { dead_tuples: number }) => s + t.dead_tuples, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <p className="text-slate-500">Tables &gt; 10% Dead</p>
                    <p className="mt-1 text-lg font-semibold text-red-400">
                      {av.tables.filter((t: { dead_pct: number }) => t.dead_pct > 10).length}
                    </p>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <p className="text-slate-500">Never Vacuumed</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {av.tables.filter((t: { last_autovacuum: string | null; last_vacuum: string | null }) => !t.last_autovacuum && !t.last_vacuum).length}
                    </p>
                  </div>
                </div>

                {/* Table stats */}
                <div className="overflow-auto rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="bg-slate-950/70 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Table</th>
                        <th className="px-3 py-2 text-right">Live</th>
                        <th className="px-3 py-2 text-right">Dead</th>
                        <th className="px-3 py-2 text-right">Dead %</th>
                        <th className="px-3 py-2 text-right">Size</th>
                        <th className="px-3 py-2 text-left">Last Vacuum</th>
                        <th className="px-3 py-2 text-left">Last Autovacuum</th>
                        <th className="px-3 py-2 text-left">Last Analyze</th>
                      </tr>
                    </thead>
                    <tbody>
                      {av.tables.map((row: { schema: string; table_name: string; live_tuples: number; dead_tuples: number; dead_pct: number; total_size_bytes: number; last_vacuum: string | null; last_autovacuum: string | null; last_analyze: string | null; last_autoanalyze: string | null }, idx: number) => (
                        <tr key={idx} className={`border-t border-slate-800 text-slate-300 ${row.dead_pct > 10 ? "bg-red-950/30" : "bg-slate-950"}`}>
                          <td className="px-3 py-2">
                            <span className="text-slate-500">{row.schema}.</span>{row.table_name}
                          </td>
                          <td className="px-3 py-2 text-right">{row.live_tuples.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{row.dead_tuples.toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right ${row.dead_pct > 10 ? "text-red-400 font-medium" : row.dead_pct > 5 ? "text-amber-400" : ""}`}>
                            {row.dead_pct}%
                          </td>
                          <td className="px-3 py-2 text-right">{formatBytes(row.total_size_bytes)}</td>
                          <td className="px-3 py-2">{row.last_vacuum ? new Date(row.last_vacuum).toLocaleString() : <span className="text-slate-600">never</span>}</td>
                          <td className="px-3 py-2">{row.last_autovacuum ? new Date(row.last_autovacuum).toLocaleString() : <span className="text-slate-600">never</span>}</td>
                          <td className="px-3 py-2">{(row.last_analyze || row.last_autoanalyze) ? new Date((row.last_analyze || row.last_autoanalyze)!).toLocaleString() : <span className="text-slate-600">never</span>}</td>
                        </tr>
                      ))}
                      {av.tables.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-500">No user tables found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Autovacuum Settings */}
                {av.settings?.length > 0 && (
                  <div className="overflow-auto rounded border border-slate-800">
                    <p className="border-b border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-medium text-slate-300">
                      Autovacuum Settings
                    </p>
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-slate-950/60 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Setting</th>
                          <th className="px-3 py-2 text-left">Value</th>
                          <th className="px-3 py-2 text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {av.settings.map((s: { name: string; setting: string; unit: string | null; short_desc: string }, idx: number) => (
                          <tr key={idx} className="border-t border-slate-800 bg-slate-950 text-slate-300">
                            <td className="px-3 py-2 font-mono text-[11px]">{s.name}</td>
                            <td className="px-3 py-2">{s.setting}{s.unit ? ` ${s.unit}` : ""}</td>
                            <td className="px-3 py-2 text-slate-500">{s.short_desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      if (databaseView === "consumption") {
        const formatBytes = (b: number) => {
          if (!b || b === 0) return "0 B";
          if (b < 1024) return `${b} B`;
          if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
          if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
          return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        const formatNum = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Consumption Metrics</h2>
              <button onClick={() => loadConsumption()} disabled={isConsumptionLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40">
                {isConsumptionLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
              </button>
            </div>

            {/* Resource metrics cards */}
            {consumption && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Database Size</p>
                  <p className="mt-1 text-lg font-bold text-slate-100">{formatBytes(consumption.db_size_bytes)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{consumption.table_count} table{consumption.table_count !== 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Storage Size</p>
                  <p className="mt-1 text-lg font-bold text-slate-100">{formatBytes(consumption.storage_size_bytes)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">S3-compatible (MinIO)</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Auth MAU</p>
                  <p className="mt-1 text-lg font-bold text-slate-100">{formatNum(consumption.auth_mau)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Monthly active users</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">SQL Queries</p>
                  <p className="mt-1 text-lg font-bold text-slate-100">{formatNum(consumption.total_queries)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">{formatNum(consumption.total_rows_processed)} rows processed</p>
                </div>
              </div>
            )}

            {/* Live API Metrics */}
            {consumptionLive && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <h3 className="mb-3 text-xs font-medium text-slate-200">Live API Metrics (since server start)</h3>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded border border-slate-700 bg-slate-950 p-3 text-center">
                    <p className="text-lg font-bold text-emerald-400">{formatNum(consumptionLive.totalQueries)}</p>
                    <p className="text-[10px] text-slate-500">Total Requests</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-950 p-3 text-center">
                    <p className="text-lg font-bold text-amber-400">{formatBytes(consumptionLive.totalBandwidth)}</p>
                    <p className="text-[10px] text-slate-500">Total Bandwidth</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-950 p-3 text-center">
                    <p className="text-lg font-bold text-slate-200">{consumptionLive.startedAt ? new Date(consumptionLive.startedAt).toLocaleTimeString() : "—"}</p>
                    <p className="text-[10px] text-slate-500">Server Started</p>
                  </div>
                </div>

                {/* Top endpoints */}
                {consumptionLive.topEndpoints.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Top Endpoints</p>
                    <div className="space-y-1">
                      {consumptionLive.topEndpoints.slice(0, 10).map((ep, i) => {
                        const pct = consumptionLive.totalQueries > 0 ? (ep.count / consumptionLive.totalQueries) * 100 : 0;
                        return (
                          <div key={i} className="flex items-center gap-2 rounded bg-slate-950/60 px-2 py-1">
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-300">{ep.path}</span>
                            <div className="flex items-center gap-3">
                              <div className="w-24">
                                <div className="h-1.5 rounded-full bg-slate-800">
                                  <div className="h-1.5 rounded-full bg-emerald-500/60" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                              </div>
                              <span className="w-12 text-right text-[10px] text-slate-400">{formatNum(ep.count)}</span>
                              <span className="w-16 text-right text-[10px] text-slate-500">{formatBytes(ep.bandwidth)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Per key metrics */}
                {consumptionLive.perKey.length > 0 && (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Per API Key</p>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                          <th className="px-2 py-1.5">Key ID</th>
                          <th className="px-2 py-1.5 text-right">Requests</th>
                          <th className="px-2 py-1.5 text-right">Bandwidth</th>
                          <th className="px-2 py-1.5 text-right">Last Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consumptionLive.perKey.map((k, i) => (
                          <tr key={i} className="border-b border-slate-800/50">
                            <td className="px-2 py-1.5 font-mono text-slate-300">{k.keyId?.slice(0, 12)}...</td>
                            <td className="px-2 py-1.5 text-right text-slate-200">{formatNum(k.queries)}</td>
                            <td className="px-2 py-1.5 text-right text-slate-400">{formatBytes(k.bandwidth)}</td>
                            <td className="px-2 py-1.5 text-right text-[10px] text-slate-500">{k.lastSeen ? new Date(k.lastSeen).toLocaleTimeString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Usage history chart (sparkline-style) */}
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-medium text-slate-200">Usage History</h3>
                <div className="flex items-center gap-1">
                  {[7, 14, 30].map(d => (
                    <button key={d} onClick={() => { setConsumptionDays(d); loadConsumption(d); }} className={`rounded px-2 py-0.5 text-[10px] ${consumptionDays === d ? "bg-accent-500/20 text-accent-300 border border-accent-500/30" : "text-slate-500 hover:text-slate-300"}`}>
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              {consumptionHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No usage snapshots yet. Snapshots are captured automatically on a schedule.</div>
              ) : (
                <div className="space-y-4">
                  {/* DB size chart */}
                  {(() => {
                    const maxDb = Math.max(...consumptionHistory.map(s => Number(s.db_size_bytes) || 0), 1);
                    const maxStorage = Math.max(...consumptionHistory.map(s => Number(s.storage_size_bytes) || 0), 1);
                    const maxMau = Math.max(...consumptionHistory.map(s => Number(s.auth_mau) || 0), 1);
                    return (
                      <>
                        <div>
                          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">Database Size</p>
                          <div className="flex items-end gap-[2px] h-16">
                            {consumptionHistory.map((s, i) => {
                              const h = Math.max((Number(s.db_size_bytes) / maxDb) * 100, 2);
                              return (
                                <div key={i} className="flex-1 group relative">
                                  <div className="w-full rounded-t bg-emerald-500/60 transition-colors group-hover:bg-emerald-400/80" style={{ height: `${h}%` }} />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block rounded bg-slate-800 border border-slate-700 px-2 py-1 text-[9px] text-slate-300 whitespace-nowrap z-10">
                                    {formatBytes(Number(s.db_size_bytes))}<br />{new Date(s.captured_at).toLocaleDateString()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">Storage Size</p>
                          <div className="flex items-end gap-[2px] h-16">
                            {consumptionHistory.map((s, i) => {
                              const h = Math.max((Number(s.storage_size_bytes) / maxStorage) * 100, 2);
                              return (
                                <div key={i} className="flex-1 group relative">
                                  <div className="w-full rounded-t bg-amber-500/60 transition-colors group-hover:bg-amber-400/80" style={{ height: `${h}%` }} />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block rounded bg-slate-800 border border-slate-700 px-2 py-1 text-[9px] text-slate-300 whitespace-nowrap z-10">
                                    {formatBytes(Number(s.storage_size_bytes))}<br />{new Date(s.captured_at).toLocaleDateString()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">Auth MAU</p>
                          <div className="flex items-end gap-[2px] h-16">
                            {consumptionHistory.map((s, i) => {
                              const h = Math.max((Number(s.auth_mau) / maxMau) * 100, 2);
                              return (
                                <div key={i} className="flex-1 group relative">
                                  <div className="w-full rounded-t bg-purple-500/60 transition-colors group-hover:bg-purple-400/80" style={{ height: `${h}%` }} />
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block rounded bg-slate-800 border border-slate-700 px-2 py-1 text-[9px] text-slate-300 whitespace-nowrap z-10">
                                    {Number(s.auth_mau)} MAU<br />{new Date(s.captured_at).toLocaleDateString()}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      }


      if (databaseView === "branches") {
        const formatSize = (bytes: number) => {
          if (!bytes) return "—";
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-slate-100">Database Branches</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Create instant clones of your database for testing, previews, or safe migrations.</p>
              </div>
              <button onClick={loadBranches} disabled={isBranchesLoading} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                {isBranchesLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {branchError && <p className="mb-3 text-xs text-red-300">{branchError}</p>}

            {/* Create branch form */}
            <div className="mb-4 rounded border border-slate-800 bg-slate-900/40 p-4">
              <p className="mb-3 text-xs font-medium text-slate-300">Create Branch</p>
              <div className="flex gap-2">
                <input id="new-branch-label" placeholder="Branch name (e.g. feature-auth)" className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
                <select id="new-branch-ttl" className="rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none">
                  <option value="0">No TTL</option>
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                  <option value="168">7 days</option>
                </select>
                <button
                  onClick={() => {
                    const labelEl = document.getElementById("new-branch-label") as HTMLInputElement;
                    const ttlEl = document.getElementById("new-branch-ttl") as HTMLSelectElement;
                    createBranch(labelEl.value || `branch-${Date.now()}`, parseInt(ttlEl.value) || 0);
                    labelEl.value = "";
                  }}
                  className="rounded bg-accent-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-accent-400"
                >
                  Create
                </button>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">Creates a full copy via <code className="text-slate-400">CREATE DATABASE ... TEMPLATE</code>. May briefly block writes on the parent.</p>
            </div>

            {/* Branches table */}
            <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-medium">
                  <tr>
                    <th className="px-4 py-2 border-b border-slate-800">Label</th>
                    <th className="px-4 py-2 border-b border-slate-800">Branch DB</th>
                    <th className="px-4 py-2 border-b border-slate-800">Parent</th>
                    <th className="px-4 py-2 border-b border-slate-800">Size</th>
                    <th className="px-4 py-2 border-b border-slate-800">Created</th>
                    <th className="px-4 py-2 border-b border-slate-800">TTL</th>
                    <th className="px-4 py-2 border-b border-slate-800 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No branches yet.</td></tr>
                  ) : (
                    branches.map((b) => (
                      <tr key={b.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                        <td className="px-4 py-3 text-slate-200 font-medium">{b.label}</td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{b.branch_db}</td>
                        <td className="px-4 py-3 text-slate-500">{b.parent_db}</td>
                        <td className="px-4 py-3 text-slate-400">{formatSize(Number(b.size_bytes))}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500">{b.ttl_hours ? `${b.ttl_hours}h` : "—"}</td>
                        <td className="px-4 py-3 text-right flex items-center justify-end gap-2">
                          <button
                            onClick={async () => {
                              try {
                                const r = await apiFetch(`${apiBaseUrl}/api/branches/${b.id}/connection-string`);
                                const data = await r.json();
                                if (data.connectionString) {
                                  navigator.clipboard.writeText(data.connectionString);
                                  setBranchError(null);
                                }
                              } catch { setBranchError("Failed to copy connection string"); }
                            }}
                            className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                            title="Copy connection string"
                          >
                            <LinkSimple size={11} /> Connect
                          </button>
                          <button onClick={() => deleteBranch(b.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      if (databaseView === "backups") {
        const formatSize = (bytes: number) => {
          if (!bytes) return "—";
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
          if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        };
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-slate-100">Backups</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Create and manage database snapshots via <code className="text-slate-400">pg_dump</code>.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadBackups} disabled={isBackupsLoading} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                  {isBackupsLoading ? "Loading..." : "Refresh"}
                </button>
                <button onClick={createBackup} className="rounded bg-accent-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-accent-400">
                  Take Snapshot
                </button>
              </div>
            </div>

            {backupError && <p className="mb-3 text-xs text-red-300">{backupError}</p>}

            {/* Backup Schedule */}
            <div className="mb-4 rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-medium text-slate-200">Scheduled Backups</h3>
                <button onClick={loadBackupSchedule} className="text-[10px] text-slate-500 hover:text-slate-300">Reload</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={backupSchedule.enabled}
                    onChange={(e) => setBackupSchedule((s) => ({ ...s, enabled: e.target.checked }))}
                    className="accent-emerald-500"
                  />
                  Enabled
                </label>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">Frequency</label>
                  <select
                    value={backupSchedule.frequency}
                    onChange={(e) => setBackupSchedule((s) => ({ ...s, frequency: e.target.value }))}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">Hour (UTC)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={backupSchedule.hour}
                    onChange={(e) => setBackupSchedule((s) => ({ ...s, hour: parseInt(e.target.value) || 0 }))}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">Retention (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={backupSchedule.retention_days}
                    onChange={(e) => setBackupSchedule((s) => ({ ...s, retention_days: parseInt(e.target.value) || 7 }))}
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  />
                </div>
              </div>
              <button
                onClick={() => saveBackupSchedule()}
                className="mt-3 rounded bg-accent-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-accent-400"
              >
                Save Schedule
              </button>
            </div>

            {/* WAL Archiving Config */}
            <div className="mb-4 rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-medium text-slate-200">WAL Archiving</h3>
                  <p className="mt-0.5 text-[10px] text-slate-500">Required for point-in-time recovery (PITR).</p>
                </div>
                <button onClick={loadWalConfig} disabled={isWalConfigLoading} className="text-[10px] text-slate-500 hover:text-slate-300">
                  {isWalConfigLoading ? "Loading..." : "Reload"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                  <p className="text-slate-500">archive_mode</p>
                  <p className={`mt-0.5 ${walConfig.archive_mode === "on" ? "text-emerald-300" : "text-amber-300"}`}>
                    {String(walConfig.archive_mode || "unknown")}
                  </p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                  <p className="text-slate-500">wal_level</p>
                  <p className="mt-0.5 text-slate-200">{String(walConfig.wal_level || "unknown")}</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                  <p className="text-slate-500">archive_command</p>
                  <p className="mt-0.5 truncate text-slate-400 text-[11px]" title={String(walConfig.archive_command || "")}>
                    {String(walConfig.archive_command || "not set")}
                  </p>
                </div>
              </div>
              {walConfig.archive_mode !== "on" && (
                <p className="mt-2 text-[11px] text-amber-300">
                  WAL archiving is not enabled. Set <code className="rounded bg-slate-800 px-1">archive_mode = on</code> and configure <code className="rounded bg-slate-800 px-1">archive_command</code> in postgresql.conf, then restart Postgres.
                </p>
              )}
            </div>

            {/* Point-in-Time Restore */}
            <div className="mb-4 rounded border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-2 text-xs font-medium text-slate-200">Point-in-Time Restore (PITR)</h3>
              <p className="mb-3 text-[11px] text-slate-500">Restore the database to a specific point in time using WAL archives.</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">Restore to timestamp</label>
                  <input
                    id="pitr-timestamp"
                    type="datetime-local"
                    className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
                  />
                </div>
                <button
                  onClick={() => {
                    const el = document.getElementById("pitr-timestamp") as HTMLInputElement;
                    if (!el.value) { setBackupError("Select a timestamp for PITR."); return; }
                    requestPitr(new Date(el.value).toISOString());
                  }}
                  disabled={walConfig.archive_mode !== "on"}
                  className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Restore
                </button>
              </div>
              {walConfig.archive_mode !== "on" && (
                <p className="mt-2 text-[10px] text-slate-500">Enable WAL archiving above to use PITR.</p>
              )}
            </div>

            {/* Backup history table */}
            <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-medium">
                  <tr>
                    <th className="px-4 py-2 border-b border-slate-800">Filename</th>
                    <th className="px-4 py-2 border-b border-slate-800">Status</th>
                    <th className="px-4 py-2 border-b border-slate-800">Size</th>
                    <th className="px-4 py-2 border-b border-slate-800">Created</th>
                    <th className="px-4 py-2 border-b border-slate-800">Completed</th>
                    <th className="px-4 py-2 border-b border-slate-800 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No backups yet. Click "Take Snapshot" to create one.</td></tr>
                  ) : (
                    backups.map((b) => (
                      <tr key={b.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                        <td className="px-4 py-3 font-mono text-slate-300 text-[11px]">{b.filename}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                            b.status === "completed" ? "bg-emerald-500/15 text-emerald-300" :
                            b.status === "running" ? "bg-amber-500/15 text-amber-300" :
                            "bg-red-500/15 text-red-300"
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatSize(Number(b.size_bytes))}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{b.completed_at ? new Date(b.completed_at).toLocaleString() : "—"}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {b.status === "completed" && (
                            <button onClick={() => restoreBackup(b.id)} className="text-[10px] text-amber-400 hover:underline">Restore</button>
                          )}
                          <button onClick={() => deleteBackup(b.id)} className="text-[10px] text-red-400 hover:underline">Delete</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      if (databaseView === "locks") {
        return (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-slate-100">Locks & Waits</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Blocking chains, long transactions, and lock summary.</p>
              </div>
              <button onClick={() => { setLockData(null); loadLocks(); }} disabled={isLocksLoading} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                {isLocksLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {!lockData && isLocksLoading && <p className="text-xs text-slate-500">Loading lock data...</p>}

            {lockData && (
              <div className="space-y-6">
                {/* Blocking Chains */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-300">Blocking Chains</h3>
                  {(lockData.lockChains as any[])?.length === 0 ? (
                    <p className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">No blocking chains detected.</p>
                  ) : (
                    <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                      <table className="min-w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-medium">
                          <tr>
                            <th className="px-3 py-2 border-b border-slate-800">Blocked PID</th>
                            <th className="px-3 py-2 border-b border-slate-800">Blocked Query</th>
                            <th className="px-3 py-2 border-b border-slate-800">Wait Time</th>
                            <th className="px-3 py-2 border-b border-slate-800">Blocking PID</th>
                            <th className="px-3 py-2 border-b border-slate-800">Blocking Query</th>
                            <th className="px-3 py-2 border-b border-slate-800">Lock Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lockData.lockChains as any[]).map((row: any, i: number) => (
                            <tr key={i} className="border-b border-slate-900 hover:bg-slate-900/40">
                              <td className="px-3 py-2 font-mono text-slate-300">{row.blocked_pid}</td>
                              <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate" title={row.blocked_query}>{row.blocked_query}</td>
                              <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{row.blocked_duration}</td>
                              <td className="px-3 py-2 font-mono text-amber-300">{row.blocking_pid}</td>
                              <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate" title={row.blocking_query}>{row.blocking_query}</td>
                              <td className="px-3 py-2 text-slate-500">{row.locktype} ({row.blocked_mode})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Long Transactions */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-300">Long Transactions (&gt; 30s)</h3>
                  {(lockData.longTransactions as any[])?.length === 0 ? (
                    <p className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">No long-running transactions.</p>
                  ) : (
                    <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                      <table className="min-w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 font-medium">
                          <tr>
                            <th className="px-3 py-2 border-b border-slate-800">PID</th>
                            <th className="px-3 py-2 border-b border-slate-800">User</th>
                            <th className="px-3 py-2 border-b border-slate-800">State</th>
                            <th className="px-3 py-2 border-b border-slate-800">TX Age (s)</th>
                            <th className="px-3 py-2 border-b border-slate-800">Wait</th>
                            <th className="px-3 py-2 border-b border-slate-800">Query</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(lockData.longTransactions as any[]).map((row: any, i: number) => (
                            <tr key={i} className="border-b border-slate-900 hover:bg-slate-900/40">
                              <td className="px-3 py-2 font-mono text-slate-300">{row.pid}</td>
                              <td className="px-3 py-2 text-slate-400">{row.user_name}</td>
                              <td className="px-3 py-2 text-slate-400">{row.state}</td>
                              <td className="px-3 py-2 text-amber-300 font-mono">{row.tx_seconds}</td>
                              <td className="px-3 py-2 text-slate-500">{row.wait_event_type ? `${row.wait_event_type}: ${row.wait_event}` : "—"}</td>
                              <td className="px-3 py-2 text-slate-400 max-w-[300px] truncate" title={row.query}>{row.query}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Lock Summary */}
                <div>
                  <h3 className="mb-2 text-xs font-medium text-slate-300">Lock Summary</h3>
                  <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                    <table className="min-w-full border-collapse text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 font-medium">
                        <tr>
                          <th className="px-3 py-2 border-b border-slate-800">Lock Type</th>
                          <th className="px-3 py-2 border-b border-slate-800">Mode</th>
                          <th className="px-3 py-2 border-b border-slate-800">Granted</th>
                          <th className="px-3 py-2 border-b border-slate-800">Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(lockData.lockSummary as any[])?.length === 0 ? (
                          <tr><td colSpan={4} className="px-4 py-3 text-center text-slate-500">No locks.</td></tr>
                        ) : (
                          (lockData.lockSummary as any[]).map((row: any, i: number) => (
                            <tr key={i} className="border-b border-slate-900 hover:bg-slate-900/40">
                              <td className="px-3 py-2 text-slate-300">{row.locktype}</td>
                              <td className="px-3 py-2 text-slate-400">{row.mode}</td>
                              <td className="px-3 py-2">
                                <span className={row.granted ? "text-emerald-300" : "text-red-300"}>{row.granted ? "Yes" : "No"}</span>
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-300">{row.count}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }

      if (databaseView === "wrappers") {
        return <FdwPanel apiBaseUrl={apiBaseUrl} fdwData={fdwData} setFdwData={setFdwData} isFdwLoading={isFdwLoading} loadFdw={loadFdw} />;
      }

      return (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-2 text-sm font-medium text-slate-100">{databaseViewLabel}</h2>
            <span className="inline-flex rounded bg-amber-300/20 px-2 py-1 text-[11px] uppercase tracking-wide text-amber-300">
              Work in progress
            </span>
          </div>
        </div>
      );
    }
  return null;
}

export function renderDatabasePaneB(s: any): React.JSX.Element | null {
  const {
    databaseView, primaryNav, setDatabaseView,
  } = s;

    if (primaryNav === "database") {
      return (
        <div className="space-y-3">
          {DATABASE_NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === "sql-editor") {
                        setDatabaseView("sql-editor");
                        return;
                      }
                      if (item.id === "sql-history") {
                        setDatabaseView("sql-history");
                        return;
                      }
                      setDatabaseView(item.id);
                    }}
                    className={`truss-btn truss-nav-btn w-full rounded border px-2 py-1.5 text-left text-xs ${
                      (item.id === "sql-editor" && databaseView === "sql-editor") ||
                      (item.id === "sql-history" && databaseView === "sql-history") ||
                      (databaseView === item.id && primaryNav === "database")
                        ? "border-slate-600 bg-slate-800 text-slate-100"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-300"
                    }`}
                  >
                    {databaseIcon(item.id)}
                    <span>{item.label}</span>
                    {item.status === "wip" && (
                      <span className="ml-2 rounded bg-amber-300/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                        WIP
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
  return null;
}
