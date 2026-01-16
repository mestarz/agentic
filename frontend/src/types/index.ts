export interface LLMConfig { provider: string; base_url: string; api_key: string; model: string; }
export interface SessionSummary { id: string; app_id: string; updated_at: string; msg_count: number; }
export interface TraceEvent { source: string; target: string; action: string; data?: any; timestamp: string; }
export interface Message { role: string; content: string; timestamp: string; meta?: any; traces?: TraceEvent[]; }
export interface Session { id: string; app_id: string; messages: Message[]; }
export interface AppConfigs { agent: LLMConfig; core: LLMConfig; }

export const EMPTY_CFG: LLMConfig = { provider: 'gemini', base_url: '', api_key: '', model: 'gemini-1.5-flash' };
