// AuthZPanel.tsx — Authorization panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { LazyEditor as Editor } from "../LazyEditor";
import { handleEditorWillMount, trussEditorOptions } from "../editorConfig";
import {
  ArrowsClockwise,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  Code,
  DownloadSimple,
  FloppyDisk,
  Graph,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  Trash,
  TreeStructure,
  UploadSimple,
  Users,
} from "@phosphor-icons/react";
import { type AuthzView, apiFetch, downloadFile } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";
import { LazyReactFlowWrapper as ReactFlow, LazyBackground as Background, LazyControls as Controls, MarkerType, type Node, type Edge } from "../LazyReactFlow";

/* ------------------------------------------------------------------ */
/* OPL Templates                                                       */
/* ------------------------------------------------------------------ */
const OPL_TEMPLATES: Record<string, { label: string; description: string; opl: string }> = {
  rbac: {
    label: "RBAC (Role-Based)",
    description: "Users assigned to roles, roles grant permissions on resources",
    opl: `class User implements Namespace {}

class Role implements Namespace {
  related: {
    members: User[]
  }
}

class Document implements Namespace {
  related: {
    owners: User[]
    editors: Role[]
    viewers: (User | Role)[]
  }

  permits: {
    edit: (ctx: Context) => this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject)
    view: (ctx: Context) => this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject)
  }
}`,
  },
  multi_tenant: {
    label: "Multi-Tenant",
    description: "Organization-scoped resources with team hierarchy",
    opl: `class User implements Namespace {}

class Organization implements Namespace {
  related: {
    admins: User[]
    members: User[]
  }
}

class Project implements Namespace {
  related: {
    org: Organization[]
    managers: User[]
    contributors: User[]
  }

  permits: {
    manage: (ctx: Context) =>
      this.related.managers.includes(ctx.subject) ||
      this.related.org.traverse((o) => o.related.admins.includes(ctx.subject))
    contribute: (ctx: Context) =>
      this.permits.manage(ctx) ||
      this.related.contributors.includes(ctx.subject) ||
      this.related.org.traverse((o) => o.related.members.includes(ctx.subject))
  }
}`,
  },
  google_docs: {
    label: "Google Docs Style",
    description: "Files in folders with inherited permissions + sharing links",
    opl: `class User implements Namespace {}

class Folder implements Namespace {
  related: {
    owners: User[]
    editors: User[]
    viewers: User[]
    parent: Folder[]
  }

  permits: {
    edit: (ctx: Context) =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.edit(ctx))
    view: (ctx: Context) =>
      this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.view(ctx))
  }
}

class File implements Namespace {
  related: {
    owners: User[]
    editors: User[]
    viewers: User[]
    parent: Folder[]
  }

  permits: {
    edit: (ctx: Context) =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.edit(ctx))
    view: (ctx: Context) =>
      this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.view(ctx))
  }
}`,
  },
};

/* ------------------------------------------------------------------ */
/* AuthZBatchCheck — extracted to fix hooks violation                   */
/* ------------------------------------------------------------------ */
function AuthZBatchCheck({ batchCheckResults, isBatchChecking, batchCheckKetoPermissions }: {
  batchCheckResults: any[];
  isBatchChecking: boolean;
  batchCheckKetoPermissions: (checks: any) => void;
}) {
  const [batchInput, setBatchInput] = React.useState("namespace:object#relation@subject_id\nnamespace:object#relation@subject_id");

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-2 text-xs font-medium text-slate-200">Batch Permission Check</h3>
        <p className="mb-3 text-[11px] text-slate-400">Check multiple permissions at once. One check per line, format: <code className="text-slate-300">namespace:object#relation@subject</code></p>
        <textarea
          value={batchInput}
          onChange={e => setBatchInput(e.target.value)}
          rows={6}
          placeholder={"documents:doc-1#view@user-123\nprojects:proj-1#edit@user-456\nteams:eng#member@user-789"}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => {
              const lines = batchInput.split("\n").map(l => l.trim()).filter(Boolean);
              const checks = lines.map(line => {
                const match = line.match(/^([^:]+):([^#]+)#([^@]+)@(.+)$/);
                if (!match) return null;
                const [, ns, obj, rel, sub] = match;
                if (sub.includes(":") && sub.includes("#")) {
                  const [nsObj, r] = sub.split("#");
                  const [sNs, sObj] = nsObj.split(":");
                  return { namespace: ns, object: obj, relation: rel, subject_set: { namespace: sNs, object: sObj, relation: r } };
                }
                return { namespace: ns, object: obj, relation: rel, subject_id: sub };
              }).filter(Boolean);
              if (checks.length > 0) batchCheckKetoPermissions(checks as any);
            }}
            disabled={isBatchChecking || !batchInput.trim()}
            className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
          >
            {isBatchChecking ? <span className="truss-spinner" /> : <ShieldCheck size={14} />}
            Run Batch Check ({batchInput.split("\n").filter(l => l.trim()).length} checks)
          </button>
        </div>
      </div>
      {batchCheckResults.length > 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-3 text-xs font-medium text-slate-200">Results ({batchCheckResults.length})</h3>
          <div className="space-y-1">
            {batchCheckResults.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]">
                <span className="font-mono text-slate-300">
                  {r.namespace}:{r.object}#{r.relation}@{r.subject_id || `${r.subject_set?.namespace}:${r.subject_set?.object}#${r.subject_set?.relation}`}
                </span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${r.allowed ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                  {r.allowed ? "ALLOWED" : "DENIED"}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> {batchCheckResults.filter((r: any) => r.allowed).length} allowed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> {batchCheckResults.filter((r: any) => !r.allowed).length} denied</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AuthZModelEditor — extracted to fix hooks violation                  */
/* ------------------------------------------------------------------ */
function AuthZModelEditor({ editorTheme, apiBaseUrl, copyText, ketoNamespaces, ketoTuples }: {
  editorTheme: string;
  apiBaseUrl: string;
  copyText: (label: string) => void;
  ketoNamespaces: any[];
  ketoTuples: any[];
}) {
  const [oplText, setOplText] = React.useState(OPL_TEMPLATES.rbac.opl);
  const [selectedTemplate, setSelectedTemplate] = React.useState("rbac");
  const [oplVersions, setOplVersions] = React.useState<any[] | null>(null);
  const [showVersions, setShowVersions] = React.useState(false);
  const [diffIdx, setDiffIdx] = React.useState<number | null>(null);
  const [oplSaveMsg, setOplSaveMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  const subjectDisplay = (t: any) =>
    t.subject_id ? t.subject_id : t.subject_set ? `${t.subject_set.namespace}:${t.subject_set.object}#${t.subject_set.relation}` : "—";

  React.useEffect(() => {
    if (showVersions && !oplVersions) {
      apiFetch(`${apiBaseUrl}/api/keto/opl-versions?limit=20`).then(r => r.json()).then(d => setOplVersions(d.versions || [])).catch(() => setOplVersions([]));
    }
  }, [showVersions, oplVersions, apiBaseUrl]);

  return (
    <div className="space-y-4">
      {/* OPL Editor */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3">
          <h2 className="text-sm font-medium text-slate-100">Permission Model Editor</h2>
          <p className="mt-1 text-[11px] text-slate-400">Design your permission model using Ory Permission Language (OPL). Choose a template or write from scratch.</p>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(OPL_TEMPLATES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => { setSelectedTemplate(key); setOplText(t.opl); }}
              className={`rounded border px-3 py-1.5 text-[11px] transition-all ${selectedTemplate === key ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:bg-slate-900 hover:text-slate-300"}`}
            >
              <span className="font-medium">{t.label}</span>
              <span className="ml-1.5 text-[10px] text-slate-500">{t.description}</span>
            </button>
          ))}
        </div>
        <div className="rounded border border-slate-700 overflow-hidden">
          <Editor
            height="400px"
            language="typescript"
            theme={editorTheme}
            value={oplText}
            onChange={v => setOplText(v || "")}
            beforeMount={handleEditorWillMount}
            options={{ ...trussEditorOptions, minimap: { enabled: false }, lineNumbers: "on", fontSize: 12, readOnly: false }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[10px] text-slate-500">OPL is used to define namespaces, relations, and permission rules for Ory Keto.</p>
          <div className="flex items-center gap-2">
            <button onClick={() => { navigator.clipboard.writeText(oplText); copyText("OPL"); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
              <ClipboardText size={13} /> Copy
            </button>
            <button onClick={() => { downloadFile("permission-model.ts", oplText, "text/typescript"); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-800">
              <DownloadSimple size={13} /> Download
            </button>
            <button
              onClick={async () => {
                try {
                  const r = await apiFetch(`${apiBaseUrl}/api/keto/opl-versions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: oplText }),
                  });
                  if (r.ok) {
                    setOplSaveMsg({ text: "Version saved", ok: true });
                  } else {
                    setOplSaveMsg({ text: "Failed to save version", ok: false });
                  }
                  setTimeout(() => setOplSaveMsg(null), 3000);
                } catch {
                  setOplSaveMsg({ text: "Failed to save version", ok: false });
                  setTimeout(() => setOplSaveMsg(null), 3000);
                }
              }}
              className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1 text-[11px] text-accent-300 hover:bg-accent-600/20"
            >
              <FloppyDisk size={13} /> Save Version
            </button>
            {oplSaveMsg && (
              <span className={`text-[11px] ${oplSaveMsg.ok ? "text-emerald-400" : "text-red-400"}`}>{oplSaveMsg.text}</span>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-500 italic">Versions are saved locally. Apply changes by updating your Keto OPL configuration and restarting the service.</p>
        </div>
      </div>

      {/* Version History */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-200">Version History</h3>
          <button onClick={() => setShowVersions(!showVersions)} className="text-[10px] text-slate-400 hover:text-slate-200">
            {showVersions ? "Hide" : "Show"} versions
          </button>
        </div>
        {showVersions && !oplVersions && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="truss-spinner" /> Loading...</div>}
        {showVersions && oplVersions && oplVersions.length === 0 && <p className="text-[10px] text-slate-500 italic">No saved versions yet. Click "Save Version" to store a snapshot.</p>}
        {showVersions && oplVersions && oplVersions.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {oplVersions.map((v: any, i: number) => (
              <div key={v.id} className={`flex items-center justify-between rounded px-2 py-1.5 text-[10px] ${diffIdx === i ? "border border-accent-500/30 bg-accent-500/10" : "border border-slate-800 bg-slate-950 hover:bg-slate-900"}`}>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{new Date(v.created_at).toLocaleString()}</span>
                  <span className="text-slate-500 font-mono">{v.content.length} chars</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setOplText(v.content)} className="text-accent-300 hover:text-accent-200">Restore</button>
                  <button onClick={() => setDiffIdx(diffIdx === i ? null : i)} className="text-slate-400 hover:text-slate-200">
                    {diffIdx === i ? "Hide Diff" : "Diff"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {diffIdx !== null && oplVersions && oplVersions[diffIdx] && (() => {
          const saved = oplVersions[diffIdx].content.split("\n");
          const current = oplText.split("\n");
          const maxLen = Math.max(saved.length, current.length);
          const diffLines: { type: "same" | "added" | "removed"; text: string }[] = [];
          for (let l = 0; l < maxLen; l++) {
            const s = saved[l] ?? "";
            const c = current[l] ?? "";
            if (s === c) diffLines.push({ type: "same", text: c });
            else {
              if (s) diffLines.push({ type: "removed", text: s });
              if (c) diffLines.push({ type: "added", text: c });
            }
          }
          return (
            <div className="mt-2 rounded border border-slate-700 bg-slate-950 p-2 max-h-48 overflow-auto font-mono text-[10px]">
              {diffLines.map((d, i) => (
                <div key={i} className={d.type === "added" ? "text-emerald-400 bg-emerald-950/20" : d.type === "removed" ? "text-red-400 bg-red-950/20 line-through" : "text-slate-500"}>
                  <span className="inline-block w-4 text-right mr-2 text-slate-600">{d.type === "added" ? "+" : d.type === "removed" ? "-" : " "}</span>
                  {d.text || " "}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Namespace Cards */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-3 text-xs font-medium text-slate-200">Namespaces ({ketoNamespaces.length})</h3>
        {ketoNamespaces.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No namespaces found. Keto may not be configured.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ketoNamespaces.map((ns: any) => {
              const nsTuples = ketoTuples.filter((t: any) => t.namespace === ns.name);
              const relations = [...new Set(nsTuples.map((t: any) => t.relation))] as string[];
              const subjects = [...new Set(nsTuples.map((t: any) => subjectDisplay(t)))] as string[];
              return (
                <div key={ns.name} className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <TreeStructure size={18} className="text-slate-300" />
                    <span className="text-sm font-semibold text-slate-100">{ns.name}</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-400">
                    <p><span className="text-slate-500">Relations:</span> {relations.length > 0 ? relations.join(", ") : <span className="italic">none assigned</span>}</p>
                    <p><span className="text-slate-500">Subjects:</span> {subjects.length}</p>
                    <p><span className="text-slate-500">Tuples:</span> {nsTuples.length}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* OPL Syntax Reference */}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-2 text-xs font-medium text-slate-200">OPL Quick Reference</h3>
        <div className="grid gap-3 sm:grid-cols-2 text-[11px]">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Namespace</p>
            <code className="block rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">class Resource implements Namespace {"{"} ... {"}"}</code>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Relations</p>
            <code className="block rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">related: {"{"} owners: User[], editors: (User | Team)[] {"}"}</code>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Permissions</p>
            <code className="block rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">permits: {"{"} view: (ctx) =&gt; this.related.owners.includes(ctx.subject) {"}"}</code>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Traversal</p>
            <code className="block rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">this.related.parent.traverse((p) =&gt; p.permits.view(ctx))</code>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* renderAuthZMain                                                     */
/* ------------------------------------------------------------------ */
export function renderAuthZMain(s: any): React.JSX.Element | null {
  const {
    primaryNav,
    authzView, setAuthzView,
    ketoTuples, ketoNamespaces, ketoHealth,
    ketoTuplesNextToken,
    ketoFilterNs, setKetoFilterNs,
    ketoFilterObj, setKetoFilterObj,
    ketoFilterRel, setKetoFilterRel,
    ketoNewNs, setKetoNewNs,
    ketoNewObj, setKetoNewObj,
    ketoNewRel, setKetoNewRel,
    ketoNewSub, setKetoNewSub,
    ketoCheckNs, setKetoCheckNs,
    ketoCheckObj, setKetoCheckObj,
    ketoCheckRel, setKetoCheckRel,
    ketoCheckSub, setKetoCheckSub,
    ketoCheckResult, ketoExpandResult,
    ketoCheckHistory, setKetoCheckHistory,
    isKetoLoading, isKetoCreating, isKetoChecking,
    loadKetoTuples, loadKetoNamespaces, loadKetoHealth,
    createKetoTuple, deleteKetoTuple, checkKetoPermission,
    selectedTupleIndices, setSelectedTupleIndices,
    bulkDeleteTuples, isBulkDeletingTuples,
    showAssignModal, setShowAssignModal,
    assignSearch, setAssignSearch,
    assignSubjectId, setAssignSubjectId,
    assignNs, setAssignNs,
    assignObj, setAssignObj,
    assignRel, setAssignRel,
    assignRole,
    authIdentities,
    showImportTuplesModal, setShowImportTuplesModal,
    importTuplesJson, setImportTuplesJson,
    importTuplesResult, setImportTuplesResult,
    isImportingTuples, importTuples,
    whoCanAccessNs, setWhoCanAccessNs,
    whoCanAccessObj, setWhoCanAccessObj,
    whoCanAccessResult,
    isWhoCanAccessLoading, loadWhoCanAccess,
    batchCheckResults, isBatchChecking, batchCheckKetoPermissions,
    editorTheme,
    apiBaseUrl,
    copyText,
  } = s;

  if (primaryNav !== "authz") return null;

  const subjectDisplay = (t: typeof ketoTuples[0]) =>
    t.subject_id ? t.subject_id : t.subject_set ? `${t.subject_set.namespace}:${t.subject_set.object}#${t.subject_set.relation}` : "—";

  // Expand tree renderer
  const renderExpandNode = (node: any, depth: number = 0): React.ReactNode => {
    if (!node) return null;
    const indent = depth * 16;
    const subjectLabel = node.tuple?.subject_id || (node.tuple?.subject_set ? `${node.tuple.subject_set.namespace}:${node.tuple.subject_set.object}#${node.tuple.subject_set.relation}` : "");
    return (
      <div key={`${depth}-${subjectLabel}-${node.type}`}>
        <div style={{ paddingLeft: indent }} className="flex items-center gap-1.5 py-0.5 text-[11px]">
          {node.type === "union" && <span className="text-slate-500 font-mono">OR</span>}
          {node.type === "intersection" && <span className="text-slate-500 font-mono">AND</span>}
          {node.type === "leaf" && subjectLabel && (
            <span className="text-accent-400 font-mono">{subjectLabel}</span>
          )}
          {node.type === "leaf" && !subjectLabel && (
            <span className="text-slate-600 italic">empty</span>
          )}
        </div>
        {node.children?.map((child: any, i: number) => (
          <div key={i}>{renderExpandNode(child, depth + 1)}</div>
        ))}
      </div>
    );
  };

  return (
    <div className={`min-h-0 flex-1 p-4 ${authzView === "graph" ? "flex flex-col" : "overflow-auto"}`}>
      {/* Assign Role Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowAssignModal(false)}>
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-slate-100">Assign Role</h3>
            <p className="mb-3 text-[11px] text-slate-400">Create a relation tuple to grant a user access.</p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Subject (Kratos User)</label>
                <input value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Search by email..." className="mb-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                <div className="max-h-32 overflow-auto rounded border border-slate-800 bg-slate-950">
                  {authIdentities.filter((i: any) => {
                    const email = String(i.traits?.email || i.traits?.username || "");
                    return !assignSearch || email.toLowerCase().includes(assignSearch.toLowerCase()) || i.id.includes(assignSearch);
                  }).slice(0, 10).map((i: any) => (
                    <button
                      key={i.id}
                      onClick={() => { setAssignSubjectId(i.id); setAssignSearch(String(i.traits?.email || i.id)); }}
                      className={`w-full px-2 py-1.5 text-left text-xs hover:bg-slate-800 ${assignSubjectId === i.id ? "bg-slate-800 text-accent-300" : "text-slate-300"}`}
                    >
                      <span className="block truncate">{String(i.traits?.email || i.traits?.username || "no email")}</span>
                      <span className="block truncate text-[10px] text-slate-500">{i.id}</span>
                    </button>
                  ))}
                  {authIdentities.length === 0 && <p className="p-2 text-[10px] text-slate-500">No users loaded. Open Authentication → Users first.</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Namespace</label>
                  <select value={assignNs} onChange={e => setAssignNs(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                    <option value="">Select...</option>
                    {ketoNamespaces.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Object</label>
                  <input value={assignObj} onChange={e => setAssignObj(e.target.value)} placeholder="e.g. my-project" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Relation</label>
                  <input value={assignRel} onChange={e => setAssignRel(e.target.value)} placeholder="e.g. editors" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowAssignModal(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={assignRole} disabled={!assignNs || !assignObj || !assignRel || !assignSubjectId} className="rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-600/30 disabled:opacity-40">Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Tuples Modal */}
      {showImportTuplesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowImportTuplesModal(false)}>
          <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-slate-100">Import Relation Tuples</h3>
            <p className="mb-3 text-[11px] text-slate-400">
              Paste a JSON array of tuples. Each tuple needs <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">namespace</code>, <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">object</code>, <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">relation</code>, and <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px]">subject_id</code>. Max 500 tuples.
            </p>
            <textarea
              value={importTuplesJson}
              onChange={e => setImportTuplesJson(e.target.value)}
              placeholder={`[\n  { "namespace": "Project", "object": "my-app", "relation": "editors", "subject_id": "user-uuid" }\n]`}
              rows={8}
              className="w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600"
            />
            {importTuplesResult && (
              <div className={`mt-2 rounded px-3 py-2 text-xs ${importTuplesResult.failed === -1 ? "bg-red-500/10 text-red-300 border border-red-500/30" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"}`}>
                {importTuplesResult.failed === -1 ? "Invalid JSON — must be an array of tuple objects." : `Imported ${importTuplesResult.imported}, failed ${importTuplesResult.failed}.`}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowImportTuplesModal(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={importTuples} disabled={isImportingTuples || !importTuplesJson.trim()} className="rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-600/30 disabled:opacity-40">
                {isImportingTuples ? <><span className="truss-spinner" /> Importing...</> : <><UploadSimple size={13} /> Import</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* OVERVIEW TAB                                                  */}
      {/* ============================================================ */}
      {authzView === "overview" && (() => {
        const uniqueSubjects = new Set(ketoTuples.map((t: any) => t.subject_id || "set")).size;
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Authorization</h2>
            <button onClick={() => { loadKetoTuples(); loadKetoNamespaces(); loadKetoHealth(); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
              <ArrowsClockwise size={14} /> Refresh
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><TreeStructure size={13} weight="regular" /> Namespaces</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{ketoNamespaces.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{ketoNamespaces.map((n: any) => n.name).join(", ") || "None configured"}</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><LinkSimple size={13} weight="regular" /> Relation Tuples</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{ketoTuples.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Active relationships</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Users size={13} weight="regular" /> Unique Subjects</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{uniqueSubjects}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Users with permissions</p>
            </div>
          </div>

          {/* Namespace breakdown */}
          {ketoNamespaces.length > 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-3 text-xs font-medium text-slate-200">Namespace Breakdown</h3>
              <div className="space-y-2">
                {ketoNamespaces.map((ns: any) => {
                  const count = ketoTuples.filter((t: any) => t.namespace === ns.name).length;
                  const relations = [...new Set(ketoTuples.filter((t: any) => t.namespace === ns.name).map((t: any) => t.relation))] as string[];
                  return (
                    <div key={ns.name} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-slate-200">{ns.name}</p>
                        <p className="text-[10px] text-slate-500">{relations.length > 0 ? relations.join(", ") : "no relations"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">{count} tuple{count !== 1 ? "s" : ""}</span>
                        <button onClick={() => { setKetoFilterNs(ns.name); setKetoFilterObj(""); setKetoFilterRel(""); setAuthzView("permissions"); loadKetoTuples(ns.name, "", ""); }} className="text-[10px] text-accent-300 hover:text-accent-200 underline">View</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* ============================================================ */}
      {/* PERMISSIONS TAB (checker + tuples + who-can-access + batch)   */}
      {/* ============================================================ */}
      {authzView === "permissions" && (
        <div className="space-y-4">
          {/* Permission Checker */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-100">Permission Checker</h2>
            <p className="mb-3 text-[11px] text-slate-400">Test if a subject has a permission on an object. Uses Keto's check and expand APIs.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Namespace</label>
                <select value={ketoCheckNs} onChange={e => setKetoCheckNs(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  {ketoNamespaces.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Object</label>
                <input value={ketoCheckObj} onChange={e => setKetoCheckObj(e.target.value)} placeholder="e.g. my-project" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Relation</label>
                <input value={ketoCheckRel} onChange={e => setKetoCheckRel(e.target.value)} placeholder="e.g. view, edit, own" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Subject</label>
                <input value={ketoCheckSub} onChange={e => setKetoCheckSub(e.target.value)} placeholder="user-id or Ns:Obj#Rel" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={checkKetoPermission}
                disabled={isKetoChecking || !ketoCheckNs || !ketoCheckObj || !ketoCheckRel || !ketoCheckSub}
                className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
              >
                {isKetoChecking ? <span className="truss-spinner" /> : <ShieldCheck size={14} />}
                Check Permission
              </button>
              {ketoCheckResult && (
                <div className={`rounded px-3 py-1.5 text-xs font-bold ${ketoCheckResult.allowed ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-red-500/20 text-red-300 border border-red-500/40"}`}>
                  {ketoCheckResult.error ? `Error: ${ketoCheckResult.error}` : ketoCheckResult.allowed ? "ALLOWED" : "DENIED"}
                </div>
              )}
            </div>
            {ketoExpandResult && (
              <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3">
                <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Expand Tree</p>
                <div className="max-h-40 overflow-auto text-[11px]">
                  {renderExpandNode(ketoExpandResult)}
                </div>
              </div>
            )}
            {ketoCheckHistory.length > 0 && (
              <div className="mt-3 rounded border border-slate-700 bg-slate-950 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500"><ClockCounterClockwise size={11} className="inline mr-1" />Check History ({ketoCheckHistory.length})</p>
                  <button onClick={() => setKetoCheckHistory([])} className="text-[9px] text-slate-500 hover:text-slate-300">Clear</button>
                </div>
                <div className="max-h-32 space-y-1 overflow-auto">
                  {ketoCheckHistory.map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between rounded bg-slate-900/60 px-2 py-1 text-[10px]">
                      <button
                        onClick={() => { setKetoCheckNs(h.ns); setKetoCheckObj(h.obj); setKetoCheckRel(h.rel); setKetoCheckSub(h.sub); }}
                        className="min-w-0 truncate text-left text-slate-300 hover:text-accent-300"
                        title="Click to re-run"
                      >
                        {h.ns}:{h.obj} #{h.rel} → {h.sub}
                      </button>
                      <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${h.allowed ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                        {h.allowed ? "ALLOW" : "DENY"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Who Can Access */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-medium text-slate-200">Who Can Access?</h3>
            <p className="mb-3 text-[11px] text-slate-400">Look up all subjects with access to a specific object.</p>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Namespace</label>
                <select value={whoCanAccessNs} onChange={e => setWhoCanAccessNs(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  <option value="">Select...</option>
                  {ketoNamespaces.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">Object</label>
                <input value={whoCanAccessObj} onChange={e => setWhoCanAccessObj(e.target.value)} placeholder="e.g. my-project" className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={loadWhoCanAccess}
                  disabled={isWhoCanAccessLoading || !whoCanAccessNs || !whoCanAccessObj}
                  className="truss-btn w-full rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs font-medium text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
                >
                  {isWhoCanAccessLoading ? <span className="truss-spinner" /> : <MagnifyingGlass size={14} />}
                  Look Up
                </button>
              </div>
            </div>
            {whoCanAccessResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{whoCanAccessResult.accessMap.length} subject{whoCanAccessResult.accessMap.length !== 1 ? "s" : ""} with access to</span>
                  <span className="font-mono text-slate-200">{whoCanAccessNs}:{whoCanAccessObj}</span>
                </div>
                {whoCanAccessResult.accessMap.length === 0 ? (
                  <p className="py-4 text-center text-xs text-slate-500">No subjects have access to this object.</p>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-slate-500">Subject</th>
                          {whoCanAccessResult.relations.map((r: string) => (
                            <th key={r} className="px-2 py-1.5 text-center text-[10px] uppercase tracking-widest text-slate-500">{r}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {whoCanAccessResult.accessMap.map((entry: any) => (
                          <tr key={entry.subject} className="border-b border-slate-800/50">
                            <td className="px-2 py-1.5 font-mono text-accent-400">{entry.subject}</td>
                            {whoCanAccessResult.relations.map((rel: string) => (
                              <td key={rel} className="px-2 py-1.5 text-center">
                                {entry.permissions[rel] ? <CheckCircle size={14} weight="fill" className="inline text-emerald-400" /> : <span className="text-slate-700">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Batch Check */}
          <AuthZBatchCheck
            batchCheckResults={batchCheckResults}
            isBatchChecking={isBatchChecking}
            batchCheckKetoPermissions={batchCheckKetoPermissions}
          />

          {/* Relationship Explorer */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-100">Relation Tuples</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => { const json = JSON.stringify(ketoTuples, null, 2); const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "keto-tuples.json"; a.click(); URL.revokeObjectURL(url); }} className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="Export tuples as JSON">
                  <DownloadSimple size={13} /> Export
                </button>
                <button onClick={() => { setShowImportTuplesModal(true); setImportTuplesJson(""); setImportTuplesResult(null); }} className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800" title="Import tuples from JSON">
                  <UploadSimple size={13} /> Import
                </button>
                <button onClick={() => { setShowAssignModal(true); setAssignSearch(""); setAssignSubjectId(""); }} className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-2 py-1 text-[10px] text-accent-300 hover:bg-accent-600/30" title="Assign role to user">
                  <Plus size={13} /> Assign Role
                </button>
                <button onClick={() => loadKetoTuples()} disabled={isKetoLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40">
                  {isKetoLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />}
                  Refresh
                </button>
              </div>
            </div>
            {/* Bulk actions bar */}
            {selectedTupleIndices.size > 0 && (
              <div className="mb-3 flex items-center gap-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <span className="text-xs text-amber-300">{selectedTupleIndices.size} tuple{selectedTupleIndices.size !== 1 ? "s" : ""} selected</span>
                <button onClick={bulkDeleteTuples} disabled={isBulkDeletingTuples} className="truss-btn rounded border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-40">
                  {isBulkDeletingTuples ? <span className="truss-spinner" /> : <Trash size={12} />} Delete Selected
                </button>
                <button onClick={() => setSelectedTupleIndices(new Set())} className="text-[10px] text-slate-400 hover:text-slate-200">Clear selection</button>
              </div>
            )}
            {/* Filters */}
            <div className="mb-3 grid grid-cols-3 gap-2">
              <select value={ketoFilterNs} onChange={e => { setKetoFilterNs(e.target.value); loadKetoTuples(e.target.value); }} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                <option value="">All Namespaces</option>
                {ketoNamespaces.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
              </select>
              <input value={ketoFilterObj} onChange={e => setKetoFilterObj(e.target.value)} onBlur={() => loadKetoTuples()} placeholder="Filter object..." className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
              <input value={ketoFilterRel} onChange={e => setKetoFilterRel(e.target.value)} onBlur={() => loadKetoTuples()} placeholder="Filter relation..." className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
            </div>
            {/* Create new tuple inline */}
            <div className="mb-3 rounded border border-dashed border-slate-700 bg-slate-950/40 p-2">
              <p className="mb-1.5 text-[10px] uppercase tracking-widest text-slate-500">Create Tuple</p>
              <div className="grid grid-cols-5 gap-2">
                <select value={ketoNewNs} onChange={e => setKetoNewNs(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
                  {ketoNamespaces.map((n: any) => <option key={n.name} value={n.name}>{n.name}</option>)}
                </select>
                <input value={ketoNewObj} onChange={e => setKetoNewObj(e.target.value)} placeholder="Object" className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                <input value={ketoNewRel} onChange={e => setKetoNewRel(e.target.value)} placeholder="Relation" className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                <input value={ketoNewSub} onChange={e => setKetoNewSub(e.target.value)} placeholder="Subject ID" className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600" />
                <button
                  onClick={createKetoTuple}
                  disabled={isKetoCreating || !ketoNewNs || !ketoNewObj || !ketoNewRel || !ketoNewSub}
                  className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-2 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30 disabled:opacity-40"
                >
                  {isKetoCreating ? <span className="truss-spinner" /> : <Plus size={14} />}
                  Add
                </button>
              </div>
            </div>
            {/* Tuples table */}
            {ketoTuples.length === 0 && !isKetoLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">No permissions defined yet. Create a relation tuple to get started.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                      <th className="px-2 py-2 w-8">
                        <input type="checkbox" checked={selectedTupleIndices.size === ketoTuples.length && ketoTuples.length > 0} onChange={e => { if (e.target.checked) setSelectedTupleIndices(new Set(ketoTuples.map((_: any, i: number) => i))); else setSelectedTupleIndices(new Set()); }} className="accent-accent-500" />
                      </th>
                      <th className="px-2 py-2">Namespace</th>
                      <th className="px-2 py-2">Object</th>
                      <th className="px-2 py-2">Relation</th>
                      <th className="px-2 py-2">Subject</th>
                      <th className="px-2 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ketoTuples.map((t: any, i: number) => (
                      <tr key={i} className={`border-b border-slate-800/50 hover:bg-slate-800/30 ${selectedTupleIndices.has(i) ? "bg-accent-500/5" : ""}`}>
                        <td className="px-2 py-1.5">
                          <input type="checkbox" checked={selectedTupleIndices.has(i)} onChange={e => { const next = new Set(selectedTupleIndices); if (e.target.checked) next.add(i); else next.delete(i); setSelectedTupleIndices(next); }} className="accent-accent-500" />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-300">{t.namespace}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-200">{t.object}</td>
                        <td className="px-2 py-1.5">
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">{t.relation}</span>
                        </td>
                        <td className="px-2 py-1.5 font-mono text-accent-400">{subjectDisplay(t)}</td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => deleteKetoTuple(t)} className="rounded p-1 text-slate-500 hover:bg-red-500/20 hover:text-red-400" title="Delete tuple">
                            <Trash size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ketoTuplesNextToken && (
                  <button onClick={() => loadKetoTuples(undefined, undefined, undefined, ketoTuplesNextToken)} className="mt-2 text-xs text-slate-400 hover:text-slate-200 underline">
                    Load more...
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ROLES TAB                                                     */}
      {/* ============================================================ */}
      {authzView === "roles" && (
        <div className="space-y-4">
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-100">Roles by Namespace</h2>
            <p className="mb-3 text-[11px] text-slate-400">Each namespace defines relations that act as roles. Click a role to see assigned subjects.</p>
            {ketoNamespaces.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">No namespaces loaded. Check Keto connection.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ketoNamespaces.map((ns: any) => {
                  const nsTuples = ketoTuples.filter((t: any) => t.namespace === ns.name);
                  const relations = [...new Set(nsTuples.map((t: any) => t.relation))] as string[];
                  return (
                    <div key={ns.name} className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <TreeStructure size={16} className="text-slate-400" />
                        <span className="text-xs font-semibold text-slate-100">{ns.name}</span>
                        <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{nsTuples.length} tuple{nsTuples.length !== 1 ? "s" : ""}</span>
                      </div>
                      {relations.length === 0 ? (
                        <p className="text-[10px] text-slate-500 italic">No relations assigned yet</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {relations.map(rel => {
                            const count = nsTuples.filter((t: any) => t.relation === rel).length;
                            return (
                              <button
                                key={rel}
                                onClick={() => { setKetoFilterNs(ns.name); setKetoFilterRel(rel); setKetoFilterObj(""); setAuthzView("permissions"); loadKetoTuples(ns.name, "", rel); }}
                                className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300 hover:border-accent-500/40 hover:text-accent-300 transition-colors"
                              >
                                {rel} <span className="text-slate-500">({count})</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Access matrix */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h2 className="mb-3 text-sm font-medium text-slate-100">Access Matrix</h2>
            <p className="mb-3 text-[11px] text-slate-400">Visual overview of which relations (roles) exist per namespace. Derived from current relation tuples.</p>
            {ketoNamespaces.filter((ns: any) => ketoTuples.some((t: any) => t.namespace === ns.name)).length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">Nothing to visualize yet. Add some permissions to see the access matrix.</div>
            ) : (
              <div className="space-y-3">
                {ketoNamespaces.filter((ns: any) => ketoTuples.some((t: any) => t.namespace === ns.name)).map((ns: any) => {
                  const nsTuples = ketoTuples.filter((t: any) => t.namespace === ns.name);
                  const relations = [...new Set(nsTuples.map((t: any) => t.relation))] as string[];
                  const subjects = [...new Set(nsTuples.map((t: any) => subjectDisplay(t)))] as string[];
                  return (
                    <div key={ns.name} className="overflow-auto">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{ns.name}</p>
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-800">
                            <th className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-slate-500">Subject</th>
                            {relations.map(r => (
                              <th key={r} className="px-2 py-1.5 text-center text-[10px] uppercase tracking-widest text-slate-500">{r}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {subjects.map(sub => (
                            <tr key={sub} className="border-b border-slate-800/50">
                              <td className="px-2 py-1 font-mono text-accent-400">{sub}</td>
                              {relations.map(rel => {
                                const has = nsTuples.some((t: any) => subjectDisplay(t) === sub && t.relation === rel);
                                return (
                                  <td key={rel} className="px-2 py-1 text-center">
                                    {has ? <CheckCircle size={14} weight="fill" className="inline text-emerald-400" /> : <span className="text-slate-700">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODEL TAB (editor + namespaces + OPL reference)               */}
      {/* ============================================================ */}
      {authzView === "model" && (
        <AuthZModelEditor
          editorTheme={editorTheme}
          apiBaseUrl={apiBaseUrl}
          copyText={copyText}
          ketoNamespaces={ketoNamespaces}
          ketoTuples={ketoTuples}
        />
      )}

      {/* ============================================================ */}
      {/* GRAPH TAB                                                     */}
      {/* ============================================================ */}
      {authzView === "graph" && (() => {
        const nodeMap = new Map<string, { id: string; type: "namespace" | "object" | "subject" }>();
        const edges: Edge[] = [];

        ketoTuples.forEach((tuple: any, i: number) => {
          const objId = `${tuple.namespace}:${tuple.object}`;
          const subId = tuple.subject_id
            ? `subject:${tuple.subject_id}`
            : tuple.subject_set
            ? `${tuple.subject_set.namespace}:${tuple.subject_set.object}`
            : `unknown:${i}`;

          if (!nodeMap.has(objId)) nodeMap.set(objId, { id: objId, type: "object" });
          if (!nodeMap.has(subId)) nodeMap.set(subId, { id: subId, type: tuple.subject_id ? "subject" : "object" });

          edges.push({
            id: `e-${i}`,
            source: subId,
            target: objId,
            label: tuple.relation,
            style: { stroke: "#9f1239" },
            labelStyle: { fill: "#94a3b8", fontSize: 10 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#9f1239" },
          });
        });

        const nodes: Node[] = [];
        let idx = 0;
        nodeMap.forEach((meta) => {
          const col = meta.type === "subject" ? 0 : 1;
          const row = idx++;
          nodes.push({
            id: meta.id,
            position: { x: col * 350 + 50, y: row * 80 + 50 },
            data: { label: meta.id },
            style: {
              background: meta.type === "subject" ? "rgba(16,185,129,0.1)" : "rgba(159,18,57,0.1)",
              border: meta.type === "subject" ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(159,18,57,0.3)",
              color: "#e2e8f0",
              fontSize: 11,
              fontFamily: "monospace",
              borderRadius: 6,
              padding: "6px 12px",
            },
          });
        });

        return (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex shrink-0 items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-100">Relationship Graph</h3>
                <p className="mt-1 text-[11px] text-slate-400">Visual representation of relation tuples. Subjects on the left, objects on the right.</p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded border border-emerald-500/30 bg-emerald-500/10" /> Subject</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded border border-accent-500/30 bg-accent-500/10" /> Object</span>
                <span className="text-slate-500">{ketoTuples.length} tuple{ketoTuples.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            {ketoTuples.length === 0 ? (
              <div className="rounded border border-slate-800 bg-slate-950/40 p-8 text-center">
                <Graph size={24} className="mx-auto text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">No relation tuples to visualize.</p>
                <p className="mt-1 text-[10px] text-slate-500">Create some relationships to see the graph.</p>
              </div>
            ) : (
              <div className="min-h-0 flex-1 rounded border border-slate-700 overflow-hidden">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  fitView
                  nodesDraggable
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                  style={{ background: "#0f172a", width: "100%", height: "100%" }}
                >
                  <Background color="#1e293b" gap={20} />
                  <Controls />
                </ReactFlow>
              </div>
            )}
          </div>
        );
      })()}

      {authzView === "developer" && (() => {
        const ketoUrl = s.integrationsStatus?.authz?.readUrl || `${s.apiBaseUrl || "http://localhost:8787"}/api/keto`;
        return <DeveloperSDK
          title="Authorization SDK & Code Snippets"
          description="Ready-to-use code for permission checks, tuple management, and access control."
          editorTheme={s.editorTheme}
          module="authz"
          placeholders={{ ketoUrl }}
        />;
      })()}

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* renderAuthZPaneB                                                    */
/* ------------------------------------------------------------------ */
export function renderAuthZPaneB(s: any): React.JSX.Element | null {
  const { primaryNav, authzView, setAuthzView } = s;

  if (primaryNav !== "authz") return null;

  const authzNavItems: Array<{ id: AuthzView; icon: React.ReactNode; label: string }> = [
    { id: "overview", icon: <Graph size={18} weight="regular" />, label: "Overview" },
    { id: "permissions", icon: <ShieldCheck size={18} weight="regular" />, label: "Permissions" },
    { id: "roles", icon: <Users size={18} weight="regular" />, label: "Roles" },
    { id: "model", icon: <Code size={18} weight="regular" />, label: "Model Editor" },
    { id: "graph", icon: <TreeStructure size={18} weight="regular" />, label: "Graph" },
    { id: "developer", icon: <Code size={18} weight="regular" />, label: "Developer" },
  ];

  return (
    <div className="space-y-2">
      {authzNavItems.map(item => (
        <button
          key={item.id}
          onClick={() => setAuthzView(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            authzView === item.id
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
