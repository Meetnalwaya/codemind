// renderer/components/ChatPanel.tsx
// The right panel. Empty state when nothing is selected, otherwise
// shows the selected file, a chat thread, and an input. This is where
// "add google authentication" gets typed and turned into a graph-scoped
// Claude request.

import { useState, useRef, useEffect } from "react";
import { useGraphStore, getSelectedNode } from "../store/graphStore";
import { useClaudeStream } from "../hooks/useClaudeStream";
import { DiffViewer } from "./DiffViewer";

const SUGGESTED_PROMPTS = [
  "Add Google OAuth to this file",
  "Add input validation with clear error messages",
  "Extract this into smaller functions",
  "Add error handling for the failure case",
];

export function ChatPanel() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedNode = useGraphStore(getSelectedNode);
  const chatMessages = useGraphStore((s) => s.chatMessages);
  const streamStatus = useGraphStore((s) => s.streamStatus);
  const streamError = useGraphStore((s) => s.streamError);
  const diff = useGraphStore((s) => s.diff);

  const { sendPrompt, cancelStream } = useClaudeStream();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages]);

  const isBusy = streamStatus === "streaming";

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;
    setInput("");
    void sendPrompt(trimmed);
  };

  if (!selectedNode) {
    return (
      <aside className="w-[380px] shrink-0 bg-[#12151B] border-l border-[#262B35] flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-[13px] text-[#5B6272] leading-relaxed">
            Select any node on the graph to see it here — then just
            describe the change you want. No manual coding required.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[380px] shrink-0 bg-[#12151B] border-l border-[#262B35] flex flex-col">
      {/* Selected file header */}
      <div className="px-4 py-3 border-b border-[#262B35]">
        <div className="text-[10px] uppercase tracking-wide text-[#5B6272] mb-0.5">
          {selectedNode.kind}
        </div>
        <div className="font-mono text-[13px] text-[#E7E9EE] truncate" title={selectedNode.path}>
          {selectedNode.path}
        </div>
      </div>

      {/* Chat thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="space-y-2">
            <div className="text-[13px] text-[#838B9C] mb-2">
              What should change in this file?
            </div>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => void sendPrompt(prompt)}
                className="w-full text-left text-[12px] text-[#B8BFCC] bg-[#181C24] border border-[#262B35] rounded-md px-3 py-2 hover:border-[#7C9CFF] hover:text-[#E7E9EE] transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={[
              "text-[13px] leading-relaxed rounded-md px-3 py-2 max-w-[92%]",
              msg.role === "user"
                ? "ml-auto bg-[#7C9CFF1A] text-[#E7E9EE] border border-[#7C9CFF33]"
                : "bg-[#181C24] text-[#B8BFCC] border border-[#262B35]",
            ].join(" ")}
          >
            {msg.text || (isBusy && i === chatMessages.length - 1 ? "…" : "")}
          </div>
        ))}

        {streamStatus === "error" && (
          <div className="text-[12px] text-[#F85149] bg-[#F8514914] border border-[#F8514933] rounded-md px-3 py-2">
            {streamError ?? "Something went wrong."}
          </div>
        )}

        {diff && <DiffViewer />}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#262B35]">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Describe the change…"
            rows={2}
            disabled={isBusy}
            className="flex-1 resize-none bg-[#181C24] border border-[#262B35] rounded-md px-3 py-2 text-[13px] text-[#E7E9EE] placeholder:text-[#5B6272] focus:outline-none focus:border-[#7C9CFF] disabled:opacity-50"
          />
          {isBusy ? (
            <button
              onClick={() => void cancelStream()}
              className="shrink-0 h-9 px-3 rounded-md text-[12px] font-medium bg-[#F8514914] text-[#F85149] border border-[#F8514933] hover:bg-[#F8514922]"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="shrink-0 h-9 px-3 rounded-md text-[12px] font-medium bg-[#7C9CFF] text-[#0A0C10] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#93ADFF]"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
