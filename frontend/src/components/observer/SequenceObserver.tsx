import {
  Terminal,
  Maximize2,
  Minimize2,
  Monitor,
  Zap,
  Cpu,
  Cloud,
  Activity,
  Plus,
} from 'lucide-react';
import type { Session, TraceEvent } from '../../types';
import { useMemo } from 'react';

interface SequenceObserverProps {
  currentSession: Session | null;
  activeTraceIndex: number | null;
  selectedTraceId: number | null;
  setSelectedTraceId: (id: number | null) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

interface ProcessedTrace extends TraceEvent {
  originalIdx?: number;
  durationMs?: number;
  endTimestamp?: string;
}

interface TraceData {
  is_pass?: boolean;
  description?: string;
  internal_component?: string;
  pass_name?: string;
  endpoint?: string;
  model?: string;
  messages?: Array<Record<string, unknown>>;
  internal_logs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function SequenceObserver({
  currentSession,
  activeTraceIndex,
  selectedTraceId,
  setSelectedTraceId,
  isExpanded,
  setIsExpanded,
}: SequenceObserverProps) {
  // 聚焦上下文工程的节点设计
  const participants = [
    { id: 'Frontend', label: '用户', icon: <Monitor size={18} /> },
    { id: 'Agent', label: '代理 (Agent)', icon: <Zap size={18} /> },
    { id: 'Core', label: '核心 (Context Engine)', icon: <Cpu size={18} /> },
    { id: 'LLM', label: '模型 (LLM)', icon: <Cloud size={18} /> },
  ];

  const posMap: Record<string, number> = {
    Frontend: 0,
    Agent: 1,
    Core: 2,
    LLM: 3,
    Gateway: 3,
    Adapter: 3,
    'Remote Provider': 3,
  };

  const actionMap: Record<string, string> = {
    // Agent
    'Receive Query': '接收用户指令',
    'Loading History': '加载历史会话',
    'Return Payload': '返回处理结果',
    'Return Context': '返回上下文',
    'Final Response': '生成最终回复',
    // Core
    'Get Optimized Context': '获取优化上下文',
    'Context Analysis': '上下文语义分析',
    'Retrieving Relevant Bits': '检索相关知识碎片',
    'Building Payload': '构建上下文负载',
    'Memory Consolidation': '记忆固化处理',
    'Persistence Save': '会话持久化存储',
    'Token Calculation': '计算 Token 消耗',
    'Context Compression': '上下文压缩优化',
    'Model Request': '发送模型请求',
    'Model Processing': '模型推理中',
    'Model Response': '接收模型响应',
    // Pipeline
    Truncate: '截断超长文本',
    Complete: 'Pass 执行完成',
    // LLM
    Dispatch: '分发模型请求',
    'Call API': '调用模型接口',
    'Stream Response': '流式内容返回',
    'Token Counting': '计算 Token 消耗',
    'Adapter Transform': '模型协议转换',
    'Start Streaming': '启动流式传输',
    'Start Chat Stream': '启动流式对话',
    'First Chunk Received': '接收首个数据块',
    'Stream Complete': '流式传输完成',
    'Streaming Content': '流式内容返回',
    // Agent Extra
    'Append Assistant Message': '固化助手回复',
    'Interrupt Detected': '检测到交互中断',
    'Updated Stats': '更新统计信息',
    // Common
    Call: '发起调用',
    Response: '返回响应',
    Search: '执行搜索',
    Retrieve: '检索',
    Process: '逻辑处理',
    Analyze: '分析数据',
    Generate: '内容生成',
    Invoke: '触发动作',
    Error: '发生错误',
    Success: '执行成功',
    Wait: '等待响应',
    Thinking: '深度思考中',
    Update: '更新状态',
    流式内容返回: '流式内容返回',
  };

  const translateAction = (action: string, data?: TraceData) => {
    if (data?.description && typeof data.description === 'string') return data.description;
    if (actionMap[action]) return actionMap[action];
    const prefixRules = [
      { prefix: 'Dispatch:', label: '模型分发:' },
      {
        prefix: 'Call',
        suffix: 'API',
        label: (a: string) => `调用 ${a.replace('Call ', '').replace(' API', '')} 接口`,
      },
    ];
    for (const rule of prefixRules) {
      if (rule.prefix && action.startsWith(rule.prefix)) {
        if (typeof rule.label === 'function') return rule.label(action);
        return `${rule.label} ${action.split(':').slice(1).join(':').trim()}`;
      }
    }
    for (const [key, value] of Object.entries(actionMap)) {
      if (action.includes(key)) return value;
    }
    return action;
  };

  // 统一预处理 Trace 列表
  const processedTraces = useMemo(() => {
    if (!currentSession || activeTraceIndex === null) return [];
    const traces = currentSession.messages[activeTraceIndex]?.traces || [];

    const sorted = [...traces]
      .map((t, originalIdx) => ({ ...t, originalIdx }))
      .sort((a, b) => {
        const timeA = new Date(a.timestamp).toISOString();
        const timeB = new Date(b.timestamp).toISOString();
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        return (a.originalIdx || 0) - (b.originalIdx || 0);
      });

    const result: ProcessedTrace[] = [];
    let streamingStart: ProcessedTrace | null = null;

    sorted.forEach((t) => {
      const isStreamStart = t.action === 'Streaming Content';
      const isStreamEnd = t.action === 'Stream Complete' || t.action === 'Final Response';

      if (isStreamStart) {
        streamingStart = { ...t, action: '流式内容返回' };
      } else if (isStreamEnd && streamingStart) {
        const duration =
          new Date(t.timestamp).getTime() - new Date(streamingStart.timestamp).getTime();
        // 将结束事件的数据（如 content）合并到开始事件中，供详情展示
        const mergedData = { ...streamingStart.data, ...t.data };
        result.push({
          ...streamingStart,
          data: mergedData,
          durationMs: duration,
          endTimestamp: t.timestamp,
        });
        streamingStart = null;
      } else if (!streamingStart) {
        result.push(t);
      }
    });

    if (streamingStart) {
      const base = streamingStart as ProcessedTrace;
      result.push({
        ...base,
        durationMs: 0,
        endTimestamp: base.timestamp,
      });
    }
    return result;
  }, [currentSession, activeTraceIndex]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!processedTraces.length) return;

    let content = '```mermaid\nsequenceDiagram\n';
    content += '    participant User\n';
    content += '    participant Agent\n';
    content += '    participant Core\n';
    content += '    participant LLM\n\n';

    processedTraces.forEach((t) => {
      let src = t.source;
      let tgt = t.target;

      // Normalize mapping
      if (['Gateway', 'Adapter', 'Remote Provider'].includes(src)) src = 'LLM';
      if (['Gateway', 'Adapter', 'Remote Provider'].includes(tgt)) tgt = 'LLM';
      if (src === 'Frontend') src = 'User';
      if (tgt === 'Frontend') tgt = 'User';

      let label = translateAction(t.action, t.data as TraceData);
      if ((t.data as TraceData)?.internal_component) {
        label += ` (${(t.data as TraceData).internal_component})`;
      }
      // Cleanup label for Mermaid
      label = label.replace(/[:;]/g, ' ');

      content += `    ${src}->>${tgt}: ${label}\n`;
    });

    content += '```';

    navigator.clipboard.writeText(content).then(() => {
      alert('已复制 Mermaid 时序图代码到剪贴板');
    });
  };

  return (
    <aside className="flex hidden h-full w-full flex-col overflow-hidden border-l border-slate-200 bg-white/95 backdrop-blur-sm xl:flex">
      <div className="z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Terminal size={18} className="text-emerald-600" />
          <span className="text-sm font-black tracking-widest text-slate-700 uppercase">
            系统交互观测仪 (Trace Observer)
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
        >
          {isExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden bg-slate-50/30">
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* 对象轴头部 */}
          <div className="relative z-20 flex border-b border-slate-100 bg-white py-6">
            {participants.map((p) => (
              <div key={p.id} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-md transition-transform hover:scale-105 ${p.id === 'Core' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
                >
                  {p.icon}
                </div>
                <span
                  className={`text-center text-xs font-black tracking-tight uppercase ${p.id === 'Core' ? 'text-emerald-600' : 'text-slate-500'}`}
                >
                  {p.label}
                </span>
              </div>
            ))}
            <div className="flex-1"></div>
          </div>

          <div
            className="custom-scrollbar relative flex-1 overflow-y-auto p-0"
            onContextMenu={handleContextMenu}
            title="右键点击复制 Mermaid 交互图"
          >
            {processedTraces.length > 0 ? (
              <div className="relative min-h-full py-8">
                {/* 垂直生命线 */}
                <div className="pointer-events-none absolute inset-0 flex">
                  {participants.map((p) => (
                    <div key={p.id} className="flex flex-1 justify-center">
                      <div
                        className={`h-full w-[1px] border-l border-dashed ${p.id === 'Core' ? 'border-emerald-200' : 'border-slate-200'}`}
                      ></div>
                    </div>
                  ))}
                  <div className="flex-1"></div>
                </div>

                {/* 交互箭头列表 */}
                <div className="relative">
                  {processedTraces.map((t, idx, arr) => {
                    const from = posMap[t.source] ?? 0;
                    const to = posMap[t.target] ?? 0;
                    const isSelf = from === to;
                    const stepWidth = 20;

                    const fromX = from * stepWidth + 10;
                    const toX = to * stepWidth + 10;

                    const left = isSelf ? fromX : Math.min(fromX, toX);
                    const width = isSelf ? 8 : Math.abs(fromX - toX);
                    const isRight = to >= from;

                    // 计算逻辑：如果上一步有结束时间（如合并后的流式），则相对于结束时间计算
                    const prevRefTime =
                      idx > 0 ? arr[idx - 1].endTimestamp || arr[idx - 1].timestamp : t.timestamp;
                    const durationMs =
                      t.durationMs !== undefined
                        ? t.durationMs
                        : idx > 0
                          ? Math.max(
                              0,
                              new Date(t.timestamp).getTime() - new Date(prevRefTime).getTime(),
                            )
                          : 0;
                    const durationStr =
                      durationMs > 1000
                        ? `+${(durationMs / 1000).toFixed(2)}s`
                        : `+${durationMs}ms`;

                    return (
                      <div key={idx} className="group relative h-20 w-full transition-all">
                        {[from, to].map((pIdx, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 shadow-sm ${pIdx === 2 ? 'border-x border-emerald-500/40 bg-emerald-500/30' : 'border-x border-slate-300 bg-slate-200'} ${selectedTraceId === idx ? 'z-20 ring-2 ring-indigo-400/50' : ''} `}
                            style={{ left: `${pIdx * stepWidth + 10}%` }}
                          />
                        ))}

                        <div
                          onClick={() => {
                            setSelectedTraceId(idx);
                            setIsExpanded(true);
                          }}
                          className="absolute inset-0 z-30 cursor-pointer"
                        >
                          <div
                            className="absolute top-1/2 -translate-y-1/2 transition-all"
                            style={{ left: `${left}%`, width: `${width}%` }}
                          >
                            <div
                              className={`absolute -top-9 right-0 left-0 flex flex-col items-center justify-center gap-1 text-center transition-all ${selectedTraceId === idx ? 'scale-110' : 'group-hover:scale-105'}`}
                            >
                              <div
                                className={`z-40 flex items-center gap-1 rounded-full border bg-white px-3 py-1 shadow-lg ${selectedTraceId === idx ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 group-hover:border-slate-400'}`}
                              >
                                <span className="mr-1 text-[10px] font-black text-slate-400 opacity-50">
                                  #{idx + 1}
                                </span>
                                <span
                                  className={`text-xs font-bold whitespace-nowrap ${t.source === 'Core' || t.target === 'Core' ? 'text-emerald-700' : 'text-slate-700'}`}
                                >
                                  {(t.data as TraceData)?.is_pass && (
                                    <span className="mr-1.5 rounded border border-amber-200 bg-amber-100 px-1 py-0.5 text-[8px] font-black tracking-tighter text-amber-700 uppercase">
                                      Pass
                                    </span>
                                  )}
                                  {translateAction(t.action, t.data as TraceData)}
                                </span>
                                <span className="ml-1 font-mono text-[10px] font-medium text-amber-500">
                                  {durationStr}
                                </span>
                              </div>
                            </div>

                            {isSelf ? (
                              <div
                                className={`absolute top-0 left-0 h-12 w-16 border-2 ${from === 2 ? 'border-emerald-400' : 'border-indigo-300'} rounded-r-2xl border-l-0 transition-all ${selectedTraceId === idx ? 'opacity-100' : 'opacity-60'}`}
                              >
                                <div
                                  className={`absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 border-y-[6px] border-l-[8px] border-y-transparent border-l-inherit`}
                                  style={{ borderLeftColor: 'inherit' }}
                                ></div>
                              </div>
                            ) : (
                              <div
                                className={`absolute top-0 right-0 left-0 h-[2.5px] transition-all ${selectedTraceId === idx ? 'bg-indigo-500' : 'bg-slate-400 group-hover:bg-indigo-500'}`}
                              >
                                <div
                                  className={`absolute top-1/2 -translate-y-1/2 ${isRight ? 'right-0 border-l-[8px] border-l-inherit' : 'left-0 border-r-[8px] border-r-inherit'} border-y-[5px] border-y-transparent`}
                                  style={{
                                    borderLeftColor: 'inherit',
                                    borderRightColor: 'inherit',
                                  }}
                                ></div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-slate-300 opacity-50">
                <Activity size={40} className="text-slate-200" />
                <div className="text-[10px] font-black tracking-widest uppercase">
                  等待系统交互数据...
                </div>
              </div>
            )}
          </div>

          <div className="z-30 flex h-8 items-center gap-6 border-t border-slate-200 bg-slate-100 px-4">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-xs font-black tracking-tighter text-slate-500 uppercase">
                核心引擎运行中
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-black text-slate-400 uppercase">总耗时:</span>
              <span className="font-mono text-sm font-bold text-amber-600">
                {processedTraces.length
                  ? (
                      (new Date(processedTraces[processedTraces.length - 1].timestamp).getTime() -
                        new Date(processedTraces[0].timestamp).getTime()) /
                      1000
                    ).toFixed(2)
                  : 0}
                秒
              </span>
            </div>
          </div>
        </div>

        {isExpanded && selectedTraceId !== null && processedTraces[selectedTraceId] && (
          <div className="z-40 flex w-[450px] flex-col border-l border-slate-200 bg-white shadow-[-10px_0_40px_rgba(0,0,0,0.08)] transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-emerald-600" />
                <span className="text-xs font-black tracking-widest text-slate-700 uppercase">
                  链路追踪元数据 (Trace Metadata)
                </span>
              </div>
              <button
                onClick={() => setSelectedTraceId(null)}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
              >
                <Plus size={18} className="rotate-45" />
              </button>
            </div>
            <div className="custom-scrollbar flex-1 space-y-8 overflow-y-auto p-6">
              {(() => {
                const currentTrace = processedTraces[selectedTraceId];
                const data = (currentTrace.data as unknown as TraceData) || {};
                return (
                  <div className="space-y-8">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black shadow-sm ${data.is_pass ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white'}`}
                        >
                          {data.is_pass ? 'P' : `#${selectedTraceId + 1}`}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold tracking-tight text-slate-800">
                              {translateAction(currentTrace.action, data)}
                            </h3>
                            {data.is_pass && (
                              <span className="rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-700 uppercase">
                                Pipeline Pass
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex-1">
                          <div className="mb-1 text-[10px] font-black text-slate-400 uppercase">
                            起始节点 (Source)
                          </div>
                          <div className="text-sm font-bold text-slate-700">
                            {currentTrace.source}
                          </div>
                        </div>
                        <div className="text-slate-300">➔</div>
                        <div className="flex-1 text-right">
                          <div className="mb-1 text-[10px] font-black text-slate-400 uppercase">
                            目标节点 (Target)
                          </div>
                          <div className="text-sm font-bold text-slate-700">
                            {currentTrace.target}
                          </div>
                        </div>
                      </div>

                      {/* Pipeline 内部组件展示 */}
                      {data.internal_component && (
                        <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                          <div>
                            <div className="mb-1 text-[10px] font-black text-amber-400 uppercase">
                              {data.is_pass ? '管线逻辑 (Pass Logic)' : '执行组件 (Component)'}
                            </div>
                            <div className="font-mono text-sm font-bold text-amber-700">
                              {data.is_pass
                                ? String(data.pass_name || '')
                                : String(data.internal_component || '')}
                            </div>
                          </div>
                          {data.is_pass ? (
                            <Activity size={24} className="text-amber-400" />
                          ) : (
                            <Cpu size={24} className="text-amber-300" />
                          )}
                        </div>
                      )}

                      {/* 新增：目标接口/模型展示 */}
                      {(() => {
                        let interfaceName = '';
                        if (currentTrace.action.startsWith('Dispatch:')) {
                          interfaceName = currentTrace.action.split(':')[1]?.trim();
                        } else if (currentTrace.action.includes('API')) {
                          interfaceName = currentTrace.action
                            .replace('Call ', '')
                            .replace(' API', '');
                        } else if (data.model) {
                          interfaceName = String(data.model);
                        }

                        if (!interfaceName) return null;

                        return (
                          <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                            <div>
                              <div className="mb-1 text-[10px] font-black text-indigo-400 uppercase">
                                调用的目标接口/模型
                              </div>
                              <div className="text-base font-black text-indigo-700">
                                {interfaceName}
                              </div>
                            </div>
                            <Zap size={24} className="animate-pulse text-indigo-300" />
                          </div>
                        );
                      })()}

                      {/* 新增：服务路径 (Endpoint) 展示 */}
                      {data.endpoint && (
                        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
                            <Monitor size={14} className="text-emerald-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-black tracking-tighter text-slate-500 uppercase">
                              服务路径 (Endpoint)
                            </div>
                            <div className="truncate font-mono text-xs text-emerald-400">
                              {String(data.endpoint)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 新增：处理后的上下文展示 */}
                    {data.messages && Array.isArray(data.messages) && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black tracking-wider text-slate-400 uppercase">
                          <span>处理后的上下文 (Processed Context)</span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                            {data.messages.length} 条消息
                          </span>
                        </div>
                        <div className="flex flex-col gap-3">
                          {data.messages.map((m, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 shadow-sm transition-shadow hover:shadow-md"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase shadow-sm ${
                                      m.role === 'system'
                                        ? 'bg-amber-500 text-white'
                                        : m.role === 'user'
                                          ? 'bg-indigo-500 text-white'
                                          : 'bg-emerald-500 text-white'
                                    }`}
                                  >
                                    {String(m.role || '')}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                                    Message #{i + 1}
                                  </span>
                                </div>
                                <span className="rounded border border-slate-100 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                                  {String(m.content || '').length} 字符
                                </span>
                              </div>
                              <div className="custom-scrollbar max-h-32 overflow-y-auto rounded-lg border border-slate-100/50 bg-white/50 p-2 font-sans text-xs leading-relaxed whitespace-pre-wrap text-slate-600">
                                {String(m.content || '')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 新增：内部执行日志展示 (针对折叠后的 Pass) */}
                    {data.internal_logs && Array.isArray(data.internal_logs) && (
                      <div className="space-y-3">
                        <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                          执行详情 (Internal Details)
                        </div>
                        <div className="space-y-2">
                          {data.internal_logs.map((log, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-[10px] font-black text-amber-500 uppercase">
                                  {String(log.internal_action || '')}
                                </span>
                                <span className="font-mono text-[9px] text-slate-500">
                                  {String(log.internal_component || '')}
                                </span>
                              </div>
                              <pre className="overflow-x-auto font-mono text-[10px] text-slate-400">
                                {JSON.stringify(
                                  log,
                                  (k, v) =>
                                    ['internal_action', 'internal_component'].includes(k)
                                      ? undefined
                                      : v,
                                  2,
                                )}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-black tracking-wider text-slate-400 uppercase">
                          原始数据载荷 (Raw Data Payload)
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {new Date(currentTrace.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="group relative rounded-2xl bg-slate-900 p-5 shadow-2xl">
                        <div className="absolute top-4 right-4 font-mono text-[10px] text-slate-600 uppercase">
                          JSON 数据格式
                        </div>
                        <pre className="custom-scrollbar max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-emerald-400">
                          {JSON.stringify(currentTrace.data, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-6 opacity-70">
                      <div className="flex items-center gap-2">
                        <Zap size={14} className="text-amber-500" />
                        <span className="text-xs font-medium text-slate-500">
                          已应用自动链路压缩策略
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
