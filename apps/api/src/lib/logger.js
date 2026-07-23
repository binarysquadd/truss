import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || "info";

// Trace–log correlation and OTLP log export are handled by @opentelemetry/instrumentation-pino
// (enabled in src/otel.js when an OTLP endpoint is configured): it stamps trace_id/span_id onto
// every line and emits the record through the Logs SDK. With tracing off it is a no-op, so the
// default self-hoster just gets structured JSON on stdout, unchanged.
const logger = pino({
  level,
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
