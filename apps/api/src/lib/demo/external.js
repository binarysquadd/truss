/**
 * Demo External Service Seeding — Hydra OAuth2, Keto AuthZ, Oathkeeper Gateway, OPL versions.
 * Each section is independently wrapped in try/catch with 5s fetch timeouts.
 */

import {
  HYDRA_ADMIN_URL, HYDRA_ADMIN_TOKEN,
  KETO_WRITE_URL, KETO_ADMIN_TOKEN,
  OATHKEEPER_ADMIN_URL, OATHKEEPER_ADMIN_TOKEN,
} from "../state.js";

export async function seedExternalServices(pool) {
  // ── OAuth2 Clients (Hydra) ──
  try {
    if (HYDRA_ADMIN_URL) {
      const headers = { "Content-Type": "application/json", ...(HYDRA_ADMIN_TOKEN ? { Authorization: `Bearer ${HYDRA_ADMIN_TOKEN}` } : {}) };
      const clients = [
        { client_name: "Demo Web App", client_id: "demo-web-app", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "openid profile email offline_access", redirect_uris: ["http://localhost:3000/callback", "http://localhost:3000/auth/callback"], post_logout_redirect_uris: ["http://localhost:3000"], token_endpoint_auth_method: "none", metadata: { tenant_id: "demo", app_type: "spa", description: "Single-page web application with PKCE auth flow" } },
        { client_name: "Demo CLI Tool", client_id: "demo-cli-tool", grant_types: ["client_credentials", "urn:ietf:params:oauth:grant-type:device_code"], response_types: ["token"], scope: "openid api:read api:write", redirect_uris: [], token_endpoint_auth_method: "client_secret_post", metadata: { tenant_id: "demo", app_type: "cli", description: "Command-line tool with device code and M2M auth" } },
        { client_name: "Demo Mobile App", client_id: "demo-mobile-app", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "openid profile email offline_access", redirect_uris: ["com.example.demoapp://callback", "com.example.demoapp://auth/redirect"], post_logout_redirect_uris: ["com.example.demoapp://logout"], token_endpoint_auth_method: "none", metadata: { tenant_id: "demo", app_type: "mobile", description: "Native mobile app with PKCE auth flow and custom scheme redirect" } },
      ];
      for (const body of clients) {
        try {
          const r = await fetch(`${HYDRA_ADMIN_URL}/admin/clients/${body.client_id}`, { headers, signal: AbortSignal.timeout(5000) });
          if (r.ok) continue;
          await fetch(`${HYDRA_ADMIN_URL}/admin/clients`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
        } catch { /* non-fatal */ }
      }
      console.log("Demo seed: OAuth2 clients seeded");
    }
  } catch (err) { console.warn("Demo seed: OAuth2 clients failed:", err.message); }

  // ── Keto Relationships ──
  try {
    if (KETO_WRITE_URL) {
      const headers = { "Content-Type": "application/json", ...(KETO_ADMIN_TOKEN ? { Authorization: `Bearer ${KETO_ADMIN_TOKEN}` } : {}) };
      const prefix = "t_demo__";
      const tuples = [
        { namespace: `${prefix}Project`, object: "acme-app", relation: "owner", subject_id: "alice-demo" },
        { namespace: `${prefix}Project`, object: "acme-app", relation: "editor", subject_id: "bob-demo" },
        { namespace: `${prefix}Project`, object: "acme-app", relation: "editor", subject_id: "grace-demo" },
        { namespace: `${prefix}Project`, object: "acme-app", relation: "viewer", subject_id: "carol-demo" },
        { namespace: `${prefix}Project`, object: "acme-app", relation: "viewer", subject_id: "dave-demo" },
        { namespace: `${prefix}Project`, object: "internal-tools", relation: "owner", subject_id: "hank-demo" },
        { namespace: `${prefix}Project`, object: "internal-tools", relation: "editor", subject_id: "alice-demo" },
        { namespace: `${prefix}Project`, object: "internal-tools", relation: "viewer", subject_id: "eve-demo" },
        { namespace: `${prefix}Project`, object: "mobile-app", relation: "owner", subject_id: "bob-demo" },
        { namespace: `${prefix}Project`, object: "mobile-app", relation: "editor", subject_id: "carol-demo" },
        { namespace: `${prefix}Project`, object: "mobile-app", relation: "viewer", subject_id: "grace-demo" },
        { namespace: `${prefix}Project`, object: "acme-app", relation: "editor", subject_set: { namespace: `${prefix}Team`, object: "engineering", relation: "member" } },
        { namespace: `${prefix}Project`, object: "mobile-app", relation: "viewer", subject_set: { namespace: `${prefix}Team`, object: "design", relation: "member" } },
        { namespace: `${prefix}Document`, object: "design-spec", relation: "owner", subject_id: "carol-demo" },
        { namespace: `${prefix}Document`, object: "design-spec", relation: "editor", subject_id: "bob-demo" },
        { namespace: `${prefix}Document`, object: "design-spec", relation: "viewer", subject_id: "eve-demo" },
        { namespace: `${prefix}Document`, object: "roadmap", relation: "owner", subject_id: "alice-demo" },
        { namespace: `${prefix}Document`, object: "roadmap", relation: "editor", subject_id: "hank-demo" },
        { namespace: `${prefix}Document`, object: "roadmap", relation: "viewer", subject_id: "eve-demo" },
        { namespace: `${prefix}Document`, object: "roadmap", relation: "viewer", subject_id: "dave-demo" },
        { namespace: `${prefix}Document`, object: "api-docs", relation: "owner", subject_id: "dave-demo" },
        { namespace: `${prefix}Document`, object: "api-docs", relation: "editor", subject_id: "alice-demo" },
        { namespace: `${prefix}Document`, object: "onboarding-guide", relation: "owner", subject_id: "grace-demo" },
        { namespace: `${prefix}Document`, object: "onboarding-guide", relation: "viewer", subject_set: { namespace: `${prefix}Team`, object: "engineering", relation: "member" } },
        { namespace: `${prefix}Team`, object: "engineering", relation: "admin", subject_id: "alice-demo" },
        { namespace: `${prefix}Team`, object: "engineering", relation: "member", subject_id: "bob-demo" },
        { namespace: `${prefix}Team`, object: "engineering", relation: "member", subject_id: "dave-demo" },
        { namespace: `${prefix}Team`, object: "engineering", relation: "member", subject_id: "hank-demo" },
        { namespace: `${prefix}Team`, object: "design", relation: "admin", subject_id: "carol-demo" },
        { namespace: `${prefix}Team`, object: "design", relation: "member", subject_id: "grace-demo" },
        { namespace: `${prefix}Team`, object: "design", relation: "member", subject_id: "eve-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "admin", subject_id: "alice-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "bob-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "carol-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "dave-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "eve-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "grace-demo" },
        { namespace: `${prefix}Organization`, object: "acme-corp", relation: "member", subject_id: "hank-demo" },
      ];
      for (const tuple of tuples) {
        try {
          const body = { namespace: tuple.namespace, object: tuple.object, relation: tuple.relation };
          if (tuple.subject_id) body.subject_id = tuple.subject_id;
          if (tuple.subject_set) body.subject_set = tuple.subject_set;
          await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, { method: "PUT", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
        } catch { /* non-fatal */ }
      }
      console.log("Demo seed: Keto relationships seeded (38 tuples)");
    }
  } catch (err) { console.warn("Demo seed: Keto relationships failed:", err.message); }

  // ── OPL Version History ──
  try {
    await pool.query(`INSERT INTO truss_internal.opl_versions (tenant_id, name, content, created_by) VALUES ('demo', 'default', $1, 'demo-seed'), ('demo', 'default', $2, 'demo-seed') ON CONFLICT DO NOTHING`, [
      `class User implements Namespace {}\n\nclass Organization implements Namespace {\n  related: {\n    admins: User[]\n    members: User[]\n  }\n}\n\nclass Project implements Namespace {\n  related: {\n    org: Organization[]\n    owners: User[]\n    editors: (User | SubjectSet<Team, "member">)[]\n    viewers: User[]\n  }\n\n  permits = {\n    view: (ctx: Context): boolean =>\n      this.related.viewers.includes(ctx.subject) ||\n      this.permits.edit(ctx),\n    edit: (ctx: Context): boolean =>\n      this.related.editors.includes(ctx.subject) ||\n      this.permits.own(ctx),\n    own: (ctx: Context): boolean =>\n      this.related.owners.includes(ctx.subject),\n  }\n}\n\nclass Document implements Namespace {\n  related: {\n    owners: User[]\n    editors: User[]\n    viewers: (User | SubjectSet<Team, "member">)[]\n    parent: Project[]\n  }\n\n  permits = {\n    view: (ctx: Context): boolean =>\n      this.related.viewers.includes(ctx.subject) ||\n      this.permits.edit(ctx),\n    edit: (ctx: Context): boolean =>\n      this.related.editors.includes(ctx.subject) ||\n      this.permits.own(ctx),\n    own: (ctx: Context): boolean =>\n      this.related.owners.includes(ctx.subject),\n  }\n}\n\nclass Team implements Namespace {\n  related: {\n    admin: User[]\n    member: User[]\n  }\n}`,
      `class User implements Namespace {}\n\nclass Organization implements Namespace {\n  related: {\n    admins: User[]\n    members: User[]\n  }\n}\n\nclass Project implements Namespace {\n  related: {\n    org: Organization[]\n    owners: User[]\n    editors: (User | SubjectSet<Team, "member">)[]\n    viewers: User[]\n  }\n\n  permits = {\n    view: (ctx: Context): boolean =>\n      this.related.viewers.includes(ctx.subject) ||\n      this.permits.edit(ctx),\n    edit: (ctx: Context): boolean =>\n      this.related.editors.includes(ctx.subject) ||\n      this.permits.own(ctx),\n    own: (ctx: Context): boolean =>\n      this.related.owners.includes(ctx.subject) ||\n      this.related.org.traverse((o) => o.related.admins.includes(ctx.subject)),\n  }\n}\n\nclass Document implements Namespace {\n  related: {\n    owners: User[]\n    editors: User[]\n    viewers: (User | SubjectSet<Team, "member">)[]\n    parent: Project[]\n  }\n\n  permits = {\n    view: (ctx: Context): boolean =>\n      this.related.viewers.includes(ctx.subject) ||\n      this.permits.edit(ctx) ||\n      this.related.parent.traverse((p) => p.permits.view(ctx)),\n    edit: (ctx: Context): boolean =>\n      this.related.editors.includes(ctx.subject) ||\n      this.permits.own(ctx) ||\n      this.related.parent.traverse((p) => p.permits.edit(ctx)),\n    own: (ctx: Context): boolean =>\n      this.related.owners.includes(ctx.subject),\n  }\n}\n\nclass Team implements Namespace {\n  related: {\n    admin: User[]\n    member: User[]\n  }\n}`,
    ]);
    console.log("Demo seed: OPL version history seeded");
  } catch (err) { console.warn("Demo seed: OPL versions failed:", err.message); }

  // ── Oathkeeper Gateway Rules ──
  try {
    if (OATHKEEPER_ADMIN_URL) {
      const headers = { "Content-Type": "application/json", ...(OATHKEEPER_ADMIN_TOKEN ? { Authorization: `Bearer ${OATHKEEPER_ADMIN_TOKEN}` } : {}) };
      const rules = [
        { id: "demo-rule-public-api", description: "Public API endpoints — no authentication required", match: { url: "<https://api.example.com/public/<**>>", methods: ["GET", "HEAD", "OPTIONS"] }, authenticators: [{ handler: "anonymous" }], authorizer: { handler: "allow" }, mutators: [{ handler: "noop" }] },
        { id: "demo-rule-authenticated-api", description: "Authenticated API — requires valid JWT bearer token", match: { url: "<https://api.example.com/v1/<**>>", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }, authenticators: [{ handler: "jwt", config: { jwks_urls: ["https://api.example.com/.well-known/jwks.json"], required_scope: ["openid"] } }], authorizer: { handler: "allow" }, mutators: [{ handler: "header", config: { headers: { "X-User": "{{ print .Subject }}" } } }] },
        { id: "demo-rule-admin-panel", description: "Admin panel — requires cookie session + admin role check", match: { url: "<https://admin.example.com/<**>>", methods: ["GET", "POST", "PUT", "DELETE"] }, authenticators: [{ handler: "cookie_session", config: { check_session_url: "https://auth.example.com/sessions/whoami" } }], authorizer: { handler: "remote_json", config: { remote: "https://keto.example.com/relation-tuples/check", payload: '{"namespace":"admin","object":"panel","relation":"access","subject_id":"{{ print .Subject }}"}' } }, mutators: [{ handler: "header", config: { headers: { "X-User": "{{ print .Subject }}", "X-Role": "admin" } } }] },
        { id: "demo-rule-webhook-receiver", description: "Webhook receiver — anonymous access with rate limiting", match: { url: "<https://api.example.com/webhooks/<**>>", methods: ["POST"] }, authenticators: [{ handler: "anonymous" }], authorizer: { handler: "allow" }, mutators: [{ handler: "noop" }] },
      ];
      for (const rule of rules) {
        try { await fetch(`${OATHKEEPER_ADMIN_URL}/rules`, { method: "PUT", headers, body: JSON.stringify(rule), signal: AbortSignal.timeout(5000) }); } catch { /* non-fatal */ }
      }
      console.log("Demo seed: Oathkeeper gateway rules seeded");
    }
  } catch (err) { console.warn("Demo seed: Oathkeeper rules failed:", err.message); }
}
