import { useState } from "react";
import reactLogo from "../assets/react.svg";
import agenticaLogo from "/agentica.svg";
import { config } from "../config";

export function Landing() {
  const [portainerUrl, setPortainerUrl] = useState(config.portainer.url);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [tempUrl, setTempUrl] = useState(portainerUrl);

  const handleUrlUpdate = () => {
    setPortainerUrl(tempUrl);
    setIsEditingUrl(false);
  };

  const handleUrlCancel = () => {
    setTempUrl(portainerUrl);
    setIsEditingUrl(false);
  };

  return (
    <section className="flex-1 flex flex-col p-4 md:p-8 relative">
      {/* Header */}
      <div className="flex-shrink-0 space-y-6 text-center py-4">
        <div className="flex gap-6 items-center justify-center">
          <a
            href="https://wrtnlabs.io/agentica/"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all"
          >
            <img
              src={agenticaLogo}
              alt="Agentica logo"
              className="w-16 h-16 transition-all hover:filter hover:drop-shadow-[0_0_1rem_rgba(255,255,255,0.5)]"
            />
          </a>
          <span className="text-2xl font-bold text-gray-500">+</span>
          <a
            href="https://react.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-all"
          >
            <img
              src={reactLogo}
              alt="React logo"
              className="w-16 h-16 animate-[spin_10s_linear_infinite] transition-all hover:filter hover:drop-shadow-[0_0_1rem_#61dafbaa]"
            />
          </a>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-100 to-white bg-clip-text text-transparent">
            Dockerina Console
          </h1>
          <p className="text-sm text-gray-400">
            Manage your Docker containers with Portainer and Dockerina
          </p>
        </div>

        {/* URL Configuration */}
        <div className="flex items-center justify-center gap-2">
          {isEditingUrl ? (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="px-3 py-1 bg-gray-800 text-gray-200 border border-gray-600 rounded text-sm"
                placeholder="Portainer URL"
              />
              <button
                onClick={handleUrlUpdate}
                className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-all"
              >
                ✓
              </button>
              <button
                onClick={handleUrlCancel}
                className="px-2 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700 transition-all"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <span className="text-xs text-gray-500">
                {portainerUrl}
              </span>
              <button
                onClick={() => setIsEditingUrl(true)}
                className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600 transition-all"
              >
                Edit URL
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Portainer Console Iframe */}
      <div className="flex-1 min-h-0">
        <div className="w-full h-full rounded-lg overflow-hidden shadow-2xl">
          <iframe
            src={portainerUrl}
            className="w-full h-full border-0 rounded-lg"
            title="Portainer Console"
            allow="fullscreen"
            style={{ minHeight: '600px', border: 'none' }}
          />
        </div>
      </div>
    </section>
  );
}
