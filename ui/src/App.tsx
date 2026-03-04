import { useState, useRef, useEffect } from "react";
import { Trash2Icon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.tsx";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message.tsx";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input.tsx";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning.tsx";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import type { ContentBlock } from "@/lib/zypher-ui";
import {
  AgentProvider,
  type CompleteMessage,
  type CustomContentBlock,
  type StreamingMessage,
  TaskApiClient,
  useAgentContext,
} from "@/lib/zypher-ui";
import StickerPanel from "@/components/StickerPanel.tsx";

const client = new TaskApiClient({
  baseUrl:
    import.meta.env.VITE_API_URL ??
    new URL("/api/agent", window.location.origin).toString(),
});

// WebSocket URL for file-change notifications
const WS_URL = new URL("/api/ws", window.location.origin)
  .toString()
  .replace(/^http/, "ws");

function App() {
  const [wsEvent, setWsEvent] = useState<MessageEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // WebSocket connection
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => console.log("[WS] Connected");
      ws.onmessage = (event) => setWsEvent(event);
      ws.onclose = () => {
        if (destroyed) return;
        console.log("[WS] Disconnected, reconnecting in 2s...");
        reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = (err) => console.error("[WS] Error:", err);
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  return (
    <AgentProvider client={client}>
      <div className="flex h-screen w-full overflow-hidden">
        {/* Left panel: Agent chat */}
        <div className="flex flex-col w-[420px] min-w-80 border-r">
          <ChatUI />
        </div>

        {/* Right panel: Sticker moodboard */}
        <div className="flex-1 flex flex-col">
          <StickerPanel wsEvent={wsEvent} />
        </div>
      </div>
    </AgentProvider>
  );
}

// ---------------------------------------------------------------------------
// Chat UI
// ---------------------------------------------------------------------------

function ChatUI() {
  const {
    messages,
    streamingMessages,
    isTaskRunning,
    isLoadingMessages,
    isClearingMessages,
    runTask,
    clearMessageHistory,
    cancelCurrentTask,
  } = useAgentContext();

  const handleSubmit = ({ text }: { text: string }) => {
    runTask(text);
  };

  const handleClear = async () => {
    await clearMessageHistory();
    // Also delete all stickers
    try {
      await fetch("/api/stickers", { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "#F9F8F4" }}>
      <header className="h-12 flex items-center justify-between border-b border-black/5 px-4 bg-[#F9F8F4]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎨</span>
          <h1 className="font-semibold text-lg">Sticker Moodboard</h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleClear}
            disabled={isClearingMessages || isTaskRunning}
            title="Clear all"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </header>

      <Conversation>
        <ConversationContent>
          {isLoadingMessages && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-6" />
            </div>
          )}

          {messages.map((msg) => (
            <MessageBlock key={msg.id} message={msg} />
          ))}

          {streamingMessages.length > 0 && (
            <Message from="assistant">
              <MessageContent>
                {streamingMessages.map((sm) => (
                  <StreamingBlock key={sm.id} message={sm} />
                ))}
              </MessageContent>
            </Message>
          )}

          {isTaskRunning &&
            streamingMessages.length === 0 &&
            !isLoadingMessages && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                <span>Thinking...</span>
              </div>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            disabled={isTaskRunning}
            placeholder="Ask to create stickers... e.g. 'Create a cute cat sticker waving hello'"
          />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              status={isTaskRunning ? "streaming" : "ready"}
              onStop={cancelCurrentTask}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message rendering (same pattern as diagramming agent)
// ---------------------------------------------------------------------------

function MessageBlock({ message }: { message: CompleteMessage }) {
  if (message.role === "user") {
    const hasText = message.content.some((b) => b.type === "text");
    const hasToolResult = message.content.some((b) => b.type === "tool_result");

    // User message with only tool_result (no text) → render as assistant-side
    if (!hasText && hasToolResult) {
      return (
        <Message from="assistant">
          <MessageContent>
            {message.content.map((block, i) => (
              <ContentBlockRenderer key={i} block={block} />
            ))}
          </MessageContent>
        </Message>
      );
    }

    if (!hasText) return null;
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.content.map((block, i) => (
          <ContentBlockRenderer key={i} block={block} />
        ))}
      </MessageContent>
    </Message>
  );
}

function ContentBlockRenderer({
  block,
}: {
  block: ContentBlock | CustomContentBlock;
}) {
  const b = block as ContentBlock;
  switch (b.type) {
    case "text":
      return b.text ? <MessageResponse>{b.text}</MessageResponse> : null;

    case "tool_use":
      return (
        <Tool>
          <ToolHeader
            type="dynamic-tool"
            toolName={b.name}
            state="input-available"
          />
          <ToolContent>
            <ToolInput input={b.input} />
          </ToolContent>
        </Tool>
      );

    case "tool_result": {
      const outputText = b.content
        .filter(
          (c): c is Extract<typeof c, { type: "text" }> => c.type === "text",
        )
        .map((c) => c.text)
        .join("\n");
      return (
        <Tool>
          <ToolHeader
            type="dynamic-tool"
            toolName={b.name}
            state={b.success ? "output-available" : "output-error"}
          />
          <ToolContent>
            <ToolInput input={b.input} />
            <ToolOutput
              output={b.success ? outputText : undefined}
              errorText={!b.success ? outputText : undefined}
            />
          </ToolContent>
        </Tool>
      );
    }

    case "thinking":
      return (
        <Reasoning>
          <ReasoningTrigger />
          <ReasoningContent>{b.thinking}</ReasoningContent>
        </Reasoning>
      );

    case "image": {
      const src =
        b.source.type === "url"
          ? b.source.url
          : `data:${b.source.mediaType};base64,${b.source.data}`;
      return <img src={src} alt="" className="max-w-full rounded-md" />;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Streaming message rendering
// ---------------------------------------------------------------------------

function StreamingBlock({ message }: { message: StreamingMessage }) {
  if (message.type === "streaming_text") {
    return <MessageResponse>{message.text}</MessageResponse>;
  }

  if (message.type === "streaming_tool_use") {
    let input: unknown;
    try {
      input = JSON.parse(message.partialInput);
    } catch {
      input = message.partialInput;
    }
    return (
      <Tool>
        <ToolHeader
          type="dynamic-tool"
          toolName={message.toolUseName}
          state="input-streaming"
        />
        <ToolContent>
          <ToolInput input={input} />
        </ToolContent>
      </Tool>
    );
  }

  return null;
}

export default App;
