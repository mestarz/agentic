import {
  Trash2,
  RefreshCw,
  CheckSquare,
  Square,
  Plus,
  MessageSquare,
  Edit2,
  Check,
} from 'lucide-react';
import type { SessionSummary } from '../../types';
import { useState } from 'react';

interface SessionSidebarProps {
  sessions: SessionSummary[];
  selectedId: string | null;
  selectedIds: string[];
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  deleteSessions: () => void;
  fetchSessions: () => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  setSelectedId: (id: string | null) => void;
  setCurrentSession: (session: any) => void;
}

export function SessionSidebar({
  sessions,
  selectedId,
  selectedIds,
  selectSession,
  deleteSession,
  deleteSessions,
  fetchSessions,
  toggleSelect,
  toggleSelectAll,
  setSelectedId,
  setCurrentSession,
}: SessionSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleRename = async (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const resp = await fetch(`/api/admin/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName }),
      });
      if (resp.ok) {
        fetchSessions();
      }
    } catch (e) {
      console.error('Failed to rename session', e);
    }
    setEditingId(null);
  };

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">
            会话列表
          </span>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <button
                onClick={deleteSessions}
                className="text-red-400 transition-colors hover:text-red-600"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={fetchSessions}
              className="text-slate-300 transition-colors hover:text-indigo-600"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1 text-[9px] font-black tracking-widest text-slate-400 uppercase transition-all hover:text-indigo-600"
          >
            {selectedIds.length === sessions.length && sessions.length > 0 ? (
              <CheckSquare size={12} />
            ) : (
              <Square size={12} />
            )}
            {selectedIds.length > 0 ? `已选 ${selectedIds.length}` : '全选'}
          </button>
        </div>
      </div>
      <div className="p-4">
        <button
          onClick={() => {
            setSelectedId(null);
            setCurrentSession(null);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-indigo-700"
        >
          <Plus size={14} /> 新建会话
        </button>
      </div>
      <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => selectSession(s.id)}
            onDoubleClick={() => {
              setEditingId(s.id);
              setEditingName(s.name || s.id);
            }}
            className={`group flex cursor-pointer items-center gap-2 rounded-lg border-transparent px-2 py-2.5 caret-transparent transition-all outline-none select-none ${selectedId === s.id ? 'bg-indigo-50 font-bold text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <div
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(s.id);
              }}
              className={`shrink-0 transition-all ${selectedIds.includes(s.id) ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}
            >
              {selectedIds.includes(s.id) ? <CheckSquare size={14} /> : <Square size={14} />}
            </div>
            <MessageSquare
              size={14}
              className={selectedId === s.id ? 'text-indigo-600' : 'text-slate-300'}
            />

            <div className="min-w-0 flex-1">
              {editingId === s.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    className="w-full rounded border border-indigo-300 bg-white px-1 py-0.5 text-xs outline-none"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(s.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleRename(s.id)}
                  />
                  <button onClick={() => handleRename(s.id)} className="text-emerald-500">
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div className="truncate text-xs">{s.name || s.id}</div>
              )}
            </div>

            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingId(s.id);
                  setEditingName(s.name || s.id);
                }}
                className="p-1 text-slate-300 transition-all hover:text-indigo-500"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(s.id);
                }}
                className="p-1 text-slate-300 transition-all hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
