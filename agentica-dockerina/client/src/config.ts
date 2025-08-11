// Configuration for Dockerina
export const config = {
  portainer: {
    // Default Portainer URL - can be overridden by environment variable
    url: import.meta.env.VITE_PORTAINER_URL || "https://portainer.yeongmin.net",
  },
} as const;
