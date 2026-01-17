import { useRef, useEffect } from 'react';
import { Zap, Cpu, User, Bot, Send, Square } from 'lucide-react';
import type { Session, AppConfigs } from '../../types';
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
  loading
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; 
  }, [currentSession?.messages]);

  return (
    <main className="flex-1 h-full flex flex-col min-w-0 bg-white">
      <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md z-10 shadow-sm">
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
      <footer className="p-8 bg-white border-t border-slate-100">
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
      </footer>
    </main>
  );
}
