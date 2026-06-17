import { defineConfig, loadEnv } from "vite";
import { execSync } from "child_process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DEFAULT_PORT = 5173;

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function inferOriginFromProxyUri(proxyUri: string | undefined): string | undefined {
  if (!proxyUri) {
    return undefined;
  }

  const expanded = proxyUri.replace("{{port}}", String(DEFAULT_PORT));
  try {
    const url = new URL(expanded);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

export default defineConfig(({ mode }) => {
  const rootDir = new URL("../../", import.meta.url).pathname;
  const env = loadEnv(mode, rootDir, "");
  const port = toInt(env.VITE_DEV_PORT, DEFAULT_PORT);
  const isCodeServer = Boolean(
    env.VSCODE_PROXY_URI || env.CODE_SERVER_VERSION || env.CODER
  );

  const base = isCodeServer
    ? withTrailingSlash(env.VITE_DEV_BASE || `/absproxy/${port}/`)
    : "/";
  const basePath = base.replace(/\/$/, "");
  const origin = env.VITE_DEV_ORIGIN || inferOriginFromProxyUri(env.VSCODE_PROXY_URI);
  const hmrClientPort = toInt(env.VITE_HMR_CLIENT_PORT, 8081);
  const proxiedApiPrefix = `${basePath}/api`;

  const gitHash = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();
  const buildTime = new Date().toISOString();

  return {
    base,
    envDir: "../../",
    define: {
      __BUILD_HASH__: JSON.stringify(gitHash),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      {
        name: "inject-build-meta",
        transformIndexHtml(html: string) {
          return html.replace("</head>", `<meta name="truss-build" content="${gitHash}" data-time="${buildTime}">\n</head>`);
        },
      },
      react(),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            monaco: ["monaco-editor", "@monaco-editor/react"],
            reactflow: ["@xyflow/react"],
            phosphor: ["@phosphor-icons/react"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
        "/v1": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
        },
        [proxiedApiPrefix]: {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
          rewrite: (path) => path.replace(proxiedApiPrefix, "/api"),
        },
      },
      ...(isCodeServer && origin ? { origin } : {}),
      ...(isCodeServer
        ? {
            hmr: {
              clientPort: hmrClientPort,
              protocol: "ws" as const,
            },
          }
        : {}),
    },
  };
});
