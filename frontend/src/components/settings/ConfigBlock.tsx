import { CheckCircle2, Box } from 'lucide-react';
import type { AppConfigs, ModelAdapterConfig } from '../../types';

interface ConfigBlockProps {
  title: string;
  icon: any;
  type: 'agentModelID' | 'coreModelID';
  selectedID: string;
  models: ModelAdapterConfig[];
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
}

export const ConfigBlock = ({ title, icon: Icon, type, selectedID, models, setAppConfigs }: ConfigBlockProps) => (
  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type === 'agentModelID' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
          <Icon size={18} />
        </div>
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{title}</h3>
      </div>
      <CheckCircle2 size={16} className="text-emerald-500" />
    </div>
    <div className="space-y-4">
      <div>
        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">选择模型 (Select Model)</label>
        <select 
          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none appearance-none cursor-pointer hover:bg-slate-100 transition-all"
          value={selectedID}
          onChange={e => setAppConfigs(prev => ({...prev, [type]: e.target.value}))}
        >
          {models.length === 0 && <option value="">加载中...</option>}
          {models.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
          ))}
        </select>
      </div>
      
      {models.find(m => m.id === selectedID) && (
        <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
           <div className="flex items-center gap-2 mb-2">
             <Box size={14} className="text-slate-400" />
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">模型详情</span>
           </div>
           <div className="text-[11px] font-bold text-slate-600">类型: {models.find(m => m.id === selectedID)?.type}</div>
           <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">ID: {selectedID}</div>
        </div>
      )}
    </div>
  </div>
);
