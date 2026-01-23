import { CheckCircle2, Box } from 'lucide-react';
import type { AppConfigs, ModelAdapterConfig } from '../../types';

interface ConfigBlockProps {
  title: string;
  icon: React.ComponentType<{ size?: number | string }>;
  type: 'agentModelID' | 'coreModelID' | 'sanitizationModelID';
  selectedID: string;
  models: ModelAdapterConfig[];
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
}

export const ConfigBlock = ({
  title,
  icon: Icon,
  type,
  selectedID,
  models,
  setAppConfigs,
}: ConfigBlockProps) => (
  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${type === 'agentModelID' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}
        >
          <Icon size={18} />
        </div>
        <h3 className="text-xs font-black tracking-widest text-slate-800 uppercase">{title}</h3>
      </div>
      <CheckCircle2 size={16} className="text-emerald-500" />
    </div>
    <div className="space-y-4">
      <div>
        <label className="mb-1 ml-1 block text-[9px] font-black text-slate-400 uppercase">
          选择模型 (Select Model)
        </label>
        <select
          className="w-full cursor-pointer appearance-none rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-bold transition-all outline-none hover:bg-slate-100"
          value={selectedID}
          onChange={(e) => setAppConfigs((prev) => ({ ...prev, [type]: e.target.value }))}
        >
          {models.length === 0 && <option value="">加载中...</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.id})
            </option>
          ))}
        </select>
      </div>

      {models.find((m) => m.id === selectedID) && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Box size={14} className="text-slate-400" />
            <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
              模型详情
            </span>
          </div>
          <div className="text-[11px] font-bold text-slate-600">
            类型: {models.find((m) => m.id === selectedID)?.type}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-slate-400">ID: {selectedID}</div>
        </div>
      )}
    </div>
  </div>
);
