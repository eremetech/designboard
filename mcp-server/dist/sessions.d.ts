import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
export interface SessionStats {
    activeCount: number;
    oldestAgeMs: number | null;
}
export declare class SessionManager {
    private sessions;
    private reaper;
    constructor();
    add(sessionId: string, transport: StreamableHTTPServerTransport): void;
    get(sessionId: string): StreamableHTTPServerTransport | undefined;
    has(sessionId: string): boolean;
    touch(sessionId: string): void;
    /** Mark an SSE stream as open. Call streamEnd when it closes. */
    streamStart(sessionId: string): void;
    streamEnd(sessionId: string): void;
    remove(sessionId: string): void;
    getStats(): SessionStats;
    closeAll(): Promise<void>;
    destroy(): void;
    private reapIdle;
}
