// renderer/hooks/useClaudeStream.ts
// Bridges window.codemind's chunked IPC events into the Zustand store,
// and exposes a single sendPrompt() function for ChatPanel to call.
// This is the "select node, describe change, get code" wire-up.

import { useCallback, useEffect, useRef } from "react";
import { useGraphStore } from "../store/graphStore";
import type { SerializedParseResult } from "../../shared/types";

export function useClaudeStream() {
  const requestIdRef = useRef<string | null>(null);

  const {
    nodes,
    edges,
    rootDir,
    selectedNodeId,
    appendUserMessage,
    appendAssistantDelta,
    setStreamStatus,
    setActiveRequestId,
    setDiff,
  } = useGraphStore();

  useEffect(() => {
    const unsubscribe = window.codemind.onClaudeChunk((chunk) => {
      if (chunk.requestId !== requestIdRef.current) return; // stale stream, ignore

      if (chunk.type === "text" && chunk.textDelta) {
        appendAssistantDelta(chunk.textDelta);
      } else if (chunk.type === "done") {
        setStreamStatus(chunk.proposedContent ? "awaiting-approval" : "idle");
        if (chunk.proposedContent && selectedNodeId) {
          const node = nodes[selectedNodeId];
          setDiff({
            nodeId: selectedNodeId,
            originalContent: node?.content ?? "",
            proposedContent: chunk.proposedContent,
          });
        }
        setActiveRequestId(null);
      } else if (chunk.type === "error") {
        setStreamStatus("error", chunk.error);
        setActiveRequestId(null);
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, nodes]);

  const sendPrompt = useCallback(
    async (userPrompt: string) => {
      if (!selectedNodeId || !rootDir) return;

      appendUserMessage(userPrompt);
      setStreamStatus("streaming");
      setDiff(null);

      const graph: SerializedParseResult = {
        nodes,
        edges,
        rootDir,
        parsedAt: Date.now(),
        fileCount: Object.keys(nodes).length,
        errors: [],
      };

      try {
        const { requestId } = await window.codemind.startClaudeStream({
          selectedNodeId,
          userPrompt,
          graph,
          maxContextFiles: 6,
        });
        requestIdRef.current = requestId;
        setActiveRequestId(requestId);
      } catch (err) {
        setStreamStatus("error", err instanceof Error ? err.message : String(err));
      }
    },
    [selectedNodeId, rootDir, nodes, edges, appendUserMessage, setStreamStatus, setDiff, setActiveRequestId]
  );

  const cancelStream = useCallback(async () => {
    if (!requestIdRef.current) return;
    await window.codemind.cancelClaudeStream(requestIdRef.current);
    requestIdRef.current = null;
    setActiveRequestId(null);
    setStreamStatus("idle");
  }, [setActiveRequestId, setStreamStatus]);

  return { sendPrompt, cancelStream };
}
