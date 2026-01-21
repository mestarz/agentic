import { useState, useEffect } from 'react';
import {
  Box,
  Plus,
  Save,
  Trash2,
  Play,
  Terminal,
  Keyboard,
  MessageSquare,
  Hash,
  Activity,
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim } from '@replit/codemirror-vim';
import { keymap } from '@codemirror/view';
import type { ModelAdapterConfig, AppConfigs } from '../../types';

interface ModelsViewProps {
  onBack: () => void;
  appConfigs: AppConfigs;
  setAppConfigs: React.Dispatch<React.SetStateAction<AppConfigs>>;
}

export function ModelsView({ onBack, appConfigs, setAppConfigs }: ModelsViewProps) {
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

  const fetchModels = async () => {
    try {
      const resp = await fetch('/api/models/models');
      const data = await resp.json();
      const loaded = (data.data || []).map((m: ModelAdapterConfig) => ({
        ...m,
        purpose: m.purpose || 'chat',
      }));
      setModels(loaded);
      if (loaded.length > 0 && !selectedModel) {
        setSelectedModel(loaded[0]);
        setOriginalModel(loaded[0]);
      }
    } catch (e) {
      console.error('Failed to fetch models', e);
    }
  };

  useEffect(() => {
    fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!selectedModel) return;
    setLoading(true);
    try {
      await fetch('/api/models/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedModel),
      });
      await fetchModels();
      setOriginalModel(selectedModel);
      setUnsavedIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedModel.id);
        return next;
      });
    } catch {
      alert('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedModel) return;
    const deletedId = selectedModel.id;
    if (!confirm(`确定要删除模型 "${selectedModel.name}" 吗？`)) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/models/models/${deletedId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Delete failed');

      const refreshResp = await fetch('/api/models/models');
      const refreshData = await refreshResp.json();
      const updatedModels = refreshData.data || [];
      setModels(updatedModels);

      if (
        appConfigs.agentModelID === deletedId ||
        appConfigs.coreModelID === deletedId ||
        appConfigs.ragEmbeddingModelID === deletedId
      ) {
        setAppConfigs((prev) => {
          const next = { ...prev };
          const fallbackId = updatedModels.length > 0 ? updatedModels[0].id : 'mock-model';
          if (prev.agentModelID === deletedId) next.agentModelID = fallbackId;
          if (prev.coreModelID === deletedId) next.coreModelID = fallbackId;
          if (prev.ragEmbeddingModelID === deletedId) next.ragEmbeddingModelID = fallbackId;
          return next;
        });
      }

      setSelectedModel(null);
      setOriginalModel(null);
    } catch (err) {
      alert('删除失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const addNewModel = (purpose: 'chat' | 'embedding' = 'chat') => {
    const newId = `${purpose}-${Math.random().toString(36).substring(7)}`;
    const newModel: ModelAdapterConfig = {
      id: newId,
      name: purpose === 'chat' ? '新对话模型' : '新向量模型',
      purpose: purpose,
      type: 'openai',
      config: {
        provider: 'openai',
        base_url: 'https://api.openai.com/v1',
        api_key: '',
        model: '',
      },
    };
    setModels([...models, newModel]);
    setSelectedModel(newModel);
    setOriginalModel(null);
    setUnsavedIds((prev) => new Set(prev).add(newId));
  };

  const getChatTemplate = () => {
    return [
      'import json',
      'import httpx',
      '',
      'async def generate_stream(messages, config):',
      '    url = "https://api.deepseek.com/chat/completions"',
      '    api_key = "YOUR_API_KEY"',
      '    headers = {"Authorization": f"Bearer {api_key}"}',
      '    payload = {"model": "deepseek-chat", "messages": [{"role": m.role, "content": m.content} for m in messages], "stream": True}',
      '    yield f"--> [调试] 正在请求: {url}\n"',
      '    async with httpx.AsyncClient(timeout=60.0) as client:',
      '        async with client.stream("POST", url, json=payload, headers=headers) as resp:',
      '            if resp.status_code != 200:',
      '                yield f"--> [错误] 接口报错: {resp.status_code}\n"',
      '                return',
      '            async for line in resp.aiter_lines():',
      '                if line.startswith("data: "):',
      '                    data_str = line[6:].strip()',
      '                    if data_str == "[DONE]": break',
      '                    try:',
      '                        content = json.loads(data_str)["choices"][0]["delta"].get("content", "")',
      '                        if content: yield content',
      '                    except Exception: continue',
    ].join('\n');
  };

  const getEmbeddingTemplate = () => {
    return [
      'import json',
      'import httpx',
      '',
      'async def get_embeddings(input_text, config):',
      '    # 向量模型适配器模板',
      '    return {"data": [{"embedding": [0.1] * 1536}]}',
    ].join('\n');
  };

  const runDiagnostics = async () => {
    if (!selectedModel) return;
    setIsTerminalExpanded(true);
    setTestLogs([]);

    const currentIsModified = JSON.stringify(selectedModel) !== JSON.stringify(originalModel);
    if (currentIsModified) {
      setTestLogs((prev) => [...prev, '> 检测到未保存的更改，正在自动保存...']);
      try {
        await handleSave();
        setTestLogs((prev) => [...prev, '> 自动保存成功。']);
      } catch {
        setTestLogs((prev) => [...prev, '> 自动保存失败，中止测试。']);
        return;
      }
    }

    setIsTesting(true);
    const start = Date.now();

    if (selectedModel.purpose === 'embedding') {
      setTestLogs((prev) => [
        ...prev,
        `> 启动向量化诊断: ${selectedModel.id}...`,
        `> 输入文本: "Hello world"`,
      ]);
      try {
        const res = await fetch('/api/debug/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_id: selectedModel.id, input: 'Hello world' }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const duration = Date.now() - start;

        const vector = data.data?.[0]?.embedding || [];
        setTestLogs((prev) => [
          ...prev,
          `> 诊断成功！耗时: ${duration}ms`,
          `> 向量维度: ${vector.length}`,
          `> 预览 (前5位): [${vector.slice(0, 5).join(', ')} ...]`,
        ]);
      } catch (err: unknown) {
        setTestLogs((prev) => [
          ...prev,
          `> 向量化失败: ${err instanceof Error ? err.message : String(err)}`,
        ]);
      } finally {
        setIsTesting(false);
      }
      return;
    }

    const targetInfo = selectedModel.config.base_url || '自定义逻辑地址';
    setTestLogs((prev) => [
      ...prev,
      `> 启动对话诊断: ${selectedModel.id}...`,
      `> [Step 1/2] 发起请求: ${targetInfo}...`,
    ]);

    try {
      const res = await fetch('/api/debug/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'diag-' + Date.now(),
          query: '你好！',
          agent_model_id: selectedModel.id,
          core_model_id: selectedModel.id,
          rag_enabled: false,
        }),
      });
      if (!res.ok) throw new Error(`连接失败 (HTTP ${res.status})`);
      setTestLogs((prev) => [...prev, '> 连接建立成功。[Step 2/2] 等待流式回复...']);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') break;
              try {
                const data = JSON.parse(dataStr);
                if (data.type === 'chunk' && data.content) {
                  setTestLogs((prev) => {
                    const last = prev[prev.length - 1];
                    if (last && last.startsWith('> 回复: '))
                      return [...prev.slice(0, -1), last + data.content];
                    return [...prev, `> 回复: ${data.content}`];
                  });
                } else if (data.type === 'trace') {
                  setTestLogs((prev) => [
                    ...prev,
                    `> [Trace] ${data.trace.source} -> ${data.trace.target}: ${data.trace.action}`,
                  ]);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
      setTestLogs((prev) => [...prev, `> 诊断结束。总耗时: ${Date.now() - start}ms`]);
    } catch (err: unknown) {
      setTestLogs((prev) => [
        ...prev,
        `> 错误: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setIsTesting(false);
    }
  };

  const isModified = JSON.stringify(selectedModel) !== JSON.stringify(originalModel);

  const chatModels = models.filter((m) => m.purpose === 'chat' || !m.purpose);
  const embeddingModels = models.filter((m) => m.purpose === 'embedding');

  return (
    <main className="flex flex-1 overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div className="flex items-center gap-2">
            <Box className="text-indigo-600" size={18} />
            <h2 className="text-[10px] font-black tracking-widest text-slate-800 uppercase">
              模型适配中心
            </h2>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 space-y-8 overflow-y-auto bg-slate-50/30 p-4">
          {/* LLM Section */}
          <div>
            <div className="mb-3 flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-indigo-600">
                <MessageSquare size={14} />
                <span className="text-[10px] font-black tracking-widest uppercase">
                  对话模型 (LLM)
                </span>
              </div>
              <button
                onClick={() => addNewModel('chat')}
                className="rounded p-1 text-indigo-600 transition-colors hover:bg-indigo-50"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {chatModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m);
                    setOriginalModel(unsavedIds.has(m.id) ? null : m);
                  }}
                  className={`w-full rounded-xl p-3 text-left transition-all ${selectedModel?.id === m.id ? 'scale-[1.02] bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mr-2 truncate text-xs font-bold">{m.name}</span>
                    <span
                      className={`rounded-md px-1 py-0.5 text-[8px] font-black uppercase ${selectedModel?.id === m.id ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'}`}
                    >
                      {m.type}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 font-mono text-[9px] opacity-60 ${selectedModel?.id === m.id ? 'text-white' : ''}`}
                  >
                    {m.id}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Embedding Section */}
          <div>
            <div className="mb-3 flex items-center justify-between px-2">
              <div className="flex items-center gap-2 text-emerald-600">
                <Hash size={14} />
                <span className="text-[10px] font-black tracking-widest uppercase">
                  向量模型 (Embedding)
                </span>
              </div>
              <button
                onClick={() => addNewModel('embedding')}
                className="rounded p-1 text-emerald-600 transition-colors hover:bg-emerald-50"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {embeddingModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setSelectedModel(m);
                    setOriginalModel(unsavedIds.has(m.id) ? null : m);
                  }}
                  className={`w-full rounded-xl p-3 text-left transition-all ${selectedModel?.id === m.id ? 'scale-[1.02] bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="mr-2 truncate text-xs font-bold">{m.name}</span>
                    <span
                      className={`rounded-md px-1 py-0.5 text-[8px] font-black uppercase ${selectedModel?.id === m.id ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-600'}`}
                    >
                      {m.type}
                    </span>
                  </div>
                  <div
                    className={`mt-0.5 font-mono text-[9px] opacity-60 ${selectedModel?.id === m.id ? 'text-white' : ''}`}
                  >
                    {m.id}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white p-4">
          <button
            onClick={onBack}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-[10px] font-bold tracking-widest text-white uppercase shadow-xl shadow-slate-200 transition-all hover:bg-slate-800"
          >
            返回控制台
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {selectedModel ? (
          <>
            <div className="z-10 shrink-0 border-b border-slate-100 bg-white px-8 py-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <label className="mb-0.5 block text-[9px] font-black text-slate-400 uppercase">
                      适配器名称
                    </label>
                    <input
                      className="border-b-2 border-transparent bg-transparent text-lg font-black text-slate-800 outline-none focus:border-indigo-500"
                      value={selectedModel.name}
                      onChange={(e) => setSelectedModel({ ...selectedModel, name: e.target.value })}
                    />
                  </div>
                  <div className="h-8 w-[1px] bg-slate-100"></div>
                  <div>
                    <label className="mb-0.5 block text-[9px] font-black text-slate-400 uppercase">
                      用途定位
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-1">
                      <button
                        onClick={() => setSelectedModel({ ...selectedModel, purpose: 'chat' })}
                        className={`rounded-lg px-3 py-1 text-[9px] font-black uppercase transition-all ${selectedModel.purpose === 'chat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => setSelectedModel({ ...selectedModel, purpose: 'embedding' })}
                        className={`rounded-lg px-3 py-1 text-[9px] font-black uppercase transition-all ${selectedModel.purpose === 'embedding' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Embedding
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={loading || !isModified}
                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-[10px] font-black tracking-widest text-white uppercase shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 disabled:opacity-30"
                  >
                    <Save size={14} /> 保存修改
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={loading || (selectedModel && unsavedIds.has(selectedModel.id))}
                    className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-[10px] font-black tracking-widest text-slate-500 uppercase transition-all hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-6 border-t border-slate-50 pt-4">
                <button
                  onClick={() => setActiveTab('main')}
                  className={`border-b-2 pb-2 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === 'main' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {selectedModel.type === 'custom' ? 'Python 源码' : '基础配置'}
                </button>
                <button
                  onClick={() => setActiveTab('advanced')}
                  className={`border-b-2 pb-2 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === 'advanced' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  参数配置表格
                </button>
              </div>
            </div>

            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1 flex-col overflow-hidden">
                {activeTab === 'main' ? (
                  selectedModel.type === 'custom' ? (
                    <div className="flex flex-1 flex-col overflow-hidden bg-[#282c34]">
                      <div className="flex items-center justify-between border-b border-white/5 bg-slate-900/50 px-6 py-2 font-mono text-[9px] text-slate-500">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${selectedModel.purpose === 'embedding' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                            ></div>
                            <span>
                              {selectedModel.purpose === 'embedding'
                                ? 'EMBEDDING_ADAPTER.PY'
                                : 'CHAT_ADAPTER.PY'}
                            </span>
                          </div>
                          <div className="h-3 w-[1px] bg-white/10"></div>
                          <button
                            onClick={() => setIsVimMode(!isVimMode)}
                            className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-all ${isVimMode ? 'bg-amber-500/20 font-bold text-amber-500' : 'hover:text-slate-300'}`}
                          >
                            <Keyboard size={10} />
                            <span>VIM MODE: {isVimMode ? 'ON' : 'OFF'}</span>
                          </button>
                        </div>
                        <button
                          onClick={() =>
                            setSelectedModel({
                              ...selectedModel,
                              script_content:
                                selectedModel.purpose === 'embedding'
                                  ? getEmbeddingTemplate()
                                  : getChatTemplate(),
                            })
                          }
                          className="text-[9px] font-bold uppercase transition-colors hover:text-amber-400"
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
                            ...(isVimMode ? [vim()] : []),
                            keymap.of([
                              {
                                key: 'Mod-s',
                                run: () => {
                                  handleSave();
                                  return true;
                                },
                              },
                            ]),
                          ]}
                          onChange={(value) =>
                            setSelectedModel({ ...selectedModel, script_content: value })
                          }
                          className="h-full text-sm"
                          basicSetup={{
                            lineNumbers: true,
                            highlightActiveLine: true,
                            indentOnInput: true,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto bg-slate-50/20 p-12">
                      <div className="mx-auto max-w-2xl space-y-8">
                        <div className="grid grid-cols-2 gap-8">
                          <div>
                            <label className="mb-2 ml-1 block text-[11px] font-black text-slate-400 uppercase">
                              后端厂商
                            </label>
                            <select
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/10"
                              value={selectedModel.type}
                              onChange={(e) =>
                                setSelectedModel({ ...selectedModel, type: e.target.value })
                              }
                            >
                              <option value="openai">OpenAI (Standard)</option>
                              <option value="gemini">Google Gemini</option>
                              <option value="deepseek">DeepSeek</option>
                              <option value="anthropic">Anthropic</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-2 ml-1 block text-[11px] font-black text-slate-400 uppercase">
                              后端模型名 (ID)
                            </label>
                            <input
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm shadow-sm focus:ring-2 focus:ring-indigo-500/10"
                              value={(selectedModel.config.model as string) || ''}
                              placeholder={
                                selectedModel.purpose === 'embedding'
                                  ? 'text-embedding-3-small'
                                  : 'gpt-4'
                              }
                              onChange={(e) =>
                                setSelectedModel({
                                  ...selectedModel,
                                  config: { ...selectedModel.config, model: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <label className="mb-2 ml-1 block text-[11px] font-black text-slate-400 uppercase">
                            基础 URL (API Endpoint)
                          </label>
                          <input
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/10"
                            value={(selectedModel.config.base_url as string) || ''}
                            placeholder="https://..."
                            onChange={(e) =>
                              setSelectedModel({
                                ...selectedModel,
                                config: { ...selectedModel.config, base_url: e.target.value },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-2 ml-1 block text-[11px] font-black text-slate-400 uppercase">
                            API 密钥 (API Key)
                          </label>
                          <input
                            type="password"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/10"
                            value={(selectedModel.config.api_key as string) || ''}
                            placeholder="sk-..."
                            onChange={(e) =>
                              setSelectedModel({
                                ...selectedModel,
                                config: { ...selectedModel.config, api_key: e.target.value },
                              })
                            }
                          />
                        </div>

                        <div
                          className={`rounded-3xl border border-dashed p-6 ${selectedModel.purpose === 'embedding' ? 'border-emerald-100 bg-emerald-50' : 'border-indigo-100 bg-indigo-50'}`}
                        >
                          <div className="mb-2 flex items-center gap-3">
                            <Activity
                              size={16}
                              className={
                                selectedModel.purpose === 'embedding'
                                  ? 'text-emerald-600'
                                  : 'text-indigo-600'
                              }
                            />
                            <h4
                              className={`text-[10px] font-black tracking-widest uppercase ${selectedModel.purpose === 'embedding' ? 'text-emerald-600' : 'text-indigo-600'}`}
                            >
                              配置指引
                            </h4>
                          </div>
                          <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                            标准模式下，系统将自动使用 OpenAI 兼容协议发起请求。
                            {selectedModel.purpose === 'embedding'
                              ? '对于向量模型，系统将请求 `/embeddings` 端点。'
                              : '对于对话模型，系统将请求 `/chat/completions` 端点。'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex-1 overflow-y-auto bg-slate-50 p-12">
                    <div className="mx-auto max-w-3xl">
                      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                        <div className="mb-8 flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-black tracking-tight text-slate-800 uppercase">
                              扩展参数表格
                            </h3>
                            <p className="mt-1 text-[10px] font-medium text-slate-400">
                              传递给适配器的自定义配置项
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const newKey = `param_${Math.random().toString(36).substring(7)}`;
                              setSelectedModel({
                                ...selectedModel,
                                config: { ...selectedModel.config, [newKey]: '' },
                              });
                            }}
                            className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-[10px] font-black text-indigo-600 uppercase transition-all hover:bg-indigo-100"
                          >
                            <Plus size={14} /> 添加项
                          </button>
                        </div>
                        <div className="space-y-3">
                          {Object.entries(selectedModel.config).map(([key, value], idx) => (
                            <div key={idx} className="group flex items-center gap-3">
                              <input
                                className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 font-mono text-xs text-indigo-600 outline-none"
                                value={key}
                                onChange={(e) => {
                                  const newKey = e.target.value;
                                  if (newKey === key) return;
                                  const newConfig = { ...selectedModel.config };
                                  delete newConfig[key];
                                  newConfig[newKey] = value;
                                  setSelectedModel({ ...selectedModel, config: newConfig });
                                }}
                              />
                              <input
                                className="flex-[1.5] rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-700 outline-none"
                                value={
                                  typeof value === 'object' ? JSON.stringify(value) : String(value)
                                }
                                onChange={(e) => {
                                  let val: string | number | boolean = e.target.value;
                                  if (val === 'true') val = true;
                                  else if (val === 'false') val = false;
                                  else if (!isNaN(Number(val)) && val.trim() !== '')
                                    val = Number(val);
                                  setSelectedModel({
                                    ...selectedModel,
                                    config: { ...selectedModel.config, [key]: val },
                                  });
                                }}
                              />
                              <button
                                onClick={() => {
                                  const configCopy = { ...selectedModel.config };
                                  delete configCopy[key];
                                  setSelectedModel({ ...selectedModel, config: configCopy });
                                }}
                                className="p-2.5 text-slate-300 transition-all hover:text-rose-500"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Terminal */}
              <div
                className={`flex shrink-0 flex-col border-t border-slate-800 bg-slate-900 transition-all duration-300 ease-in-out ${isTerminalExpanded ? 'h-80' : 'h-[44px]'}`}
              >
                <div
                  className="flex cursor-pointer items-center justify-between border-b border-slate-800 px-6 py-2 transition-colors hover:bg-slate-800/50"
                  onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
                >
                  <div className="flex items-center gap-4">
                    <Terminal size={14} className="text-slate-500" />
                    <h3 className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                      适配器诊断终端
                    </h3>
                    {selectedModel.purpose === 'embedding' && (
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-black tracking-tighter text-emerald-400 uppercase">
                        Vector Mode
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setTestLogs([])}
                      className="text-[9px] font-black text-slate-500 uppercase hover:text-slate-300"
                    >
                      清空记录
                    </button>
                    <button
                      onClick={!isTesting ? runDiagnostics : undefined}
                      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-black uppercase transition-all ${isTesting ? 'bg-slate-800 text-slate-600' : selectedModel.purpose === 'embedding' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 hover:bg-indigo-500'}`}
                    >
                      <Play size={12} fill="currentColor" /> {isTesting ? '测试中...' : '启动诊断'}
                    </button>
                  </div>
                </div>
                <div className="terminal-scrollbar flex-1 overflow-y-auto p-6 font-mono text-xs selection:bg-indigo-500/30">
                  {testLogs.length === 0 ? (
                    <div className="text-slate-600 italic">{'>'} 等待运行测试...</div>
                  ) : (
                    testLogs.map((log, i) => (
                      <div
                        key={i}
                        className={`animate-in fade-in slide-in-from-left-1 mb-1 whitespace-pre-wrap duration-200 ${log.includes('失败') || log.includes('错误') ? 'text-rose-400' : selectedModel.purpose === 'embedding' ? 'text-emerald-400/80' : 'text-indigo-400/80'}`}
                      >
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-300">
            <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-slate-50 shadow-inner">
              <Box size={40} />
            </div>
            <div className="text-sm font-black tracking-widest text-slate-400 uppercase">
              请选择或创建一个模型适配器
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
