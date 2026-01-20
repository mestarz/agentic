import { useState, useRef } from "react";
import type { AppConfigs, Message, Session, TraceEvent } from "../types";

interface UseChatProps {
  currentSession: Session | null;
  setCurrentSession: React.Dispatch<React.SetStateAction<Session | null>>;
  setSelectedId: (id: string) => void;
  appConfigs: AppConfigs;
  fetchSessions: () => Promise<void>;
}

export function useChat({
  currentSession,
  setCurrentSession,
  setSelectedId,
  appConfigs,
  fetchSessions,
}: UseChatProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [liveTraces, setLiveTraces] = useState<TraceEvent[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]); // [NEW] 全量系统日志
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState({ current: 0, total: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (msg: string) => setLiveLogs(prev => [...prev, msg]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog(">>> [System] 用户手动中止了连接。");
      setLoading(false);
      setIsReplaying(false);
    }
  };

  const handleSend = async (overridePrompt?: string, forcedSessionId?: string) => {
    const promptToSend = overridePrompt || input;
    if (!promptToSend.trim() || loading) return;

    setLiveTraces([]);
    setLiveLogs([]);
    addLog(">>> [System] 初始化对话请求...");
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // 优先使用传入的 sessionId，否则从状态取，最后生成随机 ID
    const sessionId = forcedSessionId || currentSession?.id || `session-${Math.random().toString(36).substring(7)}`;
    addLog(`>>> [Debug] 请求参数 - Agent Model: ${appConfigs.agentModelID}, Core Engine: ${appConfigs.coreModelID}`);
    
    const userMsg: Message = {
      role: "user",
      content: promptToSend,
      timestamp: new Date().toISOString(),
      traces: [],
    };
    
    return new Promise<void>(async (resolve, reject) => {
      setCurrentSession((prev) => {
        // 如果 sessionId 变化了（比如新建），清空旧消息
        const baseMessages = (prev && prev.id === sessionId) ? prev.messages : [];
        const aiMsg: Message = {
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          traces: [],
        };
        return {
          id: sessionId,
          app_id: prev?.app_id || "web",
          messages: [...baseMessages, userMsg, aiMsg],
        };
      });

      setInput("");
      setLoading(true);

      try {
        addLog(`>>> [System] 正在连接后端代理: /api/debug/chat (Session: ${sessionId})`);
        const response = await fetch("/api/debug/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            session_id: sessionId,
            query: userMsg.content,
            agent_model_id: appConfigs.agentModelID,
            core_model_id: appConfigs.coreModelID,
          }),
        });

        if (!response.body) throw new Error("后端未返回 Response Body");
        addLog(">>> [System] HTTP 连接已建立，等待流式数据...");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let residual = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const text = residual + decoder.decode(value, { stream: true });
          const lines = text.split("\n");
          residual = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() === "") continue;
            
            if (line.startsWith("data: ")) {
              const rawData = line.replace("data: ", "").trim();
              if (rawData === "[DONE]") {
                  addLog(">>> [System] 收到结束标记 [DONE]");
                  break;
              }

              try {
                const data = JSON.parse(rawData);
                if (data.type === "trace") {
                  const newTrace = { ...data.trace, timestamp: new Date().toISOString() };
                  setLiveTraces(prev => [...prev, newTrace]);
                  addLog(`[Trace] ${data.trace.source} -> ${data.trace.target}: ${data.trace.action}`);
                  
                  setCurrentSession((prev) => {
                    if (!prev || prev.id !== sessionId) return prev; 
                    const newMsgs = [...prev.messages];
                    // 动态查找最后一条 assistant 消息
                    const idx = newMsgs.length - 1;
                    if (newMsgs[idx]) {
                      newMsgs[idx] = { ...newMsgs[idx], traces: [...(newMsgs[idx].traces || []), newTrace] };
                    }
                    return { ...prev, messages: newMsgs };
                  });
                } else if (data.type === "meta") {
                  addLog(`>>> [System] 收到元数据更新: ${JSON.stringify(data.meta)}`);
                  setCurrentSession((prev) => {
                    if (!prev || prev.id !== sessionId) return prev; 
                    const newMsgs = [...prev.messages];
                    const idx = newMsgs.length - 1;
                    if (newMsgs[idx]) newMsgs[idx] = { ...newMsgs[idx], meta: data.meta };
                    if (newMsgs[idx - 1]) newMsgs[idx - 1] = { ...newMsgs[idx - 1], meta: data.meta };
                    return { ...prev, messages: newMsgs };
                  });
                } else if (data.type === "chunk") {
                  fullContent += data.content || "";
                  setCurrentSession((prev) => {
                    if (!prev || prev.id !== sessionId) return prev; 
                    const newMsgs = [...prev.messages];
                    const idx = newMsgs.length - 1;
                    if (newMsgs[idx]) newMsgs[idx] = { ...newMsgs[idx], content: fullContent };
                    return { ...prev, messages: newMsgs };
                  });
                }
              } catch (e) {
                addLog(`>>> [Warning] 无法解析 JSON 数据行: ${rawData.substring(0, 100)}...`);
              }
            } else {
                addLog(`>>> [Raw] ${line}`);
            }
          }
        }

        if (forcedSessionId) {
            // 如果是强制 ID (测试模式)，确保选中该 ID
            setSelectedId(forcedSessionId);
        } else if (!currentSession?.id) {
            setSelectedId(sessionId);
        }
        
        await fetchSessions();
        addLog(">>> [System] 对话流程正常结束。");
        resolve();
      } catch (err: any) {
        if (err.name === "AbortError") {
          addLog(">>> [System] 请求已中止。");
          resolve();
        } else {
          const errorMsg = `连接发生错误: ${err.message}`;
          addLog(`>>> [Error] ${errorMsg}`);
          alert(errorMsg);
          reject(err);
        }
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    });
  };

  const startReplay = async (prompts: string[]) => {
    if (loading || isReplaying) return;
    setIsReplaying(true);
    setReplayProgress({ current: 0, total: prompts.length });
    
    // 自动创建一个新 Session
    const newSessionId = `test-${Math.random().toString(36).substring(7)}`;
    setSelectedId(newSessionId);
    setCurrentSession({ id: newSessionId, app_id: "test", messages: [] });

    for (let i = 0; i < prompts.length; i++) {
      setReplayProgress({ current: i + 1, total: prompts.length });
      addLog(`>>> [Replay] 正在执行第 ${i + 1}/${prompts.length} 步...`);
      try {
        // 关键点：传入 forcedSessionId 确保重放期间始终使用这个测试 session
        await handleSend(prompts[i], newSessionId);
      } catch (e) {
        addLog(`>>> [Replay] 执行中断: ${e}`);
        break;
      }
    }
    setIsReplaying(false);
    addLog(">>> [Replay] 自动重放测试完成。");
  };

  return { input, setInput, loading, handleSend, handleStop, liveTraces, liveLogs, isReplaying, replayProgress, startReplay };
}
