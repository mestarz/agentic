import { useState, useEffect } from 'react';
import {
  Beaker,
  Trash2,
  Play,
  Plus,
  ArrowLeft,
  Save,
  Clock,
  Edit3,
  ListChecks,
} from 'lucide-react';
import type { TestCaseSummary, TestCase } from '../../types';

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

  const fetchTestCases = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/admin/testcases');
      const data = await resp.json();
      setTestCases(data || []);
    } catch (e) {
      console.error('Failed to fetch test cases', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTestCases();
  }, []);

  const loadTestCaseForEdit = async (id: string) => {
    try {
      const resp = await fetch(`/api/admin/testcases/${id}`);
      const data = await resp.json();
      setEditingTestCase(data);
      setOriginalTestCase(data);
    } catch (e) {
      console.error('Failed to load test case', e);
    }
  };

  const saveTestCase = async () => {
    if (!editingTestCase) return;
    setIsSaving(true);
    try {
      const resp = await fetch(`/api/admin/testcases/${editingTestCase.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTestCase),
      });
      if (resp.ok) {
        setEditingTestCase(null);
        setOriginalTestCase(null);
        fetchTestCases();
      }
    } catch (e) {
      console.error('Failed to save test case', e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTestCase = async (id: string) => {
    if (!confirm('确定要删除此测试用例吗？')) return;
    try {
      await fetch(`/api/admin/testcases/${id}`, { method: 'DELETE' });
      fetchTestCases();
    } catch (e) {
      console.error('Failed to delete test case', e);
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
    newPrompts.splice(idx + 1, 0, '');
    setEditingTestCase({ ...editingTestCase, prompts: newPrompts });
  };

  const isModified = JSON.stringify(editingTestCase) !== JSON.stringify(originalTestCase);

  if (editingTestCase) {
    return (
      <main className="flex flex-1 flex-col overflow-hidden bg-slate-50">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-6 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setEditingTestCase(null)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-800">编辑测试用例</h1>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 uppercase">
                  {editingTestCase.id}
                </span>
              </div>
              <input
                className="border-none bg-transparent p-0 text-xs font-bold tracking-widest text-indigo-600 uppercase outline-none focus:ring-0"
                value={editingTestCase.name}
                onChange={(e) => setEditingTestCase({ ...editingTestCase, name: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingTestCase(null)}
              className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 uppercase transition-all hover:bg-slate-100"
            >
              取消
            </button>
            <button
              onClick={saveTestCase}
              disabled={!isModified || isSaving}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2 text-xs font-black tracking-widest text-white uppercase shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale-[0.5]"
            >
              <Save size={14} /> {isSaving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-4xl space-y-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                测试步骤序列 ({editingTestCase.prompts.length})
              </span>
              <button
                onClick={() => addPrompt(-1)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-indigo-600 uppercase shadow-sm transition-all hover:border-indigo-300"
              >
                <Plus size={12} /> 在开头插入
              </button>
            </div>

            {editingTestCase.prompts.map((p, i) => (
              <div key={i} className="group relative">
                <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-200">
                  <div className="mt-1 flex flex-col items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 text-[10px] font-black text-slate-400">
                      {i + 1}
                    </div>
                    <div className="min-h-[20px] w-[1px] flex-1 bg-slate-100"></div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <textarea
                      className="min-h-[80px] w-full resize-none rounded-xl border border-transparent bg-slate-50/50 p-3 text-sm text-slate-700 transition-all outline-none focus:border-indigo-100 focus:bg-white"
                      value={p}
                      placeholder="输入测试指令..."
                      onChange={(e) => updatePrompt(i, e.target.value)}
                    />
                  </div>

                  <div className="flex flex-col gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => removePrompt(i)}
                      className="rounded-lg p-2 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500"
                      title="删除此步骤"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => addPrompt(i)}
                      className="rounded-lg p-2 text-slate-300 transition-all hover:bg-indigo-50 hover:text-indigo-500"
                      title="在此之后插入步骤"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {editingTestCase.prompts.length === 0 && (
              <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 text-slate-400">
                <div className="text-xs font-bold tracking-widest uppercase">暂无步骤</div>
                <button
                  onClick={() => addPrompt(-1)}
                  className="text-[10px] font-black text-indigo-600 uppercase hover:underline"
                >
                  点击添加首个步骤
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <Beaker size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">
              测试用例库 (Test Cases)
            </h1>
            <p className="mt-0.5 text-xs font-bold tracking-widest text-slate-400 uppercase">
              自动化模型能力评测与回归工具
            </p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold tracking-widest text-white uppercase transition-all hover:bg-slate-800"
        >
          <ArrowLeft size={14} /> 返回对话
        </button>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {loading ? (
            <div className="flex h-64 animate-pulse items-center justify-center text-slate-300">
              <ListChecks size={40} />
            </div>
          ) : testCases.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 text-slate-400">
              <Beaker size={40} className="opacity-20" />
              <div className="text-sm font-bold tracking-widest uppercase">
                暂无测试用例，请先从对话中保存
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {testCases.map((tc) => (
                <div
                  key={tc.id}
                  className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-xl"
                >
                  <div className="absolute top-0 right-0 h-24 w-24 translate-x-12 -translate-y-12 rounded-full bg-amber-50 opacity-50 transition-transform duration-500 group-hover:scale-110"></div>

                  <div className="relative z-10">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-600 uppercase">
                        {tc.id}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Clock size={12} />
                        {new Date(tc.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <h3 className="mb-2 truncate text-base font-black text-slate-800 transition-colors group-hover:text-indigo-600">
                      {tc.name}
                    </h3>

                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black tracking-tighter text-slate-400 uppercase">
                          测试步骤
                        </span>
                        <span className="text-lg leading-none font-black text-slate-700">
                          {tc.step_count}{' '}
                          <small className="text-[10px] text-slate-400">Rounds</small>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => onRun(tc.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-[10px] font-black tracking-widest text-white uppercase shadow-md shadow-emerald-100 transition-all hover:bg-emerald-700 active:scale-95"
                      >
                        <Play size={14} fill="currentColor" /> 执行测试
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadTestCaseForEdit(tc.id)}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-100 bg-slate-50 py-2 text-[10px] font-black text-slate-600 uppercase transition-all hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          <Edit3 size={14} /> 编辑
                        </button>
                        <button
                          onClick={() => deleteTestCase(tc.id)}
                          className="rounded-xl border border-slate-100 bg-slate-50 p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
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
