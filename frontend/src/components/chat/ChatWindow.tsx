import { useRef, useEffect, useState } from 'react';
import {
  Zap,
  Cpu,
  User,
  Bot,
  Send,
  Square,
  Terminal,
  ChevronDown,
  ChevronUp,
  Beaker,
  Check,
  Save,
} from 'lucide-react';
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
  logs?: string[];
  isReplaying?: boolean;
  replayProgress?: { current: number; total: number };
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
  logs = [],
  isReplaying = false,
  replayProgress = { current: 0, total: 0 },
}: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [isSavingTestCase, setIsSavingTestCase] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [currentSession?.messages]);

  useEffect(() => {
    if (isTerminalExpanded && terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [logs, isTerminalExpanded]);

  const handleSaveTestCase = async () => {
    if (!currentSession || isSavingTestCase) return;
    const name = prompt('请输入测试用例名称:', `Test Case - ${currentSession.id}`);
    if (!name) return;

    setIsSavingTestCase(true);
    try {
      const resp = await fetch('/api/admin/testcases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: currentSession.id, name }),
      });
      if (resp.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      console.error('Failed to save test case', e);
    } finally {
      setIsSavingTestCase(false);
    }
  };

  return (
    <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Replay Overlay Overlay */}
      {isReplaying && (
        <div className="animate-in slide-in-from-top absolute top-16 right-0 left-0 z-20 flex items-center justify-between border-b border-amber-100 bg-amber-50 px-8 py-3 shadow-sm duration-300">
          <div className="flex items-center gap-3 text-amber-700">
            <div className="flex h-6 w-6 animate-pulse items-center justify-center rounded-full bg-amber-200">
              <Beaker size={14} className="text-amber-600" />
            </div>
            <span className="text-xs font-black tracking-widest uppercase">
              测试用例自动重放中...
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs font-bold text-amber-600">
              步骤 {replayProgress.current} / {replayProgress.total}
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-amber-200">
              <div
                className="h-full bg-amber-600 transition-all duration-500 ease-out"
                style={{ width: `${(replayProgress.current / replayProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <header className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white/50 px-6 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase">
            <Zap size={10} /> <span className="text-indigo-600">{appConfigs.agentModelID}</span>
            <div className="mx-1 h-3 w-[1px] bg-slate-200"></div>
            <Cpu size={10} /> <span className="text-emerald-600">{appConfigs.coreModelID}</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-200"></div>
          <h2 className="text-sm font-semibold text-slate-700">{selectedId || '实验性控制台'}</h2>
        </div>
        <div className="flex items-center gap-3">
          {currentSession && currentSession.messages.length > 0 && !isReplaying && (
            <button
              onClick={handleSaveTestCase}
              disabled={isSavingTestCase}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-black tracking-widest uppercase transition-all ${
                saveSuccess
                  ? 'bg-emerald-500 text-white shadow-emerald-100'
                  : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-500 hover:text-indigo-600'
              }`}
            >
              {saveSuccess ? <Check size={12} /> : <Save size={12} />}
              {saveSuccess ? '已保存' : '保存为测试用例'}
            </button>
          )}
          {currentSession?.messages &&
            (() => {
              const lastWithMeta = [...currentSession.messages]
                .reverse()
                .find((m) => m.meta?.tokens_total);
              const stats = lastWithMeta?.meta;
              if (
                !stats ||
                typeof stats.tokens_total !== 'number' ||
                typeof stats.tokens_max !== 'number'
              )
                return null;
              const tokens_total = stats.tokens_total;
              const tokens_max = stats.tokens_max;
              const p = (tokens_total / tokens_max) * 100;
              return (
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-[9px] text-slate-400 uppercase">
                    {tokens_total} / {tokens_max} Tokens
                  </span>
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all ${p > 80 ? 'bg-red-500' : 'bg-indigo-500'}`}
                      style={{ width: `${p}%` }}
                    ></div>
                  </div>
                </div>
              );
            })()}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="custom-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto p-8"
      >
        {currentSession?.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              onClick={() => m.role === 'assistant' && setActiveTraceIndex(i)}
              className={`flex max-w-[92%] cursor-pointer gap-4 transition-opacity hover:opacity-90 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-400'}`}
              >
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div
                className={`rounded-2xl border p-5 shadow-sm ${m.role === 'user' ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-100 bg-slate-50 text-slate-800'} ${activeTraceIndex === i ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
              >
                <div className="text-sm leading-relaxed">
                  <Markdown content={m.content} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <footer className="shrink-0">
        <div className="border-t border-slate-100 bg-white p-8">
          <div className="mx-auto flex max-w-4xl gap-4">
            <input
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="发送消息进行上下文测试..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm transition-all outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {loading ? (
              <button
                onClick={handleStop}
                className="flex min-w-[50px] animate-pulse items-center justify-center rounded-xl bg-red-500 p-3 text-white shadow-lg transition-all hover:bg-red-600"
              >
                <Square size={18} fill="currentColor" />
              </button>
            ) : (
              <button
                disabled={!input.trim()}
                onClick={handleSend}
                className="flex min-w-[50px] items-center justify-center rounded-xl bg-indigo-600 p-3 text-white shadow-lg transition-all hover:bg-indigo-700 disabled:opacity-30"
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>

        {/* System Observer Terminal (Log Stream Style) */}
        <div
          className={`flex flex-col border-t border-slate-100 bg-white transition-all duration-300 ${isTerminalExpanded ? 'h-64' : 'h-[36px]'}`}
        >
          <div
            className="flex h-[36px] cursor-pointer items-center justify-between border-b border-slate-50 px-6 transition-colors hover:bg-slate-50"
            onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
          >
            <div className="flex items-center gap-3">
              <Terminal
                size={14}
                className={loading ? 'animate-pulse text-indigo-500' : 'text-slate-400'}
              />
              <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">
                系统轨迹监测
              </span>
              {loading && (
                <span className="animate-pulse text-[9px] font-bold text-indigo-500">
                  STREAMING...
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {logs.length > 0 && (
                <span className="font-mono text-[9px] text-slate-400">{logs.length} LINES</span>
              )}
              <div className="text-slate-300">
                {isTerminalExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </div>
            </div>
          </div>
          <div
            ref={terminalScrollRef}
            className="light-terminal-scrollbar flex-1 overflow-y-auto bg-slate-50/50 p-4 font-mono text-[10px] selection:bg-indigo-500/10"
          >
            {logs.length === 0 ? (
              <div className="text-slate-300 italic">等待交互产生的系统日志...</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`animate-in fade-in slide-in-from-bottom-1 duration-200 ${
                      log.includes('[Error]')
                        ? 'font-bold text-rose-500'
                        : log.includes('[Warning]')
                          ? 'text-amber-500'
                          : log.includes('[Trace]')
                            ? 'text-indigo-600'
                            : log.startsWith('>>>')
                              ? 'text-slate-400 italic'
                              : 'text-slate-600'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
