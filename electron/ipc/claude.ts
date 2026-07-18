// electron/ipc/claude.ts
// IPC handler: the heart of "select a node, describe a change, get code."

import { ipcMain, BrowserWindow, safeStorage } from "electron";
import { promises as fs } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { IPC_CHANNELS } from "../../shared/types";
import type {
  ClaudeStreamRequest,
  ClaudeStreamChunk,
  GraphNodeRecord,
} from "../../shared/types";
import { getConnectedNodeIds } from "../parser/graph";
import { sampleCodeStyle } from "../parser/stylesampler";

const activeStreams = new Map<string, AbortController>();

// ---- API key storage (electron safeStorage = OS keychain-backed encryption) ----

let cachedApiKey: string | null = null;

export function setApiKey(plainTextKey: string): Buffer {
  cachedApiKey = plainTextKey;
  return safeStorage.encryptString(plainTextKey);
}

export function loadApiKey(encrypted: Buffer | null): void {
  if (!encrypted) return;
  try {
    cachedApiKey = safeStorage.decryptString(encrypted);
  } catch {
    cachedApiKey = null;
  }
}

function getClient(): Anthropic {
  if (!cachedApiKey) {
    throw new Error("No Claude API key configured. Add one in Settings first.");
  }
  return new Anthropic({ apiKey: cachedApiKey });
}

// ---- Prompt assembly ----

const SYSTEM_PROMPT_TEMPLATE = `You are a senior TypeScript developer working on this codebase.

Selected file: {{selectedPath}}
File content:
{{selectedContent}}

Connected files:
{{connectedContent}}

Codebase style samples:
{{styleSamples}}

Full graph summary:
{{graphSummary}}

The user will ask you to add features or fix bugs.
Write code that follows the EXACT same patterns, naming conventions,
and file structure you see above. Never introduce new dependencies
unless there is truly no way to accomplish the task without one, and
if you do, say so explicitly before the code block.

Respond with a brief explanation, then a single fenced code block
containing the COMPLETE new content of the selected file (not a diff,
not a snippet — the full file, ready to write to disk).`;

function summarizeGraph(nodes: GraphNodeRecord, edgeCount: number): string {
  const lines = Object.values(nodes)
    .slice(0, 200) // cap prompt size on very large repos
    .map((n) => `- ${n.path} [${n.kind}] exports: ${n.exports.join(", ") || "(none)"}`);
  return `${lines.length} files shown, ${edgeCount} import edges total.\n${lines.join("\n")}`;
}

async function buildSystemPrompt(request: ClaudeStreamRequest): Promise<string> {
  const { graph, selectedNodeId } = request;
  const selectedNode = graph.nodes[selectedNodeId];

  if (!selectedNode) {
    throw new Error(`Selected node "${selectedNodeId}" not found in graph`);
  }

  const selectedContent = await fs.readFile(selectedNode.absPath, "utf-8");

  const connectedIds = getConnectedNodeIds(
    selectedNodeId,
    graph.edges,
    request.maxContextFiles ?? 6
  );
  const connectedNodes = connectedIds.map((id) => graph.nodes[id]).filter(Boolean);

  const connectedContent = (
    await Promise.all(
      connectedNodes.map(async (n) => {
        const content = await fs.readFile(n.absPath, "utf-8");
        return `// FILE: ${n.path} (${n.kind})\n${content.slice(0, 3000)}`;
      })
    )
  ).join("\n\n---\n\n");

  const styleSamples = await sampleCodeStyle(Object.values(graph.nodes), 3);
  const graphSummary = summarizeGraph(graph.nodes, graph.edges.length);

  return SYSTEM_PROMPT_TEMPLATE.replace("{{selectedPath}}", selectedNode.path)
    .replace("{{selectedContent}}", selectedContent)
    .replace("{{connectedContent}}", connectedContent || "(no connected files)")
    .replace("{{styleSamples}}", styleSamples || "(not enough files to sample)")
    .replace("{{graphSummary}}", graphSummary);
}

/** Pulls the content of the LAST fenced code block out of the full
 *  response text — that's the "complete new file" per our system prompt. */
function extractProposedContent(fullText: string): string | undefined {
  const fenceRegex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(fullText)) !== null) {
    lastMatch = match;
  }
  return lastMatch ? lastMatch[1] : undefined;
}

export function registerClaudeHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_STREAM_START,
    async (event, request: ClaudeStreamRequest): Promise<{ requestId: string }> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const requestId = randomUUID();
      const controller = new AbortController();
      activeStreams.set(requestId, controller);

      const send = (chunk: ClaudeStreamChunk) => {
        window?.webContents.send(IPC_CHANNELS.CLAUDE_STREAM_CHUNK, chunk);
      };

      // Fire the stream asynchronously; handle() returns requestId immediately
      // so the renderer can start listening on the chunk channel right away.
      (async () => {
        let fullText = "";
        try {
          const client = getClient();
          const systemPrompt = await buildSystemPrompt(request);

          const stream = client.messages.stream(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 8000,
              system: systemPrompt,
              messages: [{ role: "user", content: request.userPrompt }],
            },
            { signal: controller.signal }
          );

          stream.on("text", (textDelta) => {
            fullText += textDelta;
            send({ requestId, type: "text", textDelta });
          });

          await stream.finalMessage();

          send({
            requestId,
            type: "done",
            proposedContent: extractProposedContent(fullText),
          });
        } catch (err) {
          if (controller.signal.aborted) {
            send({ requestId, type: "error", error: "Cancelled" });
          } else {
            send({
              requestId,
              type: "error",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } finally {
          activeStreams.delete(requestId);
        }
      })();

      return { requestId };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_STREAM_CANCEL,
    async (_event, requestId: string) => {
      const controller = activeStreams.get(requestId);
      if (controller) {
        controller.abort();
        activeStreams.delete(requestId);
        return { ok: true };
      }
      return { ok: false, error: "No active stream with that id" };
    }
  );
}
