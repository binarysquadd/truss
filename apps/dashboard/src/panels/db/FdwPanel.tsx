// FdwPanel.tsx — Foreign Data Wrappers panel (extracted from DatabasePanel.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import {
  PlugsConnected,
  Trash,
  Users,
  X,
} from "@phosphor-icons/react";
import { apiFetch } from "../../types";

export function FdwPanel({ apiBaseUrl, fdwData, setFdwData, isFdwLoading, loadFdw }: {
  apiBaseUrl: string; fdwData: any; setFdwData: (d: any) => void; isFdwLoading: boolean; loadFdw: () => void;
}) {
  const [showAddServer, setShowAddServer] = useState(false);
  const [showUserMapping, setShowUserMapping] = useState<string | null>(null);
  const [showImportSchema, setShowImportSchema] = useState<string | null>(null);
  const [dropConfirm, setDropConfirm] = useState<string | null>(null);
  const [fdwError, setFdwError] = useState<string | null>(null);
  const [fdwBusy, setFdwBusy] = useState(false);

  const [srvName, setSrvName] = useState("");
  const [srvFdw, setSrvFdw] = useState("postgres_fdw");
  const [srvHost, setSrvHost] = useState("");
  const [srvPort, setSrvPort] = useState("5432");
  const [srvDbname, setSrvDbname] = useState("");

  const [umLocalUser, setUmLocalUser] = useState("current_user");
  const [umRemoteUser, setUmRemoteUser] = useState("");
  const [umRemotePassword, setUmRemotePassword] = useState("");

  const [impRemoteSchema, setImpRemoteSchema] = useState("public");
  const [impLocalSchema, setImpLocalSchema] = useState("public");

  const refresh = () => { setFdwData(null); loadFdw(); };

  const createServer = async () => {
    if (!srvName) return;
    setFdwBusy(true); setFdwError(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/fdw/server`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: srvName, fdw_name: srvFdw, host: srvHost || undefined, port: srvPort || undefined, dbname: srvDbname || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { setFdwError(data.error || "Failed"); setFdwBusy(false); return; }
      setShowAddServer(false); setSrvName(""); setSrvHost(""); setSrvPort("5432"); setSrvDbname("");
      refresh();
    } catch (e: any) { setFdwError(e.message); } finally { setFdwBusy(false); }
  };

  const createUserMapping = async () => {
    if (!showUserMapping) return;
    setFdwBusy(true); setFdwError(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/fdw/user-mapping`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: showUserMapping, local_user: umLocalUser, remote_user: umRemoteUser || undefined, remote_password: umRemotePassword || undefined }),
      });
      const data = await r.json();
      if (!r.ok) { setFdwError(data.error || "Failed"); setFdwBusy(false); return; }
      setShowUserMapping(null); setUmLocalUser("current_user"); setUmRemoteUser(""); setUmRemotePassword("");
      refresh();
    } catch (e: any) { setFdwError(e.message); } finally { setFdwBusy(false); }
  };

  const importSchema = async () => {
    if (!showImportSchema || !impRemoteSchema || !impLocalSchema) return;
    setFdwBusy(true); setFdwError(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/fdw/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server: showImportSchema, remote_schema: impRemoteSchema, local_schema: impLocalSchema }),
      });
      const data = await r.json();
      if (!r.ok) { setFdwError(data.error || "Failed"); setFdwBusy(false); return; }
      setShowImportSchema(null); setImpRemoteSchema("public"); setImpLocalSchema("public");
      refresh();
    } catch (e: any) { setFdwError(e.message); } finally { setFdwBusy(false); }
  };

  const dropServer = async (name: string) => {
    setFdwBusy(true); setFdwError(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/fdw/server/${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) { setFdwError(data.error || "Failed"); setFdwBusy(false); return; }
      setDropConfirm(null);
      refresh();
    } catch (e: any) { setFdwError(e.message); } finally { setFdwBusy(false); }
  };

  const inputCls = "mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500";
  const labelCls = "text-[10px] text-slate-500 uppercase";

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-100">Foreign Data Wrappers</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">FDW servers, user mappings, and foreign tables.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddServer(true)} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Add Server</button>
          <button onClick={refresh} disabled={isFdwLoading} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
            {isFdwLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {fdwError && (
        <div className="mb-3 rounded border border-red-400/30 bg-red-950/20 px-3 py-2 text-xs text-red-300 flex items-center justify-between">
          <span>{fdwError}</span>
          <button onClick={() => setFdwError(null)} className="ml-2 text-red-400 hover:text-red-200"><X size={14} weight="regular" /></button>
        </div>
      )}

      {!fdwData && isFdwLoading && <p className="text-xs text-slate-500">Loading...</p>}
      {fdwData && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-xs font-medium text-slate-300">Wrappers & Servers</h3>
            {fdwData.wrappers.length === 0 ? (
              <p className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">No foreign data wrappers found. Install extensions like postgres_fdw to get started.</p>
            ) : (
              <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-medium">
                    <tr>
                      <th className="px-3 py-2 border-b border-slate-800">FDW</th>
                      <th className="px-3 py-2 border-b border-slate-800">Server</th>
                      <th className="px-3 py-2 border-b border-slate-800">Handler</th>
                      <th className="px-3 py-2 border-b border-slate-800">Validator</th>
                      <th className="px-3 py-2 border-b border-slate-800">Options</th>
                      <th className="px-3 py-2 border-b border-slate-800">User Mappings</th>
                      <th className="px-3 py-2 border-b border-slate-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fdwData.wrappers.map((w: any, i: number) => (
                      <tr key={i} className="border-b border-slate-900 hover:bg-slate-900/40">
                        <td className="px-3 py-2 text-slate-200 font-medium">{w.fdw_name}</td>
                        <td className="px-3 py-2 text-slate-300">{w.server_name || "\u2014"}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{w.handler}</td>
                        <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{w.validator}</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">{(w.server_options || []).join(", ") || "\u2014"}</td>
                        <td className="px-3 py-2 text-slate-400">{(w.user_mappings || []).filter(Boolean).join(", ") || "\u2014"}</td>
                        <td className="px-3 py-2">
                          {w.server_name && (
                            <div className="flex gap-1.5">
                              <button onClick={() => { setShowUserMapping(w.server_name); setUmLocalUser("current_user"); setUmRemoteUser(""); setUmRemotePassword(""); }} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800" title="Add User Mapping"><Users size={13} weight="regular" /></button>
                              <button onClick={() => { setShowImportSchema(w.server_name); setImpRemoteSchema("public"); setImpLocalSchema("public"); }} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800" title="Import Schema"><PlugsConnected size={13} weight="regular" /></button>
                              <button onClick={() => setDropConfirm(w.server_name)} className="rounded border border-red-400/30 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-950/20" title="Drop Server"><Trash size={13} weight="regular" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium text-slate-300">Foreign Tables</h3>
            {fdwData.foreignTables.length === 0 ? (
              <p className="rounded border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-500">No foreign tables found.</p>
            ) : (
              <div className="rounded border border-slate-800 bg-slate-950 overflow-hidden">
                <table className="min-w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-medium">
                    <tr>
                      <th className="px-3 py-2 border-b border-slate-800">Schema</th>
                      <th className="px-3 py-2 border-b border-slate-800">Table</th>
                      <th className="px-3 py-2 border-b border-slate-800">Server</th>
                      <th className="px-3 py-2 border-b border-slate-800">Columns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fdwData.foreignTables.map((t: any, i: number) => (
                      <tr key={i} className="border-b border-slate-900 hover:bg-slate-900/40">
                        <td className="px-3 py-2 text-slate-400">{t.schema}</td>
                        <td className="px-3 py-2 text-slate-200">{t.table_name}</td>
                        <td className="px-3 py-2 text-slate-300">{t.server_name}</td>
                        <td className="px-3 py-2 text-slate-500 text-[11px]">{(t.columns || []).join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showAddServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowAddServer(false)}>
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-100">Add Foreign Server</h3>
            <div className="space-y-3">
              <div><label className={labelCls}>Server Name</label><input value={srvName} onChange={e => setSrvName(e.target.value)} placeholder="remote_pg" className={inputCls} /></div>
              <div>
                <label className={labelCls}>Wrapper Type</label>
                <select value={srvFdw} onChange={e => setSrvFdw(e.target.value)} className={inputCls}>
                  <option value="postgres_fdw">postgres_fdw</option>
                  <option value="mysql_fdw">mysql_fdw</option>
                  <option value="file_fdw">file_fdw</option>
                  <option value="oracle_fdw">oracle_fdw</option>
                  <option value="tds_fdw">tds_fdw</option>
                  <option value="mongo_fdw">mongo_fdw</option>
                </select>
              </div>
              <div><label className={labelCls}>Host</label><input value={srvHost} onChange={e => setSrvHost(e.target.value)} placeholder="remote-host.example.com" className={inputCls} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelCls}>Port</label><input value={srvPort} onChange={e => setSrvPort(e.target.value)} placeholder="5432" className={inputCls} /></div>
                <div><label className={labelCls}>Database</label><input value={srvDbname} onChange={e => setSrvDbname(e.target.value)} placeholder="remote_db" className={inputCls} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddServer(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={createServer} disabled={!srvName || fdwBusy} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">{fdwBusy ? "Creating..." : "Create Server"}</button>
            </div>
          </div>
        </div>
      )}

      {/* User Mapping Modal */}
      {showUserMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowUserMapping(null)}>
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-100">Add User Mapping</h3>
            <p className="text-[11px] text-slate-500">Server: <span className="text-slate-300 font-mono">{showUserMapping}</span></p>
            <div className="space-y-3">
              <div><label className={labelCls}>Local User</label><input value={umLocalUser} onChange={e => setUmLocalUser(e.target.value)} placeholder="current_user" className={inputCls} /></div>
              <div><label className={labelCls}>Remote User</label><input value={umRemoteUser} onChange={e => setUmRemoteUser(e.target.value)} placeholder="remote_user" className={inputCls} /></div>
              <div><label className={labelCls}>Remote Password</label><input type="password" value={umRemotePassword} onChange={e => setUmRemotePassword(e.target.value)} placeholder="********" className={inputCls} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowUserMapping(null)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={createUserMapping} disabled={fdwBusy} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">{fdwBusy ? "Creating..." : "Create Mapping"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Schema Modal */}
      {showImportSchema && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowImportSchema(null)}>
          <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-100">Import Foreign Schema</h3>
            <p className="text-[11px] text-slate-500">Server: <span className="text-slate-300 font-mono">{showImportSchema}</span></p>
            <div className="space-y-3">
              <div><label className={labelCls}>Remote Schema</label><input value={impRemoteSchema} onChange={e => setImpRemoteSchema(e.target.value)} placeholder="public" className={inputCls} /></div>
              <div><label className={labelCls}>Local Schema</label><input value={impLocalSchema} onChange={e => setImpLocalSchema(e.target.value)} placeholder="public" className={inputCls} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowImportSchema(null)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={importSchema} disabled={!impRemoteSchema || !impLocalSchema || fdwBusy} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">{fdwBusy ? "Importing..." : "Import Schema"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Drop Server Confirmation */}
      {dropConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setDropConfirm(null)}>
          <div className="w-full max-w-sm rounded border border-red-400/30 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-300">Drop Foreign Server</h3>
            <p className="text-xs text-slate-300">This will drop server <span className="font-mono text-red-300">{dropConfirm}</span> with CASCADE, removing all associated user mappings and foreign tables.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDropConfirm(null)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={() => dropServer(dropConfirm)} disabled={fdwBusy} className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">{fdwBusy ? "Dropping..." : "Drop Server"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
