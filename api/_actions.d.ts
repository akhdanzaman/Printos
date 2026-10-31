/**
 * Hand-written declarations for api/_actions.js.
 * Kept dependency-free so TypeScript tests can import the runtime module directly.
 */

export interface AgentActionLedgerEntry {
  requestId: string;
  action: string;
  resultId: string;
  at: string;
}

export interface AgentActionWorkspace {
  contentResearchNotes?: any[];
  metricSnapshots?: any[];
  bridgeRequests?: AgentActionLedgerEntry[];
  [key: string]: any;
}

export interface AgentActionResult<T = any> {
  workspace: AgentActionWorkspace;
  created: T | null;
  deduped: boolean;
}

export declare const AGENT_ACTIONS: readonly string[];

export declare function applyAgentAction<T = any>(
  workspace: AgentActionWorkspace,
  action: string,
  payload: Record<string, any>,
  now?: Date
): AgentActionResult<T>;