// SqlPanel.tsx — SQL editor, ERD, and query history panels (extracted from App.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { LazyEditor as Editor } from "../LazyEditor";
import {
  Code,
  ClockCounterClockwise,
  DownloadSimple,
  TreeStructure,
} from "@phosphor-icons/react";
import {
  apiFetch, SNIPPETS, InteractiveErd,
} from "../types";
import { handleEditorWillMount, trussEditorOptions, registerSqlCompletion } from "../editorConfig";

// ─── PaneB ────────────────────────────────────────────────────────────────────

export function renderSqlPaneB(s: any): React.JSX.Element | null {
  const {
    primaryNav, sqlTool, setSqlTool, setSqlMainView, metadata,
    expandedSchemas, setExpandedSchemas, selectedSchema, setSelectedSchema,
    selectedTable, setSelectedTable, applyTableToEditor, fetchMetadata,
    selectedSnippet, setSelectedSnippet, applySnippet,
    history, loadHistorySql,
  } = s;

  if (primaryNav !== "sql") return null;

  return (
    <>
      <div className="space-y-2">
        <button
          onClick={() => {
            setSqlTool("editor");
            setSqlMainView("editor");
          }}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            sqlTool === "editor"
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <Code size={18} weight="regular" />
          Editor
        </button>
        <button
          onClick={() => {
            setSqlTool("erd");
            setSqlMainView("erd");
          }}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            sqlTool === "erd"
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <TreeStructure size={18} weight="regular" />
          ER Diagram
        </button>
        <button
          onClick={() => {
            setSqlTool("history");
            setSqlMainView("history");
          }}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            sqlTool === "history"
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <ClockCounterClockwise size={18} weight="regular" />
          History
        </button>
      </div>

      {sqlTool === "editor" && (
        <div className="mt-4 space-y-3">
          <div className="rounded border border-slate-800 bg-slate-950 p-2">
            <p className="mb-2 text-[11px] text-slate-400">
              {metadata?.connection.database_name || "Loading database..."}
            </p>
            <div className="max-h-52 overflow-auto space-y-1">
              {(metadata?.schemas || []).map((schema: any) => {
                const expanded = expandedSchemas[schema.name] ?? false;
                return (
                  <div key={schema.name}>
                    <button
                      onClick={() =>
                        setExpandedSchemas((prev: any) => ({
                          ...prev,
                          [schema.name]: !expanded,
                        }))
                      }
                      className="w-full rounded px-2 py-1 text-left text-xs text-slate-300 hover:bg-slate-900"
                    >
                      {expanded ? "▾" : "▸"} {schema.name}
                    </button>
                    {expanded && (
                      <div className="ml-3 space-y-1">
                        {schema.tables.map((table: string) => (
                          <button
                            key={`${schema.name}.${table}`}
                            onClick={() => {
                              setSelectedSchema(schema.name);
                              setSelectedTable(table);
                            }}
                            className={`w-full rounded px-2 py-1 text-left text-[11px] ${
                              selectedSchema === schema.name && selectedTable === table
                                ? "bg-slate-800 text-slate-100"
                                : "text-slate-400 hover:bg-slate-900"
                            }`}
                          >
                            {table}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={applyTableToEditor}
              className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Open Table
            </button>
            <button
              onClick={fetchMetadata}
              className="rounded border border-slate-700 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          <label className="mb-1 block text-xs text-slate-400">Snippet</label>
          <select
            value={selectedSnippet}
            onChange={(event: any) => setSelectedSnippet(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
          >
            <option value="">Select snippet</option>
            {SNIPPETS.map((snippet: any) => (
              <option key={snippet.label} value={snippet.label}>
                {snippet.label}
              </option>
            ))}
          </select>
          <button
            onClick={applySnippet}
            disabled={!selectedSnippet}
            className="w-full rounded border border-slate-700 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Insert Snippet
          </button>

        </div>
      )}

      {sqlTool === "history" && (
        <div className="mt-4 space-y-2">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500">No query runs yet.</p>
          ) : (
            history.map((item: any) => (
              <button
                key={item.id}
                onClick={() => loadHistorySql(item.sql)}
                className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-left hover:bg-slate-900"
                title={item.sql}
              >
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span
                    className={item.status === "success" ? "text-emerald-300" : "text-red-300"}
                  >
                    {item.status.toUpperCase()}
                  </span>
                  <span className="text-slate-500">
                    {new Date(item.executedAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="truncate text-xs text-slate-300">{item.sql.replace(/\s+/g, " ")}</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {item.durationMs} ms · {item.rowCount} rows · {item.tabTitle}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {sqlTool === "erd" && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-400">
          ER diagram is shown in the main panel.
        </div>
      )}
    </>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function renderSqlMain(s: any): React.JSX.Element | null {
  const {
    primaryNav, sqlMainView, history, setHistory, loadHistorySql,
    savedQuerySearch, setSavedQuerySearch, savedQueryTagFilter, setSavedQueryTagFilter,
    allSavedQueryTags, savedQueries, filteredSavedQueries, loadSavedQuery, deleteSavedQuery,
    updateSavedQueryTags,
    tabs, activeTabId, setActiveTabId, editingTabId, editingTabTitle, setEditingTabTitle,
    commitRenameTab, cancelRenameTab, beginRenameTab, closeTab, addTab,
    branches, sqlBranchDb, setSqlBranchDb, formatCurrentSql, saveCurrentQuery,
    exportResultCsv, exportResultJson, sqlSplitView, setSqlSplitView,
    runQuery, isLoading, billingRestrictions, activeTab, updateActiveTab,
    editorTheme, flattenedTables,
    globalError, resultFilter, setResultFilter, filteredResultRows,
    showExportMenu, setShowExportMenu, isExporting, exportQueryResult,
    erdPayload, erdError, isErdLoading, fetchErd, erdGraph,
    apiBaseUrl,
  } = s;

  if (primaryNav !== "sql") return null;

  if (sqlMainView === "history") {
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
            No queries run yet. Write one above and hit Run.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item: any) => (
              <button
                key={item.id}
                onClick={() => loadHistorySql(item.sql)}
                className="w-full rounded border border-slate-800 bg-slate-900/40 p-3 text-left hover:bg-slate-900"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span
                    className={item.status === "success" ? "text-emerald-300" : "text-red-300"}
                  >
                    {item.status.toUpperCase()}
                  </span>
                  <span className="text-slate-500">
                    {new Date(item.executedAt).toLocaleString()}
                  </span>
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
            onChange={(e: any) => setSavedQuerySearch(e.target.value)}
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
              {allSavedQueryTags.map((tag: string) => (
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
              {savedQueries.length === 0 ? "No saved queries yet. Run a query, then save it for later." : "No matching queries."}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSavedQueries.map((item: any) => (
                <div
                  key={item.id}
                  className="rounded border border-slate-800 bg-slate-900/40 p-3"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => loadSavedQuery(item.sql)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-xs text-slate-100">{item.name}</p>
                      <p className="truncate text-xs text-slate-500">{item.sql.replace(/\s+/g, " ")}</p>
                    </button>
                    <button
                      onClick={() => deleteSavedQuery(item.id)}
                      className="ml-3 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                    {item.tags?.map((t: string) => (
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

  // ─── SQL Editor + ERD ─────────────────────────────────────────────────────
  return (
    <>
      {sqlMainView === "editor" && (
        <>
          <div className="border-b border-slate-800 p-4">
            <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/20 p-1">
              {tabs.map((tab: any) => {
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
                        onChange={(event: any) => setEditingTabTitle(event.target.value)}
                        onBlur={commitRenameTab}
                        onKeyDown={(event: any) => {
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
                    onChange={async (e: any) => {
                      const branchId = e.target.value;
                      e.target.value = "";
                      if (!branchId) return;
                      try {
                        const res = await apiFetch(`${apiBaseUrl}/api/branches/${branchId}/connection-string`);
                        const body = await res.json();
                        if (body.connectionString) s.switchConnection(body.connectionString);
                      } catch (err) {
                        console.error("Failed to load branch connection string:", err);
                      }
                    }}
                  >
                    <option value="" disabled>Branch…</option>
                    {branches.map((b: any) => (
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
                  onClick={() => setSqlSplitView((v: boolean) => !v)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-px ${sqlSplitView ? "border-accent-500/50 bg-accent-500/10 text-accent-300" : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"}`}
                  title="Toggle split view (editor + history)"
                >
                  Split
                </button>
                {branches.filter((b: any) => b.status === "active").length > 0 && (
                  <select
                    value={sqlBranchDb}
                    onChange={(e: any) => setSqlBranchDb(e.target.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs ${sqlBranchDb ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-slate-700 bg-slate-950 text-slate-300"}`}
                    title="Run query against a branch database"
                  >
                    <option value="">Main DB</option>
                    {branches.filter((b: any) => b.status === "active").map((b: any) => (
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
                onChange={(value: any) => updateActiveTab((tab: any) => ({ ...tab, sql: value ?? "" }))}
                theme={editorTheme}
                beforeMount={handleEditorWillMount}
                onMount={(_editor: any, monaco: any) => registerSqlCompletion(monaco, flattenedTables)}
                options={trussEditorOptions}
              />
            </div>
            {sqlSplitView && (
              <div className="overflow-auto rounded border border-slate-800 bg-slate-950 p-3" style={{ maxHeight: "420px" }}>
                <h3 className="mb-2 text-xs font-medium text-slate-400">Query History</h3>
                {history.length === 0 ? (
                  <p className="text-xs text-slate-500">Run a query to see it here.</p>
                ) : (
                  <div className="space-y-1.5">
                    {history.slice(0, 20).map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => updateActiveTab((tab: any) => ({ ...tab, sql: item.sql, result: null, error: "" }))}
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
                    {resultFilter.trim() && (
                      <span>
                        Showing: {filteredResultRows.length}
                      </span>
                    )}
                    <span>Time: {activeTab.result.durationMs} ms</span>
                    {activeTab.result.truncated && (
                      <span className="text-amber-300">
                        Showing first {activeTab.result.maxRows} rows.
                      </span>
                    )}
                    <div className="relative ml-auto">
                      <button
                        onClick={() => setShowExportMenu((prev: boolean) => !prev)}
                        disabled={isExporting}
                        className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                        title="Export results"
                      >
                        <DownloadSimple size={14} weight="regular" />
                        {isExporting ? "Exporting..." : "Export"}
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded border border-slate-700 bg-slate-900 py-1 shadow-lg">
                          <button
                            onClick={() => exportQueryResult("csv")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Export as CSV
                          </button>
                          <button
                            onClick={() => exportQueryResult("json")}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800"
                          >
                            Export as JSON
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <input
                      value={resultFilter}
                      onChange={(event: any) => setResultFilter(event.target.value)}
                      placeholder="Filter result rows..."
                      className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded border border-slate-800">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-900">
                      <tr>
                        {activeTab.result.columns.map((column: string) => (
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
                      {filteredResultRows.map((row: any, index: number) => (
                        <tr key={index} className="odd:bg-slate-950 even:bg-slate-900/40">
                          {activeTab.result?.columns.map((column: string) => (
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
      )}

      {sqlMainView === "erd" && (
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
          {!isErdLoading && erdPayload && (
            <p className="mt-2 text-xs text-slate-500">
              Tables: {erdPayload.tables.length} · Relationships: {erdPayload.relationships.length}
            </p>
          )}
        </div>
      )}
    </>
  );
}
