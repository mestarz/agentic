import { Trash2, RefreshCw, CheckSquare, Square, Plus, MessageSquare } from 'lucide-react';
import type { SessionSummary } from '../../types';

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
  setCurrentSession
}: SessionSidebarProps) {
  return (
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
            onClick={toggleSelectAll}
            className="text-[9px] font-black text-slate-400 hover:text-indigo-600 transition-all uppercase tracking-widest flex items-center gap-1"
          >
            {selectedIds.length === sessions.length && sessions.length > 0 ? <CheckSquare size={12} /> : <Square size={12} />}
            {selectedIds.length > 0 ? `已选 ${selectedIds.length}` : '全选'}
          </button>
        </div>
      </div>
      <div className="p-4"><button onClick={() => { setSelectedId(null); setCurrentSession(null); }} className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-md transition-all"><Plus size={14} /> 新建会话</button></div>
      <div className="flex-1 overflow-y-auto px-3 space-y-1 custom-scrollbar">
        {sessions.map(s => (
          <div 
            key={s.id} 
            onClick={() => selectSession(s.id)} 
            tabIndex={-1}
            className={`group flex items-center gap-2 px-2 py-2.5 rounded-lg cursor-pointer transition-all outline-none border-transparent caret-transparent select-none ${selectedId === s.id ? 'bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <div onClick={(e) => { e.stopPropagation(); toggleSelect(s.id); }} className={`shrink-0 transition-all ${selectedIds.includes(s.id) ? 'text-indigo-600' : 'text-slate-300 opacity-0 group-hover:opacity-100'}`}>
              {selectedIds.includes(s.id) ? <CheckSquare size={14} /> : <Square size={14} />}
            </div>
            <MessageSquare size={14} className={selectedId === s.id ? 'text-indigo-600' : 'text-slate-300'} />
            <div className="flex-1 min-w-0 text-xs truncate pointer-events-none">{s.id}</div>
            <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
