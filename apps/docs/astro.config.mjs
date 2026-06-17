import { defineConfig } from "astro/config";
import { execSync } from "node:child_process";
import starlight from "@astrojs/starlight";

const gitHash = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();
const DEFAULT_PORT = 5175;
const proxyUri = process.env.VSCODE_PROXY_URI;
const isCodeServer = Boolean(
  proxyUri || process.env.CODE_SERVER_VERSION || process.env.CODER
);

function inferOrigin(uri, port) {
  if (!uri) return undefined;
  try {
    const url = new URL(uri.replace("{{port}}", String(port)));
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

const origin = inferOrigin(proxyUri, DEFAULT_PORT);

export default defineConfig({
  ...(isCodeServer ? { base: `/absproxy/${DEFAULT_PORT}/` } : {}),
  server: {
    host: "0.0.0.0",
    port: DEFAULT_PORT,
  },
  integrations: [
    starlight({
      title: "Truss Docs",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [],
      components: {
        Banner: "./src/components/Banner.astro",
      },
      head: [{ tag: "meta", attrs: { name: "truss-build", content: gitHash } }],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Quickstart", slug: "getting-started/quickstart" },
            { label: "Configuration", slug: "getting-started/configuration" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Database", slug: "guides/database" },
            { label: "Extensions", slug: "guides/extensions" },
            { label: "Branching & Backups", slug: "guides/branching" },
            { label: "Migrations", slug: "guides/migrations" },
            { label: "Foreign Data Wrappers", slug: "guides/fdw" },
            { label: "Authentication", slug: "guides/authentication" },
            { label: "Multi-Factor Auth (MFA)", slug: "guides/mfa" },
            { label: "Authorization", slug: "guides/authorization" },
            { label: "Storage", slug: "guides/storage" },
            { label: "Realtime", slug: "guides/realtime" },
            { label: "Webhooks", slug: "guides/webhooks" },
            { label: "Vectors", slug: "guides/vectors" },
            { label: "Full-Text Search", slug: "guides/search" },
            { label: "OAuth2 / OIDC", slug: "guides/oauth2" },
            { label: "OAuth2 Consent Bridge", slug: "guides/oauth2-consent" },
            { label: "API Gateway", slug: "guides/gateway" },
            { label: "Feature Flags", slug: "guides/feature-flags" },
            { label: "API Keys", slug: "guides/api-keys" },
            { label: "Drizzle ORM", slug: "guides/drizzle" },
            { label: "Prisma", slug: "guides/prisma" },
            { label: "Migrate from Supabase", slug: "guides/migrate-from-supabase" },
            { label: "Troubleshooting", slug: "guides/troubleshooting" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "REST API", slug: "api-reference/rest-api" },
            { label: "Client SDK", slug: "api-reference/client-sdk" },
          ],
        },
      ],
    }),
  ],
  vite: {
    server: {
      ...(isCodeServer && origin ? { origin } : {}),
      ...(isCodeServer
        ? {
            hmr: {
              clientPort: 8081,
              protocol: "ws",
            },
          }
        : {}),
    },
  },
});
