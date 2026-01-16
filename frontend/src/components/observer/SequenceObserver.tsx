import { Terminal, Maximize2, Minimize2, Monitor, Zap, Cpu, Cloud, Activity, Plus } from 'lucide-react';
import type { Session } from '../../types';

interface SequenceObserverProps {
  currentSession: Session | null;
  activeTraceIndex: number | null;
  selectedTraceId: number | null;
  setSelectedTraceId: (id: number | null) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export function SequenceObserver({
  currentSession,
  activeTraceIndex,
  selectedTraceId,
  setSelectedTraceId,
  isExpanded,
  setIsExpanded
}: SequenceObserverProps) {
  return (
    <aside className={`${isExpanded ? 'w-[800px]' : 'w-96'} bg-white border-l border-slate-200 flex flex-col hidden xl:flex overflow-hidden transition-all duration-300 ease-in-out`}>
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-indigo-600" />
          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">时序交互观察器 (Sequence Observer)</span>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
        >
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden bg-slate-50/30">

        {/* 时序图区域 */}
        <div className="flex-1 flex flex-col overflow-hidden relative">

          {/* 对象轴头部 */}
          <div className="flex border-b border-slate-100 bg-white py-4 relative z-20">
            {[
              { id: 'Frontend', label: '用户', icon: <Monitor size={14} /> },
              { id: 'Agent', label: '代理', icon: <Zap size={14} /> },
              { id: 'Core', label: '核心', icon: <Cpu size={14} /> },
              { id: 'LLM', label: '模型', icon: <Cloud size={14} /> }
            ].map(p => (
              <div key={p.id} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 shadow-sm">
                  {p.icon}
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{p.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto relative custom-scrollbar p-0">
            {currentSession && activeTraceIndex !== null && currentSession.messages[activeTraceIndex]?.traces ? (
              <div className="min-h-full py-8 relative">
                {/* 垂直生命线 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex-1 flex justify-center">
                      <div className="w-[1px] h-full border-l border-dashed border-slate-200"></div>
                    </div>
                  ))}
                </div>

                {/* 交互箭头列表 */}
                <div className="relative space-y-12">
                  {currentSession.messages[activeTraceIndex].traces?.map((t, idx) => {
                    const posMap: any = { 'Frontend': 0, 'Agent': 1, 'Core': 2, 'LLM': 3 };
                    const from = posMap[t.source] ?? 0;
                    const to = posMap[t.target] ?? 0;
                    const left = Math.min(from, to) * 25 + 12.5;
                    const width = Math.abs(from - to) * 25;
                    const isRight = to > from;

                    return (
                      <div 
                        key={idx} 
                        onClick={() => { setSelectedTraceId(idx); setIsExpanded(true); }}
                        className={`group relative h-6 cursor-pointer transition-all`}
                        style={{ 
                          left: `${left}%`, 
                          width: `${width}%`,
                        }}
                      >
                        {/* 消息标签 */}
                        <div className={`absolute -top-5 left-0 right-0 text-center transition-all ${selectedTraceId === idx ? 'text-indigo-600 font-black' : 'text-slate-400 font-bold group-hover:text-slate-600'}`}>
                          <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded-full border border-slate-100 shadow-sm whitespace-nowrap">{t.action}</span>
                        </div>
                        
                        {/* 箭头线 */}
                        <div className={`absolute top-3 left-0 right-0 h-[2px] transition-all ${selectedTraceId === idx ? 'bg-indigo-500' : 'bg-slate-300 group-hover:bg-indigo-400'}`}>
                          <div className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'right-0 border-l-[6px] border-l-inherit' : 'left-0 border-r-[6px] border-r-inherit'} border-y-[4px] border-y-transparent`} 
                               style={{ borderLeftColor: 'inherit', borderRightColor: 'inherit' }}></div>
                        </div>
                        
                        {/* 激活圆点 */}
                        <div className={`absolute top-3 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-all ${selectedTraceId === idx ? 'bg-indigo-500 border-indigo-100' : 'bg-white border-slate-300'}`} style={{ [isRight ? 'left' : 'right']: '-4px' }}></div>
                        <div className={`absolute top-3 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-all ${selectedTraceId === idx ? 'bg-indigo-500 border-indigo-100' : 'bg-white border-slate-300'}`} style={{ [isRight ? 'right' : 'left']: '-4px' }}></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50">
                <Activity size={40} className="text-slate-200" />
                <div className="text-[10px] font-black uppercase tracking-widest">等待交互时序数据...</div>
              </div>
            )}
          </div>

          {/* Debug Status Bar */}
          <div className="h-6 bg-slate-100 border-t border-slate-200 flex items-center px-3 gap-4 z-30">
            <div className="flex items-center gap-1"><span className="text-[8px] font-black text-slate-400 uppercase">Msg:</span> <span className="text-[9px] font-mono font-bold text-indigo-600">{activeTraceIndex ?? 'null'}</span></div>
            <div className="flex items-center gap-1"><span className="text-[8px] font-black text-slate-400 uppercase">Step:</span> <span className="text-[9px] font-mono font-bold text-emerald-600">{selectedTraceId ?? 'null'}</span></div>
            <div className="flex items-center gap-1"><span className="text-[8px] font-black text-slate-400 uppercase">TraceCount:</span> <span className="text-[9px] font-mono font-bold text-slate-600">{currentSession?.messages[activeTraceIndex!]?.traces?.length || 0}</span></div>
          </div>
        </div>

        {/* Inspector Panel */}
        {isExpanded && selectedTraceId !== null && (
          <div className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-40 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">数据详情</span>
              <button onClick={() => setSelectedTraceId(null)} className="text-slate-400 hover:text-slate-600">
                <Plus size={14} className="rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              {(() => {
                if (activeTraceIndex === null || !currentSession?.messages) return null;
                const targetMsg = currentSession.messages[activeTraceIndex];
                const currentTrace = targetMsg?.traces?.[selectedTraceId];
                
                if (!currentTrace) return (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 mt-20">
                    <Activity size={24} className="animate-spin" />
                    <div className="text-[10px] font-bold uppercase tracking-widest">
                      数据未就绪 (Step #{selectedTraceId})
                    </div>
                    <div className="text-[8px] text-slate-400">
                      Msg Index: {activeTraceIndex} | Traces Count: {targetMsg?.traces?.length || 0}
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100/50">
                        <div className="text-[8px] font-black text-indigo-400 uppercase">源对象</div>
                        <div className="text-[11px] font-bold text-indigo-700">{currentTrace.source}</div>
                      </div>
                      <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100/50">
                        <div className="text-[8px] font-black text-emerald-400 uppercase">目标对象</div>
                        <div className="text-[11px] font-bold text-emerald-700">{currentTrace.target}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[8px] font-black text-slate-400 uppercase flex justify-between">
                        <span>Payload 负载</span>
                        <span className="text-indigo-500">{currentTrace.action}</span>
                      </div>
                      <div className="bg-slate-900 rounded-xl p-4 shadow-inner">
                        <pre className="text-[10px] text-indigo-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {JSON.stringify(currentTrace.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100">
                      <div className="text-[8px] font-black text-slate-400 uppercase">执行时间</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-1">
                        {new Date(currentTrace.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
