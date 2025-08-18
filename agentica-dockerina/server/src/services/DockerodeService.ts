import Docker from "dockerode";
import { finished } from "stream";

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
sudo groupadd docker    # if group does not exist
sudo usermod -aG docker $USER
newgrp docker           # or log out/in
*/

export class DockerodeService {
    private static instance: DockerodeService;
    private docker: Docker;

    private constructor() {
        const docker_options = () => {
            if (SGlobal.env.DOCKER_HOST == undefined) {
                // local docker socket
                return { socketPath: "/var/run/docker.sock" }
            }
            else {
                // remote server options
                return {
                    host: SGlobal.env.DOCKER_HOST,
                    port: SGlobal.env.DOCKER_PORT ?? "2375",
                };
            }
        };
        console.log("[DockerodeService.ts] Initializing Dockerode with options:", docker_options());
        this.docker = new Docker(docker_options());
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
     * @param name Container name (will be prefixed with "Dockerina-")
     * @param command Command to run in container (optional)
     * @param env Environment variables as key-value pairs (optional)
     */
    public async runContainer(params: { 
        image: string;
        name?: string;
        command?: string[];
        env?: Record<string, string>;
    }): Promise<Docker.Container> {
        try {
            const containerName = params.name ? `Dockerina-${params.name}` : `Dockerina-${Date.now()}`;
            
            // Convert env object to Docker's expected format: ["KEY=value", ...]
            const envArray = params.env ? 
                Object.entries(params.env).map(([key, value]) => `${key}=${value}`) : 
                undefined;
            
            const container = await this.docker.createContainer({
                Image: params.image,
                Cmd: params.command || [],
                name: containerName,
                Env: envArray,
                Tty: false,
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


    private static EXEC_TIMEOUT_MS: number = 10_000;
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
            }, DockerodeService.EXEC_TIMEOUT_MS);

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
}