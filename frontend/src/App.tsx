import { useState } from 'react';
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

  const { input, setInput, loading, handleSend, handleStop } = useChat({
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
            className={`relative transition-all duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] flex flex-col overflow-hidden border-r border-slate-100 bg-white will-change-[width,flex] ${isObserverExpanded ? 'w-64 cursor-pointer hover:bg-slate-50 group' : 'flex-1'}`}
            onClick={() => isObserverExpanded && setIsObserverExpanded(false)}
          >
            {isObserverExpanded && (
                <div className="absolute inset-0 z-50 flex items-center justify-center group-hover:bg-slate-900/5 transition-all">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] bg-white/80 px-4 py-2 rounded-full shadow-sm border border-slate-100">返回对话</div>
                </div>
            )}
            <div className={`flex-1 flex flex-col min-w-[800px] bg-white transition-opacity duration-500 ${isObserverExpanded ? 'opacity-30 pointer-events-none' : ''}`}>
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
              />
            </div>
          </div>

          <div className={`${isObserverExpanded ? 'flex-1' : 'w-96'} transition-all duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] h-full overflow-hidden bg-white will-change-[width,flex]`}>
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
