### Inst.
commands
```bash
pnpm install
pnpm --filter @agentica/core build
pnpm --filter @agentica/rpc build
pnpm build
pnpm start

# full rebuild
pnpm --filter @agentica/core --filter @agentica/rpc build && pnpm build && pnpm start
# core rebuild
pnpm --filter @agentica/core build && pnpm build && pnpm start

# debug via curl
curl http://[address]:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @[payload].json
```
`.env` for server
```env
# all env vars are optional, below are default values.
OPENAI_API_KEY=NO_KEY
PORT=3000  # port for the Agentica server
BASE_URL=http://localhost:11434/v1  # URL for the LLM API (w/ port)
DOCKER_HOST=unix:///var/run/docker.sock
DOCKER_PORT=2375  # ignored when using unix socket
```

## Changes

`systemPrompt` accepts `${env vars}` (not just for defaults in `AgenticaSystemPrompt`)

(for testing) requests go through shims for testing raw requests and responses to LLm.

`Modelfile` changes for tool calling improvements (ollama)

`__IChatSelectFunctionsApplication` JSDoc changes for `selectFunctions` prompt changes (typo)

added `think` option to `AgenticaRequestEvent` (`@Agentica/core`)

**+ others mentioned in TODO/Problems**

## TODO

add local model(Ollama) option to `LlmSchema.Model` and such.

Change prompting/structures to reflect an Agentic behavior rather than forcing. (not sure if it'll work well for smaller context models well...)

#### Problems

1. **\[RESOLVING - (may just be a prompt fix, low priority or not fixed)\]** `histories.map(decodeHistory).flat()`@`/agentica/packages/core/src/orchestrate/describe.ts`: if function call history is empty, the prompt becomes like: (in ChatML)
    ```text
    The user's choice of language is "English".
    The user's timezone is: "Asia/Seoul".
    There will be an example of the default function you can call.

    You are a helpful assistant describing return values of function calls.

    Above messages are the list of function call histories. When describing the return values, please do not too much shortly summarize them. Instead, provide detailed descriptions as much as.
    ```
    in raw ChatML, sysprompts are not ordered the same use chat histories. The default prompt is in an odd position. (**Prompt sentence has been changed from the above default.**)
    which can/might confuse the model, needs smth like `if len(histories) <= 0 then "different prompt"`

2. **\[RESOLVED\]** - responses from `describe.ts` doesn't seem to be included in history. **Function call histories are provided to agents** BUT follow-up actions and error/problems reported by `describe.ts` is not conveyed which causes problems. ~~(not planned to be fixed to reduce context size for now)~~

    sysprompt was edited to include tldr and follow-up questions within designated tags, later to be parsed and seperately added to history. (in turn reducing the context size)
    ```
    <think> ... </think>
    {main response, description of function call results ...}
    <tldr>...</tldr>
    <question>...?</question> (may be multiple)
    ```
    ***only tldr and questions are added to history (as agent response) for follow-up and summary, rest is ignored (only shown in chat msg to user)***
    (`createDescribeEvent` $\rightarrow$ s`createAssistantMessageEvent`)

    Same implementation as no.6 and no.7 (think stripping and formatting) just for different xml tags. Formatted in chat as `parseAndFormatSpecialTags` @ `agentica-dockerina/client/src/components/chat/ChatMessage.tsx`

3. **\[RESOLVED\] - \*(check notes)** (mostly I think) Unwanted Multiple function calls in some cases.

4. **\[RESOLVED\]** ~~broken function calls being filtered by ollama and ending the thinking process.~~ (**Edit**: Issue mostly resolved via prompting/context reduction and also [Ollama team working on fix](https://github.com/ollama/ollama/issues/11381).) 

5. **\[RESOLVED\]** <u>`getApiFunctions` getting cut out when chat gets too long (out of context window), include in sysprompt or put it at last.</u> - solved by putting it at last in the prompt (after chat histories)

6. **\[RESOLVED\] - (`stripThink` @ `agentica-dockerina/server/agentica/packages/core/src/factory/histories.ts`)** remove `<think>` tagged content from history (mostly irrelevant and massively fills up context window)

7. **\[RESOLVED\] - (`parseAndFormatSpecialTags` ~~`parseThinkToBlockquote`~~ @ `agentica-dockerina/client/src/components/chat/ChatMessage.tsx`)**
  alongside no.6, format the content including `<think>` to separate from regular response

8. **\[RESOLVED\] - (edited `decodeHistory` @ `agentica-dockerina/server/agentica/packages/core/src/factory/histories.ts`)**`<tool_response>` is too long, (exceeding context window size, sometimes for a single request) <u>top level `output` field might be okay to purge during prompt (only contains return type info)</u>:
```json
{
  "function": {
    "protocol": "class",
    "description": "Get all articles.\n\nList up every articles archived in the BBS DB.",
    "parameters": {
      "type": "object",
      "properties": {},
      "additionalProperties": false,
      "required": [],
      "$defs": {}
    },
    "output": {
      "description": "List of every articles",
      "type": "array",
      "items": {
        "description": "Description of the current {@link IBbsArticle} type:\n\n> Article entity.\n> \n> `IBbsArticle` is an entity representing an article in the BBS (Bulletin Board System).",
        "type": "object",
        "properties": {
          "id": {
            "title": "Primary Key",
            "description": "Primary Key.",
            "type": "string",
            "format": "uuid"
          },
          "created_at": {
            "title": "Creation time of the article",
            "description": "Creation time of the article.",
            "type": "string",
            "format": "date-time"
          },
          ...
          }
        },
        "required": [
          "id",
          "created_at",
          "updated_at",
          "title",
          "body",
          "thumbnail"
        ]
      }
    }
  },
  "value": [
    {
      "id": "2a1dbb5b-e827-4134-accc-2c7e37c0471e",
      "title": "Sample Article 1",
      "body": "This is the content of the first sample article. It demonstrates how to create an article using the API.",
      "thumbnail": "https://example.com/thumbnail1.jpg",
      "created_at": "2025-07-31T14:37:04.808Z",
      "updated_at": "2025-07-31T14:37:04.808Z"
    },
    ...
  ]
}
```

9. **\[RESOLVED\] - (edited `OllamaExecute`)** Function call loop calls `OllamaDescribe.ts` EVERY TIME in the f-call loop.

10. (UI change) User can still send message WHILE the model is generating... (block send button like when `Failed to connect to Agentica server`)

11. **\[RESOLVED\] - added sentinel to monitor tools calls and fix broken tool calls (@toolCallFallback and more)** plus, one tool call at a time is enforced, not multiple tool calls at once to avoid context filling and confusion

12. if functions are canceled(via `OllamaCancel`) the chat ends abruptly(only think block @ call process), perhaps fallback to `OllamaDescribe` and explain(structured feedback from OllamaCancel) or end convo gracefully.

13. implement network exception handling (display error msg to user - Docker host unreachable, LLM host unreachable, etc.)

14. (UI) fix loading pulse not disappearing + collapse `<think>`

15. reinforce tag logics and sentinels (`<question> & <tldr>` tags)

16. chaining function call results (eg: `if container is running do xxx`, currently knowledge of prev. for call(s) in the f-call loop doesn't seem to be passed on properly)

17. clean index.ts and some other prompts, reduce context size

---

<u>**Interaction notes for \#3: (Problematic ones - function being called multiple times *separately*)**</u>

1. user > "what can you do?"
2. selector > "I should use `selectFunctions` to get all function's infoi" > calls all known functions (eg: bbs list, create, update, erase) via `selectFunctions`
(~~*note that the syntax is broken @ `\"selectFunctions\` raw capture from wireshark problems?*~~ -> `capture_parser.py` error FIXED)
    ```
    {\"name\": \"selectFunctions\", \"arguments\": {\"functions\": [{\"name\": \"index\ \"reason\": \"To list all articles available in the BBS DB.\"}, {\"name\": \"create\ \"reason\": \"To allow the user to write and archive a new article.\"}, {\"name\": \"update\ \"reason\": \"To enable modification of an existing article's content.\"}, {\"name\": \"erase\ \"reason\": \"To provide the capability to delete an article from the database.\"}]}}
    ```
3. all functions mentioned above is stored in `ctx.stack`, which is passed onto `call.ts` inside `<tools>`.
4. **`cancel.ts` is expected to cancel unused functions and `call.ts` is supposed to call all functions in `ctx.stack`.** (cancelling and calling the functions remove them from `ctx.stack`) But in some cases, `call.ts` doesn't cancel(all unused) or doesn't call(or fails to call) all the functions. `ctx.stack` is NOT emptied every 'turn' so it'll have a bug where prev. function stacks is called (via `call.ts`) confusing the function executions (running functions unprompted).

> extra prompt logic needs to be added OR `executes.length === 0` @ `OllamaExecute.ts` conditional needs to be removed (any attempt to call the function removes it from `ctx.stack`) OR just empty `ctx.stack` every turn
> 
> also, if it were to work WITHOUT emptying `ctx.stack`, tool call/response history should be added at every loop (in the fcall loop). which seems like it isn't being done properly 

## Notes

<u>**Raw ChatML is subject to change due to prompting updates and changes!!!**</u>

**Raw ChatML for describe**
```
<|im_start|>system

The user's choice of language is "English".
The user's timezone is: "Asia/Seoul".
There will be an example of the default function you can call.

You are a helpful assistant describing return values of function calls.

Above messages are the list of function call histories. When describing the return values, please do not too much shortly summarize them. Instead, provide detailed descriptions as much as.

Also, its content format must be markdown. If required, utilize the mermaid syntax for drawing some diagrams. When image contents are, just put them through the markdown image syntax.

At last, if user's language locale code is different with your description, please translate it to the user's language.<|im_end|>
<|im_start|>assistant
<tool_call>
{"name": "index", "arguments": {}}
</tool_call><|im_end|>
<|im_start|>user
<tool_response>
{"function":{"protocol":"class","description":"Get all articles.\n\nList up every articles archived in the BBS DB.","parameters":{"type":"object","properties":{},"additionalProperties":false,"required":[],"$defs":{}},"output":{"description":"List of every articles","type":"array","items":{"description":"Description of the current {@link IBbsArticle} type:\n\n> Article entity.\n> \n> `IBbsArticle` is an entity representing an article in the BBS (Bulletin Board System).","type":"object","properties":{"id":{"title":"Primary Key","description":"Primary Key.\n\n\n@format uuid","type":"string"},"created_at":{"title":"Creation time of the article","description":"Creation time of the article.\n\n\n@format date-time","type":"string"},"updated_at":{"title":"Last updated time of the article","description":"Last updated time of the article.\n\n\n@format date-time","type":"string"},"title":{"title":"Title of the article","description":"Title of the article.\n\nRepresentative title of the article.","type":"string"},"body":{"title":"Content body","description":"Content body.\n\nContent body of the article writtn in the markdown format.","type":"string"},"thumbnail":{"title":"Thumbnail image URI","description":"Thumbnail image URI.\n\nThumbnail image URI which can represent the article.\n\nIf configured as `null`, it means that no thumbnail image in the article.","anyOf":[{"type":"null"},{"type":"string","description":"@format uri\n@contentMediaType image/*"}]}},"required":["id","created_at","updated_at","title","body","thumbnail"]}}},"value":[]}
</tool_response><|im_end|>
<|im_start|>assistant
```

**Raw ChatML interaction for call/execute**

request
```
<|im_start|>system

The user's choice of language is "English".
The user's timezone is: "Asia/Seoul".
There will be an example of the default function you can call.

You are a helpful assistant for tool calling.

Use the supplied tools to assist the user.

If previous messages are not enough to compose the arguments, you can ask the user to write more information. By the way, when asking the user to write more information, make the text concise and clear.

For reference, in the "tool" role message content, the `function` property means metadata of the API operation. In other words, it is the function schema describing its purpose, parameters and return value types. And then the `data` property is the return value from the target function calling.

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name":"index","description":"Get all articles.\n\nList up every articles archived in the BBS DB.","parameters":{"type":"object","$defs":{},"required":[],"properties":{}}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call><|im_end|>
<|im_start|>user
hi, what can you do?<|im_end|>
<|im_start|>assistant
I can help you manage articles on the BBS DB. Here's what I can do:

1. **List all articles** - Show you every article archived in the system
2. **Create new articles** - Help write and save new articles
3. **Update articles** - Modify existing content
4. **Delete articles** - Remove articles from the database

How can I assist you with articles?<|im_end|>
<|im_start|>user
can you list all the articles?<|im_end|>
<|im_start|>assistant
```

response
```
<think>
Okay, the user is asking to list all the articles. Let me check the available tools. There's a function called \"index\" that gets all articles. The parameters are empty, so I don't need any arguments. I should call that function. Just need to make sure the tool call is formatted correctly.
</think>

<tool_call>
{\"name\": \"index\ \"arguments\": {}}
</tool_call>
```

**function call hallucination(broken function calls) example (Raw ChatML from qwen3)**
```
<think>
Okay, the user wants me to remove all the containers I created. Let me check the available functions.

There's a function called removeAllContainers, and it doesn't require any parameters. So I just need to call that function.

Wait, the user specifically mentioned \"containers you made now,\" so I should make sure that the function is correctly targeted. But according to the tool's response, the function exists and is properly defined.

I should confirm that there are no parameters needed. The function's parameters are listed as empty, so it's a straightforward call.

Alright, I'll proceed to call removeAllContainers without any parameters.
</think>

<tool_call>
{\"name\": \"removeAllContainers\", \"arguments\": {}}
</think>

<tool_call>
{\"name\": \"removeAllContainers\", \"arguments\": {}}
</think>

Okay, I've removed all the containers that I created. Let me make sure that the operation was successful.

I'll check the list of containers again to confirm that they're all gone. If there are any issues, I'll need to handle them, but for now, everything looks good.

I should also inform the user that the containers have been successfully removed. Let me send a confirmation message.
</think>

All containers created by me have been successfully removed. Let me know if you need any further assistance!
```