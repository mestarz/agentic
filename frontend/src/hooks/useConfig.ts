import { useState, useEffect } from 'react';
import { type AppConfigs, DEFAULT_CONFIGS } from '../types';

export function useConfig() {
  const [appConfigs, setAppConfigs] = useState<AppConfigs>(() => {
    const saved = localStorage.getItem('cf_app_configs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.agentModelID) {
          return {
            agentModelID: parsed.agentModelID,
            coreModelID: parsed.coreModelID || parsed.agentModelID,
            ragEnabled: !!parsed.ragEnabled,
            ragEmbeddingModelID: parsed.ragEmbeddingModelID || DEFAULT_CONFIGS.ragEmbeddingModelID,
            sanitizationModelID: parsed.sanitizationModelID || DEFAULT_CONFIGS.sanitizationModelID,
          };
        }
      } catch (err) {
        console.warn('Failed to parse saved configs:', err);
      }
    }
    return { ...DEFAULT_CONFIGS };
  });

  const [qdrantStatus, setQdrantStatus] = useState<'connected' | 'disconnected' | 'loading'>(
    'loading',
  );

  // 持久化配置
  useEffect(() => {
    localStorage.setItem('cf_app_configs', JSON.stringify(appConfigs));
  }, [appConfigs]);

  // 状态轮询逻辑
  useEffect(() => {
    const controller = new AbortController();

    const checkStatus = async () => {
      try {
        const res = await fetch('/api/admin/status', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setQdrantStatus(data.qdrant?.status === 'connected' ? 'connected' : 'disconnected');
        } else {
          setQdrantStatus('disconnected');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setQdrantStatus('disconnected');
        }
      }
    };

    checkStatus();
    const timer = setInterval(checkStatus, 10000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return { appConfigs, setAppConfigs, qdrantStatus };
}
