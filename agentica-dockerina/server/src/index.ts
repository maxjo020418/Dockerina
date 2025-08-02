/*
NOTES:
@agentica from separate branch!
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
import { ollamaCancel } from "./OllamaOrchestrate/OllamaCancel";
import { ollamaDescribe } from "./OllamaOrchestrate/OllamaDescribe";

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
              /*
              :11434/v1 for direct call, :8000/v1 for debug shim
              - localhost
              - sylph.yeongmin.net // local DNS
              - sylph-wsl.ragdoll-ule.ts.net // tailscale
              */
              baseURL: "http://localhost:8000/v1"
            }),
            model: "qwen3-14b-4k" // ollama models (NO QWEN3 SCHEMA YET)
            // model: "gpt-4o-mini" // chatgpt API
          },

          config: {
            // local/TZ is just inserted into prompt, 
            // don't need to comply to specific formats
            // only used for AgenticaSystemPrompt.COMMON
            // ------------------
            locale: "English",
            // timezone: "",
            // ------------------

            /* prompting order: `.../src/orchestrate/select.ts` is used... (idk why not `initialize.ts`)
            [Sysprompt gets priority anyways in ChatML, order for 'system' DOES NOT MATTER]
              COMMON -> <TOOL_CALLS(history) & TOOL> -> <USER INP> -> SELECT(problematic)
            
            hardcoded prompt orders & structure, CANNOT change -> Modding needed
            @ agentica/packages/core/src/orchestrate
            */

            systemPrompt: {
              common: () => [
                "The user's choice of language is \"${locale}\".",
                "The user's timezone is: \"${timezone}\".",
              ].join("\n"),

              select: () => [
                "You are an agent that selects functions to call.",
                // "DO NOT generate tool calls or call functions provided previously by `getApiFunctions` directly.",
                "Use the supplied `selectFunctions` function to select the functions provided by getApiFunctions.",
              ].join("\n"),

              execute: () => [  // call.ts
                "You are an agent that calls the functions provided.",
                "If the context provided lacks information to create arguments for the function, you must ask the user for more information.",
                "But if the information is insufficient but you believe you can accurately infer and fill in the parameters or arguments, do so accordingly."
              ].join("\n"),

              describe: () => [
                "You are an agent describing return values from function calls.",
                "There should be previous histories of function calls above.",
                // "When describing the return values, don't summarize or abbreviate them too much.",
                // "Provide as much detail as possible.",
                // "Format the content in markdown and if needed, use the mermaid syntax for diagrams.",
                // "If the content includes images, use the markdown image syntax to include them.",
                "format as markdown",
                "Provide TL;DR of the result in the end."
              ].join("\n"),

              cancel: () => [
                "You are an agent for cancelling functions which are prepared to call.",
                "Use the supplied tools to select some functions to cancel of `getApiFunctions()` returned.",
                "If you can't find any proper function to select, don't talk, don't do anything.",
                ].join("\n"),

              // initialize: () => "",
            },

            executor: ollamaExecute<ModelType>({
              select: ollamaSelect,
              call: ollamaCall,
              cancel: ollamaCancel,
              describe: ollamaDescribe,
            }),

            // [Custom added parameters] NOTE: seems broken? in-line commands or other methods needed.
            // enable Chain of Thought reasoning
            // (only for ollama's COT supported models)
            think: true,
            // LLM temperature and top_p
            temperature: 0.6,
            top_p: 1.0
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
