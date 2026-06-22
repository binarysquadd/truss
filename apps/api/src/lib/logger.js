import pino from "pino";
import { trace } from "@opentelemetry/api";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || "info";

// Trace–log correlation: when a span is active (tracing enabled), stamp every log line with
// the trace/span id so you can pivot from a metric spike → the trace → these exact logs.
// No-ops when tracing is off (no active span) — `@opentelemetry/api` returns a no-op there.
function traceMixin() {
  const ctx = trace.getActiveSpan()?.spanContext();
  return ctx?.traceId ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
}

const logger = pino({
  level,
  mixin: traceMixin,
  // Redact secrets that may appear in logged objects (auth headers, cookies, tokens, keys)
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-session-token']",
      "*.secret",
      "*.password",
      "*.token",
      "*.apikey",
    ],
    censor: "***",
  },
  // Add base fields to every log line
  base: isProduction ? { service: "truss-api" } : undefined,
  // Timestamp format
  timestamp: isProduction
    ? pino.stdTimeFunctions.isoTime
    : pino.stdTimeFunctions.epochTime,
  // Dev: pretty-print with colors. Prod: structured JSON (for log aggregators)
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
            messageFormat: "{msg}",
            singleLine: false,
          },
        },
      }),
});

export default logger;
