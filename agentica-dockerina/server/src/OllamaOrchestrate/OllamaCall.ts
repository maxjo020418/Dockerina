import type {
  IChatGptSchema,
  IHttpMigrateRoute,
  IHttpResponse,
  ILlmSchema,
} from "@samchon/openapi";
import type OpenAI from "openai";
import type { IValidation } from "typia";

import {
  ChatGptTypeChecker,
  HttpLlm,
  LlmTypeCheckerV3_1,
} from "@samchon/openapi";

import type {
  // context
  AgenticaContext,
  AgenticaOperation,
  // MicroAgenticaContext, // unused

  // events
  AgenticaAssistantMessageEvent,
  AgenticaExecuteEvent,
  AgenticaCallEvent,

  // histories
  MicroAgenticaHistory,
} from "@agentica/core";

import {
  // constants
  AgenticaConstant,
  AgenticaDefaultPrompt,
  AgenticaSystemPrompt,

  // context
  isAgenticaContext,

  // factory/events
  createAssistantMessageEvent, createCallEvent, createExecuteEvent, createValidateEvent,
  // factory/histories
  decodeHistory, decodeUserMessageContent,

  // utils
  ChatGptCompletionMessageUtil,
  StreamUtil,
  toAsyncGenerator,

  // internal
  cancelFunctionFromContext,
} from "@agentica/core";

import { v4 as uuidv4 } from "uuid";
import { extractThinkBlocks, parseRawJsonAfterThink, parseToolCallFromContent } from "../utils/toolCallFallback";
import { streamProgress } from "./OllamaProgressReporter";
import type { JobRef } from "../services/jobs/ProgressTypes";

export async function ollamaCall<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>,
  operations: AgenticaOperation<Model>[],
): Promise<AgenticaExecuteEvent<Model>[]> {
  // ----
  // EXECUTE CHATGPT API
  // ----
  const completionStream = await ctx.request("call", {
    messages: [
      // COMMON SYSTEM PROMPT
      {
        role: "system",
        content: AgenticaDefaultPrompt.write(ctx.config),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,
      // PREVIOUS HISTORIES
      ...ctx.histories.map(decodeHistory).flat(),
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
                + "\n(When calling a function, don't forget any parameters.)"
            } satisfies OpenAI.ChatCompletionContentPartText;
          }
          return decoded
        })
      },
      // SYSTEM PROMPT
      ...(ctx.config?.systemPrompt?.execute === null
        ? []
        : [{
          role: "system",
          content: ctx.config?.systemPrompt?.execute?.(ctx.histories as MicroAgenticaHistory<Model>[])
            ?? AgenticaSystemPrompt.EXECUTE,
        } satisfies OpenAI.ChatCompletionSystemMessageParam]),
    ],
    // STACKED FUNCTIONS
    tools: operations.map(
      s =>
        ({
          type: "function",
          function: {
            name: s.name,

            description: s.function.description,
            parameters: (
              "separated" in s.function

              && s.function.separated !== undefined

                ? (s.function.separated.llm
                  ?? ({
                    type: "object",
                    properties: {},
                    required: [],
                    additionalProperties: false,
                    $defs: {},
                  } satisfies IChatGptSchema.IParameters))

                : s.function.parameters) as Record<string, any>,
          },
        }) as OpenAI.ChatCompletionTool,
    ),
    tool_choice: operations.length === 1
      ? {
          type: "function",
          function: { name: operations[0]!.name },
        }
      : "auto",
    // parallel_tool_calls: false,
  });

  // ----
  // PROCESS COMPLETION
  // ----
  const chunks = await StreamUtil.readAll(completionStream);
  const completion = ChatGptCompletionMessageUtil.merge(chunks);
  const executes: AgenticaExecuteEvent<Model>[] = [];

  for (const choice of completion.choices) {
    // Normal tool_calls path
    let processedAny = false;
    let manualFallbackTriggered = false;
    const seen = new Set<string>();
    for (const tc of choice.message.tool_calls ?? []) {
      if (tc.type === "function") {
        const sig = `${tc.function.name}|${tc.function.arguments}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const operation: AgenticaOperation<Model> | undefined
            = ctx.operations.flat.get(tc.function.name);
        if (operation === undefined) {
          continue;
        }
        const call: AgenticaCallEvent<Model> = createCallEvent({
          id: tc.id,
          operation,
          // @TODO add type assertion!
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
        if (call.operation.protocol === "http") {
          fillHttpArguments({
            operation: call.operation,
            arguments: call.arguments,
          });
        }

        console.log("[OllamaCall.ts] function call protocol:", call.operation.protocol)

        ctx.dispatch(call);

        const exec: AgenticaExecuteEvent<Model> = await propagate(
          ctx,
          call,
          0,
        );
        ctx.dispatch(exec);
        executes.push(exec);

        // Remove from stack due to completion
        if (isAgenticaContext(ctx)) {
          cancelFunctionFromContext(ctx, {
            name: call.operation.name,
            reason: "completed",
          });
          console.log("[OllamaCall.ts] calling:", call.operation.name)
        }
        processedAny = true;
      }
    }
    // ================= EDITED HERE!!! (fallbacks) =================
    // Fallback path 1: some models emit tool calls in text content
    if (!processedAny && typeof choice.message.content === "string") {
      const embedded = parseToolCallFromContent(choice.message.content);
      for (const obj of embedded) {
        const sig = `${obj.name}|${JSON.stringify(obj.arguments)}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const operation = ctx.operations.flat.get(obj.name);
        if (!operation) continue;
        const call = createCallEvent({ id: uuidv4(), operation, arguments: obj.arguments });
        if (call.operation.protocol === "http") {
          fillHttpArguments({ operation: call.operation, arguments: call.arguments });
        }
        ctx.dispatch(call);
        const exec = await propagate(ctx, call, 0);
        ctx.dispatch(exec);
        executes.push(exec);
        if (isAgenticaContext(ctx)) {
          cancelFunctionFromContext(ctx, { name: call.operation.name, reason: "completed" });
        }
        processedAny = true;
      }
    }

    // Fallback path 2: plain JSON after <think> without <tool_call>
    if (!processedAny && typeof choice.message.content === "string") {
      const parsed = parseRawJsonAfterThink(choice.message.content);
      if (parsed) {
        const sig = `${parsed.name}|${JSON.stringify(parsed.arguments)}`;
        if (!seen.has(sig)) {
          const operation = ctx.operations.flat.get(parsed.name);
          if (operation) {
            console.warn("[OllamaCall.ts] WARNING: Detected raw tool call JSON outside <tool_call>. Executing manually.");
            const call = createCallEvent({ id: uuidv4(), operation, arguments: parsed.arguments });
            if (call.operation.protocol === "http") {
              fillHttpArguments({ operation: call.operation, arguments: call.arguments });
            }
            ctx.dispatch(call);
            const exec = await propagate(ctx, call, 0);
            ctx.dispatch(exec);
            executes.push(exec);
            if (isAgenticaContext(ctx)) {
              cancelFunctionFromContext(ctx, { name: call.operation.name, reason: "completed" });
            }
            seen.add(sig);
            processedAny = true;
            manualFallbackTriggered = true;
          }
        }
      }
    }
    
    // If manual fallback triggered, remove the raw json string (so that it only shows the <think> part)
    if (manualFallbackTriggered === true && typeof choice.message.content === "string") {
      const thinks = extractThinkBlocks(choice.message.content);
      if (thinks.length > 0) {
        const event: AgenticaAssistantMessageEvent = createAssistantMessageEvent({
          get: () => thinks, // "## *CALL AGENT*\n\n" + 
          done: () => true,
          stream: toAsyncGenerator(thinks),
          join: async () => Promise.resolve(thinks),
        });
        ctx.dispatch(event);
      }
    }

    // convert to msg string (normal operations)
    if (
      choice.message.role === "assistant"
      && choice.message.content != null
      && choice.message.content.length !== 0
      && manualFallbackTriggered === false
    ) {
      const text: string = choice.message.content;
      const event: AgenticaAssistantMessageEvent = createAssistantMessageEvent({
        get: () => text, // "## *CALL AGENT*\n\n" + 
        done: () => true,
        stream: toAsyncGenerator(text),
        join: async () => Promise.resolve(text),
      });
      ctx.dispatch(event);
    }
  }
  return executes;
}

async function propagate<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>,
  call: AgenticaCallEvent<Model>,
  retry: number,
): Promise<AgenticaExecuteEvent<Model>> {
  switch (call.operation.protocol) {
    case "http": {
      return propagateHttp({ ctx, operation: call.operation, call, retry });
    }
    case "class": {
      return propagateClass({ ctx, operation: call.operation, call, retry });
    }
    case "mcp": {
      return propagateMcp({ ctx, operation: call.operation, call, retry });
    }
    default: {
      call.operation satisfies never;
      throw new Error("Unsupported protocol");
    }
  }
}

async function propagateHttp<Model extends ILlmSchema.Model>(
  props: {
    ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>;
    operation: AgenticaOperation.Http<Model>;
    call: AgenticaCallEvent<Model>;
    retry: number;
  },
): Promise<AgenticaExecuteEvent<Model>> {
  // ----
  // HTTP PROTOCOL
  // ----
  // NESTED VALIDATOR
  const check: IValidation<unknown> = props.operation.function.validate(
    props.call.arguments,
  );
  if (check.success === false) {
    props.ctx.dispatch(
      createValidateEvent({
        id: props.call.id,
        operation: props.operation,
        result: check,
      }),
    );

    if (props.retry++ < (props.ctx.config?.retry ?? AgenticaConstant.RETRY)) {
      const trial: AgenticaExecuteEvent<Model> | null = await correct(
        props.ctx,
        props.call,
        props.retry,
        check.errors,
      );
      if (trial !== null) {
        return trial;
      }
    }
  }

  try {
    // CALL HTTP API
    const response: IHttpResponse = await executeHttpOperation(props.operation, props.call.arguments);
    
    // Log detailed error information for bad requests
    if (response.status >= 400) {
      console.error(`[OllamaCall.ts] HTTP ${response.status} Error for operation "${props.call.operation.name}"`);
      console.error(`[OllamaCall.ts] Request arguments:`, JSON.stringify(props.call.arguments, null, 2));
      console.error(`[OllamaCall.ts] Response body:`, JSON.stringify(response.body, null, 2));
      console.error(`[OllamaCall.ts] Retry attempt: ${props.retry}/${props.ctx.config?.retry ?? AgenticaConstant.RETRY}`);
    }
    
    // CHECK STATUS
    const success: boolean
          = ((response.status === 400
            || response.status === 404
            || response.status === 422)
          && props.retry++ < (props.ctx.config?.retry ?? AgenticaConstant.RETRY)
          && typeof response.body) === false;
      // DISPATCH EVENT
    return (
      (success === false
        ? await correct(props.ctx, props.call, props.retry, response.body)
        : null)
      ?? createExecuteEvent({
        operation: props.call.operation,
        arguments: props.call.arguments,
        value: response,
      })
    );
  }
  catch (error) {
    // DISPATCH ERROR
    
    return createExecuteEvent({
      operation: props.call.operation,
      arguments: props.call.arguments,
      value: {
        status: 500,
        headers: {},
        body:
          error instanceof Error
            ? {
                ...error,
                name: error.name,
                message: error.message,
              }
            : error,
      },
    });
  }
}

async function propagateClass<Model extends ILlmSchema.Model>(props: {
  ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>;
  operation: AgenticaOperation.Class<Model>;
  call: AgenticaCallEvent<Model>;
  retry: number;
}): Promise<AgenticaExecuteEvent<Model>> {
// ----
  // CLASS FUNCTION
  // ----
  // VALIDATE FIRST
  const check: IValidation<unknown> = props.operation.function.validate(
    props.call.arguments,
  );
  if (check.success === false) {
    props.ctx.dispatch(
      createValidateEvent({
        id: props.call.id,
        operation: props.call.operation,
        result: check,
      }),
    );
    return (
      (props.retry++ < (props.ctx.config?.retry ?? AgenticaConstant.RETRY)
        ? await correct(props.ctx, props.call, props.retry, check.errors)
        : null)
      ?? createExecuteEvent({
        operation: props.call.operation,
        arguments: props.call.arguments,
        value: {
          name: "TypeGuardError",
          message: "Invalid arguments.",
          errors: check.errors,
        },
      })
    );
  }
  // EXECUTE FUNCTION
  try {
    const value = await executeClassOperation(props.operation, props.call.arguments);
    // If the function returns a JobRef, stream progress and await final value
    if (isJobRef(value)) {
      const prefix = `Job ${value.kind} :: ${props.call.operation.name}`;
      try {
        const final = await streamProgress(props.ctx, value as JobRef, { intervalMs: 5000, prefix });
        return createExecuteEvent({
          operation: props.call.operation,
          arguments: props.call.arguments,
          value: final,
        });
      } catch (error) {
        return createExecuteEvent({
          operation: props.call.operation,
          arguments: props.call.arguments,
          value:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        });
      }
    } else {
      return createExecuteEvent({
        operation: props.call.operation,
        arguments: props.call.arguments,
        value,
      });
    }
  }
  catch (error) {
    console.log("[OllamaCall.ts] propagateClass error");
    return createExecuteEvent({
      operation: props.call.operation,
      arguments: props.call.arguments,
      value:
        error instanceof Error
          ? {
              ...error,
              name: error.name,
              message: error.message,
            }
          : error,
    });
  }
}

function isJobRef(v: unknown): v is JobRef {
  return !!v && typeof v === "object" && ("id" in (v as any)) && ("kind" in (v as any))
    && typeof (v as any).id === "string" && typeof (v as any).kind === "string";
}

async function propagateMcp<Model extends ILlmSchema.Model>(props: {
  ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>;
  operation: AgenticaOperation.Mcp<Model>;
  call: AgenticaCallEvent<Model>;
  retry: number;
}): Promise<AgenticaExecuteEvent<Model>> {
  // ----
  // MCP PROTOCOL
  // ----
  // @TODO: implement argument validation logic
  try {
    const value = await executeMcpOperation(props.operation, props.call.arguments);
    return createExecuteEvent({
      operation: props.call.operation,
      arguments: props.call.arguments,
      value,
    });
  }
  catch (error) {
    return createExecuteEvent({
      operation: props.call.operation,
      arguments: props.call.arguments,
      value:
        error instanceof Error
          ? {
              ...error,
              name: error.name,
              message: error.message,
            }
          : error,
    });
  }
}

async function executeHttpOperation<Model extends ILlmSchema.Model>(operation: AgenticaOperation.Http<Model>, operationArguments: Record<string, unknown>): Promise<IHttpResponse> {
  const controllerBaseArguments = {
    connection: operation.controller.connection,
    application: operation.controller.application,
    function: operation.function,
  };
  return operation.controller.execute !== undefined
    ? operation.controller.execute({ ...controllerBaseArguments, arguments: operationArguments })
    : HttpLlm.propagate({ ...controllerBaseArguments, input: operationArguments });
}

/**
 * @throws {TypeError}
 */
async function executeClassOperation<Model extends ILlmSchema.Model>(operation: AgenticaOperation.Class<Model>, operationArguments: Record<string, unknown>): Promise<unknown> {
  const execute = operation.controller.execute;
  if (typeof execute === "function") {
    return await execute({
      application: operation.controller.application,
      function: operation.function,
      arguments: operationArguments,
    });
  }

  // As you know, it's very unstable logic.
  // But this is an intended error.
  // There are two types of errors that can occur here.
  // One is a TypeError caused by referencing an undefined value, and the other is a TypeError caused by calling something that isn't a function.
  // These errors are intentional, and any call to this function must be wrapped in a try-catch block.
  // Unless there is an overall structural improvement, this function will remain as-is.
  return ((execute as Record<string, unknown>)[operation.function.name] as (...args: unknown[]) => Promise<unknown>)(operationArguments);
}

async function executeMcpOperation<Model extends ILlmSchema.Model>(
  operation: AgenticaOperation.Mcp<Model>,
  operationArguments: Record<string, unknown>,
): Promise<unknown> {
  return operation.controller.client.callTool({

    method: operation.function.name,

    name: operation.function.name,
    arguments: operationArguments,
  }).then(v => v.content);
}

async function correct<Model extends ILlmSchema.Model>(
  ctx: AgenticaContext<Model>, // | MicroAgenticaContext<Model>,
  call: AgenticaCallEvent<Model>,
  retry: number,
  error: unknown,
): Promise<AgenticaExecuteEvent<Model> | null> {
  console.log(`[OllamaCall.ts] Starting error correction for "${call.operation.name}" (retry ${retry})`);
  console.log(`[OllamaCall.ts] Error details:`, typeof error === 'string' ? error : JSON.stringify(error, null, 2));
  
  // ----
  // EXECUTE CHATGPT API
  // ----
  const completionStream = await ctx.request("call", {
    messages: [
      // COMMON SYSTEM PROMPT
      {
        role: "system",
        content: AgenticaDefaultPrompt.write(ctx.config),
      } satisfies OpenAI.ChatCompletionSystemMessageParam,
      // PREVIOUS HISTORIES
      ...ctx.histories.map(decodeHistory).flat(),
      // USER INPUT
      {
        role: "user",
        content: ctx.prompt.contents.map(decodeUserMessageContent),
      },
      // TYPE CORRECTION
      ...(ctx.config?.systemPrompt?.execute === null
        ? []
        : [{
          role: "system",
          content:
          ctx.config?.systemPrompt?.execute?.(ctx.histories as MicroAgenticaHistory<Model>[])
          ?? AgenticaSystemPrompt.EXECUTE,
        } satisfies OpenAI.ChatCompletionSystemMessageParam]
      ),
      {
        role: "assistant",
        tool_calls: [
          {
            type: "function",
            id: call.id,
            function: {
              name: call.operation.name,
              arguments: JSON.stringify(call.arguments),
            },
          } satisfies OpenAI.ChatCompletionMessageToolCall,
        ],
      } satisfies OpenAI.ChatCompletionAssistantMessageParam,
      {
        role: "tool",
        content: typeof error === "string" ? error : JSON.stringify(error),
        tool_call_id: call.id,
      } satisfies OpenAI.ChatCompletionToolMessageParam,
      {
        role: "system",
        content: [
          "Function calling arguments are not valid or has the wrong type.",
          "Call the function again with the corrected arguments.",
        ].join("\n"),
      },
    ],
    // STACK FUNCTIONS
    tools: [
      {
        type: "function",
        function: {
          name: call.operation.name,
          description: call.operation.function.description,
          /**
           * @TODO fix it
           * The property and value have a type mismatch, but it works.
           */
          parameters: (
            "separated" in call.operation.function

            && call.operation.function.separated !== undefined

              ? (call.operation.function.separated?.llm
                ?? ({
                  $defs: {},
                  type: "object",
                  properties: {},
                  additionalProperties: false,
                  required: [],
                } satisfies IChatGptSchema.IParameters))

              : call.operation.function.parameters) as unknown as Record<string, unknown>,
        },
      },
    ],
    tool_choice: {
      type: "function",
      function: {
        name: call.operation.name,
      },
    },
    // parallel_tool_calls: false,
  });

  const chunks = await StreamUtil.readAll(completionStream);
  const completion = ChatGptCompletionMessageUtil.merge(chunks);

  // ----
  // PROCESS COMPLETION
  // ----
  const toolCall: OpenAI.ChatCompletionMessageToolCall | undefined = (
    completion.choices[0]?.message.tool_calls ?? []
  ).find(
    tc =>
      tc.type === "function" && tc.function.name === call.operation.name,
  );
  if (toolCall === undefined) {
    return null;
  }
  return propagate(
    ctx,
    createCallEvent({
      id: toolCall.id,
      operation: call.operation,
      arguments: JSON.parse(toolCall.function.arguments) as Record<string, unknown>,
    }),
    retry,
  );
}

function fillHttpArguments<Model extends ILlmSchema.Model>(props: {
  operation: AgenticaOperation<Model>;
  arguments: Record<string, unknown>;
}): void {
  if (props.operation.protocol !== "http") {
    return;
  }
  const route: IHttpMigrateRoute = props.operation.function.route();
  if (
    route.body !== null
    && route.operation().requestBody?.required === true
    && "body" in props.arguments
    && isObject(
      (props.operation.function.parameters as IChatGptSchema.IParameters)
        .$defs,
      (props.operation.function.parameters as IChatGptSchema.IParameters)
        .properties
        .body!,
    )
  ) { props.arguments.body = {}; }
  if (route.query !== null && "query" in props.arguments && props.arguments.query === undefined) {
    props.arguments.query = {};
  }
}

function isObject($defs: Record<string, IChatGptSchema>, schema: IChatGptSchema): boolean {
  return (
    ChatGptTypeChecker.isObject(schema)
    || (ChatGptTypeChecker.isReference(schema)
      && isObject($defs, $defs[schema.$ref.split("/").at(-1)!]!))
    || (ChatGptTypeChecker.isAnyOf(schema)
      && schema.anyOf.every(schema => isObject($defs, schema)))
    || (LlmTypeCheckerV3_1.isOneOf(schema)
      && schema.oneOf.every(schema => isObject($defs, schema)))
  );
}
