// StoragePanel.tsx — Storage panel rendering (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import {
  ArrowsClockwise,
  CaretRight,
  CheckCircle,
  ClipboardText,
  File,
  FloppyDisk,
  FolderOpen,
  FolderPlus,
  FolderSimple,
  GearSix,
  LinkSimple,
  MagnifyingGlass,
  Package,
  PaintBucket,
  Plus,
  ShieldCheck,
  Sparkle,
  Trash,
  UploadSimple,
  Code,
  Warning,
} from "@phosphor-icons/react";
import { formatBytes, type StorageView } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

/* ── helpers ─────────────────────────────────────────────────── */

const EXT_COLORS: Record<string, string> = {
  jpg: "bg-cyan-500/20 text-cyan-300", jpeg: "bg-cyan-500/20 text-cyan-300",
  png: "bg-cyan-500/20 text-cyan-300", gif: "bg-cyan-500/20 text-cyan-300",
  svg: "bg-cyan-500/20 text-cyan-300", webp: "bg-cyan-500/20 text-cyan-300",
  avif: "bg-cyan-500/20 text-cyan-300", ico: "bg-cyan-500/20 text-cyan-300",
  pdf: "bg-red-500/20 text-red-300",
  js: "bg-amber-500/20 text-amber-300", ts: "bg-amber-500/20 text-amber-300",
  jsx: "bg-amber-500/20 text-amber-300", tsx: "bg-amber-500/20 text-amber-300",
  py: "bg-amber-500/20 text-amber-300", go: "bg-amber-500/20 text-amber-300",
  rs: "bg-amber-500/20 text-amber-300",
  json: "bg-emerald-500/20 text-emerald-300", csv: "bg-emerald-500/20 text-emerald-300",
  xml: "bg-emerald-500/20 text-emerald-300", yaml: "bg-emerald-500/20 text-emerald-300",
  yml: "bg-emerald-500/20 text-emerald-300",
  zip: "bg-purple-500/20 text-purple-300", gz: "bg-purple-500/20 text-purple-300",
  tar: "bg-purple-500/20 text-purple-300",
  html: "bg-orange-500/20 text-orange-300", css: "bg-orange-500/20 text-orange-300",
  md: "bg-slate-500/20 text-slate-300", txt: "bg-slate-500/20 text-slate-300",
};

function getExtBadge(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return { ext: ext.toUpperCase(), color: EXT_COLORS[ext] || "bg-slate-700/50 text-slate-400" };
}

/* ── Objects file browser (proper component for local state) ── */

function StorageObjectBrowser({ s }: { s: any }) {
  const {
    billingRestrictions, bulkDeleteStorageObjects, copyText,
    createStorageFolder, deleteStorageObject, deletingObjectKey,
    filteredStorageObjects, isBulkDeleting, isCreatingFolder,
    isStorageBucketsLoading, isStorageObjectsLoading, isUploadingStorageObject,
    isUrlDiagLoading, latestDownloadUrl,
    loadObjectMetadata, loadStorageObjects, loadUrlDiagnostics,
    metadataEditData, metadataEditKey, newFolderName, newObjectKey,
    openDownloadForObject, saveObjectMetadata,
    selectedObjectKeys, selectedStorageBucket, setMetadataEditData, setMetadataEditKey,
    setNewFolderName, setNewObjectKey, setSelectedObjectKeys, setSelectedStorageBucket,
    setShowNewFolderInput, setStorageObjectPrefix, setStorageObjectsError,
    setStorageObjectsInfo, setStorageSearch, setUploadFile,
    setUrlDiag, setUrlDiagKey, showNewFolderInput, storageBuckets,
    storageObjectPrefix, storageObjectsError,
    storageObjectsInfo, storageSearch, uploadFile, uploadStorageObject, urlDiag, urlDiagKey,
  } = s;

  const [isDragOver, setIsDragOver] = React.useState(false);
  const [showUpload, setShowUpload] = React.useState(false);

  // Parse prefix into breadcrumb segments
  const prefixSegments = storageObjectPrefix
    ? storageObjectPrefix.replace(/\/$/, "").split("/").filter(Boolean)
    : [];

  // Separate flat object list into folders + files at current level
  const { folders, files } = React.useMemo(() => {
    const prefix = storageObjectPrefix;
    const folderSet = new Map<string, boolean>();
    const fileList: any[] = [];

    for (const obj of filteredStorageObjects) {
      const relative = obj.key.startsWith(prefix) ? obj.key.slice(prefix.length) : obj.key;
      if (!relative || relative === ".keep") continue;

      const slashIdx = relative.indexOf("/");
      if (slashIdx !== -1) {
        folderSet.set(relative.slice(0, slashIdx), true);
      } else {
        fileList.push(obj);
      }
    }

    return { folders: Array.from(folderSet.keys()).sort(), files: fileList };
  }, [filteredStorageObjects, storageObjectPrefix]);

  const navigateToFolder = (folderName: string) => {
    setStorageObjectPrefix(storageObjectPrefix + folderName + "/");
    setSelectedObjectKeys(new Set());
  };

  const navigateUp = () => {
    const segments = prefixSegments.slice(0, -1);
    setStorageObjectPrefix(segments.length ? segments.join("/") + "/" : "");
    setSelectedObjectKeys(new Set());
  };

  const getDisplayName = (key: string) => {
    const relative = key.startsWith(storageObjectPrefix) ? key.slice(storageObjectPrefix.length) : key;
    return relative.replace(/\/$/, "");
  };

  // Back to bucket list
  const exitBucket = () => {
    setSelectedStorageBucket("");
    setStorageObjectPrefix("");
    setSelectedObjectKeys(new Set());
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!selectedStorageBucket) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setUploadFile(file);
    setNewObjectKey(storageObjectPrefix + file.name);
    setShowUpload(true);
  };

  // Select-all covers only files (folders aren't real objects)
  const allFileKeys = files.map((f: any) => f.key);
  const allFilesSelected = allFileKeys.length > 0 && allFileKeys.every((k: string) => selectedObjectKeys.has(k));

  return (
    <div
      className={`mt-4 rounded border transition-colors ${isDragOver ? "border-accent-500 bg-accent-500/5" : "border-slate-800 bg-slate-900/40"} p-4`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={loadStorageObjects}
          disabled={isStorageObjectsLoading}
          className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isStorageObjectsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
          Refresh
        </button>
        <button
          onClick={() => setShowNewFolderInput((v: boolean) => !v)}
          className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FolderPlus size={15} />
          New Folder
        </button>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className={`truss-btn rounded border px-3 py-1.5 text-xs transition-colors ${showUpload ? "border-accent-500/50 bg-accent-500/10 text-accent-300" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
        >
          <UploadSimple size={15} />
          Upload
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={storageSearch}
            onChange={(event) => setStorageSearch(event.target.value)}
            placeholder="Search..."
            className="w-44 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
          {selectedObjectKeys.size > 0 && (
            <button
              onClick={bulkDeleteStorageObjects}
              disabled={isBulkDeleting}
              className="truss-btn rounded border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-50"
            >
              {isBulkDeleting ? <span className="truss-spinner" /> : <Trash size={14} />}
              Delete {selectedObjectKeys.size}
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb path bar */}
      <div className="mb-3 flex items-center gap-0.5 overflow-x-auto rounded border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs">
        <button
          onClick={exitBucket}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent-300 hover:bg-slate-800 hover:text-accent-200"
        >
          <Package size={12} />
          Buckets
        </button>
        <CaretRight size={10} className="shrink-0 text-slate-600" />
        <button
          onClick={() => { setStorageObjectPrefix(""); setSelectedObjectKeys(new Set()); }}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${prefixSegments.length === 0 ? "text-slate-200 font-medium" : "text-accent-300 hover:bg-slate-800 hover:text-accent-200"}`}
        >
          <PaintBucket size={12} />
          {selectedStorageBucket}
        </button>
        {prefixSegments.map((seg, i) => (
          <React.Fragment key={i}>
            <CaretRight size={10} className="shrink-0 text-slate-600" />
            <button
              onClick={() => {
                setStorageObjectPrefix(prefixSegments.slice(0, i + 1).join("/") + "/");
                setSelectedObjectKeys(new Set());
              }}
              className={`rounded px-1.5 py-0.5 ${i === prefixSegments.length - 1 ? "text-slate-200 font-medium" : "text-accent-300 hover:bg-slate-800 hover:text-accent-200"}`}
            >
              {seg}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <div className="mb-3 flex items-center gap-2">
          <FolderSimple size={14} className="shrink-0 text-slate-400" />
          {storageObjectPrefix && (
            <span className="text-xs text-slate-500">{storageObjectPrefix.replace(/\/$/, "")}/</span>
          )}
          <input
            value={newFolderName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && createStorageFolder()}
            placeholder="folder-name"
            autoFocus
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
          <button
            onClick={createStorageFolder}
            disabled={!newFolderName.trim() || isCreatingFolder}
            className="truss-btn rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-500/20 disabled:opacity-50"
          >
            {isCreatingFolder ? <span className="truss-spinner" /> : <Plus size={13} />}
            Create
          </button>
          <button
            onClick={() => { setShowNewFolderInput(false); setNewFolderName(""); }}
            className="text-slate-500 hover:text-white text-sm px-1"
          >×</button>
        </div>
      )}

      {/* Upload section (collapsible) */}
      {showUpload && (
        <div className="mb-3 rounded-lg border border-accent-500/20 bg-accent-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-accent-300">
              <UploadSimple size={13} className="inline -mt-0.5 mr-1" />
              Upload to {storageObjectPrefix || "/"}
            </p>
            <button onClick={() => setShowUpload(false)} className="text-slate-500 hover:text-white text-sm px-1">×</button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={newObjectKey}
              onChange={(event) => setNewObjectKey(event.target.value)}
              placeholder="object key (defaults to filename)"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <input
              type="file"
              onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:rounded file:border file:border-slate-700 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:text-slate-200"
            />
            <button
              onClick={uploadStorageObject}
              disabled={!selectedStorageBucket || !uploadFile || isUploadingStorageObject || (!billingRestrictions.shadow && billingRestrictions.storage)}
              title={billingRestrictions.storage ? (billingRestrictions.shadow ? "Storage limit reached (shadow mode — not blocking)." : "Storage limit reached. Upgrade your plan to upload more files.") : ""}
              className={`truss-btn rounded px-4 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isUploadingStorageObject
                  ? "bg-accent-600 text-white animate-pulse"
                  : uploadFile
                    ? "bg-accent-500 text-slate-950 hover:bg-accent-400 shadow-sm shadow-accent-500/25"
                    : "border border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}
            >
              {isUploadingStorageObject ? <span className="truss-spinner" /> : <UploadSimple size={15} />}
              {isUploadingStorageObject ? "Uploading..." : uploadFile ? `Upload ${uploadFile.name}` : "Choose a file"}
            </button>
          </div>
        </div>
      )}

      {storageObjectsInfo && <p className="mb-2 text-xs text-emerald-300">{storageObjectsInfo}</p>}
      {storageObjectsError && <p className="mb-2 text-xs text-amber-300">{storageObjectsError}</p>}

      {/* Latest download URL */}
      {latestDownloadUrl && (
        <div className="mb-2 rounded border border-slate-700 bg-slate-950 p-2">
          <p className="truncate text-[11px] text-slate-400">{latestDownloadUrl}</p>
          <button
            onClick={() => copyText(latestDownloadUrl, setStorageObjectsInfo, setStorageObjectsError, "Download URL copied.")}
            className="truss-btn mt-2 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
          >
            <ClipboardText size={13} />
            Copy URL
          </button>
        </div>
      )}

      {/* Signed URL diagnostics panel */}
      {urlDiagKey && (
        <div className="mb-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">URL Diagnostics — <span className="font-normal text-slate-400">{urlDiagKey}</span></p>
            <button onClick={() => { setUrlDiagKey(null); setUrlDiag(null); }} className="text-slate-500 hover:text-white text-sm">×</button>
          </div>
          {isUrlDiagLoading && <p className="text-xs text-slate-500">Generating...</p>}
          {urlDiag && !urlDiag.error && (
            <div className="space-y-3">
              {Array.isArray(urlDiag.warnings) && urlDiag.warnings.length > 0 && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
                  {(urlDiag.warnings as string[]).map((w: string, i: number) => (
                    <p key={i} className="flex items-start gap-2 text-xs text-amber-300">
                      <Warning size={13} className="mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}
              {Array.isArray(urlDiag.warnings) && urlDiag.warnings.length === 0 && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-300">
                  <CheckCircle size={13} weight="fill" />
                  No issues detected.
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div>
                  <p className="text-slate-500 uppercase tracking-wide text-[10px]">Signed host</p>
                  <p className="text-slate-200 font-mono">{String(urlDiag.signedHost || "—")}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide text-[10px]">Config host</p>
                  <p className="text-slate-200 font-mono">{String(urlDiag.configuredHost || "—")}</p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide text-[10px]">Host match</p>
                  <p className={urlDiag.hostMatch === true ? "text-emerald-300" : urlDiag.hostMatch === false ? "text-red-300" : "text-slate-400"}>
                    {urlDiag.hostMatch === true ? "✓ Yes" : urlDiag.hostMatch === false ? "✗ No" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 uppercase tracking-wide text-[10px]">Expires at</p>
                  <p className="text-slate-200">{urlDiag.expiresAt ? new Date(String(urlDiag.expiresAt)).toLocaleString() : "—"}</p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">curl command</p>
                <div className="flex items-center gap-2 rounded border border-slate-700 bg-black px-3 py-2">
                  <code className="flex-1 truncate text-[11px] text-green-400">{String(urlDiag.curlCommand || "")}</code>
                  <button
                    onClick={() => copyText(String(urlDiag!.curlCommand), setStorageObjectsInfo, setStorageObjectsError, "curl command copied.")}
                    className="truss-btn shrink-0 rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800"
                  >
                    <ClipboardText size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
          {urlDiag?.error && <p className="text-xs text-amber-300">{String(urlDiag.error)}</p>}
        </div>
      )}

      {metadataEditKey && (
        <div className="mb-3 rounded border border-slate-700 bg-slate-900/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">Metadata — <span className="font-normal text-slate-400">{metadataEditKey}</span></p>
            <button onClick={() => setMetadataEditKey(null)} className="text-slate-500 hover:text-white text-sm px-1">×</button>
          </div>
          {s.isMetadataLoading ? (
            <p className="text-xs text-slate-500">Loading...</p>
          ) : (
            <>
              <div className="grid grid-cols-[120px_1fr] gap-2 items-center text-xs">
                <label className="text-slate-400">Content-Type</label>
                <input
                  value={metadataEditData.contentType || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetadataEditData((prev: any) => ({ ...prev, contentType: e.target.value }))}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
                <label className="text-slate-400">Cache-Control</label>
                <input
                  value={metadataEditData.cacheControl || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetadataEditData((prev: any) => ({ ...prev, cacheControl: e.target.value }))}
                  placeholder="e.g. max-age=3600, public"
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
                />
                <label className="text-slate-400">Disposition</label>
                <input
                  value={metadataEditData.contentDisposition || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetadataEditData((prev: any) => ({ ...prev, contentDisposition: e.target.value }))}
                  placeholder="e.g. inline or attachment"
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setMetadataEditKey(null)} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                <button onClick={saveObjectMetadata} className="rounded bg-accent-500 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-accent-400">Save</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="mb-3 flex items-center justify-center rounded-lg border-2 border-dashed border-accent-500/50 bg-accent-500/5 py-10">
          <div className="text-center">
            <UploadSimple size={28} className="mx-auto mb-2 text-accent-400" />
            <p className="text-sm font-medium text-accent-300">Drop files here to upload</p>
            <p className="mt-1 text-[10px] text-slate-500">File will be placed in {storageObjectPrefix || "/"}</p>
          </div>
        </div>
      )}

      {/* File list */}
      {folders.length === 0 && files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen size={32} className="mb-3 text-slate-600" />
          <p className="text-xs text-slate-400">{selectedStorageBucket ? "No objects found at this path." : "Select a bucket to browse files."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-slate-800">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_80px_120px_auto] bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500">
            <span className="w-6">
              <input
                type="checkbox"
                className="accent-accent-400"
                checked={allFilesSelected}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.checked) setSelectedObjectKeys(new Set(allFileKeys));
                  else setSelectedObjectKeys(new Set());
                }}
                title="Select all files"
              />
            </span>
            <span className="pl-2">Name</span>
            <span className="text-right">Size</span>
            <span className="text-right">Modified</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Go up row */}
          {prefixSegments.length > 0 && (
            <div
              onClick={navigateUp}
              className="grid grid-cols-[auto_1fr_80px_120px_auto] items-center border-t border-slate-800 bg-slate-950 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors"
            >
              <span className="w-6" />
              <span className="flex items-center gap-2 pl-2 text-xs text-slate-400">
                <FolderOpen size={15} className="shrink-0" />
                ..
              </span>
              <span />
              <span />
              <span />
            </div>
          )}

          {/* Folders */}
          {folders.map((folderName) => (
            <div
              key={"d:" + folderName}
              onClick={() => navigateToFolder(folderName)}
              className="grid grid-cols-[auto_1fr_80px_120px_auto] items-center border-t border-slate-800 bg-slate-950 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors"
            >
              <span className="w-6" />
              <span className="flex items-center gap-2 pl-2 text-xs font-medium text-slate-200">
                <FolderSimple size={15} weight="regular" className="shrink-0 text-accent-300" />
                {folderName}/
              </span>
              <span className="text-right text-[11px] text-slate-600">—</span>
              <span className="text-right text-[11px] text-slate-600">—</span>
              <span className="flex justify-end">
                <CaretRight size={14} className="text-slate-600" />
              </span>
            </div>
          ))}

          {/* Files */}
          {files.map((object: any) => {
            const name = getDisplayName(object.key);
            const badge = getExtBadge(name);
            return (
              <div key={object.key}>
                <div
                  className={`hover-reveal-actions grid grid-cols-[auto_1fr_80px_120px_auto] items-center border-t border-slate-800 px-3 py-2 ${selectedObjectKeys.has(object.key) ? "bg-accent-500/5" : "bg-slate-950"}`}
                >
                  <span className="w-6">
                    <input
                      type="checkbox"
                      className="accent-accent-400"
                      checked={selectedObjectKeys.has(object.key)}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const next = new Set(selectedObjectKeys);
                        if (e.target.checked) next.add(object.key);
                        else next.delete(object.key);
                        setSelectedObjectKeys(next);
                      }}
                    />
                  </span>
                  <span className="flex items-center gap-2 pl-2 min-w-0">
                    <File size={15} weight="regular" className="shrink-0 text-slate-500" />
                    <span className="truncate text-xs text-slate-200">{name}</span>
                    {badge && (
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.color}`}>{badge.ext}</span>
                    )}
                  </span>
                  <p className="text-right text-[11px] text-slate-400">{formatBytes(object.size)}</p>
                  <p className="text-right text-[11px] text-slate-500">
                    {object.lastModified ? new Date(object.lastModified).toLocaleDateString() : "—"}
                  </p>
                  <div className="row-actions ml-3 flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => {
                        if (metadataEditKey === object.key) setMetadataEditKey(null);
                        else loadObjectMetadata(object.key);
                      }}
                      className={`truss-btn rounded border px-2 py-1 text-[11px] hover:bg-slate-800 ${metadataEditKey === object.key ? "border-accent-500/50 text-accent-300" : "border-slate-700 text-slate-400"}`}
                      title="Edit metadata"
                    >
                      <GearSix size={12} />
                    </button>
                    <button
                      onClick={() => {
                        if (urlDiagKey === object.key) { setUrlDiagKey(null); setUrlDiag(null); }
                        else loadUrlDiagnostics(object.key);
                      }}
                      className={`truss-btn rounded border px-2 py-1 text-[11px] hover:bg-slate-800 ${urlDiagKey === object.key ? "border-accent-500/50 text-accent-300" : "border-slate-700 text-slate-400"}`}
                      title="URL Diagnostics"
                    >
                      <MagnifyingGlass size={12} />
                    </button>
                    <button
                      onClick={() => openDownloadForObject(object.key)}
                      className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                    >
                      <LinkSimple size={13} />
                      URL
                    </button>
                    <button
                      onClick={() => deleteStorageObject(object.key)}
                      disabled={deletingObjectKey === object.key}
                      className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingObjectKey === object.key ? <span className="truss-spinner" /> : <Trash size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main render ──────────────────────────────────────────────── */

export function renderStorageMain(s: any): React.JSX.Element | null {
  const {
    bucketPolicyError, bucketPolicyInfo, bucketPolicyText,
    copyText, corsConfig, createStorageBucket,
    deleteStorageBucket, deletingBucketName,
    isBucketPolicyLoading, isBucketPolicySaving, isCorsLoading,
    isCreatingStorageBucket,
    isStorageBucketsLoading,
    loadBucketPolicy, loadCorsBucket,
    loadStorageBuckets,
    newBucketName,
    saveBucketPolicy, saveCorsBucket,
    selectedStorageBucket, setBucketPolicyText, setCorsConfig,
    setNewBucketName,
    setSelectedStorageBucket, setStorageObjectPrefix,
    setStorageView,
    storageBuckets, storageBucketsError,
    storageBucketsInfo, storageObjects, storageView,
  } = s;

  const s3Url = s.integrationsStatus?.storage?.s3Endpoint || `${s.apiBaseUrl || "http://localhost:8787"}/api/storage`;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {storageView === "overview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Storage</h2>
            <button onClick={loadStorageBuckets} disabled={isStorageBucketsLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              {isStorageBucketsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><PaintBucket size={13} weight="regular" /> Buckets</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{storageBuckets.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">File containers</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><FolderSimple size={13} weight="regular" /> Objects</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{storageObjects.length}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">In current view</p>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-2 text-xs font-medium text-slate-200">Service Details</h3>
            <div className="grid gap-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="text-slate-300">S3-compatible object storage</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Buckets</span><span className="text-slate-300">{storageBuckets.length} configured</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Protocol</span><span className="text-slate-300">AWS S3 API</span></div>
            </div>
          </div>
        </div>
      )}
      {storageView === "buckets" && !selectedStorageBucket && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              value={newBucketName}
              onChange={(event) => setNewBucketName(event.target.value)}
              placeholder="new-bucket-name"
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            <button
              onClick={createStorageBucket}
              disabled={isCreatingStorageBucket}
              className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingStorageBucket ? <span className="truss-spinner" /> : <Plus size={15} />}
              {isCreatingStorageBucket ? "Creating..." : "Create Bucket"}
            </button>
            <button
              onClick={loadStorageBuckets}
              disabled={isStorageBucketsLoading}
              className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStorageBucketsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
              {isStorageBucketsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {storageBucketsInfo && <p className="mb-2 text-xs text-emerald-300">{storageBucketsInfo}</p>}
          {storageBucketsError && <p className="mb-2 text-xs text-amber-300">{storageBucketsError}</p>}
          {storageBuckets.length === 0 ? (
            <p className="text-xs text-slate-400">No buckets yet. Create one to start storing files.</p>
          ) : (
            <div className="overflow-hidden rounded border border-slate-800">
              <div className="grid grid-cols-[1fr_auto_auto] bg-slate-950/70 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">
                <span>Bucket</span>
                <span>Created</span>
                <span className="text-right">Delete</span>
              </div>
              {storageBuckets.map((bucket: any) => (
                <div
                  key={bucket.name}
                  className="grid grid-cols-[1fr_auto_auto] items-center border-t border-slate-800 bg-slate-950 px-3 py-2 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => { setSelectedStorageBucket(bucket.name); setStorageObjectPrefix(""); }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PaintBucket size={14} className="shrink-0 text-accent-300" />
                    <p className="truncate text-xs font-medium text-slate-200">{bucket.name}</p>
                    <CaretRight size={12} className="shrink-0 text-slate-600" />
                  </div>
                  <p className="truncate text-[11px] text-slate-500 px-4">
                    {bucket.createdAt ? new Date(bucket.createdAt).toLocaleDateString() : "—"}
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteStorageBucket(bucket.name); }}
                    disabled={deletingBucketName === bucket.name}
                    className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingBucketName === bucket.name ? <span className="truss-spinner" /> : <Trash size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {storageView === "buckets" && selectedStorageBucket && <StorageObjectBrowser s={s} />}
      {storageView === "configuration" && (
        <div className="mt-4 space-y-4">
          {/* Bucket Policies */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-slate-200">Bucket Policies</h3>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={selectedStorageBucket}
                onChange={(event) => setSelectedStorageBucket(event.target.value)}
                className="min-w-[220px] rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="">Select bucket</option>
                {storageBuckets.map((bucket: any) => (
                  <option key={bucket.name} value={bucket.name}>
                    {bucket.name}
                  </option>
                ))}
              </select>
              <button
                onClick={loadBucketPolicy}
                disabled={!selectedStorageBucket || isBucketPolicyLoading}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBucketPolicyLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                {isBucketPolicyLoading ? "Loading..." : "Load Policy"}
              </button>
              <button
                onClick={saveBucketPolicy}
                disabled={!selectedStorageBucket || isBucketPolicySaving}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBucketPolicySaving ? <span className="truss-spinner" /> : <FloppyDisk size={15} />}
                {isBucketPolicySaving ? "Saving..." : "Save Policy"}
              </button>
              <button
                onClick={() =>
                  setBucketPolicyText(
                    JSON.stringify(
                      {
                        Version: "2012-10-17",
                        Statement: [
                          {
                            Sid: "PublicReadGetObject",
                            Effect: "Allow",
                            Principal: "*",
                            Action: ["s3:GetObject"],
                            Resource: [`arn:aws:s3:::${selectedStorageBucket || "bucket-name"}/*`],
                          },
                        ],
                      },
                      null,
                      2
                    )
                  )
                }
                disabled={!selectedStorageBucket}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkle size={15} />
                Insert Public-Read Template
              </button>
            </div>
            {bucketPolicyInfo && <p className="mb-2 text-xs text-emerald-300">{bucketPolicyInfo}</p>}
            {bucketPolicyError && <p className="mb-2 text-xs text-amber-300">{bucketPolicyError}</p>}
            <textarea
              value={bucketPolicyText}
              onChange={(event) => setBucketPolicyText(event.target.value)}
              rows={14}
              className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>

          {/* CORS */}
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-slate-200">CORS Configuration</h3>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={selectedStorageBucket}
                onChange={(event) => setSelectedStorageBucket(event.target.value)}
                className="min-w-[220px] rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
              >
                <option value="">Select bucket</option>
                {storageBuckets.map((bucket: any) => (
                  <option key={bucket.name} value={bucket.name}>
                    {bucket.name}
                  </option>
                ))}
              </select>
              <button
                onClick={loadCorsBucket}
                disabled={!selectedStorageBucket || isCorsLoading}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCorsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                {isCorsLoading ? "Loading..." : "Load CORS"}
              </button>
              <button
                onClick={saveCorsBucket}
                disabled={!selectedStorageBucket}
                className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FloppyDisk size={15} />
                Save
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              Configure CORS rules per bucket. These are stored in Truss and applied to proxy responses.
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Allowed Origins (comma-separated)</label>
                <input
                  value={corsConfig.allowedOrigins}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCorsConfig((prev: any) => ({ ...prev, allowedOrigins: e.target.value }))}
                  placeholder="*, https://example.com"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Allowed Methods (comma-separated)</label>
                <input
                  value={corsConfig.allowedMethods}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCorsConfig((prev: any) => ({ ...prev, allowedMethods: e.target.value }))}
                  placeholder="GET, HEAD, PUT, POST, DELETE"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Allowed Headers (comma-separated)</label>
                <input
                  value={corsConfig.allowedHeaders}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCorsConfig((prev: any) => ({ ...prev, allowedHeaders: e.target.value }))}
                  placeholder="*, Authorization, Content-Type"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Max Age (seconds)</label>
                <input
                  value={corsConfig.maxAge}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCorsConfig((prev: any) => ({ ...prev, maxAge: e.target.value }))}
                  placeholder="3600"
                  className="w-48 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {storageView === "developer" && (
        <DeveloperSDK
          title="Storage SDK & Code Snippets"
          description="S3-compatible storage operations — upload, download, presigned URLs, and bucket management."
          editorTheme={s.editorTheme}
          module="storage"
          placeholders={{ s3Url }}
        />
      )}
    </div>
  );
}


export function renderStoragePaneB(s: any): React.JSX.Element | null {
  const { storageView, setStorageView } = s;

  return (
    <div className="space-y-2">
      {([
        { id: "overview" as StorageView, label: "Overview", icon: <PaintBucket size={18} weight="regular" /> },
        { id: "buckets" as StorageView, label: "Buckets", icon: <Package size={18} weight="regular" /> },
        { id: "configuration" as StorageView, label: "Configuration", icon: <GearSix size={18} weight="regular" /> },
        { id: "developer" as StorageView, label: "Developer", icon: <Code size={18} weight="regular" /> },
      ] as const).map((item) => (
        <button
          key={item.id}
          onClick={() => setStorageView(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            storageView === item.id
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
