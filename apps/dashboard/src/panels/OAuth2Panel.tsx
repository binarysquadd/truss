// OAuth2Panel.tsx — OAuth2 / OIDC panel (extracted from ModulePanels.tsx)
/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { LazyEditor as Editor } from "../LazyEditor";
import { handleEditorWillMount, trussEditorOptions } from "../editorConfig";
import {
  ArrowsClockwise,
  ArrowSquareOut,
  BookOpenText,
  CheckCircle,
  ClipboardText,
  Code,
  FloppyDisk,
  GearSix,
  Globe,
  IdentificationCard,
  Key,
  LockKey,
  MagnifyingGlass,
  Play,
  Plus,
  ShieldCheck,
  Sparkle,
  Trash,
  XCircle,
} from "@phosphor-icons/react";
import { type OAuth2View, apiFetch } from "../types";
import { DeveloperSDK } from "./DeveloperSDK";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTtl(seconds: number): string {
  if (!seconds || seconds <= 0) return "default";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function parseDurationToSeconds(dur: string | undefined): number {
  if (!dur) return 0;
  const match = dur.match(/^(\d+)(s|m|h)$/);
  if (match) {
    const val = parseInt(match[1], 10);
    if (match[2] === "s") return val;
    if (match[2] === "m") return val * 60;
    if (match[2] === "h") return val * 3600;
  }
  const numOnly = parseInt(dur, 10);
  return isNaN(numOnly) ? 0 : numOnly;
}

// ─── TokenSettingsSection ────────────────────────────────────────────────────

function TokenSettingsSection({ clientId, client, apiBaseUrl, onUpdate }: { clientId: string; client: any; apiBaseUrl: string; onUpdate: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const [accessTtl, setAccessTtl] = React.useState("");
  const [refreshTtl, setRefreshTtl] = React.useState("");
  const [idTtl, setIdTtl] = React.useState("");
  const [tokenStrategy, setTokenStrategy] = React.useState<"opaque" | "jwt">("opaque");
  const [frontLogoutUri, setFrontLogoutUri] = React.useState("");
  const [backLogoutUri, setBackLogoutUri] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const at = parseDurationToSeconds(client.authorization_code_grant_access_token_lifespan || client.client_credentials_grant_access_token_lifespan);
    const rt = parseDurationToSeconds(client.authorization_code_grant_refresh_token_lifespan || client.refresh_token_grant_refresh_token_lifespan);
    const idt = parseDurationToSeconds(client.authorization_code_grant_id_token_lifespan);
    setAccessTtl(at ? String(at) : "");
    setRefreshTtl(rt ? String(rt) : "");
    setIdTtl(idt ? String(idt) : "");
    setTokenStrategy(client.access_token_strategy === "jwt" ? "jwt" : "opaque");
    setFrontLogoutUri(client.frontchannel_logout_uri || "");
    setBackLogoutUri(client.backchannel_logout_uri || "");
  }, [client]);

  const save = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const body: any = { access_token_strategy: tokenStrategy };
      if (accessTtl) body.access_token_ttl = parseInt(accessTtl, 10);
      if (refreshTtl) body.refresh_token_ttl = parseInt(refreshTtl, 10);
      if (idTtl) body.id_token_ttl = parseInt(idTtl, 10);
      body.frontchannel_logout_uri = frontLogoutUri.trim();
      body.backchannel_logout_uri = backLogoutUri.trim();
      const r = await apiFetch(`${apiBaseUrl}/api/hydra/clients/${encodeURIComponent(clientId)}/token-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Failed to save"); setSaving(false); return; }
      setSaved(true);
      onUpdate();
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const inputCls = "w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-accent-500";

  return (
    <div className="mt-2 border-t border-slate-800 pt-2">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 text-[11px] text-accent-400 hover:text-accent-300">
        <GearSix size={13} weight="regular" />
        Token &amp; Logout Settings
      </button>
      {expanded && (
        <div className="mt-2 space-y-3">
          <div>
            <label className="text-[9px] text-slate-500 uppercase">Access Token Strategy</label>
            <div className="mt-1 flex items-center gap-3">
              <button onClick={() => setTokenStrategy("opaque")} className={`rounded border px-2.5 py-1 text-[10px] font-medium ${tokenStrategy === "opaque" ? "border-accent-500 bg-accent-500/15 text-accent-300" : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300"}`}>Opaque</button>
              <button onClick={() => setTokenStrategy("jwt")} className={`rounded border px-2.5 py-1 text-[10px] font-medium ${tokenStrategy === "jwt" ? "border-accent-500 bg-accent-500/15 text-accent-300" : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300"}`}>JWT</button>
              <span className="text-[9px] text-slate-500">{tokenStrategy === "jwt" ? "Self-contained JWTs (verifiable without introspection)" : "Opaque references (require introspection)"}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Access Token TTL</label>
              <input value={accessTtl} onChange={e => setAccessTtl(e.target.value)} placeholder="3600" className={inputCls} />
              {accessTtl && <p className="mt-0.5 text-[9px] text-slate-500">{formatTtl(parseInt(accessTtl, 10) || 0)}</p>}
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Refresh Token TTL</label>
              <input value={refreshTtl} onChange={e => setRefreshTtl(e.target.value)} placeholder="2592000" className={inputCls} />
              {refreshTtl && <p className="mt-0.5 text-[9px] text-slate-500">{formatTtl(parseInt(refreshTtl, 10) || 0)}</p>}
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">ID Token TTL</label>
              <input value={idTtl} onChange={e => setIdTtl(e.target.value)} placeholder="3600" className={inputCls} />
              {idTtl && <p className="mt-0.5 text-[9px] text-slate-500">{formatTtl(parseInt(idTtl, 10) || 0)}</p>}
            </div>
          </div>
          <p className="text-[9px] text-slate-500">Values in seconds. Leave empty for server defaults.</p>
          <div className="space-y-2">
            <p className="text-[9px] text-slate-500 uppercase font-medium">Logout Configuration</p>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Front-Channel Logout URI</label>
              <input value={frontLogoutUri} onChange={e => setFrontLogoutUri(e.target.value)} placeholder="https://app.example.com/logout" className={inputCls} />
              <p className="mt-0.5 text-[9px] text-slate-500">Browser-redirect logout (user agent visits this URL)</p>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Back-Channel Logout URI</label>
              <input value={backLogoutUri} onChange={e => setBackLogoutUri(e.target.value)} placeholder="https://api.example.com/backchannel-logout" className={inputCls} />
              <p className="mt-0.5 text-[9px] text-slate-500">Server-to-server logout notification (receives logout token)</p>
            </div>
          </div>
          {error && <p className="text-[10px] text-red-300">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="rounded bg-accent-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-700 disabled:opacity-50">{saving ? "Saving..." : "Save Settings"}</button>
            {saved && <span className="text-[10px] text-emerald-400">Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TokenIntrospector ───────────────────────────────────────────────────────

function TokenIntrospector({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [token, setToken] = React.useState("");
  const [result, setResult] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  const introspect = () => {
    setLoading(true);
    apiFetch(`${apiBaseUrl}/api/hydra/introspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(data => { setResult(data); setLoading(false); }).catch((err) => { setResult({ error: err.message || "Introspection failed" }); setLoading(false); });
  };

  const revoke = () => {
    apiFetch(`${apiBaseUrl}/api/hydra/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }).then(() => { setResult(null); setToken(""); }).catch((err) => { setResult({ error: err.message || "Revocation failed" }); });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">Introspect or revoke an OAuth2 access token.</p>
      <div className="flex gap-2">
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Paste access token..." className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
        <button onClick={introspect} disabled={loading || !token.trim()} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">{loading ? "..." : "Introspect"}</button>
        <button onClick={revoke} disabled={!token.trim()} className="rounded border border-red-400/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/20 disabled:opacity-50">Revoke</button>
      </div>
      {result && (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-1.5 text-[11px]">
          {result.error && <div className="text-red-400 text-xs">{result.error}</div>}
          {!result.error && <div className="flex justify-between"><span className="text-slate-500">Active</span><span className={result.active ? "text-emerald-400" : "text-red-400"}>{result.active ? "Yes" : "No"}</span></div>}
          {result.client_id && <div className="flex justify-between"><span className="text-slate-500">Client ID</span><span className="text-slate-300 font-mono">{result.client_id}</span></div>}
          {result.sub && <div className="flex justify-between"><span className="text-slate-500">Subject</span><span className="text-slate-300 font-mono">{result.sub}</span></div>}
          {result.scope && <div className="flex justify-between"><span className="text-slate-500">Scope</span><span className="text-slate-300 font-mono">{result.scope}</span></div>}
          {result.exp && <div className="flex justify-between"><span className="text-slate-500">Expires</span><span className="text-slate-300">{new Date(result.exp * 1000).toLocaleString()}</span></div>}
          {result.iat && <div className="flex justify-between"><span className="text-slate-500">Issued</span><span className="text-slate-300">{new Date(result.iat * 1000).toLocaleString()}</span></div>}
          {result.token_type && <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-slate-300 font-mono">{result.token_type}</span></div>}
        </div>
      )}
    </div>
  );
}

// ─── JwtDebugger (extracted from IIFE) ──────────────────────────────────────

function JwtDebugger({ copyText, setOAuth2View }: { copyText: (msg: string) => void; setOAuth2View: (v: OAuth2View) => void }) {
  const [jwtInput, setJwtInput] = React.useState("");
  const decodeJwt = (token: string) => {
    try {
      const parts = token.trim().split(".");
      if (parts.length < 2) return null;
      const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return { header, payload, signature: parts[2] || "" };
    } catch { return null; }
  };
  const decoded = jwtInput.trim() ? decodeJwt(jwtInput) : null;
  const isExpired = decoded?.payload?.exp ? decoded.payload.exp * 1000 < Date.now() : false;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-100">JWT Debugger</h3>
        <p className="mb-3 text-[11px] text-slate-400">Paste a JWT token to decode and inspect its header, payload, and claims. No data is sent to any server.</p>
        <textarea
          value={jwtInput}
          onChange={e => setJwtInput(e.target.value)}
          rows={4}
          placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOi..."
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-y"
        />
      </div>
      {decoded ? (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium ${isExpired ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
            {isExpired ? <><XCircle size={14} /> Token expired</> : <><CheckCircle size={14} /> Token not expired</>}
            {decoded.payload.exp && <span className="ml-auto font-mono text-[10px] text-slate-400">exp: {new Date(decoded.payload.exp * 1000).toLocaleString()}</span>}
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Header</p>
            <pre className="overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-accent-300">{JSON.stringify(decoded.header, null, 2)}</pre>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Payload</p>
            <pre className="overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-emerald-300">{JSON.stringify(decoded.payload, null, 2)}</pre>
          </div>
          <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Claims</p>
            <div className="space-y-1 text-[11px]">
              {decoded.payload.sub && <div className="flex justify-between"><span className="text-slate-500">Subject (sub)</span><span className="text-slate-300 font-mono">{decoded.payload.sub}</span></div>}
              {decoded.payload.iss && <div className="flex justify-between"><span className="text-slate-500">Issuer (iss)</span><span className="text-slate-300 font-mono">{decoded.payload.iss}</span></div>}
              {decoded.payload.aud && <div className="flex justify-between"><span className="text-slate-500">Audience (aud)</span><span className="text-slate-300 font-mono">{Array.isArray(decoded.payload.aud) ? decoded.payload.aud.join(", ") : decoded.payload.aud}</span></div>}
              {decoded.payload.iat && <div className="flex justify-between"><span className="text-slate-500">Issued At (iat)</span><span className="text-slate-300">{new Date(decoded.payload.iat * 1000).toLocaleString()}</span></div>}
              {decoded.payload.exp && <div className="flex justify-between"><span className="text-slate-500">Expires (exp)</span><span className={`${isExpired ? "text-red-300" : "text-slate-300"}`}>{new Date(decoded.payload.exp * 1000).toLocaleString()}</span></div>}
              {decoded.payload.scope && <div className="flex justify-between"><span className="text-slate-500">Scope</span><span className="text-slate-300 font-mono">{decoded.payload.scope}</span></div>}
              {decoded.payload.scp && <div className="flex justify-between"><span className="text-slate-500">Scopes (scp)</span><span className="text-slate-300 font-mono">{Array.isArray(decoded.payload.scp) ? decoded.payload.scp.join(", ") : decoded.payload.scp}</span></div>}
              {decoded.payload.client_id && <div className="flex justify-between"><span className="text-slate-500">Client ID</span><span className="text-slate-300 font-mono">{decoded.payload.client_id}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(decoded.payload, null, 2)); copyText("Payload"); }} className="truss-btn rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              <ClipboardText size={14} /> Copy Payload
            </button>
          </div>
        </div>
      ) : jwtInput.trim() ? (
        <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          Invalid JWT format. A valid JWT has 3 base64-encoded parts separated by dots.
        </div>
      ) : null}
    </div>
  );
}

// ─── JwksView (extracted from IIFE) ─────────────────────────────────────────

function JwksView({ apiBaseUrl, hydraJwks, loadJwks }: { apiBaseUrl: string; hydraJwks: any; loadJwks: () => void }) {
  const [newKeyAlg, setNewKeyAlg] = React.useState("RS256");
  const [creating, setCreating] = React.useState(false);
  const createKey = async () => {
    setCreating(true);
    try {
      const r = await apiFetch(`${apiBaseUrl}/api/hydra/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ algorithm: newKeyAlg, set_id: "hydra.openid.id-token" }),
      });
      if (r.ok) loadJwks();
    } catch { /* */ }
    setCreating(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">JSON Web Key Set — public keys used to verify tokens</p>
        <div className="flex items-center gap-2">
          <button onClick={loadJwks} className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"><ArrowsClockwise size={12} /></button>
          <select value={newKeyAlg} onChange={e => setNewKeyAlg(e.target.value)} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-slate-200">
            <option value="RS256">RS256</option><option value="RS384">RS384</option><option value="RS512">RS512</option>
            <option value="ES256">ES256</option><option value="ES384">ES384</option><option value="ES512">ES512</option>
            <option value="EdDSA">EdDSA</option>
          </select>
          <button onClick={createKey} disabled={creating} className="rounded bg-accent-600 px-3 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
            {creating ? "..." : "Create Key"}
          </button>
        </div>
      </div>
      {hydraJwks?.keys ? (
        <div className="space-y-2">
          {hydraJwks.keys.map((key: any, i: number) => (
            <div key={i} className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex justify-between"><span className="text-slate-500">Key ID</span><span className="text-slate-300 font-mono select-all">{key.kid}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Algorithm</span><span className="text-slate-300 font-mono">{key.alg}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Use</span><span className="text-slate-300 font-mono">{key.use}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Type</span><span className="text-slate-300 font-mono">{key.kty}</span></div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete key ${key.kid}?`)) return;
                    await apiFetch(`${apiBaseUrl}/api/hydra/keys/hydra.openid.id-token/${encodeURIComponent(key.kid)}`, { method: "DELETE" });
                    loadJwks();
                  }}
                  className="ml-3 shrink-0 rounded border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10"
                  title="Delete key"
                ><Trash size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-6 text-center">
          <p className="text-xs text-slate-400">Click refresh to load the public key set.</p>
        </div>
      )}
    </div>
  );
}

// ─── DiscoveryView (extracted from IIFE) ────────────────────────────────────

function DiscoveryView({ apiBaseUrl, copyText }: { apiBaseUrl: string; copyText: (msg: string) => void }) {
  const [disc, setDisc] = React.useState<any>(null);
  const [discLoading, setDiscLoading] = React.useState(false);
  const [discError, setDiscError] = React.useState("");

  React.useEffect(() => {
    setDiscLoading(true);
    apiFetch(`${apiBaseUrl}/api/hydra/discovery`).then(r => r.ok ? r.json() : Promise.reject(r.statusText)).then(data => {
      setDisc(data);
      setDiscLoading(false);
    }).catch(e => { setDiscError(String(e)); setDiscLoading(false); });
  }, [apiBaseUrl]);

  const endpointKeys = [
    ["authorization_endpoint", "Authorization"],
    ["token_endpoint", "Token"],
    ["userinfo_endpoint", "Userinfo"],
    ["revocation_endpoint", "Revocation"],
    ["introspection_endpoint", "Introspection"],
    ["jwks_uri", "JWKS"],
    ["registration_endpoint", "Dynamic Registration"],
    ["end_session_endpoint", "End Session"],
  ];

  const arrayKeys = [
    ["grant_types_supported", "Grant Types"],
    ["response_types_supported", "Response Types"],
    ["response_modes_supported", "Response Modes"],
    ["scopes_supported", "Scopes"],
    ["subject_types_supported", "Subject Types"],
    ["id_token_signing_alg_values_supported", "ID Token Signing Algorithms"],
    ["token_endpoint_auth_methods_supported", "Token Auth Methods"],
    ["claims_supported", "Claims"],
    ["code_challenge_methods_supported", "PKCE Methods"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">OpenID Connect Discovery</p>
        <div className="flex gap-2">
          {disc && <button onClick={() => copyText(JSON.stringify(disc, null, 2))} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800">Copy JSON</button>}
          <button onClick={() => { setDisc(null); setDiscError(""); setDiscLoading(true); apiFetch(`${apiBaseUrl}/api/hydra/discovery`).then(r => r.ok ? r.json() : Promise.reject(r.statusText)).then(data => { setDisc(data); setDiscLoading(false); }).catch(e => { setDiscError(String(e)); setDiscLoading(false); }); }} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-800"><ArrowsClockwise size={12} /></button>
        </div>
      </div>

      {discLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="truss-spinner" /> Loading discovery document...</div>}
      {discError && <div className="rounded border border-red-900/50 bg-red-950/20 p-3 text-xs text-red-300">{discError}</div>}

      {disc && (
        <div className="space-y-3">
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-1">Issuer</p>
            <p className="text-sm font-mono text-accent-300 select-all">{disc.issuer}</p>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-2">Endpoints</p>
            <div className="space-y-1.5">
              {endpointKeys.map(([key, label]) => disc[key] ? (
                <div key={key} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-slate-400 shrink-0 w-36">{label}</span>
                  <span className="text-[11px] font-mono text-slate-300 truncate select-all text-right">{disc[key]}</span>
                </div>
              ) : null)}
            </div>
          </div>
          {arrayKeys.map(([key, label]) => {
            const arr = disc[key];
            if (!Array.isArray(arr) || arr.length === 0) return null;
            return (
              <div key={key} className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-[10px] text-slate-500 uppercase mb-2">{label} <span className="text-slate-600">({arr.length})</span></p>
                <div className="flex flex-wrap gap-1">
                  {arr.map((v: string) => <span key={v} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{v}</span>)}
                </div>
              </div>
            );
          })}
          <details className="rounded border border-slate-800 bg-slate-900/40">
            <summary className="cursor-pointer p-3 text-[10px] text-slate-500 uppercase hover:text-slate-300">Raw JSON</summary>
            <pre className="p-3 pt-0 text-[10px] font-mono text-slate-400 max-h-64 overflow-auto whitespace-pre-wrap">{JSON.stringify(disc, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── ClaimsEditor (extracted from IIFE) ─────────────────────────────────────

function ClaimsEditor({ apiBaseUrl, editorTheme }: { apiBaseUrl: string; editorTheme: string }) {
  const [claimsConfig, setClaimsConfig] = React.useState<any>(null);
  const [claimsLoading, setClaimsLoading] = React.useState(false);
  const [idTokenText, setIdTokenText] = React.useState("{}");
  const [accessTokenText, setAccessTokenText] = React.useState("{}");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setClaimsLoading(true);
    apiFetch(`${apiBaseUrl}/api/hydra/claims-config`).then(r => r.json()).then(d => {
      setClaimsConfig(d);
      setIdTokenText(JSON.stringify(d.id_token_claims || {}, null, 2));
      setAccessTokenText(JSON.stringify(d.access_token_claims || {}, null, 2));
      setClaimsLoading(false);
    }).catch(() => setClaimsLoading(false));
  }, [apiBaseUrl]);

  const saveClaims = async () => {
    try {
      const idClaims = JSON.parse(idTokenText);
      const accessClaims = JSON.parse(accessTokenText);
      setSaving(true);
      const r = await apiFetch(`${apiBaseUrl}/api/hydra/claims-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token_claims: idClaims, access_token_claims: accessClaims }),
      });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
      setSaving(false);
    } catch { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-100 mb-1">Custom Claims</h2>
        <p className="text-[11px] text-slate-400 mb-4">Configure additional claims injected into ID tokens and access tokens during the consent flow. Claims are JSON objects mapping claim names to values or Kratos trait paths.</p>

        {claimsLoading && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="truss-spinner" /> Loading...</div>}

        {claimsConfig && (
          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">ID Token Claims</label>
              <Editor
                height="150px"
                language="json"
                theme={editorTheme}
                value={idTokenText}
                onChange={v => setIdTokenText(v || "{}")}
                beforeMount={handleEditorWillMount}
                options={{ ...trussEditorOptions, minimap: { enabled: false }, lineNumbers: "off", fontSize: 12, readOnly: false }}
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase mb-1 block">Access Token Claims</label>
              <Editor
                height="150px"
                language="json"
                theme={editorTheme}
                value={accessTokenText}
                onChange={v => setAccessTokenText(v || "{}")}
                beforeMount={handleEditorWillMount}
                options={{ ...trussEditorOptions, minimap: { enabled: false }, lineNumbers: "off", fontSize: 12, readOnly: false }}
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveClaims} disabled={saving} className="truss-btn rounded border border-accent-600/40 bg-accent-600/10 px-3 py-1.5 text-xs text-accent-300 hover:bg-accent-600/20 disabled:opacity-40">
                {saving ? <span className="truss-spinner" /> : <FloppyDisk size={13} />} Save Claims Config
              </button>
              {saved && <span className="text-[10px] text-emerald-400">Saved</span>}
            </div>
          </div>
        )}
      </div>

      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-2 text-xs font-medium text-slate-200">Claims Reference</h3>
        <div className="space-y-2 text-[11px] text-slate-400">
          <p>Claims are injected during the OAuth2 consent flow. Map claim names to static values or Kratos identity trait paths:</p>
          <pre className="rounded bg-slate-950 p-2 font-mono text-[10px] text-slate-300">{`{
  "org_id": "{{identity.metadata_public.org_id}}",
  "role": "{{identity.metadata_admin.role}}",
  "display_name": "{{identity.traits.name}}",
  "plan": "pro"
}`}</pre>
          <p className="text-[10px] text-slate-500">Template variables are resolved at consent time when the Kratos→Hydra bridge is active.</p>
        </div>
      </div>
    </div>
  );
}

// ─── ConsentView (extracted from IIFE) ──────────────────────────────────────

function ConsentView({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [consentSubject, setConsentSubject] = React.useState("");
  const [consentSessions, setConsentSessions] = React.useState<any[]>([]);
  const [isConsentLoading, setIsConsentLoading] = React.useState(false);

  const loadConsent = () => {
    if (!consentSubject.trim()) return;
    setIsConsentLoading(true);
    apiFetch(`${apiBaseUrl}/api/hydra/consent/${encodeURIComponent(consentSubject.trim())}`)
      .then(r => r.json())
      .then(data => { setConsentSessions(Array.isArray(data) ? data : []); setIsConsentLoading(false); })
      .catch(() => { setConsentSessions([]); setIsConsentLoading(false); });
  };

  const revokeConsent = (subject: string, clientId?: string) => {
    const qs = clientId ? `?client=${encodeURIComponent(clientId)}` : "";
    apiFetch(`${apiBaseUrl}/api/hydra/consent/${encodeURIComponent(subject)}${qs}`, { method: "DELETE" })
      .then(() => loadConsent());
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-100">Consent Sessions</h3>
        <p className="mb-3 text-[11px] text-slate-400">Look up and revoke consent sessions granted by a user (subject). Enter a user identifier to search.</p>
        <div className="flex gap-2">
          <input
            value={consentSubject}
            onChange={e => setConsentSubject(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadConsent()}
            placeholder="User ID or email..."
            className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600"
          />
          <button onClick={loadConsent} disabled={isConsentLoading || !consentSubject.trim()} className="truss-btn rounded border border-accent-600 bg-accent-600/20 px-4 py-1.5 text-xs text-accent-300 hover:bg-accent-600/30 disabled:opacity-40">
            {isConsentLoading ? <span className="truss-spinner" /> : <MagnifyingGlass size={14} />} Search
          </button>
        </div>
      </div>
      {consentSessions.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">{consentSessions.length} consent session{consentSessions.length !== 1 ? "s" : ""}</p>
            <button onClick={() => revokeConsent(consentSubject)} className="rounded border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/20">Revoke All</button>
          </div>
          {consentSessions.map((session: any, i: number) => (
            <div key={i} className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-200">{session.consent_request?.client?.client_name || session.consent_request?.client?.client_id || "Unknown client"}</span>
                <button onClick={() => revokeConsent(consentSubject, session.consent_request?.client?.client_id)} className="rounded border border-red-400/30 px-2 py-0.5 text-[9px] text-red-300 hover:bg-red-950/20">Revoke</button>
              </div>
              <div className="flex justify-between"><span className="text-slate-500">Client ID</span><span className="text-slate-300 font-mono">{session.consent_request?.client?.client_id}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Granted Scopes</span><span className="text-slate-300 font-mono">{(session.grant_scope || []).join(", ")}</span></div>
              {session.consent_request?.requested_at && <div className="flex justify-between"><span className="text-slate-500">Granted At</span><span className="text-slate-300">{new Date(session.consent_request.requested_at).toLocaleString()}</span></div>}
            </div>
          ))}
        </div>
      ) : consentSubject && !isConsentLoading ? (
        <div className="rounded border border-slate-800 bg-slate-950/40 p-6 text-center">
          <p className="text-xs text-slate-400">No consent sessions found for this subject.</p>
        </div>
      ) : null}
    </div>
  );
}

// ─── FlowTester (extracted from IIFE) ───────────────────────────────────────

function FlowTester({ hydraClients, hydraDiscovery, copyText }: { hydraClients: any[]; hydraDiscovery: any; copyText: (msg: string) => void }) {
  const [flowType, setFlowType] = React.useState<"auth_code" | "client_creds" | "device">("auth_code");
  const [ftClientId, setFtClientId] = React.useState("");
  const [ftClientSecret, setFtClientSecret] = React.useState("");
  const [ftRedirectUri, setFtRedirectUri] = React.useState("http://localhost:3000/callback");
  const [ftScope, setFtScope] = React.useState("openid offline_access");
  const [ftState] = React.useState(() => Math.random().toString(36).slice(2, 10));
  const [ftCodeVerifier] = React.useState(() => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  });
  const [ftStep, setFtStep] = React.useState(0);
  const [codeChallenge, setCodeChallenge] = React.useState("");

  const issuer = hydraDiscovery?.issuer || "https://hydra.example.com";
  const authEndpoint = hydraDiscovery?.authorization_endpoint || `${issuer}/oauth2/auth`;
  const tokenEndpoint = hydraDiscovery?.token_endpoint || `${issuer}/oauth2/token`;
  const deviceEndpoint = hydraDiscovery?.device_authorization_endpoint || `${issuer}/oauth2/device/auth`;

  // Compute PKCE challenge on mount (crypto.subtle requires secure context)
  React.useEffect(() => {
    if (!crypto.subtle) {
      // Fallback: use verifier as-is (no S256, plain method) — only in insecure dev contexts
      setCodeChallenge(ftCodeVerifier);
      return;
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(ftCodeVerifier);
    crypto.subtle.digest("SHA-256", data).then(hash => {
      setCodeChallenge(btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    }).catch(() => setCodeChallenge(ftCodeVerifier));
  }, [ftCodeVerifier]);

  const flows: Record<string, { name: string; steps: string[] }> = {
    auth_code: { name: "Authorization Code + PKCE", steps: ["Configure", "Authorization URL", "Exchange Code"] },
    client_creds: { name: "Client Credentials", steps: ["Configure", "Request Token"] },
    device: { name: "Device Authorization (RFC 8628)", steps: ["Configure", "Device Code", "Poll for Token"] },
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-100 mb-1">OAuth2 Flow Tester</h2>
        <p className="text-[11px] text-slate-400 mb-4">Walk through OAuth2 flows step-by-step. This generates URLs and commands you can use to test your OAuth2 integration.</p>

        <div className="mb-4 flex gap-2">
          {(Object.entries(flows) as [string, { name: string }][]).map(([key, f]) => (
            <button key={key} onClick={() => { setFlowType(key as any); setFtStep(0); }} className={`rounded px-3 py-1.5 text-[11px] ${flowType === key ? "bg-accent-600/20 text-accent-300 border border-accent-500/40" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
              {f.name}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-1">
          {flows[flowType].steps.map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="h-px w-4 bg-slate-700" />}
              <button onClick={() => setFtStep(i)} className={`rounded-full px-2.5 py-0.5 text-[10px] ${ftStep === i ? "bg-accent-600 text-white" : ftStep > i ? "bg-emerald-600/20 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>
                {i + 1}. {step}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Step 0: Configure */}
        {ftStep === 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Client ID</label>
                <input value={ftClientId} onChange={e => setFtClientId(e.target.value)} placeholder="Select from clients list" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase">Client Secret</label>
                <input type="password" value={ftClientSecret} onChange={e => setFtClientSecret(e.target.value)} placeholder="(for confidential clients)" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
              </div>
            </div>
            {flowType === "auth_code" && (
              <>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Redirect URI</label>
                  <input value={ftRedirectUri} onChange={e => setFtRedirectUri(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 uppercase">Scope</label>
                  <input value={ftScope} onChange={e => setFtScope(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-accent-500" />
                </div>
              </>
            )}
            {hydraClients.length > 0 && !ftClientId && (
              <div>
                <p className="text-[10px] text-slate-500 mb-1">Quick select a client:</p>
                <div className="flex flex-wrap gap-1">
                  {hydraClients.slice(0, 5).map((c: any) => (
                    <button key={c.client_id} onClick={() => setFtClientId(c.client_id)} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 font-mono">{c.client_name || c.client_id.slice(0, 12)}</button>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setFtStep(1)} disabled={!ftClientId} className="rounded bg-accent-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
              Next →
            </button>
          </div>
        )}

        {/* Auth Code Step 1: Authorization URL */}
        {ftStep === 1 && flowType === "auth_code" && codeChallenge && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">Open this URL in a browser to start the authorization flow:</p>
            {(() => {
              const url = `${authEndpoint}?response_type=code&client_id=${encodeURIComponent(ftClientId)}&redirect_uri=${encodeURIComponent(ftRedirectUri)}&scope=${encodeURIComponent(ftScope)}&state=${ftState}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
              return (
                <>
                  <div className="rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] text-accent-300 break-all select-all">{url}</div>
                  <div className="flex gap-2">
                    <button onClick={() => { navigator.clipboard.writeText(url); copyText("URL"); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"><ClipboardText size={13} /> Copy URL</button>
                    <button onClick={() => window.open(url, "_blank")} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"><ArrowSquareOut size={13} /> Open</button>
                  </div>
                  <p className="text-[10px] text-slate-500">After authorizing, you'll be redirected to your callback URL with a <code className="text-accent-400">code</code> parameter.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setFtStep(0)} className="text-[10px] text-slate-500 hover:text-slate-300">← Back</button>
                    <button onClick={() => setFtStep(2)} className="rounded bg-accent-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Next: Exchange Code →</button>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Auth Code Step 2: Exchange Code */}
        {ftStep === 2 && flowType === "auth_code" && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">Exchange the authorization code for tokens:</p>
            <pre className="rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 whitespace-pre-wrap">{`curl -X POST ${tokenEndpoint} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "code=AUTHORIZATION_CODE_HERE" \\
  -d "redirect_uri=${ftRedirectUri}" \\
  -d "client_id=${ftClientId}" \\${ftClientSecret ? `\n  -d "client_secret=${ftClientSecret}" \\` : ""}
  -d "code_verifier=${ftCodeVerifier}"`}</pre>
            <button onClick={() => { navigator.clipboard.writeText(`curl -X POST ${tokenEndpoint} -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=authorization_code&code=AUTHORIZATION_CODE_HERE&redirect_uri=${encodeURIComponent(ftRedirectUri)}&client_id=${encodeURIComponent(ftClientId)}${ftClientSecret ? `&client_secret=${encodeURIComponent(ftClientSecret)}` : ""}&code_verifier=${ftCodeVerifier}"`); copyText("cURL"); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"><ClipboardText size={13} /> Copy cURL</button>
            <div className="flex gap-2">
              <button onClick={() => setFtStep(1)} className="text-[10px] text-slate-500 hover:text-slate-300">← Back</button>
            </div>
          </div>
        )}

        {/* Client Credentials Step 1 */}
        {ftStep === 1 && flowType === "client_creds" && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">Request an access token using client credentials:</p>
            <pre className="rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 whitespace-pre-wrap">{`curl -X POST ${tokenEndpoint} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -u "${ftClientId}:${ftClientSecret || "CLIENT_SECRET"}" \\
  -d "grant_type=client_credentials" \\
  -d "scope=${ftScope}"`}</pre>
            <button onClick={() => { navigator.clipboard.writeText(`curl -X POST ${tokenEndpoint} -H "Content-Type: application/x-www-form-urlencoded" -u "${ftClientId}:${ftClientSecret || "CLIENT_SECRET"}" -d "grant_type=client_credentials&scope=${encodeURIComponent(ftScope)}"`); copyText("cURL"); }} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"><ClipboardText size={13} /> Copy cURL</button>
          </div>
        )}

        {/* Device Authorization Step 1 */}
        {ftStep === 1 && flowType === "device" && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">Request a device code (RFC 8628):</p>
            <pre className="rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 whitespace-pre-wrap">{`curl -X POST ${deviceEndpoint} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "client_id=${ftClientId}" \\
  -d "scope=${ftScope}"`}</pre>
            <p className="text-[10px] text-slate-500">Response includes <code className="text-accent-400">device_code</code>, <code className="text-accent-400">user_code</code>, and <code className="text-accent-400">verification_uri</code>. The user enters the code at the verification URI.</p>
            <button onClick={() => setFtStep(2)} className="rounded bg-accent-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Next: Poll for Token →</button>
          </div>
        )}

        {ftStep === 2 && flowType === "device" && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">Poll the token endpoint with the device_code until the user completes authorization:</p>
            <pre className="rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] text-slate-300 whitespace-pre-wrap">{`# Poll every 5 seconds until authorized
curl -X POST ${tokenEndpoint} \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \\
  -d "device_code=DEVICE_CODE_HERE" \\
  -d "client_id=${ftClientId}"`}</pre>
            <p className="text-[10px] text-slate-500">Returns <code className="text-amber-400">authorization_pending</code> until user approves, then returns the access token.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CreateClientModal (also used for editing) ──────────────────────────────

function CreateClientModal({ apiBaseUrl, onClose, onClientCreated, editClient }: {
  apiBaseUrl: string;
  onClose: () => void;
  onClientCreated: () => void;
  editClient?: any;
}) {
  const isEdit = !!editClient;
  const [name, setName] = React.useState(editClient?.client_name || "");
  const [grantTypes, setGrantTypes] = React.useState<string[]>(editClient?.grant_types || ["authorization_code", "refresh_token"]);
  const [responseTypes, setResponseTypes] = React.useState<string[]>(editClient?.response_types || ["code"]);
  const [redirectUris, setRedirectUris] = React.useState((editClient?.redirect_uris || []).join("\n"));
  const [scope, setScope] = React.useState(editClient?.scope || "openid offline_access");
  const [audience, setAudience] = React.useState((editClient?.audience || []).join(", "));
  const [tokenAuth, setTokenAuth] = React.useState(editClient?.token_endpoint_auth_method || "client_secret_basic");
  const [skipConsent, setSkipConsent] = React.useState(editClient?.skip_consent || false);
  const [creating, setCreating] = React.useState(false);
  const [result, setResult] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    setCreating(true);
    setError(null);
    const body: any = {
      client_name: name,
      grant_types: grantTypes,
      response_types: responseTypes,
      redirect_uris: redirectUris.split("\n").map(u => u.trim()).filter(Boolean),
      scope,
      audience: audience.split(",").map(a => a.trim()).filter(Boolean),
      token_endpoint_auth_method: tokenAuth,
      skip_consent: skipConsent,
    };
    const url = isEdit
      ? `${apiBaseUrl}/api/hydra/clients/${encodeURIComponent(editClient.client_id)}`
      : `${apiBaseUrl}/api/hydra/clients`;
    apiFetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json()).then(data => {
      setCreating(false);
      if (data.error) { setError(data.error); return; }
      if (data.client_id) {
        if (isEdit) { onClientCreated(); onClose(); }
        else { setResult(data); onClientCreated(); }
      }
    }).catch((e) => { setCreating(false); setError(e.message || "Request failed"); });
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={() => { onClose(); setResult(null); }}>
        <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <h3 className="text-sm font-semibold text-slate-100">Client Created</h3>
          <div className="space-y-2">
            <div><span className="text-[10px] text-slate-500 uppercase">Client ID</span><p className="mt-0.5 rounded bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-200 select-all">{result.client_id}</p></div>
            {result.client_secret && <div><span className="text-[10px] text-slate-500 uppercase">Client Secret</span><p className="mt-0.5 rounded bg-amber-950/20 border border-amber-500/20 px-2 py-1.5 font-mono text-xs text-amber-300 select-all">{result.client_secret}</p><p className="mt-1 text-[10px] text-amber-400">Copy this now — it won't be shown again.</p></div>}
          </div>
          <button onClick={() => { onClose(); setResult(null); }} className="w-full rounded bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-slate-100">{isEdit ? "Edit OAuth2 Client" : "Register OAuth2 Client"}</h3>
        {error && <div className="rounded border border-red-700 bg-red-950/50 p-2 text-xs text-red-300">{error}</div>}
        <div className="space-y-3">
          <div><label className="text-[10px] text-slate-500 uppercase">Client Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="My App" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500" /></div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Grant Types</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {["authorization_code", "client_credentials", "refresh_token", "implicit", "urn:ietf:params:oauth:grant-type:device_code"].map(gt => (
                <label key={gt} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" checked={grantTypes.includes(gt)} onChange={e => { if (e.target.checked) setGrantTypes([...grantTypes, gt]); else setGrantTypes(grantTypes.filter(g => g !== gt)); }} className="accent-accent-500" />
                  {gt.replace(/_/g, " ")}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Response Types</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {["code", "token", "id_token", "code id_token", "code token"].map(rt => (
                <label key={rt} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <input type="checkbox" checked={responseTypes.includes(rt)} onChange={e => { if (e.target.checked) setResponseTypes([...responseTypes, rt]); else setResponseTypes(responseTypes.filter(r => r !== rt)); }} className="accent-accent-500" />
                  {rt}{(rt === "code id_token" || rt === "code token") && <span className="text-[9px] text-slate-500">(hybrid)</span>}
                </label>
              ))}
            </div>
          </div>
          <div><label className="text-[10px] text-slate-500 uppercase">Redirect URIs (one per line)</label><textarea value={redirectUris} onChange={e => setRedirectUris(e.target.value)} rows={2} placeholder="http://localhost:3000/callback" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500 font-mono" /></div>
          <div><label className="text-[10px] text-slate-500 uppercase">Scope</label><input value={scope} onChange={e => setScope(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500 font-mono" /></div>
          <div><label className="text-[10px] text-slate-500 uppercase">Audience (comma-separated)</label><input value={audience} onChange={e => setAudience(e.target.value)} placeholder="https://api.example.com" className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500 font-mono" /></div>
          <div>
            <label className="text-[10px] text-slate-500 uppercase">Token Auth Method</label>
            <select value={tokenAuth} onChange={e => setTokenAuth(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-accent-500">
              <option value="client_secret_basic">client_secret_basic</option>
              <option value="client_secret_post">client_secret_post</option>
              <option value="private_key_jwt">private_key_jwt</option>
              <option value="none">none (public client)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={skipConsent} onChange={e => setSkipConsent(e.target.checked)} className="accent-accent-500" />
            Skip consent screen (first-party apps)
          </label>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
          <button onClick={submit} disabled={creating || !name.trim()} className="flex-1 rounded bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50">
            {creating ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Client")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Rotate Secret Button (stateful component to show secret inline) ────────

function RotateSecretButton({ clientId, apiBaseUrl, onRotated }: { clientId: string; apiBaseUrl: string; onRotated: () => void }) {
  const [rotatedSecret, setRotatedSecret] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [rotating, setRotating] = React.useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={async () => {
          setRotating(true);
          setError(null);
          try {
            const r = await apiFetch(`${apiBaseUrl}/api/hydra/clients/${encodeURIComponent(clientId)}/secret`, { method: "POST" });
            const d = await r.json();
            if (d.client_secret) {
              setRotatedSecret(d.client_secret);
              await navigator.clipboard.writeText(d.client_secret).catch(() => {});
              onRotated();
            } else {
              setError(d.error || "Failed to rotate secret");
              setTimeout(() => setError(null), 5000);
            }
          } catch {
            setError("Failed to rotate secret");
            setTimeout(() => setError(null), 5000);
          }
          setRotating(false);
        }}
        disabled={rotating}
        className="truss-btn rounded border border-amber-500/30 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
      >
        <Key size={11} /> {rotating ? "Rotating\u2026" : "Rotate Secret"}
      </button>
      {rotatedSecret && (
        <div className="rounded border border-amber-500/30 bg-amber-950/20 px-2 py-1.5 text-[10px]">
          <p className="text-amber-300 font-medium mb-1">New secret (copied to clipboard). The old secret is now invalid.</p>
          <code className="block text-slate-200 font-mono break-all select-all">{rotatedSecret}</code>
          <button onClick={() => setRotatedSecret(null)} className="mt-1 text-[9px] text-slate-500 hover:text-slate-300">Dismiss</button>
        </div>
      )}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function renderOAuth2Main(s: any): React.JSX.Element | null {
  const {
    apiBaseUrl, copyText, editorTheme,
    oauth2View, setOAuth2View, hydraClients, setHydraClients,
    isHydraLoading, setIsHydraLoading, hydraLoaded, setHydraLoaded,
    hydraDiscovery, setHydraDiscovery, hydraJwks, setHydraJwks,
    selectedHydraClient, setSelectedHydraClient, showCreateClientModal, setShowCreateClientModal,
    editingHydraClient, setEditingHydraClient,
    setHydraHealth,
  } = s;

  const hydraUrl = s.integrationsStatus?.oauth2?.publicUrl || `${apiBaseUrl || "http://localhost:8787"}/api/hydra`;
  const hydraAdminUrl = s.integrationsStatus?.oauth2?.adminUrl || hydraUrl;

  // Auto-load
  if (!hydraLoaded && !isHydraLoading) {
    setTimeout(() => {
      setIsHydraLoading(true);
      setHydraLoaded(true);
      Promise.all([
        apiFetch(`${apiBaseUrl}/api/hydra/health`).then(r => r.json()).catch(() => null),
        apiFetch(`${apiBaseUrl}/api/hydra/clients`).then(r => r.json()).catch(() => []),
        apiFetch(`${apiBaseUrl}/api/hydra/discovery`).then(r => r.json()).catch(() => null),
      ]).then(([health, clients, discovery]) => {
        setHydraHealth(health);
        setHydraClients(Array.isArray(clients) ? clients : []);
        setHydraDiscovery(discovery);
        setIsHydraLoading(false);
      });
    }, 0);
  }

  const loadHydraClients = () => {
    setIsHydraLoading(true);
    apiFetch(`${apiBaseUrl}/api/hydra/clients`).then(r => r.json()).then(data => {
      setHydraClients(Array.isArray(data) ? data : []);
      setIsHydraLoading(false);
    }).catch(() => setIsHydraLoading(false));
  };

  const deleteClient = (clientId: string) => {
    if (!confirm(`Delete OAuth2 client "${clientId}"?`)) return;
    apiFetch(`${apiBaseUrl}/api/hydra/clients/${encodeURIComponent(clientId)}`, { method: "DELETE" })
      .then(() => { loadHydraClients(); setSelectedHydraClient(null); });
  };

  const loadJwks = () => {
    apiFetch(`${apiBaseUrl}/api/hydra/jwks`).then(r => r.json()).then(setHydraJwks).catch(() => {});
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      {showCreateClientModal && <CreateClientModal apiBaseUrl={apiBaseUrl} onClose={() => setShowCreateClientModal(false)} onClientCreated={loadHydraClients} />}
      {editingHydraClient && <CreateClientModal apiBaseUrl={apiBaseUrl} editClient={editingHydraClient} onClose={() => setEditingHydraClient(null)} onClientCreated={loadHydraClients} />}
      <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
        {/* Health bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-100">OAuth2 / OpenID Connect</h2>
          </div>
          <button onClick={() => { setHydraLoaded(false); }} disabled={isHydraLoading} className="truss-btn rounded border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50">
            {isHydraLoading ? <span className="truss-spinner" /> : <ArrowsClockwise size={14} />} Refresh
          </button>
        </div>

        {/* ── Overview ── */}
        {oauth2View === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Key size={13} weight="regular" /> Clients</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{hydraClients.length}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Registered OAuth2 clients</p>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><LockKey size={13} weight="regular" /> Grant Types</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{hydraDiscovery?.grant_types_supported?.length || 0}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Supported flows</p>
              </div>
              <div className="rounded border border-slate-700 bg-slate-900/40 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><ShieldCheck size={13} weight="regular" /> Scopes</div>
                <p className="mt-1 text-xl font-semibold text-slate-100">{hydraDiscovery?.scopes_supported?.length || 0}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">Available scopes</p>
              </div>
            </div>

            {/* OIDC Discovery summary */}
            {hydraDiscovery && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <h3 className="mb-2 text-xs font-medium text-slate-200">OIDC Discovery</h3>
                <div className="grid gap-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="text-slate-500">Issuer</span><span className="text-slate-300 font-mono">{hydraDiscovery.issuer}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Authorization</span><span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.authorization_endpoint}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Token</span><span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.token_endpoint}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Userinfo</span><span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.userinfo_endpoint}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">JWKS</span><span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.jwks_uri}</span></div>
                </div>
              </div>
            )}

            {/* Grant types and scopes */}
            {hydraDiscovery && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Grant Types</p>
                  <div className="flex flex-wrap gap-1">{(hydraDiscovery.grant_types_supported || []).map((g: string) => <span key={g} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{g}</span>)}</div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-[10px] text-slate-500 uppercase mb-1">Scopes</p>
                  <div className="flex flex-wrap gap-1">{(hydraDiscovery.scopes_supported || []).map((sc: string) => <span key={sc} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 font-mono">{sc}</span>)}</div>
                </div>
              </div>
            )}

            {/* Dynamic Client Registration */}
            {hydraDiscovery && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <h3 className="mb-2 text-xs font-medium text-slate-200">Dynamic Client Registration</h3>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${hydraDiscovery.registration_endpoint ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-800 text-slate-500"}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${hydraDiscovery.registration_endpoint ? "bg-emerald-400" : "bg-slate-600"}`} />
                    {hydraDiscovery.registration_endpoint ? "Available" : "Not Available"}
                  </span>
                </div>
                {hydraDiscovery.registration_endpoint && (
                  <div className="mt-2 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-500">Registration Endpoint</span><span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.registration_endpoint}</span></div>
                    <p className="mt-1.5 text-[10px] text-slate-500">Clients can self-register via RFC 7591. POST client metadata to the registration endpoint to create a new OAuth2 client programmatically.</p>
                  </div>
                )}
                {!hydraDiscovery.registration_endpoint && (
                  <p className="mt-1.5 text-[10px] text-slate-500">Dynamic registration (RFC 7591) is not advertised by the OIDC provider. Clients must be registered manually.</p>
                )}
              </div>
            )}

            {/* Logout Endpoints */}
            {hydraDiscovery && (
              <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <h3 className="mb-2 text-xs font-medium text-slate-200">Logout</h3>
                <div className="grid gap-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">RP-Initiated Logout</span>
                    <span className="text-slate-300 font-mono truncate ml-4">{hydraDiscovery.end_session_endpoint || "Not available"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Front-Channel Logout</span>
                    <span className={`text-[10px] ${hydraDiscovery.frontchannel_logout_supported ? "text-emerald-400" : "text-slate-500"}`}>{hydraDiscovery.frontchannel_logout_supported ? "Supported" : "Not advertised"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Back-Channel Logout</span>
                    <span className={`text-[10px] ${hydraDiscovery.backchannel_logout_supported ? "text-emerald-400" : "text-slate-500"}`}>{hydraDiscovery.backchannel_logout_supported ? "Supported" : "Not advertised"}</span>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Configure per-client front-channel and back-channel logout URIs in the client detail view under Token &amp; Logout Settings.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Clients ── */}
        {oauth2View === "clients" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{hydraClients.length} client{hydraClients.length !== 1 ? "s" : ""} registered</p>
              <button onClick={() => setShowCreateClientModal(true)} className="rounded bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700">Register Client</button>
            </div>
            {hydraClients.length === 0 && !isHydraLoading && (
              <div className="rounded border border-slate-800 bg-slate-950/40 p-6 text-center">
                <p className="text-xs text-slate-400">No OAuth2 clients yet.</p>
                <p className="mt-1 text-[10px] text-slate-500">Register a client to start issuing tokens.</p>
              </div>
            )}
            {hydraClients.map((client: any) => (
              <div key={client.client_id} className="hover-reveal-actions rounded border border-slate-800 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-slate-200">{client.client_name || client.client_id}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{client.client_id}</p>
                  </div>
                  <div className="row-actions flex gap-2">
                    <button onClick={() => setSelectedHydraClient(selectedHydraClient?.client_id === client.client_id ? null : client)} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">{selectedHydraClient?.client_id === client.client_id ? "Hide" : "Details"}</button>
                    <button onClick={() => setEditingHydraClient(client)} className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800">Edit</button>
                    <button onClick={() => deleteClient(client.client_id)} className="rounded border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-950/20">Delete</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(client.grant_types || []).map((gt: string) => <span key={gt} className="rounded bg-accent-500/10 px-1.5 py-0.5 text-[9px] text-accent-300 font-mono">{gt}</span>)}
                </div>
                {selectedHydraClient?.client_id === client.client_id && (
                  <div className="mt-3 border-t border-slate-800 pt-3 space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-500">Response Types</span><span className="text-slate-300 font-mono">{(client.response_types || []).join(", ")}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Scope</span><span className="text-slate-300 font-mono">{client.scope}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Token Auth</span><span className="text-slate-300 font-mono">{client.token_endpoint_auth_method}</span></div>
                    {(client.redirect_uris || []).length > 0 && (
                      <div><span className="text-slate-500">Redirect URIs</span>{(client.redirect_uris || []).map((u: string) => <p key={u} className="text-slate-300 font-mono ml-2">{u}</p>)}</div>
                    )}
                    {(client.audience || []).length > 0 && (
                      <div className="flex justify-between"><span className="text-slate-500">Audience</span><span className="text-slate-300 font-mono">{client.audience.join(", ")}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-slate-500">Skip Consent</span><span className={client.skip_consent ? "text-emerald-400" : "text-slate-500"}>{client.skip_consent ? "Yes" : "No"}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Access Token Strategy</span><span className="text-slate-300 font-mono">{client.access_token_strategy || "opaque"}</span></div>
                    {client.frontchannel_logout_uri && <div className="flex justify-between"><span className="text-slate-500">Front-Channel Logout</span><span className="text-slate-300 font-mono truncate ml-4">{client.frontchannel_logout_uri}</span></div>}
                    {client.backchannel_logout_uri && <div className="flex justify-between"><span className="text-slate-500">Back-Channel Logout</span><span className="text-slate-300 font-mono truncate ml-4">{client.backchannel_logout_uri}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-slate-300">{client.created_at ? new Date(client.created_at).toLocaleString() : "—"}</span></div>
                    <TokenSettingsSection clientId={client.client_id} client={client} apiBaseUrl={apiBaseUrl} onUpdate={loadHydraClients} />
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800">
                      <RotateSecretButton clientId={client.client_id} apiBaseUrl={apiBaseUrl} onRotated={loadHydraClients} />
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete client "${client.client_name || client.client_id}"?`)) return;
                          try {
                            await apiFetch(`${apiBaseUrl}/api/hydra/clients/${encodeURIComponent(client.client_id)}`, { method: "DELETE" });
                            loadHydraClients();
                            setSelectedHydraClient(null);
                          } catch (err) { console.error("Failed to delete OAuth2 client:", err); }
                        }}
                        className="truss-btn rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                      >
                        <Trash size={11} /> Delete Client
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Tokens (Introspection + JWT Debugger) ── */}
        {oauth2View === "tokens" && (
          <div className="space-y-6">
            <TokenIntrospector apiBaseUrl={apiBaseUrl} />
            <div className="border-t border-slate-800 pt-4">
              <JwtDebugger copyText={copyText} setOAuth2View={setOAuth2View} />
            </div>
          </div>
        )}

        {/* ── Configuration (JWKS + Discovery + Claims) ── */}
        {oauth2View === "configuration" && (
          <div className="space-y-6">
            <JwksView apiBaseUrl={apiBaseUrl} hydraJwks={hydraJwks} loadJwks={loadJwks} />
            <div className="border-t border-slate-800 pt-4">
              <DiscoveryView apiBaseUrl={apiBaseUrl} copyText={copyText} />
            </div>
            <div className="border-t border-slate-800 pt-4">
              <ClaimsEditor apiBaseUrl={apiBaseUrl} editorTheme={editorTheme} />
            </div>
          </div>
        )}

        {/* ── Testing (Flow Tester + Consent) ── */}
        {oauth2View === "testing" && (
          <div className="space-y-6">
            <FlowTester hydraClients={hydraClients} hydraDiscovery={hydraDiscovery} copyText={copyText} />
            <div className="border-t border-slate-800 pt-4">
              <ConsentView apiBaseUrl={apiBaseUrl} />
            </div>
          </div>
        )}

      {oauth2View === "developer" && (
        <DeveloperSDK
          title="OAuth2 / OIDC SDK & Code Snippets"
          description="Ready-to-use code for OAuth2 flows, client management, and token operations."
          editorTheme={s.editorTheme}
          module="oauth2"
          placeholders={{ hydraUrl, hydraAdminUrl }}
        />
      )}

      </div>
    </div>
  );
}

// ─── PaneB ───────────────────────────────────────────────────────────────────

export function renderOAuth2PaneB(s: any): React.JSX.Element | null {
  const { oauth2View, setOAuth2View } = s;

  return (
    <div className="space-y-2">
      {([
        { id: "overview" as OAuth2View, label: "Overview", icon: <LockKey size={18} weight="regular" /> },
        { id: "clients" as OAuth2View, label: "Clients", icon: <Key size={18} weight="regular" /> },
        { id: "tokens" as OAuth2View, label: "Tokens", icon: <ShieldCheck size={18} weight="regular" /> },
        { id: "configuration" as OAuth2View, label: "Configuration", icon: <GearSix size={18} weight="regular" /> },
        { id: "testing" as OAuth2View, label: "Testing", icon: <Play size={18} weight="regular" /> },
        { id: "developer" as OAuth2View, label: "Developer", icon: <Code size={18} weight="regular" /> },
      ] as const).map((item) => (
        <button
          key={item.id}
          onClick={() => setOAuth2View(item.id)}
          className={`truss-btn truss-nav-btn w-full rounded border px-2 py-2 text-left text-xs ${
            oauth2View === item.id
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
