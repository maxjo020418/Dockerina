/*
NOTES:
@agentica from separate branch!
*/

import {
  Agentica,
  IAgenticaHistoryJson,
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
import type { ILlmSchema } from "@samchon/openapi/lib/structures/ILlmSchema";

// HTTP logging setup
import { setupFetchInterceptor } from "./utils/httpLogger";

// tools
// import { BbsArticleService } from "./services/BbsArticleService";
import { DockerodeService } from "./services/DockerodeService";

// custom stuffs
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
  // Enable HTTP request logging (optional)
  if (SGlobal.env.ENABLE_HTTP_LOGGING) {
    setupFetchInterceptor();
    console.log("=== HTTP request logging enabled ===");
  } else {
    console.log("=== HTTP request logging disabled ===");
  }

  const BASE_URL: string = SGlobal.env.BASE_URL

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
    SGlobal.env.PORT,
    async (acceptor) => {
      console.log(`New WebSocket connection from ${acceptor.ip} to path: ${acceptor.path}`);

      const url: URL = new URL(`http://localhost${acceptor.path}`);
      console.log(`Parsed URL: ${url.toString()}`);

      const agent: Agentica<ModelType> = new Agentica<ModelType>(
        {
          model: modeltype,
          vendor: {
            api: new OpenAI({
              apiKey: SGlobal.env.OPENAI_API_KEY, // dummy key
              /*
              BASE_URL Ollama server addr.:
              direct call: (DEFAULT)
                http://localhost:11434/v1
              via debug shim:
                http://localhost:8000/v1
              Tailnet(direct):
                http://sylph-wsl.ragdoll-ule.ts.net:11434/v1
              Internal DNS(direct):
                http://sylph.yeongmin.net:11434/v1
              */
              baseURL: BASE_URL,

              // Enable request/response logging
              dangerouslyAllowBrowser: false,
              defaultHeaders: {
                'User-Agent': 'Dockerina-Agentica/1.0.0'

              }
            }),
            model: SGlobal.env.MODEL, // ollama models (NO QWEN3 SCHEMA YET)
            // model: "gpt-4o-mini", "gpt-5-mini" // chatgpt API
          },

            config: {
            // local/TZ is just inserted into prompt, 
            // don't need to comply to specific formats
            // only used for AgenticaSystemPrompt.COMMON
            // ------------------
            locale: SGlobal.env.LANGUAGE,
            // timezone: "", // auto default
            // ------------------

            /* prompting order: `.../src/orchestrate/select.ts` is used... (idk why not `initialize.ts`)
            [Sysprompt gets priority anyways in ChatML, order for 'system' DOES NOT MATTER]
              COMMON -> <TOOL_CALLS(history) & TOOL> -> <USER INP> -> SELECT(problematic)
            
            hardcoded prompt orders & structure, CANNOT change -> Modding needed
            @ agentica/packages/core/src/orchestrate
            */

            systemPrompt: {
              common: () => [
                "The user's choice of language is \"${locale}\", reply in that language.",
                "The user's timezone is: \"${timezone}\".",
              ].join("\n"),

              select: () => [
                "You are a helpful agent that can select functions to call.",
                "If you don't need to or can't use functions, do your best within your abilities."
                // extra instructions in OllamaSelect.ts (inserted into userprompts)
              ].join("\n"),

              execute: () => [  // call.ts
                "You are an agent that call the functions provided.",
                "Prefer calling a tool over answering in prose.",
                "If context lacks info to fill arguments, ask a concise follow-up question.",
              ].join("\n"),

              describe: () => [
                "You are an agent that describes results of function calls.",
                "1) describe the result(s) in detail, use markdown.",
                "2) write the TLDR or summary of above in <tldr></tldr> XML tags.",
                "3) write follow-up question in <question></question> XML tags if needed.",
                "Simple sentences. No questions outside <question>."
              ].join("\n"),

              cancel: () => [
                "You are an agent that cancels functions which are prepared to call. (if needed)",
                "Use the supplied tools to select some functions to cancel of `getApiFunctions()` returned.",
                "If you can't find any proper function to select, don't do anything.",
              ].join("\n"),

              // initialize: () => "",
            },

            executor: ollamaExecute<ModelType>({
              select: ollamaSelect,
              call: ollamaCall,
              cancel: ollamaCancel,
              describe: ollamaDescribe,
            }),

            // [Custom added parameters]
            // Include only when environment variables are set.
            // THINK -> think (boolean), TEMPERATURE -> temperature (number), TOP_P -> top_p (number)
            ...(SGlobal.env.THINK !== undefined ? { think: SGlobal.env.THINK } : {}),
            ...(SGlobal.env.TEMPERATURE !== undefined ? { temperature: SGlobal.env.TEMPERATURE } : {}),
            ...(SGlobal.env.TOP_P !== undefined ? { top_p: SGlobal.env.TOP_P } : {}),

            // Serialized calls: present one tool per turn
            // (warning: prone to errors or premature cancellations)
            serializeCalls: false,
          },

          // le' functions I add
          controllers: [
            /*
            {
              protocol: "class",
              name: "bbs",
              application: typia.llm.application<BbsArticleService, ModelType>(),
              execute: new BbsArticleService(),
            },
            */
            {
              protocol: "class",
              name: "dockerode",
              application: typia.llm.application<DockerodeService, ModelType>(),
              execute: DockerodeService.getInstance(),
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

      console.log(`Created AgenticaRpcService for connection`);
      await acceptor.accept(service);
      console.log(`WebSocket connection accepted and service bound`);
    }
  );

  console.log(`Agentica server started on port ${SGlobal.env.PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Model: ${SGlobal.env.MODEL}`);
  console.log(`Waiting for WebSocket connections...`);
};
main().catch((error) => {
  console.error('Fatal error in main():', error);
  console.error('Stack trace:', error.stack);
  process.exit(1);
});
