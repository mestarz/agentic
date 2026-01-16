import { useState, useEffect } from "react";
import { type AppConfigs, EMPTY_CFG } from "../types";

export function useConfig() {
  const [appConfigs, setAppConfigs] = useState<AppConfigs>(() => {
    const saved = localStorage.getItem("cf_app_configs");
    if (saved) return JSON.parse(saved);
    return { agent: { ...EMPTY_CFG }, core: { ...EMPTY_CFG } };
  });

  useEffect(() => {
    localStorage.setItem("cf_app_configs", JSON.stringify(appConfigs));
  }, [appConfigs]);

  return { appConfigs, setAppConfigs };
}
