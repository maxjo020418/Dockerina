import type { ILlmSchema } from "@samchon/openapi";

import {
    AgenticaContext,
    AgenticaExecuteEvent,
    IAgenticaExecutor
} from "@agentica/core";

// for default orchestration
import { orchestrate } from "@agentica/core"

// custom ollama orchestrations
// needs to be replced if extra custom orchestrations are added
import { ollamaSelect as select } from "./OllamaSelect";
import { ollamaCall as call } from "./OllamaCall";

export function ollamaExecute<Model extends ILlmSchema.Model>(executor: Partial<IAgenticaExecutor<Model>> | null) {
  return async (ctx: AgenticaContext<Model>): Promise<void> => {
    // FUNCTIONS ARE NOT LISTED YET
    if (ctx.ready() === false) {
      if (executor?.initialize !== true && typeof executor?.initialize !== "function") {
        await ctx.initialize();
      }
      else {
        await (
          typeof executor?.initialize === "function"
            ? executor.initialize
            : orchestrate.initialize
        )(ctx);
        if (ctx.ready() === false) {
          return;
        }
      }
    }

    // CANCEL CANDIDATE FUNCTIONS
    if (ctx.stack.length !== 0) {
      console.log("[OllamaExecute.ts] `ctx.stack.length` is <", ctx.stack.length, ">, calling cancel.ts");
      await (executor?.cancel ?? orchestrate.cancel)(ctx);
    }
    console.log("[OllamaExecute.ts] cancel.ts complete, `ctx.stack.length` is now <", ctx.stack.length, ">");

    // SELECT CANDIDATE FUNCTIONS
    await (executor?.select ?? select)(ctx);
    if (ctx.stack.length === 0) {
      console.log("[OllamaExecute.ts] `ctx.stack.length` is < 0 >, terminating.")
      return;
    }

    // FUNCTION CALLING LOOP
    console.log("[OllamaExecute.ts] function calling loop started.")
    while (true) {
      // EXECUTE FUNCTIONS
      const executes: AgenticaExecuteEvent<Model>[] = await (
        executor?.call ?? call
      )(ctx, ctx.stack.map(s => s.operation));

      console.log("[OllamaExecute.ts] fcall loop: ctx.stack.length is <", ctx.stack.length, ">\n", ctx.stack);

      // EXPLAIN RETURN VALUES
      if (executor?.describe !== null && executor?.describe !== false) {  
        await (
          typeof executor?.describe === "function"
            ? executor.describe
            : orchestrate.describe
        )(ctx, executes);
      }
      if (executes.length === 0 || ctx.stack.length === 0) {
        console.log("[OllamaExecute.ts] ended function calling loop.")
        break;
      }
    }
  };
}
