import type Docker from "dockerode";
import { tags } from "typia";

/* 
Only added needed properties from Dockerode's ContainerInfo and ImageInfo
to reduce context size and avoid circular references.

Any JSDoc comments added are for typia annotations (no type changes or overrides)
to generate OpenAPI schema and types.
*/

type IContainerBase = Pick<
    Docker.ContainerInfo, 
    | "Id"
    | "Names" 
    | "Image" 
    | "Command" 
    | "State" 
    | "Status"
>;

type IContainerImageBase = Pick<
    Docker.ImageInfo,
    | "Id"
    | "RepoTags"
    | "ParentId"
>;

type IContainerInspectBase = Pick<
    Docker.ContainerInspectInfo,
    | "Id"
    | "Name"
    | "Image"
    | "State"
    // below properties are incompatible (though it exists in base)
    // | "Config"
    // | "NetworkSettings"
    // | "Mounts"
>;

/**
 * Docker container entity
 */
export interface IContainerSimple extends IContainerBase {
    /**
     * 
     */
    Id: string & tags.Format<"uuid">;

    /**
     * command used to run in the container.
     */
    Command: string;

    /**
     * State of the container as in down or running.
     */
    State: string;

    /**
     * Status of the container.
     * e.g. "Up 5 minutes" or "Exited (0) 2 minutes ago"
     */
    Status: string;
}

/**
 * Docker image entity
 */
export interface IContainerImageSimple extends IContainerImageBase { 
    /**
     * Unique identifier of the image.
     */
    Id: string & tags.Format<"uuid">;
    
    /**
     * List of repository tags associated with the image.
     * use this to pull the image.
     */
    RepoTags: string[];
}

/**
 * Docker container inspection info
 */
export interface ISimpleContainerInspectInfo extends IContainerInspectBase {
    /**
     * Container ID
     */
    Id: string;
    
    /**
     * Container name
     */
    Name: string;
    
    /**
     * Image used to create the container
     */
    Image: string;
    
    /**
     * Container state information
     */
    State: {
        Status: string;
        Running: boolean;
        Paused: boolean;
        Restarting: boolean;
        OOMKilled: boolean;
        Dead: boolean;
        Pid: number;
        ExitCode: number;
        Error: string;
        StartedAt: string;
        FinishedAt: string;
    };
    
    /**
     * Container configuration
     */
    Config: {
        Hostname: string;
        Domainname: string;
        User: string;
        Env: string[];
        Cmd: string[];
        Image: string;
        WorkingDir: string;
        Entrypoint: string[];
    };
    
    /**
     * Network settings
     */
    NetworkSettings: {
        IPAddress: string;
        Ports: { [key: string]: any };
    };
    
    /**
     * Mount points
     */
    Mounts: Array<{
        Type: string;
        Source: string;
        Destination: string;
        Mode: string;
        RW: boolean;
    }>;
}

/**
 * Docker container log info
 */
export interface ISimpleContainerLog { // from ContainerInspectInfo.State.Health
    /**
     * Health status of the container
     */
    Status: string;

    /**
     * Number of consecutive failed health checks
     */
    FailingStreak: number;

    /**
     * Array of log entries for the container
     */
    Log: Array<{
        Start: string;
        End: string;
        ExitCode: number;
        Output: string;
    }>;
}