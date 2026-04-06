import { randomUUID } from 'node:crypto';
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
let minLevel = process.env.LOG_LEVEL ?? 'info';
export function setLogLevel(level) {
    minLevel = level;
}
function emit(entry) {
    if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[minLevel])
        return;
    process.stderr.write(JSON.stringify(entry) + '\n');
}
export const logger = {
    debug(message, extra) {
        emit({ timestamp: new Date().toISOString(), level: 'debug', message, ...extra });
    },
    info(message, extra) {
        emit({ timestamp: new Date().toISOString(), level: 'info', message, ...extra });
    },
    warn(message, extra) {
        emit({ timestamp: new Date().toISOString(), level: 'warn', message, ...extra });
    },
    error(message, extra) {
        emit({ timestamp: new Date().toISOString(), level: 'error', message, ...extra });
    },
};
export function createRequestLogger(toolName) {
    const requestId = randomUUID();
    const start = performance.now();
    function log(level, message, extra) {
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
//# sourceMappingURL=logger.js.map