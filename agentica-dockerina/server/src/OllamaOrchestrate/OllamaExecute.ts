import type { ILlmSchema } from "@samchon/openapi";

import {
    AgenticaContext,
    AgenticaExecuteEvent,
    IAgenticaExecutor
} from "@agentica/core";

// custom ollama orchestrations
// needs to be replced if extra custom orchestrations are added
import { ollamaSelect as select } from "./OllamaSelect";
import { ollamaCall as call } from "./OllamaCall";
import { ollamaCancel as cancel } from "./OllamaCancel";

import {
  // orchestrate
  initialize,
  describe,

  cancelFunctionFromContext
} from "@agentica/core";

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
            : initialize
        )(ctx);
        if (ctx.ready() === false) {
          return;
        }
      }
    }

    console.log("[OllamaExecute.ts] +++++ EXECUTE STARTED +++++");
    console.log("\t `ctx.stack.length` is <", ctx.stack.length, "> Staring...\nFunctions:");
    for (const op of ctx.stack) {
      console.log("\t", op.operation.name);
    }

    // SELECT CANDIDATE FUNCTIONS
    await (executor?.select ?? select)(ctx);
    if (ctx.stack.length === 0) {
      console.log("[OllamaExecute.ts] `ctx.stack.length` is < 0 >, terminating.")
      return;
    }
    console.log("[OllamaExecute.ts] selection complete, `ctx.stack.length` is now <", ctx.stack.length, "> :\n");
    for (const op of ctx.stack) {
      console.log("\t", op.operation.name);
    }

    // FUNCTION CALLING LOOP
    console.log("[OllamaExecute.ts] === function calling loop started ===")
    const allExecutes: AgenticaExecuteEvent<Model>[] = [];
    while (true) {
      // EXECUTE FUNCTIONS
      // ======== EDITED HERE TO SERIALIZE CALLS ========
      // If serializeCalls is true, call functions ONE AT A TIME per loop, rather than all at once
      // Otherwise, call all functions in the stack (like the original behavior)
      // ================================================
      const operations = (
        ctx.config?.serializeCalls === true && ctx.stack.length > 0
          ? [ctx.stack[0]!.operation]
          : ctx.stack.map(s => s.operation)
      );
      const executes: AgenticaExecuteEvent<Model>[] = await (
        executor?.call ?? call
      )(ctx, operations);

      // Collect all executes for later description
      allExecutes.push(...executes);

      if (executes.length === 0 || ctx.stack.length === 0) {
        console.log("[OllamaExecute.ts] === function calling loop ended ===")
        break;
      }
      else {
        // CANCEL CANDIDATE FUNCTIONS
        await (executor?.cancel ?? cancel)(ctx);
      }

      console.log("[OllamaExecute.ts] `ctx.stack.length` is now <", ctx.stack.length, ">");
    }

    // EXPLAIN RETURN VALUES - AFTER ALL FUNCTIONS ARE COMPLETE
    if (executor?.describe !== null && executor?.describe !== false && allExecutes.length > 0) {  
      await (
        typeof executor?.describe === "function"
          ? executor.describe
          : describe
      )(ctx, allExecutes);
    }

    // // Empty stack if function(s) are not used
    for (const op of [...ctx.stack]) {  // copy of stack to avoid mutation during iteration
      console.log("[OllamaExecute.ts] removing \"", op.operation.name, "\" from stack.")
      cancelFunctionFromContext(ctx, {
        name: op.operation.name,
        reason: "unused",
      });
    }

    console.log("[OllamaExecute.ts] END: ctx.stack.length is <", ctx.stack.length, ">");
    console.log("[OllamaExecute.ts] +++++ EXECUTE ENDED +++++")
  };
}
