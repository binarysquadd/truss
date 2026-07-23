/**
 * Application metrics via the OpenTelemetry Metrics SDK.
 *
 * The global MeterProvider (+ Prometheus scrape exporter + optional OTLP push) is installed in
 * src/otel.js, which runs via `node --import` before this module loads. Here we only create the
 * instruments and the middleware.
 *
 *   - truss_http_request_duration_seconds  RED histogram (Rate/Errors/Duration derive from it)
 *   - truss_db_pool_connections            USE gauge (Postgres pool saturation)
 *
 * Instrument NAMES are pinned to their historical values so the committed Grafana dashboard and
 * PrometheusRule alerts keep working across the prom-client → OTEL migration. Cardinality note: the
 * `route` label is the Express route TEMPLATE (never the raw path), so table names don't create series.
 */
import { metrics } from "@opentelemetry/api";
import { getPool } from "./state.js";

const meter = metrics.getMeter("truss-api");

// RED: one histogram, buckets pinned via a View in otel.js. Unit intentionally omitted so the
// Prometheus exporter does not append a "_seconds" suffix (the name already carries the unit).
const httpDuration = meter.createHistogram("truss_http_request_duration_seconds", {
  description: "HTTP request duration in seconds, by method, route, and status_code.",
  // Pin buckets (5ms..10s, API-tuned) so they don't fall back to OTEL defaults.
  advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
});

// USE: observable gauge, read from the live pool on each collection.
meter
  .createObservableGauge("truss_db_pool_connections", {
    description: "Postgres connection-pool size by state (total/idle/waiting).",
  })
  .addCallback((result) => {
    const pool = getPool();
    if (!pool) return;
    result.observe(pool.totalCount ?? 0, { state: "total" });
    result.observe(pool.idleCount ?? 0, { state: "idle" });
    result.observe(pool.waitingCount ?? 0, { state: "waiting" });
  });

// Times every request and records duration on response finish.
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    // req.route is populated once a route matches; unmatched paths bucket together so 404 scans
    // can't explode cardinality.
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : "unmatched";
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpDuration.record(seconds, { method: req.method, route, status_code: res.statusCode });
  });
  next();
}

// GET /metrics handler (Prometheus text exposition), backed by the OTEL Prometheus exporter that
// otel.js registered on the global MeterProvider.
export async function metricsHandler(req, res) {
  const exporter = globalThis.__trussPrometheusExporter;
  if (!exporter) {
    res.status(503).type("text/plain").end("# metrics provider not initialized\n");
    return;
  }
  exporter.getMetricsRequestHandler(req, res);
}
