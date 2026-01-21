import { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ModelAdapterConfig } from './types';
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
import { TestCasesView } from './components/chat/TestCasesView';

function App() {
  const [view, setView] = useState<'chat' | 'docs' | 'settings' | 'models' | 'testcases'>('chat');
  const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<number | null>(null);
  const [isObserverExpanded, setIsObserverExpanded] = useState(false);

  const { appConfigs, setAppConfigs, qdrantStatus } = useConfig();

  useEffect(() => {
    fetch('/api/models/models')
      .then((res) => res.json())
      .then((data) => {
        const models = data.data || [];
        if (models.length > 0) {
          setAppConfigs((prev) => {
            const next = { ...prev };
            let changed = false;
            if (
              prev.agentModelID === 'mock-model' ||
              !models.find((m: ModelAdapterConfig) => m.id === prev.agentModelID)
            ) {
              next.agentModelID = models[0].id;
              changed = true;
            }
            if (
              prev.coreModelID === 'mock-model' ||
              !models.find((m: ModelAdapterConfig) => m.id === prev.coreModelID)
            ) {
              next.coreModelID = models[0].id;
              changed = true;
            }
            return changed ? next : prev;
          });
        }
      })
      .catch((e) => console.error('Auto-sync failed', e));
  }, [setAppConfigs]);

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
    toggleSelectAll,
  } = useSessions();

  const {
    input,
    setInput,
    loading,
    handleSend,
    handleStop,
    liveLogs,
    isReplaying,
    replayProgress,
    startReplay,
  } = useChat({
    currentSession,
    setCurrentSession,
    setSelectedId,
    appConfigs,
    fetchSessions,
  });

  const handleSelectSession = async (id: string) => {
    await selectSession(id);
    setActiveTraceIndex(null);
  };

  const handleRunTestCase = async (tcId: string) => {
    try {
      const resp = await fetch(`/api/admin/testcases/${tcId}`);
      const tc = await resp.json();
      if (tc && tc.prompts) {
        setView('chat');
        setTimeout(() => {
          startReplay(tc.prompts);
        }, 100);
      }
    } catch (e) {
      console.error('Failed to load test case', e);
    }
  };

  const transitionClass =
    'transition-all duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)] will-change-[width,flex,opacity,transform]';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900 antialiased">
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
            className={`relative flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white ${transitionClass} ${isObserverExpanded ? 'group w-12 cursor-pointer bg-slate-50 hover:bg-indigo-50' : 'flex-1'}`}
            onClick={() => isObserverExpanded && setIsObserverExpanded(false)}
          >
            {isObserverExpanded && (
              <div className="absolute inset-0 z-50 flex flex-col items-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm transition-all group-hover:bg-indigo-600 group-hover:text-white">
                    <Maximize2 size={14} className="rotate-45" />
                  </div>
                  <div className="text-[11px] font-black tracking-[0.3em] text-slate-400 uppercase transition-colors [writing-mode:vertical-lr] group-hover:text-indigo-600">
                    返回对话区域
                  </div>
                </div>
                <div className="mt-auto mb-4 h-24 w-1 rounded-full bg-slate-200 transition-colors group-hover:bg-indigo-200"></div>
              </div>
            )}
            <div
              className={`flex h-full min-w-[400px] flex-1 flex-col bg-white transition-all duration-500 ${isObserverExpanded ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'}`}
            >
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
                isReplaying={isReplaying}
                replayProgress={replayProgress}
              />
            </div>
          </div>

          <div
            className={`h-full overflow-hidden bg-white ${transitionClass} ${isObserverExpanded ? 'flex-1' : 'w-96'}`}
          >
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
          qdrantStatus={qdrantStatus}
          onBack={() => setView('chat')}
        />
      )}

      {view === 'models' && (
        <ModelsView
          onBack={() => setView('chat')}
          appConfigs={appConfigs}
          setAppConfigs={setAppConfigs}
        />
      )}

      {view === 'testcases' && (
        <TestCasesView onBack={() => setView('chat')} onRun={handleRunTestCase} />
      )}
    </div>
  );
}

export default App;
