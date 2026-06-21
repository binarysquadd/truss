import React, { useState, useEffect, useCallback } from "react";
import { Stack, ListBullets, ChartBar, Code, ArrowsClockwise, Trash, Plus, Warning } from "@phosphor-icons/react";
import { apiFetch } from "../types";

// ── Cache / KV panel (Valkey) ──────────────────────────────────────────────
// Keyspace browser + stats + developer snippets over the /api/cache/* surface.
// Self-contained: manages its own data via apiFetch (App only owns cacheView).

type KeyItem = { key: string; type: string; ttl: number };

function fmtTtl(ttl: number): string {
  if (ttl === -1 || ttl == null) return "—";          // no expiry
  if (ttl === -2) return "expired";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)}m`;
  return `${Math.round(ttl / 3600)}h`;
}

// ── Main panel ──────────────────────────────────────────────────────────────
function CacheMainInner({ apiBaseUrl, cacheView }: { apiBaseUrl: string; cacheView: string }) {
  const [status, setStatus] = useState<any>(null);
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [cursor, setCursor] = useState<string>("0");
  const [pattern, setPattern] = useState<string>("*");
  const [selected, setSelected] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{ open: boolean; key: string; value: string; ttl: string }>({ open: false, key: "", value: "", ttl: "" });

  const loadStatus = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/cache/status`);
      setStatus(await r.json());
    } catch (e: any) { setStatus({ ok: false, error: e.message }); }
  }, [apiBaseUrl]);

  const loadKeys = useCallback(async (reset: boolean) => {
    setLoading(true); setError(null);
    try {
      const cur = reset ? "0" : cursor;
      const r = await apiFetch(`${apiBaseUrl}/api/cache/keys?pattern=${encodeURIComponent(pattern || "*")}&cursor=${cur}&count=100`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Failed to scan keys");
      setKeys(reset ? body.keys : [...keys, ...body.keys]);
      setCursor(body.cursor);
    } catch (e: any) { setError(e.message); if (reset) setKeys([]); }
    finally { setLoading(false); }
  }, [apiBaseUrl, pattern, cursor, keys]);

  const loadInfo = useCallback(async () => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/cache/info`);
      const body = await r.json();
      setInfo(body.ok ? body.info : null);
    } catch { setInfo(null); }
  }, [apiBaseUrl]);

  const openKey = useCallback(async (key: string) => {
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/cache/keys/${encodeURIComponent(key)}`);
      setSelected(await r.json());
    } catch (e: any) { setSelected({ ok: false, error: e.message }); }
  }, [apiBaseUrl]);

  const delKey = useCallback(async (key: string) => {
    await apiFetch(`${apiBaseUrl}/api/cache/keys/${encodeURIComponent(key)}`, { method: "DELETE" });
    setSelected(null); loadKeys(true); loadStatus();
  }, [apiBaseUrl, loadKeys, loadStatus]);

  const saveKey = useCallback(async () => {
    const body: any = { value: form.value };
    if (form.ttl) body.ttl = Number(form.ttl);
    const r = await apiFetch(`${apiBaseUrl}/api/cache/keys/${encodeURIComponent(form.key)}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) { setForm({ open: false, key: "", value: "", ttl: "" }); loadKeys(true); loadStatus(); }
    else { const b = await r.json().catch(() => ({})); setError(b.error || "Failed to set key"); }
  }, [apiBaseUrl, form, loadKeys, loadStatus]);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (cacheView === "browser") loadKeys(true); if (cacheView === "stats") loadInfo(); /* eslint-disable-next-line */ }, [cacheView]);

  // Header: connection + headline stats
  const header = (
    <div className="mb-4 flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <Stack size={20} weight="regular" className="text-slate-400" />
        <div>
          <div className="text-sm font-medium text-slate-100">Cache / KV <span className="text-slate-500">· Valkey</span></div>
          <div className="text-xs text-slate-400">
            {status?.ok
              ? <>connected · v{status.version} · {status.keys} keys · {status.stats?.used_memory_human || "?"} used</>
              : <span className="text-amber-400">{status?.configured === false ? "not configured" : "unavailable"}</span>}
          </div>
        </div>
      </div>
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${status?.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
    </div>
  );

  if (cacheView === "developer") {
    return (
      <div className="p-4">
        {header}
        <div className="rounded border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">
          <p className="mb-3 text-slate-400">Connect any Redis client to the bundled Valkey instance (internal service <code className="text-slate-200">truss-valkey:6379</code>):</p>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-200"><code>{`// Node.js (ioredis)
import Redis from "ioredis";
const cache = new Redis({ host: "truss-valkey", port: 6379, password: process.env.VALKEY_PASSWORD });
await cache.set("session:42", JSON.stringify(user), "EX", 3600);
const v = await cache.get("session:42");`}</code></pre>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-200"><code>{`# valkey-cli
valkey-cli -a "$VALKEY_PASSWORD" SET ratelimit:ip:1.2.3.4 1 EX 60
valkey-cli -a "$VALKEY_PASSWORD" INCR ratelimit:ip:1.2.3.4`}</code></pre>
        </div>
      </div>
    );
  }

  if (cacheView === "stats") {
    return (
      <div className="p-4">
        {header}
        {!info ? <div className="text-sm text-slate-400">No stats available.</div> : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {["server", "memory", "clients", "stats"].map((sec) => info[sec] && (
              <div key={sec} className="rounded border border-slate-800 bg-slate-900/40 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{sec}</div>
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(info[sec]).slice(0, 10).map(([k, v]) => (
                      <tr key={k}><td className="py-0.5 pr-3 text-slate-400">{k}</td><td className="py-0.5 text-slate-200 font-mono">{String(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // browser
  return (
    <div className="p-4">
      {header}
      {error && <div className="mb-3 flex items-center gap-2 rounded border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-300"><Warning size={14} />{error}</div>}
      <div className="mb-3 flex items-center gap-2">
        <input
          value={pattern} onChange={(e) => setPattern(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadKeys(true)}
          placeholder="match pattern (e.g. session:*)"
          className="flex-1 rounded border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
        />
        <button onClick={() => loadKeys(true)} className="truss-btn rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200"><ArrowsClockwise size={14} /> Scan</button>
        <button onClick={() => setForm({ open: true, key: "", value: "", ttl: "" })} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300"><Plus size={14} /> New key</button>
      </div>

      {form.open && (
        <div className="mb-3 rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key" className="rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" />
            <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="value" className="rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 md:col-span-1" />
            <input value={form.ttl} onChange={(e) => setForm({ ...form, ttl: e.target.value })} placeholder="ttl seconds (optional)" className="rounded border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-100" />
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={saveKey} disabled={!form.key} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 disabled:opacity-50">Set</button>
            <button onClick={() => setForm({ open: false, key: "", value: "", ttl: "" })} className="truss-btn rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded border border-slate-800">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-900/60 text-left text-xs text-slate-500"><th className="px-3 py-2">Key</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">TTL</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {keys.length === 0 && !loading && <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-500">No keys match.</td></tr>}
            {keys.map((k) => (
              <tr key={k.key} className="border-t border-slate-800/60 hover:bg-slate-900/30">
                <td className="px-3 py-2 font-mono text-slate-200 cursor-pointer" onClick={() => openKey(k.key)}>{k.key}</td>
                <td className="px-3 py-2 text-slate-400">{k.type}</td>
                <td className="px-3 py-2 text-slate-400">{fmtTtl(k.ttl)}</td>
                <td className="px-3 py-2 text-right"><button onClick={() => delKey(k.key)} className="text-slate-500 hover:text-red-400"><Trash size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cursor !== "0" && <button onClick={() => loadKeys(false)} className="mt-3 truss-btn rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300">Load more</button>}

      {selected && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-sm text-slate-100">{selected.key} <span className="text-xs text-slate-500">· {selected.type} · ttl {fmtTtl(selected.ttl)}</span></div>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-slate-300">close</button>
          </div>
          <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-200"><code>{typeof selected.value === "string" ? selected.value : JSON.stringify(selected.value, null, 2)}</code></pre>
        </div>
      )}
    </div>
  );
}

// ── Pane B sub-nav ────────────────────────────────────────────────────────
function CachePaneBInner({ cacheView, setCacheView }: { cacheView: string; setCacheView: (v: any) => void }) {
  const items = [
    { view: "browser", label: "Keyspace", icon: <ListBullets size={18} weight="regular" /> },
    { view: "stats", label: "Stats", icon: <ChartBar size={18} weight="regular" /> },
    { view: "developer", label: "Developer", icon: <Code size={18} weight="regular" /> },
  ];
  return (
    <div className="flex flex-col h-full space-y-2">
      {items.map((it) => (
        <button key={it.view} onClick={() => setCacheView(it.view)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${cacheView === it.view ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}>
          <span className="inline-flex items-center gap-1.5">{it.icon}{it.label}</span>
        </button>
      ))}
      <div className="flex-1" />
    </div>
  );
}

export function renderCacheMain(s: any): React.JSX.Element | null {
  if (s.primaryNav !== "cache") return null;
  return <CacheMainInner apiBaseUrl={s.apiBaseUrl} cacheView={s.cacheView} />;
}

export function renderCachePaneB(s: any): React.JSX.Element | null {
  if (s.primaryNav !== "cache") return null;
  return <CachePaneBInner cacheView={s.cacheView} setCacheView={s.setCacheView} />;
}
