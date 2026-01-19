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
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (msg: string) => setLiveLogs(prev => [...prev, msg]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog(">>> [System] 用户手动中止了连接。");
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setLiveTraces([]);
    setLiveLogs([]);
    addLog(">>> [System] 初始化对话请求...");
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const sessionId = currentSession?.id || `session-${Math.random().toString(36).substring(7)}`;
    addLog(`>>> [Debug] 请求参数 - Agent Model: ${appConfigs.agentModelID}, Core Engine: ${appConfigs.coreModelID}`);
    
    const userMsg: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
      traces: [],
    };
    const tempMessages = currentSession ? [...currentSession.messages, userMsg] : [userMsg];
    const aiMsg: Message = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      traces: [],
    };

    const targetIndex = tempMessages.length;

    setCurrentSession((prev) => ({
      id: sessionId,
      app_id: prev?.app_id || "web",
      messages: [...tempMessages, aiMsg],
    }));

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
                  if (newMsgs[targetIndex]) {
                    newMsgs[targetIndex] = { ...newMsgs[targetIndex], traces: [...(newMsgs[targetIndex].traces || []), newTrace] };
                  }
                  return { ...prev, messages: newMsgs };
                });
              } else if (data.type === "meta") {
                addLog(`>>> [System] 收到元数据更新: ${JSON.stringify(data.meta)}`);
                setCurrentSession((prev) => {
                  if (!prev || prev.id !== sessionId) return prev; 
                  const newMsgs = [...prev.messages];
                  if (newMsgs[targetIndex]) newMsgs[targetIndex] = { ...newMsgs[targetIndex], meta: data.meta };
                  if (newMsgs[targetIndex - 1]) newMsgs[targetIndex - 1] = { ...newMsgs[targetIndex - 1], meta: data.meta };
                  return { ...prev, messages: newMsgs };
                });
              } else if (data.type === "chunk") {
                fullContent += data.content || "";
                setCurrentSession((prev) => {
                  if (!prev || prev.id !== sessionId) return prev; 
                  const newMsgs = [...prev.messages];
                  if (newMsgs[targetIndex]) newMsgs[targetIndex] = { ...newMsgs[targetIndex], content: fullContent };
                  return { ...prev, messages: newMsgs };
                });
              }
            } catch (e) {
              addLog(`>>> [Warning] 无法解析 JSON 数据行: ${rawData.substring(0, 100)}...`);
            }
          } else {
              // 捕获非 SSE 格式的行（可能是后端崩溃抛出的错误）
              addLog(`>>> [Raw] ${line}`);
          }
        }
      }

      if (!currentSession?.id) setSelectedId(sessionId);
      await fetchSessions();
      addLog(">>> [System] 对话流程正常结束。");
    } catch (err: any) {
      if (err.name === "AbortError") {
        addLog(">>> [System] 请求已中止。");
      } else {
        const errorMsg = `连接发生错误: ${err.message}`;
        addLog(`>>> [Error] ${errorMsg}`);
        alert(errorMsg);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return { input, setInput, loading, handleSend, handleStop, liveTraces, liveLogs };
}
