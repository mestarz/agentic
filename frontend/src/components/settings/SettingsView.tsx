import { useState, useEffect } from 'react';
import { Settings, Zap, Cpu, ShieldCheck, Database, Search } from 'lucide-react';
import type { AppConfigs, ModelAdapterConfig } from '../../types';
import { ConfigBlock } from './ConfigBlock';

interface SettingsViewProps {
  appConfigs: AppConfigs;
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
  qdrantStatus: 'connected' | 'disconnected' | 'loading';
  onBack: () => void;
}

export function SettingsView({
  appConfigs,
  setAppConfigs,
  qdrantStatus,
  onBack,
}: SettingsViewProps) {
  const [models, setModels] = useState<ModelAdapterConfig[]>([]);

  useEffect(() => {
    fetch('/api/models/models')
      .then((res) => res.json())
      .then((data) => {
        const loaded = (data.data || []).map((m: ModelAdapterConfig) => ({
          ...m,
          purpose: m.purpose || 'chat',
        }));
        setModels(loaded);
      })
      .catch((err) => console.error('Failed to load models', err));
  }, []);

  const chatModels = models.filter((m) => m.purpose === 'chat');
  const embeddingModels = models.filter((m) => m.purpose === 'embedding');

  return (
    <main className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50 p-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl">
              <Settings size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-800 uppercase">
                阶段模型配置
              </h1>
              <p className="mt-1 text-xs font-bold tracking-widest text-emerald-600 text-slate-500 uppercase">
                在此指定不同执行阶段所使用的模型适配器
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-black tracking-widest text-white uppercase shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700"
          >
            返回控制台
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <ConfigBlock
            title="对话生成阶段 (Agent LLM)"
            icon={Zap}
            type="agentModelID"
            selectedID={appConfigs.agentModelID}
            models={chatModels}
            setAppConfigs={setAppConfigs}
          />
          <ConfigBlock
            title="上下文压缩阶段 (Core Engine)"
            icon={Cpu}
            type="coreModelID"
            selectedID={appConfigs.coreModelID}
            models={chatModels}
            setAppConfigs={setAppConfigs}
          />
        </div>

        {/* RAG 配置板块 */}
        <div className="mt-8 rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-inner">
                <Database size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black tracking-widest text-slate-800 uppercase">
                  RAG 检索增强生成 (Qdrant)
                </h3>
                <div className="mt-1 flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      qdrantStatus === 'connected'
                        ? 'animate-pulse bg-emerald-500'
                        : qdrantStatus === 'loading'
                          ? 'bg-amber-400'
                          : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-[10px] font-bold tracking-tighter text-slate-400 uppercase">
                    Qdrant Status: {qdrantStatus ? qdrantStatus.toUpperCase() : 'UNKNOWN'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-1.5">
              <button
                onClick={() => setAppConfigs((prev) => ({ ...prev, ragEnabled: false }))}
                className={`rounded-xl px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${!appConfigs.ragEnabled ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Disabled
              </button>
              <button
                onClick={() => setAppConfigs((prev) => ({ ...prev, ragEnabled: true }))}
                className={`rounded-xl px-4 py-2 text-[10px] font-black tracking-widest uppercase transition-all ${appConfigs.ragEnabled ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Enabled
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
            <div
              className={`transition-opacity duration-300 ${!appConfigs.ragEnabled ? 'pointer-events-none opacity-40' : 'opacity-100'}`}
            >
              <label className="mb-3 ml-1 block text-[10px] font-black tracking-widest text-slate-400 uppercase">
                Embedding 模型适配器
              </label>
              <div className="group relative">
                <div className="absolute top-1/2 left-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-600">
                  <Search size={16} />
                </div>
                <select
                  value={appConfigs.ragEmbeddingModelID}
                  onChange={(e) =>
                    setAppConfigs((prev) => ({ ...prev, ragEmbeddingModelID: e.target.value }))
                  }
                  className="w-full appearance-none rounded-2xl border-2 border-slate-50 bg-slate-50 py-4 pr-4 pl-12 text-sm font-bold text-slate-700 transition-all outline-none focus:border-indigo-100 focus:bg-white"
                >
                  {embeddingModels.length > 0 ? (
                    embeddingModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type.toUpperCase()})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      请先在模型管理中添加向量模型
                    </option>
                  )}
                </select>
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6">
              <h4 className="mb-2 text-[10px] font-black tracking-widest text-indigo-600 uppercase">
                数据灌入说明
              </h4>
              <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                若要启用 RAG，需确保 Qdrant 容器已启动。你可以通过执行{' '}
                <code>python data/scripts/ingest.py</code> 将本地文档转化为向量并存入{' '}
                <code>documents</code> 集合。
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 rounded-3xl border border-indigo-100 bg-white p-8 shadow-sm">
          <div className="mb-4 flex items-center gap-3 text-indigo-600">
            <ShieldCheck size={20} />
            <h3 className="text-sm font-black tracking-widest uppercase">架构说明</h3>
          </div>
          <p className="text-xs leading-relaxed font-medium text-slate-500">
            当前架构已实现 LLM 能力的完全解耦。Agent 和 Core 不再持有任何模型私钥或接口细节，仅通过{' '}
            <b>Model ID</b> 向独立的 <b>LLM Gateway</b> 发起请求。你可以在“模型管理”页面通过编写
            Python 代码快速适配任何私有模型。
          </p>
        </div>
      </div>
    </main>
  );
}
