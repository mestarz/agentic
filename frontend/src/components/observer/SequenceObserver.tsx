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
    { id: 'Frontend', label: '用户', icon: <Monitor size={18} /> },
    { id: 'Agent', label: '代理 (Agent)', icon: <Zap size={18} /> },
    { id: 'Core', label: '核心 (Context Engine)', icon: <Cpu size={18} /> },
    { id: 'LLM', label: '模型 (LLM)', icon: <Cloud size={18} /> }
  ];

  const posMap: Record<string, number> = {
    'Frontend': 0,
    'Agent': 1,
    'Core': 2,
    'LLM': 3,
    'Gateway': 3,
    'Adapter': 3,
    'Remote Provider': 3
  };

  const actionMap: Record<string, string> = {
    // Agent
    'Receive Query': '接收用户指令',
    'Loading History': '加载历史会话',
    'Get Optimized Context': '获取优化上下文',
    'Final Response': '生成最终回复',
    // Core
    'Context Analysis': '上下文语义分析',
    'Retrieving Relevant Bits': '检索相关知识碎片',
    'Building Payload': '构建上下文负载',
    'Memory Consolidation': '记忆固化处理',
    'Persistence Save': '会话持久化存储',
    // LLM
    'Dispatch': '分发模型请求',
    'Call API': '调用模型接口',
    'Stream Response': '流式内容返回',
    'Token Counting': '计算 Token 消耗',
    'Adapter Transform': '模型协议转换',
    // Common
    'Call': '发起调用',
    'Response': '返回响应',
    'Search': '执行搜索',
    'Retrieve': '检索',
    'Process': '逻辑处理',
    'Analyze': '分析数据',
    'Generate': '内容生成',
    'Invoke': '触发动作',
    'Error': '发生错误',
    'Success': '执行成功',
    'Wait': '等待响应',
    'Thinking': '深度思考中',
    'Update': '更新状态'
  };

  const translateAction = (action: string) => {
    // 1. 完全匹配
    if (actionMap[action]) return actionMap[action];
    
    // 2. 动态前缀匹配
    const prefixRules = [
      { prefix: 'Dispatch:', label: '模型分发:' },
      { prefix: 'Call', suffix: 'API', label: (a: string) => `调用 ${a.replace('Call ', '').replace(' API', '')} 接口` }
    ];

    for (const rule of prefixRules) {
      if (rule.prefix && action.startsWith(rule.prefix)) {
        if (typeof rule.label === 'function') return rule.label(action);
        return `${rule.label} ${action.split(':').slice(1).join(':').trim()}`;
      }
    }

    // 3. 包含匹配
    for (const [key, value] of Object.entries(actionMap)) {
      if (action.includes(key)) return value;
    }
    
    return action;
  };

  return (
    <aside className="w-full h-full bg-white/95 backdrop-blur-sm border-l border-slate-200 flex flex-col hidden xl:flex overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-emerald-600" />
          <span className="text-sm font-black text-slate-700 uppercase tracking-widest">系统交互观测仪 (Trace Observer)</span>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
        >
          {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden bg-slate-50/30">
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* 对象轴头部 */}
          <div className="flex border-b border-slate-100 bg-white py-6 relative z-20">
            {participants.map(p => (
              <div key={p.id} className="flex-1 flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md transition-transform hover:scale-105 ${p.id === 'Core' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
                  {p.icon}
                </div>
                <span className={`text-xs font-black uppercase tracking-tight text-center ${p.id === 'Core' ? 'text-emerald-600' : 'text-slate-500'}`}>{p.label}</span>
              </div>
            ))}
            {/* 右侧留白占位 */}
            <div className="flex-1"></div>
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
                  {/* 右侧留白生命线占位 */}
                  <div className="flex-1"></div>
                </div>

                {/* 交互箭头列表 */}
                <div className="relative">
                  {(currentSession.messages[activeTraceIndex].traces || [])
                    .map((t, originalIdx) => ({ ...t, originalIdx }))
                    .sort((a, b) => {
                      const timeA = new Date(a.timestamp).toISOString();
                      const timeB = new Date(b.timestamp).toISOString();
                      if (timeA !== timeB) return timeA.localeCompare(timeB);
                      return a.originalIdx - b.originalIdx;
                    })
                    .map((t, idx, arr) => {
                    const from = posMap[t.source] ?? 0;
                    const to = posMap[t.target] ?? 0;
                    const isSelf = from === to;
                    const stepWidth = 20; // 5个槽位
                    
                    const fromX = from * stepWidth + 10;
                    const toX = to * stepWidth + 10;
                    
                    const left = isSelf ? fromX : Math.min(fromX, toX);
                    const width = isSelf ? 8 : Math.abs(fromX - toX);
                    const isRight = to >= from;

                    const prevTime = idx > 0 ? new Date(arr[idx-1].timestamp).getTime() : new Date(t.timestamp).getTime();
                    const currTime = new Date(t.timestamp).getTime();
                    const durationMs = currTime - prevTime;
                    const durationStr = durationMs > 1000 ? `+${(durationMs/1000).toFixed(2)}s` : `+${durationMs}ms`;

                    return (
                      <div 
                        key={idx} 
                        className="relative h-20 w-full group transition-all"
                      >
                        {/* 激活条 (Activation Bars) - 描述生命周期 */}
                        {[from, to].map((pIdx, i) => (
                          <div 
                            key={i}
                            className={`absolute top-0 bottom-0 w-3 -translate-x-1/2 shadow-sm z-10 
                              ${pIdx === 2 ? 'bg-emerald-500/30 border-x border-emerald-500/40' : 'bg-slate-200 border-x border-slate-300'}
                              ${selectedTraceId === idx ? 'ring-2 ring-indigo-400/50 z-20' : ''}
                            `}
                            style={{ left: `${pIdx * stepWidth + 10}%` }}
                          />
                        ))}

                        {/* 交互箭头与标签容器 */}
                        <div 
                          onClick={() => { setSelectedTraceId(idx); setIsExpanded(true); }}
                          className="absolute inset-0 cursor-pointer z-30"
                        >
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 transition-all"
                            style={{ 
                              left: `${left}%`, 
                              width: `${width}%`,
                            }}
                          >
                            {/* 标签 */}
                            <div className={`absolute -top-9 left-0 right-0 text-center transition-all flex flex-col items-center justify-center gap-1 ${selectedTraceId === idx ? 'scale-110' : 'group-hover:scale-105'}`}>
                              <div className={`flex items-center gap-1 px-3 py-1 rounded-full border shadow-lg bg-white z-40 ${selectedTraceId === idx ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 group-hover:border-slate-400'}`}>
                                <span className="text-[10px] font-black text-slate-400 mr-1 opacity-50">#{idx + 1}</span>
                                <span className={`text-xs font-bold whitespace-nowrap ${t.source === 'Core' || t.target === 'Core' ? 'text-emerald-700' : 'text-slate-700'}`}>
                                  {translateAction(t.action)}
                                </span>
                                <span className="text-[10px] font-mono font-medium text-amber-500 ml-1">{durationStr}</span>
                              </div>
                            </div>
                            
                            {isSelf ? (
                              /* 自指向箭头 */
                              <div className={`absolute top-0 left-0 w-16 h-12 border-2 ${from === 2 ? 'border-emerald-400' : 'border-indigo-300'} border-l-0 rounded-r-2xl transition-all ${selectedTraceId === idx ? 'opacity-100' : 'opacity-60'}`}>
                                 <div className={`absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 border-l-[8px] border-l-inherit border-y-[6px] border-y-transparent`} style={{ borderLeftColor: 'inherit' }}></div>
                              </div>
                            ) : (
                              /* 横向箭头 */
                              <div className={`absolute top-0 left-0 right-0 h-[2.5px] transition-all ${selectedTraceId === idx ? 'bg-indigo-500' : 'bg-slate-400 group-hover:bg-indigo-500'}`}>
                                <div className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'right-0 border-l-[8px] border-l-inherit' : 'left-0 border-r-[8px] border-r-inherit'} border-y-[5px] border-y-transparent`} 
                                     style={{ borderLeftColor: 'inherit', borderRightColor: 'inherit' }}></div>
                              </div>
                            )}
                          </div>
                        </div>
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

          <div className="h-8 bg-slate-100 border-t border-slate-200 flex items-center px-4 gap-6 z-30">
            <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="text-xs font-black text-slate-500 uppercase tracking-tighter">核心引擎运行中</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs font-black text-slate-400 uppercase">总耗时:</span> 
                <span className="text-sm font-mono font-bold text-amber-600">
                  {currentSession?.messages[activeTraceIndex!]?.traces?.length ? 
                  ((new Date(currentSession.messages[activeTraceIndex!].traces!.slice(-1)[0].timestamp).getTime() - new Date(currentSession.messages[activeTraceIndex!].traces![0].timestamp).getTime()) / 1000).toFixed(2) : 0}秒
                </span>
            </div>
          </div>
        </div>

        {isExpanded && selectedTraceId !== null && (
          <div className="w-[450px] bg-white border-l border-slate-200 flex flex-col shadow-[-10px_0_40px_rgba(0,0,0,0.08)] z-40 transition-all">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-emerald-600" />
                <span className="text-xs font-black text-slate-700 uppercase tracking-widest">链路追踪元数据 (Trace Metadata)</span>
              </div>
              <button onClick={() => setSelectedTraceId(null)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <Plus size={18} className="rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {(() => {
                if (activeTraceIndex === null || !currentSession?.messages) return null;
                const targetMsg = currentSession.messages[activeTraceIndex];
                const currentTrace = targetMsg?.traces?.[selectedTraceId];
                if (!currentTrace) return null;

                return (
                  <div className="space-y-8">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-sm">#{selectedTraceId + 1}</div>
                           <h3 className="text-lg font-bold text-slate-800 tracking-tight">{translateAction(currentTrace.action)}</h3>
                        </div>
                        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                           <div className="flex-1">
                               <div className="text-[10px] font-black text-slate-400 uppercase mb-1">起始节点 (Source)</div>
                               <div className="text-sm font-bold text-slate-700">{currentTrace.source}</div>
                           </div>
                           <div className="text-slate-300">➔</div>
                           <div className="flex-1 text-right">
                               <div className="text-[10px] font-black text-slate-400 uppercase mb-1">目标节点 (Target)</div>
                               <div className="text-sm font-bold text-slate-700">{currentTrace.target}</div>
                           </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">交互载荷 (Context Payload)</div>
                        <div className="text-[10px] font-mono text-slate-400">{new Date(currentTrace.timestamp).toLocaleTimeString()}</div>
                      </div>
                      <div className="bg-slate-900 rounded-2xl p-5 shadow-2xl relative group">
                        <div className="absolute top-4 right-4 text-[10px] font-mono text-slate-600 uppercase">JSON 报文</div>
                        <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap break-all leading-relaxed custom-scrollbar max-h-[500px] overflow-y-auto">
                          {JSON.stringify(currentTrace.data, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 flex justify-between items-center opacity-70">
                        <div className="flex items-center gap-2">
                           <Zap size={14} className="text-amber-500" />
                           <span className="text-xs font-medium text-slate-500">已应用耗时优化策略</span>
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
