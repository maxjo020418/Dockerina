import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { Singleton } from "tstl";
import typia from "typia";

export class SGlobal {
  public static get env(): IEnvironments {
    return environments.get();
  }
}

interface IEnvironments {
  OPENAI_API_KEY: string; // defaults to dummy key
  BASE_URL: string; // Base URL for the API, default is "http://localhost:8000/v1"
  MODEL: string; // Model name for the API
  LANGUAGE: string; // Optional language setting

  PORT: number; // port for the Agentica server
  ENABLE_HTTP_LOGGING: boolean; // enable HTTP request logging

  DOCKER_HOST: string; // Docker host URL, default is "unix:///var/run/docker.sock"
  DOCKER_PORT: number; // Docker port for connection (when DOCKER_HOST is set, default is 2375)
  DOCKER_EXEC_TIMEOUT_MS: number; // Docker Execution timeout in milliseconds (default is 30000 ms)

  // Optional LLM tuning params; include only if set
  THINK?: boolean;
  TEMPERATURE?: number;
  TOP_P?: number;
}

// Parse a boolean-like environment variable string
const parseBooleanEnv = (value: string | undefined, defaultValue = false): boolean => {
  if (value === undefined) return defaultValue;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return defaultValue;
  }
};

const environments = new Singleton(() => {
  const env = dotenv.config();
  dotenvExpand.expand(env);
  
  // default values
  const parsedEnv: IEnvironments = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "NO_KEY",
    BASE_URL: process.env.BASE_URL || "http://localhost:11434/v1",
    MODEL: process.env.MODEL || "qwen3:14b",
    LANGUAGE: process.env.LANGUAGE || "en",
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    ENABLE_HTTP_LOGGING: parseBooleanEnv(process.env.ENABLE_HTTP_LOGGING, false),
    DOCKER_HOST: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
    DOCKER_PORT: process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT, 10) : 2375,
    DOCKER_EXEC_TIMEOUT_MS: process.env.EXEC_TIMEOUT_MS ? parseInt(process.env.EXEC_TIMEOUT_MS, 10) : 30000,
  };

  // Optional parameters parsing (only assign when present)
  if (typeof process.env.THINK !== "undefined") {
    parsedEnv.THINK = parseBooleanEnv(process.env.THINK, false);
  }
  if (typeof process.env.TEMPERATURE !== "undefined") {
    const v = Number(process.env.TEMPERATURE);
    if (!Number.isNaN(v)) parsedEnv.TEMPERATURE = v;
  }
  if (typeof process.env.TOP_P !== "undefined") {
    const v = Number(process.env.TOP_P);
    if (!Number.isNaN(v)) parsedEnv.TOP_P = v;
  }
  
  return typia.assert<IEnvironments>(parsedEnv);
});
