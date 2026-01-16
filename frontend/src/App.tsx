import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  MessageSquare, Send, User, Bot,
  RefreshCw, Plus, Settings, Terminal, ShieldCheck,
  BookOpen, Activity, Code, Server, Cpu, Zap, CheckCircle2,
  Square, Trash2, CheckSquare, Maximize2, Minimize2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface LLMConfig { provider: string; base_url: string; api_key: string; model: string; }
interface SessionSummary { id: string; app_id: string; updated_at: string; msg_count: number; }
interface TraceEvent { source: string; target: string; action: string; data?: any; timestamp: string; }
interface Message { role: string; content: string; timestamp: string; meta?: any; traces?: TraceEvent[]; }
interface Session { id: string; app_id: string; messages: Message[]; }

const EMPTY_CFG: LLMConfig = { provider: 'gemini', base_url: '', api_key: '', model: 'gemini-1.5-flash' };

function App() {
  const [view, setView] = useState<'chat' | 'docs' | 'settings'>('chat');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [isObserverExpanded, setIsObserverExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 双配置状态
  const [appConfigs, setAppConfigs] = useState<{ agent: LLMConfig, core: LLMConfig }>(() => {
    const saved = localStorage.getItem('cf_app_configs');
    if (saved) return JSON.parse(saved);
    return { agent: { ...EMPTY_CFG }, core: { ...EMPTY_CFG } };
  });

  // 每次配置变化自动存入 LocalStorage
  useEffect(() => { 
    localStorage.setItem('cf_app_configs', JSON.stringify(appConfigs)); 
  }, [appConfigs]);

  useEffect(() => { fetchSessions(); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [currentSession?.messages]);

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
      if (res.data.messages && res.data.messages.length > 0) {
        setActiveTraceIndex(res.data.messages.length - 1);
      } else {
        setActiveTraceIndex(null);
      }
    } catch (err) { console.error(err); }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定删除此会话吗？')) return;
    try {
      await axios.delete(`/api/admin/sessions/${id}`);
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentSession(null);
      }
      await fetchSessions();
    } catch (err) { console.error(err); }
  };

  const deleteSessions = async () => {
    if (!selectedIds.length || !confirm(`确定删除选中的 ${selectedIds.length} 个会话吗？`)) return;
    try {
      await axios.delete('/api/admin/sessions', { data: selectedIds });
      if (selectedIds.includes(selectedId || '')) {
        setSelectedId(null);
        setCurrentSession(null);
      }
      setSelectedIds([]);
      await fetchSessions();
    } catch (err) { console.error(err); }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const sessionId = selectedId || `session-${Math.random().toString(36).substring(7)}`;
    const userMsg: Message = { role: 'user', content: input, timestamp: new Date().toISOString(), traces: [] };
    const tempMessages = currentSession ? [...currentSession.messages, userMsg] : [userMsg];
    const aiMsg: Message = { role: 'assistant', content: '', timestamp: new Date().toISOString(), traces: [] };
    
    setCurrentSession(prev => ({
      id: sessionId,
      app_id: prev?.app_id || 'web',
      messages: [...tempMessages, aiMsg]
    }));
    setActiveTraceIndex(tempMessages.length);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/debug/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          session_id: sessionId,
          query: userMsg.content,
          agent_config: appConfigs.agent,
          core_config: appConfigs.core
        })
      });
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let residual = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const text = residual + decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        residual = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              if (data.type === 'trace') {
                setCurrentSession(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    messages: prev.messages.map((m, idx) => 
                      idx === prev.messages.length - 1 
                        ? { ...m, traces: [...(m.traces || []), { ...data.trace, timestamp: new Date().toISOString() }] }
                        : m
                    )
                  };
                });
              } else if (data.type === 'meta') {
                setCurrentSession(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    messages: prev.messages.map((m, idx) => {
                      // 如果是流还没结束时的 meta（来自 Core 构建上下文），通常关联到用户消息 (idx === messages.length - 2)
                      // 如果是流结束后的 meta（来自 Agent Append 后的返回），此时最后一条 AI 消息已有内容，应该关联到 AI 消息 (idx === messages.length - 1)
                      const isLast = idx === prev.messages.length - 1;
                      const isSecondLast = idx === prev.messages.length - 2;
                      
                      // 简单逻辑：如果当前更新的是正在生成的 AI 消息，且 meta 包含 tokens 信息，则尝试匹配
                      if (isLast && m.role === 'assistant') return { ...m, meta: data.meta };
                      if (isSecondLast && m.role === 'user') return { ...m, meta: data.meta };
                      return m;
                    })
                  };
                });
              } else if (data.type === 'chunk') {
                fullContent += (data.content || '');
                setCurrentSession(prev => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    messages: prev.messages.map((m, idx) => 
                      idx === prev.messages.length - 1 
                        ? { ...m, content: fullContent }
                        : m
                    )
                  };
                });
              }
            } catch (e) {
              console.error('Failed to parse SSE data', e);
            }
          }
        }
      }
      if (!selectedId) setSelectedId(sessionId);
      await fetchSessions();
      // 这里不立即 selectSession，以保留当前的 traces 内存状态，直到用户手动切换
    } catch (err: any) { 
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      } else {
        alert('失败: ' + err.message); 
      }
    } finally { 
      setLoading(false); 
      abortControllerRef.current = null;
    }
  };

  const ConfigBlock = ({ title, icon: Icon, type }: { title: string, icon: any, type: 'agent' | 'core' }) => (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type === 'agent' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
            <Icon size={18} />
          </div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{title}</h3>
        </div>
        {appConfigs[type].api_key && <CheckCircle2 size={16} className="text-emerald-500" />}
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Provider</label>
            <select 
              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-bold outline-none"
              value={appConfigs[type].provider}
              onChange={e => setAppConfigs({...appConfigs, [type]: {...appConfigs[type], provider: e.target.value}})
            }>
              <option value="gemini">Gemini</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">OpenAI</option>
              <option value="mock">Mock</option>
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Model</label>
            <input className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-mono" value={appConfigs[type].model} onChange={e => setAppConfigs({...appConfigs, [type]: {...appConfigs[type], model: e.target.value}})} />
          </div>
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Base URL</label>
          <input className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px] font-mono" value={appConfigs[type].base_url} placeholder="https://..." onChange={e => setAppConfigs({...appConfigs, [type]: {...appConfigs[type], base_url: e.target.value}})} />
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">API Key</label>
          <input type="password" className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-[11px]" value={appConfigs[type].api_key} placeholder="Enter Key..." onChange={e => setAppConfigs({...appConfigs, [type]: {...appConfigs[type], api_key: e.target.value}})} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
      {/* 侧边导航 */}
      <nav className="w-20 bg-slate-900 flex flex-col items-center py-6 gap-8 shadow-2xl z-30">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg cursor-pointer" onClick={() => setView('chat')}><Server size={24} /></div>
        <button onClick={() => setView('chat')} className={`p-3 rounded-xl transition-all ${view === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Activity size={24} /></button>
        <button onClick={() => setView('docs')} className={`p-3 rounded-xl transition-all ${view === 'docs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><BookOpen size={24} /></button>
        <button onClick={() => setView('settings')} className={`p-3 rounded-xl transition-all ${view === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}><Settings size={24} /></button>
      </nav>

      {/* 视图内容 */}
      {view === 'chat' && (
        <>
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-sm">
            <div className="p-5 border-b border-slate-100 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">会话列表</span>
                <div className="flex gap-2">
                  {selectedIds.length > 0 && (
                    <button onClick={deleteSessions} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                  )}
                  <button onClick={fetchSessions} className="text-slate-300 hover:text-indigo-600 transition-colors"><RefreshCw size={14} /></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setSelectedIds(selectedIds.length === sessions.length ? [] : sessions.map(s => s.id))}
                  className="text-[9px] font-black text-slate-400 hover:text-indigo-600 transition-all uppercase tracking-widest flex items-center gap-1"
                >
                  {selectedIds.length === sessions.length ? <CheckSquare size={12} /> : <Square size={12} />}
                  {selectedIds.length > 0 ? `已选 ${selectedIds.length}` : '全选'}
                </button>
              </div>
            </div>
            <div className="p-4"><button onClick={() => { setSelectedId(null); setCurrentSession(null); }} className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-md transition-all"><Plus size={14} /> 新建会话</button></div>
            <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
              {sessions.map(s => (
                <div key={s.id} onClick={() => selectSession(s.id)} className={`group flex items-center gap-2 px-2 py-2.5 rounded-lg cursor-pointer transition-all ${selectedId === s.id ? 'bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                  <div onClick={(e) => toggleSelect(e, s.id)} className={`shrink-0 transition-all ${selectedIds.includes(s.id) ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
                    {selectedIds.includes(s.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                  </div>
                  <MessageSquare size={14} className={selectedId === s.id ? 'text-indigo-600' : 'text-slate-300'} />
                  <div className="flex-1 min-w-0 text-xs truncate">{s.id}</div>
                  <button onClick={(e) => deleteSession(e, s.id)} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <main className="flex-1 flex flex-col min-w-0 bg-white">
            <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-md z-10 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase">
                  <Zap size={10} /> <span className="text-indigo-600">{appConfigs.agent.provider}</span>
                  <div className="w-[1px] h-3 bg-slate-200 mx-1"></div>
                  <Cpu size={10} /> <span className="text-emerald-600">{appConfigs.core.provider}</span>
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
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {currentSession?.messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    onClick={() => m.role === 'assistant' && setActiveTraceIndex(i)}
                    className={`flex gap-4 max-w-[92%] cursor-pointer transition-opacity hover:opacity-90 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>{m.role === 'user' ? <User size={14} /> : <Bot size={14} />}</div>
                    <div className={`p-5 rounded-2xl shadow-sm border ${m.role === 'user' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-50 text-slate-800 border-slate-100'} ${activeTraceIndex === i ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}><div className="markdown-content text-sm leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({node, inline, className, children, ...props}: any) { const match = /language-(\w+)/.exec(className || ''); return !inline && match ? ( <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" className="rounded-lg my-4" {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter> ) : <code className="bg-slate-200 text-pink-600 px-1 rounded mx-1 font-mono text-[12px]" {...props}>{children}</code>; } }}>{m.content}</ReactMarkdown></div></div>
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
                  <button disabled={!input.trim() || (!appConfigs.agent.api_key && appConfigs.agent.provider !== 'mock')} onClick={handleSend} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg flex items-center justify-center min-w-[50px] transition-all disabled:opacity-30">
                    <Send size={18} />
                  </button>
                )}
              </div>
            </footer>
          </main>
          <aside className={`${isObserverExpanded ? 'w-[600px]' : 'w-96'} bg-slate-900 border-l border-slate-800 flex flex-col hidden xl:flex overflow-hidden transition-all duration-300 ease-in-out`}>
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-indigo-400" />
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">流程观察器 (Pipeline Observer)</span>
              </div>
              <button 
                onClick={() => setIsObserverExpanded(!isObserverExpanded)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
              >
                {isObserverExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-6 custom-scrollbar bg-slate-950">
              {currentSession && activeTraceIndex !== null && currentSession.messages[activeTraceIndex]?.traces ? (
                <div className="space-y-8">
                  {currentSession.messages[activeTraceIndex].traces?.map((t, idx) => (
                    <div key={idx} className="relative pl-6 border-l border-slate-800 last:border-0 pb-2">
                      <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-indigo-300 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/30 uppercase tracking-tighter">{t.source}</span>
                            <Send size={8} className="text-slate-600" />
                            <span className="text-[10px] font-black text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-tighter">{t.target}</span>
                          </div>
                          <span className="text-[8px] font-mono text-slate-600 font-bold">{new Date(t.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[12px] font-black text-white bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50 shadow-sm">{t.action}</div>
                        {t.data && (
                          <div className="bg-slate-900/80 rounded-lg p-3 border border-slate-800 shadow-inner">
                            <pre className="text-[10px] text-indigo-300/90 font-mono whitespace-pre-wrap break-all leading-relaxed">
                              {JSON.stringify(t.data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4 opacity-50 text-center">
                  <Activity size={40} className="animate-pulse" />
                  <div className="text-[10px] font-black uppercase tracking-[0.2em]">等待交互数据...<br/><span className="mt-2 block font-normal text-slate-600">点击 AI 回复可查看该轮 Pipeline 详情</span></div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {view === 'docs' && (
        <main className="flex-1 bg-white overflow-y-auto p-12 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm"><Code size={28} /></div>
              <div><h1 className="text-3xl font-black text-slate-800 tracking-tight">API 接口文档</h1><p className="text-slate-500 font-medium">ContextFabric Core v1.0.0</p></div>
            </div>
            
            <section className="mb-12 text-sm leading-relaxed text-slate-600 bg-slate-50 p-6 rounded-2xl border border-slate-100">
              ContextFabric Core 提供无状态的上下文工程能力，负责会话管理、历史持久化以及 Token 优化裁剪。
            </section>

            <div className="space-y-12">
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div> 上下文构建 (Build Context)</h2>
                <p className="text-xs text-slate-500">获取经过 Token 优化和系统指令注入后的完整对话 Payload。</p>
                <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-indigo-300 shadow-xl overflow-x-auto">
                  <pre>{`POST /api/v1/context\n\n请求体:\n{\n  "session_id": "string",\n  "query": "用户输入",\n  "config": { "model": "..." }\n}\n\n响应:\n{\n  "messages": [\n    { "role": "system", "content": "..." },\n    { "role": "user", "content": "...", "meta": { "tokens_total": 120 } }\n  ]\n}`}</pre>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div> 消息追加 (Append Message)</h2>
                <p className="text-xs text-slate-500">将模型生成的回复或用户消息手动存入持久化层。</p>
                <div className="bg-slate-900 rounded-2xl p-6 font-mono text-xs text-emerald-300 shadow-xl overflow-x-auto">
                  <pre>{`POST /api/v1/messages\n\n请求体:\n{\n  "session_id": "string",\n  "message": {\n    "role": "assistant",\n    "content": "内容",\n    "timestamp": "2026-01-16T..."\n  }\n}`}</pre>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div> 会话管理 (Admin APIs)</h2>
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-indigo-600">GET /api/admin/sessions</code>
                    <p className="text-[10px] text-slate-500 mt-1">获取所有活跃会话的摘要列表。</p>
                  </div>
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-indigo-600">GET /api/admin/sessions/:id</code>
                    <p className="text-[10px] text-slate-500 mt-1">获取指定会话的完整历史记录。</p>
                  </div>
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-red-600">DELETE /api/admin/sessions/:id</code>
                    <p className="text-[10px] text-slate-500 mt-1">永久删除指定会话的文件。</p>
                  </div>
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                    <code className="text-xs font-bold text-red-600">DELETE /api/admin/sessions</code>
                    <p className="text-[10px] text-slate-500 mt-1">批量删除会话。请求体为 ID 数组: <code className="bg-white px-1">["id1", "id2"]</code></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {view === 'settings' && (
        <main className="flex-1 bg-slate-50 overflow-y-auto p-12 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl"><Settings size={28} /></div>
                <div><h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">系统设置</h1><p className="text-slate-500 font-bold text-xs uppercase tracking-widest mt-1 text-emerald-600">所有配置实时同步至 LocalStorage</p></div>
              </div>
              <button onClick={() => setView('chat')} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 uppercase">返回控制台</button>
            </div>
            
            <div className="grid grid-cols-1 gap-8">
              <ConfigBlock title="对话模型 (Agent LLM)" icon={Zap} type="agent" />
              <ConfigBlock title="上下文引擎 (Core Engine)" icon={Cpu} type="core" />
            </div>

            <div className="mt-12 bg-white border border-indigo-100 rounded-3xl p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4 text-indigo-600"><ShieldCheck size={20} /><h3 className="text-sm font-black uppercase tracking-widest">安全与持久化</h3></div>
              <p className="text-slate-500 text-xs leading-relaxed font-medium">配置已通过 React State 实时同步至浏览器的 <b>LocalStorage</b>。无需手动点击保存，所有更改在输入时即刻生效。后端服务仅在处理请求时使用这些密钥，不会在服务器端进行任何持久化记录。</p>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
