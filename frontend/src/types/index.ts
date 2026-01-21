export interface TraceEvent {
  source: string;
  target: string;
  action: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

export interface Message {
  role: string;
  content: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  traces?: TraceEvent[];
}

export interface Session {
  id: string;
  name?: string;
  app_id: string;
  messages: Message[];
}

export interface SessionSummary {
  id: string;
  name?: string;
  app_id: string;
  updated_at: string;
  msg_count: number;
}

export interface TestCase {
  id: string;
  name: string;
  app_id: string;
  prompts: string[];
  created_at: string;
}

export interface TestCaseSummary {
  id: string;
  name: string;
  created_at: string;
  step_count: number;
}

export interface ModelAdapterConfig {
  id: string;
  name: string;
  purpose: 'chat' | 'embedding';
  type: string;
  script_content?: string;
  config: Record<string, unknown>;
}

export interface AppConfigs {
  agentModelID: string;

  coreModelID: string;

  ragEnabled: boolean;

  ragEmbeddingModelID: string;
}

export const DEFAULT_CONFIGS: AppConfigs = {
  agentModelID: 'mock-model',

  coreModelID: 'mock-model',

  ragEnabled: false,

  ragEmbeddingModelID: 'text-embedding-3-small',
};
