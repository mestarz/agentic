import { useState, useEffect, useCallback } from 'react';
import {
  Database,
  RefreshCw,
  Server,
  Layers,
  AlignLeft,
  Trash2,
  CheckSquare,
  Square,
  ArrowRight,
  BrainCircuit,
  Zap,
} from 'lucide-react';

interface VectorPoint {
  id: string | number;
  payload: Record<string, unknown>;
  vector: number[] | null;
  score?: number;
}

interface ScrollResult {
  result: {
    points: VectorPoint[];
    next_page_offset?: string | number;
  };
}

interface MemoryState {
  ingest_queue_size: number;
  last_ingest_time: string;
  last_ingest_session: string;
  last_ingest_status: string;
  last_ingest_input_count: number;
  last_ingest_output_count: number;
  last_ingest_topic: string;
  is_reflecting: boolean;
  last_reflection_time: string;
  last_reflection_status: string;
  last_reflection_facts_processed: number;
  last_reflection_instructions: number;
}

/**
 * MemoryDashboard 展示记忆系统的实时运行状态
 * 包含快系统 (Ingestion) 的清洗效率和慢系统 (Reflection) 的反思进度
 */
function MemoryDashboard() {
  const [state, setState] = useState<MemoryState | null>(null);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/admin/memory/status');
        if (res.ok) {
          setState(await res.json());
        }
      } catch (e) {
        console.error('Failed to fetch memory status', e);
      }
    };

    fetchState();
    // 每 5 秒自动轮询一次后端状态
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!state) return null;

  return (
    <div className="grid grid-cols-2 gap-4 border-b border-slate-200 bg-slate-50/50 p-6">
      {/* 快系统 (Ingestion) 卡片：负责将对话转化为原子事实并存入暂存区 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-amber-500" />
            <h3 className="text-xs font-black tracking-wide text-slate-800 uppercase">
              Ingestion (Fast System)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Queue</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
              {state.ingest_queue_size}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">Last Status</span>
            <span
              className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                state.last_ingest_status === 'success'
                  ? 'bg-emerald-50 text-emerald-600'
                  : state.last_ingest_status === 'processing'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {state.last_ingest_status || 'IDLE'}
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 p-2 text-xs">
            <div className="mb-1 flex items-center justify-between text-slate-500">
              <span>Wait List</span>
              <span>Staging</span>
            </div>
            <div className="flex items-center justify-between font-mono font-bold text-slate-700">
              <span>{state.last_ingest_input_count} msgs</span>
              <ArrowRight size={12} className="text-slate-300" />
              <span>{state.last_ingest_output_count} facts</span>
            </div>
            {state.last_ingest_topic && (
              <div className="mt-1 truncate text-[10px] text-slate-400">
                Last Topic: {state.last_ingest_topic}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 慢系统 (Reflection) 卡片：负责对暂存区事实进行仲裁、合并并转化为长期记忆 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit size={16} className="text-indigo-500" />
            <h3 className="text-xs font-black tracking-wide text-slate-800 uppercase">
              Reflection (Slow System)
            </h3>
          </div>
          {state.is_reflecting && (
            <div className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
              </span>
              <span className="text-[10px] font-bold text-indigo-600 uppercase">Running</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-500">Last Run</span>
            <span className="font-mono text-[10px] text-slate-600">
              {state.last_reflection_time
                ? new Date(state.last_reflection_time).toLocaleTimeString()
                : '-'}
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 p-2 text-xs">
            <div className="mb-1 flex items-center justify-between text-slate-500">
              <span>Facts Processed</span>
              <span>Evolutions</span>
            </div>
            <div className="flex items-center justify-between font-mono font-bold text-slate-700">
              <span>{state.last_reflection_facts_processed}</span>
              <ArrowRight size={12} className="text-slate-300" />
              <span>{state.last_reflection_instructions}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VectorsView() {
  const [collection, setCollection] = useState('mem_staging');
  const [points, setPoints] = useState<VectorPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(20);

  const collections = [
    { id: 'mem_staging', label: '短期记忆 (Staging)', icon: <Layers size={16} /> },
    { id: 'mem_shared', label: '长期记忆 (Shared)', icon: <Database size={16} /> },
  ];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 清空选择当集合变更时
  useEffect(() => {
    setSelectedIds(new Set());
  }, [collection]);

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === points.length && points.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(points.map((p) => String(p.id))));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) return;

    try {
      const res = await fetch(`/api/admin/vectors?collection=${collection}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error('Batch delete failed');

      setPoints((prev) => prev.filter((p) => !selectedIds.has(String(p.id))));
      setSelectedIds(new Set());
    } catch (err) {
      alert('批量删除失败: ' + String(err));
    }
  };

  const fetchPoints = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vectors?collection=${collection}&limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch vectors');
      const data: ScrollResult = await res.json();
      setPoints(data.result.points || []);
    } catch (err) {
      console.error(err);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [collection, limit]);

  const handleDelete = async (id: string | number) => {
    if (!confirm('确定要删除这条记录吗？此操作无法撤销。')) return;
    try {
      const res = await fetch(`/api/admin/vectors?collection=${collection}&id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setPoints((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('删除失败: ' + String(err));
    }
  };

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 p-6">
          <Server size={18} className="text-slate-700" />
          <h2 className="text-[10px] font-black tracking-widest text-slate-800 uppercase">
            向量数据库
          </h2>
        </div>
        <div className="flex-1 space-y-1 p-4">
          {collections.map((c) => (
            <button
              key={c.id}
              onClick={() => setCollection(c.id)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
                collection === c.id
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className={`${collection === c.id ? 'text-white' : 'text-slate-500'}`}>
                {c.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold">{c.label}</span>
                <span className="font-mono text-[9px] opacity-60">{c.id}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        <MemoryDashboard />
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900"
              title="全选/反选"
            >
              {points.length > 0 && selectedIds.size === points.length ? (
                <CheckSquare size={16} className="text-indigo-600" />
              ) : (
                <Square size={16} className="text-slate-400" />
              )}
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100"
              >
                <Trash2 size={14} />
                <span>删除 ({selectedIds.size})</span>
              </button>
            )}

            <div className="mx-2 h-4 w-px bg-slate-300" />

            <span className="text-xs font-bold text-slate-600">Limit:</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <button
            onClick={fetchPoints}
            disabled={loading}
            className={`rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200 ${loading ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto bg-slate-50/50 p-6">
          <div className="mx-auto grid max-w-5xl gap-4">
            {points.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border transition-all hover:shadow-md ${
                  selectedIds.has(String(p.id))
                    ? 'border-indigo-300 bg-indigo-50/30 shadow-sm'
                    : 'border-slate-200 bg-white shadow-sm'
                } p-4`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleSelect(String(p.id))}
                      className="transition-transform active:scale-90"
                    >
                      {selectedIds.has(String(p.id)) ? (
                        <CheckSquare size={18} className="text-indigo-600" />
                      ) : (
                        <Square size={18} className="text-slate-300 hover:text-slate-400" />
                      )}
                    </button>

                    <div className="rounded bg-indigo-50 p-1 text-indigo-600">
                      <AlignLeft size={14} />
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-700">{p.id}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.payload?.created_at && (
                      <span className="text-[10px] text-slate-400">
                        {new Date((p.payload.created_at as number) * 1000).toLocaleString()}
                      </span>
                    )}
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      title="永久删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mb-3 pl-7">
                  <p className="text-sm leading-relaxed font-medium whitespace-pre-wrap text-slate-800">
                    {String(p.payload?.content || 'No content')}
                  </p>
                </div>

                <div className="mt-3 border-t border-slate-50 pt-3 pl-7">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(p.payload || {}).map(([k, v]) => {
                      if (k === 'content' || k === 'created_at') return null;
                      return (
                        <div
                          key={k}
                          className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[10px]"
                        >
                          <span className="font-bold text-slate-500">{k}:</span>
                          <span
                            className="max-w-[300px] truncate font-mono text-slate-700"
                            title={String(v)}
                          >
                            {String(v)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            {points.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Database size={48} className="mb-4 opacity-20" />
                <span className="text-sm">暂无数据或查询为空</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
