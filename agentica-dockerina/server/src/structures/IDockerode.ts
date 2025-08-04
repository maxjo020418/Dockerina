import type Docker from "dockerode";

/* 
Only added needed properties from Dockerode's ContainerInfo and ImageInfo
to reduce context size and avoid circular references.

Any JSDoc comments added are for typia annotations (no type changes or overrides)
to generate OpenAPI schema and types.
*/

type IContainerBase = Pick<
    Docker.ContainerInfo, 
    | "Names" 
    | "Image" 
    | "Command" 
    | "State" 
>;

type IContainerImageBase = Pick<
    Docker.ImageInfo,
    | "RepoTags"
    | "ParentId"
>;

/**
 * Docker container entity
 */
export interface IContainer extends IContainerBase {
    /**
     * command used to run in the container.
     */
    Command: string;

    /**
     * State of the container as in down or running.
     */
    State: string;
}

/**
 * Docker image entity
 */
export interface IContainerImage extends IContainerImageBase { 
    /**
     * List of repository tags associated with the image.
     * use this to pull the image.
     */
    RepoTags: string[];
}