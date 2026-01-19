import { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import { useConfig } from './hooks/useConfig';
import { useSessions } from './hooks/useSessions';
import { useChat } from './hooks/useChat';
import { Navbar } from './components/layout/Navbar';
import { SessionSidebar } from './components/chat/SessionSidebar';
import { ChatWindow } from './components/chat/ChatWindow';
import { SequenceObserver } from './components/observer/SequenceObserver';
import { DocsView } from './components/docs/DocsView';
import { SettingsView } from './components/settings/SettingsView';
import { ModelsView } from './components/models/ModelsView';

function App() {
  const [view, setView] = useState<'chat' | 'docs' | 'settings' | 'models'>('chat');
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);
  const [isObserverExpanded, setIsObserverExpanded] = useState(false);

  const { appConfigs, setAppConfigs } = useConfig();
  
  // [NEW] 全局配置自愈逻辑：启动时自动对齐可用模型
  useEffect(() => {
    fetch('/api/models/models')
      .then(res => res.json())
      .then(data => {
        const models = data.data || [];
        if (models.length > 0) {
          setAppConfigs(prev => {
            const next = { ...prev };
            let changed = false;
            // 如果是默认的 mock-model 或模型已不存在，则自动选中第一个
            if (prev.agentModelID === 'mock-model' || !models.find(m => m.id === prev.agentModelID)) {
              next.agentModelID = models[0].id;
              changed = true;
            }
            if (prev.coreModelID === 'mock-model' || !models.find(m => m.id === prev.coreModelID)) {
              next.coreModelID = models[0].id;
              changed = true;
            }
            return changed ? next : prev;
          });
        }
      })
      .catch(e => console.error("Auto-sync failed", e));
  }, []); // 仅在应用挂载时运行一次

  const {
    sessions,
    selectedId,
    setSelectedId,
    selectedIds,
    currentSession,
    setCurrentSession,
    fetchSessions,
    selectSession,
    deleteSession,
    deleteSessions,
    toggleSelect,
    toggleSelectAll
  } = useSessions();

  const { input, setInput, loading, handleSend, handleStop, liveLogs } = useChat({
    currentSession,
    setCurrentSession,
    setSelectedId,
    appConfigs,
    fetchSessions
  });

  const handleSelectSession = async (id: string) => {
    await selectSession(id);
    setActiveTraceIndex(null);
  };

  // 定义通用的过渡样式常量，减少类名冗余
  const transitionClass = "transition-all duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] will-change-[width,flex,opacity,transform]";

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans antialiased overflow-hidden">
      <Navbar view={view} setView={setView} />

      {view === 'chat' && (
        <>
          <SessionSidebar 
            sessions={sessions}
            selectedId={selectedId}
            selectedIds={selectedIds}
            selectSession={handleSelectSession}
            deleteSession={deleteSession}
            deleteSessions={deleteSessions}
            fetchSessions={fetchSessions}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            setSelectedId={setSelectedId}
            setCurrentSession={setCurrentSession}
          />
          
          <div 
            className={`relative h-full flex flex-col overflow-hidden border-r border-slate-200 bg-white ${transitionClass} ${isObserverExpanded ? 'w-12 cursor-pointer bg-slate-50 hover:bg-indigo-50 group' : 'flex-1'}`}
            onClick={() => isObserverExpanded && setIsObserverExpanded(false)}
          >
            {isObserverExpanded && (
                <div className="absolute inset-0 z-50 flex flex-col items-center py-12">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">
                        <Maximize2 size={14} className="rotate-45" />
                      </div>
                      <div className="[writing-mode:vertical-lr] text-[11px] font-black uppercase text-slate-400 group-hover:text-indigo-600 tracking-[0.3em] transition-colors">
                        返回对话区域
                      </div>
                    </div>
                    <div className="mt-auto mb-4 w-1 h-24 bg-slate-200 group-hover:bg-indigo-200 rounded-full transition-colors"></div>
                </div>
            )}
            <div className={`flex-1 h-full flex flex-col min-w-[400px] bg-white transition-all duration-500 ${isObserverExpanded ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
              <ChatWindow 
                currentSession={currentSession}
                selectedId={selectedId}
                appConfigs={appConfigs}
                activeTraceIndex={activeTraceIndex}
                setActiveTraceIndex={setActiveTraceIndex}
                input={input}
                setInput={setInput}
                handleSend={handleSend}
                handleStop={handleStop}
                loading={loading}
                logs={liveLogs}
              />
            </div>
          </div>

          <div className={`h-full overflow-hidden bg-white ${transitionClass} ${isObserverExpanded ? 'flex-1' : 'w-96'}`}>
            <SequenceObserver 
              currentSession={currentSession}
              activeTraceIndex={activeTraceIndex}
              selectedTraceId={selectedTraceId}
              setSelectedTraceId={setSelectedTraceId}
              isExpanded={isObserverExpanded}
              setIsExpanded={setIsObserverExpanded}
            />
          </div>
        </>
      )}

      {view === 'docs' && <DocsView />}

      {view === 'settings' && (
        <SettingsView 
          appConfigs={appConfigs} 
          setAppConfigs={setAppConfigs} 
          onBack={() => setView('chat')} 
        />
      )}

      {view === 'models' && (
        <ModelsView onBack={() => setView('chat')} />
      )}
    </div>
  );
}

export default App;
