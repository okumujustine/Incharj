import pino from "pino";

// Root logger. Outputs structured JSON, compatible with log aggregators
// and OpenTelemetry collector pipelines.
//
// To inject OpenTelemetry trace context (trace_id, span_id) into every log
// line, add a `mixin` here once the OTel SDK is set up:
//
//   import { context, trace } from "@opentelemetry/api";
//   mixin() {
//     const span = trace.getActiveSpan();
//     if (!span) return {};
//     const { traceId, spanId } = span.spanContext();
//     return { trace_id: traceId, span_id: spanId };
//   },
//
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

/**
 * Create a child logger bound to a specific module.
 * Additional static fields (e.g. connectorId) can be passed as `bindings`.
 */
export function createLogger(module: string, bindings: Record<string, unknown> = {}) {
  return logger.child({ module, ...bindings });
}
