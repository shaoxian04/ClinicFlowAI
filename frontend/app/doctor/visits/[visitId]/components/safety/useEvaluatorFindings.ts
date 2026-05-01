"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { EvaluatorState, Finding } from "./types";

export function useEvaluatorFindings(visitId: string) {
  const [state, setState] = useState<EvaluatorState>({
    findings: [],
    availability: "AVAILABLE",
    loading: true,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await apiGet<Finding[]>(`/visits/${visitId}/findings`);
      setState({ findings: data, availability: "AVAILABLE", loading: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, availability: "UNAVAILABLE", error: msg }));
    }
  }, [visitId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const onSseEvaluatorDone = useCallback((findings: Finding[]) => {
    setState({ findings, availability: "AVAILABLE", loading: false });
  }, []);

  const onSseEvaluatorError = useCallback((reason: string) => {
    setState((s) => ({ ...s, availability: "UNAVAILABLE", error: reason }));
  }, []);

  const acknowledge = useCallback(
    async (findingId: string, reason?: string) => {
      // Optimistic
      setState((s) => ({
        ...s,
        findings: s.findings.map((f) =>
          f.id === findingId
            ? {
                ...f,
                acknowledgedAt: new Date().toISOString(),
                acknowledgedBy: "self",
                acknowledgementReason: reason ?? null,
              }
            : f,
        ),
      }));
      try {
        const data = await apiPost<Finding>(
          `/visits/${visitId}/findings/${findingId}/acknowledge`,
          { reason },
        );
        setState((s) => ({
          ...s,
          findings: s.findings.map((f) => (f.id === findingId ? data : f)),
        }));
      } catch (e) {
        await refetch();
        throw e;
      }
    },
    [visitId, refetch],
  );

  const reEvaluate = useCallback(async (): Promise<Finding[] | null> => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await apiPost<Finding[]>(`/visits/${visitId}/re-evaluate`, {});
      setState({ findings: data, availability: "AVAILABLE", loading: false });
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, loading: false, availability: "UNAVAILABLE", error: msg }));
      return null;
    }
  }, [visitId]);

  return {
    ...state,
    refetch,
    acknowledge,
    reEvaluate,
    onSseEvaluatorDone,
    onSseEvaluatorError,
  };
}
