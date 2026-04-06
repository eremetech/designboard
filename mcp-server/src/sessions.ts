import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from './logger.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const REAP_INTERVAL_MS = 60 * 1000;        // 60 seconds

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
  createdAt: number;
  activeStreams: number;
}

export interface SessionStats {
  activeCount: number;
  oldestAgeMs: number | null;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private reaper: ReturnType<typeof setInterval>;

  constructor() {
    this.reaper = setInterval(() => this.reapIdle(), REAP_INTERVAL_MS);
    this.reaper.unref();
  }

  add(sessionId: string, transport: StreamableHTTPServerTransport): void {
    const now = Date.now();
    this.sessions.set(sessionId, { transport, lastActivity: now, createdAt: now, activeStreams: 0 });
  }

  get(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.sessions.get(sessionId)?.transport;
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  touch(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) entry.lastActivity = Date.now();
  }

  /** Mark an SSE stream as open. Call streamEnd when it closes. */
  streamStart(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.activeStreams++;
      entry.lastActivity = Date.now();
    }
  }

  streamEnd(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.activeStreams = Math.max(0, entry.activeStreams - 1);
      entry.lastActivity = Date.now();
    }
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getStats(): SessionStats {
    const now = Date.now();
    let oldestAgeMs: number | null = null;
    for (const entry of this.sessions.values()) {
      const age = now - entry.createdAt;
      if (oldestAgeMs === null || age > oldestAgeMs) oldestAgeMs = age;
    }
    return { activeCount: this.sessions.size, oldestAgeMs };
  }

  async closeAll(): Promise<void> {
    for (const [sid, entry] of this.sessions) {
      await entry.transport.close().catch(() => {});
      this.sessions.delete(sid);
    }
  }

  destroy(): void {
    clearInterval(this.reaper);
  }

  private reapIdle(): void {
    const now = Date.now();
    const stale: string[] = [];

    for (const [sid, entry] of this.sessions) {
      if (entry.activeStreams > 0) continue;
      if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
        stale.push(sid);
      }
    }

    if (stale.length === 0) return;

    logger.info('reaping idle sessions', { count: stale.length });
    for (const sid of stale) {
      const entry = this.sessions.get(sid);
      if (entry) {
        const idleMs = now - entry.lastActivity;
        logger.info('reaping session', { sessionId: sid, idleMs });
        entry.transport.close().catch(() => {});
        this.sessions.delete(sid);
      }
    }
  }
}
