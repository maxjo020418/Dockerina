import Docker from "dockerode";

import { SGlobal } from "../SGlobal";
import type { IContainerSimple, IContainerImageSimple, ISimpleContainerInspectInfo } from "../structures/IDockerode";

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
     * Inspects a Docker container by its ID
     * @param id Container ID
     * @returns Simplified container inspection info
     */
    public async inspectContainer(params: { id: string }): Promise<ISimpleContainerInspectInfo> {
        try {
            const container = await this.docker.getContainer(params.id).inspect();
            return this.getContainerInspectSimpleAttributes(container);
        } catch (err) {
            throw new Error(`Failed to get inspect Docker container with ID ${params.id}.`);
        }
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
            console.error("[DockerodeService.ts] Error listing Docker containers:", err);
            throw new Error("Failed to list Docker containers.");
        }
    }

    /**
     * lists all images downloaded in host
     * @returns List of all images
     */
    public async listImages(): Promise<IContainerImageSimple[]> {
        try {
            const images = await this.docker.listImages();
            return images.map(i => this.getContainerImageSimpleAttributes(i));
        } catch (err) {
            console.error("[DockerodeService.ts] Error listing Docker images:", err);
            throw new Error("Failed to list Docker images.");
        }
    }
    
    /**
     * Starts a Docker container by its ID.
     */
    public async startContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).start();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} started successfully.`);
        } catch (err) {
            console.error("[DockerodeService.ts] Error starting Docker container:", err);
            throw new Error(`Failed to start Docker container with ID ${params.id}.`);
        }
    }

    /**
     * Stops a Docker container by its ID.
     */
    public async stopContainer(params: { id: string }): Promise<void> {
        try {
            await this.getContainer(params.id).stop();
            console.log(`[DockerodeService.ts] Docker container with ID ${params.id} stopped successfully.`);
        } catch (err) {
            console.error("[DockerodeService.ts] Error stopping Docker container:", err);
            throw new Error(`Failed to stop Docker container with ID ${params.id}.`);
        }
    }

    // /**
    //  * Runs a Docker container using the specified image.
    //  */
    // public async runContainer(params: { 
    //     /**
    //      * Docker image full name
    //      */
    //     image: string;
    //     /**
    //      * Command to run in the container (optional)
    //      */
    //     command?: string[];
    // }): Promise<void> {
    //     try {
    //         await this.docker.run(
    //             params.image,
    //             params.command || [],
    //             process.stdout,
    //         );
    //         console.log(`[DockerodeService.ts] Docker container with image ${params.image} created and started successfully.`);
    //     } catch (err) {
    //         console.error("[DockerodeService.ts] Error running Docker container:", err);
    //         throw new Error(`Failed to run Docker container with image ${params.image}.`);
    //     }
    // }

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
            console.error("[DockerodeService.ts] Error stopping Dockerina containers:", err);
            throw new Error("Failed to stop Dockerina containers.");
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
            console.error("[DockerodeService.ts] Error removing Dockerina containers:", err);
            throw new Error("Failed to remove Dockerina containers.");
        }
    }
}