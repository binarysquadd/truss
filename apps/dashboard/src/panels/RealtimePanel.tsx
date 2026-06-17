// RealtimePanel.tsx — Realtime subscriptions & event feed (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  ArrowsClockwise,
  Broadcast,
  Code,
  Database,
  Lightning,
  MagnifyingGlass,
  Prohibit,
  SignIn,
  SignOut,
  Trash,
  Users,
} from "@phosphor-icons/react";
import { DeveloperSDK } from "./DeveloperSDK";
import type { RealtimeView } from "../types";

export function renderRealtimeMain(s: any): React.JSX.Element | null {
  const {
    clearRealtimeLog, isRealtimeLoading, loadRealtimeEvents, loadRealtimeStatus,
    loadRealtimeSubscriptions, realtimeEvents, realtimeFilter, realtimePaused,
    realtimeStatus, realtimeSubSchema, realtimeSubTable, realtimeSubscriptions,
    realtimeTables, realtimeWsConnected, setRealtimeFilter, setRealtimePaused,
    setRealtimeSubSchema, setRealtimeSubTable, subscribeRealtime, unsubscribeRealtime,
    presenceUserId, presenceChannel, setPresenceChannel, presenceName, setPresenceName,
    presenceJoined, presenceUsers, joinPresenceChannel, leavePresenceChannel,
  } = s;

  const realtimeView: RealtimeView = s.realtimeView || "main";

  if (realtimeView === "developer") {
    const baseUrl = s.apiBaseUrl || "http://localhost:8787";
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/api/realtime";
    return (
      <div className="space-y-4" style={{ maxWidth: 1200 }}>
        <DeveloperSDK
          title="Realtime SDK & Code Snippets"
          description="Subscribe to database changes in real-time via WebSocket connections."
          editorTheme={s.editorTheme}
          module="realtime"
          placeholders={{ baseUrl, wsUrl }}
        />
      </div>
    );
  }

  const activeSubs = realtimeSubscriptions.filter((sub: any) => sub.active);
  const filteredEvents = realtimeFilter
    ? realtimeEvents.filter((e: any) => {
        const q = realtimeFilter.toLowerCase();
        return (e.table || "").toLowerCase().includes(q) || (e.schema || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q);
      })
    : realtimeEvents;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Realtime</h2>
          <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${realtimeWsConnected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${realtimeWsConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {realtimeWsConnected ? "Live" : "Disconnected"}
          </span>
          {realtimeStatus && (
            <span className="text-[10px] text-slate-500">{realtimeStatus.activeChannels} channel{realtimeStatus.activeChannels !== 1 ? "s" : ""} · {realtimeStatus.wsClients} client{realtimeStatus.wsClients !== 1 ? "s" : ""}</span>
          )}
        </div>
        <button onClick={() => { loadRealtimeStatus(); loadRealtimeSubscriptions(); loadRealtimeEvents(); }} disabled={isRealtimeLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40">
          {isRealtimeLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Broadcast size={13} weight="regular" /> Subscriptions</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{activeSubs.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">Active table listeners</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Lightning size={13} weight="regular" /> Events</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{realtimeEvents.length}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">In current session</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Users size={13} weight="regular" /> Clients</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{realtimeStatus?.wsClients ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">WebSocket connections</p>
        </div>
        <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Database size={13} weight="regular" /> Channels</div>
          <p className="mt-1 text-xl font-semibold text-slate-100">{realtimeStatus?.activeChannels ?? 0}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">LISTEN/NOTIFY channels</p>
        </div>
      </div>

      {/* Presence */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-medium text-slate-200">Presence</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">See who's online in real time. Join a channel to broadcast your presence to other connected clients.</p>
          </div>
          {presenceJoined && (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online in #{presenceChannel}
            </span>
          )}
        </div>
        <div className="mb-4 flex items-end gap-2">
          <div className="w-36">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Channel</label>
            <input
              value={presenceChannel}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPresenceChannel(e.target.value)}
              disabled={presenceJoined}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              placeholder="lobby"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Display name</label>
            <input
              value={presenceName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPresenceName(e.target.value)}
              disabled={presenceJoined}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
              placeholder="Your name"
            />
          </div>
          {presenceJoined ? (
            <button
              onClick={() => leavePresenceChannel(presenceChannel)}
              className="truss-btn rounded border border-red-700/50 bg-red-500/10 px-4 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
            >
              <SignOut size={13} /> Leave
            </button>
          ) : (
            <button
              onClick={() => joinPresenceChannel(presenceChannel, presenceUserId, { name: presenceName })}
              disabled={!realtimeWsConnected || !presenceChannel.trim()}
              className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
            >
              <SignIn size={13} /> Join
            </button>
          )}
        </div>
        {presenceUsers.length === 0 ? (
          <p className="text-[11px] text-slate-500">{presenceJoined ? "You're the only one here." : "Join a channel to see who's online."}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {presenceUsers.map((user: any) => {
              const name = user.meta?.name || user.user_id;
              const initials = name.slice(0, 2).toUpperCase();
              const isMe = user.user_id === presenceUserId;
              return (
                <div key={user.user_id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${isMe ? "border-accent-600/40 bg-accent-600/10" : "border-slate-700/60 bg-slate-950/60"}`}>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-600/30 text-[10px] font-bold text-accent-300">
                    {initials}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{name}{isMe && <span className="ml-1 text-[10px] text-slate-500">(you)</span>}</p>
                    <p className="text-[10px] text-slate-500">joined {new Date(user.joinedAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscribe section */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-2 text-xs font-medium text-slate-200">Subscribe to Table Changes</h3>
        <p className="mb-3 text-[11px] text-slate-500">Enable realtime for a table. Creates a PostgreSQL trigger that broadcasts INSERT, UPDATE, and DELETE events via WebSocket.</p>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Schema</label>
            <input value={realtimeSubSchema} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRealtimeSubSchema(e.target.value)} className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Table</label>
            <select value={realtimeSubTable} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRealtimeSubTable(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
              <option value="">Select a table...</option>
              {realtimeTables.filter((t: any) => t.table_schema === realtimeSubSchema).map((t: any) => (
                <option key={t.table_name} value={t.table_name}>{t.table_name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => { if (realtimeSubTable) subscribeRealtime(realtimeSubSchema, realtimeSubTable); }}
            disabled={!realtimeSubTable}
            className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
          >
            <Broadcast size={13} /> Subscribe
          </button>
        </div>
      </div>

      {/* Active subscriptions */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-3 text-xs font-medium text-slate-200">Active Subscriptions ({activeSubs.length})</h3>
        {activeSubs.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No active subscriptions. Subscribe to a table above to start receiving events.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeSubs.map((sub: any) => (
              <div key={sub.id} className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-950/60 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">{sub.schema_name}.{sub.table_name}</p>
                  <p className="text-[10px] text-slate-500">Since {new Date(sub.created_at).toLocaleString()}</p>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <button onClick={() => unsubscribeRealtime(sub.schema_name, sub.table_name)} className="rounded p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-400" title="Unsubscribe">
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live event feed */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-medium text-slate-200">Event Feed</h3>
            <span className="text-[10px] text-slate-500">{filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}</span>
            {realtimeWsConnected && (
              <button onClick={() => setRealtimePaused((p: boolean) => !p)} className={`rounded px-2 py-0.5 text-[10px] ${realtimePaused ? "bg-amber-500/10 text-amber-300 border border-amber-500/30" : "text-slate-500 hover:text-slate-300"}`}>
                {realtimePaused ? "Paused" : "Pause"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlass size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={realtimeFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRealtimeFilter(e.target.value)}
                placeholder="Filter events..."
                className="w-40 rounded border border-slate-700 bg-slate-950 py-1 pl-7 pr-2 text-[11px] text-slate-200 placeholder:text-slate-600"
              />
            </div>
            <button onClick={clearRealtimeLog} className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200">Clear</button>
          </div>
        </div>
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Broadcast size={32} className="mb-3 text-slate-600" />
            <p className="text-xs text-slate-400">{realtimeWsConnected ? "Waiting for events..." : "Connect to start receiving live events."}</p>
            <p className="mt-1 text-[10px] text-slate-500">Changes to subscribed tables will appear here in real time.</p>
          </div>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-auto">
            {filteredEvents.map((event: any, i: number) => {
              const typeColor = event.type === "INSERT" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
                : event.type === "UPDATE" ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                : event.type === "DELETE" ? "text-red-400 bg-red-500/10 border-red-500/30"
                : "text-slate-400 bg-slate-800 border-slate-700";
              return (
                <details key={i} className="group rounded border border-slate-800 bg-slate-950/60">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs">
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${typeColor}`}>{event.type}</span>
                    <span className="font-mono text-slate-300">{event.schema}.{event.table}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{event.received_at ? new Date(event.received_at).toLocaleTimeString() : ""}</span>
                  </summary>
                  <div className="border-t border-slate-800 px-3 py-2">
                    {event.type === "UPDATE" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-[9px] uppercase tracking-widest text-slate-500">Old</p>
                          <pre className="max-h-32 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-300">{JSON.stringify(event.old, null, 2)}</pre>
                        </div>
                        <div>
                          <p className="mb-1 text-[9px] uppercase tracking-widest text-slate-500">New</p>
                          <pre className="max-h-32 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-emerald-300">{JSON.stringify(event.new, null, 2)}</pre>
                        </div>
                      </div>
                    ) : (
                      <pre className="max-h-32 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-300">{JSON.stringify(event.new || event.old, null, 2)}</pre>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function renderRealtimePaneB(s: any): React.JSX.Element | null {
  const {
    connectRealtimeWs, disconnectRealtimeWs, realtimeEvents, realtimeStatus,
    realtimeWsConnected,
  } = s;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${realtimeWsConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
        <span className="text-[10px] text-slate-400">{realtimeWsConnected ? "Live" : "Disconnected"}</span>
      </div>
      {realtimeStatus && (
        <div className="space-y-1 px-1 text-[10px] text-slate-500">
          <p>{realtimeStatus.activeChannels} channel{realtimeStatus.activeChannels !== 1 ? "s" : ""}</p>
          <p>{realtimeStatus.wsClients} client{realtimeStatus.wsClients !== 1 ? "s" : ""}</p>
          <p>{realtimeEvents.length} event{realtimeEvents.length !== 1 ? "s" : ""}</p>
        </div>
      )}
      <div className="border-t border-slate-800 pt-2">
        {realtimeWsConnected ? (
          <button onClick={disconnectRealtimeWs} className="truss-btn truss-nav-btn w-full rounded border border-slate-800 bg-slate-950 px-2 py-2 text-left text-xs text-red-300 hover:bg-red-500/5">
            <span className="inline-flex items-center gap-1.5"><Prohibit size={14} /> Disconnect</span>
          </button>
        ) : (
          <button onClick={connectRealtimeWs} className="truss-btn truss-nav-btn w-full rounded border border-accent-600/40 bg-accent-600/5 px-2 py-2 text-left text-xs text-accent-300 hover:bg-accent-600/10">
            <span className="inline-flex items-center gap-1.5"><Broadcast size={14} /> Connect</span>
          </button>
        )}
      </div>
      <div className="border-t border-slate-800 pt-2">
        <button onClick={() => s.setRealtimeView && s.setRealtimeView("developer")}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${(s.realtimeView || "main") === "developer" ? "border-slate-600 bg-slate-800 text-slate-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}>
          <span className="inline-flex items-center gap-1.5"><Code size={18} weight="regular" />Developer</span>
        </button>
      </div>
    </div>
  );
}
