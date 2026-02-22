import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Driver } from "./driver.ts";

export interface RecordedCommand {
  action: string;
  params?: Record<string, unknown>;
  timestamp: number;
  frameAfter?: string;
}

export interface Recording {
  name: string;
  createdAt: string;
  width: number;
  height: number;
  commands: RecordedCommand[];
  finalFrame?: string | undefined;
}

export interface RecorderOptions {
  captureFrames?: boolean;
  name?: string;
}

export interface Recorder {
  start(): void;
  stop(): Recording;
  addCommand(action: string, params?: Record<string, unknown>): void;
  captureFrame(frame: string): void;
  isRecording(): boolean;
  getRecording(): Recording | null;
}

export function createRecorder(
  width: number,
  height: number,
  options: RecorderOptions = {},
): Recorder {
  const { captureFrames = false, name = `recording-${Date.now()}` } = options;

  let recording = false;
  let commands: RecordedCommand[] = [];
  let lastFrame: string | undefined;
  const startTime = Date.now();

  return {
    start() {
      recording = true;
      commands = [];
      lastFrame = undefined;
    },

    stop() {
      recording = false;
      const result: Recording = {
        name,
        createdAt: new Date().toISOString(),
        width,
        height,
        commands,
        finalFrame: lastFrame,
      };
      return result;
    },

    addCommand(action: string, params?: Record<string, unknown>) {
      if (!recording) return;

      const cmd: RecordedCommand = {
        action,
        timestamp: Date.now() - startTime,
      };

      if (params && Object.keys(params).length > 0) {
        cmd.params = params;
      }

      if (captureFrames && lastFrame) {
        cmd.frameAfter = lastFrame;
      }

      commands.push(cmd);
    },

    captureFrame(frame: string) {
      if (!recording) return;
      lastFrame = frame;
    },

    isRecording() {
      return recording;
    },

    getRecording() {
      if (commands.length === 0) return null;
      return {
        name,
        createdAt: new Date().toISOString(),
        width,
        height,
        commands,
        finalFrame: lastFrame,
      };
    },
  };
}

export interface ReplayOptions {
  speed?: number;
  stepMode?: boolean;
  onStep?: (cmd: RecordedCommand, index: number, total: number) => Promise<void>;
  onFrame?: (frame: string, cmd: RecordedCommand) => void;
}

export interface ReplayResult {
  success: boolean;
  commandsExecuted: number;
  totalCommands: number;
  errors: Array<{ index: number; command: RecordedCommand; error: string }>;
  finalFrame?: string;
}

export async function replayRecording(
  driver: Driver,
  recording: Recording,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const { speed = 1, stepMode = false, onStep, onFrame } = options;

  const result: ReplayResult = {
    success: true,
    commandsExecuted: 0,
    totalCommands: recording.commands.length,
    errors: [],
  };

  let lastTimestamp = 0;

  for (let i = 0; i < recording.commands.length; i++) {
    const cmd = recording.commands[i];
    if (!cmd) continue;

    if (stepMode && onStep) {
      await onStep(cmd, i, recording.commands.length);
    }

    if (!stepMode && speed < Infinity && cmd.timestamp > lastTimestamp) {
      const delay = (cmd.timestamp - lastTimestamp) / speed;
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    lastTimestamp = cmd.timestamp;

    try {
      await executeCommand(driver, cmd);
      result.commandsExecuted++;

      if (onFrame) {
        const frame = await driver.capture();
        onFrame(frame, cmd);
      }
    } catch (err) {
      result.success = false;
      result.errors.push({
        index: i,
        command: cmd,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    result.finalFrame = await driver.capture();
  } catch {}

  return result;
}

async function executeCommand(driver: Driver, cmd: RecordedCommand): Promise<void> {
  const params = cmd.params ?? {};

  switch (cmd.action) {
    case "sendKeys":
      await driver.sendKeys(String(params.keys ?? ""));
      break;

    case "pressKey":
      await driver.pressKey(
        String(params.key ?? ""),
        params.modifiers as Record<string, boolean> | undefined,
      );
      break;

    case "pressTab":
      await driver.pressTab();
      break;

    case "pressEnter":
      await driver.pressEnter();
      break;

    case "pressEscape":
      await driver.pressEscape();
      break;

    case "pressArrow":
      await driver.pressArrow(params.direction as "up" | "down" | "left" | "right");
      break;

    case "typeText":
      await driver.typeText(
        String(params.text ?? ""),
        typeof params.delay === "number" ? params.delay : 0,
      );
      break;

    case "resize":
      await driver.resize(
        typeof params.cols === "number" ? params.cols : 100,
        typeof params.rows === "number" ? params.rows : 30,
      );
      break;

    case "waitForStable":
      await driver.waitForStable({
        maxIterations: typeof params.maxIterations === "number" ? params.maxIterations : 10,
        intervalMs: typeof params.intervalMs === "number" ? params.intervalMs : 50,
      });
      break;

    case "waitForText":
      await driver.waitForText(String(params.text ?? ""), {
        timeout: typeof params.timeout === "number" ? params.timeout : 5000,
      });
      break;

    default:
      break;
  }
}

const DEFAULT_RECORDINGS_DIR = "./recordings";

export async function saveRecording(
  recording: Recording,
  dir: string = DEFAULT_RECORDINGS_DIR,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${recording.name}.json`);
  await fs.writeFile(filePath, JSON.stringify(recording, null, 2), "utf-8");
  return path.resolve(filePath);
}

export async function loadRecording(
  name: string,
  dir: string = DEFAULT_RECORDINGS_DIR,
): Promise<Recording | null> {
  const filePath = path.join(dir, `${name}.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Recording;
  } catch {
    return null;
  }
}

export async function listRecordings(dir: string = DEFAULT_RECORDINGS_DIR): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

export async function deleteRecording(
  name: string,
  dir: string = DEFAULT_RECORDINGS_DIR,
): Promise<boolean> {
  const filePath = path.join(dir, `${name}.json`);
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}
