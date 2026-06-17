// SearchPanel.tsx — Full-text search panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import DOMPurify from "dompurify";
import {
  ArrowsClockwise,
  Code,
  Database,
  GearSix,
  MagnifyingGlass,
  Table,
} from "@phosphor-icons/react";
import { apiFetch } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

/** Sanitize HTML from ts_headline(): only allow <b>/<mark> highlight tags, strip everything else. */
function sanitizeHeadline(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'mark'], ALLOWED_ATTR: [] });
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function renderSearchMain(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, ftsColumn, ftsConfig, ftsConfigs, ftsEligible, ftsIndexedColumns,
    ftsIndexes, ftsLoaded, ftsQuery, ftsResults, ftsSetupColumns, ftsSetupConfig,
    ftsSetupTable, ftsTable, isFtsLoading, isFtsSearching, searchView,
    setFtsColumn, setFtsConfig, setFtsConfigs, setFtsEligible, setFtsIndexedColumns,
    setFtsIndexes, setFtsLoaded, setFtsQuery, setFtsResults, setFtsSetupColumns,
    setFtsSetupConfig, setFtsSetupTable, setFtsTable, setIsFtsLoading,
    setIsFtsSearching, setSearchView, showFtsSetupModal, setShowFtsSetupModal,
  } = s;

  const loadFtsOverview = () => {
    setIsFtsLoading(true);
    Promise.all([
      apiFetch(`${apiBaseUrl}/api/search/columns`).then(r => r.json()),
      apiFetch(`${apiBaseUrl}/api/search/indexes`).then(r => r.json()),
      apiFetch(`${apiBaseUrl}/api/search/configs`).then(r => r.json()),
      apiFetch(`${apiBaseUrl}/api/search/eligible`).then(r => r.json()),
    ]).then(([cols, idxs, cfgs, elig]) => {
      setFtsIndexedColumns(cols.columns || []);
      setFtsIndexes(idxs.indexes || []);
      setFtsConfigs(cfgs.configs || []);
      setFtsEligible(elig.columns || []);
    }).catch(() => {}).finally(() => { setIsFtsLoading(false); setFtsLoaded(true); });
  };
  if (!ftsLoaded && !isFtsLoading) {
    setTimeout(() => loadFtsOverview(), 0);
  }

  const runFtsSearch = () => {
    if (!ftsTable || !ftsQuery || !ftsColumn) return;
    setIsFtsSearching(true);
    const [schema, table] = ftsTable.includes(".") ? ftsTable.split(".") : ["public", ftsTable];
    apiFetch(`${apiBaseUrl}/api/search/test`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, table, column: ftsColumn, query: ftsQuery, config: ftsConfig }),
    }).then(r => r.json()).then(d => setFtsResults(d.results || [])).catch(() => setFtsResults([])).finally(() => setIsFtsSearching(false));
  };

  const setupFts = () => {
    if (!ftsSetupTable || ftsSetupColumns.length === 0) return;
    const [schema, table] = ftsSetupTable.includes(".") ? ftsSetupTable.split(".") : ["public", ftsSetupTable];
    apiFetch(`${apiBaseUrl}/api/search/setup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, table, columns: ftsSetupColumns, config: ftsSetupConfig }),
    }).then(r => r.json()).then(d => {
      if (d.ok) { setShowFtsSetupModal(false); loadFtsOverview(); }
    });
  };

  const removeFts = (schema: string, table: string, col: string) => {
    if (!confirm(`Remove full-text search from ${schema}.${table}?`)) return;
    apiFetch(`${apiBaseUrl}/api/search/setup`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema, table, tsvecColumn: col }),
    }).then(() => loadFtsOverview());
  };

  // Collect unique table options for playground
  const eligibleTables = [...new Set(ftsEligible.map((c: any) => `${c.table_schema}.${c.table_name}`))] as string[];
  const selectedTableEligibleCols = ftsEligible.filter((c: any) => `${c.table_schema}.${c.table_name}` === ftsTable);

  // ── Playground ──
  if (searchView === "playground") {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <h2 className="text-sm font-medium text-slate-100">Search Playground</h2>
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Table</label>
              <select value={ftsTable} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFtsTable(e.target.value); setFtsColumn(""); }} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                <option value="">Select table…</option>
                {eligibleTables.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Column</label>
              <select value={ftsColumn} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFtsColumn(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                <option value="">Select column…</option>
                {selectedTableEligibleCols.map((c: any) => <option key={c.column_name} value={c.column_name}>{c.column_name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Configuration</label>
              <select value={ftsConfig} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFtsConfig(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                {ftsConfigs.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Search Query</label>
              <div className="flex gap-2">
                <input value={ftsQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFtsQuery(e.target.value)} onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && runFtsSearch()} placeholder="Type search query…" className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                <button onClick={runFtsSearch} disabled={isFtsSearching || !ftsTable || !ftsColumn} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
                  {isFtsSearching ? "Searching…" : "Search"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {ftsResults && (
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">{ftsResults.length} results</p>
            {ftsResults.length === 0 ? (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-500">No results. Try a different search term or check your indexed columns.</div>
            ) : (
              <div className="space-y-2">
                {ftsResults.map((r: any, i: number) => (
                  <div key={i} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-500">Rank: <span className="text-amber-300 font-mono">{Number(r.rank).toFixed(4)}</span></span>
                    </div>
                    <div className="text-xs text-slate-300" dangerouslySetInnerHTML={{ __html: sanitizeHeadline(r.headline || "") }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Setup (Indexed Tables + Configs + Setup Modal) ──
  if (searchView === "setup") {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-100">Indexed Tables</h2>
          <button onClick={() => { setShowFtsSetupModal(true); setFtsSetupTable(""); setFtsSetupColumns([]); }} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-3 py-1 text-[11px] text-accent-200 hover:bg-accent-900/60">+ Add Search to Table</button>
        </div>

        {ftsIndexedColumns.length === 0 ? (
          <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
            <p className="text-sm text-slate-400">No tables with full-text search yet</p>
            <p className="text-[11px] text-slate-500 mt-1">Add search to a table to create tsvector columns, triggers, and GIN indexes automatically.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {ftsIndexedColumns.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 p-3">
                <div>
                  <code className="text-sm text-accent-300">{c.table_schema}.{c.table_name}</code>
                  <span className="ml-2 text-[11px] text-slate-500">column: <span className="text-slate-300">{c.column_name}</span></span>
                  <span className="ml-2 text-[11px] text-slate-500">rows: {c.row_count ?? "?"}</span>
                </div>
                <button onClick={() => removeFts(c.table_schema, c.table_name, c.column_name)} className="truss-btn rounded border border-red-800/50 px-2 py-1 text-[10px] text-red-300 hover:bg-red-900/30">Remove</button>
              </div>
            ))}
          </div>
        )}

        {ftsIndexes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Search Indexes</p>
            {ftsIndexes.map((idx: any, i: number) => (
              <div key={i} className="rounded border border-slate-800 bg-slate-900/40 p-3 text-xs">
                <code className="text-cyan-300">{idx.indexname}</code>
                <span className="ml-2 text-slate-500">{idx.schemaname}.{idx.tablename}</span>
                <span className="ml-2 text-slate-500">{idx.index_size}</span>
              </div>
            ))}
          </div>
        )}

        {/* Configurations section (merged from configs tab) */}
        {ftsConfigs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Text Search Configurations</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ftsConfigs.map((c: any, i: number) => (
                <div key={i} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                  <code className="text-sm text-accent-300">{c.name}</code>
                  <p className="mt-1 text-[11px] text-slate-500">Schema: {c.schema}</p>
                  {c.description && <p className="text-[11px] text-slate-400 mt-1">{c.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup Modal */}
        {showFtsSetupModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">Setup Full-Text Search</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Table</label>
                  <select value={ftsSetupTable} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setFtsSetupTable(e.target.value); setFtsSetupColumns([]); }} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                    <option value="">Select table…</option>
                    {eligibleTables.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {ftsSetupTable && (
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Text Columns (select and assign weights)</label>
                    <div className="space-y-1">
                      {ftsEligible.filter((c: any) => `${c.table_schema}.${c.table_name}` === ftsSetupTable).map((c: any) => {
                        const existing = ftsSetupColumns.find((sc: any) => sc.name === c.column_name);
                        return (
                          <div key={c.column_name} className="flex items-center gap-2">
                            <input type="checkbox" checked={!!existing}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                if (e.target.checked) setFtsSetupColumns([...ftsSetupColumns, { name: c.column_name, weight: "A" }]);
                                else setFtsSetupColumns(ftsSetupColumns.filter((sc: any) => sc.name !== c.column_name));
                              }} />
                            <span className="text-xs text-slate-300 w-32">{c.column_name}</span>
                            {existing && (
                              <select value={existing.weight}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFtsSetupColumns(ftsSetupColumns.map((sc: any) => sc.name === c.column_name ? { ...sc, weight: e.target.value } : sc))}
                                className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-100">
                                <option value="A">Weight A (highest)</option>
                                <option value="B">Weight B</option>
                                <option value="C">Weight C</option>
                                <option value="D">Weight D (lowest)</option>
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Configuration</label>
                  <select value={ftsSetupConfig} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFtsSetupConfig(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
                    {ftsConfigs.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowFtsSetupModal(false)} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button onClick={setupFts} disabled={!ftsSetupTable || ftsSetupColumns.length === 0} className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Developer ──
  if (searchView === "developer") {
    const baseUrl = apiBaseUrl || "http://localhost:8787";
    return (
      <div className="space-y-4" style={{ maxWidth: 1200 }}>
        <DeveloperSDK
          title="Search SDK & Code Snippets"
          description="Full-text search, vector similarity, and hybrid search queries using PostgreSQL."
          editorTheme={s.editorTheme}
          module="search"
          placeholders={{ baseUrl }}
        />
      </div>
    );
  }

  // ── Overview (default) ──
  const ftsActive = ftsIndexedColumns.length > 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Full-Text Search</h2>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${ftsActive ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${ftsActive ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {ftsActive ? "Active" : "Not configured"}
          </span>
        </div>
        <button onClick={loadFtsOverview} disabled={isFtsLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {isFtsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Table size={13} weight="regular" /> Indexed Tables</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{ftsIndexedColumns.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Tables with search enabled</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Database size={13} weight="regular" /> Search Indexes</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{ftsIndexes.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">GIN indexes active</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><GearSix size={13} weight="regular" /> Configurations</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{ftsConfigs.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Available dictionaries</p>
        </div>
      </div>

      {/* Indexed tables list */}
      {ftsIndexedColumns.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-3 text-xs font-medium text-slate-200">Indexed Tables</h3>
          <div className="space-y-2">
            {ftsIndexedColumns.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
                <div>
                  <code className="text-xs text-accent-300">{c.table_schema}.{c.table_name}</code>
                  <span className="ml-2 text-[11px] text-slate-500">{c.column_name}</span>
                </div>
                <span className="text-[11px] text-slate-500">{c.row_count ?? "?"} rows</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PaneB ───────────────────────────────────────────────────────────────────

export function renderSearchPaneB(s: any): React.JSX.Element | null {
  const { searchView, setSearchView } = s;

  const navBtn = (id: string, label: string, icon: React.JSX.Element) => (
    <button key={id} onClick={() => setSearchView(id as any)}
      className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${searchView === id ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}>
      <span className="inline-flex items-center gap-1.5">{icon}{label}</span>
    </button>
  );
  return (
    <div className="space-y-2">
      {navBtn("overview", "Overview", <Database size={18} weight="regular" />)}
      {navBtn("playground", "Playground", <MagnifyingGlass size={18} weight="regular" />)}
      {navBtn("setup", "Setup", <GearSix size={18} weight="regular" />)}
      {navBtn("developer", "Developer", <Code size={18} weight="regular" />)}
    </div>
  );
}
