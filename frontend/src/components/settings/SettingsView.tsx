import { Settings, Zap, Cpu, ShieldCheck } from 'lucide-react';
import type { AppConfigs } from '../../types';
import { ConfigBlock } from './ConfigBlock';

interface SettingsViewProps {
  appConfigs: AppConfigs;
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
  onBack: () => void;
}

export function SettingsView({ appConfigs, setAppConfigs, onBack }: SettingsViewProps) {
  return (
    <main className="flex-1 bg-slate-50 overflow-y-auto p-12 custom-scrollbar">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><Settings size={28} /></div>
            <div><h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">系统设置</h1><p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1 text-emerald-600">所有配置实时同步至 LocalStorage</p></div>
          </div>
          <button onClick={onBack} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 uppercase">返回控制台</button>
        </div>
        
        <div className="grid grid-cols-1 gap-8">
          <ConfigBlock title="对话模型 (Agent LLM)" icon={Zap} type="agent" config={appConfigs.agent} setAppConfigs={setAppConfigs} />
          <ConfigBlock title="上下文引擎 (Core Engine)" icon={Cpu} type="core" config={appConfigs.core} setAppConfigs={setAppConfigs} />
        </div>

        <div className="mt-12 bg-white border border-indigo-100 rounded-3xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-indigo-600"><ShieldCheck size={20} /><h3 className="text-sm font-black uppercase tracking-widest">安全与持久化</h3></div>
          <p className="text-slate-500 text-xs leading-relaxed font-medium">配置已通过 React State 实时同步至浏览器的 <b>LocalStorage</b>。无需手动点击保存，所有更改在输入时即刻生效。后端服务仅在处理请求时使用这些密钥，不会在服务器端进行任何持久化记录。</p>
        </div>
      </div>
    </main>
  );
}
