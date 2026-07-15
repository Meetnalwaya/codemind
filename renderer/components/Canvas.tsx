// renderer/components/Canvas.tsx
// The visual graph. Converts store nodes/edges into React Flow's shape,
// auto-lays them out in simple columns by kind (good enough for v1 —
// swap in dagre/elk later if repos get large and messy), and wires
// clicks back into the store's selectNode action.

import { useMemo, useCallback } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { useGraphStore } from "../store/graphStore";
import { NodeCard, type NodeCardData } from "./NodeCard";
import type { NodeKind } from "../../shared/types";

const nodeTypes = { fileNode: NodeCard };

const KIND_COLUMN: Record<NodeKind, number> = {
  route: 0,
  controller: 1,
  service: 2,
  hook: 3,
  component: 4,
  util: 5,
  config: 6,
  type: 6,
  unknown: 7,
};

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 110;

export function Canvas() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const streamStatus = useGraphStore((s) => s.streamStatus);
  const diff = useGraphStore((s) => s.diff);
  const selectNode = useGraphStore((s) => s.selectNode);

  const { flowNodes, flowEdges } = useMemo(() => {
    const columnCounts: Record<number, number> = {};

    const flowNodes: Node<NodeCardData>[] = Object.values(nodes).map((node) => {
      const col = KIND_COLUMN[node.kind] ?? 7;
      const row = columnCounts[col] ?? 0;
      columnCounts[col] = row + 1;

      const isSelected = node.id === selectedNodeId;

      return {
        id: node.id,
        type: "fileNode",
        position: { x: col * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        data: {
          node,
          isSelected,
          isStreaming: isSelected && streamStatus === "streaming",
          hasPendingDiff: isSelected && diff !== null,
        },
      };
    });

    const flowEdges: Edge[] = edges.map((edge, i) => ({
      id: `${edge.from}->${edge.to}-${i}`,
      source: edge.from,
      target: edge.to,
      style: { stroke: "#2E3440", strokeWidth: 1.5 },
      animated: false,
    }));

    return { flowNodes, flowEdges };
  }, [nodes, edges, selectedNodeId, streamStatus, diff]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  if (Object.keys(nodes).length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0A0C10]">
        <div className="text-center max-w-sm">
          <div className="text-[15px] text-[#E7E9EE] font-medium mb-1">
            No codebase parsed yet
          </div>
          <div className="text-[13px] text-[#5B6272]">
            Open a folder to build the graph. Every file becomes a node,
            every import becomes an edge.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#0A0C10]">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1C2028" />
        <Controls
          className="!bg-[#181C24] !border-[#262B35] !fill-[#E7E9EE] [&_button]:!border-[#262B35] [&_button]:!bg-[#181C24] [&_button]:hover:!bg-[#20242E]"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#12151B] !border !border-[#262B35]"
          maskColor="rgba(10,12,16,0.7)"
          nodeColor={(n) => (n.data as NodeCardData)?.isSelected ? "#7C9CFF" : "#2E3440"}
        />
      </ReactFlow>
    </div>
  );
}
