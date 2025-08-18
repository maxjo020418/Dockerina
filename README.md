Dockerina
===

Agentica, now with Ollama and Docker

[extra docs and changelogs here](./agentica-dockerina/server/README.md)

## Repository layout

- `agentica-dockerina/` - scripts to build and run containers (build.sh, run.sh, stop.sh)
    - ***NOTE:** `server` & `client` is based on the Agentica framework's basic setup*
    - `client/` - frontend source and build files
    - `server/` - backend source and package configuration
        - `agentica` - somewhat modded Agentica framework (git subtree)
- `agentica-shim/` - shim utilities (used for dev/debug)
- `LLM-tests` - LLM modelfiles and ChatML tests (used for dev/debug)

```
.
├── LLM-tests
│   └── debug_capture (not tracked)
├── agentica-dockerina
│   ├── client
│   │   ├── dist
│   │   ├── node_modules
│   │   ├── public
│   │   └── src
│   └── server
│       ├── agentica
│       ├── build
│       ├── lib
│       ├── node_modules
│       └── src
└── agentica-shim
    └── logs (not tracked)
```

## Prerequisites

- Docker (required for container scripts)
- Node.js (run or build `server` and `client`)
- pnpm (package manager)
- Ollama (if using local models)

Docker, Ollama host can be on a different machine

### regarding LLMs
- For 3rd parties, tested on OpenAI's `gpt-4o` series (should work for OpenAI's v1 API scheme)
- For Ollama, (COT - 'Chain Of Thought' models are compatible)
    - qwen3 (14b model best overall)
    - gpt-oss (smallest 20b model, still slow)
    - llama3.1

Recommended settings are:
- $\ge$ 12b parameters (8b has some trouble)
- $\ge$ 8k context size (4k works too but 8k is recommended)
- lower temp (for function call hallucination prevention if needed)

### system

tested on: `WSL Ubuntu 24.04`, `Kubuntu(Ubuntu) 25.04`

- x86_64 6-core CPU (5600x)
- 64GB RAM
- 12GB VRAM (4070)

## Quick start

1. Build and run Dockerina:

```bash
cd agentica-dockerina
./build.sh
./run.sh
```

2. Stop Dockerina:

```bash
./stop.sh
```

note that this will run/stop both the server and the frontend client

<details>
<summary>Optional: manual build/start</summary>

Run the server:

```bash
cd server
pnpm install
pnpm --filter @agentica/core build
pnpm --filter @agentica/rpc build
pnpm build
pnpm start
```

Run the client:

```bash
cd client
pnpm install
pnpm build
pnpm start
```

</details>

## Logs

Runtime logs are captured and stored under `agentica-shim/logs/`(not tracked by repo, need to create one) as JSON files.

not that it only works when it's using with the shim(`agentica-shim/shim.py`) to capture raw requests
