// renderer/components/DiffViewer.tsx
// Renders Claude's proposed full-file rewrite as a line diff against
// what's on disk. "Apply" writes it (writer.ts takes a .bak automatically),
// "Discard" just drops the proposal and leaves the file untouched.

import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { useGraphStore } from "../store/graphStore";

export function DiffViewer() {
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const diff = useGraphStore((s) => s.diff);
  const nodes = useGraphStore((s) => s.nodes);
  const setDiff = useGraphStore((s) => s.setDiff);
  const bumpReparseSignal = useGraphStore((s) => s.bumpReparseSignal);

  const changes: Change[] = useMemo(() => {
    if (!diff) return [];
    return diffLines(diff.originalContent, diff.proposedContent);
  }, [diff]);

  if (!diff) return null;
  const node = nodes[diff.nodeId];

  const handleApply = async () => {
    if (!node) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const result = await window.codemind.writeFile({
        absPath: node.absPath,
        content: diff.proposedContent,
        createBackup: true,
      });
      if (!result.ok) {
        setApplyError(result.error ?? "Write failed");
        return;
      }
      setApplied(true);
      bumpReparseSignal();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const handleDiscard = () => setDiff(null);

  const additions = changes.filter((c) => c.added).reduce((n, c) => n + (c.count ?? 0), 0);
  const removals = changes.filter((c) => c.removed).reduce((n, c) => n + (c.count ?? 0), 0);

  return (
    <div className="border border-[#262B35] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#181C24] border-b border-[#262B35]">
        <div className="text-[12px] font-mono text-[#B8BFCC] truncate">
          {node?.path ?? diff.nodeId}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono shrink-0">
          <span className="text-[#3FB950]">+{additions}</span>
          <span className="text-[#F85149]">-{removals}</span>
        </div>
      </div>

      <div className="max-h-[280px] overflow-y-auto font-mono text-[11.5px] leading-[1.5]">
        {changes.map((change, i) => (
          <div
            key={i}
            className={[
              "whitespace-pre-wrap px-3 py-0.5",
              change.added
                ? "bg-[#3FB95020] text-[#8FD9A0]"
                : change.removed
                ? "bg-[#F8514920] text-[#F5A3A0]"
                : "text-[#6B7280]",
            ].join(" ")}
          >
            {change.value.split("\n").filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === "")).map((line, li) => (
              <div key={li}>
                <span className="select-none opacity-60 mr-2">
                  {change.added ? "+" : change.removed ? "-" : " "}
                </span>
                {line}
              </div>
            ))}
          </div>
        ))}
      </div>

      {applyError && (
        <div className="px-3 py-2 text-[12px] text-[#F85149] bg-[#F8514914] border-t border-[#F8514933]">
          {applyError}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 bg-[#181C24] border-t border-[#262B35]">
        {applied ? (
          <span className="text-[12px] text-[#3FB950] font-medium">Applied ✓ — file updated on disk</span>
        ) : (
          <>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-[#3FB950] text-[#0A0C10] disabled:opacity-50 hover:bg-[#4FCB60]"
            >
              {isApplying ? "Applying…" : "Apply"}
            </button>
            <button
              onClick={handleDiscard}
              disabled={isApplying}
              className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-transparent text-[#B8BFCC] border border-[#262B35] hover:border-[#5B6272] disabled:opacity-50"
            >
              Discard
            </button>
          </>
        )}
      </div>
    </div>
  );
}
