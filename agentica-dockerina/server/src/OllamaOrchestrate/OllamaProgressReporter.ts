import type { ILlmSchema } from "@samchon/openapi";
import {
  AgenticaAssistantMessageEvent,
  AgenticaContext,
  createAssistantMessageEvent,
  toAsyncGenerator,
} from "@agentica/core";

import { ProgressStore } from "../services/jobs/ProgressStore";
import { JOB_EVENTS } from "../services/jobs/ProgressTypes";
import type { JobRecord, JobRef, ProgressEvent, PullProgressDetail } from "../services/jobs/ProgressTypes";

export async function streamProgress<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>,
  ref: JobRef,
  opts?: { intervalMs?: number; prefix?: string },
): Promise<unknown> {
  const job = ProgressStore.get(ref.id);
  if (!job) throw new Error(`Job not found: ${ref.id}`);
  const intervalMs = Math.max(1000, opts?.intervalMs ?? 5000);
  const prefix = opts?.prefix ?? `Progress (${ref.kind})`;

  let last: ProgressEvent | undefined = job.last;
  let lastSentTs = 0;
  const send = (text: string) => {
    const event: AgenticaAssistantMessageEvent = createAssistantMessageEvent({
      get: () => text,
      done: () => true,
      stream: toAsyncGenerator(text),
      join: async () => Promise.resolve(text),
    });
    ctx.dispatch(event);
  };

  const timer = setInterval(() => {
    if (!last) return;
    if (lastSentTs >= last.ts) return;
    send(formatProgress(prefix, job, last));
    lastSentTs = last.ts;
  }, intervalMs);
  (timer as any).unref?.();

  const unsub = ProgressStore.subscribe(ref.id, (ev) => {
    last = ev;
    // send immediately on first event or if gaps are long
    if (lastSentTs === 0) {
      send(formatProgress(prefix, job, ev));
      lastSentTs = ev.ts;
    }
  });

  const final = await new Promise<unknown>((resolve, reject) => {
    const onFinished = (jr: JobRecord) => resolve(jr.final);
    const onFailed = (jr: JobRecord) => reject(new Error(jr.error?.message ?? "Job failed"));
    job.emitter.once(JOB_EVENTS.finished, onFinished);
    job.emitter.once(JOB_EVENTS.failed, onFailed);
  }).finally(() => {
    unsub();
    clearInterval(timer);
    if (job.status === "succeeded") {
      send(`${prefix}: completed.`);
    } else if (job.status === "failed") {
      send(`${prefix}: failed - ${job.error?.message ?? "unknown error"}`);
    }
  });

  return final;
}

function formatProgress(prefix: string, job: JobRecord, ev: ProgressEvent): string {
  const base = `${prefix}: ${new Date(ev.ts).toLocaleTimeString()}`;
  const detail = ev.detail as PullProgressDetail | undefined;
  if (!detail) return `${base} — ${ev.message ?? job.status}`;
  if ((detail as any).ref) {
    const pct = detail.percent != null ? ` ${detail.percent}%` : "";
    const phase = detail.phase ?? "running";
    const layerCount = detail.layers ? Object.keys(detail.layers).length : 0;
    const complete = detail.layers ? Object.values(detail.layers).filter(l => (l.percent ?? 0) >= 100 || /complete/i.test(l.status ?? "")).length : 0;
    return `${base} — pulling '${detail.ref}':${pct} (${complete}/${layerCount} layers) — ${phase}`;
  }
  return `${base} — ${ev.message ?? job.status}`;
}

