import { useState, useEffect } from 'react';
import { Beaker, Play, Trash2, Clock, ListChecks, ArrowLeft, Edit3, Plus, Save, X, GripVertical, ChevronRight } from 'lucide-react';
import type { TestCase, TestCaseSummary } from '../../types';

interface TestCasesViewProps {
  onBack: () => void;
  onRun: (tcId: string) => void;
}

export function TestCasesView({ onBack, onRun }: TestCasesViewProps) {
  const [testCases, setTestCases] = useState<TestCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTestCase, setEditingTestCase] = useState<TestCase | null>(null);
  const [originalTestCase, setOriginalTestCase] = useState<TestCase | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchTestCases();
  }, []);

  const fetchTestCases = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/testcases');
      const data = await resp.json();
      setTestCases(data || []);
    } catch (e) {
      console.error("Failed to fetch test cases", e);
    } finally {
      setLoading(false);
    }
  };

  const loadTestCaseForEdit = async (id: string) => {
    try {
      const resp = await fetch(`/api/admin/testcases/${id}`);
      const data = await resp.json();
      setEditingTestCase(data);
      setOriginalTestCase(data);
    } catch (e) {
      console.error("Failed to load test case", e);
    }
  };

  const saveTestCase = async () => {
    if (!editingTestCase) return;
    setIsSaving(true);
    try {
      const resp = await fetch(`/api/admin/testcases/${editingTestCase.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTestCase)
      });
      if (resp.ok) {
        setEditingTestCase(null);
        setOriginalTestCase(null);
        fetchTestCases();
      }
    } catch (e) {
      console.error("Failed to save test case", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTestCase = async (id: string) => {
    if (!confirm("确定要删除此测试用例吗？")) return;
    try {
      await fetch(`/api/admin/testcases/${id}`, { method: 'DELETE' });
      fetchTestCases();
    } catch (e) {
      console.error("Failed to delete test case", e);
    }
  };

  const updatePrompt = (idx: number, val: string) => {
    if (!editingTestCase) return;
    const newPrompts = [...editingTestCase.prompts];
    newPrompts[idx] = val;
    setEditingTestCase({ ...editingTestCase, prompts: newPrompts });
  };

  const removePrompt = (idx: number) => {
    if (!editingTestCase) return;
    const newPrompts = editingTestCase.prompts.filter((_, i) => i !== idx);
    setEditingTestCase({ ...editingTestCase, prompts: newPrompts });
  };

  const addPrompt = (idx: number) => {
    if (!editingTestCase) return;
    const newPrompts = [...editingTestCase.prompts];
    newPrompts.splice(idx + 1, 0, "");
    setEditingTestCase({ ...editingTestCase, prompts: newPrompts });
  };

  const isModified = JSON.stringify(editingTestCase) !== JSON.stringify(originalTestCase);

  if (editingTestCase) {
    return (
      <main className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
        <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setEditingTestCase(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">编辑测试用例</h1>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{editingTestCase.id}</span>
              </div>
              <input 
                className="text-xs font-bold text-indigo-600 uppercase tracking-widest bg-transparent border-none outline-none focus:ring-0 p-0"
                value={editingTestCase.name}
                onChange={e => setEditingTestCase({...editingTestCase, name: e.target.value})}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setEditingTestCase(null)}
              className="px-4 py-2 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-xl transition-all"
            >
              取消
            </button>
            <button 
              onClick={saveTestCase}
              disabled={!isModified || isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-md shadow-indigo-100 disabled:opacity-30 disabled:grayscale-[0.5] disabled:cursor-not-allowed"
            >
              <Save size={14} /> {isSaving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">测试步骤序列 ({editingTestCase.prompts.length})</span>
              <button 
                onClick={() => addPrompt(-1)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:border-indigo-300 transition-all shadow-sm"
              >
                <Plus size={12} /> 在开头插入
              </button>
            </div>
            
            {editingTestCase.prompts.map((p, i) => (
              <div key={i} className="group relative">
                <div className="flex items-start gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-indigo-200 transition-all">
                  <div className="flex flex-col items-center gap-2 mt-1">
                    <div className="w-6 h-6 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center text-[10px] font-black border border-slate-100">
                      {i + 1}
                    </div>
                    <div className="w-[1px] flex-1 bg-slate-100 min-h-[20px]"></div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <textarea 
                      className="w-full bg-slate-50/50 border border-transparent focus:border-indigo-100 focus:bg-white rounded-xl p-3 text-sm text-slate-700 outline-none transition-all resize-none min-h-[80px]"
                      value={p}
                      placeholder="输入测试指令..."
                      onChange={e => updatePrompt(i, e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => removePrompt(i)}
                      className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                      title="删除此步骤"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button 
                      onClick={() => addPrompt(i)}
                      className="p-2 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all"
                      title="在此之后插入步骤"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {editingTestCase.prompts.length === 0 && (
              <div className="h-32 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-2 bg-white/50">
                <div className="text-xs font-bold uppercase tracking-widest">暂无步骤</div>
                <button onClick={() => addPrompt(-1)} className="text-indigo-600 text-[10px] font-black uppercase hover:underline">点击添加首个步骤</button>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
      <div className="px-8 py-6 bg-white border-b border-slate-200 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
            <Beaker size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">测试用例库 (Test Cases)</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">自动化模型能力评测与回归工具</p>
          </div>
        </div>
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all uppercase tracking-widest"
        >
          <ArrowLeft size={14} /> 返回对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-5xl mx-auto space-y-6">
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-300 animate-pulse">
              <ListChecks size={40} />
            </div>
          ) : testCases.length === 0 ? (
            <div className="h-64 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 gap-4 bg-white/50">
              <Beaker size={40} className="opacity-20" />
              <div className="text-sm font-bold uppercase tracking-widest">暂无测试用例，请先从对话中保存</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testCases.map(tc => (
                <div key={tc.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full -translate-y-12 translate-x-12 group-hover:scale-110 transition-transform duration-500 opacity-50"></div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg uppercase border border-amber-100">{tc.id}</span>
                      <div className="flex items-center gap-1 text-slate-400 text-[10px] font-bold">
                        <Clock size={12} />
                        {new Date(tc.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    <h3 className="text-base font-black text-slate-800 mb-2 truncate group-hover:text-indigo-600 transition-colors">{tc.name}</h3>
                    
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">测试步骤</span>
                        <span className="text-lg font-black text-slate-700 leading-none">{tc.step_count} <small className="text-[10px] text-slate-400">Rounds</small></span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button 
                        onClick={() => onRun(tc.id)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-100 transition-all active:scale-95"
                      >
                        <Play size={14} fill="currentColor" /> 执行测试
                      </button>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => loadTestCaseForEdit(tc.id)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-50 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-50 hover:text-indigo-600 transition-all border border-slate-100"
                        >
                          <Edit3 size={14} /> 编辑
                        </button>
                        <button 
                          onClick={() => deleteTestCase(tc.id)}
                          className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all border border-slate-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}