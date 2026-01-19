import { useState, useEffect } from 'react';
import { Box, Code2, Plus, Save, Trash2, Play, Globe, Settings2, ChevronUp, ChevronDown, Terminal, Keyboard } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim } from '@replit/codemirror-vim';
import type { ModelAdapterConfig } from '../../types';

export function ModelsView({ onBack }: { onBack: () => void }) {
  const [models, setModels] = useState<ModelAdapterConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelAdapterConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [unsavedIds, setUnsavedIds] = useState<Set<string>>(new Set());
  const [originalModel, setOriginalModel] = useState<ModelAdapterConfig | null>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'advanced'>('main');
  const [isVimMode, setIsVimMode] = useState(false);

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
      type: 'openai',
      config: {
          provider: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: '',
          model: ''
      }
    };
    setModels([...models, newModel]);
    setSelectedModel(newModel);
    setOriginalModel(null);
    setUnsavedIds(prev => new Set(prev).add(newId));
  };

  const runDiagnostics = async () => {
    if (!selectedModel) return;
    
    setIsTerminalExpanded(true);

    if (isModified) {
        setTestLogs(['> 检测到未保存的更改，正在自动保存...']);
        try {
            await fetch('/api/models/models', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(selectedModel)
            });
            await fetchModels();
            setOriginalModel(selectedModel);
            setUnsavedIds(prev => {
              const next = new Set(prev);
              next.delete(selectedModel.id);
              return next;
            });
            setTestLogs(prev => [...prev, '> 自动保存成功。']);
        } catch (e) {
            setTestLogs(prev => [...prev, '> 自动保存失败，中止测试。']);
            return;
        }
    }
    
    setIsTesting(true);
    const targetInfo = selectedModel.config.base_url 
        ? selectedModel.config.base_url 
        : (selectedModel.type === 'custom' ? '自定义脚本执行环境' : '默认端点');
        
    setTestLogs(prev => [
        ...prev,
        `> 正在初始化诊断测试: ${selectedModel.id}...`,
        `> [Step 1/2] 连通性检查: 正在探测 ${targetInfo}...`
    ]);

    try {
      const res = await fetch('/api/models/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel.id,
          messages: [{ role: 'user', content: 'Hello! Just testing connection.' }],
          stream: true,
          is_diagnostic: true
        })
      });

      if (!res.ok) {
          const text = await res.text();
          throw new Error(`连接失败 (HTTP ${res.status}): ${text}`);
      }

      setTestLogs(prev => [
        ...prev, 
        '> 连通性检查通过。',
        '> [Step 2/2] 正在等待模型流式回复...'
      ]);
      
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
                 } catch {} // Ignore JSON parsing errors
             } else if (line.trim() !== '' && !line.startsWith(':')) {
                 // Capture non-SSE lines (potential errors from gateway/provider)
                 // Ignore SSE comments starting with ':'
                 setTestLogs(prev => [...prev, `> [Raw]: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`]);
             }
          }
        }
      }
      setTestLogs(prev => [...prev, '> Test finished.']);
    } catch (e: any) {
      setTestLogs(prev => [...prev, `> Error: ${e.message || 'Stream interrupted'}`]);
      console.error(e);
    } finally {
      setIsTesting(false);
    }
  };

  const isModified = JSON.stringify(selectedModel) !== JSON.stringify(originalModel);

  return (
    <main className="flex-1 bg-slate-50 flex overflow-hidden">
      {/* Sidebar - Slimmed Down */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Box className="text-indigo-600" size={18} />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-800">模型适配器</h2>
          </div>
          <button onClick={addNewModel} className="p-1.5 hover:bg-slate-50 rounded-lg text-indigo-600 transition-colors">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedModel(m);
                if (unsavedIds.has(m.id)) {
                    setOriginalModel(null);
                } else {
                    setOriginalModel(m);
                }
              }}
              className={`w-full text-left p-3 rounded-xl transition-all ${selectedModel?.id === m.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs truncate mr-2">{m.name}</span>
                <span className={`text-[8px] px-1 py-0.5 rounded-md uppercase font-black ${selectedModel?.id === m.id ? 'bg-white/20 text-white' : (m.type === 'custom' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')}`}>{m.type}</span>
              </div>
              <div className={`text-[9px] opacity-60 font-mono mt-0.5 ${selectedModel?.id === m.id ? 'text-white' : ''}`}>{m.id}</div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100">
          <button onClick={onBack} className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all">返回控制台</button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedModel ? (
          <>
            <div className="px-8 py-4 border-b border-slate-100 bg-white z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-6">
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-0.5">适配器名称</label>
                    <input
                      className="text-lg font-black text-slate-800 outline-none border-b-2 border-transparent focus:border-indigo-500 bg-transparent"
                      value={selectedModel.name}
                      onChange={e => setSelectedModel({...selectedModel, name: e.target.value})}
                    />
                  </div>
                  <div className="h-8 w-[1px] bg-slate-100"></div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase mb-0.5">运行模式</label>
                      <select 
                        className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-xs font-bold outline-none"
                        value={selectedModel.type === 'custom' ? 'custom' : 'builtin'}
                        onChange={e => {
                            const isCustom = e.target.value === 'custom';
                            const defaultScript = `import json\nimport httpx\n\nasync def generate_stream(messages, config):\n    # 💡 提示: 使用 yield "..." 进行调试日志输出\n    yield "--> [Debug] 正在初始化请求...\\n"\n    \n    api_key = config.get("api_key")\n    base_url = config.get("base_url")\n    model = config.get("model", "gpt-3.5-turbo")\n    \n    headers = {"Authorization": f"Bearer {api_key}"}\n    payload = {"model": model, "messages": [{"role": m.role, "content": m.content} for m in messages], "stream": True}\n    \n    yield f"--> [Debug] 目标端点: {base_url}\\n"\n    \n    async with httpx.AsyncClient(timeout=60.0) as client:\n        async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as resp:\n            if resp.status_code != 200:\n                yield f"--> [Error] API 返回错误: {resp.status_code}\\n"\n                return\n            async for line in resp.aiter_lines():\n                if line.startswith("data: "):\n                    data_str = line[6:].strip()\n                    if data_str == "[DONE]": break\n                    try:\n                        data = json.loads(data_str)\n                        content = data["choices"][0]["delta"].get("content", "")\n                        if content: yield content\n                    except: continue`;
                            setSelectedModel({
                                ...selectedModel, 
                                type: isCustom ? 'custom' : 'openai',
                                script_content: isCustom ? (selectedModel.script_content || defaultScript) : undefined
                            });
                        }}
                      >
                      <option value="builtin">标准模型厂商</option>
                      <option value="custom">自定义脚本</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleSave}
                    disabled={loading || !isModified}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-30 transition-all"
                  >
                    <Save size={14} /> 保存
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={loading || (selectedModel && unsavedIds.has(selectedModel.id))}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center gap-6 border-t border-slate-50 pt-4">
                <button 
                  onClick={() => setActiveTab('main')}
                  className={`text-[10px] font-black uppercase tracking-widest pb-2 transition-all border-b-2 ${activeTab === 'main' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {selectedModel.type === 'custom' ? 'Python 源码' : '基础配置'}
                </button>
                <button 
                  onClick={() => setActiveTab('advanced')}
                  className={`text-[10px] font-black uppercase tracking-widest pb-2 transition-all border-b-2 ${activeTab === 'advanced' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  高级 JSON 配置
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col overflow-hidden relative bg-white">
              {activeTab === 'main' ? (
                selectedModel.type === 'custom' ? (
                  /* Python Editor Mode */
                  <div className="flex-1 flex flex-col bg-[#282c34] overflow-hidden">
                    <div className="bg-slate-900/50 text-slate-500 px-6 py-2 text-[9px] font-mono flex items-center justify-between border-b border-white/5">
                       <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                           <span>ADAPTER_SCRIPT.PY</span>
                         </div>
                         <div className="h-3 w-[1px] bg-white/10"></div>
                         <button 
                            onClick={() => setIsVimMode(!isVimMode)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all ${isVimMode ? 'bg-amber-500/20 text-amber-500 font-bold' : 'hover:text-slate-300'}`}
                         >
                            <Keyboard size={10} />
                            <span>VIM MODE: {isVimMode ? 'ON' : 'OFF'}</span>
                         </button>
                       </div>
                       <button 
                          onClick={() => {
                            const template = `import json\nimport httpx\n\nasync def generate_stream(messages, config):\n    # 💡 提示: 使用 yield "..." 进行调试日志输出\n    yield "--> [Debug] 正在初始化请求...\\n"\n    \n    api_key = config.get("api_key")\n    base_url = config.get("base_url")\n    model = config.get("model", "gpt-3.5-turbo")\n    \n    headers = {"Authorization": f"Bearer {api_key}"}\n    payload = {"model": model, "messages": [{"role": m.role, "content": m.content} for m in messages], "stream": True}\n    \n    yield f"--> [Debug] 目标端点: {base_url}\\n"\n    \n    async with httpx.AsyncClient(timeout=60.0) as client:\n        async with client.stream("POST", f"{base_url}/chat/completions", json=payload, headers=headers) as resp:\n            if resp.status_code != 200:\n                yield f"--> [Error] API 返回错误: {resp.status_code}\\n"\n                return\n            async for line in resp.aiter_lines():\n                if line.startswith("data: "):\n                    data_str = line[6:].strip()\n                    if data_str == "[DONE]": break\n                    try:\n                        data = json.loads(data_str)\n                        content = data["choices"][0]["delta"].get("content", "")\n                        if content: yield content\n                    except: continue`;
                            setSelectedModel({...selectedModel, script_content: template});
                          }}
                          className="hover:text-amber-400 transition-colors"
                        >
                          填充标准模板
                       </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <CodeMirror
                        value={selectedModel.script_content || ''}
                        height="100%"
                        theme={oneDark}
                        extensions={[
                          python(),
                          ...(isVimMode ? [vim()] : [])
                        ]}
                        onChange={(value) => setSelectedModel({...selectedModel, script_content: value})}
                        className="h-full text-sm"
                        basicSetup={{
                          lineNumbers: true,
                          foldGutter: true,
                          highlightActiveLine: true,
                          dropCursor: true,
                          allowMultipleSelections: true,
                          indentOnInput: true,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  /* Built-in Form Mode */
                  <div className="flex-1 p-12 overflow-y-auto">
                    <div className="max-w-2xl mx-auto">
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
                    </div>
                  </div>
                )
              ) : (
                /* Advanced Table Mode */
                <div className="flex-1 p-12 overflow-y-auto bg-slate-50">
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">参数配置表格</h3>
                          <p className="text-[10px] text-slate-400 font-medium mt-1">此处的参数将作为 `config` 字典传递给你的脚本。</p>
                        </div>
                        <button 
                          onClick={() => {
                            const newKey = `param_${Math.random().toString(36).substring(7)}`;
                            setSelectedModel({
                              ...selectedModel,
                              config: { ...selectedModel.config, [newKey]: "" }
                            });
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                        >
                          <Plus size={14} /> 添加参数
                        </button>
                      </div>

                      <div className="space-y-3">
                        {Object.entries(selectedModel.config).map(([key, value], idx) => (
                          <div key={idx} className="flex items-center gap-3 group">
                            <div className="flex-1">
                              <input 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-mono text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={key}
                                onChange={e => {
                                  const newKey = e.target.value;
                                  if (newKey === key) return;
                                  const newConfig = { ...selectedModel.config };
                                  delete newConfig[key];
                                  newConfig[newKey] = value;
                                  setSelectedModel({ ...selectedModel, config: newConfig });
                                }}
                              />
                            </div>
                            <div className="flex-[1.5]">
                              <input 
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                placeholder="值 (字符串/数字/布尔)"
                                onChange={e => {
                                  let val: any = e.target.value;
                                  if (val === "true") val = true;
                                  else if (val === "false") val = false;
                                  else if (!isNaN(Number(val)) && val.trim() !== "") val = Number(val);
                                  
                                  setSelectedModel({
                                    ...selectedModel,
                                    config: { ...selectedModel.config, [key]: val }
                                  });
                                }}
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const configCopy = { ...selectedModel.config };
                                delete configCopy[key];
                                setSelectedModel({ ...selectedModel, config: configCopy });
                              }}
                              className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>

                      {Object.keys(selectedModel.config).length === 0 && (
                        <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
                          <Settings2 size={32} className="mx-auto text-slate-200 mb-3" />
                          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">暂无配置参数</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Terminal Drawer */}
              <div className={`transition-all duration-300 ease-in-out bg-slate-900 border-t border-slate-800 flex flex-col ${isTerminalExpanded ? 'h-80' : 'h-[44px]'}`}>
                <div 
                  className="px-6 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button className="p-1 -ml-1 hover:bg-slate-700 rounded transition-colors text-slate-500">
                        {isTerminalExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </button>
                      <Terminal size={14} className="text-slate-500" />
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">诊断终端</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setTestLogs([])}
                        className="text-[9px] font-black uppercase text-slate-500 hover:text-slate-300 transition-colors"
                    >
                        Clear
                    </button>
                    <button 
                        onClick={!isTesting ? runDiagnostics : undefined}
                        disabled={isTesting}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isTesting ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'}`}
                    >
                        <Play size={12} fill="currentColor" /> {isTesting ? 'Testing...' : 'Run Test'}
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-6 font-mono text-xs overflow-y-auto selection:bg-indigo-500/30">
                  {testLogs.length === 0 ? (
                      <div className="text-slate-600 italic">
                          {'>'} 等待运行诊断测试...<br/>
                          {'>'} 提示: 在自定义脚本中使用 yield 关键字可将调试信息实时输出至此。
                      </div>
                  ) : (
                      <div className="space-y-1">
                          {testLogs.map((log, i) => (
                              <div key={i} className={`whitespace-pre-wrap ${log.includes('Error') || log.includes('failed') ? 'text-rose-400' : log.includes('-->') ? 'text-indigo-400' : 'text-emerald-400/80'}`}>
                                  {log}
                              </div>
                          ))}
                          <div id="logs-end"></div>
                      </div>
                  )}
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
