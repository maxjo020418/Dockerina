import { useAgenticaRpc } from "../../provider/AgenticaRpcProvider";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";
import { ChatStatus } from "./ChatStatus";
import { useEffect, useMemo, useRef } from "react";
import { TypingIndicator } from "./TypingIndicator";

export function Chat() {
  const { messages, conversate, isConnected, isError, tryConnect } =
    useAgenticaRpc();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const hasMessage = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const isWaitingForFirstAssistant = lastMessage?.type === "userMessage";

  const hasAssistantThinking = useMemo(() => {
    const isThinkingOnly = (input: string | null | undefined) => {
      if (!input) return false;
      let withoutThink = input.replace(/<think>[\s\S]*?<\/think>/gi, "");
      withoutThink = withoutThink.replace(/^\s{0,3}#{1,6}\s+.*$/gm, "");
      return withoutThink.trim().length === 0;
    };

    const lastChat = messages.at(-1)
    if (lastChat == null) { return false }

    if (lastChat.type === "assistantMessage" || lastChat.type === "describe") {
        return isThinkingOnly((lastChat as any).text);
    }
    return false;
  }, [messages]);

  // ==============================================
  // Debug: track waiting/assistant thinking states
  useEffect(() => {
    console.debug(
      "[Chat] Msg send disable status:",
      {
        isConnected: isConnected, isError: isError,
        isWaitingForFirstAssistant: isWaitingForFirstAssistant,
        hasAssistantThinking: hasAssistantThinking
      },
      { messagesCount: messages.length, lastMessageType: lastMessage?.type }
    );
  }, [isConnected, isError, isWaitingForFirstAssistant, hasAssistantThinking]);
  // ==============================================

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    try {
      await conversate(content);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 min-w-0">
      <div className="relative w-full h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)]">
        <div className="h-full flex flex-col bg-zinc-800/50 backdrop-blur-md rounded-2xl overflow-hidden border border-zinc-700/30">
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
          >
            {hasMessage && <ChatMessages messages={messages} />}
            <ChatStatus
              isError={isError}
              isConnected={isConnected}
              hasMessages={hasMessage}
              onRetryConnect={tryConnect}
              isWsUrlConfigured={import.meta.env.VITE_AGENTICA_WS_URL !== ""}
            />
            {isConnected && !isError && isWaitingForFirstAssistant && (
              <div className="flex justify-start mt-2">
                <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-zinc-700/50 text-gray-100">
                  <TypingIndicator />
                </div>
              </div>
            )}
          </div>

          <div className="p-4">
            <ChatInput
              onSendMessage={handleSendMessage}
              disabled={!isConnected || isError || isWaitingForFirstAssistant || hasAssistantThinking}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
