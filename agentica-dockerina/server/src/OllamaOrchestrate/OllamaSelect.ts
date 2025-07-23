// based on agentica-dockerina/server/agentica/packages/core/src/orchestrate/select.ts

import type { ILlmApplication, ILlmSchema } from "@samchon/openapi";
import type OpenAI from "openai";
import type { IValidation } from "typia";

import typia from "typia";

import type { 
  AgenticaContext,
  AgenticaOperation,
  AgenticaOperationSelection,
  AgenticaAssistantMessageEvent,
  AgenticaSelectEvent,
  AgenticaEvent,
} from "@agentica/core";

import { factory, orchestrate, utils, constants } from "@agentica/core"

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
    (ctx.config?.eliticism ?? constants.AgenticaConstant.ELITICISM) === true
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
      ...ctx.histories.map(factory.decodeHistory).flat(),

      // USER INPUT
      {
        role: "user",
        content: ctx.prompt.contents.map((c) => {
          const decoded = factory.decodeUserMessageContent(c);
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
                + "\n(If you need to call a function, use it via the `selectFunctions`, follow the function json structure:\n"
                + "{\"name\": \"selectFunctions\", \"arguments\": {\"functions\": [{\"name\": <func. name>, \"reason\": <reason>}, ...]}}"
            } satisfies OpenAI.ChatCompletionContentPartText;
          }
          return decoded
        })
      },

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
        content: constants.AgenticaDefaultPrompt.write(ctx.config),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,

      // SYSTEM PROMPT
      {
        role: "system",
        content:
            ctx.config?.systemPrompt?.select?.(ctx.histories)
            ?? constants.AgenticaSystemPrompt.SELECT
        ,
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
    tool_choice: retry === 0
      ? "auto"
      : {
          type: "function",
          function: {
            name: CONTAINER.functions[0]!.name,
          },
        },
    // parallel_tool_calls: false,
  });

  const chunks = await utils.StreamUtil.readAll(completionStream);
  const completion = utils.ChatGptCompletionMessageUtil.merge(chunks);

  // ----
  // VALIDATION
  // ----
  if (retry++ < (ctx.config?.retry ?? constants.AgenticaConstant.RETRY)) {
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
          orchestrate.selectFunctionFromContext(ctx, reference);
        }
      }
    }

    // ASSISTANT MESSAGE
    // (LLM's generated message)
    if (
      choice.message.role === "assistant"
      && choice.message.content != null
      && choice.message.content.length !== 0
    ) {
      const event: AgenticaAssistantMessageEvent = factory.creatAssistantMessageEvent({
        stream: utils.toAsyncGenerator(choice.message.content),
        join: async () => Promise.resolve(choice.message.content!),
        done: () => true,
        get: () => "## [SELECT AGENT]\n\n" + choice.message.content!, // string
      });
      ctx.dispatch(event);
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
          "Function calling arguments are not valid or had the wrong type.",
          "Call the function again with the corrected arguments.",
        ].join("\n"),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,
    ])
    .flat();
}
