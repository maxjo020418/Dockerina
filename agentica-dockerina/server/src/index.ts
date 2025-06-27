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

  // "chatgpt" | "claude" | "deepseek" | "gemini" | "llama" | "3.0" | "3.1"
  type ModelType = Extract<ILlmSchema.Model, "llama">;
  const modeltype: ModelType = "llama";

  const server: WebSocketServer<
    null,
    IAgenticaRpcService<ModelType>,
    IAgenticaRpcListener
  > = new WebSocketServer();
  await server.open(Number(SGlobal.env.PORT), async (acceptor) => {
    const url: URL = new URL(`http://localhost${acceptor.path}`);
    const agent: Agentica<ModelType> = new Agentica({
      model: modeltype,
      vendor: {
        api: new OpenAI({ 
          apiKey: SGlobal.env.OPENAI_API_KEY,
          baseURL: "http://localhost:8000/v1"
        }),
        model: "llama3.1:8b" // local-ollama
        //model: "gpt-4o-mini" // chatgpt
      },
      config: {
        // just inserted into prompt, don't need to specify BCP 47 format
        // only used in AgenticaSystemPrompt.COMMON
        locale: "English",
        // timezone: "",

        // syspromt order: `.../src/orchestrate/select.ts` is used... (idk why not `initialize.ts`)
        //    COMMON -> <TOOL_CALLS(history) & TOOL> -> <USER INP> -> SELECT(problematic)
        // hardcoded prompt orders, CANNOT change

        systemPrompt: {
          common: () => [
            "The user's choice of language is ${locale}, remember this and communicate in that language.",
            "The user is in the timezone: ${timezone}, consider this when communicating."
          ].join(" "),
          //describe: () => "",
          select: () => "", // hmmm
          //execute: () => "",
          //initialize: () => "",
          //cancel: () => "",
        }
      },
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
    });
    const service: AgenticaRpcService<ModelType> = new AgenticaRpcService({
      agent,
      listener: acceptor.getDriver(),
    });
    await acceptor.accept(service);
  });
};
main().catch(console.error);
