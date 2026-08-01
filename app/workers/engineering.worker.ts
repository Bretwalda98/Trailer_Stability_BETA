/// <reference lib="webworker" />

import { calculateProject } from "../engine/core";
import { runOptimiser } from "../engine/optimiser";
import { runArrangementOptimiser } from "../engine/arrangement-optimiser";
import type { OptimiserRun, ProjectModel } from "../engine/types";

type WorkerRequest =
  | { type: "calculate"; requestId: number; model: ProjectModel }
  | { type: "optimise"; requestId: number; model: ProjectModel }
  | { type: "arrange"; requestId: number; model: ProjectModel }
  | { type: "cancel"; requestId: number };

type WorkerResponse =
  | {
      type: "calculation";
      requestId: number;
      result: ReturnType<typeof calculateProject>;
    }
  | {
      type: "optimiser-update";
      requestId: number;
      run: OptimiserRun;
      detailIncluded: boolean;
    }
  | { type: "optimiser-complete"; requestId: number; run: OptimiserRun }
  | { type: "error"; requestId: number; message: string; stack?: string };

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
let optimiserController: AbortController | null = null;

function post(message: WorkerResponse): void {
  scope.postMessage(message);
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    optimiserController?.abort();
    return;
  }

  if (request.type === "calculate") {
    try {
      post({
        type: "calculation",
        requestId: request.requestId,
        result: calculateProject(request.model),
      });
    } catch (error) {
      post({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return;
  }

  optimiserController?.abort();
  const controller = new AbortController();
  optimiserController = controller;
  const execute = request.type === "arrange" ? runArrangementOptimiser : runOptimiser;
  void execute(request.model, {
    signal: controller.signal,
    onUpdate: (run, detailIncluded) => {
      post({
        type: "optimiser-update",
        requestId: request.requestId,
        run,
        detailIncluded,
      });
    },
  })
    .then((run) => {
      post({
        type: "optimiser-complete",
        requestId: request.requestId,
        run,
      });
    })
    .catch((error) => {
      post({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    })
    .finally(() => {
      if (optimiserController === controller) optimiserController = null;
    });
});

export {};
