# Dockerode Tooling Notes for Dockerina

This document is written for the LLM agent that interacts with the `dockerode`
controller (`DockerodeService`) inside Dockerina.  It describes only the methods
that are actually exposed to you, how their arguments should be shaped, and the
important safety rules to follow while orchestrating Docker workloads.

> The underlying client is [`dockerode`](https://github.com/apocas/dockerode),
> but most low-level options are intentionally hidden.  Stick to the contracts
> presented here unless a maintainer extends the interface.

## Runtime defaults
- Dockerode connects using `DOCKER_HOST`.  A Unix socket such as
  `unix:///var/run/docker.sock` is most common; TCP hosts require `DOCKER_PORT`.
- Every container that you create should be part of the Dockerina namespace:
  `runContainer` automatically prefixes names with `Dockerina-`.
- Avoid long-running `exec` calls.  They are killed after
  `10_000` ms (`EXEC_TIMEOUT_MS`).

## Quick reference
| Method | Description | Key arguments | Returns |
| --- | --- | --- | --- |
| `listContainers()` | Enumerate running and stopped containers. | _none_ | Array of simplified container objects. |
| `listContainerImages()` | List local images available for `runContainer`. | _none_ | Array of image summaries. |
| `inspectContainer({ id })` | Retrieve detailed container metadata. | `id` – container ID. | Simplified inspect payload. |
| `getContainerLogs({ id })` | Fetch recent stdout lines. | `id` – container ID. | Buffer (convert to UTF-8). |
| `getContainerErrorLogs({ id })` | Fetch recent stderr lines. | `id` – container ID. | Buffer (convert to UTF-8). |
| `getContainerStats({ id })` | Snapshot CPU, memory, I/O metrics. | `id` – container ID. | Raw Docker stats JSON. |
| `startContainer({ id })` | Start a stopped container. | `id` – container ID. | `void`. |
| `stopContainer({ id })` | Stop a running container. | `id` – container ID. | `void`. |
| `restartContainer({ id })` | Restart a container (stop, then start). | `id` – container ID. | `void`. |
| `removeContainer({ id })` | Delete a container (must be stopped). | `id` – container ID. | `void`. |
| `runContainer({ image, ... })` | Create and start a new container. | `image`, optional `name`, `command`, `env`, `ports`. | Container handle. |
| `stopAllDockerinaContainers()` | Stop every container whose name starts with `Dockerina-`. | _none_ | `void`. |
| `removeAllDockerinaContainers()` | Stop (if needed) and delete every `Dockerina-…` container. | _none_ | `void`. |
| `execContainer({ containerId, command })` | Run a non-interactive command in a running container. | `containerId`, `command[]`. | `{ ExitCode, StdOut, StdErr }`. |
| `pullImage({ ref })` | Pull an image by tag/digest with progress streaming. | `ref` – e.g. `"nginx:latest"`. | Final result after streaming; progress messages every ~5s. |

## Method details
### `listContainers()`
- Returns both running and stopped containers (`all: true`).
- Response fields: `Id`, `Names`, `Image`, `Command`, `State`, `Status`.
- Use to discover viable target IDs for subsequent operations.

### `listContainerImages()`
- Returns `Id`, `RepoTags`, and `ParentId` for local images.
- Prefer `RepoTags` (e.g. `"nginx:latest"`) when composing `runContainer`.

### `inspectContainer({ id })`
- Supplies a distilled view of Docker's `inspect` output.  The subset includes
  `State`, `Config`, `NetworkSettings`, and `Mounts`.
- Helpful for resolving port bindings (`NetworkSettings.Ports`) and verifying
  environment variables (`Config.Env`).

### Log helpers
- `getContainerLogs` (stdout) and `getContainerErrorLogs` (stderr) return Node.js
  `Buffer` instances.  Convert them to strings before responding:
  ```ts
  const stdout = buffer.toString("utf-8");
  ```
- Both calls are limited to the latest 25 lines (`tail`).  No streaming support.

### `getContainerStats({ id })`
- Issues a non-streaming stats request (`stream: false`).
- Expect CPU and memory usage fields directly from Docker's REST API.
- Combine with `inspectContainer` for richer telemetry when troubleshooting.

### Lifecycle helpers
- `startContainer`, `stopContainer`, and `restartContainer` are thin wrappers
  around Docker's respective endpoints.  They throw descriptive errors that you
  should surface back to the user.
- `removeContainer` fails if the target is still running; stop it first.

### `runContainer({ image, name?, command?, env?, ports? })`
- Automatically prefixes `name` with `Dockerina-` to keep the namespace tidy.
- `command` should be an array of arguments, e.g. `['node', 'app.js']`.
- `env` is a dictionary, internally converted to `KEY=value` pairs.
- `ports` accepts strings in one of three formats:
  - `"80"` → expose container port 80 on a random host port.
  - `"3000:80"` → map host port 3000 to container port 80.
  - `"127.0.0.1:3000:80"` → bind to a specific host interface.
- This method starts the container immediately after creation.
- Response is the raw Docker container object; typically you only need the `id`.

### Namespace cleanup
- `stopAllDockerinaContainers` / `removeAllDockerinaContainers` operate on
  container names beginning with `Dockerina-`.
- These utilities ignore unrelated user containers, so they are safe cleanup
  options at the end of scripted runs.

### `execContainer({ containerId, command })`
- Creates a non-TTY exec session (`Tty: false`) so stdout and stderr are
  separated.
- Output is demultiplexed via `docker.modem.demuxStream` and returned as UTF-8
  strings.
- A soft timeout of 10 seconds is enforced.  If `ExitCode` stays `null`, the
  service returns `408` to signal a timeout.
- Use for quick diagnostic commands (`['ls','-l','/app']`) rather than long
  interactive sessions.

### `pullImage({ ref })`
- Starts a background job to pull the image and immediately returns a job reference.
- The orchestrator detects this job and streams progress updates to the LLM every ~5 seconds.
- Progress includes overall percent, phase, and per-layer completion counts.
- The function result delivered to the LLM after streaming ends contains a summary like `{ ref, digest?, status }` where `status` is one of `"downloaded" | "already-exists"`.

## Usage playbooks
- **Inspect failing container**
  1. `listContainers()` → find target ID.
  2. `getContainerErrorLogs({ id })` → capture recent stderr output.
  3. `getContainerStats({ id })` if resource exhaustion is suspected.
  4. Optionally `execContainer({ containerId: id, command: ['cat','/path/log'] })`.

- **Spin up a test service**
  1. `listContainerImages()` to confirm the image exists locally.
  2. `runContainer({ image: 'nginx:latest', name: 'test', ports: ['8080:80'] })`.
  3. `inspectContainer({ id })` to verify port bindings.
  4. Clean up with `removeContainer({ id })` when finished.

- **Bulk cleanup**
  1. `stopAllDockerinaContainers()` to halt every container that you created.
  2. `removeAllDockerinaContainers()` to delete them afterwards.

## Candidate future extensions
If you need broader coverage, coordinate with maintainers before invoking raw
Docker APIs.  The next most useful `dockerode` wrappers to consider adding are:
- `pullImage(repoTag, auth?)` to fetch images on demand.
- `pruneImages()` / `pruneContainers()` for housekeeping.
- `copyArchive`/`getArchive` to move files in or out of containers.
- `createVolume` and `createNetwork` for reproducible environments.
- `followProgress(stream, onFinished, onProgress)` for long builds/pulls.

Document any new methods here as they are exposed so the LLM stays in sync with
the tool surface.
