// renderer/App.tsx
// Top-level shell: a slim top bar (open folder, parse status), the
// Canvas taking up the rest of the width, and ChatPanel docked right.
// Re-parses automatically whenever DiffViewer applies a change, so the
// graph never goes stale after an edit.

import { useEffect, useState } from "react";
import { Canvas } from "./components/Canvas";
import { ChatPanel } from "./components/ChatPanel";
import { useGraphStore } from "./store/graphStore";

export default function App() {
  const [folderInput, setFolderInput] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const rootDir = useGraphStore((s) => s.rootDir);
  const isParsing = useGraphStore((s) => s.isParsing);
  const parseProgress = useGraphStore((s) => s.parseProgress);
  const reparseSignal = useGraphStore((s) => s.reparseSignal);
  const errors = useGraphStore((s) => s.nodes);

  const setParsing = useGraphStore((s) => s.setParsing);
  const setParseProgress = useGraphStore((s) => s.setParseProgress);
  const setGraph = useGraphStore((s) => s.setGraph);

  useEffect(() => {
    window.codemind.hasApiKey().then((r) => setHasApiKey(r.hasKey));
  }, []);

  useEffect(() => {
    return window.codemind.onParseProgress((parsed, total) => {
      setParseProgress({ parsed, total });
    });
  }, [setParseProgress]);

  const runParse = async (dir: string) => {
    if (!dir.trim()) return;
    setParsing(true);
    const response = await window.codemind.parseCodebase({ rootDir: dir.trim() });
    if (response.ok && response.result) {
      setGraph(response.result.nodes, response.result.edges, response.result.rootDir);
    } else {
      setParsing(false);
      // eslint-disable-next-line no-alert
      alert(response.error ?? "Failed to parse codebase");
    }
  };

  // Re-parse the same root whenever a change gets applied via DiffViewer.
  useEffect(() => {
    if (reparseSignal > 0 && rootDir) {
      void runParse(rootDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reparseSignal]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0A0C10] text-[#E7E9EE] font-sans">
      {/* Top bar */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-3 border-b border-[#262B35] bg-[#12151B]">
        <div className="text-[13px] font-semibold tracking-tight text-[#E7E9EE] pr-2">
          CodeMind
        </div>

        <input
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runParse(folderInput)}
          placeholder="/path/to/your/repo"
          className="flex-1 max-w-[420px] h-8 px-2.5 rounded-md bg-[#181C24] border border-[#262B35] text-[12px] font-mono text-[#E7E9EE] placeholder:text-[#5B6272] focus:outline-none focus:border-[#7C9CFF]"
        />
        <button
          onClick={() => runParse(folderInput)}
          disabled={isParsing || !folderInput.trim()}
          className="h-8 px-3 rounded-md text-[12px] font-medium bg-[#7C9CFF] text-[#0A0C10] disabled:opacity-30 hover:bg-[#93ADFF]"
        >
          {isParsing ? "Parsing…" : "Parse"}
        </button>

        {isParsing && parseProgress && (
          <span className="text-[11px] font-mono text-[#5B6272]">
            {parseProgress.parsed}/{parseProgress.total} files
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {rootDir && (
            <span className="text-[11px] font-mono text-[#5B6272] truncate max-w-[240px]">
              {rootDir} · {Object.keys(errors).length} nodes
            </span>
          )}
          {hasApiKey === false && (
            <span className="text-[11px] text-[#E3B341] bg-[#E3B34114] border border-[#E3B34133] rounded-md px-2 py-1">
              No API key set
            </span>
          )}
        </div>
      </header>

      {/* Main content: graph + chat */}
      <div className="flex-1 flex overflow-hidden">
        <Canvas />
        <ChatPanel />
      </div>
    </div>
  );
}
