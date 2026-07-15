// renderer/store/graphStore.ts
// Single source of truth for the graph, the currently selected node,
// and whatever Claude is doing right now (idle / streaming / has a
// proposed diff waiting for approval).

import { create } from "zustand";
import type { GraphEdge, GraphNodeRecord } from "../../shared/types";

export type StreamStatus = "idle" | "streaming" | "awaiting-approval" | "error";

interface DiffState {
  nodeId: string;
  originalContent: string;
  proposedContent: string;
}

interface GraphState {
  // graph data
  nodes: GraphNodeRecord;
  edges: GraphEdge[];
  rootDir: string | null;
  isParsing: boolean;
  parseProgress: { parsed: number; total: number } | null;

  // selection + chat
  selectedNodeId: string | null;
  chatMessages: { role: "user" | "assistant"; text: string }[];
  streamStatus: StreamStatus;
  streamError: string | null;
  activeRequestId: string | null;
  diff: DiffState | null;
  reparseSignal: number;

  // actions
  setParsing: (isParsing: boolean) => void;
  setParseProgress: (progress: { parsed: number; total: number } | null) => void;
  setGraph: (nodes: GraphNodeRecord, edges: GraphEdge[], rootDir: string) => void;
  selectNode: (nodeId: string | null) => void;
  appendUserMessage: (text: string) => void;
  appendAssistantDelta: (delta: string) => void;
  setStreamStatus: (status: StreamStatus, error?: string) => void;
  setActiveRequestId: (id: string | null) => void;
  setDiff: (diff: DiffState | null) => void;
  clearChat: () => void;
  bumpReparseSignal: () => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: {},
  edges: [],
  rootDir: null,
  isParsing: false,
  parseProgress: null,

  selectedNodeId: null,
  chatMessages: [],
  streamStatus: "idle",
  streamError: null,
  activeRequestId: null,
  diff: null,
  reparseSignal: 0,

  setParsing: (isParsing) => set({ isParsing }),
  setParseProgress: (parseProgress) => set({ parseProgress }),

  setGraph: (nodes, edges, rootDir) =>
    set({ nodes, edges, rootDir, isParsing: false, parseProgress: null }),

  selectNode: (nodeId) =>
    set({
      selectedNodeId: nodeId,
      chatMessages: [],
      streamStatus: "idle",
      streamError: null,
      diff: null,
    }),

  appendUserMessage: (text) =>
    set((s) => ({
      chatMessages: [...s.chatMessages, { role: "user", text }],
    })),

  appendAssistantDelta: (delta) =>
    set((s) => {
      const last = s.chatMessages[s.chatMessages.length - 1];
      if (last && last.role === "assistant") {
        const updated = [...s.chatMessages];
        updated[updated.length - 1] = { role: "assistant", text: last.text + delta };
        return { chatMessages: updated };
      }
      return { chatMessages: [...s.chatMessages, { role: "assistant", text: delta }] };
    }),

  setStreamStatus: (status, error) => set({ streamStatus: status, streamError: error ?? null }),
  setActiveRequestId: (activeRequestId) => set({ activeRequestId }),
  setDiff: (diff) => set({ diff }),

  clearChat: () =>
    set({ chatMessages: [], streamStatus: "idle", streamError: null, diff: null }),

  bumpReparseSignal: () => set((s) => ({ reparseSignal: s.reparseSignal + 1 })),
}));

export function getSelectedNode(state: GraphState) {
  if (!state.selectedNodeId) return null;
  return state.nodes[state.selectedNodeId] ?? null;
}
