import Docker from "dockerode";
import { finished } from "stream";
import { ProgressStore } from "./jobs/ProgressStore";
import type { JobRef, PullProgressDetail, ProgressEvent } from "./jobs/ProgressTypes";

import { SGlobal } from "../SGlobal";
import type { 
    IContainerSimple, 
    IContainerImageSimple, 
    ISimpleContainerInspectInfo,
    // ISimpleContainerLog,
    IContainerOutStream,
} from "../structures/IDockerode";

/*
** make sure that user is added to docker group **
sudo groupadd docker # if group does not exist
sudo usermod -aG docker $USER
newgrp docker # or log out/in
*/

export class DockerodeService {
    private static instance: DockerodeService;
    private docker: Docker;

    private constructor() {
        const dockerHost = SGlobal.env.DOCKER_HOST;
        let docker_options: any;
        
        if (dockerHost.startsWith('unix://')) {
            // Unix socket connection (no port)
            docker_options = {
                socketPath: dockerHost.replace('unix://', '')
            };
        } else {
            // TCP connection
            docker_options = {
                host: dockerHost,
                port: SGlobal.env.DOCKER_PORT,
            };
        }
        
        console.log("[DockerodeService.ts] Initializing Dockerode with options:", docker_options);
        this.docker = new Docker(docker_options);
    }

    // so that instance is only initialized once!
    public static getInstance(): DockerodeService {
        if (!DockerodeService.instance) {
            DockerodeService.instance = new DockerodeService();
        }
        return DockerodeService.instance;
    }

    private getContainerSimpleAttributes(container: Docker.ContainerInfo): IContainerSimple {
        return {
            Id: container.Id,
            Names: container.Names,
            Image: container.Image,
            Command: container.Command,
            State: container.State,
            Status: container.Status,
        } as IContainerSimple;
    }

    private getContainerImageSimpleAttributes(image: Docker.ImageInfo): IContainerImageSimple {
        return {
            Id: image.Id,
            RepoTags: image.RepoTags,
            ParentId: image.ParentId,
        } as IContainerImageSimple;
    }

    private getContainer(id: string): Docker.Container {
        return this.docker.getContainer(id);
    }

    private getContainerInspectSimpleAttributes(inspect: Docker.ContainerInspectInfo): ISimpleContainerInspectInfo {
        return {
            Id: inspect.Id,
            Name: inspect.Name,
            Image: inspect.Image,
            State: {
                Status: inspect.State.Status,
                Running: inspect.State.Running,
                Paused: inspect.State.Paused,
                Restarting: inspect.State.Restarting,
                OOMKilled: inspect.State.OOMKilled,
                Dead: inspect.State.Dead,
                Pid: inspect.State.Pid,
                ExitCode: inspect.State.ExitCode,
                Error: inspect.State.Error,
                StartedAt: inspect.State.StartedAt,
                FinishedAt: inspect.State.FinishedAt,
            },
            Config: {
                Hostname: inspect.Config.Hostname,
                Domainname: inspect.Config.Domainname,
                User: inspect.Config.User,
                Env: inspect.Config.Env || [],
                Cmd: inspect.Config.Cmd || [],
                Image: inspect.Config.Image,
                WorkingDir: inspect.Config.WorkingDir,
                Entrypoint: inspect.Config.Entrypoint || [],
            },
            NetworkSettings: {
                IPAddress: inspect.NetworkSettings.IPAddress,
                Ports: inspect.NetworkSettings.Ports || {},
            },
            Mounts: (inspect.Mounts || []).map(mount => ({
                Type: mount.Type,
                Source: mount.Source,
                Destination: mount.Destination,
                Mode: mount.Mode,
                RW: mount.RW,
            })),
        } as ISimpleContainerInspectInfo;
    }

    /**
     * lists all containers (running and stopped)
     * @returns List of all containers
     */
    public async listContainers(): Promise<IContainerSimple[]> {
        try {
            const containers = await this.docker.listContainers({ all: true });
            return containers.map(c => this.getContainerSimpleAttributes(c));
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error listing Docker containers:", err);
            throw new Error(`Failed to list Docker containers: ${err_msg}`);
        }
    }

    /**
     * lists all images downloaded in host available for use
     * @returns List of all images
     */
    public async listContainerImages(): Promise<IContainerImageSimple[]> {
        try {
            const images = await this.docker.listImages();
            return images.map(i => this.getContainerImageSimpleAttributes(i));
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error listing Docker images:", err);
            throw new Error(`Failed to list Docker images: ${err_msg}`);
        }
    }

    /**
     * Inspects a Docker container by its ID
     * @param params.id Container ID
     * @returns Simplified container inspection info
     */
    public async inspectContainer(params: { id: string }): Promise<ISimpleContainerInspectInfo> {
        try {
            const container = await this.docker.getContainer(params.id).inspect();
            return this.getContainerInspectSimpleAttributes(container);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error inspecting Docker container:", err);
            throw new Error(`Failed to get inspect Docker container: ${err_msg}`);
        }
    }

    private static LOG_LINES: number = 25;
    /**
     * Gets most recent stderr logs of a Docker container by its ID
     * @param params.id Container ID
     * @returns Simplified container log info
     */
    public async getContainerErrorLogs(params: { id: string }): Promise<Buffer> {
        try {
            const log = await this.docker.getContainer(params.id).logs({
                stderr: true,
                stdout: false,
                tail: DockerodeService.LOG_LINES,
                follow: false,
            });
            return log;
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error getting logs for Docker container:", err);
            throw new Error(`Failed to get logs for Docker container: ${err_msg}`);
        }
    }

    /**
     * Gets most recent stdout logs of a Docker container by its ID
     * @param params.id Container ID
     * @returns Simplified container log info
     */
    public async getContainerLogs(params: { id: string }): Promise<Buffer> {
        try {
            const log = await this.docker.getContainer(params.id).logs({
                stderr: false,
                stdout: true,
                tail: DockerodeService.LOG_LINES,
                follow: false,
            });
            return log;
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error getting logs for Docker container:", err);
            throw new Error(`Failed to get logs for Docker container: ${err_msg}`);
        }
    }

    /**
     * Gets the stats of a Docker container by its ID
     * @param params.id Container ID
     * @returns cpu, memory usage and other system info
     */
    public async getContainerStats(params: { id: string }): Promise<Docker.ContainerStats> {
        try {
            const stats = await this.docker.getContainer(params.id).stats({
                stream: false,
            });
            return stats;
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error getting stats for Docker container:", err);
            throw new Error(`Failed to get stats for Docker container: ${err_msg}`);
        }
    }

    /**
     * @param params.id Container ID
     * Starts a Docker container by its ID.
     */
    public async startContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).start();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} started successfully.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error starting Docker container:", err);
            throw new Error(`Failed to start Docker container: ${err_msg}`);
        }
    }

    /**
     * @param params.id Container ID
     * Stops a Docker container by its ID.
     */
    public async stopContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).stop();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} stopped successfully.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error stopping Docker container:", err);
            throw new Error(`Failed to stop Docker container: ${err_msg}`);
        }
    }

    /**
     * Creates and starts a Docker container with Dockerina prefix
     * @param image Docker image full name
     * @param name Container nickname (will be prefixed with "Dockerina-")
     * @param command Command to run in container (optional)
     * @param env Environment variables as key-value pairs (optional)
     * @param ports Port mappings (optional) - Array of strings: ["8000", "3000:3001", "127.0.0.1:8080:80"]
     */
    public async runContainer(params: { 
        image: string;
        name?: string;
        command?: string[];
        env?: Record<string, string>;
        ports?: string[];
    }): Promise<Docker.Container> {
        console.log(`[DockerodeService.ts] Creating Docker container:\n${JSON.stringify(params)}`);
        try {
            const containerName = params.name ? `Dockerina-${params.name}` : `Dockerina-${Date.now()}`;
            
            // Convert env object to Docker's expected format: ["KEY=value", ...]
            const envArray = params.env ? 
                Object.entries(params.env).map(([key, value]) => `${key}=${value}`) : 
                undefined;
            
            // Process port bindings if provided
            let portBindings: Docker.PortMap | undefined;
            let exposedPorts: { [port: string]: {} } | undefined;
            
            if (params.ports && params.ports.length > 0) {
                portBindings = {};
                exposedPorts = {};
                
                for (const portSpec of params.ports) {
                    if (portSpec.includes(':')) {
                        // Format: "hostPort:containerPort" or "hostIP:hostPort:containerPort"
                        const parts = portSpec.split(':');
                        let hostPort: string;
                        let containerPort: string;
                        
                        if (parts.length === 2) {
                            // "hostPort:containerPort"
                            [hostPort, containerPort] = parts;
                            portBindings[`${containerPort}/tcp`] = [{ HostPort: hostPort }];
                        } else if (parts.length === 3) {
                            // "hostIP:hostPort:containerPort"
                            const [hostIP, hostPortStr, containerPortStr] = parts;
                            portBindings[`${containerPortStr}/tcp`] = [{ HostIp: hostIP, HostPort: hostPortStr }];
                            containerPort = containerPortStr;
                        } else {
                            throw new Error(`Invalid port specification: ${portSpec}. Use format "hostPort:containerPort" or "hostIP:hostPort:containerPort"`);
                        }
                        
                        exposedPorts[`${containerPort}/tcp`] = {};
                    } else {
                        // Format: just container port - Docker will assign random host port
                        const containerPort = portSpec;
                        portBindings[`${containerPort}/tcp`] = [{}];
                        exposedPorts[`${containerPort}/tcp`] = {};
                    }
                }
            }
            
            const container = await this.docker.createContainer({
                Image: params.image,
                Cmd: params.command || [],
                name: containerName,
                Env: envArray,
                Tty: false,
                ExposedPorts: exposedPorts,
                HostConfig: {
                    PortBindings: portBindings,
                },
            });
            await container.start();
            console.log(`[DockerodeService.ts] Docker container "${containerName}" with image ${params.image} created and started successfully.`);
            return container;
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error running Docker container:", err);
            throw new Error(`Failed to run Docker container: ${err_msg}`);
        }
    }

    /**
     * Removes a Docker container by its ID.
     * @param params.id - Container ID
     */
    public async removeContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).remove();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} removed successfully.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error removing Docker container:", err);
            throw new Error(`Failed to remove Docker container: ${err_msg}`);
        }
    }

    /**
     * Restarts a Docker container by its ID.
     * @param params.id - Container ID
     */
    public async restartContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).restart();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} restarted successfully.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error restarting Docker container:", err);
            throw new Error(`Failed to restart Docker container: ${err_msg}`);
        }
    }

    /**
     * Stops all containers created by this agent (names starting with "Dockerina-")
     */
    public async stopAllDockerinaContainers(): Promise<void> {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const dockerinaContainers = containers.filter(container => 
                container.Names.some(name => name.startsWith("/Dockerina-"))
            );

            const stopPromises = dockerinaContainers.map(async (container) => {
                if (container.State === "running") {
                    try {
                        await this.getContainer(container.Id).stop();
                        console.log(`[DockerodeService.ts] Stopped Dockerina container: ${container.Names[0]}`);
                    } catch (err) {
                        const err_msg = err instanceof Error ? err.message : String(err);
                        console.error(`[DockerodeService.ts] Failed to stop container ${container.Names[0]}:`, err_msg);
                    }
                }
            });

            await Promise.all(stopPromises);
            console.log(`[DockerodeService.ts] Stopped ${dockerinaContainers.filter(c => c.State === "running").length} Dockerina containers.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error stopping Dockerina containers:", err);
            throw new Error(`Failed to stop Dockerina containers: ${err_msg}`);
        }
    }

    /**
     * Removes all containers created by this agent (names starting with "Dockerina-")  
     */
    public async removeAllDockerinaContainers(): Promise<void> {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const dockerinaContainers = containers.filter(container => 
                container.Names.some(name => name.startsWith("/Dockerina-"))
            );

            // Stop running containers first
            const stopPromises = dockerinaContainers.map(async (container) => {
                if (container.State === "running") {
                    try {
                        await this.getContainer(container.Id).stop();
                    } catch (err) {
                        console.error(`[DockerodeService.ts] Failed to stop container ${container.Names[0]}:`, err);
                    }
                }
            });
            await Promise.all(stopPromises);

            // Remove all containers
            const removePromises = dockerinaContainers.map(async (container) => {
                try {
                    await this.getContainer(container.Id).remove();
                    console.log(`[DockerodeService.ts] Removed Dockerina container: ${container.Names[0]}`);
                } catch (err) {
                    const err_msg = err instanceof Error ? err.message : String(err);
                    console.error(`[DockerodeService.ts] Failed to remove container ${container.Names[0]}:`, err_msg);
                }
            });

            await Promise.all(removePromises);
            console.log(`[DockerodeService.ts] Removed ${dockerinaContainers.length} Dockerina containers.`);
        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error removing Dockerina containers:", err);
            throw new Error(`Failed to remove Dockerina containers: ${err_msg}`);
        }
    }

    /**
     * Executes a command in a running Docker container.
     * @param containerId - ID of the container
     * @param command - Command to execute as an array of strings
     * @returns output containing exit code, stdout, and stderr
     */
    public async execContainer(params: {
        containerId: string,
        command: string[],
    }): Promise<IContainerOutStream> {
        const { containerId, command } = params;

        try {
            const container = this.getContainer(containerId);
            const exec = await container.exec({
                Cmd: command,
                AttachStdout: true,
                AttachStderr: true,
                /*
                stream is a Node Duplex stream carrying the exec I/O. 
                In Tty:false it is the multiplexed binary format described above. 
                In Tty:true it is a single raw byte stream.
                */
                Tty: false,
            });
            
            const stream = await exec.start({
                hijack: true,
                stdin: false,
            });
            
            const outChunks: Buffer[] = [];
            const errChunks: Buffer[] = [];

            container.modem.demuxStream(  // helper from dockerode’s underlying transport
                stream,
                { write: (c: Buffer) => outChunks.push(c) } as any,
                { write: (c: Buffer) => errChunks.push(c) } as any,
            )

            const timer = setTimeout(() => {
                stream.destroy(new Error("Exec command timed out, exec process may still be running."));
            }, SGlobal.env.DOCKER_EXEC_TIMEOUT_MS);

            const endPromise = finished(
                stream,
                ((err?: NodeJS.ErrnoException | null) => {
                    if (err) {
                        const err_msg = err instanceof Error ? err.message : String(err);
                        console.error("[DockerodeService.ts] Error finishing stream:", err);
                        throw new Error(`Exec command failed: ${err_msg}`);
                    }
                    console.log("[DockerodeService.ts] Stream finished successfully.");
                })
            );

            try {
                endPromise;  // wait for `end`
            } 
            catch (err) {
                const err_msg = err instanceof Error ? err.message : String(err);
                console.error("[DockerodeService.ts] Error finishing stream:", err);
                throw new Error(`Exec command failed: ${err_msg}`);
            } 
            finally {
                clearTimeout(timer);
            }

            // fetch exit code: slight races are possible, so loop briefly if needed
            let exitCode: number | null = null;
            for (let i = 0; i < 10; i++) {
                const info = await exec.inspect();
                if (info.ExitCode !== null) { exitCode = info.ExitCode; break; }
                await new Promise(r => setTimeout(r, 50));  // 50ms wait for each loop (non-blocking)
            }

            return {
                ExitCode: exitCode ?? 408,  // if none, regard as failure at above loop. timeout 408
                StdOut: Buffer.concat(outChunks).toString("utf-8"),
                StdErr: Buffer.concat(errChunks).toString("utf-8"),
            }

        } catch (err) {
            const err_msg = err instanceof Error ? err.message : String(err);
            console.error("[DockerodeService.ts] Error executing command in Docker container:", err);
            throw new Error(`Failed to execute command in Docker container: ${err_msg}`);
        }
    }

    /**
     * Pull a Docker image by reference (e.g., "nginx:latest") and stream progress as a background job.
     * @param ref - Image reference
     * @param auth - Optional authentication config for private registries
     * @returns A JobRef representing the background job
     */
    public async pullImage(params: { ref: string, auth?: Docker.AuthConfig }): Promise<JobRef> {
        const { ref, auth } = params;
        const job = ProgressStore.createJob("docker.pull", { ref });
        console.log(`[DockerodeService.ts] Starting image pull job ${job.id} for ${ref}`);

        // fire-and-forget async task
        (async () => {
            try {
                ProgressStore.setRunning(job.id);
                const stream = await this.docker.pull(ref, auth ? { authconfig: auth } : undefined as any);

                const layers: Record<string, { status?: string; current?: number; total?: number; percent?: number; }> = {};
                let overallPhase: PullProgressDetail["phase"] = "resolving";
                let lastEmitTs = 0;
                let digest: string | undefined;
                let resultStatus: string = "downloaded";

                const emitProgress = (message?: string) => {
                    const now = Date.now();
                    // emit frequently; reporter throttles to 5s for LLM messages
                    const overallPercent = computeOverallPercent(layers);
                    const ev: ProgressEvent = {
                        ts: now,
                        message,
                        detail: {
                            phase: overallPhase,
                            percent: overallPercent ?? undefined,
                            layers,
                            ref,
                        } as PullProgressDetail,
                    };
                    ProgressStore.update(job.id, ev);
                    lastEmitTs = now;
                };

                await new Promise<void>((resolve, reject) => {
                    // followProgress calls onFinished when all pull operations complete
                    (this.docker as any).modem.followProgress(
                        stream,
                        (err: any, _output: any[]) => {
                            if (err) return reject(err);
                            resolve();
                        },
                        (event: any) => {
                            // event shape: { status, id?, progressDetail?, aux? }
                            const status: string = event?.status ?? "";
                            const id: string | undefined = event?.id ?? undefined;
                            const pd: { current?: number; total?: number } | undefined = event?.progressDetail;
                            const aux = event?.aux;

                            if (aux && typeof aux.Digest === "string") {
                                digest = aux.Digest;
                            }
                            if (status.includes("Already exists")) {
                                resultStatus = "already-exists";
                            }

                            if (status) {
                                if (/Downloading/i.test(status)) overallPhase = "downloading";
                                else if (/Extracting/i.test(status)) overallPhase = "extracting";
                                else if (/Verifying/i.test(status)) overallPhase = "verifying";
                                else if (/Pull complete|Download complete/i.test(status)) overallPhase = "done";
                                else if (/Waiting/i.test(status)) overallPhase = "waiting";
                            }
                            if (id) {
                                const layer = layers[id] ?? {};
                                layer.status = status || layer.status;
                                if (pd && typeof pd.total === "number" && pd.total > 0) {
                                    layer.current = pd.current ?? layer.current ?? 0;
                                    layer.total = pd.total;
                                    layer.percent = Math.max(0, Math.min(100, Math.floor(((layer.current ?? 0) / pd.total) * 100)));
                                }
                                layers[id] = layer;
                            }

                            emitProgress(status || undefined);
                        }
                    );
                });

                const final = { ref, digest, status: resultStatus };
                ProgressStore.finish(job.id, final);
                console.log(`[DockerodeService.ts] Image pull job ${job.id} for ${ref} finished (${resultStatus})`);
            } catch (err) {
                const err_msg = err instanceof Error ? err.message : String(err);
                console.error(`[DockerodeService.ts] Image pull job ${job.id} failed:`, err_msg);
                ProgressStore.fail(job.id, err);
            }
        })();

        return ProgressStore.toRef(job);
    }
}

function computeOverallPercent(layers: Record<string, { status?: string; current?: number; total?: number; percent?: number; }>): number | null {
    const values = Object.values(layers);
    let sumCurrent = 0;
    let sumTotal = 0;
    for (const l of values) {
        if (typeof l.total === "number" && l.total > 0) {
            sumCurrent += Math.min(l.current ?? 0, l.total);
            sumTotal += l.total;
        }
    }
    if (sumTotal > 0) {
        return Math.max(0, Math.min(100, Math.floor((sumCurrent / sumTotal) * 100)));
    }
    // fallback: based on count of layers with status "Pull complete" or percent 100
    if (values.length > 0) {
        const done = values.filter(l => (l.percent ?? 0) >= 100 || /complete/i.test(l.status ?? "")).length;
        return Math.floor((done / values.length) * 100);
    }
    return null;
}
