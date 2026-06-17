// AuthPanel.tsx — Authentication panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import {
  ArrowsClockwise,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  Code,
  DownloadSimple,
  FileArrowUp,
  Fingerprint,
  Flask,
  FloppyDisk,
  IdentificationCard,
  Key,
  Lightning,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Plug,
  Prohibit,
  ShieldCheck,
  SignOut,
  Sparkle,
  Trash,
  User,
  Users,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  parseUserAgent, base64urlToBuffer, bufferToBase64url, apiFetch, downloadFile,
} from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

// ---------------------------------------------------------------------------
// Provider brand icons
// ---------------------------------------------------------------------------
const PROVIDER_ICONS: Record<string, React.JSX.Element> = {
  google: <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.27l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>,
  github: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>,
  discord: <svg viewBox="0 0 24 24" width="20" height="20" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>,
  apple: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>,
  microsoft: <svg viewBox="0 0 24 24" width="20" height="20"><rect fill="#F25022" x="1" y="1" width="10" height="10"/><rect fill="#7FBA00" x="13" y="1" width="10" height="10"/><rect fill="#00A4EF" x="1" y="13" width="10" height="10"/><rect fill="#FFB900" x="13" y="13" width="10" height="10"/></svg>,
  slack: <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#E01E5A" d="M5.042 15.166a2.528 2.528 0 0 1-2.52 2.521A2.528 2.528 0 0 1 0 15.166a2.528 2.528 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.528 2.528 0 0 1 2.521-2.52 2.528 2.528 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.521v-6.313z"/><path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/><path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.52-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z"/><path fill="#ECB22E" d="M15.166 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.522h2.52zm0-1.27a2.528 2.528 0 0 1-2.521-2.522 2.528 2.528 0 0 1 2.52-2.52h6.314A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.521 2.521h-6.313z"/></svg>,
  gitlab: <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#E24329" d="m12 22.2 4.02-12.36H7.98z"/><path fill="#FC6D26" d="M12 22.2 7.98 9.84H1.68z"/><path fill="#FCA326" d="M1.68 9.84.05 14.86a1.11 1.11 0 0 0 .4 1.24L12 22.2z"/><path fill="#E24329" d="M1.68 9.84h6.3L5.38 1.62a.56.56 0 0 0-1.06 0z"/><path fill="#FC6D26" d="M12 22.2 16.02 9.84h6.3z"/><path fill="#FCA326" d="m22.32 9.84 1.63 5.02a1.11 1.11 0 0 1-.4 1.24L12 22.2z"/><path fill="#E24329" d="M22.32 9.84h-6.3l2.6-8.22a.56.56 0 0 1 1.06 0z"/></svg>,
  facebook: <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  linkedin: <svg viewBox="0 0 24 24" width="20" height="20" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM6.838 20.452H3.834V9h3.004v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  spotify: <svg viewBox="0 0 24 24" width="20" height="20" fill="#1DB954"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>,
  twitch: <svg viewBox="0 0 24 24" width="20" height="20" fill="#9146FF"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>,
  patreon: <svg viewBox="0 0 24 24" width="20" height="20" fill="#FF424D"><path d="M15.386.524c-4.764 0-8.64 3.876-8.64 8.64 0 4.75 3.876 8.613 8.64 8.613 4.75 0 8.614-3.864 8.614-8.613C24 4.4 20.136.524 15.386.524M.003 23.537h4.22V.524H.003"/></svg>,
  auth0: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.98 7.448L19.62 0H4.347L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12.007 24l6.157-4.552c3.755-2.81 5.182-7.688 3.815-12.015l-6.16 4.58 2.343 7.45-6.157-4.597-6.158 4.58 2.358-7.433-6.188-4.55 7.63-.045L12.008 0l2.356 7.404 7.615.044z"/></svg>,
};
// Fallback icon for providers without a brand SVG
const defaultProviderIcon = <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;

// ---------------------------------------------------------------------------
// Providers Panel — Social login provider management
// ---------------------------------------------------------------------------
function ProvidersPanel({ authProviders, authProvidersError, authKratosHealthy, providerConfigs, loadAuthProviders, saveProviderConfig, copyText, setStorageObjectsInfo, setStorageObjectsError }: {
  authProviders: any[]; authProvidersError: string; authKratosHealthy: boolean | null;
  providerConfigs: Record<string, any>; loadAuthProviders: () => void;
  saveProviderConfig: (id: string, clientId: string, clientSecret: string, reload: boolean) => void;
  copyText: (text: string, setInfo: any, setErr: any, msg: string) => void;
  setStorageObjectsInfo: any; setStorageObjectsError: any;
}) {
  const [expandedProvider, setExpandedProvider] = React.useState<string | null>(null);
  const configured = authProviders.filter(p => p.configured);
  const unconfigured = authProviders.filter(p => !p.configured);

  return (
    <div className="mt-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Social Login Providers</h3>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {configured.length} of {authProviders.length} providers enabled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAuthProviders} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
            <ArrowsClockwise size={14} /> Refresh
          </button>
        </div>
      </div>

      {authProvidersError && <p className="text-xs text-amber-300">{authProvidersError}</p>}

      {/* Configured providers */}
      {configured.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Enabled</h4>
          <div className="space-y-1">
            {configured.map(provider => {
              const isExpanded = expandedProvider === provider.id;
              return (
                <div key={provider.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/60">{PROVIDER_ICONS[provider.id] || defaultProviderIcon}</span>
                    <span className="flex-1 text-xs font-medium text-slate-200">{provider.displayName}</span>
                    <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                    </span>
                    <svg className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-emerald-500/10 px-3 pb-3 pt-2 space-y-2">
                      <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5">
                        <span className="text-[10px] text-slate-500 shrink-0">Callback</span>
                        <code className="flex-1 truncate text-[10px] font-mono text-slate-400">{provider.callbackUrl}</code>
                        <button onClick={() => copyText(provider.callbackUrl, setStorageObjectsInfo, setStorageObjectsError, "Copied")} className="shrink-0 text-slate-500 hover:text-slate-300"><ClipboardText size={12} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] uppercase tracking-wide text-slate-500">Client ID</label>
                          <input defaultValue={providerConfigs[provider.id]?.clientId || ""} id={`provider-cid-${provider.id}`} placeholder="Client ID" className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-wide text-slate-500">Client Secret</label>
                          <input defaultValue={providerConfigs[provider.id]?.clientSecret || ""} id={`provider-csec-${provider.id}`} type="password" placeholder="Secret" className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { const c = document.getElementById(`provider-cid-${provider.id}`) as HTMLInputElement; const s = document.getElementById(`provider-csec-${provider.id}`) as HTMLInputElement; saveProviderConfig(provider.id, c.value, s.value, true); }}
                          className="truss-btn rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1 text-[11px] text-accent-200 hover:bg-accent-500/20"
                        >Update</button>
                        <a href={provider.docs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"><LinkSimple size={10} /> Docs</a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unconfigured providers */}
      {unconfigured.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Available ({unconfigured.length})</h4>
          <div className="space-y-1">
            {unconfigured.map(provider => {
              const isExpanded = expandedProvider === provider.id;
              return (
                <div key={provider.id} className="rounded-lg border border-slate-800 bg-slate-900/40">
                  <button
                    onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-800/30 rounded-lg transition-colors"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800/60 opacity-50">{PROVIDER_ICONS[provider.id] || defaultProviderIcon}</span>
                    <span className="flex-1 text-xs text-slate-400">{provider.displayName}</span>
                    <span className="text-[10px] text-slate-600">Not configured</span>
                    <svg className={`h-3.5 w-3.5 text-slate-600 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-800 px-3 pb-3 pt-2 space-y-2">
                      <div className="rounded border border-slate-700/50 bg-slate-800/20 p-2 text-[10px] text-slate-500 space-y-1">
                        <p className="font-medium text-slate-400">Setup steps:</p>
                        <ol className="ml-3 list-decimal space-y-0.5">
                          <li>Create an OAuth app on <span className="text-slate-300">{provider.displayName}</span></li>
                          <li>Copy the callback URL below as the redirect URI</li>
                          <li>Add <code className="rounded bg-slate-700 px-1">{provider.id}</code> to <code className="rounded bg-slate-700 px-1">KRATOS_OIDC_PROVIDERS</code> env var</li>
                          <li>Enter client ID and secret, then save</li>
                        </ol>
                      </div>
                      <div className="flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5">
                        <span className="text-[10px] text-slate-500 shrink-0">Callback</span>
                        <code className="flex-1 truncate text-[10px] font-mono text-slate-400">{provider.callbackUrl}</code>
                        <button onClick={() => copyText(provider.callbackUrl, setStorageObjectsInfo, setStorageObjectsError, "Copied")} className="shrink-0 text-slate-500 hover:text-slate-300"><ClipboardText size={12} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] uppercase tracking-wide text-slate-500">Client ID</label>
                          <input defaultValue="" id={`provider-cid-${provider.id}`} placeholder="Client ID" className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-wide text-slate-500">Client Secret</label>
                          <input defaultValue="" id={`provider-csec-${provider.id}`} type="password" placeholder="Secret" className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-accent-400" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { const c = document.getElementById(`provider-cid-${provider.id}`) as HTMLInputElement; const s = document.getElementById(`provider-csec-${provider.id}`) as HTMLInputElement; saveProviderConfig(provider.id, c.value, s.value, true); }}
                          className="truss-btn rounded border border-accent-500/40 bg-accent-500/10 px-3 py-1 text-[11px] text-accent-200 hover:bg-accent-500/20"
                        >Save & Enable</button>
                        <a href={provider.docs} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"><LinkSimple size={10} /> Docs</a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick setup reference */}
      <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Environment Variable</p>
        <div className="rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-300">
          KRATOS_OIDC_PROVIDERS=google,github,discord
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">Comma-separated list of provider IDs to enable. Restart Kratos after changes.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MFA Panel — Multi-factor authentication management
// ---------------------------------------------------------------------------
function MfaPanel({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [mfaStatus, setMfaStatus] = useState<{ totp: boolean; webauthn: boolean; webauthn_credentials: Array<{ id: string; display_name: string; added_at: string | null }>; lookup_secret: boolean; lookup_secrets_count: number; lookup_secrets_used: number } | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");

  // TOTP setup state
  const [totpSetupActive, setTotpSetupActive] = useState(false);
  const [totpFlowId, setTotpFlowId] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpUrl, setTotpUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [totpVerifyLoading, setTotpVerifyLoading] = useState(false);
  const [totpError, setTotpError] = useState("");
  const [totpSuccess, setTotpSuccess] = useState("");
  const [totpDisableLoading, setTotpDisableLoading] = useState(false);
  const [showTotpDisableConfirm, setShowTotpDisableConfirm] = useState(false);

  // WebAuthn state
  const [webauthnSetupLoading, setWebauthnSetupLoading] = useState(false);
  const [webauthnError, setWebauthnError] = useState("");
  const [webauthnSuccess, setWebauthnSuccess] = useState("");
  const [webauthnKeyName, setWebauthnKeyName] = useState("Security Key");
  const [webauthnRemoveLoading, setWebauthnRemoveLoading] = useState<string | null>(null);
  const [showWebauthnRemoveConfirm, setShowWebauthnRemoveConfirm] = useState<string | null>(null);

  // Recovery codes state
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [recoveryFlowId, setRecoveryFlowId] = useState("");
  const [recoveryGenerating, setRecoveryGenerating] = useState(false);
  const [recoveryConfirming, setRecoveryConfirming] = useState(false);
  const [recoveryRevoking, setRecoveryRevoking] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [showRecoveryRevokeConfirm, setShowRecoveryRevokeConfirm] = useState(false);
  const [recoveryCopied, setRecoveryCopied] = useState(false);

  const loadMfaStatus = async () => {
    setMfaLoading(true);
    setMfaError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/status`);
      if (!res.ok) { const d = await res.json(); setMfaError(d.error || "Failed to load MFA status"); return; }
      setMfaStatus(await res.json());
    } catch (err) {
      setMfaError("Failed to load MFA status");
    } finally {
      setMfaLoading(false);
    }
  };

  useEffect(() => { loadMfaStatus(); }, []);

  const startTotpSetup = async () => {
    setTotpSetupLoading(true);
    setTotpError("");
    setTotpSuccess("");
    setTotpCode("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/totp/setup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Failed to start TOTP setup"); return; }
      setTotpFlowId(data.flow_id || "");
      setTotpSecret(data.totp_secret || "");
      setTotpUrl(data.totp_url || "");
      setTotpSetupActive(true);
    } catch {
      setTotpError("Failed to start TOTP setup");
    } finally {
      setTotpSetupLoading(false);
    }
  };

  const verifyTotp = async () => {
    if (!totpCode || totpCode.length < 6) { setTotpError("Enter a 6-digit code"); return; }
    setTotpVerifyLoading(true);
    setTotpError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow_id: totpFlowId, totp_code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.ui?.messages?.[0]?.text || data.error || "Verification failed";
        setTotpError(msg);
        return;
      }
      setTotpSuccess("TOTP has been enabled successfully.");
      setTotpSetupActive(false);
      setTotpCode("");
      loadMfaStatus();
    } catch {
      setTotpError("Verification failed");
    } finally {
      setTotpVerifyLoading(false);
    }
  };

  const disableTotp = async () => {
    setTotpDisableLoading(true);
    setTotpError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/totp`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setTotpError(data.error || "Failed to disable TOTP"); return; }
      setTotpSuccess("TOTP has been disabled.");
      setShowTotpDisableConfirm(false);
      loadMfaStatus();
    } catch {
      setTotpError("Failed to disable TOTP");
    } finally {
      setTotpDisableLoading(false);
    }
  };

  const startWebauthnSetup = async () => {
    setWebauthnSetupLoading(true);
    setWebauthnError("");
    setWebauthnSuccess("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/webauthn/setup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setWebauthnError(data.error || "Failed to start WebAuthn setup"); return; }

      if (!data.webauthn_options) {
        setWebauthnError("WebAuthn is not configured in Kratos. Enable the webauthn method in your Kratos configuration.");
        return;
      }

      // Use the browser WebAuthn API
      const publicKey = data.webauthn_options.publicKey || data.webauthn_options;
      // Convert base64url fields to ArrayBuffer
      if (publicKey.challenge && typeof publicKey.challenge === "string") {
        publicKey.challenge = base64urlToBuffer(publicKey.challenge);
      }
      if (publicKey.user?.id && typeof publicKey.user.id === "string") {
        publicKey.user.id = base64urlToBuffer(publicKey.user.id);
      }
      if (publicKey.excludeCredentials) {
        publicKey.excludeCredentials = publicKey.excludeCredentials.map((c: any) => ({
          ...c,
          id: typeof c.id === "string" ? base64urlToBuffer(c.id) : c.id,
        }));
      }

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      if (!credential) { setWebauthnError("WebAuthn registration was cancelled"); return; }

      const response = credential.response as AuthenticatorAttestationResponse;
      const registerPayload = JSON.stringify({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: bufferToBase64url(response.attestationObject),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
        },
      });

      const verifyRes = await apiFetch(`${apiBaseUrl}/api/auth/mfa/webauthn/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow_id: data.flow_id,
          webauthn_register: registerPayload,
          webauthn_register_displayname: webauthnKeyName,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { setWebauthnError(verifyData.error || "WebAuthn registration failed"); return; }
      setWebauthnSuccess("Security key registered successfully.");
      loadMfaStatus();
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setWebauthnError("WebAuthn registration was cancelled or timed out.");
      } else {
        setWebauthnError(err.message || "WebAuthn registration failed");
      }
    } finally {
      setWebauthnSetupLoading(false);
    }
  };

  const removeWebauthnKey = async (credId: string) => {
    setWebauthnRemoveLoading(credId);
    setWebauthnError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/webauthn`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential_id: credId }),
      });
      const data = await res.json();
      if (!res.ok) { setWebauthnError(data.error || "Failed to remove key"); return; }
      setWebauthnSuccess("Security key removed.");
      setShowWebauthnRemoveConfirm(null);
      loadMfaStatus();
    } catch {
      setWebauthnError("Failed to remove key");
    } finally {
      setWebauthnRemoveLoading(null);
    }
  };

  const generateRecoveryCodes = async () => {
    setRecoveryGenerating(true);
    setRecoveryError("");
    setRecoverySuccess("");
    setRecoveryCodes([]);
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/recovery-codes/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setRecoveryError(data.error || "Failed to generate recovery codes"); return; }
      setRecoveryCodes(data.codes || []);
      setRecoveryFlowId(data.flow_id || "");
    } catch {
      setRecoveryError("Failed to generate recovery codes");
    } finally {
      setRecoveryGenerating(false);
    }
  };

  const confirmRecoveryCodes = async () => {
    setRecoveryConfirming(true);
    setRecoveryError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/recovery-codes/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow_id: recoveryFlowId }),
      });
      const data = await res.json();
      if (!res.ok) { setRecoveryError(data.error || "Failed to confirm recovery codes"); return; }
      setRecoverySuccess("Recovery codes saved successfully.");
      setRecoveryCodes([]);
      setRecoveryFlowId("");
      loadMfaStatus();
    } catch {
      setRecoveryError("Failed to confirm recovery codes");
    } finally {
      setRecoveryConfirming(false);
    }
  };

  const revokeRecoveryCodes = async () => {
    setRecoveryRevoking(true);
    setRecoveryError("");
    try {
      const res = await apiFetch(`${apiBaseUrl}/api/auth/mfa/recovery-codes`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setRecoveryError(data.error || "Failed to revoke recovery codes"); return; }
      setRecoverySuccess("Recovery codes have been revoked.");
      setShowRecoveryRevokeConfirm(false);
      setRecoveryCodes([]);
      loadMfaStatus();
    } catch {
      setRecoveryError("Failed to revoke recovery codes");
    } finally {
      setRecoveryRevoking(false);
    }
  };

  const copyRecoveryCodes = () => {
    const text = recoveryCodes.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setRecoveryCopied(true);
      setTimeout(() => setRecoveryCopied(false), 2000);
    });
  };

  const downloadRecoveryCodes = () => {
    const text = `Truss Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`).join("\n")}\n\nStore these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "truss-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-100">Multi-Factor Authentication</h3>
          <button
            onClick={loadMfaStatus}
            disabled={mfaLoading}
            className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mfaLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
            {mfaLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Add an extra layer of security to user accounts. Powered by Ory Kratos.
        </p>
        {mfaError && <p className="mb-3 text-xs text-red-300">{mfaError}</p>}

        {/* TOTP Section */}
        <div className="rounded border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Fingerprint size={18} weight="regular" className="text-slate-300" />
              <h4 className="text-sm text-slate-100">Authenticator App (TOTP)</h4>
            </div>
            {mfaStatus && (
              <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                mfaStatus.totp
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-slate-800 text-slate-500"
              }`}>
                {mfaStatus.totp ? "Enabled" : "Disabled"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Use an authenticator app (Google Authenticator, Authy, 1Password, etc.) to generate time-based one-time passwords.
          </p>

          {totpError && <p className="mb-2 text-xs text-red-300">{totpError}</p>}
          {totpSuccess && <p className="mb-2 text-xs text-emerald-300">{totpSuccess}</p>}

          {!mfaStatus?.totp && !totpSetupActive && (
            <button
              onClick={startTotpSetup}
              disabled={totpSetupLoading}
              className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
            >
              {totpSetupLoading ? <span className="truss-spinner" /> : <Plus size={15} />}
              Enable TOTP
            </button>
          )}

          {totpSetupActive && (
            <div className="mt-2 space-y-3 rounded border border-slate-700 bg-slate-900/60 p-3">
              <p className="text-xs text-slate-200 font-medium">Step 1: Add to your authenticator app</p>

              {totpUrl && totpUrl.startsWith("data:image") && (
                <div className="flex justify-center">
                  <img src={totpUrl} alt="TOTP QR Code" className="rounded border border-slate-700" style={{ width: 180, height: 180 }} />
                </div>
              )}

              {totpSecret && (
                <div className="rounded border border-slate-700 bg-slate-950 p-2">
                  <p className="text-[11px] text-slate-400 mb-1">Manual entry key:</p>
                  <code className="block text-xs text-slate-100 font-mono break-all select-all">{totpSecret}</code>
                </div>
              )}

              {!totpSecret && !totpUrl && (
                <p className="text-[11px] text-amber-300">
                  TOTP secret could not be extracted from the Kratos flow. Ensure TOTP is enabled in your Kratos configuration (selfservice.methods.totp.enabled: true).
                </p>
              )}

              <p className="text-xs text-slate-200 font-medium">Step 2: Enter the 6-digit code from your app</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-32 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-center text-sm font-mono tracking-widest text-slate-100 placeholder-slate-600 focus:border-accent-500 focus:outline-none"
                />
                <button
                  onClick={verifyTotp}
                  disabled={totpVerifyLoading || totpCode.length < 6}
                  className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
                >
                  {totpVerifyLoading ? <span className="truss-spinner" /> : <CheckCircle size={15} />}
                  Verify
                </button>
                <button
                  onClick={() => { setTotpSetupActive(false); setTotpError(""); setTotpCode(""); }}
                  className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mfaStatus?.totp && !showTotpDisableConfirm && (
            <button
              onClick={() => setShowTotpDisableConfirm(true)}
              className="truss-btn rounded border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30"
            >
              <Trash size={15} />
              Disable TOTP
            </button>
          )}

          {showTotpDisableConfirm && (
            <div className="mt-2 flex items-center gap-2 rounded border border-red-900/50 bg-red-950/20 p-3">
              <Warning size={15} className="text-red-300 shrink-0" />
              <p className="text-xs text-red-200 flex-1">Are you sure? This will remove TOTP from your account.</p>
              <button
                onClick={disableTotp}
                disabled={totpDisableLoading}
                className="truss-btn rounded border border-red-400/40 px-3 py-1 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-50"
              >
                {totpDisableLoading ? <span className="truss-spinner" /> : null}
                Confirm
              </button>
              <button
                onClick={() => setShowTotpDisableConfirm(false)}
                className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* WebAuthn Section */}
        <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Key size={18} weight="regular" className="text-slate-300" />
              <h4 className="text-sm text-slate-100">Security Keys (WebAuthn)</h4>
            </div>
            {mfaStatus && (
              <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                mfaStatus.webauthn
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-slate-800 text-slate-500"
              }`}>
                {mfaStatus.webauthn ? `${mfaStatus.webauthn_credentials.length} key${mfaStatus.webauthn_credentials.length !== 1 ? "s" : ""}` : "None"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Use hardware security keys (YubiKey, Titan Key) or platform authenticators (Touch ID, Windows Hello) via WebAuthn.
          </p>

          {webauthnError && <p className="mb-2 text-xs text-red-300">{webauthnError}</p>}
          {webauthnSuccess && <p className="mb-2 text-xs text-emerald-300">{webauthnSuccess}</p>}

          {/* Existing keys */}
          {mfaStatus?.webauthn_credentials && mfaStatus.webauthn_credentials.length > 0 && (
            <div className="mb-3 space-y-2">
              {mfaStatus.webauthn_credentials.map((cred) => (
                <div key={cred.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-200">{cred.display_name}</p>
                    <p className="truncate text-[11px] text-slate-500 font-mono">{cred.id.slice(0, 24)}...</p>
                    {cred.added_at && <p className="text-[10px] text-slate-500">Added {new Date(cred.added_at).toLocaleDateString()}</p>}
                  </div>
                  {showWebauthnRemoveConfirm === cred.id ? (
                    <div className="flex items-center gap-1 ml-3">
                      <button
                        onClick={() => removeWebauthnKey(cred.id)}
                        disabled={webauthnRemoveLoading === cred.id}
                        className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                      >
                        {webauthnRemoveLoading === cred.id ? <span className="truss-spinner" /> : null}
                        Remove
                      </button>
                      <button
                        onClick={() => setShowWebauthnRemoveConfirm(null)}
                        className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowWebauthnRemoveConfirm(cred.id)}
                      className="truss-btn ml-3 rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-400/10"
                    >
                      <Trash size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Register new key */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={webauthnKeyName}
              onChange={(e) => setWebauthnKeyName(e.target.value)}
              placeholder="Key name"
              className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-accent-500 focus:outline-none"
            />
            <button
              onClick={startWebauthnSetup}
              disabled={webauthnSetupLoading}
              className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
            >
              {webauthnSetupLoading ? <span className="truss-spinner" /> : <Plus size={15} />}
              Register Security Key
            </button>
          </div>
          {!window.PublicKeyCredential && (
            <p className="mt-2 text-[11px] text-amber-300">
              WebAuthn is not supported in this browser. Use a modern browser with security key support.
            </p>
          )}
        </div>

        {/* Recovery Codes Section */}
        <div className="mt-4 rounded border border-slate-800 bg-slate-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} weight="regular" className="text-slate-300" />
              <h4 className="text-sm text-slate-100">Recovery Codes</h4>
            </div>
            {mfaStatus && (
              <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                mfaStatus.lookup_secret
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-slate-800 text-slate-500"
              }`}>
                {mfaStatus.lookup_secret
                  ? `${mfaStatus.lookup_secrets_count - mfaStatus.lookup_secrets_used} of ${mfaStatus.lookup_secrets_count} remaining`
                  : "Not configured"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Backup codes for account recovery if you lose access to your authenticator app or security keys. Each code can only be used once.
          </p>

          {recoveryError && <p className="mb-2 text-xs text-red-300">{recoveryError}</p>}
          {recoverySuccess && <p className="mb-2 text-xs text-emerald-300">{recoverySuccess}</p>}

          {/* Show generated codes */}
          {recoveryCodes.length > 0 && (
            <div className="mb-3 space-y-3">
              <div className="rounded border border-amber-900/50 bg-amber-950/20 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Warning size={15} className="text-amber-300 shrink-0" />
                  <p className="text-xs text-amber-200 font-medium">Save these codes now — they won't be shown again</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {recoveryCodes.map((code, i) => (
                    <div key={i} className="rounded bg-slate-900/80 px-2 py-1.5 text-center">
                      <code className="text-xs font-mono text-slate-100">{code}</code>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyRecoveryCodes}
                  className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  <ClipboardText size={15} />
                  {recoveryCopied ? "Copied!" : "Copy All"}
                </button>
                <button
                  onClick={downloadRecoveryCodes}
                  className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  <DownloadSimple size={15} />
                  Download
                </button>
                <button
                  onClick={confirmRecoveryCodes}
                  disabled={recoveryConfirming}
                  className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
                >
                  {recoveryConfirming ? <span className="truss-spinner" /> : <CheckCircle size={15} />}
                  I've Saved These Codes
                </button>
              </div>
            </div>
          )}

          {/* Generate / Regenerate buttons */}
          {recoveryCodes.length === 0 && (
            <>
              {!mfaStatus?.lookup_secret ? (
                <button
                  onClick={generateRecoveryCodes}
                  disabled={recoveryGenerating}
                  className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
                >
                  {recoveryGenerating ? <span className="truss-spinner" /> : <Plus size={15} />}
                  Generate Recovery Codes
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={generateRecoveryCodes}
                    disabled={recoveryGenerating}
                    className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-200 hover:bg-accent-600/20 disabled:opacity-50"
                  >
                    {recoveryGenerating ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                    Regenerate Codes
                  </button>
                  {!showRecoveryRevokeConfirm ? (
                    <button
                      onClick={() => setShowRecoveryRevokeConfirm(true)}
                      className="truss-btn rounded border border-red-400/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30"
                    >
                      <Trash size={15} />
                      Revoke All
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded border border-red-900/50 bg-red-950/20 p-2">
                      <Warning size={15} className="text-red-300 shrink-0" />
                      <p className="text-[11px] text-red-200">Revoke all codes?</p>
                      <button
                        onClick={revokeRecoveryCodes}
                        disabled={recoveryRevoking}
                        className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                      >
                        {recoveryRevoking ? <span className="truss-spinner" /> : null}
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowRecoveryRevokeConfirm(false)}
                        className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Warning if MFA is enabled but no recovery codes */}
          {mfaStatus && (mfaStatus.totp || mfaStatus.webauthn) && !mfaStatus.lookup_secret && recoveryCodes.length === 0 && (
            <div className="mt-3 flex items-start gap-2 rounded border border-amber-900/50 bg-amber-950/20 p-3">
              <Warning size={15} className="text-amber-300 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200">
                You have MFA enabled but no recovery codes. If you lose your authenticator device, you may be locked out of your account. Generate recovery codes now.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// AuthWebhooks — extracted from IIFE to fix hooks violation
// ---------------------------------------------------------------------------
function AuthWebhooks({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [webhooks, setWebhooks] = React.useState<Array<{ name: string; url: string; events: string[]; secret?: string; enabled: boolean }>>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [testing, setTesting] = React.useState<number | null>(null);
  const [testResult, setTestResult] = React.useState<{ idx: number; ok: boolean; msg: string } | null>(null);
  const [editIdx, setEditIdx] = React.useState<number | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formUrl, setFormUrl] = React.useState("");
  const [formEvents, setFormEvents] = React.useState<string[]>([]);
  const [formSecret, setFormSecret] = React.useState("");
  const [formEnabled, setFormEnabled] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);

  const allEvents = ["auth.login", "auth.register", "auth.recovery", "auth.verification", "auth.logout"];

  useEffect(() => {
    if (!loaded && !loading) {
      setLoading(true);
      apiFetch(`${apiBaseUrl}/api/auth/webhooks`).then(r => r.json()).then(d => {
        setWebhooks(d.webhooks || []);
        setLoaded(true);
        setLoading(false);
      }).catch(() => { setLoaded(true); setLoading(false); });
    }
  }, [loaded, loading, apiBaseUrl]);

  const resetForm = () => { setFormName(""); setFormUrl(""); setFormEvents([]); setFormSecret(""); setFormEnabled(true); setEditIdx(null); setShowForm(false); };
  const startEdit = (idx: number) => { const w = webhooks[idx]; setFormName(w.name); setFormUrl(w.url); setFormEvents([...w.events]); setFormSecret(w.secret || ""); setFormEnabled(w.enabled); setEditIdx(idx); setShowForm(true); };
  const startAdd = () => { resetForm(); setShowForm(true); };
  const toggleEvent = (ev: string) => { setFormEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]); };

  const saveWebhook = async () => {
    const entry = { name: formName, url: formUrl, events: formEvents, secret: formSecret || undefined, enabled: formEnabled };
    const updated = [...webhooks];
    if (editIdx !== null) updated[editIdx] = entry; else updated.push(entry);
    setSaving(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/webhooks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhooks: updated }) });
      if (r.ok) { setWebhooks(updated); setSaved(true); setTimeout(() => setSaved(false), 2000); resetForm(); }
    } catch { /* */ }
    setSaving(false);
  };

  const deleteWebhook = async (idx: number) => {
    const updated = webhooks.filter((_, i) => i !== idx);
    setSaving(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/webhooks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhooks: updated }) });
      if (r.ok) setWebhooks(updated);
    } catch { /* */ }
    setSaving(false);
  };

  const toggleWebhook = async (idx: number) => {
    const updated = [...webhooks]; updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/webhooks`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ webhooks: updated }) });
      if (r.ok) setWebhooks(updated);
    } catch { /* */ }
  };

  const testWebhook = async (idx: number) => {
    setTesting(idx); setTestResult(null);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/webhooks/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(webhooks[idx]) });
      const d = await r.json();
      setTestResult({ idx, ok: r.ok, msg: d.message || (r.ok ? "OK" : "Failed") });
    } catch (e: any) { setTestResult({ idx, ok: false, msg: e.message || "Network error" }); }
    setTesting(null);
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-slate-200">Auth Webhooks</h3>
        {!showForm && (
          <button onClick={startAdd} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-2.5 py-1 text-[11px] text-accent-300 hover:bg-accent-600/20">
            <Plus size={12} /> Add Webhook
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">HTTP callbacks when authentication events occur.</p>
      {loading && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="truss-spinner" /> Loading...</div>}
      {saved && <div className="text-[10px] text-emerald-400 mb-2">Saved</div>}
      {loaded && !showForm && webhooks.length === 0 && (
        <div className="rounded border border-dashed border-slate-700 bg-slate-950/30 p-6 text-center">
          <Lightning size={20} weight="regular" className="mx-auto text-slate-600 mb-2" />
          <p className="text-xs text-slate-400">No auth webhooks yet. Add one to get notified on user events.</p>
        </div>
      )}
      {loaded && !showForm && webhooks.length > 0 && (
        <div className="space-y-2">
          {webhooks.map((w, idx) => (
            <div key={idx} className="rounded border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">{w.name || "Untitled"}</span>
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${w.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => testWebhook(idx)} disabled={testing === idx} className="text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-40" title="Test">{testing === idx ? <span className="truss-spinner" /> : <Play size={12} />}</button>
                  <button onClick={() => startEdit(idx)} className="text-[10px] text-slate-400 hover:text-slate-200" title="Edit"><PencilSimple size={12} /></button>
                  <button onClick={() => toggleWebhook(idx)} className="text-[10px] text-slate-400 hover:text-slate-200" title={w.enabled ? "Disable" : "Enable"}>{w.enabled ? <Pause size={12} /> : <Play size={12} />}</button>
                  <button onClick={() => deleteWebhook(idx)} className="text-[10px] text-red-400 hover:text-red-300" title="Delete"><Trash size={12} /></button>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-mono truncate mb-1.5">{w.url}</p>
              <div className="flex flex-wrap gap-1">
                {w.events.map(ev => (
                  <span key={ev} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-accent-500" />{ev}
                  </span>
                ))}
              </div>
              {testResult && testResult.idx === idx && (
                <div className={`mt-2 rounded border px-2 py-1 text-[10px] ${testResult.ok ? "border-emerald-800 bg-emerald-950/30 text-emerald-400" : "border-red-800 bg-red-950/30 text-red-400"}`}>
                  {testResult.ok ? <CheckCircle size={11} className="inline mr-1" /> : <XCircle size={11} className="inline mr-1" />}{testResult.msg}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <div className="space-y-3 rounded border border-slate-700 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-200">{editIdx !== null ? "Edit Webhook" : "New Webhook"}</h4>
            <button onClick={resetForm} className="text-[10px] text-slate-500 hover:text-slate-300">Cancel</button>
          </div>
          <div><label className="text-[10px] text-slate-500 uppercase">Name</label><input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My webhook" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500" /></div>
          <div><label className="text-[10px] text-slate-500 uppercase">URL</label><input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://example.com/webhook" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" /></div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase mb-1.5 block">Events</label>
            <div className="flex flex-wrap gap-2">
              {allEvents.map(ev => (<label key={ev} className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer"><input type="checkbox" checked={formEvents.includes(ev)} onChange={() => toggleEvent(ev)} className="rounded border-slate-600 bg-slate-800 text-accent-500 focus:ring-accent-500 h-3 w-3" />{ev}</label>))}
            </div>
          </div>
          <div><label className="text-[10px] text-slate-500 uppercase">Secret <span className="normal-case text-slate-600">(optional)</span></label><input value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="whsec_..." className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" /></div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 uppercase">Enabled</label>
            <button onClick={() => setFormEnabled(!formEnabled)} className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${formEnabled ? "bg-emerald-500" : "bg-slate-700"}`}>
              <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${formEnabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <button onClick={saveWebhook} disabled={saving || !formName.trim() || !formUrl.trim() || formEvents.length === 0} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/20 disabled:opacity-40">
            {saving ? <span className="truss-spinner" /> : <FloppyDisk size={13} />} {editIdx !== null ? "Update" : "Save"} Webhook
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthTemplates — extracted from IIFE to fix hooks violation
// ---------------------------------------------------------------------------
function AuthTemplates({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [templates, setTemplates] = React.useState<Record<string, { subject: string; body: string }> | null>(null);
  const [defaults, setDefaults] = React.useState<Record<string, { subject: string; body: string }> | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [editSubject, setEditSubject] = React.useState("");
  const [editBody, setEditBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  useEffect(() => {
    if (!templates && !loading) {
      setLoading(true);
      apiFetch(`${apiBaseUrl}/api/auth/email-templates`).then(r => r.json()).then(d => {
        setTemplates(d.templates); setDefaults(d.defaults); setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [templates, loading, apiBaseUrl]);

  const templateLabels: Record<string, string> = { verification_code: "Email Verification", recovery_code: "Password Recovery", verification_valid: "Email Verified", welcome: "Welcome Email" };
  const startEdit = (key: string) => { if (!templates) return; setEditKey(key); setEditSubject(templates[key]?.subject || ""); setEditBody(templates[key]?.body || ""); };

  const saveTemplate = async () => {
    if (!editKey || !templates) return;
    setSaving(true);
    const updated = { ...templates, [editKey]: { subject: editSubject, body: editBody } };
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/auth/email-templates`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: updated }) });
      if (r.ok) { setTemplates(updated); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    } catch { /* */ }
    setSaving(false);
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-xs font-medium text-slate-200 mb-1">Email Templates</h3>
      <p className="text-[11px] text-slate-400 mb-3">Customize verification, recovery, and welcome emails. Templates support Go template syntax.</p>
      {loading && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="truss-spinner" /> Loading...</div>}
      {templates && !editKey && (
        <div className="space-y-2">
          {Object.entries(templateLabels).map(([key, label]) => {
            const t = templates[key]; if (!t) return null;
            return (
              <div key={key} className="rounded border border-slate-800 bg-slate-950/40 p-3 cursor-pointer hover:bg-slate-900/40" onClick={() => startEdit(key)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-200">{label}</span>
                  <button className="text-[10px] text-accent-400 hover:text-accent-300"><PencilSimple size={12} /> Edit</button>
                </div>
                <p className="text-[10px] text-slate-400 font-mono truncate">Subject: {t.subject}</p>
              </div>
            );
          })}
        </div>
      )}
      {editKey && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-200">{templateLabels[editKey] || editKey}</h4>
            <button onClick={() => setEditKey(null)} className="text-[10px] text-slate-500 hover:text-slate-300">← Back</button>
          </div>
          <div><label className="text-[10px] text-slate-500 uppercase">Subject</label><input value={editSubject} onChange={e => setEditSubject(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" /></div>
          <div><label className="text-[10px] text-slate-500 uppercase">Body</label><textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={10} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500 resize-y" /></div>
          <div className="flex items-center gap-3">
            <button onClick={saveTemplate} disabled={saving} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/20 disabled:opacity-40">
              {saving ? <span className="truss-spinner" /> : <FloppyDisk size={13} />} Save Template
            </button>
            {saved && <span className="text-[10px] text-emerald-400">Saved</span>}
            {defaults && defaults[editKey] && (
              <button onClick={() => { setEditSubject(defaults[editKey].subject); setEditBody(defaults[editKey].body); }} className="text-[10px] text-slate-500 hover:text-slate-300">Reset to Default</button>
            )}
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-[10px] text-slate-500 uppercase mb-1">Template Variables</p>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="text-slate-400 font-mono">{"{{.To}}"}</div><div className="text-slate-500">Recipient email</div>
              <div className="text-slate-400 font-mono">{"{{.VerificationCode}}"}</div><div className="text-slate-500">Verification code</div>
              <div className="text-slate-400 font-mono">{"{{.RecoveryCode}}"}</div><div className="text-slate-500">Recovery code</div>
              <div className="text-slate-400 font-mono">{"{{.Identity.traits.email}}"}</div><div className="text-slate-500">User email trait</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuthSchemas — extracted from IIFE to fix hooks violation
// ---------------------------------------------------------------------------
function AuthSchemas({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [schemas, setSchemas] = React.useState<any[] | null>(null);
  const [selectedSchema, setSelectedSchema] = React.useState<any>(null);
  const [schemaDetail, setSchemaDetail] = React.useState<any>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  useEffect(() => {
    apiFetch(`${apiBaseUrl}/api/auth/schemas`).then(r => r.json()).then(data => {
      setSchemas(data.schemas || []);
    }).catch(() => setSchemas([]));
  }, [apiBaseUrl]);

  const loadSchema = (id: string) => {
    setLoadingDetail(true); setSelectedSchema(id);
    apiFetch(`${apiBaseUrl}/api/auth/schemas/${encodeURIComponent(id)}`).then(r => r.json()).then(data => {
      setSchemaDetail(data.schema || null); setLoadingDetail(false);
    }).catch(() => { setSchemaDetail(null); setLoadingDetail(false); });
  };

  const extractTraits = (schema: any): { name: string; type: string; format?: string; required: boolean }[] => {
    if (!schema?.properties?.traits?.properties) return [];
    const required = schema.properties.traits.required || [];
    return Object.entries(schema.properties.traits.properties).map(([name, prop]: [string, any]) => ({
      name, type: prop.type || "string", format: prop.format, required: required.includes(name),
    }));
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
      <h3 className="text-xs font-medium text-slate-200 mb-1">Identity Schemas</h3>
      <p className="text-[11px] text-slate-400 mb-3">Kratos identity schemas define user profile structure (email, name, phone, etc.).</p>
      {schemas === null ? (
        <div className="flex items-center justify-center h-20"><span className="truss-spinner" /></div>
      ) : schemas.length === 0 ? (
        <div className="rounded border border-dashed border-slate-700 p-4 text-center">
          <p className="text-xs text-slate-500">No schemas found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schemas.map((schema: any) => (
            <button key={schema.id} onClick={() => loadSchema(schema.id)} className={`w-full text-left rounded border p-3 transition-colors ${selectedSchema === schema.id ? "border-accent-600/50 bg-accent-600/10" : "border-slate-800 bg-slate-950/40 hover:bg-slate-800/30"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IdentificationCard size={15} weight="regular" className="text-accent-400" />
                  <span className="text-xs font-medium text-slate-200">{schema.id}</span>
                </div>
                {schema.id === "default" && <span className="rounded-full border border-accent-500/40 bg-accent-500/10 px-2 py-0.5 text-[9px] text-accent-300 font-medium">Default</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {selectedSchema && (
        <div className="mt-3 rounded border border-slate-800 bg-slate-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-slate-200">Schema: {selectedSchema}</h4>
            <button onClick={() => { setSelectedSchema(null); setSchemaDetail(null); }} className="text-[10px] text-slate-500 hover:text-slate-300">Close</button>
          </div>
          {loadingDetail ? (
            <div className="flex items-center justify-center h-20"><span className="truss-spinner" /></div>
          ) : schemaDetail ? (
            <>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Traits</p>
                <div className="rounded border border-slate-800 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead><tr className="border-b border-slate-800 bg-slate-950/60"><th className="text-left px-3 py-1.5 text-slate-500 font-medium">Name</th><th className="text-left px-3 py-1.5 text-slate-500 font-medium">Type</th><th className="text-left px-3 py-1.5 text-slate-500 font-medium">Format</th><th className="text-left px-3 py-1.5 text-slate-500 font-medium">Required</th></tr></thead>
                    <tbody>
                      {extractTraits(schemaDetail).map(trait => (
                        <tr key={trait.name} className="border-b border-slate-800/50">
                          <td className="px-3 py-1.5 text-slate-200 font-mono">{trait.name}</td>
                          <td className="px-3 py-1.5 text-slate-400">{trait.type}</td>
                          <td className="px-3 py-1.5 text-slate-400">{trait.format || "—"}</td>
                          <td className="px-3 py-1.5"><span className={`inline-block h-1.5 w-1.5 rounded-full ${trait.required ? "bg-emerald-400" : "bg-slate-600"}`} /></td>
                        </tr>
                      ))}
                      {extractTraits(schemaDetail).length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-center text-slate-500">No traits defined</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Raw Schema</p>
                <pre className="rounded bg-slate-950/60 border border-slate-800 p-3 text-[10px] text-slate-400 font-mono overflow-auto max-h-48">{JSON.stringify(schemaDetail, null, 2)}</pre>
              </div>
            </>
          ) : <p className="text-xs text-slate-500">Failed to load schema details.</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported panel render functions
// ---------------------------------------------------------------------------

export { PROVIDER_ICONS, defaultProviderIcon, ProvidersPanel, MfaPanel };

export function renderAuthMain(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, authIdentities, selectedUserIds, setSelectedUserIds, isBatchActionLoading, batchActionUsers, impersonateUser,
    authKratosHealthy, authProviders, authProvidersError, authSessions, authSessionsError, authSessionsNextToken,
    authSessionsPrevToken, authStats, authSecurityConfig, authUserSearch, authUsersError, authUsersInfo, authUsersNextToken, authUsersPrevToken,
    authView, billingRestrictions,
    copyText, createAuthUser, createSampleAuthUser,
    deleteAuthUser, deleteKetoTuple,
    fetchIntegrationsStatus, forceLogoutUser, integrationsStatus,
    isAuthSessionsLoading, isAuthUsersLoading, isCreatingAuthUser, isIdentityDetailLoading,
    isIntegrationsLoading, isResettingPassword,
    loadAuthProviders, loadAuthSessions, loadAuthStats, loadAuthSecurityConfig, loadAuthUsers,
    loadIdentityDetail, loadLoginHistory, loginHistory, loginHistoryTotal, loginHistoryOffset, isLoginHistoryLoading, loginHistoryFilter,
    setLoginHistoryFilter, loadAuditLogs,
    newAuthEmail, newAuthPassword, primaryNav,
    providerConfigs,
    resetPasswordId, resetPasswordValue, resetUserPassword, revokeAuthSession, extendAuthSession, sampleUserCredentials,
    sessionsSubTab, setSessionsSubTab,
    saveProviderConfig, selectedIdentityDetail, selectedIdentityId, setSelectedIdentityId, selectedIdentityTuples,
    setAssignNs, setAssignObj, setAssignRel, setAssignSearch, setAssignSubjectId,
    setAuthUserSearch, setAuthUserState, setAuthView,
    setImportError, setImportResult,
    setNewAuthEmail, setNewAuthPassword,
    setResetPasswordId, setResetPasswordValue,
    setShowAssignModal, showAuthPassword, setShowAuthPassword, setShowImportModal,
    setStorageObjectsInfo, setStorageObjectsError,
    banAuthUser, unbanAuthUser,
    auditLogs, auditLogsTotal, auditLogAction, setAuditLogAction, auditLogSearch, setAuditLogSearch,
    auditLogSince, setAuditLogSince, auditLogOffset, isAuditLogsLoading,
  } = s;

  if (primaryNav !== "authn") return null;

  const authHealthy = integrationsStatus?.auth.reachable === true;
  const authAdminHealthy = integrationsStatus?.auth.admin?.reachable === true;
  const totalIdentities = authIdentities?.length ?? 0;
  const activeSessions = authSessions?.filter((s: any) => s.active)?.length ?? 0;
  const totalProviders = authProviders?.filter((p: any) => p.configured)?.length ?? 0;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {authView === "overview" && (
        <div className="space-y-4">
          {/* Health bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-100">Authentication</h2>
            </div>
            <button onClick={fetchIntegrationsStatus} disabled={isIntegrationsLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              {isIntegrationsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Users size={13} weight="regular" /> Identities</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{totalIdentities}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Registered users</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Key size={13} weight="regular" /> Logins (24h)</div>
              <p className="mt-1 text-xl font-semibold text-slate-100">{authStats?.logins_24h ?? "—"}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{authStats?.logins_7d ?? 0} in last 7 days</p>
            </div>
            <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Warning size={13} weight="regular" /> Failed Logins</div>
              <p className={`mt-1 text-xl font-semibold ${(authStats?.failed_logins_24h ?? 0) > 0 ? "text-red-400" : "text-slate-100"}`}>{authStats?.failed_logins_24h ?? "—"}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">Last 24 hours</p>
            </div>
          </div>

          {/* Recent Activity */}
          {authStats?.recent_logins && authStats.recent_logins.length > 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recent Activity</h3>
              <div className="space-y-1">
                {authStats.recent_logins.slice(0, 5).map((login: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-[11px]">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${login.success ? "bg-emerald-400" : "bg-red-400"}`} />
                    <span className="text-slate-400 w-20 shrink-0">{login.created_at ? new Date(login.created_at).toLocaleTimeString() : "—"}</span>
                    <span className="text-slate-300 truncate">{parseUserAgent(login.user_agent)}</span>
                    <span className="text-slate-500 font-mono ml-auto shrink-0">{login.ip_address || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security Policy */}
          {authSecurityConfig && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Security Policy</h3>
                <button onClick={loadAuthSecurityConfig} className="text-[10px] text-slate-500 hover:text-slate-300"><ArrowsClockwise size={12} /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Password Policy */}
                <div className="rounded border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><LockKey size={14} /> Password Policy</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Breached password detection</span>
                      <span className={`flex items-center gap-1 ${authSecurityConfig.password?.haveibeenpwned_enabled ? "text-emerald-400" : "text-slate-500"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${authSecurityConfig.password?.haveibeenpwned_enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {authSecurityConfig.password?.haveibeenpwned_enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Minimum password length</span>
                      <span className="text-slate-300 font-mono">{authSecurityConfig.password?.min_length ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Identifier similarity check</span>
                      <span className={`flex items-center gap-1 ${authSecurityConfig.password?.identifier_similarity_check ? "text-emerald-400" : "text-slate-500"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${authSecurityConfig.password?.identifier_similarity_check ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {authSecurityConfig.password?.identifier_similarity_check ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                </div>
                {/* MFA & Auth Methods */}
                <div className="rounded border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Fingerprint size={14} /> Authentication Methods</div>
                  <div className="space-y-1.5">
                    {[
                      { label: "Password", key: "password" },
                      { label: "Passwordless (Email Code)", key: "code" },
                      { label: "Passkeys", key: "passkey" },
                      { label: "TOTP (Authenticator App)", key: "totp" },
                      { label: "Security Keys (WebAuthn)", key: "webauthn" },
                      { label: "Recovery Codes", key: "lookup_secret" },
                      { label: "Social Login (OIDC)", key: "oidc" },
                    ].map(({ label, key }) => {
                      const enabled = authSecurityConfig[key]?.enabled;
                      return (
                        <div key={key} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">{label}</span>
                          <span className={`flex items-center gap-1 ${enabled ? "text-emerald-400" : "text-slate-500"}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                            {enabled ? "On" : "Off"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Session & Account Security */}
                <div className="rounded border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Key size={14} /> Session & Recovery</div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Session lifetime</span>
                      <span className="text-slate-300 font-mono">{authSecurityConfig.session?.lifespan ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">MFA enforcement</span>
                      <span className={`flex items-center gap-1 ${authSecurityConfig.mfa_enforcement === "highest_available" ? "text-emerald-400" : "text-slate-500"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${authSecurityConfig.mfa_enforcement === "highest_available" ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {authSecurityConfig.mfa_enforcement === "highest_available" ? "Required (highest)" : authSecurityConfig.mfa_enforcement || "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Email verification</span>
                      <span className={`flex items-center gap-1 ${authSecurityConfig.verification?.enabled ? "text-emerald-400" : "text-slate-500"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${authSecurityConfig.verification?.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {authSecurityConfig.verification?.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Account recovery</span>
                      <span className={`flex items-center gap-1 ${authSecurityConfig.recovery?.enabled ? "text-emerald-400" : "text-slate-500"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${authSecurityConfig.recovery?.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                        {authSecurityConfig.recovery?.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Account enumeration protection</span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Enabled
                      </span>
                    </div>
                  </div>
                </div>
                {/* Social Providers summary */}
                {authSecurityConfig.oidc?.providers?.length > 0 && (
                  <div className="rounded border border-slate-700/50 bg-slate-800/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-200"><Plug size={14} /> Social Providers</div>
                    <div className="flex flex-wrap gap-1.5">
                      {authSecurityConfig.oidc.providers.map((p: string) => (
                        <span key={p} className="rounded bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-300 capitalize">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
      {authView === "users" && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm text-slate-100">Users</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={createSampleAuthUser}
              className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                <Flask size={15} />
                Fill Sample User
              </button>
              <button
                onClick={() => { setShowImportModal(true); setImportResult(null); setImportError(""); }}
                className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                <FileArrowUp size={15} />
                Import
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${apiBaseUrl}/api/auth/users/export?format=csv`, { credentials: "include" });
                    if (!res.ok) throw new Error("Export failed");
                    const csv = await res.text();
                    downloadFile(`truss-users-${new Date().toISOString().slice(0,10)}.csv`, csv, "text/csv");
                  } catch { /* ignore */ }
                }}
                className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                <DownloadSimple size={15} />
                Export
              </button>
              <button
                onClick={loadAuthUsers}
                disabled={isAuthUsersLoading}
                className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAuthUsersLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                {isAuthUsersLoading ? "Loading..." : "Refresh Users"}
              </button>
            </div>
          </div>

          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <input
              value={newAuthEmail}
              onChange={(event) => setNewAuthEmail(event.target.value)}
              placeholder="user@email.com"
              className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
            />
            <div className="flex items-stretch overflow-hidden rounded border border-slate-700 bg-slate-950">
              <input
                type={showAuthPassword ? "text" : "password"}
                value={newAuthPassword}
                onChange={(event) => setNewAuthPassword(event.target.value)}
                placeholder="password (min 8 chars)"
                className="flex-1 bg-transparent px-3 py-2 text-xs text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowAuthPassword((prev: boolean) => !prev)}
                className="border-l border-slate-700 px-3 text-xs text-slate-300 hover:bg-slate-900"
                title={showAuthPassword ? "Hide password" : "Show password"}
              >
                {showAuthPassword ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={createAuthUser}
              disabled={isCreatingAuthUser || (!billingRestrictions.shadow && billingRestrictions.auth)}
              title={billingRestrictions.auth ? (billingRestrictions.shadow ? "Auth MAU limit reached (shadow mode — not blocking)." : "Auth MAU limit reached. Upgrade your plan to add more users.") : ""}
              className="truss-btn rounded border border-accent-400/60 bg-accent-400/10 px-3 py-2 text-xs text-accent-200 hover:bg-accent-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreatingAuthUser ? <span className="truss-spinner" /> : <Plus size={15} />}
              {isCreatingAuthUser ? "Creating..." : "Create User"}
            </button>
          </div>

          {sampleUserCredentials && (
            <p className="mb-2 text-xs text-slate-400">Sample credentials: {sampleUserCredentials}</p>
          )}
          {authUsersInfo && <p className="mb-2 text-xs text-emerald-300">{authUsersInfo}</p>}
          {authUsersError && <p className="mb-3 text-xs text-amber-300">{authUsersError}</p>}

          {/* User search — server-side via Kratos credentials_identifier */}
          <div className="relative mb-3">
            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={authUserSearch}
              onChange={e => setAuthUserSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadAuthUsers(undefined, authUserSearch || undefined); }}
              placeholder="Search by email and press Enter..."
              className="w-full rounded border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-20 text-xs text-slate-200 placeholder:text-slate-600"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {authUserSearch && (
                <button onClick={() => { setAuthUserSearch(""); loadAuthUsers(); }} className="text-slate-500 hover:text-slate-300 text-[10px]">Clear</button>
              )}
              <button
                onClick={() => loadAuthUsers(undefined, authUserSearch || undefined)}
                disabled={isAuthUsersLoading}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
              >
                Search
              </button>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedUserIds.size > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded border border-accent-600/30 bg-accent-600/5 px-3 py-2">
              <span className="text-xs text-accent-200">{selectedUserIds.size} selected</span>
              <button onClick={() => batchActionUsers("deactivate")} disabled={isBatchActionLoading} className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                <Pause size={13} /> Deactivate
              </button>
              <button onClick={() => batchActionUsers("activate")} disabled={isBatchActionLoading} className="truss-btn rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                <Play size={13} /> Activate
              </button>
              <button onClick={() => batchActionUsers("delete")} disabled={isBatchActionLoading} className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/30 disabled:opacity-50">
                <Trash size={13} /> Delete
              </button>
              <button onClick={() => setSelectedUserIds(new Set())} className="ml-auto text-[11px] text-slate-400 hover:text-slate-200">Clear</button>
              {isBatchActionLoading && <span className="truss-spinner" />}
            </div>
          )}

          {/* Select all toggle */}
          {authIdentities.length > 0 && (
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={authIdentities.length > 0 && selectedUserIds.size === authIdentities.length}
                onChange={e => {
                  if (e.target.checked) setSelectedUserIds(new Set(authIdentities.map((i: any) => i.id)));
                  else setSelectedUserIds(new Set());
                }}
                className="rounded border-slate-600"
              />
              <span className="text-[11px] text-slate-500">Select all on this page</span>
            </div>
          )}

          <div className="space-y-2">
            {(() => {
              return authIdentities.length === 0 ? (
                <p className="text-xs text-slate-400">{authUserSearch ? `No users matching "${authUserSearch}".` : "No users yet. Users will appear here after their first login."}</p>
              ) : (
              authIdentities.map((identity: any) => {
                const email =
                  typeof identity.traits?.email === "string"
                    ? identity.traits.email
                    : typeof identity.traits?.username === "string"
                      ? identity.traits.username
                      : "No email/username trait";
                const state = identity.state || "active";
                const isSelected = selectedIdentityId === identity.id;
                const initial = (email[0] || "?").toUpperCase();
                const createdAt = identity.created_at ? new Date(identity.created_at) : null;
                const timeAgo = createdAt ? (() => {
                  const diff = Date.now() - createdAt.getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 60) return `${mins}m ago`;
                  const hrs = Math.floor(mins / 60);
                  if (hrs < 24) return `${hrs}h ago`;
                  const days = Math.floor(hrs / 24);
                  if (days < 30) return `${days}d ago`;
                  return createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                })() : "—";
                return (
                  <div key={identity.id}>
                  <div
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${isSelected ? "border-accent-500/40 bg-accent-500/5" : "border-slate-800 bg-slate-950 hover:bg-slate-900/80 hover:border-slate-700"}`}
                    onClick={() => isSelected ? setSelectedIdentityId(null) : loadIdentityDetail(identity.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(identity.id)}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const next = new Set(selectedUserIds);
                        if (e.target.checked) next.add(identity.id); else next.delete(identity.id);
                        setSelectedUserIds(next);
                      }}
                      className="rounded border-slate-600 shrink-0"
                    />
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-bold text-accent-300">
                      {initial}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-200">{email}</p>
                      <p className="truncate text-[10px] font-mono text-slate-500">{identity.id.slice(0, 16)}...</p>
                    </div>
                    {/* State chip */}
                    {(() => {
                      const isBanned = !!(identity.metadata_admin as any)?.banned;
                      if (isBanned) return (
                        <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium shrink-0 text-red-300">
                          <Prohibit size={10} /> Banned
                        </span>
                      );
                      return (
                        <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0 ${state === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${state === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
                          {state === "active" ? "Active" : "Inactive"}
                        </span>
                      );
                    })()}
                    {/* Created */}
                    <span className="text-[10px] text-slate-500 shrink-0 w-16 text-right">{timeAgo}</span>
                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {(identity.metadata_admin as any)?.banned ? (
                        <button onClick={() => unbanAuthUser(identity.id)} title="Unban" className="rounded p-1 text-red-400 hover:bg-emerald-950/30 hover:text-emerald-400">
                          <Play size={14} />
                        </button>
                      ) : state === "active" ? (
                        <>
                          <button onClick={() => banAuthUser(identity.id)} title="Ban" className="rounded p-1 text-slate-500 hover:bg-red-950/30 hover:text-red-400">
                            <Prohibit size={14} />
                          </button>
                          <button onClick={() => setAuthUserState(identity.id, "inactive")} title="Deactivate" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
                            <Pause size={14} />
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setAuthUserState(identity.id, "active")} title="Activate" className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
                          <Play size={14} />
                        </button>
                      )}
                      <button onClick={() => deleteAuthUser(identity.id)} title="Delete" className="rounded p-1 text-slate-500 hover:bg-red-950/30 hover:text-red-400">
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  {/* User detail panel */}
                  {isSelected && (
                    <div className="mt-1 rounded border border-slate-700 bg-slate-900/60 p-3">
                      {isIdentityDetailLoading ? (
                        <div className="flex items-center gap-2 py-4 text-xs text-slate-400"><span className="truss-spinner" /> Loading identity detail...</div>
                      ) : selectedIdentityDetail ? (
                        <div className="space-y-3">
                          {/* Traits */}
                          <div>
                            <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Traits</p>
                            <div className="rounded border border-slate-800 bg-slate-950 p-2 font-mono text-[11px] text-slate-300">
                              {Object.entries(selectedIdentityDetail.identity.traits || {}).map(([k, v]) => (
                                <div key={k}><span className="text-slate-500">{k}:</span> {String(v)}</div>
                              ))}
                            </div>
                          </div>
                          {/* Metadata */}
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div><span className="text-slate-500">State:</span> <span className={`font-medium ${state === "active" ? "text-emerald-400" : "text-red-400"}`}>{state}</span></div>
                            <div><span className="text-slate-500">Created:</span> <span className="text-slate-300">{identity.created_at ? new Date(identity.created_at).toLocaleString() : "—"}</span></div>
                            <div><span className="text-slate-500">Updated:</span> <span className="text-slate-300">{identity.updated_at ? new Date(identity.updated_at).toLocaleString() : "—"}</span></div>
                            <div><span className="text-slate-500">ID:</span> <span className="text-slate-300 font-mono text-[10px]">{identity.id}</span></div>
                          </div>
                          {/* Verifiable addresses */}
                          {selectedIdentityDetail.identity.verifiable_addresses && selectedIdentityDetail.identity.verifiable_addresses.length > 0 && (
                            <div>
                              <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Verifiable Addresses</p>
                              {selectedIdentityDetail.identity.verifiable_addresses.map((addr: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-[11px]">
                                  <span className="text-slate-300">{addr.value}</span>
                                  <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${addr.verified ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>
                                    {addr.verified ? "verified" : addr.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Public & Admin Metadata */}
                          <div>
                            <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Metadata</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[9px] uppercase tracking-wide text-slate-500">Public</label>
                                <textarea
                                  defaultValue={JSON.stringify(selectedIdentityDetail.identity.metadata_public || {}, null, 2)}
                                  id={`meta-public-${identity.id}`}
                                  rows={3}
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
                                  placeholder="{}"
                                />
                              </div>
                              <div>
                                <label className="text-[9px] uppercase tracking-wide text-slate-500">Admin</label>
                                <textarea
                                  defaultValue={JSON.stringify(selectedIdentityDetail.identity.metadata_admin || {}, null, 2)}
                                  id={`meta-admin-${identity.id}`}
                                  rows={3}
                                  className="mt-0.5 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
                                  placeholder="{}"
                                />
                              </div>
                            </div>
                            <button
                              onClick={async () => {
                                const pubEl = document.getElementById(`meta-public-${identity.id}`) as HTMLTextAreaElement;
                                const admEl = document.getElementById(`meta-admin-${identity.id}`) as HTMLTextAreaElement;
                                try {
                                  const pub = JSON.parse(pubEl.value || "{}");
                                  const adm = JSON.parse(admEl.value || "{}");
                                  const res = await apiFetch(`${apiBaseUrl}/api/auth/identities/${identity.id}/metadata`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ metadata_public: pub, metadata_admin: adm }),
                                  });
                                  if (res.ok) loadIdentityDetail(identity.id);
                                } catch { /* ignore parse errors */ }
                              }}
                              className="mt-1 truss-btn rounded border border-accent-500/40 bg-accent-500/10 px-2 py-0.5 text-[10px] text-accent-200 hover:bg-accent-500/20"
                            >
                              Save Metadata
                            </button>
                          </div>
                          {/* Active sessions */}
                          <div>
                            <p className="mb-1 text-[10px] uppercase tracking-widest text-slate-500">Active Sessions ({selectedIdentityDetail.sessions?.length || 0})</p>
                            {(selectedIdentityDetail.sessions?.length || 0) === 0 ? (
                              <p className="text-[10px] text-slate-500 italic">No active sessions</p>
                            ) : (
                              <div className="space-y-1">
                                {selectedIdentityDetail.sessions.map((sess: any) => (
                                  <div key={sess.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">
                                    <span className="text-slate-400 font-mono">{sess.id.slice(0, 12)}...</span>
                                    <span className="text-slate-500">{sess.authenticated_at ? new Date(sess.authenticated_at).toLocaleString() : "—"}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Admin Actions */}
                          <div className="flex items-center gap-2">
                            {resetPasswordId === identity.id ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="password"
                                  value={resetPasswordValue}
                                  onChange={e => setResetPasswordValue(e.target.value)}
                                  placeholder="New password (min 8 chars)"
                                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 w-48"
                                />
                                <button
                                  onClick={() => resetUserPassword(identity.id, resetPasswordValue)}
                                  disabled={isResettingPassword || resetPasswordValue.length < 8}
                                  className="truss-btn rounded border border-accent-600/50 bg-accent-600/10 px-2 py-1 text-[10px] text-accent-300 hover:bg-accent-600/20 disabled:opacity-40"
                                >
                                  {isResettingPassword ? <span className="truss-spinner" /> : "Set"}
                                </button>
                                <button onClick={() => { setResetPasswordId(null); setResetPasswordValue(""); }} className="text-[10px] text-slate-500 hover:text-slate-300">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setResetPasswordId(identity.id)}
                                className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                              >
                                <Key size={11} /> Reset Password
                              </button>
                            )}
                            <button
                              onClick={() => forceLogoutUser(identity.id)}
                              disabled={(selectedIdentityDetail?.sessions?.length || 0) === 0}
                              className="truss-btn rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-30"
                              title={(selectedIdentityDetail?.sessions?.length || 0) === 0 ? "No active sessions" : "Revoke all sessions"}
                            >
                              <SignOut size={11} /> Force Logout
                            </button>
                            <button
                              onClick={() => impersonateUser(identity.id)}
                              className="truss-btn rounded border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/10"
                              title="Create a session as this user (admin impersonation)"
                            >
                              <User size={11} /> Impersonate
                            </button>
                          </div>
                          {/* Email actions */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={async () => {
                                try {
                                  const r = await apiFetch(`${apiBaseUrl}/api/auth/identities/${identity.id}/send-verification`, { method: "POST" });
                                  const d = await r.json();
                                  if (d.ok) alert(d.message || "Verification email sent");
                                  else alert(d.error || "Failed");
                                } catch { /* */ }
                              }}
                              className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                              title="Send verification email to this user"
                            >
                              <CheckCircle size={11} /> Send Verification
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const r = await apiFetch(`${apiBaseUrl}/api/auth/identities/${identity.id}/send-recovery`, { method: "POST" });
                                  const d = await r.json();
                                  if (d.ok) alert(d.message || "Recovery email sent");
                                  else alert(d.error || "Failed");
                                } catch { /* */ }
                              }}
                              className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                              title="Send password recovery email"
                            >
                              <LockKey size={11} /> Send Recovery
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const r = await apiFetch(`${apiBaseUrl}/api/auth/identities/${identity.id}/create-recovery-link`, { method: "POST" });
                                  const d = await r.json();
                                  if (d.recovery_link) {
                                    await navigator.clipboard.writeText(d.recovery_link);
                                    alert("Recovery link copied to clipboard (expires in 1h)");
                                  } else alert(d.error || "Failed to create link");
                                } catch { /* */ }
                              }}
                              className="truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                              title="Generate a one-time recovery link (copied to clipboard)"
                            >
                              <LinkSimple size={11} /> Recovery Link
                            </button>
                          </div>
                          {/* AuthZ roles (Keto tuples for this user) */}
                          <div>
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500">Permissions (AuthZ)</p>
                              <button
                                onClick={() => { setShowAssignModal(true); setAssignSubjectId(identity.id); setAssignSearch(email); }}
                                className="truss-btn rounded border border-accent-600/40 px-2 py-0.5 text-[10px] text-accent-300 hover:bg-accent-600/10"
                              >
                                <Plus size={10} /> Assign Role
                              </button>
                            </div>
                            {selectedIdentityTuples.length === 0 ? (
                              <p className="text-[10px] text-slate-500 italic">No permissions assigned</p>
                            ) : (
                              <div className="space-y-1">
                                {selectedIdentityTuples.map((t: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[10px]">
                                    <span>
                                      <span className="text-slate-400">{t.namespace}</span>
                                      <span className="text-slate-600">:</span>
                                      <span className="text-slate-200">{t.object}</span>
                                      <span className="text-slate-600"> # </span>
                                      <span className="rounded bg-slate-800 px-1 py-0.5 text-accent-400">{t.relation}</span>
                                    </span>
                                    <button onClick={() => deleteKetoTuple(t).then(() => loadIdentityDetail(identity.id))} className="text-slate-500 hover:text-red-400"><Trash size={11} /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Failed to load identity detail.</p>
                      )}
                    </div>
                  )}
                  </div>
                );
              })
              );
            })()}
          </div>

          {/* Pagination */}
          {(authUsersPrevToken || authUsersNextToken) && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
              <p className="text-[11px] text-slate-500">
                Showing {authIdentities.length} user{authIdentities.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadAuthUsers(authUsersPrevToken || undefined)}
                  disabled={!authUsersPrevToken || isAuthUsersLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => loadAuthUsers(authUsersNextToken || undefined)}
                  disabled={!authUsersNextToken || isAuthUsersLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {authView === "providers" && (
        <ProvidersPanel
          authProviders={authProviders}
          authProvidersError={authProvidersError}
          authKratosHealthy={authKratosHealthy}
          providerConfigs={providerConfigs}
          loadAuthProviders={loadAuthProviders}
          saveProviderConfig={saveProviderConfig}
          copyText={copyText}
          setStorageObjectsInfo={setStorageObjectsInfo}
          setStorageObjectsError={setStorageObjectsError}
        />
      )}
      {authView === "sessions" && (
        <div className="mt-4 space-y-4">
          {/* Sub-tab bar */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
            <button
              onClick={() => setSessionsSubTab("active")}
              className={`rounded-t px-3 py-1.5 text-xs font-medium ${sessionsSubTab === "active" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
            >
              Active Sessions
            </button>
            <button
              onClick={() => { setSessionsSubTab("history"); if (loginHistory.length === 0) loadLoginHistory(0, loginHistoryFilter); }}
              className={`rounded-t px-3 py-1.5 text-xs font-medium ${sessionsSubTab === "history" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
            >
              Login History
            </button>
          </div>

          {/* Active Sessions Tab */}
          {sessionsSubTab === "active" && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm text-slate-100">Active Sessions</h3>
                <button
                  onClick={loadAuthSessions}
                  disabled={isAuthSessionsLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAuthSessionsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                  {isAuthSessionsLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              {authSessionsError && <p className="mb-3 text-xs text-amber-300">{authSessionsError}</p>}
              {authSessions.length === 0 ? (
                <p className="text-xs text-slate-400">No active sessions. Users will appear here when they log in.</p>
              ) : (
                <div className="space-y-2">
                  {authSessions.map((session: any) => {
                    const email =
                      typeof session.identity?.traits?.email === "string"
                        ? session.identity.traits.email
                        : typeof session.identity?.traits?.username === "string"
                          ? session.identity.traits.username
                          : session.identity?.id || "Unknown identity";
                    const authTime = session.authenticated_at ? new Date(session.authenticated_at) : null;
                    const timeAgo = authTime ? (() => {
                      const diff = Date.now() - authTime.getTime();
                      const mins = Math.floor(diff / 60000);
                      if (mins < 60) return `${mins}m ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      const days = Math.floor(hrs / 24);
                      return `${days}d ago`;
                    })() : "—";
                    const initial = (email[0] || "?").toUpperCase();
                    const devices = session.devices || [];
                    const deviceInfo = devices.length > 0 ? parseUserAgent(devices[0].user_agent || "") : null;
                    return (
                      <div
                        key={session.id}
                        className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2.5"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-xs font-bold text-accent-300">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-slate-200">{email}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span className="font-mono">{session.id.slice(0, 12)}...</span>
                            {deviceInfo && <><span className="text-slate-600">|</span><span>{deviceInfo}</span></>}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">{timeAgo}</span>
                        <button
                          onClick={() => extendAuthSession(session.id)}
                          title="Extend session"
                          className="truss-btn ml-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 shrink-0"
                        >
                          <ClockCounterClockwise size={13} />
                          Extend
                        </button>
                        <button
                          onClick={() => revokeAuthSession(session.id)}
                          className="truss-btn rounded border border-red-400/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-400/10 shrink-0"
                        >
                          <Prohibit size={13} />
                          Revoke
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {(authSessionsPrevToken || authSessionsNextToken) && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-500">Showing {authSessions.length} session{authSessions.length !== 1 ? "s" : ""}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => loadAuthSessions(authSessionsPrevToken || undefined)} disabled={!authSessionsPrevToken || isAuthSessionsLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                    <button onClick={() => loadAuthSessions(authSessionsNextToken || undefined)} disabled={!authSessionsNextToken || isAuthSessionsLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Login History Tab */}
          {sessionsSubTab === "history" && (
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm text-slate-100">Login History</h3>
                <div className="flex items-center gap-2">
                  {/* Filter */}
                  <div className="flex items-center rounded border border-slate-700 text-[11px]">
                    {(["all", "success", "failed"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => { setLoginHistoryFilter(f); loadLoginHistory(0, f); }}
                        className={`px-2.5 py-1 capitalize ${loginHistoryFilter === f ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => loadLoginHistory(loginHistoryOffset, loginHistoryFilter)}
                    disabled={isLoginHistoryLoading}
                    className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isLoginHistoryLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
                    Refresh
                  </button>
                </div>
              </div>
              {isLoginHistoryLoading && loginHistory.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-xs text-slate-400"><span className="truss-spinner" /> Loading login history...</div>
              ) : loginHistory.length === 0 ? (
                <p className="text-xs text-slate-400">No login history found.</p>
              ) : (
                <div className="space-y-1">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_1fr_120px_140px_60px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Time</span><span>User</span><span>IP</span><span>Browser / OS</span><span>Status</span>
                  </div>
                  {loginHistory.map((entry: any) => (
                    <div key={entry.id} className="grid grid-cols-[1fr_1fr_120px_140px_60px] gap-2 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-[11px]">
                      <span className="text-slate-400 truncate">{entry.created_at ? new Date(entry.created_at).toLocaleString() : "—"}</span>
                      <span className="text-slate-200 truncate font-mono">{entry.identity_id ? entry.identity_id.slice(0, 12) + "..." : "—"}</span>
                      <span className="text-slate-400 truncate font-mono">{entry.ip_address || "—"}</span>
                      <span className="text-slate-400 truncate">{parseUserAgent(entry.user_agent)}</span>
                      <span className="flex items-center gap-1">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${entry.success ? "bg-emerald-400" : "bg-red-400"}`} />
                        <span className={entry.success ? "text-emerald-300" : "text-red-300"}>{entry.success ? "OK" : "Fail"}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Pagination */}
              {loginHistoryTotal > 50 && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                  <p className="text-[11px] text-slate-500">
                    Showing {loginHistoryOffset + 1}–{Math.min(loginHistoryOffset + 50, loginHistoryTotal)} of {loginHistoryTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadLoginHistory(Math.max(0, loginHistoryOffset - 50), loginHistoryFilter)}
                      disabled={loginHistoryOffset === 0 || isLoginHistoryLoading}
                      className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >Previous</button>
                    <button
                      onClick={() => loadLoginHistory(loginHistoryOffset + 50, loginHistoryFilter)}
                      disabled={loginHistoryOffset + 50 >= loginHistoryTotal || isLoginHistoryLoading}
                      className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                    >Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {authView === "security" && <MfaPanel apiBaseUrl={apiBaseUrl} />}
      {authView === "audit-logs" && (
        <div className="mt-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-slate-100">Audit Logs</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">Auth events and admin actions timeline. {auditLogsTotal > 0 && `${auditLogsTotal} total entries.`}</p>
            </div>
            <button
              onClick={() => loadAuditLogs({ action: auditLogAction, search: auditLogSearch, since: auditLogSince, offset: 0 })}
              disabled={isAuditLogsLoading}
              className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAuditLogsLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={15} />}
              Refresh
            </button>
          </div>

          {/* Filter bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={auditLogAction}
              onChange={e => { setAuditLogAction(e.target.value); loadAuditLogs({ action: e.target.value, search: auditLogSearch, since: auditLogSince, offset: 0 }); }}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="">All actions</option>
              {["user.created", "user.deleted", "user.deactivated", "user.activated", "password.reset",
                "session.revoked", "provider.configured", "api_key.created", "api_key.revoked",
                "webhook.created", "webhook.deleted", "bucket.created", "bucket.deleted"].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <input
              value={auditLogSearch}
              onChange={e => setAuditLogSearch(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") loadAuditLogs({ action: auditLogAction, search: auditLogSearch, since: auditLogSince, offset: 0 }); }}
              placeholder="Search actor or resource..."
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 w-44"
            />
            <div className="flex items-center rounded border border-slate-700 text-[11px]">
              {[
                { label: "24h", value: new Date(Date.now() - 86400000).toISOString() },
                { label: "7d", value: new Date(Date.now() - 7 * 86400000).toISOString() },
                { label: "30d", value: new Date(Date.now() - 30 * 86400000).toISOString() },
                { label: "All", value: "" },
              ].map(p => (
                <button
                  key={p.label}
                  onClick={() => { setAuditLogSince(p.value); loadAuditLogs({ action: auditLogAction, search: auditLogSearch, since: p.value, offset: 0 }); }}
                  className={`px-2.5 py-1 ${auditLogSince === p.value ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {auditLogs.length === 0 ? (
            <p className="text-xs text-slate-500">No audit log entries found.</p>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 rounded border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    String(log.action).includes("delete") || String(log.action).includes("revoke") ? "bg-red-400" :
                    String(log.action).includes("create") ? "bg-emerald-400" :
                    "bg-slate-500"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200">{String(log.action)}</span>
                      {log.resource_type && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{String(log.resource_type)}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{String(log.actor || "system")}</span>
                      <span>•</span>
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      {log.resource_id && <><span>•</span><span className="truncate font-mono">{String(log.resource_id)}</span></>}
                    </div>
                    {log.payload && Object.keys(log.payload).length > 0 && (
                      <pre className="mt-1 max-h-20 overflow-auto text-[10px] text-slate-500">{JSON.stringify(log.payload, null, 2)}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {auditLogsTotal > 50 && (
            <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
              <p className="text-[11px] text-slate-500">
                Showing {auditLogOffset + 1}–{Math.min(auditLogOffset + 50, auditLogsTotal)} of {auditLogsTotal}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadAuditLogs({ action: auditLogAction, search: auditLogSearch, since: auditLogSince, offset: Math.max(0, auditLogOffset - 50) })}
                  disabled={auditLogOffset === 0 || isAuditLogsLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >Previous</button>
                <button
                  onClick={() => loadAuditLogs({ action: auditLogAction, search: auditLogSearch, since: auditLogSince, offset: auditLogOffset + 50 })}
                  disabled={auditLogOffset + 50 >= auditLogsTotal || isAuditLogsLoading}
                  className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Developer Tab ── */}
      {authView === "developer" && (
        <div className="space-y-4">
          <DeveloperSDK
            title="SDK & Code Snippets"
            description="Ready-to-use code for common authentication flows."
            editorTheme={s.editorTheme}
            module="auth"
            placeholders={{ kratosUrl: s.integrationsStatus?.auth?.publicUrl || `${apiBaseUrl}/api/auth` }}
          />
          <AuthWebhooks apiBaseUrl={apiBaseUrl} />
          <AuthTemplates apiBaseUrl={apiBaseUrl} />
          <AuthSchemas apiBaseUrl={apiBaseUrl} />
        </div>
      )}


    </div>
  );
}

export function renderAuthPaneB(s: any): React.JSX.Element | null {
  const {
    authView, authIdentities, authSessions, auditLogsTotal,
    setAuthView, primaryNav, loadAuditLogs,
  } = s;
  if (primaryNav !== "authn") return null;

  const authNavItems: Array<{ id: import("../types").AuthView; icon: React.ReactNode; label: string; badge?: React.ReactNode; onClick?: () => void }> = [
    { id: "overview", icon: <ShieldCheck size={18} weight="regular" />, label: "Overview" },
    { id: "users", icon: <Users size={18} weight="regular" />, label: "Users", badge: authIdentities.length > 0 ? <span className="ml-auto rounded-full bg-slate-800 px-1.5 text-[9px] tabular-nums text-slate-500">{authIdentities.length}</span> : undefined },
    { id: "providers", icon: <Plug size={18} weight="regular" />, label: "Providers" },
    { id: "sessions", icon: <IdentificationCard size={18} weight="regular" />, label: "Sessions", badge: authSessions?.length > 0 ? <span className="ml-auto rounded-full bg-slate-800 px-1.5 text-[9px] tabular-nums text-slate-500">{authSessions.filter((ss: any) => ss.active).length}</span> : undefined },
    { id: "security", icon: <Fingerprint size={18} weight="regular" />, label: "Security" },
    { id: "developer", icon: <Code size={18} weight="regular" />, label: "Developer" },
    { id: "audit-logs", icon: <ClipboardText size={18} weight="regular" />, label: "Audit Logs", badge: auditLogsTotal > 0 ? <span className="ml-auto rounded-full bg-slate-800 px-1.5 text-[9px] tabular-nums text-slate-500">{auditLogsTotal > 99 ? "99+" : auditLogsTotal}</span> : undefined, onClick: () => { setAuthView("audit-logs"); loadAuditLogs(); } },
  ];

  return (
    <div className="space-y-2">
      {authNavItems.map(item => (
        <button
          key={item.id}
          onClick={item.onClick || (() => setAuthView(item.id))}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            authView === item.id
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-1.5 w-full">
            {item.icon}
            {item.label}
            {item.badge}
          </span>
        </button>
      ))}
    </div>
  );
}
