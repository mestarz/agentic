import { Server, Activity, BookOpen, Settings, Box, Beaker, FileText } from 'lucide-react';

interface NavbarProps {
  view: 'chat' | 'docs' | 'settings' | 'models' | 'testcases' | 'logs';
  setView: (view: 'chat' | 'docs' | 'settings' | 'models' | 'testcases' | 'logs') => void;
}

export function Navbar({ view, setView }: NavbarProps) {
  return (
    <nav className="z-30 flex w-20 flex-col items-center gap-8 bg-slate-900 py-6 shadow-2xl">
      <div
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg"
        onClick={() => setView('chat')}
      >
        <Server size={24} />
      </div>
      <button
        title="会话对话"
        onClick={() => setView('chat')}
        className={`rounded-xl p-3 transition-all ${view === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Activity size={24} />
      </button>
      <button
        title="模型管理"
        onClick={() => setView('models')}
        className={`rounded-xl p-3 transition-all ${view === 'models' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Box size={24} />
      </button>
      <button
        title="测试用例"
        onClick={() => setView('testcases')}
        className={`rounded-xl p-3 transition-all ${view === 'testcases' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Beaker size={24} />
      </button>
      <button
        title="系统日志"
        onClick={() => setView('logs')}
        className={`rounded-xl p-3 transition-all ${view === 'logs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <FileText size={24} />
      </button>

      <div className="flex-1"></div>

      <button
        title="接口文档"
        onClick={() => setView('docs')}
        className={`rounded-xl p-3 transition-all ${view === 'docs' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <BookOpen size={24} />
      </button>
      <button
        title="系统设置"
        onClick={() => setView('settings')}
        className={`rounded-xl p-3 transition-all ${view === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
      >
        <Settings size={24} />
      </button>
    </nav>
  );
}
