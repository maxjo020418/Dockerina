/*
NOTES:
@agentica from separate branch!

> pnpm build && pnpm start
*/

import { 
  Agentica, 
  IAgenticaHistoryJson,
  IAgenticaExecutor
} from "@agentica/core";

import {
  AgenticaRpcService,
  IAgenticaRpcListener,
  IAgenticaRpcService,
} from "@agentica/rpc";

import OpenAI from "openai";
import { WebSocketServer } from "tgrid";
import typia, { Primitive } from "typia";

import { SGlobal } from "./SGlobal";
import { BbsArticleService } from "./services/BbsArticleService";

// custom stuffs
import type { ILlmSchema } from "@samchon/openapi/lib/structures/ILlmSchema";

import { ollamaSelect } from "./OllamaOrchestrate/OllamaSelect";
import { ollamaCall } from "./OllamaOrchestrate/OllamaCall";
import { ollamaExecute } from "./OllamaOrchestrate/OllamaExecute";

const getPromptHistories = async (
  id: string,
): Promise<Primitive<IAgenticaHistoryJson>[]> => {
  // GET PROMPT HISTORIES FROM DATABASE
  id;
  return [];
};

const main = async (): Promise<void> => {
  if (SGlobal.env.OPENAI_API_KEY === undefined)
    console.error("env.OPENAI_API_KEY is not defined.");

  // model type here: --------------------------------------
  // "chatgpt" | "claude" | "deepseek" | "gemini" | "llama" | "3.0" | "3.1"
  type ModelType = Extract<ILlmSchema.Model, "chatgpt">;
  const modeltype: ModelType = "chatgpt";
  // -------------------------------------------------------

  const server: WebSocketServer<
    null,
    IAgenticaRpcService<ModelType>,
    IAgenticaRpcListener
  > = new WebSocketServer();

  await server.open(
    Number(SGlobal.env.PORT), async (acceptor) => {
      const url: URL = new URL(`http://localhost${acceptor.path}`);
      const agent: Agentica<ModelType> = new Agentica<ModelType>(
        {
          model: modeltype,
          vendor: {
            api: new OpenAI({ 
              apiKey: SGlobal.env.OPENAI_API_KEY, // dummy key
              baseURL: "http://localhost:8000/v1" // http://localhost:11434/v1 for direct call
            }),
            model: "qwen3:14b" // ollama models (NO QWEN3 SCHEMA YET)
            //model: "gpt-4o-mini" // chatgpt API
          },

          config: {
            // just inserted into prompt, don't need to specify BCP-47 format
            // only used for AgenticaSystemPrompt.COMMON
            // ------------------
            locale: "English",
            // timezone: "",
            // ------------------

            // prompting order: `.../src/orchestrate/select.ts` is used... (idk why not `initialize.ts`)
            // [Sysprompt gets prioprity anyways in ChatML, order for 'system' DOES NOT MATTER]
            //    COMMON -> <TOOL_CALLS(history) & TOOL> -> <USER INP> -> SELECT(problematic)
            
            // hardcoded prompt orders & structure, CANNOT change -> Modding needed
            // @ agentica/packages/core/src/orchestrate

            systemPrompt: {
              common: () => [
                "The user's choice of language is \"${locale}\".",
                "The user's timezone is: \"${timezone}\".",
              ].join("\n"),

              select: () => [
                "You are an agent that selects functions to call.",
                "DO NOT generate tool calls or call functions provided previously by `getApiFunctions` directly.",
                "You must use the supplied `selectFunctions` function every time to just select the functions to call.",
                // "Tools cannot be called unless `selectFunctions` is called beforehand. Call `selectFunctions` every time with no exceptions."
              ].join("\n"),

              execute: () => [
                "You are an agent that calls the functions provided.",
                "If message histories lack info to compose all the arguments, ask the user for more information.",
                "when asking the user to write more information, make the text concise and clear.",
                // "When calling the function, Make sure it's formatted as JSON.",
              ].join("\n"),

              describe: () => [
                "You are an agent describing return values from function calls.",
                "There should be previous histories of function calls above.",
                // "When describing the return values, don't summarize or abbreviate them too much.",
                // "Provide as much detail as possible.",
                "Format the content in markdown and if needed, use the mermaid syntax for diagrams.",
                // "If the content includes images, use the markdown image syntax to include them.",
                "Provide TL;DR of the result in the end."
              ].join("\n"),

              // initialize: () => "",

              // cancel: () => "",
            },

            executor: ollamaExecute<ModelType>({
              select: ollamaSelect,
              call: ollamaCall,
            }),

            // enable Chain of Thought reasoning
            // (only for ollama's COT supported models)
            // note: seems broken? in-line commands or other methods needed.
            think: true,
          },

          // le' functions I add
          controllers: [
            {
              protocol: "class",
              name: "bbs",
              application: typia.llm.application<BbsArticleService, ModelType>(),
              execute: new BbsArticleService(),
            },
          ],

          histories:
            // check {id} parameter
            url.pathname === "/"
              ? []
              : await getPromptHistories(url.pathname.slice(1)),
        }
      );

      const service: AgenticaRpcService<ModelType> = new AgenticaRpcService(
        {
          agent,
          listener: acceptor.getDriver(),
        }
      );

      await acceptor.accept(service);
    }
  );
};
main().catch(console.error);
