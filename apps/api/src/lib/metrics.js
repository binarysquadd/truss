/**
 * Prometheus metrics. Exposes a /metrics endpoint (scraped by Prometheus) with:
 *   - Node process metrics (CPU, memory, event-loop lag, GC) via collectDefaultMetrics
 *   - an HTTP request-duration histogram (the RED method: Rate/Errors/Duration all derive
 *     from this one instrument, via its _count and the status_code label)
 *   - a Postgres pool gauge
 *
 * Cardinality note: the `route` label is the Express route TEMPLATE (e.g. /v1/db/:table),
 * never the raw path, so a table named "users" vs "orders" does not create new series.
 */
import client from "prom-client";
import { getPool } from "./state.js";

export const register = new client.Registry();
register.setDefaultLabels({ service: "truss-api" });
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: "truss_http_request_duration_seconds",
  help: "HTTP request duration in seconds, by method, route, and status_code.",
  labelNames: ["method", "route", "status_code"],
  // Buckets tuned for an API: 5ms up to 10s.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Postgres pool saturation (the USE method for the DB connection resource).
new client.Gauge({
  name: "truss_db_pool_connections",
  help: "Postgres connection-pool size by state (total/idle/waiting).",
  labelNames: ["state"],
  registers: [register],
  collect() {
    const pool = getPool();
    if (!pool) return;
    this.set({ state: "total" }, pool.totalCount ?? 0);
    this.set({ state: "idle" }, pool.idleCount ?? 0);
    this.set({ state: "waiting" }, pool.waitingCount ?? 0);
  },
});

// Times every request and records it on response finish.
export function metricsMiddleware(req, res, next) {
  const stop = httpDuration.startTimer();
  res.on("finish", () => {
    // req.route is populated once a route matches; unmatched paths bucket together
    // so 404 scans can't explode cardinality.
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : "unmatched";
    stop({ method: req.method, route, status_code: res.statusCode });
  });
  next();
}

// GET /metrics handler (Prometheus text exposition format).
export async function metricsHandler(_req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
