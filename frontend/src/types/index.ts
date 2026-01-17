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
  app_id: string;
  messages: Message[];
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