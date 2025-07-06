inst.

```bash
pnpm install
pnpm --filter @agentica/core build
pnpm --filter @agentica/rpc build
pnpm build
pnpm start

# full rebuild
pnpm --filter @agentica/core --filter @agentica/rpc build && pnpm build && pnpm start
```

### Changes

`systemPrompt` accepts `${env vars}` (not just for defaults in `AgenticaSystemPrompt`)

(for testing) requests go through shims for testing raw requests and responses to LLm.

`Modelfile` changes for tool calling improvements (ollama)

`__IChatSelectFunctionsApplication` JSDoc changes for `selectFunctions` prompt changes (typo)

added `think` option to `AgenticaRequestEvent` (`Agentica` /core class)

### Notes

### todo

add local model(Ollama) option to `LlmSchema.Model` and such.