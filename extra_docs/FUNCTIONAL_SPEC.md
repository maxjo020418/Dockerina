# Dockerina Functional Specification (Draft)

## 1. Scope and Objectives
- Define the functional surface of Dockerina, Wrtn's Agentica-based orchestration layer that lets LLM agents manage Docker workloads through custom tool controllers.
- Document the execution environment required to exercise the features in automated or manual verification setups.
- Capture the current feature set, highlight partially implemented areas, and outline near-term functional enhancements.
- Provide a test matrix that can evolve into formal acceptance and regression suites.

## 2. Test Environment Setup (Test 환경 정보)
### 2.1 Core stack
- Host OS: Linux (validated on WSL Ubuntu 24.04 and Kubuntu 25.04); aim to keep parity with production target.
- Node.js: >= 20.x (TypeScript compilation uses `@types/node@22` but runtime tested on Node 20/22). Package manager pinned to `pnpm 10.14.0` (`server/package.json`).
- Docker: Engine API v1.41+ with socket or TCP exposure. Ensure the test user belongs to the `docker` group when using the UNIX socket (`src/services/DockerodeService.ts:24`).
- Ollama server or OpenAI-compatible endpoint accessible at `BASE_URL`. Local models such as `qwen3:14b`, `gpt-oss`, or remote OpenAI GPT series were used during development (`agentica-dockerina/server/README.md`).
- Optional debugging shim (`agentica-shim/`) for capturing raw LLM traffic.

### 2.2 Environment variables
| Variable | Purpose | Default | Required for automated tests | Notes |
| --- | --- | --- | --- | --- |
| `OPENAI_API_KEY` | Token for OpenAI-compatible vendor | `NO_KEY` | Yes (use a fake key if gateway ignores it) | Needed even when BASE_URL points to Ollama (`server/src/index.ts:85`). |
| `BASE_URL` | LLM REST endpoint | `http://localhost:11434/v1` | Yes | Switch to shim (`http://localhost:8000/v1`) or remote hosts as needed. |
| `MODEL` | Model identifier passed to Agentica | `qwen3:14b` | Yes | Must align with the orchestrator's schema; currently hard-coded to `chatgpt` type (`server/src/index.ts:61`). |
| `PORT` | Agentica WebSocket server port | `3000` | Optional | Coordinate with client configuration. |
| `DOCKER_HOST` | Dockerode connection string | `unix:///var/run/docker.sock` | Yes | Support for TCP hosts (`tcp://host:port`). |
| `DOCKER_PORT` | Docker TCP port | `2375` | When using TCP | Ignored for UNIX sockets. |

### 2.3 External services and fixtures
- **LLM access**: Provide deterministic prompts by pinning temperature to low values when testing reproducibility (currently TODO in config, `server/src/index.ts:142`).
- **Docker fixtures**: Prepare lightweight containers/images to exercise lifecycle functions (e.g., `hello-world`, `nginx`, dummy containers prefixed with `Dockerina-`).
- **Storage**: Persistence for prompt histories is not yet wired (`server/src/index.ts:42`); plan a SQLite or file-based stub for integration testing.

### 2.4 Tooling for tests
- Use `pnpm test` (to be added) or `pnpm start` for manual smoke tests.
- Consider `vitest`/`jest` for unit tests and `supertest` or `ws` for WebSocket integration once test scaffolding exists.
- CLI helpers: `agentica-dockerina/run.sh` spins up server+client; `agentica-shim/shim.py` captures HTTP traces during LLM interactions.

## 3. Functional Breakdown (기능 리스트)
Tables list 기능 대분류 → 중분류 → 소분류 with current status.

### 3.1 Agent Session & RPC Layer
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| Agent Session & RPC | Server bootstrap | WebSocket server startup | Boot Agentica RPC server, bind `AgenticaRpcService` to incoming connections. | Implemented | `agentica-dockerina/server/src/index.ts:67` |
| Agent Session & RPC | Session lifecycle | Vendor/client handshake | Parse connection URL, instantiate `Agentica` instance per socket. | Implemented | `agentica-dockerina/server/src/index.ts:73` |
| Agent Session & RPC | Session lifecycle | Agent service binding | Accept RPC service driver and dispatch events. | Implemented | `agentica-dockerina/server/src/index.ts:108` |
| Agent Session & RPC | History management | Fetch persisted prompt histories | Retrieve conversation history by session id. | Not implemented | Stub returns empty array (`agentica-dockerina/server/src/index.ts:42`) |
| Agent Session & RPC | Security & governance | Authentication/authorization checks | Gate tool access and socket connections. | Not implemented | Needs design (gateway currently open). |

### 3.2 LLM Orchestration
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| LLM Orchestration | Execution pipeline | `ollamaExecute` wrapper | Custom executor serialises tool calls, orchestrates select→call→cancel→describe. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaExecute.ts` |
| LLM Orchestration | Function selection | `ollamaSelect` | Prompt LLM to choose functions via `selectFunctions`. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaSelect.ts` |
| LLM Orchestration | Function execution | `ollamaCall` | Route tool invocations, apply fallback parsers for raw tool calls. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaCall.ts` |
| LLM Orchestration | Function cancellation | `ollamaCancel` | Request removal of unused functions from stack. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaCancel.ts` |
| LLM Orchestration | Result narration | `ollamaDescribe` | Generate post-call description, enforce TLDR/question formatting. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaDescribe.ts` |
| LLM Orchestration | Fallback & validation | Tool-call JSON recovery | Parse `<think>` blocks and raw JSON when tool calls omitted. | Implemented | `agentica-dockerina/server/src/utils/toolCallFallback.ts` |
| LLM Orchestration | Model coverage | Alternate schema support (`claude`, `llama`, etc.) | Extend Agentica config beyond `chatgpt` extract. | Not implemented | Hard-coded `ModelType = "chatgpt"` (`agentica-dockerina/server/src/index.ts:61`). |

### 3.3 Docker Control Service
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| Docker Control | Discovery & metadata | List containers | Return running/stopped containers with simplified fields. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:52` |
| Docker Control | Discovery & metadata | List images | Return local images with repo tags. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:88` |
| Docker Control | Discovery & metadata | Inspect container | Provide curated inspect payload. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:112` |
| Docker Control | Diagnostics | Get stdout logs | Fetch recent stdout tail. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:157` |
| Docker Control | Diagnostics | Get stderr logs | Fetch recent stderr tail. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:137` |
| Docker Control | Diagnostics | Get stats snapshot | Return CPU/memory stats. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:179` |
| Docker Control | Lifecycle | Start container | Start container by id. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:196` |
| Docker Control | Lifecycle | Stop container | Stop container by id. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:211` |
| Docker Control | Lifecycle | Restart container | Restart container by id. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:235` |
| Docker Control | Lifecycle | Remove container | Delete container by id. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:338` |
| Docker Control | Lifecycle | Stop Dockerina-owned containers | Gracefully stop containers with `Dockerina-` prefix. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:368` |
| Docker Control | Lifecycle | Remove Dockerina-owned containers | Stop+remove prefixed containers. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:399` |
| Docker Control | Provisioning | Run container | Create and start a container with optional env/ports. | Implemented | `agentica-dockerina/server/src/services/DockerodeService.ts:238` |
| Docker Control | Provisioning | Exec command | Execute command inside container, multiplex output. | Implemented (buggy) | Await missing on `finished` promise; risk of unhandled rejection (`agentica-dockerina/server/src/services/DockerodeService.ts:488`). |
| Docker Control | Image management | Pull/push, prune, tag management | Manage image lifecycle beyond listing. | Not implemented | Candidate feature for expanded tooling. |

### 3.4 Observability & Diagnostics
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| Observability | HTTP tracing | Fetch interception | Optional logging of HTTP requests/responses via global fetch hook. | Implemented | `agentica-dockerina/server/src/utils/httpLogger.ts` |
| Observability | Tool telemetry | Structured tool-call logging | Console-level logging of stack state around execution. | Implemented | `agentica-dockerina/server/src/OllamaOrchestrate/OllamaExecute.ts:24` |
| Observability | Monitoring | Metrics export / health endpoints | Expose service health and metrics. | Not implemented | Add HTTP health probe and metrics (Prometheus). |

### 3.5 Configuration & Governance
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| Configuration & Governance | Environment loader | `.env` ingestion with `dotenv-expand` | Provide runtime configuration defaults and validation. | Implemented | `agentica-dockerina/server/src/SGlobal.ts` |
| Configuration & Governance | Runtime toggles | Serialized call execution | Config flag to run tools sequentially. | Implemented | `agentica-dockerina/server/src/index.ts:128` + `OllamaExecute` |
| Configuration & Governance | Access control | Role/tenant enforcement for Docker tools | Introduce RBAC/API key gating. | Not implemented | Needed before multi-tenant exposure. |
| Configuration & Governance | Audit logging | Persisted audit trail of tool usage | Capture tool invocation history. | Not implemented | Pair with prompt history persistence. |

### 3.6 Ancillary Services
| 대분류 | 중분류 | 소분류 | Description | Status | Implementation Notes |
| --- | --- | --- | --- | --- | --- |
| Ancillary Services | Sample service | BBS article CRUD | Reference controller for CRUD operations. | Dormant | Service exists but not registered (`agentica-dockerina/server/src/services/BbsArticleService.ts`). |
| Ancillary Services | Frontend client | Chat UI orchestration | React/Next client handling conversation UI. | Implemented (out of scope) | `agentica-dockerina/client/` (needs separate spec). |

## 4. Functional Test Matrix (기능 시험 항목)
Tests inherit the 대분류/중분류/소분류 hierarchy. `Status` tracks readiness of test procedure, not feature itself.

### 4.1 Agent Session & RPC Tests
| Test ID | Target (소분류) | Objective | High-level Steps | Expected Result | Status |
| --- | --- | --- | --- | --- | --- |
| AS-01 | WebSocket server startup | Verify server listens on configured port. | Start server with test `.env`; connect via `ws://localhost:PORT`. | Connection accepted, handshake logs emitted. | Ready |
| AS-02 | Vendor/client handshake | Ensure Agentica instantiates per session. | Attach spy to `AgenticaRpcService`; initiate client request. | Agent instance created with configured model/vendor. | Ready |
| AS-03 | Fetch persisted prompt histories | Confirm history retrieval populates sessions. | Seed history store; connect with `/session-id`. | Histories appended to context before select stage. | Blocked (feature missing) |
| AS-04 | Authentication/authorization | Reject unauthorized connections. | Attempt connection without token once feature exists. | Socket refused or downgraded privileges. | Not designed |

### 4.2 LLM Orchestration Tests
| Test ID | Target (소분류) | Objective | High-level Steps | Expected Result | Status |
| --- | --- | --- | --- | --- | --- |
| LO-01 | `ollamaSelect` | Ensure function selection returns valid stack. | Provide prompt with available Docker tools. | Stack contains candidate operations aligned with prompt. | Ready |
| LO-02 | `ollamaCall` | Validate tool invocation and fallback parsers. | Simulate LLM tool call with JSON and plain-text fallback. | Correct call events dispatched, stack cleaned. | Ready |
| LO-03 | `ollamaCancel` | Confirm unused functions are cancelled. | Force multiple select results with one needed. | Unused functions removed from stack. | Ready |
| LO-04 | `ollamaDescribe` | Check TLDR/question formatting. | Provide mock execute histories. | Response contains markdown + `<tldr>` + `<question>`. | Ready |
| LO-05 | Alternate schema support | Regression when adding non-`chatgpt` models. | Expand `ModelType`; run orchestrator. | Selection/call flows succeed for new schema. | Not started |

### 4.3 Docker Control Tests
| Test ID | Target (소분류) | Objective | High-level Steps | Expected Result | Status |
| --- | --- | --- | --- | --- | --- |
| DC-01 | List containers | Validate response shape for running/stopped containers. | Spin up fixture containers; call tool. | Returns array with expected fields and IDs. | Ready |
| DC-02 | Inspect container | Confirm inspect payload trimmed correctly. | Inspect known container. | Response contains curated `State`, `Config`, `NetworkSettings`, `Mounts`. | Ready |
| DC-03 | Get logs (stdout/stderr) | Ensure log tail retrieved. | Generate logs; invoke tools. | Buffers returned with UTF-8 content. | Ready |
| DC-04 | Run container | Create container with env/port mapping. | Call `runContainer` with parameters. | Container created with `Dockerina-` prefix and started. | Ready |
| DC-05 | Exec command | Execute command and capture output. | Run `execContainer` with `echo`. | Exit code and captured stdout/stderr recorded. | Blocked (await bug fix) |
| DC-06 | Stop/remove Dockerina containers | Cleanup prefixed containers. | Create two fixtures; call stop/remove all. | Containers stopped/removed; console logs confirm. | Ready |
| DC-07 | Image management extension | Pull/prune flows. | After implementing features, run docker image ops. | Images pulled/pruned; status reported. | Not started |

### 4.4 Observability Tests
| Test ID | Target (소분류) | Objective | High-level Steps | Expected Result | Status |
| --- | --- | --- | --- | --- | --- |
| OB-01 | HTTP logging interceptor | Validate request/response capture. | Enable `ENABLE_HTTP_LOGGING`; trigger LLM call. | Logs contain fetch request/response metadata. | Ready |
| OB-02 | Tool telemetry logs | Ensure stack logging occurs. | Invoke simple tool call. | Console shows stack before/after execution. | Ready |
| OB-03 | Health endpoint | Verify service health exposure. | After feature built, curl health route. | Returns 200 + service stats. | Not started |

### 4.5 Configuration & Governance Tests
| Test ID | Target (소분류) | Objective | High-level Steps | Expected Result | Status |
| --- | --- | --- | --- | --- | --- |
| CG-01 | Environment loader | Confirm `.env` overrides and validation. | Provide partial `.env`; start server. | Defaults applied, invalid values rejected. | Ready |
| CG-02 | Serialized call toggle | Verify `serializeCalls` gating. | Toggle config and simulate multi-tool selection. | With true: one call per loop; false: batch call. | Ready |
| CG-03 | Access control | Enforce RBAC/API key once implemented. | Attempt unauthorized tool call. | Access denied, logged. | Not started |
| CG-04 | Audit logging | Persist tool usage trail. | Execute tool; inspect audit sink. | Entry recorded with timestamp/context. | Not started |

## 5. Gap Analysis & Recommendations
- **Persist conversation histories**: Implement backing store for `getPromptHistories` (`agentica-dockerina/server/src/index.ts:42`). Consider SQLite or Postgres with TTL to enable context continuity and audit trails.
- **Fix `execContainer` stream await**: Await the promise returned by `stream.finished` to avoid silent failures (`agentica-dockerina/server/src/services/DockerodeService.ts:500`). Without `await`, command errors bypass the try/catch.
- **Harden tool-call parsing**: Wrap `JSON.parse` in `ollamaCall` with validation to prevent crashes on malformed arguments (`agentica-dockerina/server/src/OllamaOrchestrate/OllamaCall.ts:60`). Add schema-based coercion via Typia.
- **Broaden model support**: Replace the hard-coded `chatgpt` extract with feature-detected schema support so Ollama-native schemas (`llama`, `deepseek`) can leverage vendor-specific tools (`agentica-dockerina/server/src/index.ts:61`).
- **Security envelope**: Introduce API key checks or mutual auth on the WebSocket server and restrict Docker operations per session (e.g., namespace prefix filters) (`agentica-dockerina/server/src/index.ts:73`).
- **Docker image lifecycle tools**: Add image pull/prune/tag operations and volume/network management to make the agent useful for end-to-end environment provisioning (`agentica-dockerina/server/src/services/DockerodeService.ts`).
- **Health and metrics endpoints**: Expose an HTTP endpoint for readiness/liveness and optional Prometheus metrics to monitor agent uptime and tool usage.
- **Test harness scaffolding**: Add automated tests (unit + integration) to cover tool flows and orchestrator decision points; integrate with CI before shipping production releases.

## 6. Next Steps
1. Address high-priority fixes: prompt history persistence and `execContainer` await issue.
2. Implement missing governance (auth + audit) before exposing Dockerina outside trusted environments.
3. Expand Docker toolset and align LLM prompts/tests accordingly.
4. Backfill automated tests using the provided matrix, starting with Docker service unit tests and orchestration integration tests via mocked LLM responses.
5. Iterate on specification as new features land—treat this document as a living source for acceptance criteria and release checklists.
