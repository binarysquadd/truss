// DeveloperSDK.tsx — Shared SDK code reference component for Developer tabs
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from "react";
import { LazyEditor as Editor } from "../LazyEditor";
import { handleEditorWillMount, trussEditorOptions } from "../editorConfig";
import { ClipboardText, Check } from "@phosphor-icons/react";
import { apiFetch, getApiBaseUrl } from "../types";

export type SDKLang = "js" | "python" | "go" | "curl";

export interface SDKSnippetConfig {
  /** Label shown in the snippet selector */
  label: string;
  /** Code per language */
  code: Record<SDKLang, string>;
}

export interface DeveloperSDKProps {
  /** Panel title, e.g. "Authorization SDK" */
  title: string;
  /** Short description */
  description: string;
  /** Monaco theme name */
  editorTheme: string;
  /** Editor height (default 280px) */
  editorHeight?: string;
  /** Module name for lazy-loading snippets from API (new approach) */
  module?: string;
  /** URL placeholder replacements, e.g. { baseUrl: "http://...", kratosUrl: "..." } */
  placeholders?: Record<string, string>;
  /** Inline snippet configs (legacy — ignored when module is set) */
  snippets?: Record<string, SDKSnippetConfig>;
}

const langLabels: Record<SDKLang, string> = { js: "JavaScript", python: "Python", go: "Go", curl: "cURL" };

function langToMonaco(lang: SDKLang): string {
  if (lang === "js") return "javascript";
  if (lang === "curl") return "shell";
  return lang;
}

// ─── In-memory snippet cache (survives re-renders, cleared on page reload) ──
const snippetCache: Record<string, any> = {};

/** Replace {{placeholder}} tokens in all code strings */
function applyPlaceholders(snippets: Record<string, SDKSnippetConfig>, replacements: Record<string, string>): Record<string, SDKSnippetConfig> {
  const result: Record<string, SDKSnippetConfig> = {};
  for (const [key, snip] of Object.entries(snippets)) {
    const code: Record<string, string> = {};
    for (const [lang, src] of Object.entries(snip.code)) {
      let replaced = src as string;
      for (const [placeholder, value] of Object.entries(replacements)) {
        replaced = replaced.replaceAll(`{{${placeholder}}}`, value);
      }
      code[lang] = replaced;
    }
    result[key] = { label: snip.label, code: code as Record<SDKLang, string> };
  }
  return result;
}

/** Hook to lazy-load SDK snippets from the backend */
export function useSDKSnippets(module: string, placeholders?: Record<string, string>): { snippets: Record<string, SDKSnippetConfig> | null; loading: boolean; extras: any } {
  const [data, setData] = useState<any>(snippetCache[module] || null);
  const [loading, setLoading] = useState(!snippetCache[module]);
  const fetched = useRef(false);

  useEffect(() => {
    if (module === "__noop__") { setLoading(false); return; }
    if (snippetCache[module]) {
      setData(snippetCache[module]);
      setLoading(false);
      return;
    }
    if (fetched.current) return;
    fetched.current = true;

    apiFetch(`${getApiBaseUrl()}/api/config/sdk-snippets/${module}`)
      .then(r => r.json())
      .then(json => {
        snippetCache[module] = json;
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [module]);

  const snippets = data?.snippets
    ? applyPlaceholders(data.snippets, placeholders || {})
    : null;

  // Return extras (oplTemplates, ruleTemplates, handlerSections) untouched
  const extras = data ? { ...data } : {};
  delete extras.snippets;

  return { snippets, loading, extras };
}

function SnippetSkeleton() {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-4 animate-pulse">
      <div className="h-3 w-40 bg-slate-700 rounded mb-2" />
      <div className="h-2.5 w-64 bg-slate-800 rounded mb-4" />
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-6 w-20 bg-slate-800 rounded" />)}
      </div>
      <div className="flex gap-2 mb-3">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-5 w-16 bg-slate-800/50 rounded" />)}
      </div>
      <div className="h-[280px] bg-slate-950 rounded border border-slate-700" />
    </div>
  );
}

function SDKSnippetViewer({ snippets, editorTheme, editorHeight = "280px", title, description }: {
  snippets: Record<string, SDKSnippetConfig>;
  editorTheme: string;
  editorHeight?: string;
  title: string;
  description: string;
}) {
  const snippetKeys = Object.keys(snippets);
  const [activeSnippet, setActiveSnippet] = useState(snippetKeys[0] || "");
  const [lang, setLang] = useState<SDKLang>("js");
  const [copied, setCopied] = useState(false);

  const code = snippets[activeSnippet]?.code[lang] || "// Not available for this language";

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-slate-200">{title}</h3>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          {copied ? <Check size={12} /> : <ClipboardText size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">{description}</p>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {snippetKeys.map(key => (
          <button
            key={key}
            onClick={() => setActiveSnippet(key)}
            className={`rounded border px-2 py-1 text-[10px] ${activeSnippet === key ? "border-accent-500/40 bg-accent-500/10 text-accent-300" : "border-slate-700 bg-slate-950 text-slate-400 hover:bg-slate-900"}`}
          >
            {snippets[key].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3">
        {(Object.entries(langLabels) as [SDKLang, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setLang(key)}
            className={`rounded px-2 py-0.5 text-[10px] ${lang === key ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded border border-slate-700 bg-slate-950 overflow-hidden">
        <Editor
          height={editorHeight}
          language={langToMonaco(lang)}
          theme={editorTheme}
          value={code}
          options={{ ...trussEditorOptions, readOnly: true, minimap: { enabled: false }, lineNumbers: "on", fontSize: 12, scrollBeyondLastLine: false }}
          beforeMount={handleEditorWillMount}
        />
      </div>
    </div>
  );
}

export function DeveloperSDK({ title, description, module, placeholders, snippets: inlineSnippets, editorTheme, editorHeight = "280px" }: DeveloperSDKProps) {
  // If module is provided, lazy-load from API; otherwise use inline snippets (legacy)
  const { snippets: apiSnippets, loading } = useSDKSnippets(module || "__noop__", placeholders);
  const useApi = !!module;

  const resolvedSnippets = useApi ? apiSnippets : (inlineSnippets || null);

  if (useApi && (loading || !resolvedSnippets)) return <SnippetSkeleton />;
  if (!resolvedSnippets) return null;

  return (
    <SDKSnippetViewer
      title={title}
      description={description}
      snippets={resolvedSnippets}
      editorTheme={editorTheme}
      editorHeight={editorHeight}
    />
  );
}
