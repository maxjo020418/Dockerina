import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import type { JobId, JobKind, JobRecord, JobRef, ProgressEvent } from "./ProgressTypes";
import { JOB_EVENTS } from "./ProgressTypes";

/**
 * In-memory job store and event bus for long-running operations.
 * Not persisted. Suitable for single-instance server.
 */
class ProgressStoreCls {
  private jobs = new Map<JobId, JobRecord>();
  private ttlMs = 1000 * 60 * 30; // 30 minutes

  createJob(kind: JobKind, meta?: Record<string, unknown>): JobRecord {
    const id = uuidv4();
    const emitter = new EventEmitter();
    const job: JobRecord = {
      id,
      kind,
      status: "pending",
      meta,
      startedAt: Date.now(),
      history: [],
      emitter,
    };
    this.jobs.set(id, job);
    return job;
  }

  get(id: JobId): JobRecord | undefined {
    return this.jobs.get(id);
  }

  toRef(job: JobRecord): JobRef { return { id: job.id, kind: job.kind } }

  setRunning(id: JobId): void {
    const j = this.jobs.get(id); if (!j) return;
    if (j.status === "pending") j.status = "running";
  }

  update(id: JobId, ev: ProgressEvent): void {
    const j = this.jobs.get(id); if (!j) return;
    j.status = j.status === "pending" ? "running" : j.status;
    j.last = ev;
    j.history.push(ev);
    j.emitter.emit(JOB_EVENTS.progress, ev);
  }

  finish<T = unknown>(id: JobId, final: T): void {
    const j = this.jobs.get(id); if (!j) return;
    j.status = "succeeded";
    j.finishedAt = Date.now();
    j.final = final as unknown;
    j.emitter.emit(JOB_EVENTS.finished, j);
    this.scheduleTtl(id);
  }

  fail(id: JobId, error: unknown): void {
    const j = this.jobs.get(id); if (!j) return;
    j.status = "failed";
    j.finishedAt = Date.now();
    const err = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };
    j.error = err;
    j.emitter.emit(JOB_EVENTS.failed, j);
    this.scheduleTtl(id);
  }

  cancel(id: JobId): void {
    const j = this.jobs.get(id); if (!j) return;
    j.status = "cancelled";
    j.finishedAt = Date.now();
    j.emitter.emit(JOB_EVENTS.cancelled, j);
    this.scheduleTtl(id);
  }

  subscribe(id: JobId, onProgress: (ev: ProgressEvent) => void): () => void {
    const j = this.jobs.get(id); if (!j) throw new Error(`Job not found: ${id}`);
    const handler = (ev: ProgressEvent) => onProgress(ev);
    j.emitter.on(JOB_EVENTS.progress, handler);
    return () => j.emitter.off(JOB_EVENTS.progress, handler);
  }

  private scheduleTtl(id: JobId): void {
    setTimeout(() => {
      this.jobs.delete(id);
    }, this.ttlMs).unref?.();
  }
}

export const ProgressStore = new ProgressStoreCls();

