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
  // 聚焦上下文工程的节点设计
  const participants = [
    { id: 'Frontend', label: '用户', icon: <Monitor size={14} /> },
    { id: 'Agent', label: '代理 (Agent)', icon: <Zap size={14} /> },
    { id: 'Core', label: '核心 (Context Engine)', icon: <Cpu size={14} /> },
    { id: 'LLM', label: '模型 (LLM)', icon: <Cloud size={14} /> }
  ];

  const posMap: Record<string, number> = {
    'Frontend': 0,
    'Agent': 1,
    'Core': 2,
    // 将解耦后的所有模型相关节点重新折叠回 LLM 轴
    'LLM': 3,
    'Gateway': 3,
    'Adapter': 3,
    'Remote Provider': 3
  };

  return (
    <aside className="w-full h-full bg-white/95 backdrop-blur-sm border-l border-slate-200 flex flex-col hidden xl:flex overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-emerald-600" />
          <span className="text-xs font-black text-slate-700 uppercase tracking-widest">上下文时序观察 (Context Focus)</span>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
        >
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden bg-slate-50/30">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 对象轴头部 */}
          <div className="flex border-b border-slate-100 bg-white py-4 relative z-20">
            {participants.map(p => (
              <div key={p.id} className="flex-1 flex flex-col items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${p.id === 'Core' ? 'bg-emerald-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600'}`}>
                  {p.icon}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-tighter text-center ${p.id === 'Core' ? 'text-emerald-600' : 'text-slate-500'}`}>{p.label}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto relative custom-scrollbar p-0">
            {currentSession && activeTraceIndex !== null && currentSession.messages[activeTraceIndex]?.traces ? (
              <div className="min-h-full py-8 relative">
                {/* 垂直生命线 */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {participants.map(p => (
                    <div key={p.id} className="flex-1 flex justify-center">
                      <div className={`w-[1px] h-full border-l border-dashed ${p.id === 'Core' ? 'border-emerald-200' : 'border-slate-200'}`}></div>
                    </div>
                  ))}
                </div>

                {/* 交互箭头列表 */}
                <div className="relative space-y-12">
                  {currentSession.messages[activeTraceIndex].traces?.map((t, idx, arr) => {
                    const from = posMap[t.source] ?? 0;
                    const to = posMap[t.target] ?? 0;
                    
                    // 如果起点和终点重合（如 Core 内部处理），则显示为自指向箭头
                    const isSelf = from === to;
                    const stepWidth = 25; // 4个节点，每个 25%
                    const left = isSelf ? (from * stepWidth + 12.5) : (Math.min(from, to) * stepWidth + 12.5);
                    const width = isSelf ? 5 : Math.abs(from - to) * stepWidth;
                    const isRight = to >= from;

                    const prevTime = idx > 0 ? new Date(arr[idx-1].timestamp).getTime() : new Date(t.timestamp).getTime();
                    const currTime = new Date(t.timestamp).getTime();
                    const durationMs = currTime - prevTime;
                    const durationStr = durationMs > 1000 ? `+${(durationMs/1000).toFixed(2)}s` : `+${durationMs}ms`;

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
                        <div className={`absolute -top-5 left-0 right-0 text-center transition-all flex items-center justify-center gap-1 ${selectedTraceId === idx ? 'text-indigo-600 font-black' : 'text-slate-400 font-bold group-hover:text-slate-600'}`}>
                          <span className={`text-[9px] bg-white/90 px-2 py-0.5 rounded-full border shadow-sm whitespace-nowrap z-10 ${t.source === 'Core' || t.target === 'Core' ? 'border-emerald-100 text-emerald-700' : 'border-slate-100'}`}>{t.action}</span>
                          <span className="text-[8px] font-mono text-slate-300">{durationStr}</span>
                        </div>
                        
                        {isSelf ? (
                          /* 自指向箭头 (内部逻辑) */
                          <div className={`absolute top-0 left-0 w-12 h-10 border-2 ${from === 2 ? 'border-emerald-400' : 'border-indigo-300'} border-l-0 rounded-r-2xl transition-all ${selectedTraceId === idx ? 'opacity-100 scale-110' : 'opacity-40 hover:opacity-100'}`}>
                             <div className={`absolute bottom-0 right-0 border-l-[6px] border-l-inherit border-y-[4px] border-y-transparent`} style={{ borderLeftColor: 'inherit' }}></div>
                          </div>
                        ) : (
                          /* 标准横向箭头 */
                          <div className={`absolute top-3 left-0 right-0 h-[2px] transition-all ${selectedTraceId === idx ? 'bg-indigo-500' : 'bg-slate-300 group-hover:bg-indigo-400'}`}>
                            <div className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'right-0 border-l-[6px] border-l-inherit' : 'left-0 border-r-[6px] border-r-inherit'} border-y-[4px] border-y-transparent`} 
                                 style={{ borderLeftColor: 'inherit', borderRightColor: 'inherit' }}></div>
                          </div>
                        )}
                        
                        {!isSelf && (
                          <>
                            <div className={`absolute top-3 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-all ${selectedTraceId === idx ? 'bg-indigo-500 border-indigo-100' : 'bg-white border-slate-300'}`} style={{ [isRight ? 'left' : 'right']: '-4px' }}></div>
                            <div className={`absolute top-3 -translate-y-1/2 w-2 h-2 rounded-full border-2 transition-all ${selectedTraceId === idx ? 'bg-indigo-500 border-indigo-100' : 'bg-white border-slate-300'}`} style={{ [isRight ? 'right' : 'left']: '-4px' }}></div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4 opacity-50">
                <Activity size={40} className="text-slate-200" />
                <div className="text-[10px] font-black uppercase tracking-widest">等待上下文交互数据...</div>
              </div>
            )}
          </div>

          <div className="h-6 bg-slate-100 border-t border-slate-200 flex items-center px-3 gap-4 z-30">
            <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Core Active</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
                <span className="text-[8px] font-black text-slate-400 uppercase">Latency:</span> 
                <span className="text-[9px] font-mono font-bold text-amber-600">
                  {currentSession?.messages[activeTraceIndex!]?.traces?.length ? 
                  ((new Date(currentSession.messages[activeTraceIndex!].traces!.slice(-1)[0].timestamp).getTime() - new Date(currentSession.messages[activeTraceIndex!].traces![0].timestamp).getTime()) / 1000).toFixed(2) : 0}s
                </span>
            </div>
          </div>
        </div>

        {isExpanded && selectedTraceId !== null && (
          <div className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-40">
            <div className="p-4 border-b border-slate-100 bg-emerald-50/50 flex items-center justify-between">
              <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">工程元数据</span>
              <button onClick={() => setSelectedTraceId(null)} className="text-slate-400 hover:text-slate-600">
                <Plus size={14} className="rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              {(() => {
                if (activeTraceIndex === null || !currentSession?.messages) return null;
                const targetMsg = currentSession.messages[activeTraceIndex];
                const currentTrace = targetMsg?.traces?.[selectedTraceId];
                if (!currentTrace) return null;

                return (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase">{currentTrace.action}</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[8px] font-black text-slate-400 uppercase">Payload 内容 (Context Payload)</div>
                      <div className="bg-slate-900 rounded-xl p-4 shadow-inner">
                        <pre className="text-[10px] text-emerald-400 font-mono whitespace-pre-wrap break-all leading-relaxed">
                          {JSON.stringify(currentTrace.data, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                        <div>
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">交互路径</div>
                            <div className="text-[10px] font-bold text-slate-600 mt-1">{currentTrace.source} ➔ {currentTrace.target}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">时间戳</div>
                            <div className="text-[10px] font-mono text-slate-500 mt-1">{new Date(currentTrace.timestamp).toLocaleTimeString()}</div>
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
