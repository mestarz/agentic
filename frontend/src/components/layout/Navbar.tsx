import { Server, Activity, BookOpen, Settings, Box, Beaker } from 'lucide-react';

interface NavbarProps {
  view: 'chat' | 'docs' | 'settings' | 'models' | 'testcases';
  setView: (view: 'chat' | 'docs' | 'settings' | 'models' | 'testcases') => void;
}

export function Navbar({ view, setView }: NavbarProps) {
  return (
    <nav className="w-20 bg-slate-900 flex flex-col items-center py-6 gap-8 shadow-2xl z-30">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg cursor-pointer" onClick={() => setView('chat')}>
        <Server size={24} />
      </div>
      <button title="会话对话" onClick={() => setView('chat')} className={`p-3 rounded-xl transition-all ${view === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
        <Activity size={24} />
      </button>
      <button title="模型管理" onClick={() => setView('models')} className={`p-3 rounded-xl transition-all ${view === 'models' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
        <Box size={24} />
      </button>
      <button title="测试用例" onClick={() => setView('testcases')} className={`p-3 rounded-xl transition-all ${view === 'testcases' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
        <Beaker size={24} />
      </button>
      <button title="接口文档" onClick={() => setView('docs')} className={`p-3 rounded-xl transition-all ${view === 'docs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
        <BookOpen size={24} />
      </button>
      <button title="系统设置" onClick={() => setView('settings')} className={`p-3 rounded-xl transition-all ${view === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
        <Settings size={24} />
      </button>
    </nav>
  );
}
