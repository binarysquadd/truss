// WebhooksPanel.tsx — Webhooks panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  Code,
  Plus,
  Table,
  Trash,
  Waveform,
} from "@phosphor-icons/react";
import { apiFetch } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

// ─── WebhookDetail (extracted to avoid render-time side effects) ─────────────

function WebhookDetail({ webhook, apiBaseUrl, onBack, onReload }: {
  webhook: any;
  apiBaseUrl: string;
  onBack: () => void;
  onReload: () => void;
}) {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [logsLoading, setLogsLoading] = React.useState(false);
  const logsLoadedRef = React.useRef(false);

  const loadLogs = React.useCallback(() => {
    setLogsLoading(true);
    apiFetch(`${apiBaseUrl}/api/webhooks/${webhook.id}/logs`)
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .finally(() => setLogsLoading(false));
  }, [apiBaseUrl, webhook.id]);

  // Auto-load logs once
  React.useEffect(() => {
    if (!logsLoadedRef.current) {
      logsLoadedRef.current = true;
      loadLogs();
    }
  }, [loadLogs]);

  const testWebhook = () => {
    apiFetch(`${apiBaseUrl}/api/webhooks/${webhook.id}/test`, { method: "POST" })
      .then(r => r.json())
      .then(() => loadLogs());
  };

  const toggleWebhook = () => {
    apiFetch(`${apiBaseUrl}/api/webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !webhook.active }),
    }).then(() => onReload());
  };

  const deleteWebhook = () => {
    if (!confirm("Delete this webhook?")) return;
    apiFetch(`${apiBaseUrl}/api/webhooks/${webhook.id}`, { method: "DELETE" })
      .then(() => { onReload(); onBack(); });
  };

  const replayLog = (logId: string) => {
    apiFetch(`${apiBaseUrl}/api/webhooks/${webhook.id}/replay/${logId}`, { method: "POST" })
      .then(() => loadLogs());
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
          <h2 className="text-sm font-medium text-slate-100">{webhook.name}</h2>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${webhook.active ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
            {webhook.active ? "Active" : "Disabled"}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={testWebhook} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">Test</button>
          <button onClick={toggleWebhook} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
            {webhook.active ? "Disable" : "Enable"}
          </button>
          <button onClick={deleteWebhook} className="truss-btn rounded border border-red-800/50 px-3 py-1 text-[11px] text-red-300 hover:bg-red-900/30">Delete</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Config</p>
          <div className="text-xs space-y-1">
            <p className="text-slate-300">Table: <code className="text-accent-300">{webhook.table_schema}.{webhook.table_name}</code></p>
            <p className="text-slate-300">Events: {(webhook.events || []).join(", ")}</p>
            <p className="text-slate-300">URL: <span className="text-cyan-300 break-all">{webhook.url}</span></p>
            {webhook.has_secret && <p className="text-slate-300">Secret: <span className="text-slate-500">••••••</span></p>}
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Stats</p>
          <div className="text-xs space-y-1">
            <p className="text-slate-300">Total deliveries: <span className="text-emerald-300">{webhook.total_deliveries || 0}</span></p>
            <p className="text-slate-300">Successful: <span className="text-emerald-300">{webhook.successful_deliveries || 0}</span></p>
            <p className="text-slate-300">Fail count: <span className={webhook.fail_count > 0 ? "text-red-300" : "text-slate-400"}>{webhook.fail_count || 0}</span></p>
            <p className="text-slate-300">Last fired: <span className="text-slate-400">{webhook.last_fired_at ? new Date(webhook.last_fired_at).toLocaleString() : "Never"}</span></p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Delivery Log</p>
          <button onClick={loadLogs} className="text-[11px] text-slate-500 hover:text-slate-300">Refresh</button>
        </div>
        {logsLoading && <p className="text-xs text-slate-400">Loading…</p>}
        {logs.length === 0 && !logsLoading ? (
          <p className="text-xs text-slate-500">No deliveries yet. Trigger a change on a subscribed table to fire this webhook.</p>
        ) : (
          <div className="max-h-[400px] overflow-auto rounded border border-slate-800">
            <table className="w-full text-[11px] text-slate-300">
              <thead><tr className="border-b border-slate-800 bg-slate-900/60 text-left">
                <th className="px-2 py-1">Time</th><th className="px-2 py-1">Event</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Latency</th><th className="px-2 py-1"></th>
              </tr></thead>
              <tbody>
                {logs.map((log: any) => (
                  <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-2 py-1 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-2 py-1"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">{log.event_type}</span></td>
                    <td className="px-2 py-1">
                      <span className={`font-mono ${log.status_code >= 200 && log.status_code < 300 ? "text-emerald-300" : "text-red-300"}`}>
                        {log.status_code || "ERR"}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-slate-500">{log.latency_ms}ms</td>
                    <td className="px-2 py-1">
                      <button onClick={() => replayLog(log.id)} className="text-[10px] text-cyan-400 hover:text-cyan-300">Replay</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function renderWebhooksMain(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, isWebhooksLoading,
    newWebhookEvents, newWebhookName, newWebhookSecret, newWebhookTable, newWebhookUrl,
    selectedWebhook, setIsWebhooksLoading,
    setNewWebhookEvents, setNewWebhookName, setNewWebhookSecret,
    setNewWebhookTable, setNewWebhookUrl, setSelectedWebhook,
    setWebhookTables, setWebhooksList, setWebhooksLoaded,
    setWebhooksView, webhookTables, webhooksList,
    webhooksLoaded, webhooksView,
  } = s;

  const loadWebhooks = () => {
    setIsWebhooksLoading(true);
    apiFetch(`${apiBaseUrl}/api/webhooks`).then(r => r.json()).then(d => setWebhooksList(d.webhooks || [])).catch(() => {}).finally(() => { setIsWebhooksLoading(false); setWebhooksLoaded(true); });
  };
  const loadWebhookTables = () => {
    apiFetch(`${apiBaseUrl}/api/realtime/tables`).then(r => r.json()).then(d => setWebhookTables(d.tables || []));
  };
  const createWebhook = () => {
    if (!newWebhookTable || !newWebhookUrl) return;
    const [schema, table] = newWebhookTable.includes(".") ? newWebhookTable.split(".") : ["public", newWebhookTable];
    apiFetch(`${apiBaseUrl}/api/webhooks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newWebhookName || `${table} webhook`, table_schema: schema, table_name: table, url: newWebhookUrl, events: newWebhookEvents, secret: newWebhookSecret }),
    }).then(r => r.json()).then(d => {
      if (d.webhook) { loadWebhooks(); setWebhooksView("list"); setNewWebhookName(""); setNewWebhookTable(""); setNewWebhookUrl(""); setNewWebhookSecret(""); }
    });
  };

  if (!webhooksLoaded && !isWebhooksLoading) {
    setTimeout(() => { loadWebhooks(); loadWebhookTables(); }, 0);
  }

  // ── Create view ──
  if (webhooksView === "create") {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4 max-w-2xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setWebhooksView("list")} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
          <h2 className="text-sm font-medium text-slate-100">Create Webhook</h2>
        </div>
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Name</label>
            <input value={newWebhookName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhookName(e.target.value)} placeholder="Order notifications" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Table</label>
            <select value={newWebhookTable} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewWebhookTable(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
              <option value="">Select table…</option>
              {webhookTables.map((t: any) => <option key={`${t.table_schema}.${t.table_name}`} value={`${t.table_schema}.${t.table_name}`}>{t.table_schema}.{t.table_name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Events</label>
            <div className="flex gap-3">
              {["INSERT", "UPDATE", "DELETE"].map(ev => (
                <label key={ev} className="flex items-center gap-1 text-xs text-slate-300">
                  <input type="checkbox" checked={newWebhookEvents.includes(ev)}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (e.target.checked) setNewWebhookEvents([...newWebhookEvents, ev]);
                      else setNewWebhookEvents(newWebhookEvents.filter((x: string) => x !== ev));
                    }} />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">URL</label>
            <input value={newWebhookUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhookUrl(e.target.value)} placeholder="https://example.com/webhook" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Secret (optional, for HMAC signing)</label>
            <input value={newWebhookSecret} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhookSecret(e.target.value)} placeholder="whsec_..." className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setWebhooksView("list")} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
            <button onClick={createWebhook} disabled={!newWebhookTable || !newWebhookUrl} className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">Create Webhook</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Detail view ──
  if (webhooksView === "detail" && selectedWebhook) {
    return (
      <WebhookDetail
        webhook={selectedWebhook}
        apiBaseUrl={apiBaseUrl}
        onBack={() => { setWebhooksView("list"); setSelectedWebhook(null); }}
        onReload={loadWebhooks}
      />
    );
  }

  // ── Developer view ──
  if (webhooksView === "developer") {
    const baseUrl = apiBaseUrl || "http://localhost:8787";
    return (
      <div className="space-y-4" style={{ maxWidth: 1200 }}>
        <DeveloperSDK
          title="Webhooks SDK & Code Snippets"
          description="Create webhooks, handle payloads, verify signatures, and manage event subscriptions."
          editorTheme={s.editorTheme}
          module="webhooks"
          placeholders={{ baseUrl }}
        />
      </div>
    );
  }

  // ── List view (default) ──
  const activeWebhooks = webhooksList.filter((w: any) => w.active);
  const failedWebhooks = webhooksList.filter((w: any) => w.fail_count > 0);
  const uniqueTables = new Set(webhooksList.map((w: any) => `${w.table_schema}.${w.table_name}`)).size;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Webhooks</h2>
          {webhooksList.length > 0 && (
            <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${activeWebhooks.length > 0 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${activeWebhooks.length > 0 ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              {activeWebhooks.length} Active
            </span>
          )}
          {failedWebhooks.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-medium text-red-300">
              {failedWebhooks.length} failing
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={loadWebhooks} disabled={isWebhooksLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            {isWebhooksLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
          </button>
          <button onClick={() => { setWebhooksView("create"); loadWebhookTables(); }} className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30">
            <Plus size={14} /> New Webhook
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Waveform size={13} weight="regular" /> Total</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{webhooksList.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Configured webhooks</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Table size={13} weight="regular" /> Tables</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{uniqueTables}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Monitored tables</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><CheckCircle size={13} weight="regular" /> Active</div>
          <p className={`mt-1 text-xl font-semibold ${activeWebhooks.length > 0 ? "text-emerald-400" : "text-slate-100"}`}>{activeWebhooks.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Currently firing</p>
        </div>
      </div>

      {webhooksList.length === 0 && !isWebhooksLoading ? (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-6 text-center">
          <Waveform size={32} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm text-slate-400">No webhooks configured</p>
          <p className="text-[11px] text-slate-500 mt-1">Create a webhook to fire HTTP requests when rows change in your database.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooksList.map((wh: any) => (
            <button key={wh.id} onClick={() => { setSelectedWebhook(wh); setWebhooksView("detail"); }}
              className="w-full rounded border border-slate-800 bg-slate-900/40 p-4 text-left hover:border-slate-700 hover:bg-slate-900/60 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-100">{wh.name}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${wh.active ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
                    {wh.active ? "Active" : "Disabled"}
                  </span>
                  {wh.fail_count > 0 && <span className="rounded bg-red-900/40 px-1.5 py-0.5 text-[10px] text-red-300">{wh.fail_count} failures</span>}
                </div>
                <Waveform size={16} className="text-slate-600" />
              </div>
              <div className="flex gap-4 text-[11px] text-slate-500">
                <span>Table: <span className="text-slate-300">{wh.table_schema}.{wh.table_name}</span></span>
                <span>Events: <span className="text-slate-300">{(wh.events || []).join(", ")}</span></span>
                <span>URL: <span className="text-cyan-400/60 truncate max-w-[200px] inline-block align-bottom">{wh.url}</span></span>
              </div>
              {wh.last_fired_at && <p className="mt-1 text-[10px] text-slate-600">Last fired: {new Date(wh.last_fired_at).toLocaleString()}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PaneB ───────────────────────────────────────────────────────────────────

export function renderWebhooksPaneB(s: any): React.JSX.Element | null {
  const { webhooksView, setWebhooksView } = s;

  return (
    <div className="space-y-2">
      <button onClick={() => { setWebhooksView("list"); }}
        className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${webhooksView === "list" || webhooksView === "detail" ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}>
        <span className="inline-flex items-center gap-1.5"><Waveform size={18} weight="regular" />Webhooks</span>
      </button>
      <button onClick={() => setWebhooksView("developer")}
        className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${webhooksView === "developer" ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}>
        <span className="inline-flex items-center gap-1.5"><Code size={18} weight="regular" />Developer</span>
      </button>
    </div>
  );
}
