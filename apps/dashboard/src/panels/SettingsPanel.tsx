// SettingsPanel.tsx — Settings panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  UserCircle,
  GearSix,
  Users,
  Key,
  Bell,
  ClipboardText,
  Export,
  Trash,
  Sun,
  Moon,
  Monitor,
  Eye,
  EyeSlash,
  Copy,
  Check,
  Warning,
  CaretDown,
  Database,
  CloudArrowDown,
  ShieldCheck,
  Wrench,
  PencilSimple,
  Plug,
} from "@phosphor-icons/react";
import {
  type SettingsView,
  type ThemeMode,
  deleteAllConnectionProfilesFromApi,
  downloadFile,
  apiFetch,
} from "../types";

// ---------------------------------------------------------------------------
// Helper: ApiKeysTable
// ---------------------------------------------------------------------------
function ApiKeysTable({ apiKeys, revokeApiKey, updateApiKeyRateLimit }: {
  apiKeys: Array<Record<string, any>>;
  revokeApiKey: (id: string) => void;
  updateApiKeyRateLimit: (id: string, rateLimit: number | null) => void;
}) {
  const [editingKeyId, setEditingKeyId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");

  const planDefault = 100;

  const startEdit = (k: Record<string, any>) => {
    setEditingKeyId(k.id);
    setEditValue(k.rate_limit != null ? String(k.rate_limit) : "");
  };

  const saveEdit = (id: string) => {
    const parsed = editValue.trim() === "" ? null : parseInt(editValue, 10);
    const rateLimit = parsed && !isNaN(parsed) && parsed > 0 ? parsed : null;
    updateApiKeyRateLimit(id, rateLimit);
    setEditingKeyId(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingKeyId(null);
    setEditValue("");
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-slate-900 text-slate-400 font-medium">
          <tr>
            <th className="px-4 py-2.5 border-b border-slate-800">Prefix</th>
            <th className="px-4 py-2.5 border-b border-slate-800">Type</th>
            <th className="px-4 py-2.5 border-b border-slate-800">Label</th>
            <th className="px-4 py-2.5 border-b border-slate-800">Rate Limit</th>
            <th className="px-4 py-2.5 border-b border-slate-800">Created</th>
            <th className="px-4 py-2.5 border-b border-slate-800">Last Used</th>
            <th className="px-4 py-2.5 border-b border-slate-800 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No API keys yet. Generate one to connect your app.</td>
            </tr>
          ) : (
            apiKeys.map((k) => (
              <tr key={k.id} className={`border-b border-slate-900 ${k.revoked ? "opacity-40" : "hover:bg-slate-900/40"}`}>
                <td className="px-4 py-3 font-mono text-slate-300">{k.key_prefix}...</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${k.key_type === "service_role" ? "bg-amber-500/15 text-amber-300" : "bg-sky-500/15 text-sky-300"}`}>
                    {k.key_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-200">{k.label}</td>
                <td className="px-4 py-3">
                  {k.revoked ? (
                    <span className="text-slate-600">&mdash;</span>
                  ) : editingKeyId === k.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="100000"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(k.id); if (e.key === "Escape") cancelEdit(); }}
                        placeholder={String(planDefault)}
                        className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-accent-500"
                        autoFocus
                      />
                      <button onClick={() => saveEdit(k.id)} className="rounded bg-accent-500 px-2 py-1 text-[10px] font-medium text-slate-950 hover:bg-accent-400">Save</button>
                      <button onClick={cancelEdit} className="rounded px-2 py-1 text-[10px] text-slate-400 hover:text-slate-200">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs ${k.rate_limit != null ? "text-slate-100" : "text-slate-500"}`}>
                        {k.rate_limit != null ? `${k.rate_limit.toLocaleString()} req/min` : `${planDefault.toLocaleString()} req/min`}
                      </span>
                      {k.rate_limit != null && (
                        <span className="rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] font-medium text-accent-300">Custom</span>
                      )}
                      <button onClick={() => startEdit(k)} className="ml-1 text-slate-500 hover:text-slate-300" title="Edit rate limit">
                        <PencilSimple size={13} weight="regular" />
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(k.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}</td>
                <td className="px-4 py-3 text-right">
                  {k.revoked ? (
                    <span className="text-[10px] text-slate-600">Revoked</span>
                  ) : (
                    <button onClick={() => revokeApiKey(k.id)} className="text-[10px] text-red-400 hover:underline">Revoke</button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: TeamPanel
// ---------------------------------------------------------------------------
function TeamPanel({ apiBaseUrl, session }: { apiBaseUrl: string; session: any }) {
  const [orgs, setOrgs] = React.useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  // Create org form
  const [showCreate, setShowCreate] = React.useState(false);
  const [newOrgName, setNewOrgName] = React.useState("");
  // Invite form
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("member");
  // Rename org
  const [renamingOrg, setRenamingOrg] = React.useState(false);
  const [orgRenameValue, setOrgRenameValue] = React.useState("");

  const loadOrgs = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs`);
      const body = await res.json();
      setOrgs(body.orgs || []);
    } catch { setErr("Failed to load organizations."); }
    setLoading(false);
  }, [apiBaseUrl]);

  const loadOrgDetail = React.useCallback(async (orgId: string) => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${orgId}`);
      if (!res.ok) return;
      const body = await res.json();
      setSelectedOrg(body);
    } catch { /* ignore */ }
  }, [apiBaseUrl]);

  React.useEffect(() => {
    if (!loaded) { loadOrgs(); setLoaded(true); }
  }, [loaded, loadOrgs]);

  const createOrg = async () => {
    if (!newOrgName.trim()) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to create org."); return; }
      setMsg("Organization created.");
      setNewOrgName("");
      setShowCreate(false);
      loadOrgs();
    } catch { setErr("Failed to create organization."); }
  };

  const sendInvite = async () => {
    if (!selectedOrg || !inviteEmail.trim()) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${selectedOrg.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to send invite."); return; }
      setMsg(`Invitation sent to ${inviteEmail.trim()}.`);
      setInviteEmail("");
      setShowInvite(false);
      loadOrgDetail(selectedOrg.id);
    } catch { setErr("Failed to send invitation."); }
  };

  const removeMember = async (memberId: string) => {
    if (!selectedOrg || !window.confirm("Remove this member from the organization?")) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${selectedOrg.id}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to remove member."); return; }
      setMsg("Member removed.");
      loadOrgDetail(selectedOrg.id);
    } catch { setErr("Failed to remove member."); }
  };

  const changeRole = async (memberId: string, newRole: string) => {
    if (!selectedOrg) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${selectedOrg.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to change role."); return; }
      setMsg("Role updated.");
      loadOrgDetail(selectedOrg.id);
    } catch { setErr("Failed to change role."); }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!selectedOrg) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${selectedOrg.id}/invites/${inviteId}`, { method: "DELETE" });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to revoke invite."); return; }
      setMsg("Invitation revoked.");
      loadOrgDetail(selectedOrg.id);
    } catch { setErr("Failed to revoke invite."); }
  };

  const deleteOrg = async (orgId: string) => {
    if (!window.confirm("Delete this organization? This cannot be undone. All members will be removed.")) return;
    setErr(""); setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${orgId}`, { method: "DELETE" });
      if (!res.ok) { const b = await res.json(); setErr(b.error || "Failed to delete organization."); return; }
      setMsg("Organization deleted.");
      setSelectedOrg(null);
      loadOrgs();
    } catch { setErr("Failed to delete organization."); }
  };

  const renameOrg = async () => {
    const trimmed = orgRenameValue.trim();
    if (!trimmed || !selectedOrg || trimmed === selectedOrg.name) { setRenamingOrg(false); return; }
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/orgs/${selectedOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error || "Failed to rename org."); }
      else { setMsg("Organization renamed."); setSelectedOrg({ ...selectedOrg, name: trimmed }); loadOrgs(); }
    } catch { setErr("Failed to rename organization."); }
    setRenamingOrg(false);
  };

  const totalMembers = orgs.reduce((sum: number, o: any) => sum + (o.member_count || 0), 0);

  // -- Detail view --
  if (selectedOrg) {
    const plan = selectedOrg.plan || "starter";
    const members = selectedOrg.members || [];
    const invites = selectedOrg.invites || [];
    const myMember = members.find((m: any) => m.tenant_id === session?.id);
    const isAdminOrOwner = myMember?.role === "owner" || myMember?.role === "admin";

    return (
      <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
        <button onClick={() => setSelectedOrg(null)} className="mb-1 text-xs text-slate-400 hover:text-slate-200">&larr; All Organizations</button>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              {renamingOrg ? (
                <input
                  autoFocus
                  value={orgRenameValue}
                  onChange={e => setOrgRenameValue(e.target.value)}
                  onBlur={renameOrg}
                  onKeyDown={e => { if (e.key === "Enter") renameOrg(); if (e.key === "Escape") setRenamingOrg(false); }}
                  className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-sm font-medium text-slate-100 outline-none focus:border-accent-500"
                />
              ) : (
                <>
                  <h2 className="text-sm font-medium text-slate-100">{selectedOrg.name}</h2>
                  {isAdminOrOwner && (
                    <button onClick={() => { setOrgRenameValue(selectedOrg.name); setRenamingOrg(true); }} className="text-slate-500 hover:text-slate-300" title="Rename organization">
                      <PencilSimple size={13} weight="regular" />
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-500">/{selectedOrg.slug} &middot; Plan: <span className="capitalize">{plan}</span> &middot; {members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          {isAdminOrOwner && (
            <button onClick={() => setShowInvite(!showInvite)} className="rounded-lg border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/20">
              Invite Member
            </button>
          )}
        </div>

        {err && <p className="text-xs text-red-400">{err}</p>}
        {msg && <p className="text-xs text-emerald-400">{msg}</p>}

        {/* Invite form */}
        {showInvite && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
            <p className="text-xs font-medium text-slate-300">Invite a team member</p>
            <div className="flex gap-2">
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 outline-none"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button onClick={sendInvite} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs text-white hover:bg-accent-700">Send</button>
              <button onClick={() => setShowInvite(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
            </div>
          </div>
        )}

        {/* Members list */}
        <div>
          <p className="mb-2 text-xs font-medium text-slate-300">Members</p>
          <div className="space-y-1">
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs text-slate-200">{m.display_name || m.email}</p>
                    {m.display_name && <p className="text-[10px] text-slate-500">{m.email}</p>}
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                    m.role === "owner" ? "bg-accent-600/20 text-accent-300" :
                    m.role === "admin" ? "bg-cyan-600/20 text-cyan-300" :
                    m.role === "member" ? "bg-slate-600/20 text-slate-300" :
                    "bg-slate-800 text-slate-500"
                  }`}>{m.role}</span>
                </div>
                {isAdminOrOwner && m.tenant_id !== session?.id && m.role !== "owner" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value)}
                      className="rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-[10px] text-slate-300 outline-none"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button onClick={() => removeMember(m.id)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites */}
        {invites.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-slate-300">Pending Invitations</p>
            <div className="space-y-1">
              {invites.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5">
                  <div>
                    <p className="text-xs text-slate-200">{inv.email}</p>
                    <p className="text-[10px] text-slate-500">Role: {inv.role} &middot; Expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                  </div>
                  {isAdminOrOwner && (
                    <button onClick={() => revokeInvite(inv.id)} className="text-[10px] text-red-400 hover:text-red-300">Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger: delete org (owner only) */}
        {myMember?.role === "owner" && (
          <div className="mt-4 rounded-xl border border-red-900/30 bg-red-950/10 p-5">
            <p className="text-xs font-medium text-red-300">Delete Organization</p>
            <p className="mt-1 text-[11px] text-slate-500">Permanently remove this organization and all its members. Cannot be undone.</p>
            <button onClick={() => deleteOrg(selectedOrg.id)} className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10">
              Delete Organization
            </button>
          </div>
        )}
      </div>
    );
  }

  // -- Org list view --
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      {/* Summary hero */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-100">Team & Organizations</h2>
            <p className="mt-1 text-[11px] text-slate-500">Manage your organizations and team members.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-100">{orgs.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Orgs</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-100">{totalMembers}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Members</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={() => loadOrgs()} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button onClick={() => setShowCreate(!showCreate)} className="rounded-lg border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/20">
          New Organization
        </button>
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}

      {/* Create org form */}
      {showCreate && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
          <p className="text-xs font-medium text-slate-300">Create a new organization</p>
          <div className="flex gap-2">
            <input
              value={newOrgName}
              onChange={e => setNewOrgName(e.target.value)}
              placeholder="Organization name"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500"
              onKeyDown={e => e.key === "Enter" && createOrg()}
            />
            <button onClick={createOrg} className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs text-white hover:bg-accent-700">Create</button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Org list */}
      {orgs.length === 0 && !loading && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
          <p className="text-xs text-slate-400">No organizations yet.</p>
          <p className="mt-1 text-[11px] text-slate-500">Create an organization to manage team members and collaborate.</p>
        </div>
      )}
      <div className="space-y-2">
        {orgs.map((org: any) => (
          <button
            key={org.id}
            onClick={() => loadOrgDetail(org.id)}
            className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left hover:bg-slate-800/60 transition-colors"
          >
            <div>
              <p className="text-xs font-medium text-slate-200">{org.name}</p>
              <p className="text-[10px] text-slate-500">/{org.slug} &middot; {org.member_count} member{org.member_count !== 1 ? "s" : ""} &middot; Your role: {org.my_role}</p>
            </div>
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              org.my_role === "owner" ? "bg-accent-600/20 text-accent-300" :
              org.my_role === "admin" ? "bg-cyan-600/20 text-cyan-300" :
              "bg-slate-600/20 text-slate-300"
            }`}>{org.my_role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: GeneralSettingsPanel
// ---------------------------------------------------------------------------
function GeneralSettingsPanel({ apiBaseUrl, appEnvironment, setAppEnvironment, accountInfo, setAccountInfo }: {
  apiBaseUrl: string;
  appEnvironment: string;
  setAppEnvironment: (e: "development" | "staging" | "production") => void;
  accountInfo: string;
  setAccountInfo: (s: string) => void;
}) {
  const [appName, setAppName] = useState("");
  const [envLabel, setEnvLabel] = useState(appEnvironment as "development" | "staging" | "production");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [alertPct, setAlertPct] = useState(80);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState("");
  const [isSavingAlert, setIsSavingAlert] = useState(false);

  useEffect(() => {
    apiFetch(`${apiBaseUrl}/api/settings/dashboard-config`).then(r => r.json()).then(b => {
      if (b.general) {
        if (b.general.project_name) setAppName(b.general.project_name);
        if (b.general.environment) setEnvLabel(b.general.environment);
      }
      if (b.smtp) {
        if (b.smtp.smtp_host) { setSmtpHost(b.smtp.smtp_host); setSmtpConfigured(true); }
        if (b.smtp.smtp_port) setSmtpPort(b.smtp.smtp_port);
        if (b.smtp.smtp_user) setSmtpUser(b.smtp.smtp_user);
        if (b.smtp.smtp_from) setSmtpFrom(b.smtp.smtp_from);
      }
      if (b.billing_alert_pct) setAlertPct(Number(b.billing_alert_pct));
    }).catch(() => {});
  }, [apiBaseUrl]);

  async function saveGeneral() {
    setIsSavingGeneral(true);
    try {
      await apiFetch(`${apiBaseUrl}/api/settings/general`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: appName, environment: envLabel }),
      });
      setAppEnvironment(envLabel);
      setAccountInfo("General settings saved.");
    } catch { setAccountInfo("Failed to save general settings."); }
    finally { setIsSavingGeneral(false); }
  }

  async function saveSmtp() {
    setIsSavingSmtp(true);
    try {
      await apiFetch(`${apiBaseUrl}/api/settings/smtp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smtp_host: smtpHost, smtp_port: smtpPort, smtp_user: smtpUser, smtp_pass: smtpPass, smtp_from: smtpFrom }),
      });
      setSmtpConfigured(!!smtpHost);
      setAccountInfo("SMTP configuration saved. Email notifications will be enabled in a future update.");
    } catch { setAccountInfo("Failed to save SMTP settings."); }
    finally { setIsSavingSmtp(false); }
  }

  async function saveAlert() {
    setIsSavingAlert(true);
    try {
      await apiFetch(`${apiBaseUrl}/api/settings/billing-alert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_pct: alertPct }),
      });
      setAccountInfo(`Usage alert threshold set to ${alertPct}%.`);
    } catch { setAccountInfo("Failed to save alert threshold."); }
    finally { setIsSavingAlert(false); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      <div>
        <h2 className="text-sm font-medium text-slate-100">General Settings</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Configure your project identity, email, and alerting.</p>
      </div>
      {accountInfo && <p className="text-xs text-emerald-300">{accountInfo}</p>}

      {/* App identity */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-300">App Identity</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">App Name</label>
            <input value={appName} onChange={e => setAppName(e.target.value)} placeholder="My App" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Environment Label</label>
            <select value={envLabel} onChange={e => setEnvLabel(e.target.value as any)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100">
              <option value="development">Development</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </div>
        </div>
        <button onClick={saveGeneral} disabled={isSavingGeneral} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {isSavingGeneral ? "Saving\u2026" : "Save"}
        </button>
      </div>

      {/* SMTP */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">SMTP / Email</p>
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${smtpConfigured ? "bg-emerald-400" : "bg-slate-600"}`} />
            <span className="text-[10px] text-slate-500">{smtpConfigured ? "Configured" : "Not configured"}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Configure your own mail provider for transactional emails (verification, recovery, alerts).</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">SMTP Host</label>
            <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Port</label>
            <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Username</label>
            <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="user@example.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">Password</label>
            <input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] text-slate-400">From Address</label>
            <input value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)} placeholder="no-reply@example.com" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveSmtp} disabled={isSavingSmtp} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            {isSavingSmtp ? "Saving\u2026" : "Save SMTP"}
          </button>
          {smtpConfigured && (
            <button onClick={async () => {
              setTestEmailStatus("sending");
              try {
                const r = await apiFetch(`${apiBaseUrl}/api/settings/test-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: smtpFrom || smtpUser }) });
                const b = await r.json();
                setTestEmailStatus(b.ok || b.success ? "sent" : "failed");
              } catch { setTestEmailStatus("failed"); }
              setTimeout(() => setTestEmailStatus(""), 4000);
            }} disabled={testEmailStatus === "sending"} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              {testEmailStatus === "sending" ? "Sending\u2026" : testEmailStatus === "sent" ? "\u2713 Sent!" : testEmailStatus === "failed" ? "Failed" : "Send Test Email"}
            </button>
          )}
        </div>
      </div>

      {/* Billing alert threshold */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-300">Usage Alert Threshold</p>
        <p className="text-[11px] text-slate-500">Show a warning when any resource reaches this percentage of its plan limit.</p>
        <div className="flex items-center gap-3">
          <input type="range" min={50} max={100} step={5} value={alertPct} onChange={e => setAlertPct(Number(e.target.value))} className="flex-1 accent-accent-400" />
          <span className="text-xs font-semibold text-slate-200 w-10">{alertPct}%</span>
        </div>
        <button onClick={saveAlert} disabled={isSavingAlert} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {isSavingAlert ? "Saving\u2026" : "Save Threshold"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: NotificationsPanel
// ---------------------------------------------------------------------------
function NotificationsPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const categories = [
    { key: "security", label: "Security alerts", desc: "Failed logins, password changes, new sessions" },
    { key: "usage", label: "Usage warnings", desc: "Approaching plan limits, quota alerts" },
    { key: "billing", label: "Billing events", desc: "Payment success, failed charges, plan changes" },
    { key: "team", label: "Team activity", desc: "Member joins, role changes, invitations" },
    { key: "deployment", label: "Deployment", desc: "Deploy status, migration results, health changes" },
  ];

  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    security: true,
    usage: true,
    billing: true,
    team: false,
    deployment: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!loaded) {
      setLoaded(true);
      apiFetch(`${apiBaseUrl}/api/settings/notifications`).then(r => r.json()).then(b => {
        if (b.prefs) setPrefs(b.prefs);
      }).catch(() => {});
    }
  }, [loaded, apiBaseUrl]);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs }),
      });
      if (res.ok) setMsg("Notification preferences saved.");
      else setMsg("Failed to save preferences.");
    } catch { setMsg("Failed to save preferences."); }
    finally { setSaving(false); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      <div>
        <h2 className="text-sm font-medium text-slate-100">Notifications</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Choose which events trigger notifications.</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        {/* Header */}
        <div className="flex items-center gap-4 pb-3 mb-3 border-b border-slate-800">
          <span className="flex-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Category</span>
          <span className="w-16 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Email</span>
          <span className="w-16 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wider">In-App</span>
        </div>

        <div className="space-y-1">
          {categories.map(cat => (
            <div key={cat.key} className="flex items-center gap-4 py-2.5 rounded-lg px-2 hover:bg-slate-800/30">
              <div className="flex-1">
                <p className="text-xs text-slate-200">{cat.label}</p>
                <p className="text-[10px] text-slate-500">{cat.desc}</p>
              </div>
              {/* Email toggle */}
              <div className="w-16 flex justify-center">
                <button
                  onClick={() => setPrefs(p => ({ ...p, [cat.key]: !p[cat.key] }))}
                  className={`w-9 h-5 rounded-full transition-colors relative ${prefs[cat.key] ? "bg-accent-600" : "bg-slate-700"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${prefs[cat.key] ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>
              {/* In-App toggle (disabled) */}
              <div className="w-16 flex justify-center" title="Coming soon">
                <button disabled className="w-9 h-5 rounded-full bg-slate-800 opacity-40 cursor-not-allowed relative">
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-500" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
          {msg && <p className={`text-xs ${msg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>{msg}</p>}
          {!msg && <span />}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50 transition"
          >
            {saving ? "Saving\u2026" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: DataExportPanel
// ---------------------------------------------------------------------------
function DataExportPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [loadedSizes, setLoadedSizes] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!loadedSizes) {
      setLoadedSizes(true);
      apiFetch(`${apiBaseUrl}/api/settings/export-sizes`).then(r => r.json()).then(b => {
        if (b.sizes) setSizes(b.sizes);
      }).catch(() => {});
    }
  }, [loadedSizes, apiBaseUrl]);

  const exportItems = [
    { type: "database", icon: <Database size={18} weight="regular" />, label: "Database", desc: "PostgreSQL dump of your database", color: "text-sky-400" },
    { type: "storage", icon: <CloudArrowDown size={18} weight="regular" />, label: "Storage", desc: "All files in your storage buckets", color: "text-amber-400" },
    { type: "auth", icon: <ShieldCheck size={18} weight="regular" />, label: "Auth Identities", desc: "User identities from authentication", color: "text-emerald-400" },
    { type: "config", icon: <Wrench size={18} weight="regular" />, label: "Configuration", desc: "Settings, webhooks, saved queries", color: "text-accent-400" },
  ];

  async function doExport(type: string) {
    setExporting(type);
    setMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setMsg(b.error || `Failed to export ${type}.`);
        setExporting(null);
        return;
      }
      // For config and auth, download as JSON
      if (type === "config" || type === "auth") {
        const data = await res.json();
        downloadFile(`truss-${type}-export.json`, JSON.stringify(data, null, 2), "application/json");
        setMsg(`${type === "config" ? "Configuration" : "Auth identities"} exported successfully.`);
      } else {
        // Database and storage return instructions
        const data = await res.json();
        setMsg(data.message || `${type} export initiated. Check the instructions provided.`);
      }
    } catch { setMsg(`Failed to export ${type}.`); }
    finally { setExporting(null); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      {/* Hero */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center gap-3">
          <Export size={18} weight="regular" className="text-accent-400" />
          <div>
            <h2 className="text-sm font-medium text-slate-100">Your Data, Your Choice</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">No vendor lock-in. Export everything.</p>
          </div>
        </div>
      </div>

      {msg && <p className={`text-xs ${msg.includes("Failed") ? "text-red-400" : msg.includes("use ") || msg.includes("pg_dump") || msg.includes("S3 client") || msg.includes("instructions") ? "text-sky-400" : "text-emerald-400"}`}>{msg}</p>}

      {/* Export cards */}
      {exportItems.map(item => (
        <div key={item.type} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={item.color}>{item.icon}</span>
              <div>
                <p className="text-xs font-medium text-slate-200">{item.label}</p>
                <p className="text-[10px] text-slate-500">{item.desc}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {sizes[item.type] && (
                <span className="text-[10px] text-slate-500">{sizes[item.type]}</span>
              )}
              <button
                onClick={() => doExport(item.type)}
                disabled={exporting === item.type}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50 transition"
              >
                {exporting === item.type ? "Exporting\u2026" : "Export"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: DangerConfirmButton
// ---------------------------------------------------------------------------
function DangerConfirmButton({ label, confirmLabel, onConfirm }: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 transition"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-red-300">{confirmLabel}</span>
      <button
        onClick={() => { onConfirm(); setConfirming(false); }}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition"
      >
        Confirm
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------
export function renderSettingsMain(s: any): React.JSX.Element | null {
  const {
    settingsView, apiBaseUrl, session,
    profileNewPassword, setProfileNewPassword,
    profileConfirmPassword, setProfileConfirmPassword,
    profilePasswordError, profilePasswordSuccess,
    changePassword, handleLogout,
    appEnvironment, setAppEnvironment, accountInfo, setAccountInfo,
    themeMode, setThemeMode,
    auditLogs, loadAuditLogs, isAuditLogsLoading, accountError,
    apiKeys, loadApiKeys, isApiKeysLoading, createApiKey, revokeApiKey, updateApiKeyRateLimit,
    newKeySecret, setNewKeySecret, apiKeyCopied, setApiKeyCopied,
    connectionProfiles, setConnectionProfiles,
  } = s;

  // Permission gate: require settings.view ability
  const permsS = (s as any).permissions;
  if (permsS && !permsS.isAdmin && !permsS.abilities.includes("settings.view")) {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-6 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium text-slate-300">Access Restricted</p>
          <p className="text-xs text-slate-500">You do not have permission to view settings. Contact your organization admin.</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Account view (replaces profile + preferences)
  // -----------------------------------------------------------------------
  if (settingsView === "account") {
    return <AccountView
      session={session}
      themeMode={themeMode}
      setThemeMode={setThemeMode}
      profileNewPassword={profileNewPassword}
      setProfileNewPassword={setProfileNewPassword}
      profileConfirmPassword={profileConfirmPassword}
      setProfileConfirmPassword={setProfileConfirmPassword}
      profilePasswordError={profilePasswordError}
      profilePasswordSuccess={profilePasswordSuccess}
      changePassword={changePassword}
      handleLogout={handleLogout}
      apiBaseUrl={apiBaseUrl}
    />;
  }

  // -----------------------------------------------------------------------
  // General
  // -----------------------------------------------------------------------
  if (settingsView === "general") {
    return <GeneralSettingsPanel
      apiBaseUrl={apiBaseUrl}
      appEnvironment={appEnvironment}
      setAppEnvironment={setAppEnvironment}
      accountInfo={accountInfo}
      setAccountInfo={setAccountInfo}
    />;
  }

  // -----------------------------------------------------------------------
  // Team
  // -----------------------------------------------------------------------
  if (settingsView === "team") {
    return <TeamPanel apiBaseUrl={apiBaseUrl} session={session} />;
  }

  // -----------------------------------------------------------------------
  // API Keys
  // -----------------------------------------------------------------------
  if (settingsView === "api-keys") {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-slate-100">API Keys</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Keys authenticate client apps against the Truss API. <span className="text-slate-400">anon</span> keys respect RLS, <span className="text-slate-400">service_role</span> keys bypass it.</p>
          </div>
          <button
            onClick={loadApiKeys}
            disabled={isApiKeysLoading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            {isApiKeysLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Create key form */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="mb-3 text-xs font-medium text-slate-300">Generate New Key</p>
          <div className="flex gap-2">
            <select id="new-key-type" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:outline-none">
              <option value="anon">anon</option>
              <option value="service_role">service_role</option>
            </select>
            <input id="new-key-label" placeholder="Label (e.g. frontend-app)" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none" />
            <button
              onClick={() => {
                const typeEl = document.getElementById("new-key-type") as HTMLSelectElement;
                const labelEl = document.getElementById("new-key-label") as HTMLInputElement;
                createApiKey(typeEl.value, labelEl.value || "Untitled");
                labelEl.value = "";
              }}
              className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-accent-400"
            >
              Generate
            </button>
          </div>
        </div>

        {/* Secret display (shown once after creation) */}
        {newKeySecret && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-5">
            <p className="mb-2 text-xs font-medium text-amber-300">Key Created &mdash; copy it now, it won't be shown again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-100 font-mono break-all select-all">{newKeySecret}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(newKeySecret); setApiKeyCopied(true); }}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5 ${apiKeyCopied ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}
              >
                {apiKeyCopied ? <><Check size={13} weight="regular" /> Copied</> : <><Copy size={13} weight="regular" /> Copy</>}
              </button>
            </div>
            <button onClick={() => setNewKeySecret(null)} className="mt-2 text-[10px] text-slate-500 hover:text-slate-300">Dismiss</button>
          </div>
        )}

        {/* Keys table */}
        <ApiKeysTable apiKeys={apiKeys} revokeApiKey={revokeApiKey} updateApiKeyRateLimit={updateApiKeyRateLimit} />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Notifications
  // -----------------------------------------------------------------------
  if (settingsView === "notifications") {
    return <NotificationsPanel apiBaseUrl={apiBaseUrl} />;
  }

  // -----------------------------------------------------------------------
  // Integrations (centralized connection status)
  // -----------------------------------------------------------------------
  if (settingsView === "integrations") {
    const integrationsStatus = (s as any).integrationsStatus;
    const authKratosHealthy = (s as any).authKratosHealthy;
    const ketoHealth = (s as any).ketoHealth;
    const hydraHealth = (s as any).hydraHealth;
    const oathkeeperHealth = (s as any).oathkeeperHealth;
    const oathkeeperVersion = (s as any).oathkeeperVersion;
    const metadata = (s as any).metadata;

    const dbOk = Boolean(metadata);
    const authOk = integrationsStatus?.auth?.reachable === true || integrationsStatus?.auth?.admin?.reachable === true;
    const ketoOk = ketoHealth?.read?.status === "ok";
    const hydraOk = hydraHealth?.health?.status === "ok";
    const gatewayOk = oathkeeperHealth?.health?.status === "ok";
    const storageOk = integrationsStatus?.storage?.s3?.reachable === true || integrationsStatus?.storage?.console?.reachable === true;

    const services = [
      {
        name: "Database", ok: dbOk,
        details: [
          metadata?.currentDatabase ? { label: "Database", value: metadata.currentDatabase } : null,
          metadata?.version ? { label: "Version", value: `PostgreSQL ${metadata.version}` } : null,
        ].filter(Boolean),
      },
      {
        name: "Authentication", ok: authOk, subtitle: "Ory Kratos",
        details: [
          integrationsStatus?.auth?.publicUrl ? { label: "Public URL", value: integrationsStatus.auth.publicUrl } : null,
          { label: "Admin API", value: integrationsStatus?.auth?.admin?.reachable ? "Connected" : "Not configured" },
        ].filter(Boolean),
      },
      {
        name: "Authorization", ok: ketoOk, subtitle: "Ory Keto",
        details: [
          { label: "Read API", value: ketoOk ? "Connected" : "Unreachable" },
          { label: "Write API", value: ketoHealth?.writeConfigured ? "Configured" : "Not configured" },
        ].filter(Boolean),
      },
      {
        name: "OAuth2 / OIDC", ok: hydraOk, subtitle: "Ory Hydra",
        details: [
          { label: "Health", value: hydraOk ? "Healthy" : "Unreachable" },
        ].filter(Boolean),
      },
      {
        name: "API Gateway", ok: gatewayOk, subtitle: "Ory Oathkeeper",
        details: [
          oathkeeperHealth?.proxyUrl ? { label: "Proxy URL", value: oathkeeperHealth.proxyUrl } : null,
          oathkeeperVersion?.version ? { label: "Version", value: oathkeeperVersion.version } : null,
          { label: "Admin API", value: oathkeeperHealth?.adminConfigured ? "Configured" : "Not configured" },
        ].filter(Boolean),
      },
      {
        name: "Storage", ok: storageOk, subtitle: "MinIO S3",
        details: [
          integrationsStatus?.storage?.s3Endpoint ? { label: "S3 Endpoint", value: integrationsStatus.storage.s3Endpoint } : null,
          { label: "S3 API", value: integrationsStatus?.storage?.s3?.reachable ? "Connected" : "Unreachable" },
          { label: "Console", value: integrationsStatus?.storage?.console?.reachable ? "Connected" : "Not configured" },
        ].filter(Boolean),
      },
    ];

    const loaded = integrationsStatus || ketoHealth || hydraHealth || oathkeeperHealth;

    return (
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-4">
          <div>
            <h2 className="text-sm font-medium text-slate-100">Integrations</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Connection status for all services powering your Truss instance.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {services.map((svc) => (
              <div key={svc.name} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${loaded ? (svc.ok ? "bg-emerald-400" : "bg-red-400") : "bg-slate-600 animate-pulse"}`} />
                  <span className="text-xs font-medium text-slate-100">{svc.name}</span>
                  {(svc as any).subtitle && <span className="text-[10px] text-slate-500">{(svc as any).subtitle}</span>}
                </div>
                <div className="space-y-1">
                  {(svc.details as Array<{ label: string; value: string }>).map((d, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span className="text-slate-500">{d.label}</span>
                      <span className="text-slate-300 font-mono text-[10px] truncate max-w-[200px]">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Data Export
  // -----------------------------------------------------------------------
  if (settingsView === "data-export") {
    return <DataExportPanel apiBaseUrl={apiBaseUrl} />;
  }

  // -----------------------------------------------------------------------
  // Audit Logs
  // -----------------------------------------------------------------------
  if (settingsView === "audit-logs") {
    return <AuditLogView
      auditLogs={auditLogs}
      loadAuditLogs={loadAuditLogs}
      isAuditLogsLoading={isAuditLogsLoading}
      accountError={accountError}
      distinctActions={(s as any).auditLogDistinctActions || []}
    />;
  }

  // -----------------------------------------------------------------------
  // Danger Zone
  // -----------------------------------------------------------------------
  if (settingsView === "danger") {
    return <DangerZoneView
      apiBaseUrl={apiBaseUrl}
      connectionProfiles={connectionProfiles}
      setConnectionProfiles={setConnectionProfiles}
      setAccountInfo={setAccountInfo}
      accountInfo={accountInfo}
      session={session}
      handleLogout={handleLogout}
    />;
  }

  // Billing / plans / invoices are a cloud-only feature and live in the private
  // truss-cloud repo — no billing management UI in the open-source core.

  return null;
}

// ---------------------------------------------------------------------------
// Account View
// ---------------------------------------------------------------------------
function AccountView({ session, themeMode, setThemeMode, profileNewPassword, setProfileNewPassword, profileConfirmPassword, setProfileConfirmPassword, profilePasswordError, profilePasswordSuccess, changePassword, handleLogout, apiBaseUrl }: {
  session: any;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  profileNewPassword: string;
  setProfileNewPassword: (s: string) => void;
  profileConfirmPassword: string;
  setProfileConfirmPassword: (s: string) => void;
  profilePasswordError: string;
  profilePasswordSuccess: string;
  changePassword: () => void;
  handleLogout: () => void;
  apiBaseUrl: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Display name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const email = session?.email || "";
  const displayName = session?.displayName || "User";

  const saveDisplayName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === displayName) { setEditingName(false); return; }
    setNameSaving(true);
    setNameMsg("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setNameMsg(b.error || "Failed to save."); }
      else { setNameMsg("Display name updated. Reload to see changes everywhere."); if (session) session.displayName = trimmed; }
    } catch { setNameMsg("Failed to save display name."); }
    setNameSaving(false);
    setEditingName(false);
  };
  const plan = session?.plan || "starter";
  const role = session?.isAdmin ? "Admin" : "Member";

  const themeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { mode: "system", label: "System", icon: <Monitor size={15} weight="regular" /> },
    { mode: "dark", label: "Dark", icon: <Moon size={15} weight="regular" /> },
    { mode: "light", label: "Light", icon: <Sun size={15} weight="regular" /> },
  ];

  async function deleteAccount() {
    if (deleteConfirmEmail !== email) {
      setDeleteError("Email does not match.");
      return;
    }
    setDeleteError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/danger/delete-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_email: deleteConfirmEmail }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setDeleteError(b.error || "Failed to delete account.");
        return;
      }
      handleLogout();
    } catch { setDeleteError("Failed to delete account."); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      {/* Hero card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-accent-600 to-accent-400 rounded-t-xl" />
        <div className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-lg font-semibold">
              {(email || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                {editingName ? (
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onBlur={saveDisplayName}
                    onKeyDown={e => { if (e.key === "Enter") saveDisplayName(); if (e.key === "Escape") setEditingName(false); }}
                    disabled={nameSaving}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-sm font-semibold text-slate-100 outline-none focus:border-accent-500"
                  />
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-100">{displayName}</p>
                    <button onClick={() => { setNameValue(displayName); setEditingName(true); setNameMsg(""); }} className="text-slate-500 hover:text-slate-300" title="Edit display name">
                      <PencilSimple size={13} weight="regular" />
                    </button>
                  </>
                )}
              </div>
              {nameMsg && <p className={`text-[10px] mt-0.5 ${nameMsg.includes("Failed") ? "text-red-400" : "text-emerald-400"}`}>{nameMsg}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{email}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="rounded-full bg-accent-600/15 px-2.5 py-0.5 text-[10px] font-semibold text-accent-300 uppercase tracking-wide capitalize">{plan}</span>
                <span className="rounded-full bg-slate-700/50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 uppercase tracking-wide">{role}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="text-xs font-semibold text-slate-300 mb-3">Appearance</p>
        <div className="flex items-center gap-1">
          {themeOptions.map(opt => (
            <button
              key={opt.mode}
              onClick={() => setThemeMode(opt.mode)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
                themeMode === opt.mode
                  ? "bg-accent-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Change Password</p>
        <p className="text-[10px] text-slate-500">Update your account password via Ory Kratos.</p>
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={profileNewPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeSlash size={15} weight="regular" /> : <Eye size={15} weight="regular" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm new password"
              value={profileConfirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-accent-500 focus:outline-none pr-9"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showConfirmPassword ? <EyeSlash size={15} weight="regular" /> : <Eye size={15} weight="regular" />}
            </button>
          </div>
        </div>
        {profilePasswordError && <p className="text-xs text-red-400">{profilePasswordError}</p>}
        {profilePasswordSuccess && <p className="text-xs text-emerald-400">{profilePasswordSuccess}</p>}
        <button
          onClick={changePassword}
          disabled={!profileNewPassword || profileNewPassword !== profileConfirmPassword}
          className="rounded-lg bg-accent-600 px-4 py-2 text-xs font-semibold text-white hover:bg-accent-500 transition disabled:opacity-50"
        >
          Change Password
        </button>
      </div>

      {/* Active Session */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Active Session</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-200">{displayName}</p>
            <p className="text-[10px] text-slate-500">{email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-red-400/40 bg-red-950/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Warning size={15} weight="regular" className="text-red-400" />
          <p className="text-xs font-semibold text-red-300">Delete Account</p>
        </div>
        <p className="text-[10px] text-slate-500">Permanently delete your account and all associated data. This action cannot be undone.</p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 transition"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-slate-400">Type your email to confirm: <span className="font-mono text-slate-300">{email}</span></p>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={e => setDeleteConfirmEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-lg border border-red-900/40 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-red-500 focus:outline-none"
            />
            {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={deleteAccount}
                disabled={deleteConfirmEmail !== email}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(""); setDeleteError(""); }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log View
// ---------------------------------------------------------------------------
function AuditLogView({ auditLogs, loadAuditLogs, isAuditLogsLoading, accountError, distinctActions }: {
  auditLogs: any[];
  loadAuditLogs: (opts?: { action?: string; range?: string }) => void;
  isAuditLogsLoading: boolean;
  accountError: string;
  distinctActions: string[];
}) {
  const [filterAction, setFilterAction] = useState("all");
  const [filterRange, setFilterRange] = useState("all");

  // Re-fetch from server when filters change
  const applyFilters = useCallback((action: string, range: string) => {
    const opts: { action?: string; range?: string } = {};
    if (action !== "all") opts.action = action;
    if (range !== "all") opts.range = range;
    loadAuditLogs(opts);
  }, [loadAuditLogs]);

  const handleActionChange = useCallback((value: string) => {
    setFilterAction(value);
    applyFilters(value, filterRange);
  }, [filterRange, applyFilters]);

  const handleRangeChange = useCallback((value: string) => {
    setFilterRange(value);
    applyFilters(filterAction, value);
  }, [filterAction, applyFilters]);

  const rangeChips = [
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-100">Audit Logs</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!auditLogs.length) return;
              const headers = ["Timestamp","Actor","Action","Resource Type","Resource ID","Meta"];
              const rows = auditLogs.map((l: any) => [
                l.created_at, l.actor, l.action, l.resource_type, l.resource_id,
                l.meta ? JSON.stringify(l.meta) : "",
              ]);
              const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
              const csv = [headers.map(escape).join(","), ...rows.map((r: string[]) => r.map(escape).join(","))].join("\n");
              downloadFile("audit-logs.csv", csv, "text/csv;charset=utf-8");
            }}
            disabled={!auditLogs.length}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              if (!auditLogs.length) return;
              downloadFile("audit-logs.json", JSON.stringify(auditLogs, null, 2), "application/json");
            }}
            disabled={!auditLogs.length}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            Export JSON
          </button>
          <button
            onClick={() => applyFilters(filterAction, filterRange)}
            disabled={isAuditLogsLoading}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            {isAuditLogsLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Action</span>
          <div className="relative">
            <select
              value={filterAction}
              onChange={e => handleActionChange(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 pl-2.5 pr-7 py-1 text-xs text-slate-200 outline-none appearance-none"
            >
              <option value="all">All Actions</option>
              {distinctActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <CaretDown size={12} weight="regular" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Range</span>
          {rangeChips.map(chip => (
            <button
              key={chip.value}
              onClick={() => handleRangeChange(chip.value)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filterRange === chip.value
                  ? "bg-accent-600/15 text-accent-300"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-slate-500">{auditLogs.length} entries</span>
      </div>

      {accountError && <p className="text-xs text-red-300">{accountError}</p>}

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="bg-slate-900 text-slate-400 font-medium">
            <tr>
              <th className="px-4 py-2.5 border-b border-slate-800">Timestamp</th>
              <th className="px-4 py-2.5 border-b border-slate-800">Actor</th>
              <th className="px-4 py-2.5 border-b border-slate-800">Action</th>
              <th className="px-4 py-2.5 border-b border-slate-800">Resource</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No audit logs yet. Actions will be tracked here automatically.</td>
              </tr>
            ) : (
              auditLogs.map((log: any) => (
                <tr key={log.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono">{log.actor}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 uppercase font-medium">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {log.resource_type}: {log.resource_id}
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

// ---------------------------------------------------------------------------
// Danger Zone View
// ---------------------------------------------------------------------------
function DangerZoneView({ apiBaseUrl, connectionProfiles, setConnectionProfiles, setAccountInfo, accountInfo, session, handleLogout }: {
  apiBaseUrl: string;
  connectionProfiles: any[];
  setConnectionProfiles: (p: any[]) => void;
  setAccountInfo: (s: string) => void;
  accountInfo: string;
  session: any;
  handleLogout: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const email = session?.email || "";

  async function clearAuditLogs() {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/danger/clear-audit-logs`, { method: "POST" });
      if (res.ok) setMsg("Audit logs cleared.");
      else setMsg("Failed to clear audit logs.");
    } catch { setMsg("Failed to clear audit logs."); }
  }

  async function clearSavedQueries() {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/danger/clear-saved-queries`, { method: "POST" });
      if (res.ok) setMsg("Saved queries cleared.");
      else setMsg("Failed to clear saved queries.");
    } catch { setMsg("Failed to clear saved queries."); }
  }

  async function resetSettings() {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/danger/reset-settings`, { method: "POST" });
      if (res.ok) setMsg("All settings have been reset to defaults.");
      else setMsg("Failed to reset settings.");
    } catch { setMsg("Failed to reset settings."); }
  }

  async function deleteAccount() {
    if (deleteConfirmEmail !== email) {
      setDeleteError("Email does not match.");
      return;
    }
    setDeleteError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/settings/danger/delete-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_email: deleteConfirmEmail }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setDeleteError(b.error || "Failed to delete account.");
        return;
      }
      handleLogout();
    } catch { setDeleteError("Failed to delete account."); }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 space-y-4 w-full">
      <div>
        <h2 className="text-sm font-medium text-red-400">Danger Zone</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Destructive actions that cannot be reversed. Proceed with caution.</p>
      </div>

      {(msg || accountInfo) && <p className="text-xs text-emerald-300">{msg || accountInfo}</p>}

      {/* 1. Clear Connection Profiles */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-2">
        <p className="text-xs font-medium text-slate-200">Clear Connection Profiles</p>
        <p className="text-[11px] text-slate-500">Clears the active DATABASE_URL override. Truss will revert to the server's environment variable.</p>
        <DangerConfirmButton
          label="Clear Connection Profiles"
          confirmLabel="Are you sure?"
          onConfirm={() => {
            deleteAllConnectionProfilesFromApi(apiBaseUrl, connectionProfiles).then(() => {
              setConnectionProfiles([]);
              setMsg("Connection profiles cleared.");
            });
          }}
        />
      </div>

      {/* 2. Clear Audit Logs */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-2">
        <p className="text-xs font-medium text-slate-200">Clear Audit Logs</p>
        <p className="text-[11px] text-slate-500">Permanently deletes all audit log entries from the database. Cannot be undone.</p>
        <DangerConfirmButton
          label="Clear All Logs"
          confirmLabel="This will delete all audit logs."
          onConfirm={clearAuditLogs}
        />
      </div>

      {/* 3. Clear Saved Queries */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-2">
        <p className="text-xs font-medium text-slate-200">Clear Saved Queries</p>
        <p className="text-[11px] text-slate-500">Permanently deletes all saved SQL queries. This cannot be undone.</p>
        <DangerConfirmButton
          label="Clear Saved Queries"
          confirmLabel="This will delete all saved queries."
          onConfirm={clearSavedQueries}
        />
      </div>

      {/* 4. Reset All Settings */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-2">
        <p className="text-xs font-medium text-slate-200">Reset All Settings</p>
        <p className="text-[11px] text-slate-500">Resets all project settings (app name, environment, SMTP, alert thresholds) to their defaults.</p>
        <DangerConfirmButton
          label="Reset All Settings"
          confirmLabel="This will reset all settings to defaults."
          onConfirm={resetSettings}
        />
      </div>

      {/* 5. Delete Account */}
      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Warning size={15} weight="regular" className="text-red-400" />
          <p className="text-xs font-medium text-red-300">Delete Account</p>
        </div>
        <p className="text-[11px] text-slate-500">Permanently delete your account and all associated data. This action cannot be undone.</p>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 transition"
          >
            Delete Account
          </button>
        ) : (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-slate-400">Type your email to confirm: <span className="font-mono text-slate-300">{email}</span></p>
            <input
              type="text"
              value={deleteConfirmEmail}
              onChange={e => setDeleteConfirmEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-lg border border-red-900/40 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-red-500 focus:outline-none"
            />
            {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
            <div className="flex items-center gap-2">
              <button
                onClick={deleteAccount}
                disabled={deleteConfirmEmail !== email}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition"
              >
                Confirm Delete
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(""); setDeleteError(""); }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PaneB
// ---------------------------------------------------------------------------
export function renderSettingsPaneB(s: any): React.JSX.Element | null {
  const { settingsView, setSettingsView, loadAuditLogs, loadApiKeys } = s;

  const navGroups = [
    {
      label: "PERSONAL",
      items: [
        { id: "account" as SettingsView, label: "Account", icon: <UserCircle size={18} weight="regular" /> },
      ],
    },
    {
      label: "PROJECT",
      items: [
        { id: "general" as SettingsView, label: "General", icon: <GearSix size={18} weight="regular" /> },
        { id: "team" as SettingsView, label: "Team & Orgs", icon: <Users size={18} weight="regular" /> },
        { id: "api-keys" as SettingsView, label: "API Keys", icon: <Key size={18} weight="regular" /> },
        { id: "notifications" as SettingsView, label: "Notifications", icon: <Bell size={18} weight="regular" /> },
        { id: "integrations" as SettingsView, label: "Integrations", icon: <Plug size={18} weight="regular" /> },
      ],
    },
    {
      label: "DATA",
      items: [
        { id: "audit-logs" as SettingsView, label: "Audit Log", icon: <ClipboardText size={18} weight="regular" /> },
        { id: "data-export" as SettingsView, label: "Data Export", icon: <Export size={18} weight="regular" /> },
      ],
    },
  ];

  return (
    <div className="space-y-4 px-1">
      {navGroups.map(group => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 px-2.5">{group.label}</p>
          <div className="space-y-1">
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setSettingsView(item.id);
                  if (item.id === "audit-logs") setTimeout(() => loadAuditLogs(), 0);
                  if (item.id === "api-keys") setTimeout(() => loadApiKeys(), 0);
                }}
                className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
                  settingsView === item.id
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
        </div>
      ))}

      {/* Separator */}
      <div className="border-t border-slate-800 mx-2.5" />

      {/* Danger Zone */}
      <div>
        <button
          onClick={() => setSettingsView("danger" as SettingsView)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            settingsView === "danger"
              ? "border-red-600/50 bg-red-950/30 text-red-300"
              : "border-slate-800 bg-slate-950 text-red-400 hover:bg-red-950/20"
          }`}
        >
          <span className="inline-flex items-center gap-1.5">
            <Trash size={18} weight="regular" />
            Danger Zone
          </span>
        </button>
      </div>
    </div>
  );
}
