// GatewayPanel.tsx — API Gateway panel (Oathkeeper)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  BookOpenText,
  CaretDown,
  CaretRight,
  ClipboardText,
  Code,
  DownloadSimple,
  Flask,
  Graph,
  PencilSimple,
  Plug,
  Plus,
  ShieldCheck,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import { LazyReactFlowWrapper as ReactFlow, LazyBackground as Background, LazyControls as Controls, MarkerType, type Node, type Edge } from "../LazyReactFlow";
import { apiFetch, type GatewayView } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

// ─── Rule Templates (module-scope) ──────────────────────────────────────────

const RULE_TEMPLATES: Array<{ name: string; description: string; rule: any }> = [
  {
    name: "Public API (Anonymous)",
    description: "Allow unauthenticated access to public endpoints",
    rule: { id: "public-api", match: { url: "<https://api.example.com/public/<**>>", methods: ["GET"] }, authenticators: [{ handler: "anonymous" }], authorizer: { handler: "allow" }, mutators: [{ handler: "noop" }] },
  },
  {
    name: "Protected API (Bearer Token)",
    description: "Require a valid OAuth2 bearer token",
    rule: { id: "protected-api", match: { url: "<https://api.example.com/api/<**>>", methods: ["GET", "POST", "PUT", "DELETE"] }, authenticators: [{ handler: "oauth2_introspection", config: { introspection_url: "http://hydra:4445/admin/oauth2/introspect" } }], authorizer: { handler: "allow" }, mutators: [{ handler: "header", config: { headers: { "X-User": "{{ print .Subject }}" } } }] },
  },
  {
    name: "Cookie Session (Kratos)",
    description: "Authenticate via Kratos session cookie",
    rule: { id: "kratos-session", match: { url: "<https://app.example.com/<**>>", methods: ["GET", "POST"] }, authenticators: [{ handler: "cookie_session", config: { check_session_url: "http://kratos:4433/sessions/whoami" } }], authorizer: { handler: "allow" }, mutators: [{ handler: "header", config: { headers: { "X-User-Id": "{{ print .Subject }}" } } }] },
  },
  {
    name: "JWT Validation",
    description: "Validate JWT tokens from Authorization header",
    rule: { id: "jwt-api", match: { url: "<https://api.example.com/v1/<**>>", methods: ["GET", "POST"] }, authenticators: [{ handler: "jwt", config: { jwks_urls: ["http://hydra:4444/.well-known/jwks.json"], required_scope: ["openid"] } }], authorizer: { handler: "allow" }, mutators: [{ handler: "id_token", config: { issuer_url: "https://api.example.com" } }] },
  },
  {
    name: "Keto Authorization",
    description: "Check permissions via Ory Keto before allowing access",
    rule: { id: "keto-authz", match: { url: "<https://api.example.com/resources/<**>>", methods: ["GET", "POST", "DELETE"] }, authenticators: [{ handler: "oauth2_introspection" }], authorizer: { handler: "remote_json", config: { remote: "http://keto:4466/relation-tuples/check", payload: '{"namespace":"resources","object":"{{ printIndex .MatchContext.RegexpCaptureGroups 0 }}","relation":"access","subject_id":"{{ print .Subject }}"}' } }, mutators: [{ handler: "noop" }] },
  },
];

// ─── Handler Reference Data ─────────────────────────────────────────────────

const HANDLER_SECTIONS: Array<{ type: string; tagColor: string; handlers: Array<{ name: string; description: string; common?: boolean; config?: Record<string, any> }> }> = [
  {
    type: "Authenticator",
    tagColor: "bg-accent-500/10 text-accent-300",
    handlers: [
      { name: "noop", description: "Bypasses authentication entirely.", common: true, config: {} },
      { name: "unauthorized", description: "Rejects every request with 401 Unauthorized.", config: {} },
      { name: "anonymous", description: "Allows unauthenticated access by assigning a configurable anonymous subject.", common: true, config: { subject: "anonymous" } },
      { name: "cookie_session", description: "Validates session cookies by calling an external session-check endpoint (e.g. Ory Kratos whoami).", common: true, config: { check_session_url: "http://kratos:4433/sessions/whoami", preserve_path: true, extra_from: "@this", subject_from: "identity.id" } },
      { name: "oauth2_client_credentials", description: "Authenticates using the OAuth2 Client Credentials flow.", config: { token_url: "http://hydra:4444/oauth2/token", required_scope: ["openid"] } },
      { name: "oauth2_introspection", description: "Introspects OAuth2 Bearer tokens via the introspection endpoint (RFC 7662).", common: true, config: { introspection_url: "http://hydra:4445/admin/oauth2/introspect", required_scope: ["openid"], target_audience: [] } },
      { name: "jwt", description: "Validates JWTs from the Authorization header against JWKS URLs.", common: true, config: { jwks_urls: ["http://hydra:4444/.well-known/jwks.json"], required_scope: ["openid"], target_audience: ["https://api.example.com"], trusted_issuers: ["https://auth.example.com"], token_from: { header: "Authorization" } } },
    ],
  },
  {
    type: "Authorizer",
    tagColor: "bg-slate-700/50 text-slate-300",
    handlers: [
      { name: "allow", description: "Permits every authenticated request.", common: true, config: {} },
      { name: "deny", description: "Rejects every request with 403 Forbidden.", config: {} },
      { name: "keto_engine_acp_ory", description: "Checks permissions against Ory Keto (relation-based access control).", common: true, config: { base_url: "http://keto:4466", required_action: "read", required_resource: "resources:{{ .MatchContext.URL.Path }}", subject: "{{ print .Subject }}", flavor: "glob" } },
      { name: "remote", description: "Delegates authorization to an external HTTP service.", config: { remote: "https://authz.internal/check", headers: { "X-Original-URL": "{{ .MatchContext.URL }}" } } },
      { name: "remote_json", description: "Delegates authorization to an external JSON API (e.g. Keto check).", common: true, config: { remote: "http://keto:4466/relation-tuples/check", payload: "{\"namespace\":\"resources\",\"object\":\"{{ printIndex .MatchContext.RegexpCaptureGroups 0 }}\",\"relation\":\"access\",\"subject_id\":\"{{ print .Subject }}\"}" } },
    ],
  },
  {
    type: "Mutator",
    tagColor: "bg-emerald-500/10 text-emerald-300",
    handlers: [
      { name: "noop", description: "Passes the request without modification.", common: true, config: {} },
      { name: "id_token", description: "Generates a signed JWT and injects it into the Authorization header.", common: true, config: { issuer_url: "https://api.example.com", jwks_url: "file:///etc/secrets/jwks.json", claims: "{\"aud\":[\"https://api.example.com\"],\"sub\":\"{{ print .Subject }}\"}" } },
      { name: "header", description: "Injects custom HTTP headers with Go template support.", common: true, config: { headers: { "X-User-Id": "{{ print .Subject }}", "X-User-Email": "{{ print .Extra.identity.traits.email }}" } } },
      { name: "cookie", description: "Sets cookies on the upstream request.", config: { cookies: { "session_user": "{{ print .Subject }}", "session_token": "{{ print .Extra.access_token }}" } } },
      { name: "hydrator", description: "Enriches the session by calling an external API before forwarding.", config: { api: { url: "http://user-service.internal/enrich", auth: { type: "api_key", config: { in: "header", name: "X-API-Key", value: "secret" } } }, cache: { enabled: true, ttl: "60s" } } },
    ],
  },
];

// ─── Gateway Tester (Live Request) ──────────────────────────────────────────

function GatewayTester({ apiBaseUrl, proxyUrl }: { apiBaseUrl: string; proxyUrl?: string }) {
  const [testUrl, setTestUrl] = useState("");
  const [testMethod, setTestMethod] = useState("GET");
  const [testHeaders, setTestHeaders] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runTest = () => {
    setLoading(true);
    let parsedHeaders: Record<string, string> = {};
    if (testHeaders.trim()) {
      try { parsedHeaders = JSON.parse(testHeaders); } catch { /* ignore */ }
    }
    apiFetch(`${apiBaseUrl}/api/oathkeeper/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: testUrl, method: testMethod, headers: parsedHeaders }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(data => { setResult(data); setLoading(false); }).catch((err) => { setResult({ error: err.message || "Request failed" }); setLoading(false); });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={testMethod} onChange={e => setTestMethod(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 font-mono outline-none">
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={testUrl} onChange={e => setTestUrl(e.target.value)} placeholder="Enter a URL matching one of your rules..." className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-400" />
        <button onClick={runTest} disabled={loading || !testUrl.trim()} className="rounded-lg bg-accent-500 hover:bg-accent-400 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-colors">{loading ? "..." : "Send"}</button>
      </div>
      <p className="text-[10px] text-slate-500">Enter a URL that matches one of your gateway rules (e.g. from the Rules tab). A 404 means no rule matches the URL.</p>
      <div>
        <label className="text-[10px] text-slate-500 uppercase">Headers (JSON)</label>
        <input value={testHeaders} onChange={e => setTestHeaders(e.target.value)} placeholder='{"Authorization": "Bearer ..."}' className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
      </div>
      {result && (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${result.status && result.status < 400 ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-xs font-medium text-slate-200">Status: {result.status || result.error || "Error"}</span>
          </div>
          {result.headers && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase mb-1">Response Headers</p>
              <div className="space-y-0.5 text-[10px]">
                {Object.entries(result.headers).slice(0, 15).map(([k, v]) => (
                  <div key={k} className="flex gap-2"><span className="text-slate-500 shrink-0">{k}:</span><span className="text-slate-300 font-mono truncate">{String(v)}</span></div>
                ))}
              </div>
            </div>
          )}
          {result.body !== undefined && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase mb-1">Response Body</p>
              <pre className="rounded bg-slate-900 p-2 text-[10px] text-slate-400 font-mono overflow-auto max-h-48">{typeof result.body === "object" ? JSON.stringify(result.body, null, 2) : String(result.body).slice(0, 2000)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Gateway Rule Editor ────────────────────────────────────────────────────

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const AUTHENTICATOR_HANDLERS = ["cookie_session", "bearer_token", "oauth2_introspection", "anonymous", "noop"] as const;
const AUTHORIZER_HANDLERS = ["allow", "deny", "keto_engine_acp_ory"] as const;
const MUTATOR_HANDLERS = ["header", "id_token", "noop"] as const;

function GatewayRuleEditor({ apiBaseUrl, rule, onSaved, onCancel }: {
  apiBaseUrl: string;
  rule: any | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!rule;
  const [ruleId, setRuleId] = useState(rule?.id || "");
  const [matchUrl, setMatchUrl] = useState(rule?.match?.url || "");
  const [matchMethods, setMatchMethods] = useState<string[]>(rule?.match?.methods || ["GET"]);
  const [description, setDescription] = useState(rule?.description || "");
  const [upstreamUrl, setUpstreamUrl] = useState(rule?.upstream?.url || "");
  const [upstreamStripPath, setUpstreamStripPath] = useState(rule?.upstream?.strip_path || "");
  const [upstreamPreserveHost, setUpstreamPreserveHost] = useState<boolean>(rule?.upstream?.preserve_host ?? false);
  const [authenticators, setAuthenticators] = useState<Array<{ handler: string; config: string }>>(
    rule?.authenticators?.map((a: any) => ({ handler: a.handler, config: a.config ? JSON.stringify(a.config, null, 2) : "" })) || [{ handler: "anonymous", config: "" }]
  );
  const [authorizerHandler, setAuthorizerHandler] = useState(rule?.authorizer?.handler || "allow");
  const [authorizerConfig, setAuthorizerConfig] = useState(rule?.authorizer?.config ? JSON.stringify(rule.authorizer.config, null, 2) : "");
  const [mutators, setMutators] = useState<Array<{ handler: string; config: string }>>(
    rule?.mutators?.map((m: any) => ({ handler: m.handler, config: m.config ? JSON.stringify(m.config, null, 2) : "" })) || [{ handler: "noop", config: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleMethod = (m: string) => setMatchMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  const parseJsonOrNull = (s: string) => { if (!s.trim()) return undefined; try { return JSON.parse(s); } catch { return undefined; } };

  const applyTemplate = (idx: number) => {
    const t = RULE_TEMPLATES[idx];
    if (!t) return;
    setRuleId(t.rule.id);
    setDescription(t.description);
    setMatchUrl(t.rule.match.url);
    setMatchMethods(t.rule.match.methods);
    setAuthenticators(t.rule.authenticators.map((a: any) => ({ handler: a.handler, config: a.config ? JSON.stringify(a.config, null, 2) : "" })));
    setAuthorizerHandler(t.rule.authorizer.handler);
    setAuthorizerConfig(t.rule.authorizer.config ? JSON.stringify(t.rule.authorizer.config, null, 2) : "");
    setMutators(t.rule.mutators.map((m: any) => ({ handler: m.handler, config: m.config ? JSON.stringify(m.config, null, 2) : "" })));
  };

  const handleSave = () => {
    if (!ruleId.trim()) { setError("Rule ID is required."); return; }
    if (!matchUrl.trim()) { setError("Match URL is required."); return; }
    if (matchMethods.length === 0) { setError("At least one HTTP method is required."); return; }

    const body: any = {
      id: ruleId.trim(),
      description: description.trim() || undefined,
      match: { url: matchUrl.trim(), methods: matchMethods },
      authenticators: authenticators.map(a => {
        const cfg = parseJsonOrNull(a.config);
        return cfg !== undefined ? { handler: a.handler, config: cfg } : { handler: a.handler };
      }),
      authorizer: (() => {
        const cfg = parseJsonOrNull(authorizerConfig);
        return cfg !== undefined ? { handler: authorizerHandler, config: cfg } : { handler: authorizerHandler };
      })(),
      mutators: mutators.map(m => {
        const cfg = parseJsonOrNull(m.config);
        return cfg !== undefined ? { handler: m.handler, config: cfg } : { handler: m.handler };
      }),
    };
    if (upstreamUrl.trim()) {
      body.upstream = { url: upstreamUrl.trim(), strip_path: upstreamStripPath.trim() || undefined, preserve_host: upstreamPreserveHost };
    }

    setSaving(true);
    setError("");
    apiFetch(`${apiBaseUrl}/api/oathkeeper/rules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => {
      if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); });
      return r.json();
    }).then(() => { onSaved(); }).catch(e => { setError(e.message || "Failed to save rule."); setSaving(false); });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-200">&larr; Back</button>
        <h3 className="text-sm font-medium text-slate-100">{isEdit ? "Edit Rule" : "Create Rule"}</h3>
      </div>

      {error && <div className="rounded border border-red-900/50 bg-red-950/20 p-2 text-xs text-red-300">{error}</div>}

      {/* Template selector (create only) */}
      {!isEdit && (
        <div>
          <label className="mb-1.5 block text-[10px] uppercase tracking-widest text-slate-500 font-medium">Start from template (optional)</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            <button
              type="button"
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-accent-500/40 hover:bg-accent-900/10 transition-colors"
              onClick={() => {/* blank — do nothing */}}
            >
              <p className="text-[11px] font-medium text-slate-200">Blank rule</p>
              <p className="text-[9px] text-slate-500 mt-0.5">Start from scratch</p>
            </button>
            {RULE_TEMPLATES.map((t, i) => (
              <button
                key={i}
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left hover:border-accent-500/40 hover:bg-accent-900/10 transition-colors"
                onClick={() => applyTemplate(i)}
              >
                <p className="text-[11px] font-medium text-slate-200 truncate">{t.name}</p>
                <p className="text-[9px] text-slate-500 mt-0.5 truncate">{t.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Rule ID</label>
        <input value={ruleId} onChange={e => setRuleId(e.target.value)} disabled={isEdit} placeholder="my-api-rule" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-accent-500 disabled:opacity-50" />
        {isEdit && <p className="text-[10px] text-slate-500 mt-0.5">Rule ID cannot be changed after creation.</p>}
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Description (optional)</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Protect the users API" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-accent-500" />
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Match URL</label>
        <input value={matchUrl} onChange={e => setMatchUrl(e.target.value)} placeholder="http://my-api:8080/api/users/<**>" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-accent-500" />
        <p className="text-[10px] text-slate-500 mt-0.5">Use {"<**>"} for wildcard path matching.</p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">HTTP Methods</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_METHODS.map(m => (
            <button key={m} onClick={() => toggleMethod(m)} className={`rounded border px-2 py-1 text-[10px] font-mono ${matchMethods.includes(m) ? "border-accent-500 bg-accent-500/10 text-accent-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>{m}</button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-slate-400">Authenticators</label>
          <button onClick={() => setAuthenticators([...authenticators, { handler: "anonymous", config: "" }])} className="text-[10px] text-accent-400 hover:text-accent-300">+ Add</button>
        </div>
        {authenticators.map((auth, i) => (
          <div key={i} className="mb-2 rounded border border-slate-800 bg-slate-950/40 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <select value={auth.handler} onChange={e => { const n = [...authenticators]; n[i] = { ...n[i], handler: e.target.value }; setAuthenticators(n); }} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none">
                {AUTHENTICATOR_HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              {authenticators.length > 1 && <button onClick={() => setAuthenticators(authenticators.filter((_, j) => j !== i))} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>}
            </div>
            <textarea value={auth.config} onChange={e => { const n = [...authenticators]; n[i] = { ...n[i], config: e.target.value }; setAuthenticators(n); }} placeholder='{"config_key": "value"}' rows={2} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 font-mono outline-none focus:border-accent-500 resize-y" />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Authorizer</label>
        <select value={authorizerHandler} onChange={e => setAuthorizerHandler(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 outline-none mb-1.5">
          {AUTHORIZER_HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <textarea value={authorizerConfig} onChange={e => setAuthorizerConfig(e.target.value)} placeholder='{"required_action": "read", "required_resource": "articles"}' rows={2} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 font-mono outline-none focus:border-accent-500 resize-y" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] text-slate-400">Mutators</label>
          <button onClick={() => setMutators([...mutators, { handler: "noop", config: "" }])} className="text-[10px] text-accent-400 hover:text-accent-300">+ Add</button>
        </div>
        {mutators.map((mut, i) => (
          <div key={i} className="mb-2 rounded border border-slate-800 bg-slate-950/40 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <select value={mut.handler} onChange={e => { const n = [...mutators]; n[i] = { ...n[i], handler: e.target.value }; setMutators(n); }} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none">
                {MUTATOR_HANDLERS.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              {mutators.length > 1 && <button onClick={() => setMutators(mutators.filter((_, j) => j !== i))} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>}
            </div>
            <textarea value={mut.config} onChange={e => { const n = [...mutators]; n[i] = { ...n[i], config: e.target.value }; setMutators(n); }} placeholder='{"headers": {"X-User": "{{ print .Subject }}"}}' rows={2} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 font-mono outline-none focus:border-accent-500 resize-y" />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Upstream URL</label>
        <input value={upstreamUrl} onChange={e => setUpstreamUrl(e.target.value)} placeholder="http://my-backend:8080" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-accent-500" />
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] text-slate-400">Strip Path (optional)</label>
          <input value={upstreamStripPath} onChange={e => setUpstreamStripPath(e.target.value)} placeholder="/api" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-accent-500" />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={upstreamPreserveHost} onChange={e => setUpstreamPreserveHost(e.target.checked)} className="rounded" />
            Preserve Host
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
        <button onClick={onCancel} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="rounded border border-accent-700 bg-accent-900/40 px-4 py-1.5 text-xs text-accent-200 hover:bg-accent-900/60 disabled:opacity-50">
          {saving ? "Saving..." : isEdit ? "Update Rule" : "Create Rule"}
        </button>
      </div>
    </div>
  );
}

// ─── Gateway Rules View (CRUD) ──────────────────────────────────────────────

function GatewayRulesView({ apiBaseUrl, oathkeeperRules, isOathkeeperLoading, loadRules, selectedGatewayRule, setSelectedGatewayRule }: {
  apiBaseUrl: string;
  oathkeeperRules: any[];
  isOathkeeperLoading: boolean;
  loadRules: () => void;
  selectedGatewayRule: any;
  setSelectedGatewayRule: (r: any) => void;
}) {
  const [editorMode, setEditorMode] = useState<"list" | "create" | "edit">("list");
  const [editingRule, setEditingRule] = useState<any>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const handleDelete = (ruleId: string) => {
    setDeleteError("");
    apiFetch(`${apiBaseUrl}/api/oathkeeper/rules/${encodeURIComponent(ruleId)}`, { method: "DELETE" })
      .then(r => { if (!r.ok) return r.json().then(d => { throw new Error(d.error || `HTTP ${r.status}`); }); return r.json(); })
      .then(() => { setDeletingRuleId(null); loadRules(); })
      .catch(e => setDeleteError(e.message || "Failed to delete rule."));
  };

  if (editorMode === "create") {
    return <GatewayRuleEditor apiBaseUrl={apiBaseUrl} rule={null} onSaved={() => { setEditorMode("list"); loadRules(); }} onCancel={() => setEditorMode("list")} />;
  }
  if (editorMode === "edit" && editingRule) {
    return <GatewayRuleEditor apiBaseUrl={apiBaseUrl} rule={editingRule} onSaved={() => { setEditorMode("list"); setEditingRule(null); loadRules(); }} onCancel={() => { setEditorMode("list"); setEditingRule(null); }} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-400 flex-1">{oathkeeperRules.length} rule{oathkeeperRules.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => { const json = JSON.stringify(oathkeeperRules, null, 2); const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `oathkeeper-rules-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); }}
          disabled={oathkeeperRules.length === 0}
          className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-30 transition-colors"
          title="Export rules as JSON"
        >
          <DownloadSimple size={12} />
        </button>
        <button onClick={loadRules} disabled={isOathkeeperLoading} className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50 transition-colors" title="Reload rules">
          <ArrowsClockwise size={12} />
        </button>
        <button onClick={() => setEditorMode("create")} className="rounded-lg bg-accent-500 hover:bg-accent-400 px-3 py-1 text-[10px] text-white font-medium transition-colors flex items-center gap-1">
          <Plus size={12} weight="regular" /> New Rule
        </button>
      </div>
      {oathkeeperRules.length === 0 && !isOathkeeperLoading && (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-6 text-center">
          <p className="text-xs text-slate-400">No access rules configured yet.</p>
          <p className="mt-1 text-[10px] text-slate-500">Create a rule to define access policies for your upstream services.</p>
        </div>
      )}
      {oathkeeperRules.map((rule: any) => (
        <div key={rule.id} className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">{rule.id}</p>
              {rule.description && <p className="text-[10px] text-slate-500 truncate">{rule.description}</p>}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button onClick={() => { setEditingRule(rule); setEditorMode("edit"); }} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">
                <PencilSimple size={11} weight="regular" className="inline -mt-px" /> Edit
              </button>
              <button onClick={() => setDeletingRuleId(rule.id)} className="rounded border border-red-900/50 px-2 py-1 text-[10px] text-red-400 hover:bg-red-950/30">
                <Trash size={11} weight="regular" className="inline -mt-px" /> Delete
              </button>
              <button onClick={() => setSelectedGatewayRule(selectedGatewayRule?.id === rule.id ? null : rule)} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">
                {selectedGatewayRule?.id === rule.id ? "Hide" : "Details"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {rule.match?.methods?.map((m: string) => (
              <span key={m} className="rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] text-accent-300 font-mono uppercase">{m}</span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 font-mono truncate">{rule.match?.url || "\u2014"}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {rule.authenticators?.map((a: any, i: number) => <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 font-mono">auth:{a.handler}</span>)}
            {rule.authorizer && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 font-mono">authz:{rule.authorizer.handler}</span>}
            {rule.mutators?.map((m: any, i: number) => <span key={i} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-300 font-mono">mutate:{m.handler}</span>)}
          </div>
          {selectedGatewayRule?.id === rule.id && (
            <div className="mt-3 border-t border-slate-800 pt-3 space-y-2 text-[11px]">
              <div>
                <span className="text-slate-500 uppercase text-[9px]">Upstream</span>
                <p className="text-slate-300 font-mono">{rule.upstream?.url || "\u2014"}</p>
                {rule.upstream?.strip_path && <p className="text-[10px] text-slate-500">strip_path: {rule.upstream.strip_path}</p>}
                {rule.upstream?.preserve_host !== undefined && <p className="text-[10px] text-slate-500">preserve_host: {String(rule.upstream.preserve_host)}</p>}
              </div>
              {rule.authenticators?.map((a: any, i: number) => (
                <div key={i}>
                  <span className="text-slate-500 uppercase text-[9px]">Authenticator: {a.handler}</span>
                  {a.config && <pre className="mt-0.5 rounded bg-slate-900 p-2 text-[10px] text-slate-400 font-mono overflow-auto max-h-32">{JSON.stringify(a.config, null, 2)}</pre>}
                </div>
              ))}
              {rule.authorizer && (
                <div>
                  <span className="text-slate-500 uppercase text-[9px]">Authorizer: {rule.authorizer.handler}</span>
                  {rule.authorizer.config && <pre className="mt-0.5 rounded bg-slate-900 p-2 text-[10px] text-slate-400 font-mono overflow-auto max-h-32">{JSON.stringify(rule.authorizer.config, null, 2)}</pre>}
                </div>
              )}
              {rule.mutators?.map((m: any, i: number) => (
                <div key={i}>
                  <span className="text-slate-500 uppercase text-[9px]">Mutator: {m.handler}</span>
                  {m.config && <pre className="mt-0.5 rounded bg-slate-900 p-2 text-[10px] text-slate-400 font-mono overflow-auto max-h-32">{JSON.stringify(m.config, null, 2)}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {deletingRuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded border border-red-900/50 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-sm font-medium text-slate-100 mb-2">Delete Access Rule</h3>
            <p className="text-xs text-slate-400 mb-1">Are you sure you want to delete this rule?</p>
            <p className="text-xs font-mono text-red-300 mb-4 break-all">{deletingRuleId}</p>
            {deleteError && <div className="rounded border border-red-900/50 bg-red-950/20 p-2 text-xs text-red-300 mb-3">{deleteError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeletingRuleId(null); setDeleteError(""); }} className="rounded border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
              <button onClick={() => handleDelete(deletingRuleId)} className="rounded border border-red-700 bg-red-900/40 px-4 py-1.5 text-xs text-red-200 hover:bg-red-900/60">Delete Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dry-Run (proper component — fixes hooks violation) ─────────────────────

function GatewayDryRun({ oathkeeperRules }: { oathkeeperRules: any[] }) {
  const [testUrl, setTestUrl] = useState("https://api.example.com/v1/users");
  const [testMethod, setTestMethod] = useState("GET");
  const [matchResults, setMatchResults] = useState<{ rule: any; matched: boolean }[] | null>(null);

  const runDryRun = () => {
    if (!oathkeeperRules?.length) { setMatchResults([]); return; }
    const results = oathkeeperRules.map((rule: any) => {
      const matchUrl = rule.match?.url || "";
      const matchMethods = rule.match?.methods || [];
      const methodOk = matchMethods.length === 0 || matchMethods.map((m: string) => m.toUpperCase()).includes(testMethod.toUpperCase());
      let pattern = matchUrl
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/<\\*\\*>/g, ".*")
        .replace(/<[^>]+>/g, "[^/]+");
      let urlOk = false;
      try { urlOk = new RegExp(`^${pattern}$`).test(testUrl); } catch { urlOk = false; }
      return { rule, matched: methodOk && urlOk };
    });
    setMatchResults(results);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-xs font-medium text-slate-200 mb-1">Rule Dry-Run</h3>
      <p className="text-[11px] text-slate-400 mb-3">Client-side simulation — tests which rules would match a URL. No actual request is sent.</p>
      <div className="flex items-center gap-2 mb-3">
        <select value={testMethod} onChange={e => setTestMethod(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200">
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <input value={testUrl} onChange={e => setTestUrl(e.target.value)} placeholder="https://api.example.com/v1/users" className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" onKeyDown={e => e.key === "Enter" && runDryRun()} />
        <button onClick={runDryRun} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Match</button>
      </div>
      {!oathkeeperRules?.length && <p className="text-[10px] text-slate-500 italic">No rules loaded.</p>}
      {matchResults && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-500">{matchResults.filter(r => r.matched).length} of {matchResults.length} rules matched</p>
          {matchResults.map((r, i) => (
            <div key={i} className={`rounded border px-3 py-2 text-[11px] ${r.matched ? "border-emerald-500/30 bg-emerald-950/20" : "border-slate-800 bg-slate-950/40"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${r.matched ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className={`font-medium ${r.matched ? "text-emerald-300" : "text-slate-500"}`}>{r.rule.id}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">{(r.rule.match?.methods || []).join(", ")}</span>
              </div>
              <p className="mt-0.5 font-mono text-[10px] text-slate-400 truncate">{r.rule.match?.url}</p>
              {r.matched && r.rule.authenticators && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.rule.authenticators.map((a: any, j: number) => <span key={j} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{a.handler}</span>)}
                  {r.rule.authorizer && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-accent-300">{r.rule.authorizer.handler}</span>}
                  {r.rule.mutators?.map((m: any, j: number) => <span key={j} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-amber-300">{m.handler}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Visualizer (proper component — fixes hooks violation) ─────────

function GatewayPipelineViz({ oathkeeperRules }: { oathkeeperRules: any[] }) {
  const [selectedRule, setSelectedRule] = useState<any>(null);
  const [testMethod, setTestMethod] = useState("GET");
  const [testUrl, setTestUrl] = useState("https://api.example.com/users");
  const [testResult, setTestResult] = useState<any>(null);

  const STAGE_COLORS = { match: "#6366f1", authenticator: "#f59e0b", authorizer: "#10b981", mutator: "#8b5cf6", upstream: "#3b82f6" };

  const buildFlowData = (rules: any[]) => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    nodes.push({
      id: "request", type: "default", position: { x: 50, y: 20 },
      data: { label: "Incoming Request" },
      style: { background: "#1e293b", color: "#e2e8f0", border: "1px solid #475569", borderRadius: "6px", fontSize: "11px", fontWeight: 600, padding: "8px 16px" },
    });

    rules.forEach((rule, i) => {
      const yBase = 100 + i * 200;
      const match = rule.match || {};
      const auth = (rule.authenticators || [])[0] || {};
      const authz = rule.authorizer || {};
      const mut = (rule.mutators || [])[0] || {};
      const upstream = rule.upstream || {};
      const ruleId = rule.id || `rule-${i}`;

      nodes.push({ id: `${ruleId}-match`, type: "default", position: { x: 50, y: yBase }, data: { label: `${match.methods?.join(",") || "*"}\n${(match.url || "").replace(/^</, "").replace(/>$/, "").substring(0, 40)}` }, style: { background: "#312e81", color: "#e0e7ff", border: `2px solid ${STAGE_COLORS.match}`, borderRadius: "6px", fontSize: "10px", padding: "6px 10px", whiteSpace: "pre-line" as const, maxWidth: "180px" } });
      nodes.push({ id: `${ruleId}-auth`, type: "default", position: { x: 280, y: yBase }, data: { label: auth.handler || "noop" }, style: { background: "#451a03", color: "#fef3c7", border: `2px solid ${STAGE_COLORS.authenticator}`, borderRadius: "6px", fontSize: "10px", padding: "6px 10px" } });
      nodes.push({ id: `${ruleId}-authz`, type: "default", position: { x: 440, y: yBase }, data: { label: authz.handler || "allow" }, style: { background: "#052e16", color: "#bbf7d0", border: `2px solid ${STAGE_COLORS.authorizer}`, borderRadius: "6px", fontSize: "10px", padding: "6px 10px" } });
      nodes.push({ id: `${ruleId}-mut`, type: "default", position: { x: 600, y: yBase }, data: { label: mut.handler || "noop" }, style: { background: "#2e1065", color: "#e9d5ff", border: `2px solid ${STAGE_COLORS.mutator}`, borderRadius: "6px", fontSize: "10px", padding: "6px 10px" } });
      nodes.push({ id: `${ruleId}-up`, type: "default", position: { x: 760, y: yBase }, data: { label: upstream.url ? (() => { try { return new URL(upstream.url).host; } catch { return "upstream"; } })() : "upstream" }, style: { background: "#172554", color: "#bfdbfe", border: `2px solid ${STAGE_COLORS.upstream}`, borderRadius: "6px", fontSize: "10px", padding: "6px 10px" } });

      edges.push({ id: `e-req-${ruleId}`, source: "request", target: `${ruleId}-match`, type: "smoothstep", style: { stroke: "#475569" }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: "#475569" } });
      edges.push({ id: `e-${ruleId}-1`, source: `${ruleId}-match`, target: `${ruleId}-auth`, type: "smoothstep", style: { stroke: STAGE_COLORS.authenticator }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: STAGE_COLORS.authenticator } });
      edges.push({ id: `e-${ruleId}-2`, source: `${ruleId}-auth`, target: `${ruleId}-authz`, type: "smoothstep", style: { stroke: STAGE_COLORS.authorizer }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: STAGE_COLORS.authorizer } });
      edges.push({ id: `e-${ruleId}-3`, source: `${ruleId}-authz`, target: `${ruleId}-mut`, type: "smoothstep", style: { stroke: STAGE_COLORS.mutator }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: STAGE_COLORS.mutator } });
      edges.push({ id: `e-${ruleId}-4`, source: `${ruleId}-mut`, target: `${ruleId}-up`, type: "smoothstep", style: { stroke: STAGE_COLORS.upstream }, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: STAGE_COLORS.upstream } });
    });
    return { nodes, edges };
  };

  const testRequest = () => {
    if (!oathkeeperRules?.length) return;
    const matchedRule = oathkeeperRules.find(rule => {
      const match = rule.match || {};
      if (match.methods?.length && !match.methods.includes(testMethod)) return false;
      const pattern = (match.url || "").replace(/^</, "").replace(/>$/, "");
      if (!pattern) return false;
      try {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/<[^>]+>/g, "[^/]+") + "$");
        return regex.test(testUrl);
      } catch { return false; }
    });
    setTestResult(matchedRule || "none");
    if (matchedRule) setSelectedRule(matchedRule);
  };

  const flow = oathkeeperRules.length > 0 ? buildFlowData(oathkeeperRules) : { nodes: [], edges: [] };

  return (
    <div className="space-y-4">
      {/* Request flow debugger */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Request Flow Debugger</p>
        <div className="flex gap-2">
          <select value={testMethod} onChange={e => setTestMethod(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200">
            {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map(m => <option key={m}>{m}</option>)}
          </select>
          <input value={testUrl} onChange={e => setTestUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && testRequest()} placeholder="https://api.example.com/path" className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 font-mono placeholder:text-slate-600" />
          <button onClick={testRequest} className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30">Trace</button>
        </div>
        {testResult && testResult !== "none" && (
          <div className="mt-2 rounded border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-[11px]">
            <p className="text-emerald-300 font-medium mb-1">Matched: {testResult.id}</p>
            <div className="grid grid-cols-4 gap-2 text-[10px]">
              <div><span className="text-slate-500">Auth:</span> <span className="text-amber-300">{(testResult.authenticators?.[0])?.handler || "noop"}</span></div>
              <div><span className="text-slate-500">Authz:</span> <span className="text-emerald-300">{testResult.authorizer?.handler || "allow"}</span></div>
              <div><span className="text-slate-500">Mutator:</span> <span className="text-purple-300">{(testResult.mutators?.[0])?.handler || "noop"}</span></div>
              <div><span className="text-slate-500">Upstream:</span> <span className="text-blue-300">{testResult.upstream?.url ? (() => { try { return new URL(testResult.upstream.url).host; } catch { return "\u2014"; } })() : "\u2014"}</span></div>
            </div>
          </div>
        )}
        {testResult === "none" && (
          <div className="mt-2 rounded border border-red-500/30 bg-red-950/20 p-2 text-[11px] text-red-300">No rule matched this request. The request would be rejected.</div>
        )}
      </div>

      {/* Stage legend */}
      <div className="flex gap-3 text-[10px]">
        {[["Match", "#6366f1"], ["Authenticate", "#f59e0b"], ["Authorize", "#10b981"], ["Mutate", "#8b5cf6"], ["Upstream", "#3b82f6"]].map(([label, color]) => (
          <span key={label as string} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: color as string }} />
            <span className="text-slate-400">{label}</span>
          </span>
        ))}
      </div>

      {/* ReactFlow diagram */}
      {oathkeeperRules.length === 0 ? (
        <div className="flex items-center justify-center h-64 rounded border border-dashed border-slate-700 text-slate-500 text-xs">No rules configured. Create rules in the Rules tab.</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden" style={{ height: Math.max(400, 100 + oathkeeperRules.length * 200) + "px" }}>
          <ReactFlow nodes={flow.nodes} edges={flow.edges} fitView proOptions={{ hideAttribution: true }} style={{ background: "#0c0f1a" }}>
            <Background color="#1e293b" gap={20} />
            <Controls />
          </ReactFlow>
        </div>
      )}

      {/* Selected rule detail */}
      {selectedRule && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-200">Rule Detail: {selectedRule.id}</h4>
            <button onClick={() => setSelectedRule(null)} className="text-slate-500 hover:text-slate-300 text-xs">Close</button>
          </div>
          <pre className="text-[10px] text-slate-400 font-mono overflow-auto max-h-48 bg-slate-950/60 rounded p-2">{JSON.stringify(selectedRule, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Handler Reference (Collapsible Accordion) ─────────────────────────────

function HandlerReference({ copyText }: { copyText?: (label: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-slate-200">Handler Reference</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">Click a handler to see its configuration schema.</p>
      </div>
      {HANDLER_SECTIONS.map((section) => (
        <div key={section.type}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{section.type}s</p>
          <div className="space-y-1">
            {section.handlers.map((h) => {
              const isExpanded = expanded.has(h.name);
              const hasConfig = h.config && Object.keys(h.config).length > 0;
              return (
                <div key={h.name} className="rounded-lg border border-slate-800 bg-slate-950/40 overflow-hidden">
                  <button onClick={() => toggle(h.name)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-900/40 transition-colors">
                    <span className="text-slate-500">{isExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${section.tagColor}`}>{h.name}</span>
                    {h.common && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-300">common</span>}
                    <span className="flex-1 text-[11px] text-slate-400 truncate">{h.description}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-slate-800/50">
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-2">{h.description}</p>
                      {hasConfig && (
                        <div className="mt-2 flex items-start justify-between gap-2">
                          <pre className="flex-1 rounded bg-slate-900/80 border border-slate-800/60 px-2.5 py-2 text-[10px] font-mono text-slate-400 overflow-x-auto leading-relaxed">{JSON.stringify(h.config, null, 2)}</pre>
                          <button
                            onClick={() => { navigator.clipboard.writeText(JSON.stringify(h.config, null, 2)); copyText?.(h.name); }}
                            className="shrink-0 truss-btn rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800"
                          >
                            <ClipboardText size={11} /> Copy
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function renderGatewayMain(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, copyText,
    gatewayView, setGatewayView, oathkeeperHealth, setOathkeeperHealth, oathkeeperRules, setOathkeeperRules,
    isOathkeeperLoading, setIsOathkeeperLoading, oathkeeperLoaded, setOathkeeperLoaded,
    oathkeeperVersion, setOathkeeperVersion, selectedGatewayRule, setSelectedGatewayRule,
  } = s;

  // Compute real Oathkeeper / Hydra URLs for developer snippets
  const gatewayAdminUrl = oathkeeperHealth?.adminConfigured
    ? (s.integrationsStatus?.gateway?.adminUrl || `${apiBaseUrl || "http://localhost:8787"}/api/oathkeeper`)
    : `${apiBaseUrl || "http://localhost:8787"}/api/oathkeeper`;
  const gatewayProxyUrl = oathkeeperHealth?.proxyUrl || gatewayAdminUrl;
  const hydraPublicUrl = s.hydraHealth?.publicUrl || `${apiBaseUrl || "http://localhost:8787"}/api/hydra`;

  // Auto-load
  if (!oathkeeperLoaded && !isOathkeeperLoading) {
    setTimeout(() => {
      setIsOathkeeperLoading(true);
      setOathkeeperLoaded(true);
      Promise.all([
        apiFetch(`${apiBaseUrl}/api/oathkeeper/health`).then(r => r.json()).catch(() => null),
        apiFetch(`${apiBaseUrl}/api/oathkeeper/rules`).then(r => r.json()).catch(() => []),
        apiFetch(`${apiBaseUrl}/api/oathkeeper/version`).then(r => r.json()).catch(() => null),
      ]).then(([health, rules, version]) => {
        setOathkeeperHealth(health);
        setOathkeeperRules(Array.isArray(rules) ? rules : []);
        setOathkeeperVersion(version);
        setIsOathkeeperLoading(false);
      });
    }, 0);
  }

  const loadRules = () => {
    setIsOathkeeperLoading(true);
    apiFetch(`${apiBaseUrl}/api/oathkeeper/rules`).then(r => r.json()).then(data => {
      setOathkeeperRules(Array.isArray(data) ? data : []);
      setIsOathkeeperLoading(false);
    }).catch(() => setIsOathkeeperLoading(false));
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">API Gateway</h2>
          <button onClick={() => { setOathkeeperLoaded(false); }} disabled={isOathkeeperLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            {isOathkeeperLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
          </button>
        </div>

        {/* ── Overview ── */}
        {gatewayView === "overview" && (
          <div className="space-y-4">
            {/* Stat cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck size={13} weight="regular" /> Access Rules</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{oathkeeperRules.length}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Configured routes</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">Authenticators</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{new Set(oathkeeperRules.flatMap((r: any) => r.authenticators?.map((a: any) => a.handler) || [])).size}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Auth handlers in use</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">Mutators</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{new Set(oathkeeperRules.flatMap((r: any) => r.mutators?.map((m: any) => m.handler) || [])).size}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Header transformers</p>
              </div>
            </div>

            {/* Pipeline flow */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
              <h3 className="text-xs font-medium text-slate-200">Request Pipeline</h3>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-accent-500/10 px-2 py-1 text-accent-300 font-mono">Authenticate</span>
                <span className="text-slate-600">&rarr;</span>
                <span className="rounded bg-accent-500/10 px-2 py-1 text-accent-300 font-mono">Authorize</span>
                <span className="text-slate-600">&rarr;</span>
                <span className="rounded bg-accent-500/10 px-2 py-1 text-accent-300 font-mono">Mutate</span>
                <span className="text-slate-600">&rarr;</span>
                <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300 font-mono">Upstream</span>
              </div>
              <p className="text-[10px] text-slate-500">Every request passes through authenticators, authorizers, and mutators before reaching your upstream service.</p>
            </div>

            {/* Service details */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="mb-2 text-xs font-medium text-slate-200">Service Details</h3>
              <div className="grid gap-1.5 text-[11px]">
                {oathkeeperHealth?.proxyUrl && <div className="flex justify-between"><span className="text-slate-500">Proxy URL</span><span className="text-slate-300 font-mono">{oathkeeperHealth.proxyUrl}</span></div>}
                {oathkeeperVersion?.version && <div className="flex justify-between"><span className="text-slate-500">Version</span><span className="text-slate-300">Ory Oathkeeper {oathkeeperVersion.version}</span></div>}
                {oathkeeperHealth?.adminConfigured !== undefined && <div className="flex justify-between"><span className="text-slate-500">Admin API</span><span className={oathkeeperHealth.adminConfigured ? "text-emerald-400" : "text-slate-500"}>{oathkeeperHealth.adminConfigured ? "Configured" : "Not configured"}</span></div>}
              </div>
            </div>

            {/* Configured handlers summary */}
            {oathkeeperRules.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Authenticators</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(oathkeeperRules.flatMap((r: any) => r.authenticators?.map((a: any) => a.handler) || []))].map((h: any) => (
                      <span key={h} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{h}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Authorizers</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(oathkeeperRules.map((r: any) => r.authorizer?.handler).filter(Boolean))].map((h: any) => (
                      <span key={h} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{h}</span>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Mutators</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(oathkeeperRules.flatMap((r: any) => r.mutators?.map((m: any) => m.handler) || []))].map((h: any) => (
                      <span key={h} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{h}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Docs link */}
            <button onClick={() => window.open("https://docs.truss.binarysquad.org/guides/gateway/", "_blank")} className="truss-btn rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400 hover:bg-slate-900 hover:text-slate-300">
              <BookOpenText size={14} weight="regular" /> Documentation <ArrowSquareOut size={12} />
            </button>
          </div>
        )}

        {/* ── Rules ── */}
        {gatewayView === "rules" && (
          <GatewayRulesView
            apiBaseUrl={apiBaseUrl}
            oathkeeperRules={oathkeeperRules}
            isOathkeeperLoading={isOathkeeperLoading}
            loadRules={loadRules}
            selectedGatewayRule={selectedGatewayRule}
            setSelectedGatewayRule={setSelectedGatewayRule}
          />
        )}

        {/* ── Testing (merged: Live Test + Dry-Run) ── */}
        {gatewayView === "testing" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-xs font-medium text-slate-200 mb-1">Live Test</h3>
              <p className="text-[11px] text-slate-400 mb-3">Send a real request through the gateway to verify rule matching and authentication.</p>
              <GatewayTester apiBaseUrl={apiBaseUrl} proxyUrl={oathkeeperHealth?.proxyUrl} />
            </div>
            <GatewayDryRun oathkeeperRules={oathkeeperRules} />
          </div>
        )}

        {/* ── Pipeline (merged: Visualizer + Handler Reference) ── */}
        {gatewayView === "pipeline" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-slate-200 mb-1">Pipeline Visualizer</h3>
              <p className="text-[11px] text-slate-400 mb-3">Visual diagram of all gateway rules: Match &rarr; Authenticate &rarr; Authorize &rarr; Mutate &rarr; Upstream.</p>
            </div>
            <GatewayPipelineViz oathkeeperRules={oathkeeperRules} />
            <div className="border-t border-slate-800 pt-6">
              <HandlerReference copyText={copyText} />
            </div>
          </div>
        )}

        {gatewayView === "developer" && (
          <DeveloperSDK
            title="API Gateway SDK & Code Snippets"
            description="Configure access rules, proxy routing, and request authentication for your API gateway."
            editorTheme={s.editorTheme}
            module="gateway"
            placeholders={{ gatewayAdminUrl, gatewayProxyUrl, hydraPublicUrl }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Pane B ─────────────────────────────────────────────────────────────────

export function renderGatewayPaneB(s: any): React.JSX.Element | null {
  const { gatewayView, setGatewayView } = s;

  return (
    <div className="space-y-2">
      {([
        { id: "overview" as GatewayView, label: "Overview", icon: <Plug size={18} weight="regular" /> },
        { id: "rules" as GatewayView, label: "Rules", icon: <ShieldCheck size={18} weight="regular" /> },
        { id: "testing" as GatewayView, label: "Testing", icon: <Flask size={18} weight="regular" /> },
        { id: "pipeline" as GatewayView, label: "Pipeline", icon: <Graph size={18} weight="regular" /> },
        { id: "developer" as GatewayView, label: "Developer", icon: <Code size={18} weight="regular" /> },
      ] as const).map((item) => (
        <button
          key={item.id}
          onClick={() => setGatewayView(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            gatewayView === item.id
              ? "border-slate-600 bg-slate-800 text-slate-100"
              : "border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-900"
          }`}
        >
          <span className="inline-flex items-center gap-2">{item.icon}{item.label}</span>
        </button>
      ))}
    </div>
  );
}
