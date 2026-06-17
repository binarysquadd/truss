// EdgePanel.tsx — Edge Functions / Client API panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  Code,
  Lightning,
} from "@phosphor-icons/react";
import type { EdgeView } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

export function renderEdgeMain(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, edgePlaygroundKey, edgePlaygroundResult, edgePlaygroundSql,
    edgeView, isEdgePlaygroundLoading, setEdgePlaygroundKey,
    setEdgePlaygroundResult, setEdgePlaygroundSql, setIsEdgePlaygroundLoading,
  } = s;

  const baseUrl = apiBaseUrl || `http://localhost:${8787}`;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-5">
      <h2 className="text-sm font-semibold text-slate-100">Edge Functions</h2>

      {edgeView === "developer" && (
        <div className="space-y-4">
          <DeveloperSDK
            title="Client API — SDK & Code Snippets"
            description="SQL-over-HTTP, Auto-REST CRUD, RPC functions, and RLS passthrough — all using your API keys."
            editorTheme={s.editorTheme}
            editorHeight="320px"
            module="edge"
            placeholders={{ baseUrl }}
          />

          {/* Filter Syntax Reference */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-medium text-slate-200">Filter Syntax Reference</h3>
            <p className="text-[11px] text-slate-400 mb-3">Use these operators as query parameters on Auto-REST endpoints.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {[
                { filter: "?col=eq.value", desc: "Equal" },
                { filter: "?col=neq.value", desc: "Not equal" },
                { filter: "?col=gt.10", desc: "Greater than" },
                { filter: "?col=gte.10", desc: "Greater or equal" },
                { filter: "?col=lt.10", desc: "Less than" },
                { filter: "?col=lte.10", desc: "Less or equal" },
                { filter: "?col=like.*pattern*", desc: "LIKE (case-sensitive)" },
                { filter: "?col=ilike.*pattern*", desc: "ILIKE (case-insensitive)" },
                { filter: "?col=is.null", desc: "IS NULL" },
                { filter: "?col=in.(a,b,c)", desc: "IN list" },
              ].map((f) => (
                <div key={f.filter} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5">
                  <code className="text-[10px] text-cyan-300">{f.filter}</code>
                  <span className="text-[10px] text-slate-500">{f.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Limits */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-medium text-slate-200">Limits</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]">
                <p className="text-slate-500">Transaction max</p>
                <p className="text-slate-200">20 statements</p>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]">
                <p className="text-slate-500">Query timeout</p>
                <p className="text-slate-200">10s (configurable)</p>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]">
                <p className="text-slate-500">Row limit</p>
                <p className="text-slate-200">10,000 (max 50,000)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {edgeView === "playground" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-slate-200">SQL-over-HTTP Playground</h3>
            <p className="mb-3 text-[11px] text-slate-500">Test your API key + SQL queries against the live endpoint.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">API Key (service_role)</label>
                <input
                  value={edgePlaygroundKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEdgePlaygroundKey(e.target.value)}
                  placeholder="truss_sk_..."
                  type="password"
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">SQL Query</label>
                <textarea
                  value={edgePlaygroundSql}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEdgePlaygroundSql(e.target.value)}
                  rows={4}
                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <button
                onClick={async () => {
                  if (!edgePlaygroundKey) { setEdgePlaygroundResult(JSON.stringify({ error: "Enter an API key." }, null, 2)); return; }
                  setIsEdgePlaygroundLoading(true);
                  setEdgePlaygroundResult(null);
                  try {
                    const response = await fetch(`${baseUrl}/v1/sql`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: edgePlaygroundKey },
                      body: JSON.stringify({ sql: edgePlaygroundSql }),
                    });
                    const body = await response.json();
                    setEdgePlaygroundResult(JSON.stringify(body, null, 2));
                  } catch (error) {
                    setEdgePlaygroundResult(JSON.stringify({ error: error instanceof Error ? error.message : "Request failed." }, null, 2));
                  } finally {
                    setIsEdgePlaygroundLoading(false);
                  }
                }}
                disabled={isEdgePlaygroundLoading}
                className="truss-btn rounded bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {isEdgePlaygroundLoading ? <span className="truss-spinner" /> : <Lightning size={14} />}
                Execute
              </button>
            </div>
          </div>
          {edgePlaygroundResult && (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Response</p>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">{edgePlaygroundResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderEdgePaneB(s: any): React.JSX.Element | null {
  const { edgeView, setEdgeView } = s;

  return (
    <div className="space-y-2">
      {([
        { id: "developer" as EdgeView, label: "Overview", icon: <Code size={18} weight="regular" /> },
        { id: "playground" as EdgeView, label: "Playground", icon: <Lightning size={18} weight="regular" /> },
      ] as const).map((item) => (
        <button
          key={item.id}
          onClick={() => setEdgeView(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            edgeView === item.id
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            {item.icon}
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}
