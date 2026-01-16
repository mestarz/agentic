import { useState, useRef } from "react";
import type { AppConfigs, Message, Session } from "../types";

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
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const sessionId =
      currentSession?.id ||
      `session-${Math.random().toString(36).substring(7)}`;
    const userMsg: Message = {
      role: "user",
      content: input,
      timestamp: new Date().toISOString(),
      traces: [],
    };
    const tempMessages = currentSession
      ? [...currentSession.messages, userMsg]
      : [userMsg];
    const aiMsg: Message = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      traces: [],
    };

    const targetIndex = tempMessages.length; // Index of the new AI message

    // Optimistic update
    setCurrentSession((prev) => ({
      id: sessionId,
      app_id: prev?.app_id || "web",
      messages: [...tempMessages, aiMsg],
    }));

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/debug/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          session_id: sessionId,
          query: userMsg.content,
          agent_config: appConfigs.agent,
          core_config: appConfigs.core,
        }),
      });

      if (!response.body) throw new Error("No response body");

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
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.replace("data: ", ""));
              if (data.type === "trace") {
                setCurrentSession((prev) => {
                  if (!prev) return prev;
                  const newMsgs = [...prev.messages];
                  if (newMsgs[targetIndex]) {
                    newMsgs[targetIndex] = {
                      ...newMsgs[targetIndex],
                      traces: [
                        ...(newMsgs[targetIndex].traces || []),
                        { ...data.trace, timestamp: new Date().toISOString() },
                      ],
                    };
                  }
                  return { ...prev, messages: newMsgs };
                });
              } else if (data.type === "meta") {
                setCurrentSession((prev) => {
                  if (!prev) return prev;
                  const newMsgs = [...prev.messages];
                  if (newMsgs[targetIndex])
                    newMsgs[targetIndex] = {
                      ...newMsgs[targetIndex],
                      meta: data.meta,
                    };
                  if (newMsgs[targetIndex - 1])
                    newMsgs[targetIndex - 1] = {
                      ...newMsgs[targetIndex - 1],
                      meta: data.meta,
                    };
                  return { ...prev, messages: newMsgs };
                });
              } else if (data.type === "chunk") {
                fullContent += data.content || "";
                setCurrentSession((prev) => {
                  if (!prev) return prev;
                  const newMsgs = [...prev.messages];
                  if (newMsgs[targetIndex])
                    newMsgs[targetIndex] = {
                      ...newMsgs[targetIndex],
                      content: fullContent,
                    };
                  return { ...prev, messages: newMsgs };
                });
              }
            } catch (e) {
              console.error("Failed to parse SSE data", e);
            }
          }
        }
      }

      if (!currentSession?.id) setSelectedId(sessionId);
      await fetchSessions();
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Fetch aborted");
      } else {
        alert("失败: " + err.message);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  return { input, setInput, loading, handleSend, handleStop };
}
