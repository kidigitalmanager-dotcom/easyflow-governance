/**
 * Structured JSON logger for Lambda.
 * Outputs to CloudWatch in structured format for easy querying.
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  tenantId?: string;
  [key: string]: unknown;
}

let _requestId: string | undefined;
let _tenantId: string | undefined;

export function setContext(requestId?: string, tenantId?: string) {
  _requestId = requestId;
  _tenantId = tenantId;
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId: _requestId,
    tenantId: _tenantId,
    ...meta,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      if (process.env.LOG_LEVEL === "debug") console.debug(output);
      break;
    default:
      console.info(output);
  }
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
};
