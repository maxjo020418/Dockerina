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
  OPENAI_API_KEY?: string;
  PORT: `${number}`;

  BASE_URL?: string; // Base URL for the API, default is "http://localhost:8000/v1"
  DOCKER_HOST?: string; // Docker host URL, default is "unix:///var/run
  DOCKER_PORT?: `${number}`; // Docker port for connection (when DOCKER_HOST is set, default is 2375)
}

const environments = new Singleton(() => {
  const env = dotenv.config();
  dotenvExpand.expand(env);
  return typia.assert<IEnvironments>(process.env);
});
