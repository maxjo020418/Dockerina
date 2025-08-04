import Docker from "dockerode";

import { SGlobal } from "../SGlobal";
import type { IContainer } from "../structures/IDockerode";

/*
** make sure that user is added to docker group **
sudo groupadd docker    # if group does not exist
sudo usermod -aG docker $USER
newgrp docker           # or log out/in
*/

export class DockerodeService {
    private docker: Docker;

    constructor() {
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
    }
    console.log("[DockerodeService.ts] Initializing Dockerode with options:", docker_options());
    this.docker = new Docker(docker_options())
    }

    private getContainerInfo(container: Promise<Docker.ContainerInfo[]>): IContainer {
        
    }

    /**
     * lists all containers (running and stopped)
     * @returns List of all containers
     */
    public async listContainers(): IContainer[] {
        const containers = await this.docker.listContainers({ all: true });
        return containers.map((container) => ({
            // container_id: container.Id, // not used
            names: container.Names,
            image: container.Image,
            command: container.Command,
            state: container.State,
            // host_config: container.HostConfig, // not used
            // network_settings: container.NetworkSettings, // not used
            // mounts: container.Mounts, // not used
        }));
    }
}