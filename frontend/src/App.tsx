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

function App() {
  const [view, setView] = useState<'chat' | 'docs' | 'settings'>('chat');
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
          <SequenceObserver 
            currentSession={currentSession}
            activeTraceIndex={activeTraceIndex}
            selectedTraceId={selectedTraceId}
            setSelectedTraceId={setSelectedTraceId}
            isExpanded={isObserverExpanded}
            setIsExpanded={setIsObserverExpanded}
          />
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
    </div>
  );
}

export default App;
