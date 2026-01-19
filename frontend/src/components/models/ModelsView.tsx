import { useState, useEffect } from 'react';
import { Box, Code2, Plus, Save, Trash2, Play, Globe, Settings2 } from 'lucide-react';
import type { ModelAdapterConfig } from '../../types';

export function ModelsView({ onBack }: { onBack: () => void }) {
  const [models, setModels] = useState<ModelAdapterConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelAdapterConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [unsavedIds, setUnsavedIds] = useState<Set<string>>(new Set());
  const [originalModel, setOriginalModel] = useState<ModelAdapterConfig | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const resp = await fetch('/api/models/models');
      const data = await resp.json();
      setModels(data.data);
      if (data.data.length > 0 && !selectedModel) {
        setSelectedModel(data.data[0]);
        setOriginalModel(data.data[0]);
      }
    } catch (e) {
      console.error("Failed to fetch models", e);
    }
  };

  const handleSave = async () => {
    if (!selectedModel) return;
    setLoading(true);
    try {
      await fetch('/api/models/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedModel)
      });
      await fetchModels();
      if (selectedModel) {
        setOriginalModel(selectedModel);
        setUnsavedIds(prev => {
          const next = new Set(prev);
          next.delete(selectedModel.id);
          return next;
        });
      }
      alert("保存成功");
    } catch (e) {
      alert("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedModel) return;
    if (!confirm(`确定要删除模型 "${selectedModel.name}" 吗？`)) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/models/models/${selectedModel.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error("Delete failed");
      await fetchModels();
      setSelectedModel(null);
      setOriginalModel(null);
    } catch (e) {
      alert("删除失败: " + e);
    } finally {
      setLoading(false);
    }
  };

  const addNewModel = () => {
    const newId = `model-${Math.random().toString(36).substring(7)}`;
    const newModel: ModelAdapterConfig = {
      id: newId,
      name: '新模型适配器',
      type: 'openai', // 默认标准类型
      config: {
          provider: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: '',
          model: ''
      }
    };
    setModels([...models, newModel]);
    setSelectedModel(newModel);
    setOriginalModel(null); // New models are always considered "modified" relative to nothing
    setUnsavedIds(prev => new Set(prev).add(newId));
  };

  const runDiagnostics = async () => {
    if (!selectedModel) return;
    if (isModified) {
        alert("请先保存配置后再进行诊断测试。");
        return;
    }
    
    setIsTesting(true);
    setTestLogs([`> Initializing test for ${selectedModel.id}...`]);

    try {
      const res = await fetch('/api/models/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel.id,
          messages: [{ role: 'user', content: 'Hello! Just testing connection.' }],
          stream: true
        })
      });

      if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
      }

      setTestLogs(prev => [...prev, '> Connected. Waiting for response...']);
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
             if (line.startsWith('data: ')) {
                 const dataStr = line.slice(6).trim();
                 if (dataStr === '[DONE]') break;
                 try {
                     const data = JSON.parse(dataStr);
                     const content = data.choices[0]?.delta?.content;
                     if (content) {
                         setTestLogs(prev => {
                             const last = prev[prev.length - 1];
                             if (last && last.startsWith('> Rcv: ')) {
                                 return [...prev.slice(0, -1), last + content];
                             }
                             return [...prev, `> Rcv: ${content}`];
                         });
                     }
                 } catch {}
             }
          }
        }
      }
      setTestLogs(prev => [...prev, '> Test finished.']);
    } catch (e: any) {
      setTestLogs(prev => [...prev, `> Error: ${e.message}`]);
    } finally {
      setIsTesting(false);
    }
  };

  const isModified = JSON.stringify(selectedModel) !== JSON.stringify(originalModel);

  return (
    <main className="flex-1 bg-slate-50 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="text-indigo-600" size={20} />
            <h2 className="text-sm font-black uppercase tracking-widest">模型适配器</h2>
          </div>
          <button onClick={addNewModel} className="p-2 hover:bg-slate-50 rounded-lg text-indigo-600">
            <Plus size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedModel(m);
                // If it's an unsaved new model, originalModel should act as null to keep Save button enabled
                // Otherwise, reset originalModel to the fetched state
                if (unsavedIds.has(m.id)) {
                    setOriginalModel(null);
                } else {
                    setOriginalModel(m);
                }
              }}
              className={`w-full text-left p-4 rounded-2xl transition-all ${selectedModel?.id === m.id ? 'bg-indigo-50 border-indigo-100 text-indigo-700 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm">{m.name}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-black ${m.type === 'custom' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{m.type}</span>
              </div>
              <div className="text-[10px] opacity-60 font-mono mt-1">{m.id}</div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button onClick={onBack} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800">返回控制台</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedModel ? (
          <>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">适配器名称</label>
                  <input
                    className="text-xl font-black text-slate-800 outline-none border-b-2 border-transparent focus:border-indigo-500"
                    value={selectedModel.name}
                    onChange={e => setSelectedModel({...selectedModel, name: e.target.value})}
                  />
                </div>
                <div className="h-10 w-[1px] bg-slate-100"></div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">运行模式</label>
                  <select 
                    className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1 text-sm font-bold outline-none"
                    value={selectedModel.type === 'custom' ? 'custom' : 'builtin'}
                    onChange={e => {
                        const isCustom = e.target.value === 'custom';
                        const defaultScript = `import json\nimport httpx\n\nasync def generate_stream(messages, config):\n    api_key = config.get("api_key")\n    base_url = config.get("base_url", "https://api.deepseek.com")\n    \n    msgs = [{"role": m.role, "content": m.content} for m in messages]\n    headers = {"Authorization": f"Bearer {api_key}"}\n    payload = {"model": "deepseek-chat", "messages": msgs, "stream": True}\n    \n    async with httpx.AsyncClient(timeout=60.0) as client:\n        async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as resp:\n            async for line in resp.aiter_lines():\n                if line.startswith("data: "):\n                    data_str = line[6:]\n                    if data_str.strip() == "[DONE]": break\n                    try:\n                        yield json.loads(data_str)["choices"][0]["delta"].get("content", "")\n                    except: continue`;
                        setSelectedModel({
                            ...selectedModel, 
                            type: isCustom ? 'custom' : 'openai',
                            script_content: isCustom ? (selectedModel.script_content || defaultScript) : undefined
                        });
                    }}
                  >
                    <option value="builtin">标准模型厂商 (内置适配器)</option>
                    <option value="custom">自定义 Python 脚本</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleSave}
                  disabled={loading || !isModified}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={16} /> {loading ? 'Saving...' : '保存'}
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={loading || (selectedModel && unsavedIds.has(selectedModel.id))}
                  className="flex items-center gap-2 px-4 py-3 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-600 shadow-xl shadow-rose-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} /> 删除
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
              {selectedModel.type === 'custom' ? (
                /* Python Editor Mode */
                <div className="flex-1 flex flex-col">
                  <div className="bg-slate-900 text-slate-400 px-4 py-2 text-[10px] font-mono flex items-center justify-between">
                    <div className="flex items-center gap-2"><Code2 size={14} className="text-amber-500" /> <span>ADAPTER_SCRIPT.PY</span></div>
                    <span className="opacity-50 text-[9px]">EXECUTES DYNAMICALLY ON GATEWAY</span>
                  </div>
                  <textarea
                    className="flex-1 bg-slate-950 text-emerald-400 p-8 font-mono text-sm outline-none resize-none leading-relaxed"
                    value={selectedModel.script_content || ''}
                    onChange={e => setSelectedModel({...selectedModel, script_content: e.target.value})}
                    spellCheck={false}
                  />
                </div>
              ) : (
                /* Built-in Form Mode */
                <div className="flex-1 p-12 overflow-y-auto">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-3 mb-8">
                       <Globe className="text-indigo-600" size={24} />
                       <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">模型服务商配置</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-8 mb-8">
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">服务商 (Provider)</label>
                        <select 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          value={selectedModel.type}
                          onChange={e => setSelectedModel({...selectedModel, type: e.target.value})}
                        >
                          <option value="openai">OpenAI (or Compatible)</option>
                          <option value="gemini">Google Gemini</option>
                          <option value="deepseek">DeepSeek</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">模型名称 (Model Name)</label>
                        <input 
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 transition-all"
                          value={selectedModel.config.model || ''}
                          placeholder="e.g. gpt-4, deepseek-chat"
                          onChange={e => setSelectedModel({...selectedModel, config: {...selectedModel.config, model: e.target.value}})}
                        />
                      </div>
                    </div>

                    <div className="mb-8">
                      <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">基础 URL (Base URL)</label>
                      <input 
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        value={selectedModel.config.base_url || ''}
                        placeholder="https://api.openai.com/v1"
                        onChange={e => setSelectedModel({...selectedModel, config: {...selectedModel.config, base_url: e.target.value}})}
                      />
                    </div>

                    <div className="mb-8">
                      <label className="block text-[11px] font-black text-slate-400 uppercase mb-2 ml-1">API 密钥 (API Key)</label>
                      <input 
                        type="password"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        value={selectedModel.config.api_key || ''}
                        placeholder="sk-..."
                        onChange={e => setSelectedModel({...selectedModel, config: {...selectedModel.config, api_key: e.target.value}})}
                      />
                    </div>

                    <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100">
                        <div className="flex items-start gap-3">
                           <Settings2 className="text-indigo-600 mt-1" size={18} />
                           <div>
                             <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest mb-1">智能路由提示</h4>
                             <p className="text-indigo-700/70 text-[11px] leading-relaxed">选择内置适配器后，Gateway 将使用标准 OpenAI 协议转发请求。如果你的服务商有特殊协议需求，请切换到“自定义 Python 脚本”模式手动实现流式处理逻辑。</p>
                           </div>
                        </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="w-80 bg-slate-50 border-l border-slate-100 flex flex-col">
                <div className="p-6 border-b border-slate-200 bg-white">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">扩展 JSON 配置</h3>
                  <textarea
                    key={selectedModel.id + JSON.stringify(selectedModel.config)}
                    className="w-full h-48 bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-[10px] outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all"
                    defaultValue={JSON.stringify(selectedModel.config, null, 2)}
                    onBlur={e => {
                        try {
                            const parsed = JSON.parse(e.target.value);
                            setSelectedModel({...selectedModel, config: parsed});
                        } catch(err) {}
                    }}
                  />
                  <p className="mt-2 text-[9px] text-slate-400 italic font-medium">这些参数将作为 `config` 字典传递给你的适配器或内置逻辑。</p>
                </div>
                <div className="flex-1 p-6 flex flex-col">
                   <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">适配器诊断</h3>
                    <Play 
                        size={14} 
                        onClick={!isTesting ? runDiagnostics : undefined}
                        className={`text-emerald-500 cursor-pointer hover:scale-110 transition-transform ${isTesting ? 'opacity-50 animate-pulse' : ''}`} 
                    />
                  </div>
                  <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 text-[11px] text-slate-400 font-medium font-mono overflow-y-auto">
                    {testLogs.length === 0 ? (
                        <>
                            {'>'} Ready to test adapter...<br/>
                            {'>'} Model: {selectedModel.id}<br/>
                            {'>'} Type: {selectedModel.type}<br/>
                        </>
                    ) : (
                        testLogs.map((log, i) => <div key={i} className="whitespace-pre-wrap mb-1">{log}</div>)
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-300 flex-col gap-4">
            <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center shadow-inner"><Box size={40} /></div>
            <div className="font-black uppercase tracking-widest text-sm text-slate-400">请选择或创建一个模型适配器</div>
          </div>
        )}
      </div>
    </main>
  );
}
