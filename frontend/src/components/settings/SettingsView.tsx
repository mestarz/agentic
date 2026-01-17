import { useState, useEffect } from 'react';
import { Settings, Zap, Cpu, ShieldCheck } from 'lucide-react';
import type { AppConfigs, ModelAdapterConfig } from '../../types';
import { ConfigBlock } from './ConfigBlock';

interface SettingsViewProps {
  appConfigs: AppConfigs;
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
  onBack: () => void;
}

export function SettingsView({ appConfigs, setAppConfigs, onBack }: SettingsViewProps) {
  const [models, setModels] = useState<ModelAdapterConfig[]>([]);

  useEffect(() => {
    fetch('/api/models/models')
      .then(res => res.json())
      .then(data => setModels(data.data || []))
      .catch(err => console.error("Failed to load models", err));
  }, []);

  return (
    <main className="flex-1 bg-slate-50 overflow-y-auto p-12 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><Settings size={28} /></div>
            <div>
              <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">阶段模型配置</h1>
              <p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1 text-emerald-600">在此指定不同执行阶段所使用的模型适配器</p>
            </div>
          </div>
          <button onClick={onBack} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 uppercase">返回控制台</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ConfigBlock 
            title="对话生成阶段 (Agent LLM)" 
            icon={Zap} 
            type="agentModelID" 
            selectedID={appConfigs.agentModelID} 
            models={models}
            setAppConfigs={setAppConfigs} 
          />
          <ConfigBlock 
            title="上下文压缩阶段 (Core Engine)" 
            icon={Cpu} 
            type="coreModelID" 
            selectedID={appConfigs.coreModelID} 
            models={models}
            setAppConfigs={setAppConfigs} 
          />
        </div>

        <div className="mt-12 bg-white border border-indigo-100 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-indigo-600"><ShieldCheck size={20} /><h3 className="text-sm font-black uppercase tracking-widest">架构说明</h3></div>
          <p className="text-slate-500 text-xs leading-relaxed font-medium">当前架构已实现 LLM 能力的完全解耦。Agent 和 Core 不再持有任何模型私钥或接口细节，仅通过 <b>Model ID</b> 向独立的 <b>LLM Gateway</b> 发起请求。你可以在“模型管理”页面通过编写 Python 代码快速适配任何私有模型。</p>
        </div>
      </div>
    </main>
  );
}
