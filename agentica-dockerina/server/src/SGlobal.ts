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
  PORT: number; // port for the Agentica server
  BASE_URL: string; // Base URL for the API, default is "http://localhost:8000/v1"

  DOCKER_HOST: string; // Docker host URL, default is "unix:///var/run/docker.sock"
  DOCKER_PORT: number; // Docker port for connection (when DOCKER_HOST is set, default is 2375)
}

const environments = new Singleton(() => {
  const env = dotenv.config();
  dotenvExpand.expand(env);
  
  // set default value if not defined
  const parsedEnv: IEnvironments = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "NO_KEY",
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    BASE_URL: process.env.BASE_URL || "http://localhost:11434/v1",
    DOCKER_HOST: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
    DOCKER_PORT: process.env.DOCKER_PORT ? parseInt(process.env.DOCKER_PORT, 10) : 2375,
  };
  
  return typia.assert<IEnvironments>(parsedEnv);
});
