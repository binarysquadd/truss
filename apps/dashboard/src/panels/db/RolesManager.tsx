// RolesManager.tsx — Database roles management (extracted from DatabasePanel.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowsClockwise,
  CaretRight,
  Plus,
  Shield,
  Trash,
  Users,
  X,
} from "@phosphor-icons/react";
import { apiFetch } from "../../types";

type PgRole = {
  rolname: string;
  rolsuper: boolean;
  rolinherit: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolcanlogin: boolean;
  rolreplication: boolean;
  rolconnlimit: number;
  rolvaliduntil: string | null;
  member_of: string[];
};

type TableGrant = {
  table_schema: string;
  table_name: string;
  privilege_type: string;
  is_grantable: string;
};

type SchemaGrant = {
  schema_name: string;
  has_usage: boolean;
  has_create: boolean;
};

type RoleGrants = {
  role: string;
  table_grants: TableGrant[];
  schema_grants: SchemaGrant[];
};

export function RolesManager({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [roles, setRoles] = useState<PgRole[]>([]);
  const [isRolesLoading, setIsRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState("");
  const [rolesLoaded, setRolesLoaded] = useState(false);

  // Detail view
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [roleGrants, setRoleGrants] = useState<RoleGrants | null>(null);
  const [isGrantsLoading, setIsGrantsLoading] = useState(false);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePassword, setNewRolePassword] = useState("");
  const [newRoleLogin, setNewRoleLogin] = useState(true);
  const [newRoleCreateDb, setNewRoleCreateDb] = useState(false);
  const [newRoleCreateRole, setNewRoleCreateRole] = useState(false);
  const [newRoleSuperuser, setNewRoleSuperuser] = useState(false);
  const [newRoleReplication, setNewRoleReplication] = useState(false);
  const [newRoleConnLimit, setNewRoleConnLimit] = useState("-1");
  const [newRoleValidUntil, setNewRoleValidUntil] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Drop confirmation
  const [showDropModal, setShowDropModal] = useState(false);
  const [dropRoleName, setDropRoleName] = useState("");
  const [dropConfirmText, setDropConfirmText] = useState("");
  const [isDropping, setIsDropping] = useState(false);
  const [dropError, setDropError] = useState("");

  // Grant modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantSchema, setGrantSchema] = useState("public");
  const [grantTable, setGrantTable] = useState("");
  const [grantPrivileges, setGrantPrivileges] = useState<string[]>(["SELECT"]);
  const [isGranting, setIsGranting] = useState(false);
  const [grantError, setGrantError] = useState("");

  // Alter inline
  const [alterError, setAlterError] = useState("");

  const loadRoles = useCallback(async () => {
    setIsRolesLoading(true);
    setRolesError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load roles.");
      setRoles((body.roles || []).map((r: any) => ({ ...r, member_of: Array.isArray(r.member_of) ? r.member_of : [] })));
    } catch (e) {
      setRolesError(e instanceof Error ? e.message : "Failed to load roles.");
    } finally {
      setIsRolesLoading(false);
      setRolesLoaded(true);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!rolesLoaded && !isRolesLoading) {
      loadRoles();
    }
  }, [rolesLoaded, isRolesLoading, loadRoles]);

  const loadGrants = useCallback(async (roleName: string) => {
    setIsGrantsLoading(true);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles/${encodeURIComponent(roleName)}/grants`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load grants.");
      setRoleGrants(body);
    } catch {
      setRoleGrants(null);
    } finally {
      setIsGrantsLoading(false);
    }
  }, [apiBaseUrl]);

  const handleSelectRole = (roleName: string) => {
    setSelectedRole(roleName);
    loadGrants(roleName);
  };

  const handleCreateRole = async () => {
    setIsCreating(true);
    setCreateError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRoleName,
          password: newRolePassword || undefined,
          login: newRoleLogin,
          createdb: newRoleCreateDb,
          createrole: newRoleCreateRole,
          superuser: newRoleSuperuser,
          replication: newRoleReplication,
          connection_limit: parseInt(newRoleConnLimit) || -1,
          valid_until: newRoleValidUntil || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to create role.");
      setShowCreateModal(false);
      setNewRoleName("");
      setNewRolePassword("");
      setNewRoleLogin(true);
      setNewRoleCreateDb(false);
      setNewRoleCreateRole(false);
      setNewRoleSuperuser(false);
      setNewRoleReplication(false);
      setNewRoleConnLimit("-1");
      setNewRoleValidUntil("");
      loadRoles();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create role.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDropRole = async () => {
    setIsDropping(true);
    setDropError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles/${encodeURIComponent(dropRoleName)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to drop role.");
      setShowDropModal(false);
      setDropRoleName("");
      setDropConfirmText("");
      if (selectedRole === dropRoleName) {
        setSelectedRole(null);
        setRoleGrants(null);
      }
      loadRoles();
    } catch (e) {
      setDropError(e instanceof Error ? e.message : "Failed to drop role.");
    } finally {
      setIsDropping(false);
    }
  };

  const handleAlterRole = async (roleName: string, attr: Record<string, unknown>) => {
    setAlterError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles/${encodeURIComponent(roleName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attr),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to alter role.");
      loadRoles();
    } catch (e) {
      setAlterError(e instanceof Error ? e.message : "Failed to alter role.");
    }
  };

  const handleGrant = async () => {
    setIsGranting(true);
    setGrantError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles/${encodeURIComponent(selectedRole!)}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: grantSchema,
          table: grantTable || undefined,
          privileges: grantPrivileges,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to grant privileges.");
      setShowGrantModal(false);
      setGrantTable("");
      setGrantPrivileges(["SELECT"]);
      loadGrants(selectedRole!);
    } catch (e) {
      setGrantError(e instanceof Error ? e.message : "Failed to grant privileges.");
    } finally {
      setIsGranting(false);
    }
  };

  const handleRevoke = async (schema: string, table: string, privilege: string) => {
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/roles/${encodeURIComponent(selectedRole!)}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, table, privileges: [privilege] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to revoke privilege.");
      loadGrants(selectedRole!);
    } catch {
      // Grants reload will show current state
    }
  };

  const togglePrivilege = (priv: string) => {
    setGrantPrivileges(prev => prev.includes(priv) ? prev.filter(p => p !== priv) : [...prev, priv]);
  };

  const RoleBadge = ({ children, color = "slate" }: { children: React.ReactNode; color?: string }) => {
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

  const AttrToggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!value)}
      className={`rounded border px-2 py-1 text-[11px] transition-colors ${value ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 bg-slate-900 text-slate-500 hover:bg-slate-800"}`}
    >
      {label}
    </button>
  );

  // ─── Role Detail View ───
  if (selectedRole) {
    const role = roles.find(r => r.rolname === selectedRole);
    if (!role) {
      setSelectedRole(null);
      return null;
    }

    const tableGrantMap = new Map<string, string[]>();
    if (roleGrants) {
      for (const g of roleGrants.table_grants) {
        const key = `${g.table_schema}.${g.table_name}`;
        if (!tableGrantMap.has(key)) tableGrantMap.set(key, []);
        tableGrantMap.get(key)!.push(g.privilege_type);
      }
    }

    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedRole(null); setRoleGrants(null); }} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
            <Users size={18} weight="regular" className="text-slate-400" />
            <h2 className="text-sm font-medium text-slate-100">{role.rolname}</h2>
            <div className="flex gap-1.5">
              {role.rolcanlogin && <RoleBadge color="emerald">LOGIN</RoleBadge>}
              {role.rolsuper && <RoleBadge color="red">SUPERUSER</RoleBadge>}
              {role.rolcreatedb && <RoleBadge color="amber">CREATEDB</RoleBadge>}
              {role.rolcreaterole && <RoleBadge color="amber">CREATEROLE</RoleBadge>}
              {role.rolreplication && <RoleBadge color="cyan">REPLICATION</RoleBadge>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowGrantModal(true); setGrantError(""); }} className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60">
              <Shield size={13} weight="regular" /> Grant
            </button>
            <button onClick={() => { setDropRoleName(role.rolname); setDropConfirmText(""); setDropError(""); setShowDropModal(true); }}
              className="truss-btn rounded border border-red-800/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/30">
              <Trash size={13} weight="regular" /> Drop
            </button>
          </div>
        </div>

        {alterError && <p className="text-xs text-red-300">{alterError}</p>}

        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-300">Attributes</p>
          <div className="flex flex-wrap gap-2">
            <AttrToggle label="Login" value={role.rolcanlogin} onChange={(v) => handleAlterRole(role.rolname, { login: v })} />
            <AttrToggle label="Superuser" value={role.rolsuper} onChange={(v) => handleAlterRole(role.rolname, { superuser: v })} />
            <AttrToggle label="Create DB" value={role.rolcreatedb} onChange={(v) => handleAlterRole(role.rolname, { createdb: v })} />
            <AttrToggle label="Create Role" value={role.rolcreaterole} onChange={(v) => handleAlterRole(role.rolname, { createrole: v })} />
            <AttrToggle label="Replication" value={role.rolreplication} onChange={(v) => handleAlterRole(role.rolname, { replication: v })} />
            <AttrToggle label="Inherit" value={role.rolinherit} onChange={(v) => handleAlterRole(role.rolname, { inherit: v })} />
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Connection limit: <code className="text-slate-300">{role.rolconnlimit === -1 ? "unlimited" : role.rolconnlimit}</code></span>
            <span>Valid until: <code className="text-slate-300">{role.rolvaliduntil ? new Date(role.rolvaliduntil).toLocaleDateString() : "no expiry"}</code></span>
          </div>
          {role.member_of.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Member of:</span>
              {role.member_of.map(m => <RoleBadge key={m} color="violet">{m}</RoleBadge>)}
            </div>
          )}
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Schema Privileges</p>
            {isGrantsLoading && <span className="truss-spinner" />}
          </div>
          {roleGrants && roleGrants.schema_grants.length > 0 ? (
            <div className="overflow-auto rounded border border-slate-800">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-950/70">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Schema</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Usage</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Create</th>
                  </tr>
                </thead>
                <tbody>
                  {roleGrants.schema_grants.map((g) => (
                    <tr key={g.schema_name} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                      <td className="px-3 py-2 text-slate-300"><code>{g.schema_name}</code></td>
                      <td className="px-3 py-2">{g.has_usage ? <RoleBadge color="emerald">USAGE</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                      <td className="px-3 py-2">{g.has_create ? <RoleBadge color="amber">CREATE</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !isGrantsLoading && (
            <p className="text-xs text-slate-500">No schema privileges found.</p>
          )}
        </div>

        <div className="rounded border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Table Privileges</p>
            <button onClick={() => loadGrants(selectedRole)} className="text-[11px] text-slate-400 hover:text-slate-200">
              <ArrowsClockwise size={12} weight="regular" />
            </button>
          </div>
          {tableGrantMap.size > 0 ? (
            <div className="overflow-auto rounded border border-slate-800">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-950/70">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Table</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Privileges</th>
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(tableGrantMap.entries()).map(([tableKey, privs]) => {
                    const [schema, table] = tableKey.split(".");
                    return (
                      <tr key={tableKey} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40">
                        <td className="px-3 py-2 text-slate-300"><code>{tableKey}</code></td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {privs.map(p => <RoleBadge key={p} color="accent">{p}</RoleBadge>)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            {privs.map(p => (
                              <button key={p} onClick={() => handleRevoke(schema, table, p)}
                                className="rounded border border-red-800/30 px-1.5 py-0.5 text-[9px] text-red-400 hover:bg-red-900/20" title={`Revoke ${p}`}>
                                <X size={9} weight="regular" />
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !isGrantsLoading && (
            <p className="text-xs text-slate-500">No table privileges found.</p>
          )}
        </div>

        {showGrantModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowGrantModal(false)}>
            <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="mb-4 text-sm font-semibold text-slate-100">Grant Privileges to {selectedRole}</h3>
              {grantError && <p className="mb-3 text-xs text-red-300">{grantError}</p>}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Schema</label>
                  <input value={grantSchema} onChange={e => setGrantSchema(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Table <span className="text-slate-600">(leave empty for schema-level grant)</span></label>
                  <input value={grantTable} onChange={e => setGrantTable(e.target.value)} placeholder="e.g. users"
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Privileges</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(grantTable ? ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "ALL"] : ["USAGE", "CREATE", "ALL"]).map(p => (
                      <button key={p} onClick={() => togglePrivilege(p)}
                        className={`rounded border px-2 py-1 text-[10px] ${grantPrivileges.includes(p) ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 text-slate-500 hover:bg-slate-800"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setShowGrantModal(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button onClick={handleGrant} disabled={isGranting || grantPrivileges.length === 0}
                  className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
                  {isGranting ? <span className="truss-spinner" /> : "Grant"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDropModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowDropModal(false)}>
            <div className="w-full max-w-md rounded-lg border border-red-800/50 bg-slate-900 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="mb-2 text-sm font-semibold text-red-300">Drop Role</h3>
              <p className="mb-4 text-xs text-slate-400">
                This will permanently drop the role <code className="text-red-300">{dropRoleName}</code>. Type the role name to confirm.
              </p>
              {dropError && <p className="mb-3 text-xs text-red-300">{dropError}</p>}
              <input value={dropConfirmText} onChange={e => setDropConfirmText(e.target.value)} placeholder={dropRoleName}
                className="mb-4 w-full rounded border border-red-800/50 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-red-500 focus:outline-none" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowDropModal(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button onClick={handleDropRole} disabled={isDropping || dropConfirmText !== dropRoleName}
                  className="rounded border border-red-700 bg-red-900/40 px-4 py-1.5 text-xs text-red-200 hover:bg-red-900/60 disabled:opacity-50">
                  {isDropping ? <span className="truss-spinner" /> : "Drop Role"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Roles List View ───
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-slate-100">Roles</h2>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{roles.length}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={loadRoles} disabled={isRolesLoading}
            className="truss-btn rounded border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            {isRolesLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={13} weight="regular" />}
            Refresh
          </button>
          <button onClick={() => { setShowCreateModal(true); setCreateError(""); }}
            className="truss-btn rounded border border-accent-700 bg-accent-900/40 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60">
            <Plus size={13} weight="regular" /> Create Role
          </button>
        </div>
      </div>

      {rolesError && <p className="mb-3 text-xs text-amber-300">{rolesError}</p>}

      {roles.length === 0 && !isRolesLoading ? (
        <div className="flex flex-col items-center justify-center rounded border border-slate-800 bg-slate-900/40 py-10 text-center">
          <p className="text-sm text-slate-500">No roles found in this database.</p>
        </div>
      ) : (
        <div className="overflow-auto rounded border border-slate-800">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-slate-950/70">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Login</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Superuser</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Create DB</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Create Role</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Conn Limit</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Valid Until</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wide text-slate-500">Member Of</th>
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wide text-slate-500"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.rolname} className="border-t border-slate-800 odd:bg-slate-950 even:bg-slate-900/40 cursor-pointer hover:bg-slate-800/60"
                  onClick={() => handleSelectRole(r.rolname)}>
                  <td className="px-3 py-2">
                    <code className="font-mono text-slate-200">{r.rolname}</code>
                  </td>
                  <td className="px-3 py-2">{r.rolcanlogin ? <RoleBadge color="emerald">LOGIN</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                  <td className="px-3 py-2">{r.rolsuper ? <RoleBadge color="red">SUPER</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                  <td className="px-3 py-2">{r.rolcreatedb ? <RoleBadge color="amber">CREATEDB</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                  <td className="px-3 py-2">{r.rolcreaterole ? <RoleBadge color="amber">CREATEROLE</RoleBadge> : <span className="text-slate-600">-</span>}</td>
                  <td className="px-3 py-2 text-slate-400">{r.rolconnlimit === -1 ? "unlimited" : r.rolconnlimit}</td>
                  <td className="px-3 py-2 text-slate-400">{r.rolvaliduntil ? new Date(r.rolvaliduntil).toLocaleDateString() : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.member_of.map(m => <RoleBadge key={m} color="violet">{m}</RoleBadge>)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CaretRight size={13} weight="regular" className="text-slate-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-semibold text-slate-100">Create Role</h3>
            {createError && <p className="mb-3 text-xs text-red-300">{createError}</p>}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Role Name</label>
                <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
                  placeholder="e.g. app_readonly" autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Password <span className="text-slate-600">(optional)</span></label>
                <input type="password" value={newRolePassword} onChange={e => setNewRolePassword(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Attributes</label>
                <div className="flex flex-wrap gap-2">
                  <AttrToggle label="Login" value={newRoleLogin} onChange={setNewRoleLogin} />
                  <AttrToggle label="Superuser" value={newRoleSuperuser} onChange={setNewRoleSuperuser} />
                  <AttrToggle label="Create DB" value={newRoleCreateDb} onChange={setNewRoleCreateDb} />
                  <AttrToggle label="Create Role" value={newRoleCreateRole} onChange={setNewRoleCreateRole} />
                  <AttrToggle label="Replication" value={newRoleReplication} onChange={setNewRoleReplication} />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-slate-400">Connection Limit</label>
                  <input value={newRoleConnLimit} onChange={e => setNewRoleConnLimit(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none"
                    placeholder="-1 (unlimited)" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] text-slate-400">Valid Until <span className="text-slate-600">(optional)</span></label>
                  <input type="date" value={newRoleValidUntil} onChange={e => setNewRoleValidUntil(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-accent-500 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={handleCreateRole} disabled={isCreating || !newRoleName.trim()}
                className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
                {isCreating ? <span className="truss-spinner" /> : "Create Role"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
