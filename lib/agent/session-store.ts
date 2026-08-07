import { MemorySaver } from "@langchain/langgraph";
import { getConfig } from "@/lib/config";

export type PendingApproval = {
  approvalId: string;
  callId: string;
  tool: string;
  arguments: Record<string, unknown>;
  agent: unknown;
};

export type AgentSession = {
  checkpointer: MemorySaver;
  approvedTools: Set<string>;
  deliveredToolCallIds: Set<string>;
  pending?: PendingApproval;
  lastActiveAt: number;
};

class AgentSessionStore {
  private readonly sessions = new Map<string, AgentSession>();

  get(threadId: string): AgentSession {
    this.sweep();
    const current = this.sessions.get(threadId);
    if (current) {
      // Development hot reload can preserve sessions created by an older
      // module shape. Migrate additive fields before the runtime uses them.
      if (!current.deliveredToolCallIds) current.deliveredToolCallIds = new Set();
      current.lastActiveAt = Date.now();
      return current;
    }
    const created: AgentSession = {
      checkpointer: new MemorySaver(),
      approvedTools: new Set(),
      deliveredToolCallIds: new Set(),
      lastActiveAt: Date.now(),
    };
    this.sessions.set(threadId, created);
    return created;
  }

  clear(threadId: string): void {
    this.sessions.delete(threadId);
  }

  private sweep(): void {
    const cutoff = Date.now() - getConfig().SESSION_TTL_MS;
    for (const [threadId, session] of this.sessions) {
      if (session.lastActiveAt < cutoff) this.sessions.delete(threadId);
    }
  }
}

const globalStore = globalThis as typeof globalThis & { __junyxSessionStore?: AgentSessionStore };
export const sessionStore = globalStore.__junyxSessionStore ?? new AgentSessionStore();
if (process.env.NODE_ENV !== "production") globalStore.__junyxSessionStore = sessionStore;
