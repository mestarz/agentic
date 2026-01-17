import { useState, useEffect } from "react";
import { type AppConfigs, DEFAULT_CONFIGS } from "../types";

export function useConfig() {
  const [appConfigs, setAppConfigs] = useState<AppConfigs>(() => {
    const saved = localStorage.getItem("cf_app_configs");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.agentModelID) return parsed;
        } catch(e) {}
    }
    return { ...DEFAULT_CONFIGS };
  });

  useEffect(() => {
    localStorage.setItem("cf_app_configs", JSON.stringify(appConfigs));
  }, [appConfigs]);

  return { appConfigs, setAppConfigs };
}
