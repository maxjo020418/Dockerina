### Inst.

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
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @[payload].json
```

## Changes

`systemPrompt` accepts `${env vars}` (not just for defaults in `AgenticaSystemPrompt`)

(for testing) requests go through shims for testing raw requests and responses to LLm.

`Modelfile` changes for tool calling improvements (ollama)

`__IChatSelectFunctionsApplication` JSDoc changes for `selectFunctions` prompt changes (typo)

added `think` option to `AgenticaRequestEvent` (`@Agentica/core`)

## TODO

add local model(Ollama) option to `LlmSchema.Model` and such.

Change prompting/structures to reflect an Agentic behavior rather than forcing. (not sure if it'll work well for smaller context models well...)

### Problems

1. **\[RESOLVING - (may just be a prompt fix.)\]** `histories.map(decodeHistory).flat()`@`/agentica/packages/core/src/orchestrate/describe.ts`: if function call history is empty, the prompt becomes like: (in ChatML)
    ```text
    The user's choice of language is "English".
    The user's timezone is: "Asia/Seoul".
    There will be an example of the default function you can call.

    You are a helpful assistant describing return values of function calls.

    Above messages are the list of function call histories. When describing the return values, please do not too much shortly summarize them. Instead, provide detailed descriptions as much as.
    ```
    in raw ChatML, sysprompts are not ordered the same use chat histories. The default prompt is in an odd position. (**Prompt sentence has been changed from the above default.**)
    which can/might confuse the model, needs smth like `if len(histories) <= 0 then "different prompt"`

2. responses from `describe.ts` doesn't seem to be included in history. **Function call histories are provided to agents** BUT follow-up actions and error/problems reported by `describe.ts` is not conveyed which causes problems.

3. **\*\(check notes)[RESOLVED\]** (mostly I think) Multiple function calls in some cases.

3. **\[RESOLVED\]** ~~broken function calls being filtered by ollama and ending the thinking process.~~ (**Edit**: Issue mostly resolved and also Ollama team working on fix.) 

4. **\[RESOLVED\]** <u>`getApiFunctions` getting cut out when chat gets too long (out of context window), include in sysprompt or put it at last.</u>

<u>**Interaction notes for \#3: (Problematic ones - function being called multiple times)**</u>

1. user > "what can you do?"
2. selector > "I should use `selectFunctions` to get all function's infoi" > calls all known functions (eg: bbs list, create, update, erase) via `selectFunctions`
(~~*note that the syntax is broken @ `\"selectFunctions\` raw capture from wireshark problems?*~~ -> `capture_parser.py` error FIXED)
    ```
    {\"name\": \"selectFunctions\", \"arguments\": {\"functions\": [{\"name\": \"index\ \"reason\": \"To list all articles available in the BBS DB.\"}, {\"name\": \"create\ \"reason\": \"To allow the user to write and archive a new article.\"}, {\"name\": \"update\ \"reason\": \"To enable modification of an existing article's content.\"}, {\"name\": \"erase\ \"reason\": \"To provide the capability to delete an article from the database.\"}]}}
    ```
3. all functions mentioned above is stored in `ctx.stack`, which is passed onto `call.ts` inside `<tools>`.
4. **`cancel.ts` is expected to cancel unused functions and `call.ts` is supposed to call all functions in `ctx.stack`.** (cancelling and calling the functions remove them from `ctx.stack`) But in some cases, `call.ts` doesn't cancel(all unused) or doesn't call(or fails to call) all the functions. `ctx.stack` is NOT emptied every 'turn' so it'll have a bug where prev. function stacks is called (via `call.ts`) confusing the function executions (running functions unprompted).

> extra prompt logic needs to be added OR `executes.length === 0` @ `OllamaExecute.ts` conditional needs to be removed (any attempt to call the function removes it from `ctx.stack`) OR just empty `ctx.stack` every turn

> also, if it were to work WITHOUT emptying `ctx.stack`, tool call/response history should be added at every loop (in the fcall loop). which seems like it isn't being done properly 

## Notes

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