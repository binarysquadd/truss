/**
 * OpenTelemetry bootstrap (unified SDK).
 *
 * Loaded BEFORE the app via `node --import ./src/otel.js src/index.js` so the OTEL global
 * providers are installed before app modules create instruments, and the auto-instrumentations
 * can patch http / express / pg / ioredis as they load.
 *
 * Signal policy ("instrument, don't impose"):
 *   - METRICS are ALWAYS on: a Prometheus scrape endpoint (/metrics, served by the app) works with
 *     zero config, and metrics are ALSO pushed via OTLP when an endpoint is configured.
 *   - TRACES (and OTLP metric push) are opt-in, gated by OTEL_EXPORTER_OTLP_ENDPOINT
 *     (or OTEL_TRACES_EXPORTER=console for debug).
 *
 * All behavior follows standard OTEL_* env vars (service name, sampling, headers).
 */
import { metrics } from "@opentelemetry/api";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const consoleMode = process.env.OTEL_TRACES_EXPORTER === "console";
const serviceName = process.env.OTEL_SERVICE_NAME || "truss-api";
const resource = resourceFromAttributes({ "service.name": serviceName });

// ── Metrics: always on ─────────────────────────────────────────────────────
// Prometheus pull (preventServerStart: the app serves /metrics itself via the
// exporter's request handler, so we keep one HTTP server on :8787) + optional OTLP push.
const prometheusExporter = new PrometheusExporter({ preventServerStart: true });
const metricReaders = [prometheusExporter];
if (endpoint) {
  const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
  metricReaders.push(new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }));
}
// RED histogram buckets are pinned via the instrument's `advice` in lib/metrics.js.
const meterProvider = new MeterProvider({ resource, readers: metricReaders });
metrics.setGlobalMeterProvider(meterProvider);
// Shared with lib/metrics.js's /metrics handler (otel.js loads before the app bundle).
globalThis.__trussPrometheusExporter = prometheusExporter;
process.on("SIGTERM", () => { meterProvider.shutdown().catch(() => {}); });

// ── Traces (+ OTLP metric push already wired above): opt-in ────────────────
if (endpoint || consoleMode) {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { ConsoleSpanExporter, SimpleSpanProcessor, BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");

  const spanProcessor = consoleMode
    ? new SimpleSpanProcessor(new ConsoleSpanExporter())
    : new BatchSpanProcessor(new OTLPTraceExporter());

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [spanProcessor],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // We inject trace_id/span_id into logs via a pino mixin (lib/logger.js).
        "@opentelemetry/instrumentation-pino": { enabled: false },
      }),
    ],
  });

  sdk.start();
  process.stderr.write(`[otel] tracing enabled → ${consoleMode ? "console" : endpoint}\n`);
  process.on("SIGTERM", () => { sdk.shutdown().catch(() => {}); });
}
