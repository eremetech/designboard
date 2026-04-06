import { logger } from './logger.js';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const REAP_INTERVAL_MS = 60 * 1000; // 60 seconds
export class SessionManager {
    sessions = new Map();
    reaper;
    constructor() {
        this.reaper = setInterval(() => this.reapIdle(), REAP_INTERVAL_MS);
        this.reaper.unref();
    }
    add(sessionId, transport) {
        const now = Date.now();
        this.sessions.set(sessionId, { transport, lastActivity: now, createdAt: now, activeStreams: 0 });
    }
    get(sessionId) {
        return this.sessions.get(sessionId)?.transport;
    }
    has(sessionId) {
        return this.sessions.has(sessionId);
    }
    touch(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry)
            entry.lastActivity = Date.now();
    }
    /** Mark an SSE stream as open. Call streamEnd when it closes. */
    streamStart(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry) {
            entry.activeStreams++;
            entry.lastActivity = Date.now();
        }
    }
    streamEnd(sessionId) {
        const entry = this.sessions.get(sessionId);
        if (entry) {
            entry.activeStreams = Math.max(0, entry.activeStreams - 1);
            entry.lastActivity = Date.now();
        }
    }
    remove(sessionId) {
        this.sessions.delete(sessionId);
    }
    getStats() {
        const now = Date.now();
        let oldestAgeMs = null;
        for (const entry of this.sessions.values()) {
            const age = now - entry.createdAt;
            if (oldestAgeMs === null || age > oldestAgeMs)
                oldestAgeMs = age;
        }
        return { activeCount: this.sessions.size, oldestAgeMs };
    }
    async closeAll() {
        for (const [sid, entry] of this.sessions) {
            await entry.transport.close().catch(() => { });
            this.sessions.delete(sid);
        }
    }
    destroy() {
        clearInterval(this.reaper);
    }
    reapIdle() {
        const now = Date.now();
        const stale = [];
        for (const [sid, entry] of this.sessions) {
            if (entry.activeStreams > 0)
                continue;
            if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
                stale.push(sid);
            }
        }
        if (stale.length === 0)
            return;
        logger.info('reaping idle sessions', { count: stale.length });
        for (const sid of stale) {
            const entry = this.sessions.get(sid);
            if (entry) {
                const idleMs = now - entry.lastActivity;
                logger.info('reaping session', { sessionId: sid, idleMs });
                entry.transport.close().catch(() => { });
                this.sessions.delete(sid);
            }
        }
    }
}
//# sourceMappingURL=sessions.js.map