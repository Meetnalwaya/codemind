// renderer/components/NodeCard.tsx
// Custom React Flow node renderer for a single source file.
// The signature interaction: while Claude is streaming a rewrite into
// this file, the card gets a soft animated ring — the graph itself
// shows you where the AI is "typing" right now.

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import type { GraphNode, NodeKind } from "../../shared/types";

const KIND_COLOR: Record<NodeKind, string> = {
  route: "#7C9CFF",
  controller: "#F0883E",
  service: "#C792EA",
  component: "#4FD1C5",
  hook: "#F472B6",
  util: "#E3B341",
  config: "#9CA3AF",
  type: "#64748B",
  unknown: "#4B5563",
};

export interface NodeCardData {
  node: GraphNode;
  isSelected: boolean;
  isStreaming: boolean;
  hasPendingDiff: boolean;
}

function NodeCardImpl({ data }: NodeProps<NodeCardData>) {
  const { node, isSelected, isStreaming, hasPendingDiff } = data;
  const color = KIND_COLOR[node.kind];
  const fileName = node.path.split("/").pop() ?? node.path;
  const dirName = node.path.slice(0, node.path.length - fileName.length);

  return (
    <div
      className={[
        "group relative w-[220px] rounded-lg border px-3 py-2.5 transition-shadow duration-200",
        "bg-[#181C24] border-[#262B35]",
        isSelected ? "ring-2 ring-offset-0" : "",
      ].join(" ")}
      style={{
        boxShadow: isStreaming
          ? `0 0 0 2px ${color}55, 0 0 18px 2px #4ADE8066`
          : isSelected
          ? `0 0 0 2px ${color}`
          : undefined,
        animation: isStreaming ? "codemind-pulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />

      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] uppercase tracking-wide text-[#838B9C] font-medium">
          {node.kind}
        </span>
        {hasPendingDiff && (
          <span className="ml-auto text-[10px] font-medium text-[#E3B341]">● diff</span>
        )}
      </div>

      <div className="font-mono text-[13px] text-[#E7E9EE] leading-tight truncate" title={node.path}>
        {fileName}
      </div>
      {dirName && (
        <div className="font-mono text-[10px] text-[#5B6272] truncate" title={dirName}>
          {dirName}
        </div>
      )}

      {node.exports.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {node.exports.slice(0, 3).map((name) => (
            <span
              key={name}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#12151B] text-[#838B9C] border border-[#262B35]"
            >
              {name}
            </span>
          ))}
          {node.exports.length > 3 && (
            <span className="text-[10px] text-[#5B6272]">+{node.exports.length - 3}</span>
          )}
        </div>
      )}

      <style>{`
        @keyframes codemind-pulse {
          0%, 100% { box-shadow: 0 0 0 2px ${color}55, 0 0 14px 1px #4ADE8055; }
          50% { box-shadow: 0 0 0 2px ${color}88, 0 0 22px 4px #4ADE8099; }
        }
      `}</style>
    </div>
  );
}

const handleStyle = {
  width: 6,
  height: 6,
  background: "#5B6272",
  border: "none",
};

export const NodeCard = memo(NodeCardImpl);
