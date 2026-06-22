/**
 * OpenTelemetry tracing bootstrap.
 *
 * Loaded BEFORE the app via `node --import ./src/otel.js src/index.js` (and the same in the
 * Docker CMD) so the auto-instrumentations can patch http / express / pg / ioredis as they
 * load — turning every request into a span tree (HTTP → route → DB queries → outbound calls)
 * with no manual code.
 *
 * Opt-in, per the "instrument, don't impose" principle — tracing is OFF unless the operator
 * configures an exporter, so default self-hosters pay nothing:
 *   - OTEL_EXPORTER_OTLP_ENDPOINT=https://collector:4318  → export via OTLP/HTTP
 *   - OTEL_TRACES_EXPORTER=console                          → print spans to stdout (debug)
 *
 * All other behavior follows the standard OTEL_* env vars (service name, sampling, headers).
 * This file is self-contained (only OpenTelemetry imports) so it can be copied into the
 * runtime image and run via --import without the app bundle.
 */
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const consoleMode = process.env.OTEL_TRACES_EXPORTER === "console";

if (endpoint || consoleMode) {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { getNodeAutoInstrumentations } = await import("@opentelemetry/auto-instrumentations-node");
  const { ConsoleSpanExporter, SimpleSpanProcessor, BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");

  const spanProcessor = consoleMode
    ? new SimpleSpanProcessor(new ConsoleSpanExporter())   // immediate, for debugging
    : new BatchSpanProcessor(new OTLPTraceExporter());      // batched, reads OTEL_EXPORTER_OTLP_ENDPOINT

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || "truss-api",
    spanProcessors: [spanProcessor],
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs spans are extremely chatty and rarely useful; everything else stays on.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // We inject trace_id/span_id into logs ourselves via a pino mixin (lib/logger.js),
        // so disable the pino auto-instrumentation to avoid double-injection.
        "@opentelemetry/instrumentation-pino": { enabled: false },
      }),
    ],
  });

  sdk.start();
  process.stderr.write(`[otel] tracing enabled → ${consoleMode ? "console" : endpoint}\n`);
  process.on("SIGTERM", () => { sdk.shutdown().catch(() => {}); });
}
