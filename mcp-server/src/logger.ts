import { randomUUID } from 'node:crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';

export function setLogLevel(level: LogLevel) {
  minLevel = level;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  requestId?: string;
  message: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry) {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel]) return;
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug(message: string, extra?: Record<string, unknown>) {
    emit({ timestamp: new Date().toISOString(), level: 'debug', message, ...extra });
  },
  info(message: string, extra?: Record<string, unknown>) {
    emit({ timestamp: new Date().toISOString(), level: 'info', message, ...extra });
  },
  warn(message: string, extra?: Record<string, unknown>) {
    emit({ timestamp: new Date().toISOString(), level: 'warn', message, ...extra });
  },
  error(message: string, extra?: Record<string, unknown>) {
    emit({ timestamp: new Date().toISOString(), level: 'error', message, ...extra });
  },
};

export interface RequestLogger {
  requestId: string;
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
  /** Returns elapsed ms since creation. */
  elapsed(): number;
}

export function createRequestLogger(toolName: string): RequestLogger {
  const requestId = randomUUID();
  const start = performance.now();

  function log(level: LogLevel, message: string, extra?: Record<string, unknown>) {
    emit({
      timestamp: new Date().toISOString(),
      level,
      requestId,
      message,
      tool: toolName,
      ...extra,
    });
  }

  return {
    requestId,
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    elapsed: () => Math.round((performance.now() - start) * 100) / 100,
  };
}
