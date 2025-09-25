interface ChatStatusProps {
  isError: boolean;
  isConnected: boolean;
  hasMessages: boolean;
  onRetryConnect: () => void;
  isWsUrlConfigured: boolean;
  errorDetails: string | null;
}

export function ChatStatus({
  isError,
  isConnected,
  hasMessages,
  onRetryConnect,
  isWsUrlConfigured,
  errorDetails
}: ChatStatusProps) {
  if (!isWsUrlConfigured) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-yellow-400 text-sm">
          VITE_AGENTICA_WS_URL is not configured
        </div>
        <div className="text-gray-400 text-sm">
          Please set the VITE_AGENTICA_WS_URL environment variable
        </div>
      </div>
    );
  }

  if (isError) {
    const wsUrl = import.meta.env.VITE_AGENTICA_WS_URL || "(not set)";
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="text-red-400 text-sm font-semibold text-center">
          Failed to connect to Agentica server
        </div>
        <div className="text-gray-300 text-xs text-center max-w-md">
          Endpoint: <span className="font-mono text-gray-100">{wsUrl}</span>
          <br />
          Check that the server is running and reachable from your browser.
          The details below come from the last connection attempt.
        </div>
        {errorDetails && (
          <pre className="max-w-md w-full whitespace-pre-wrap break-words bg-red-950/60 border border-red-800/40 text-red-100 text-xs px-3 py-2 rounded-xl">
            {errorDetails}
          </pre>
        )}
        <button
          onClick={onRetryConnect}
          className="px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/20"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Connecting to Agentica server...
      </div>
    );
  }

  if (!hasMessages) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Start a conversation by sending a message...
      </div>
    );
  }

  return null;
}
