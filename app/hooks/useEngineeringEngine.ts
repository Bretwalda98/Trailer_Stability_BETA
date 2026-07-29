"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { calculateProject } from "../engine/core";
import { createEmptyRun } from "../engine/optimiser";
import type { CalculationResult, OptimiserRun, ProjectModel } from "../engine/types";

type WorkerResponse =
  | { type: "calculation"; requestId: number; result: CalculationResult }
  | {
      type: "optimiser-update";
      requestId: number;
      run: OptimiserRun;
      detailIncluded: boolean;
    }
  | { type: "optimiser-complete"; requestId: number; run: OptimiserRun }
  | { type: "error"; requestId: number; message: string; stack?: string };

export interface EngineeringEngineState {
  result: CalculationResult;
  authoritativeModel: ProjectModel;
  run: OptimiserRun;
  calculating: boolean;
  workerReady: boolean;
  error: string | null;
  startOptimisation(): void;
  cancelOptimisation(): void;
  resetRun(): void;
}

function deterministicInitialCalculation(model: ProjectModel): CalculationResult {
  return {
    ...calculateProject(model),
    calculationMs: 0,
  };
}

/**
 * Owns all browser-side engineering execution. React renders authoritative
 * results returned by this worker boundary and never reproduces formulas.
 */
export function useEngineeringEngine(model: ProjectModel): EngineeringEngineState {
  const [result, setResult] = useState<CalculationResult>(() =>
    deterministicInitialCalculation(model),
  );
  const [authoritativeModel, setAuthoritativeModel] = useState<ProjectModel>(model);
  const [run, setRun] = useState<OptimiserRun>(() => createEmptyRun());
  const [calculating, setCalculating] = useState(false);
  const [workerReady, setWorkerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const modelRef = useRef(model);
  const calculationRequestRef = useRef(0);
  const calculationModelRef = useRef(model);
  const optimiserRequestRef = useRef(0);

  modelRef.current = model;

  useEffect(() => {
    if (typeof Worker === "undefined") {
      setWorkerReady(false);
      return;
    }

    const worker = new Worker(new URL("../workers/engineering.worker.ts", import.meta.url), {
      type: "module",
      name: "trailer-stability-engine",
    });
    workerRef.current = worker;
    setWorkerReady(true);

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "calculation") {
        if (message.requestId !== calculationRequestRef.current) return;
        setResult(message.result);
        setAuthoritativeModel(calculationModelRef.current);
        setCalculating(false);
        setError(null);
        return;
      }
      if (message.type === "optimiser-update") {
        if (message.requestId !== optimiserRequestRef.current) return;
        setRun((current) => ({
          ...message.run,
          passes: message.detailIncluded
            ? [...message.run.passes]
            : current.passes,
          events: message.detailIncluded
            ? [...message.run.events]
            : current.events,
        }));
        return;
      }
      if (message.type === "optimiser-complete") {
        if (message.requestId !== optimiserRequestRef.current) return;
        setRun({
          ...message.run,
          passes: [...message.run.passes],
          events: [...message.run.events],
        });
        return;
      }
      if (
        message.requestId === calculationRequestRef.current ||
        message.requestId === optimiserRequestRef.current
      ) {
        setCalculating(false);
        setError(message.message);
      }
    });

    worker.addEventListener("error", (event) => {
      setCalculating(false);
      setError(event.message || "The engineering worker stopped unexpectedly.");
    });

    return () => {
      worker.terminate();
      workerRef.current = null;
      setWorkerReady(false);
    };
  }, []);

  useEffect(() => {
    const requestId = calculationRequestRef.current + 1;
    calculationRequestRef.current = requestId;
    calculationModelRef.current = model;
    setCalculating(true);
    setError(null);
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ type: "calculate", requestId, model });
      return;
    }

    // SSR and browsers without Worker support retain an explicit safe fallback.
    const timer = window.setTimeout(() => {
      try {
        setResult(calculateProject(model));
        setAuthoritativeModel(model);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setCalculating(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [model, workerReady]);

  const startOptimisation = useCallback(() => {
    const requestId = optimiserRequestRef.current + 1;
    optimiserRequestRef.current = requestId;
    setError(null);
    const worker = workerRef.current;
    if (!worker) {
      setError("Optimisation requires browser Web Worker support.");
      return;
    }
    worker.postMessage({ type: "optimise", requestId, model: modelRef.current });
  }, []);

  const cancelOptimisation = useCallback(() => {
    workerRef.current?.postMessage({
      type: "cancel",
      requestId: optimiserRequestRef.current,
    });
  }, []);

  const resetRun = useCallback(() => setRun(createEmptyRun()), []);

  return {
    result,
    authoritativeModel,
    run,
    calculating,
    workerReady,
    error,
    startOptimisation,
    cancelOptimisation,
    resetRun,
  };
}
