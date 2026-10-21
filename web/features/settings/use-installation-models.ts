"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeInstallationCatalog, type InstallationModelCatalog } from "@/shared/installation-settings";
import type { ModelCatalog } from "@/shared/model-configuration";
import { settingsApi } from "./api";

/** One installation catalog shared by settings and every composer; confirmed writes defeat late reads. */
export function useInstallationModels(version = 0) {
  const [data, setData] = useState<InstallationModelCatalog>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const revision = useRef(0);
  const replace = useCallback((candidate: ModelCatalog) => {
    const catalog = decodeInstallationCatalog(candidate);
    if (!catalog) return;
    revision.current += 1; setData(catalog); setError(undefined); setLoading(false);
  }, []);
  const reload = useCallback(() => setReloadVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const requestRevision = ++revision.current;
    setLoading(true);
    void settingsApi.catalog(controller.signal).then((catalog) => {
      if (!controller.signal.aborted && revision.current === requestRevision) { setData(catalog); setError(undefined); setLoading(false); }
    }).catch(() => {
      if (!controller.signal.aborted && revision.current === requestRevision) { setError("无法读取模型列表，请重新加载。"); setLoading(false); }
    });
    return () => controller.abort();
  }, [version, reloadVersion]);
  return { data, error, loading, replace, reload };
}
