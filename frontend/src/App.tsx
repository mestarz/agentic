import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  MessageSquare, Database, Send, Clock, User, Bot,
  RefreshCw, Plus, Layout, Settings, ChevronRight, Terminal, ShieldCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface LLMConfig {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
}

interface SessionSummary {
  id: string;
  app_id: string;
  updated_at: string;
  msg_count: number;
}

interface Message {
  role: string;
  content: string;
  timestamp: string;
  meta?: any;
}

interface Session {
  id: string;
  app_id: string;
  messages: Message[];
}

const DEFAULT_CONFIGS: Record<string, Partial<LLMConfig>> = {
  gemini: { provider: 'gemini', model: 'gemini-1.5-flash', base_url: '' },
  deepseek: { provider: 'deepseek', model: 'deepseek-chat', base_url: 'https://api.deepseek.com' },
  ollama: { provider: 'openai', model: 'llama3', base_url: 'http://localhost:11434/v1' },
};

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const [activeProvider, setActiveProvider] = useState('gemini');
  const [configs, setConfigs] = useState<Record<string, LLMConfig>>(() => {
    const saved = localStorage.getItem('cf_configs');
    if (saved) return JSON.parse(saved);
    return {
      gemini: { ...DEFAULT_CONFIGS.gemini, api_key: '' } as LLMConfig,
      deepseek: { ...DEFAULT_CONFIGS.deepseek, api_key: '' } as LLMConfig,
      ollama: { ...DEFAULT_CONFIGS.ollama, api_key: '' } as LLMConfig,
    };
  });

  useEffect(() => {
    localStorage.setItem('cf_configs', JSON.stringify(configs));
  }, [configs]);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSession?.messages]);

  const fetchSessions = async () => {
    try {
      const res = await axios.get('/api/admin/sessions');
      setSessions(res.data || []);
    } catch (err) { console.error(err); }
  };

  const selectSession = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await axios.get(`/api/admin/sessions/${id}`);
      setCurrentSession(res.data);
    } catch (err) { console.error(err); }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const sessionId = selectedId || `session-${Math.random().toString(36).substring(7)}`;
    const config = configs[activeProvider];

    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString() };
    const tempSession = currentSession ? { ...currentSession, messages: [...currentSession.messages, userMsg] } 
                                     : { id: sessionId, app_id: 'web', messages: [userMsg] };
    const aiMsg: Message = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setCurrentSession({ ...tempSession, messages: [...tempSession.messages, aiMsg] });

    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          app_id: 'context-fabric-web',
          query: userMsg.content,
          stream: true,
          config: config
        })
      });

      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.replace('data: ', '');
            if (content) {
              fullContent += content;
              setCurrentSession(prev => {
                if (!prev) return prev;
                const newMsgs = [...prev.messages];
                newMsgs[newMsgs.length - 1].content = fullContent;
                return { ...prev, messages: newMsgs };
              });
            }
          }
        }
      }
      if (!selectedId) setSelectedId(sessionId);
      await fetchSessions();
      await selectSession(sessionId); // 重要：流结束后拉取带 Meta 的正式历史
    } catch (err: any) {
      alert('对话失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
      {/* 侧边栏 */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm z-20">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Layout size={18} />
            </div>
            <h1 className="font-bold text-slate-800 tracking-tight">ContextFabric</h1>
          </div>
          <button onClick={fetchSessions} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors">
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="p-4 space-y-2">
          <button onClick={() => { setSelectedId(null); setCurrentSession(null); }} className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-md">
            <Plus size={14} /> NEW SESSION
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all ${showSettings ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <Settings size={14} /> SETTINGS
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
          {sessions.map(s => (
            <div key={s.id} onClick={() => selectSession(s.id)} className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${selectedId === s.id ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}>
              <MessageSquare size={16} className={selectedId === s.id ? 'text-indigo-600' : 'text-slate-400'} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{s.id}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{new Date(s.updated_at).toLocaleTimeString()} · {s.msg_count} msgs</div>
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* 主对话区 */}
      <main className="flex-1 flex flex-col min-w-0 bg-white relative">
        {showSettings && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-30 p-10 flex justify-center overflow-y-auto">
            <div className="max-w-2xl w-full bg-white border border-slate-200 rounded-2xl shadow-2xl p-8 h-fit">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="text-indigo-600" /> Endpoint Config</h2>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
              </div>
              <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
                {Object.keys(configs).map(key => (
                  <button key={key} onClick={() => setActiveProvider(key)} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${activeProvider === key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {key.toUpperCase()} {configs[key].api_key ? '✓' : ''}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                <div><label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Model</label><input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" value={configs[activeProvider].model} onChange={e => setConfigs({...configs, [activeProvider]: {...configs[activeProvider], model: e.target.value}})} /></div>
                <div><label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Base URL</label><input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" value={configs[activeProvider].base_url} onChange={e => setConfigs({...configs, [activeProvider]: {...configs[activeProvider], base_url: e.target.value}})} /></div>
                <div><label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">API Key</label><input type="password" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={configs[activeProvider].api_key} onChange={e => setConfigs({...configs, [activeProvider]: {...configs[activeProvider], api_key: e.target.value}})} /></div>
              </div>
              <button onClick={() => setShowSettings(false)} className="mt-8 w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all uppercase text-xs">Save</button>
            </div>
          </div>
        )}

        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              <select value={activeProvider} onChange={(e) => setActiveProvider(e.target.value)} className="appearance-none bg-indigo-50 border border-indigo-100 text-indigo-700 text-[11px] font-bold py-1.5 pl-3 pr-8 rounded-lg cursor-pointer hover:bg-indigo-100 transition-all uppercase tracking-wider">
                {Object.keys(configs).map(key => (
                  <option key={key} value={key}>{key} {configs[key].api_key ? '✓' : '⚠'}</option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400"><ChevronRight size={12} className="rotate-90" /></div>
            </div>
            <div className="h-4 w-[1px] bg-slate-200"></div>
            <h2 className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{selectedId || 'New Session'}</h2>
          </div>

          <div className="flex items-center gap-3">
            {currentSession?.messages && currentSession.messages.length > 0 && (
              (() => {
                // 从后往前找第一个带统计信息的消息
                const statsMsg = [...currentSession.messages].reverse().find(m => m.meta && m.meta.tokens_total);
                const stats = statsMsg?.meta;
                if (stats && stats.tokens_total) {
                  const percent = Math.min(100, (stats.tokens_total / stats.tokens_max) * 100);
                  return (
                    <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-full border border-slate-200 shadow-inner">
                      <div className="flex flex-col">
                        <div className="flex justify-between items-center w-24 mb-0.5">
                          <span className="text-[9px] font-bold text-slate-400">CONTEXT</span>
                          <span className="text-[9px] font-mono font-bold text-slate-600">{stats.tokens_total}T</span>
                        </div>
                        <div className="w-24 h-1 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-500 ${percent > 80 ? 'bg-rose-500' : percent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()
            )}
            <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"><Settings size={18} /></button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {currentSession?.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-[90%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border text-slate-400'}`}>
                  {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={`p-4 rounded-2xl shadow-sm overflow-hidden ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-50 text-slate-800 border border-slate-100 rounded-tl-none'}`}>
                  <div className="markdown-content text-[14px] leading-relaxed break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
                      code({node, inline, className, children, ...props}: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-lg my-3 shadow-md"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>{children}</code>
                        );
                      }
                    }}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <footer className="p-6 bg-white border-t border-slate-100">
          <div className="max-w-4xl mx-auto flex gap-2">
            <input value={input} disabled={loading} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={`使用 ${configs[activeProvider].model} 对话...`} className="flex-1 pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
            <button disabled={loading || !input.trim() || !configs[activeProvider].api_key} onClick={handleSend} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center min-w-[48px]">
              {loading ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </footer>
      </main>

      {/* 右侧 Debug 面板 */}
      <aside className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col hidden lg:flex overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-indigo-400" />
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Pipeline Observer</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 font-mono text-[10px] text-indigo-300/50 bg-slate-950 custom-scrollbar">
          {currentSession ? (
            <pre className="whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(currentSession, (key, value) => {
                if (typeof value === 'string') {
                  return value.replace(/\n/g, '\\n'); // 可视化换行符
                }
                return value;
              }, 2)}
            </pre>
          ) : <div className="h-full flex flex-col items-center justify-center text-slate-800 opacity-30"><Database size={32} /></div>}
        </div>
      </aside>
    </div>
  );
}

export default App;
