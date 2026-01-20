export interface TraceEvent {
  source: string;
  target: string;
  action: string;
  data?: any;
  timestamp: string;
}

export interface Message {
  role: string;
  content: string;
  timestamp: string;
  meta?: any;
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
  type: string;
  script_content?: string;
  config: Record<string, any>;
}

export interface AppConfigs {
  agentModelID: string;
  coreModelID: string;
}

export const DEFAULT_CONFIGS: AppConfigs = {
  agentModelID: 'mock-model',
  coreModelID: 'mock-model',
};