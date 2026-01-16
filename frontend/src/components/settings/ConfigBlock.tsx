import { CheckCircle2 } from 'lucide-react';
import type { AppConfigs, LLMConfig } from '../../types';

interface ConfigBlockProps {
  title: string;
  icon: any;
  type: 'agent' | 'core';
  config: LLMConfig;
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
}

export const ConfigBlock = ({ title, icon: Icon, type, config, setAppConfigs }: ConfigBlockProps) => (
  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type === 'agent' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
          <Icon size={18} />
        </div>
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{title}</h3>
      </div>
      {config.api_key && <CheckCircle2 size={16} className="text-emerald-500" />}
    </div>
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Provider</label>
          <select 
            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-bold outline-none"
            value={config.provider}
            onChange={e => setAppConfigs(prev => ({...prev, [type]: {...prev[type], provider: e.target.value}}))}
          >
            <option value="gemini">Gemini</option>
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="mock">Mock</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Model</label>
          <input 
            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-mono" 
            value={config.model} 
            onChange={e => setAppConfigs(prev => ({...prev, [type]: {...prev[type], model: e.target.value}}))} 
          />
        </div>
      </div>
      <div>
        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Base URL</label>
        <input 
          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-mono" 
          value={config.base_url} 
          placeholder="https://..." 
          onChange={e => setAppConfigs(prev => ({...prev, [type]: {...prev[type], base_url: e.target.value}}))} 
        />
      </div>
      <div>
        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">API Key</label>
        <input 
          type="password" 
          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px]" 
          value={config.api_key} 
          placeholder="Enter Key..." 
          onChange={e => setAppConfigs(prev => ({...prev, [type]: {...prev[type], api_key: e.target.value}}))} 
        />
      </div>
    </div>
  </div>
);
