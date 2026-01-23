import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import {
  Terminal,
  RefreshCw,
  Download,
  FileText,
  Cpu,
  Zap,
  Cloud,
  Monitor,
  Database,
  Search,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowDown,
  ArrowUp,
  X,
} from 'lucide-react';

type LogType = 'core' | 'agent' | 'llm' | 'frontend' | 'qdrant';
type LogLevel = 'all' | 'error' | 'warning' | 'info';

interface LogEntry {
  id: string;
  timestamp?: string;
  category?: string;
  level: 'error' | 'warning' | 'info' | 'debug';
  message: string;
  raw: string;
}

export function SystemLogsView() {
  const [activeLog, setActiveLog] = useState<LogType>('core');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/logs?file=${activeLog}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const text = await res.text();
      setContent(text);
    } catch (err) {
      setContent(`Error loading logs: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [activeLog]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      if (autoRefresh) {
        fetchLogs();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchLogs, autoRefresh]);

  // 当日志内容变化或切换日志时，自动滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [content, activeLog]);

  const parseLogLine = useCallback(
    (line: string, index: number): LogEntry => {
      const id = `${activeLog}-${index}`;
      // Core/Agent: 2026/01/22 19:28:28 [Category] (LEVEL: )?Message
      const coreRegex =
        /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[([^\]]+)\] (?:(ERROR|WARNING|INFO|DEBUG): )?(.*)$/i;
      const coreMatch = line.match(coreRegex);
      if (coreMatch) {
        let level = (coreMatch[3] || 'info').toLowerCase() as LogEntry['level'];
        if (coreMatch[2].toUpperCase() === 'ERROR' || coreMatch[4].toUpperCase().includes('ERROR'))
          level = 'error';
        if (
          coreMatch[2].toUpperCase() === 'WARNING' ||
          coreMatch[4].toUpperCase().includes('WARNING')
        )
          level = 'warning';

        return {
          id,
          timestamp: coreMatch[1],
          category: coreMatch[2],
          level,
          message: coreMatch[4],
          raw: line,
        };
      }

      // LLM Gateway: INFO: ...
      const infoRegex = /^(INFO|ERROR|WARNING|DEBUG|CRITICAL):\s+(.*)$/i;
      const infoMatch = line.match(infoRegex);
      if (infoMatch) {
        const levelLabel = infoMatch[1].toLowerCase();
        let level: LogEntry['level'] = 'info';
        if (levelLabel === 'error' || levelLabel === 'critical') level = 'error';
        else if (levelLabel === 'warning') level = 'warning';
        else if (levelLabel === 'debug') level = 'debug';

        return {
          id,
          level,
          message: infoMatch[2],
          raw: line,
        };
      }

      // LLM Gateway: >>> [Category] Message
      const tripleRegex = /^>>> \[([^\]]+)\] (.*)$/;
      const tripleMatch = line.match(tripleRegex);
      if (tripleMatch) {
        return {
          id,
          category: tripleMatch[1],
          level: 'info',
          message: tripleMatch[2],
          raw: line,
        };
      }

      // Qdrant (Rust style): 2026-01-23T07:33:04.123456Z INFO qdrant::...
      // or simple: INFO ...
      if (activeLog === 'qdrant') {
        let level: LogEntry['level'] = 'info';
        if (line.includes('ERROR')) level = 'error';
        if (line.includes('WARN')) level = 'warning';
        if (line.includes('DEBUG')) level = 'debug';

        // Try to extract timestamp if present (ISO 8601ish)
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
        const timestamp = tsMatch ? tsMatch[1] : undefined;

        return {
          id,
          timestamp,
          level,
          message: line,
          raw: line,
          category: 'Qdrant',
        };
      }

      // Generic fallback
      let level: LogEntry['level'] = 'info';
      const upperLine = line.toUpperCase();
      if (upperLine.includes('ERROR') || upperLine.includes('FAIL')) level = 'error';
      else if (upperLine.includes('WARN')) level = 'warning';

      return {
        id,
        level,
        message: line,
        raw: line,
      };
    },
    [activeLog],
  );

  const parsedLogs = useMemo(() => {
    if (!content) return [];
    return content
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line, idx) => parseLogLine(line, idx));
  }, [content, parseLogLine]);

  const filteredLogs = useMemo(() => {
    return parsedLogs.filter((log) => {
      const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
      const matchesSearch =
        !searchQuery || log.raw.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesLevel && matchesSearch;
    });
  }, [parsedLogs, filterLevel, searchQuery]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const scrollToTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const logFiles: { id: LogType; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'core', label: '核心服务 (Core)', icon: <Cpu size={16} />, color: 'text-emerald-500' },
    { id: 'agent', label: '代理服务 (Agent)', icon: <Zap size={16} />, color: 'text-indigo-500' },
    { id: 'llm', label: '模型网关 (LLM)', icon: <Cloud size={16} />, color: 'text-rose-500' },
    {
      id: 'qdrant',
      label: '向量数据库 (Qdrant)',
      icon: <Database size={16} />,
      color: 'text-amber-600',
    },
    { id: 'frontend', label: '前端服务 (Web)', icon: <Monitor size={16} />, color: 'text-sky-500' },
  ];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 p-6">
          <Terminal size={18} className="text-slate-700" />
          <h2 className="text-[10px] font-black tracking-widest text-slate-800 uppercase">
            后台日志中心
          </h2>
        </div>

        <div className="flex-1 space-y-1 p-4">
          {logFiles.map((f) => (
            <button
              key={f.id}
              onClick={() => {
                setActiveLog(f.id);
                setSearchQuery('');
              }}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all ${
                activeLog === f.id
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className={`${activeLog === f.id ? 'text-white' : f.color}`}>{f.icon}</div>
              <div className="flex flex-col">
                <span className="text-xs font-bold">{f.label}</span>
                <span className={`font-mono text-[9px] opacity-60`}>{f.id}.log</span>
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <span className="text-[10px] font-bold text-slate-500">自动刷新 (3s)</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative h-4 w-8 rounded-full transition-colors ${autoRefresh ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div
                className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${autoRefresh ? 'translate-x-4' : ''}`}
              ></div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {/* Header / Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <FileText size={16} className="text-slate-500" />
              <span className="font-mono text-xs font-medium text-slate-600">
                logs/{activeLog}.log
              </span>
            </div>

            <div className="h-4 w-px bg-slate-300"></div>

            <div className="flex items-center gap-4">
              {/* Level Filter */}
              <div className="flex items-center gap-1">
                {(['all', 'error', 'warning', 'info'] as LogLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setFilterLevel(level)}
                    className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${
                      filterLevel === level
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                    }`}
                  >
                    {level.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="group relative">
                <Search
                  size={12}
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="搜索日志..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 w-40 rounded-md bg-slate-200/50 pr-2 pl-8 text-[12px] text-slate-700 transition-all outline-none focus:w-64 focus:bg-slate-200/80 focus:ring-1 focus:ring-slate-300"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => scrollToTop()}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200"
              title="回到顶部"
            >
              <ArrowUp size={14} />
            </button>
            <button
              onClick={() => scrollToBottom()}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200"
              title="滚到底部"
            >
              <ArrowDown size={14} />
            </button>
            <div className="mx-1 h-4 w-px bg-slate-300"></div>
            <button
              onClick={() => fetchLogs()}
              disabled={loading}
              className={`rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200 ${loading ? 'animate-spin' : ''}`}
              title="刷新"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => {
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${activeLog}-${new Date().toISOString()}.log`;
                a.click();
              }}
              className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-200"
              title="下载日志"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Log Display */}
        <div
          className="light-terminal-scrollbar relative flex-1 overflow-auto bg-white"
          ref={scrollRef}
        >
          <div className="min-w-full p-4 font-mono text-[13px] leading-relaxed">
            {filteredLogs.length > 0 ? (
              <div className="flex flex-col">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`group flex items-start gap-3 border-l-2 py-0.5 pr-4 pl-3 transition-colors hover:bg-slate-50 ${
                      log.level === 'error'
                        ? 'border-rose-500/50 bg-rose-50/30'
                        : log.level === 'warning'
                          ? 'border-amber-500/50 bg-amber-50/30'
                          : 'border-transparent'
                    }`}
                  >
                    {/* Level Icon */}
                    <div className="mt-1 shrink-0">
                      {log.level === 'error' ? (
                        <AlertCircle size={13} className="text-rose-500" />
                      ) : log.level === 'warning' ? (
                        <AlertTriangle size={13} className="text-amber-500" />
                      ) : (
                        <Info size={13} className="text-slate-400" />
                      )}
                    </div>

                    {/* Timestamp */}
                    {log.timestamp && (
                      <span className="shrink-0 text-slate-400 tabular-nums">
                        {log.timestamp.split(' ')[1]}
                      </span>
                    )}

                    {/* Category */}
                    {log.category && (
                      <span
                        className={`shrink-0 font-bold ${
                          log.level === 'error'
                            ? 'text-rose-600'
                            : log.level === 'warning'
                              ? 'text-amber-600'
                              : 'text-indigo-600'
                        }`}
                      >
                        [{log.category}]
                      </span>
                    )}

                    {/* Message */}
                    <span
                      className={`break-all ${
                        log.level === 'error'
                          ? 'text-rose-700'
                          : log.level === 'warning'
                            ? 'text-amber-700'
                            : 'text-slate-700'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center py-20 text-slate-400 italic">
                {content ? '没有符合条件的日志' : '正在加载日志...'}
              </div>
            )}
          </div>
        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <div className="flex gap-4">
            <span className="font-medium">总计: {parsedLogs.length} 行</span>
            {filterLevel !== 'all' && <span>当前展示: {filteredLogs.length} 行</span>}
          </div>
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-rose-500"></div>
              <span className="font-bold text-rose-600">
                Errors: {parsedLogs.filter((l) => l.level === 'error').length}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-500"></div>
              <span className="font-bold text-amber-600">
                Warnings: {parsedLogs.filter((l) => l.level === 'warning').length}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
