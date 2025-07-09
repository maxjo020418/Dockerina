/*
NOTES:
@agentica from separate branch!

> pnpm build && pnpm start
*/

import { Agentica, IAgenticaHistoryJson } from "@agentica/core";
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

import { ollamaSelect } from "./executors/OllamaSelect";
import { ollamaCall } from "./executors/OllamaCall";

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
  type ModelType = Extract<ILlmSchema.Model, "deepseek">;
  const modeltype: ModelType = "deepseek";
  // -------------------------------------------------------

  const server: WebSocketServer<
    null,
    IAgenticaRpcService<ModelType>,
    IAgenticaRpcListener
  > = new WebSocketServer();

  await server.open(
    Number(SGlobal.env.PORT), async (acceptor) => {
      const url: URL = new URL(`http://localhost${acceptor.path}`);
      const agent: Agentica<ModelType> = new Agentica(
        {
          model: modeltype,
          vendor: {
            api: new OpenAI({ 
              apiKey: SGlobal.env.OPENAI_API_KEY,
              baseURL: "http://localhost:8000/v1" // http://localhost:11434/v1
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

            // syspromt order: `.../src/orchestrate/select.ts` is used... (idk why not `initialize.ts`)
            //    COMMON -> <TOOL_CALLS(history) & TOOL> -> <USER INP> -> SELECT(problematic)
            
            // hardcoded prompt orders & structure, CANNOT change -> Modding needed
            // @ agentica/packages/core/src/orchestrate

            systemPrompt: {
              common: () => [
                "The user's choice of language is \"${locale}\".",
                "The user's timezone is: \"${timezone}\".",
                "There will be an example of the default function you can call.",
              ].join("\n"),
              // describe: () => "",
              // select: () => [
              //   "Use available tools to pick appropriate functions.",
              //   "Check dependencies between functions before selecting.",
              //   "If no suitable function exists, just respond to the user.",
              //   "But do not reply to the user in JSON or a dictionary format, use human language to answer the user's question.",
              // ].join("\n"),
              // execute: () => "",
              // initialize: () => "",
              // cancel: () => "",
            },

            executor: {
              select: ollamaSelect,
              call: ollamaCall,
            },

            // enable Chain of Thought reasoning
            // (only for ollama's COT supported models)
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
