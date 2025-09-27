// based on agentica-dockerina/server/agentica/packages/core/src/orchestrate/select.ts

import type { ILlmApplication, ILlmSchema } from "@samchon/openapi";
import type OpenAI from "openai";
import type { IValidation } from "typia";

import typia from "typia";

import type { 
  // context
  AgenticaContext,
  AgenticaOperation,
  AgenticaOperationSelection,

  // events
  AgenticaAssistantMessageEvent,
  AgenticaSelectEvent,
  AgenticaEvent,
} from "@agentica/core";


import {
  // constants
  AgenticaConstant,
  AgenticaDefaultPrompt,
  AgenticaSystemPrompt,

  // factory
  decodeHistory, decodeUserMessageContent,
  createAssistantMessageEvent,

  // utils
  StreamUtil, toAsyncGenerator,
  ChatGptCompletionMessageUtil,

  // internal
  selectFunctionFromContext,
} from "@agentica/core";
import { extractThinkBlocks, parseRawJsonAfterThink, parseToolCallFromContent } from "../utils/toolCallFallback";

import type { __IChatFunctionReference } from "../function-refs/__IChatFunctionReference"
import type { __IChatSelectFunctionsApplication } from "../function-refs/__IChatSelectFunctionsApplication"

const CONTAINER: ILlmApplication<"chatgpt"> = typia.llm.application<
  __IChatSelectFunctionsApplication,
  "chatgpt"
>();

interface IFailure {
  id: string;
  name: string;
  validation: IValidation.IFailure;
}

export async function ollamaSelect<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>,
): Promise<void> {
  if (ctx.operations.divided === undefined) {
    return step(ctx, ctx.operations.array, 0);
  }

  const stacks: AgenticaOperationSelection<Model>[][]
    = ctx.operations.divided.map(() => []);
  const events: AgenticaEvent<Model>[] = [];
  await Promise.all(
    ctx.operations.divided.map(async (operations, i) =>
      step(
        {
          ...ctx,
          stack: stacks[i]!,
          dispatch: (e) => {
            events.push(e);
            return e;
          },
        },
        operations,
        0,
      ),
    ),
  );

  // ELITICISM
  if (
    (ctx.config?.eliticism ?? AgenticaConstant.ELITICISM) === true
    && stacks.some(s => s.length !== 0)
  ) {
    return step(
      ctx,
      stacks
        .flat()
        .map(
          s =>
            ctx.operations.group
              .get(s.operation.controller.name)!
              .get(s.operation.function.name)!,
        ),
      0,
    );
  }
  else {
    const selected: AgenticaSelectEvent<Model>[]
      = events.filter(e => e.type === "select");
    (selected.length !== 0 ? selected : events)
      .forEach(ctx.dispatch);
  }
}

async function step<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>,
  operations: AgenticaOperation<Model>[],
  retry: number,
  failures?: IFailure[],
): Promise<void> {
  // ----
  // EXECUTE CHATGPT API
  // ----
  const completionStream = await ctx.request("select", {
    messages: [
      // PREVIOUS HISTORIES
      ...ctx.histories.map(decodeHistory).flat(),

      // CANDIDATE FUNCTIONS
      {
        role: "assistant",
        tool_calls: [
          {
            type: "function",
            id: "getApiFunctions",
            function: {
              name: "getApiFunctions",
              arguments: JSON.stringify({}),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "getApiFunctions",
        content: JSON.stringify(
          operations.map(op => ({
            name: op.name,
            description: op.function.description,
            ...(op.protocol === "http"
              ? {
                  method: op.function.method,
                  path: op.function.path,
                  tags: op.function.tags,
                }
              : {}),
          })),
        ),
      },

      // COMMON SYSTEM PROMPT
      {
        role: "system",
        content: AgenticaDefaultPrompt.write(ctx.config),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,

      // SYSTEM PROMPT
      {
        role: "system",
        content:
            ctx.config?.systemPrompt?.select?.(ctx.histories)
            ?? AgenticaSystemPrompt.SELECT
        ,
      },

      // USER INPUT
      {
        role: "user",
        content: ctx.prompt.contents.map((c) => {
          const decoded = decodeUserMessageContent(c);
          if (
            typeof decoded === "string" ||
            (decoded as { type?: string }).type === "text"
          ) {
              const text =
                typeof decoded === "string"
                  ? decoded
                  : (decoded as OpenAI.ChatCompletionContentPartText).text;
            return {
              ...(typeof decoded === "string" ? {} : decoded),
              type: "text",
              text: text 
                + "\n(Use the functions provided from `getApiFunctions` via `selectFunctions` to select functions to call for the user."
                + "DO NOT call functions directly without using `selectFunctions`)"
                // + "\n(When calling a function, you must use it via the `selectFunctions` and follow this format: "
                // + "{\"name\": \"selectFunctions\", \"arguments\": {\"functions\": [{\"name\": <function name>, \"reason\": <reason>}, ...]}})"
            } satisfies OpenAI.ChatCompletionContentPartText;
          }
          return decoded
        })
      },
       
      // TYPE CORRECTIONS
      ...emendMessages(failures ?? []),
    ],
    // STACK FUNCTIONS
    tools: [{
      type: "function",
      function: {
        name: CONTAINER.functions[0]!.name,
        description: CONTAINER.functions[0]!.description,
        /**
         * @TODO fix it
         * The property and value have a type mismatch, but it works.
         */
        parameters: CONTAINER.functions[0]!.parameters as unknown as Record<string, unknown>,
      },
    } satisfies OpenAI.ChatCompletionTool],
    // Force using selectFunctions to avoid chatty answers
    tool_choice: {
      type: "function",
      function: {
        name: CONTAINER.functions[0]!.name,
      },
    },
    // parallel_tool_calls: false,
  });

  const chunks = await StreamUtil.readAll(completionStream);
  const completion = ChatGptCompletionMessageUtil.merge(chunks);

  // ----
  // VALIDATION
  // ----
  if (retry++ < (ctx.config?.retry ?? AgenticaConstant.RETRY)) {
    const failures: IFailure[] = [];
    for (const choice of completion.choices) {
      for (const tc of choice.message.tool_calls ?? []) {
        if (tc.function.name !== "selectFunctions") {
          continue;
        }
        const input: object = JSON.parse(tc.function.arguments) as object;
        const validation: IValidation<__IChatFunctionReference.IProps>
          = typia.validate<__IChatFunctionReference.IProps>(input);
        if (validation.success === false) {
          failures.push({
            id: tc.id,
            name: tc.function.name,
            validation,
          });
        }
      }
    }
    if (failures.length > 0) {
      return step(ctx, operations, retry, failures);
    }
  }

  // ----
  // PROCESS COMPLETION
  // ----
  for (const choice of completion.choices) {
    let processedAny = false;
    let manualFallbackTriggered = false;
    // FUNCTION CALLING
    if (choice.message.tool_calls != null) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type !== "function") {
          continue;
        }
        else if (tc.function.name !== "selectFunctions") {
          continue;
        }

        const input: __IChatFunctionReference.IProps | null
          = typia.json.isParse<__IChatFunctionReference.IProps>(
            tc.function.arguments,
          );
        if (input === null) {
          continue;
        }
        for (const reference of input.functions) {
          selectFunctionFromContext(ctx, reference);
        }
        processedAny = true;
      }
    }

    // Fallback 1: <tool_call> JSON embedded in content
    if (!processedAny && typeof choice.message.content === "string") {
      const embedded = parseToolCallFromContent(choice.message.content, { expectName: "selectFunctions" });
      for (const obj of embedded) {
        const input = typia.json.isParse<__IChatFunctionReference.IProps>(JSON.stringify(obj.arguments));
        if (input) {
          for (const reference of input.functions) selectFunctionFromContext(ctx, reference);
          processedAny = true;
          manualFallbackTriggered = true;
        }
      }
    }

    // Fallback 2: plain JSON after <think>
    if (!processedAny && typeof choice.message.content === "string") {
      const parsed = parseRawJsonAfterThink(choice.message.content, { expectName: "selectFunctions" });
      if (parsed) {
        const input = typia.json.isParse<__IChatFunctionReference.IProps>(JSON.stringify(parsed.arguments));
        if (input) {
          console.warn("[OllamaSelect.ts] WARNING: Detected raw selectFunctions JSON outside <tool_call>. Executing manually.");
          for (const reference of input.functions) selectFunctionFromContext(ctx, reference);
          processedAny = true;
          manualFallbackTriggered = true;
        }
      }
    }

    // ASSISTANT MESSAGE
    // (LLM's generated message)
    if (
      choice.message.role === "assistant"
      && choice.message.content != null
      && choice.message.content.length !== 0
      && manualFallbackTriggered === false
    ) {
      const event: AgenticaAssistantMessageEvent = createAssistantMessageEvent({
        stream: toAsyncGenerator(choice.message.content),
        join: async () => Promise.resolve(choice.message.content!),
        done: () => true,
        get: () => choice.message.content!, // "## *SELECT AGENT*\n\n" + 
      });
      ctx.dispatch(event);
    }

    // If manual fallback triggered, echo only the <think> blocks
    if (manualFallbackTriggered === true && typeof choice.message.content === "string") {
      const thinks = extractThinkBlocks(choice.message.content);
      if (thinks.length > 0) {
        const event: AgenticaAssistantMessageEvent = createAssistantMessageEvent({
          stream: toAsyncGenerator(thinks),
          join: async () => Promise.resolve(thinks),
          done: () => true,
          get: () => thinks, // "## *SELECT AGENT*\n\n" + 
        });
        ctx.dispatch(event);
      }
    }
  }
}

function emendMessages(failures: IFailure[]): OpenAI.ChatCompletionMessageParam[] {
  return failures
    .map(f => [
      {
        role: "assistant",
        tool_calls: [
          {
            type: "function",
            id: f.id,
            function: {
              name: f.name,
              arguments: JSON.stringify(f.validation.data),
            },
          },
        ],
      } satisfies OpenAI.ChatCompletionAssistantMessageParam,
      {
        role: "tool",
        content: JSON.stringify(f.validation.errors),
        tool_call_id: f.id,
      } satisfies OpenAI.ChatCompletionToolMessageParam,
      {
        role: "system",
        content: [
          "Function calling arguments are not valid or has the wrong type.",
          "Call the function again with the corrected arguments.",
        ].join("\n"),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,
    ])
    .flat();
}
