import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, "..", "logs");

export const debugLogFile = path.join(logsDir, "game-debug.jsonl");

let writeQueue = Promise.resolve();

function safeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  return value;
}

export function logDebugEvent(type, payload = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    payload: safeValue(payload)
  };

  writeQueue = writeQueue
    .then(async () => {
      await mkdir(logsDir, { recursive: true });
      await appendFile(debugLogFile, `${JSON.stringify(entry)}\n`, "utf8");
    })
    .catch(() => {});

  return writeQueue;
}
