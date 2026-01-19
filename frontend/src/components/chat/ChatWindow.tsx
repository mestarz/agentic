import { useRef, useEffect, useState } from 'react';
import { Zap, Cpu, User, Bot, Send, Square, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import type { Session, AppConfigs, TraceEvent } from '../../types';
import { Markdown } from '../ui/Markdown';

interface ChatWindowProps {
  currentSession: Session | null;
  selectedId: string | null;
  appConfigs: AppConfigs;
  activeTraceIndex: number | null;
  setActiveTraceIndex: (index: number | null) => void;
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  handleStop: () => void;
  loading: boolean;
  traces?: TraceEvent[]; // [NEW] Accept traces for real-time display
}

export function ChatWindow({
  currentSession,
  selectedId,
  appConfigs,
  activeTraceIndex,
  setActiveTraceIndex,
  input,
  setInput,
  handleSend,
  handleStop,
  loading,
  traces = []
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);

  useEffect(() => { 
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; 
  }, [currentSession?.messages]);

  // [NEW] 自动滚动终端到底部
  useEffect(() => {
    if (isTerminalExpanded && terminalScrollRef.current) {
        terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [traces, isTerminalExpanded]);

  // 辅助函数：根据 action 类型汉化显示
  const translateAction = (action: string) => {
    const map: Record<string, string> = {
        'Receive Query': '接收用户请求',
        'Get Optimized Context': '开始获取上下文',
        'Return Payload': 'Core 返回结果',
        'Start Streaming': '启动模型流式传输',
        'Append Assistant Message': '保存助手回复',
        'Updated Stats': '更新统计信息',
        'Model Request': '发送模型请求',
        'Model Processing': '模型推理中',
        'Model Response': '接收模型响应'
    };
    return map[action] || action;
  };

  return (
    <main className="flex-1 h-full flex flex-col min-w-0 bg-white overflow-hidden">
      <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase">
            <Zap size={10} /> <span className="text-indigo-600">{appConfigs.agentModelID}</span>
            <div className="w-[1px] h-3 bg-slate-200 mx-1"></div>
            <Cpu size={10} /> <span className="text-emerald-600">{appConfigs.coreModelID}</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-200"></div>
          <h2 className="text-sm font-semibold text-slate-700">{selectedId || '实验性控制台'}</h2>
        </div>
        <div className="flex items-center gap-3">
          {currentSession?.messages && (
            (() => {
              const stats = [...currentSession.messages].reverse().find(m => m.meta?.tokens_total)?.meta;
              if (!stats) return null;
              const p = (stats.tokens_total / stats.tokens_max) * 100;
              return (
                <div className="flex flex-col items-end gap-1"><span className="text-[9px] font-mono text-slate-400 uppercase">{stats.tokens_total} / {stats.tokens_max} Tokens</span><div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full transition-all ${p > 80 ? 'bg-red-500' : 'bg-indigo-500'}`} style={{width: `${p}%`}}></div></div></div>
              );
            })()
          )}
        </div>
      </header>
      
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        {currentSession?.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div 
              onClick={() => m.role === 'assistant' && setActiveTraceIndex(i)}
              className={`flex gap-4 max-w-[92%] cursor-pointer transition-opacity hover:opacity-90 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>{m.role === 'user' ? <User size={14} /> : <Bot size={14} />}</div>
              <div className={`p-5 rounded-2xl shadow-sm border ${m.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-50 text-slate-800 border-slate-100'} ${activeTraceIndex === i ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}><div className="markdown-content text-sm leading-relaxed"><Markdown content={m.content} /></div></div>
            </div>
          </div>
        ))}
      </div>

      <footer className="shrink-0">
        <div className="p-8 bg-white border-t border-slate-100">
          <div className="max-w-4xl mx-auto flex gap-4">
            <input value={input} disabled={loading} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="发送消息进行上下文测试..." className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm transition-all" />
            {loading ? (
              <button onClick={handleStop} className="p-3 bg-red-500 text-white rounded-xl hover:bg-red-600 shadow-lg flex items-center justify-center min-w-[50px] transition-all animate-pulse">
                <Square size={18} fill="currentColor" />
              </button>
            ) : (
              <button disabled={!input.trim()} onClick={handleSend} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center min-w-[50px] transition-all disabled:opacity-30">
                <Send size={18} />
              </button>
            )}
          </div>
        </div>

        {/* System Observer Terminal (Light Style) */}
        <div className={`bg-white border-t border-slate-100 transition-all duration-300 flex flex-col ${isTerminalExpanded ? 'h-64' : 'h-[36px]'}`}>
          <div 
            className="px-6 h-[36px] flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-50"
            onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
          >
            <div className="flex items-center gap-3">
              <Terminal size={14} className={loading ? 'text-indigo-500 animate-pulse' : 'text-slate-400'} />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">系统轨迹监测</span>
              {loading && <span className="text-[9px] text-indigo-500 font-bold animate-pulse">PROCESSING...</span>}
            </div>
            <div className="flex items-center gap-4">
              {traces.length > 0 && <span className="text-[9px] font-mono text-slate-400">{traces.length} EVENTS</span>}
              <div className="text-slate-300">{isTerminalExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</div>
            </div>
          </div>
          <div 
            ref={terminalScrollRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-[10px] selection:bg-indigo-500/10 light-terminal-scrollbar bg-slate-50/50"
          >
            {traces.length === 0 ? (
              <div className="text-slate-300 italic">等待交互产生的系统轨迹...</div>
            ) : (
              <div className="space-y-1.5">
                {traces.map((t, idx) => (
                  <div key={idx} className="flex gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200">
                    <span className="text-slate-300 shrink-0">[{new Date(t.timestamp).toLocaleTimeString()}]</span>
                    <span className="text-slate-500 font-bold shrink-0">{t.source} -&gt; {t.target}:</span>
                    <span className={t.action.includes('Error') ? 'text-rose-500' : 'text-indigo-600'}>{translateAction(t.action)}</span>
                    {t.data && <span className="text-slate-400 truncate opacity-70 italic">({typeof t.data === 'string' ? t.data : JSON.stringify(t.data)})</span>}
                  </div>
                ))}
                <div id="chat-terminal-end"></div>
              </div>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
