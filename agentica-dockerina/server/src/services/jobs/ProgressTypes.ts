import { EventEmitter } from "events";

export type JobId = string;

export type JobKind =
  | "docker.pull"
  | "docker.exec";

export type JobStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ProgressEventBase {
  ts: number; // epoch ms
  message?: string;
}

// Generic progress payload for docker pulls
export interface PullProgressDetail {
  phase: "resolving" | "downloading" | "extracting" | "verifying" | "done" | "waiting" | "unknown";
  percent?: number; // 0-100 computed overall percent
  layers?: Record<string, {
    status?: string;
    current?: number;
    total?: number;
    percent?: number; // per-layer percent
  }>;
  ref: string; // image ref requested
}

export interface ExecProgressDetail {
  bytesOut?: number;
  bytesErr?: number;
  stdoutTail?: string; // optional rolling tail
  stderrTail?: string; // optional rolling tail
}

export type ProgressDetail = PullProgressDetail | ExecProgressDetail | Record<string, unknown>;

export interface ProgressEvent extends ProgressEventBase {
  detail?: ProgressDetail;
}

export interface JobRecord<TFinal = unknown> {
  id: JobId;
  kind: JobKind;
  status: JobStatus;
  meta?: Record<string, unknown>;
  startedAt: number;
  finishedAt?: number;
  last?: ProgressEvent;
  history: ProgressEvent[];
  final?: TFinal;
  error?: { name?: string; message: string; stack?: string };
  emitter: EventEmitter; // per-job event emitter
}

export interface JobRef {
  id: JobId;
  kind: JobKind;
}

export const JOB_EVENTS = {
  progress: "progress",
  finished: "finished",
  failed: "failed",
  cancelled: "cancelled",
} as const;

