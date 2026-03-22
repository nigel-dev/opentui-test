import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRecorder,
  deleteRecording,
  listRecordings,
  loadRecording,
  type Recording,
  replayRecording,
  saveRecording,
} from "./recorder";

type ReplayDriver = Parameters<typeof replayRecording>[0];

type DriverCall = {
  method: string;
  args: unknown[];
};

function createMockDriver(captureFrames: string[] = ["frame"]): {
  driver: ReplayDriver;
  calls: DriverCall[];
} {
  const calls: DriverCall[] = [];
  const captures = [...captureFrames];

  const driver: ReplayDriver = {
    async launch() {
      calls.push({ method: "launch", args: [] });
    },
    async close() {
      calls.push({ method: "close", args: [] });
    },
    isRunning() {
      calls.push({ method: "isRunning", args: [] });
      return true;
    },
    async sendKeys(keys: string) {
      calls.push({ method: "sendKeys", args: [keys] });
    },
    async pressKey(key: string, modifiers?: Record<string, boolean>) {
      calls.push({ method: "pressKey", args: [key, modifiers] });
    },
    async typeText(text: string, delay?: number) {
      calls.push({ method: "typeText", args: [text, delay] });
    },
    async pressEnter() {
      calls.push({ method: "pressEnter", args: [] });
    },
    async pressEscape() {
      calls.push({ method: "pressEscape", args: [] });
    },
    async pressTab() {
      calls.push({ method: "pressTab", args: [] });
    },
    async pressArrow(direction: "up" | "down" | "left" | "right") {
      calls.push({ method: "pressArrow", args: [direction] });
    },
    async capture() {
      calls.push({ method: "capture", args: [] });
      return captures.shift() ?? "frame";
    },
    async captureWithMeta() {
      calls.push({ method: "captureWithMeta", args: [] });
      return {
        frame: "frame",
        width: 100,
        height: 30,
        timestamp: Date.now(),
      };
    },
    async waitForText(text: string, options?: { timeout?: number; interval?: number }) {
      calls.push({ method: "waitForText", args: [text, options] });
      return true;
    },
    async waitForStable(options?: {
      maxIterations?: number;
      intervalMs?: number;
      stableFrames?: number;
    }) {
      calls.push({ method: "waitForStable", args: [options] });
    },
    async settle() {
      calls.push({ method: "settle", args: [] });
    },
    async resize(cols: number, rows: number) {
      calls.push({ method: "resize", args: [cols, rows] });
    },
    getSize() {
      calls.push({ method: "getSize", args: [] });
      return { width: 100, height: 30 };
    },
  };

  return { driver, calls };
}

describe("createRecorder", () => {
  test("start/stop lifecycle updates isRecording state", () => {
    const recorder = createRecorder(80, 24);

    expect(recorder.isRecording()).toBe(false);
    recorder.start();
    expect(recorder.isRecording()).toBe(true);

    const recording = recorder.stop();

    expect(recorder.isRecording()).toBe(false);
    expect(recording.width).toBe(80);
    expect(recording.height).toBe(24);
  });

  test("addCommand records action, timestamp, and optional params", () => {
    const recorder = createRecorder(80, 24);
    recorder.start();

    recorder.addCommand("pressTab");
    recorder.addCommand("pressKey", { key: "x", modifiers: { ctrl: true } });

    const recording = recorder.stop();
    expect(recording.commands).toHaveLength(2);

    const first = recording.commands[0];
    expect(first?.action).toBe("pressTab");
    expect(typeof first?.timestamp).toBe("number");
    expect(first?.timestamp).toBeGreaterThanOrEqual(0);
    expect(first?.params).toBeUndefined();

    const second = recording.commands[1];
    expect(second?.action).toBe("pressKey");
    expect(second?.params).toEqual({ key: "x", modifiers: { ctrl: true } });
  });

  test("addCommand is no-op when not recording", () => {
    const recorder = createRecorder(80, 24);
    recorder.addCommand("pressEnter");

    expect(recorder.getRecording()).toBeNull();
  });

  test("captureFrame stores last frame while recording", () => {
    const recorder = createRecorder(80, 24);
    recorder.start();
    recorder.captureFrame("frame-1");
    recorder.addCommand("pressEnter");

    const recording = recorder.stop();
    expect(recording.finalFrame).toBe("frame-1");
  });

  test("captureFrame is no-op when not recording", () => {
    const recorder = createRecorder(80, 24, { captureFrames: true });
    recorder.captureFrame("ignored-frame");
    recorder.start();
    recorder.addCommand("pressEnter");

    const recording = recorder.stop();
    expect(recording.finalFrame).toBeUndefined();
    expect(recording.commands[0]?.frameAfter).toBeUndefined();
  });

  test("stop returns Recording with correct metadata and final frame", () => {
    const recorder = createRecorder(100, 30);
    recorder.start();
    recorder.captureFrame("final-ui-frame");
    recorder.addCommand("resize", { cols: 120, rows: 40 });

    const recording = recorder.stop();

    expect(recording.name).toMatch(/^recording-\d+$/);
    expect(Number.isNaN(Date.parse(recording.createdAt))).toBe(false);
    expect(recording.width).toBe(100);
    expect(recording.height).toBe(30);
    expect(recording.commands).toHaveLength(1);
    expect(recording.finalFrame).toBe("final-ui-frame");
  });

  test("getRecording returns null when empty and Recording when commands exist", () => {
    const recorder = createRecorder(80, 24);
    recorder.start();

    expect(recorder.getRecording()).toBeNull();

    recorder.addCommand("pressTab");
    const inProgress = recorder.getRecording();
    expect(inProgress).not.toBeNull();
    expect(inProgress?.commands).toHaveLength(1);
    expect(inProgress?.commands[0]?.action).toBe("pressTab");
  });

  test("captureFrames option populates frameAfter in commands", () => {
    const recorder = createRecorder(80, 24, { captureFrames: true });
    recorder.start();

    recorder.captureFrame("frame-a");
    recorder.addCommand("pressTab");
    recorder.captureFrame("frame-b");
    recorder.addCommand("pressEnter");

    const recording = recorder.stop();
    expect(recording.commands[0]?.frameAfter).toBe("frame-a");
    expect(recording.commands[1]?.frameAfter).toBe("frame-b");
  });

  test("custom name option is used instead of generated name", () => {
    const recorder = createRecorder(80, 24, { name: "custom-session" });
    recorder.start();
    recorder.addCommand("pressEnter");

    const recording = recorder.stop();
    expect(recording.name).toBe("custom-session");
  });
});

describe("recording persistence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "recorder-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("save/load roundtrip preserves data", async () => {
    const input: Recording = {
      name: "roundtrip",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [
        { action: "pressTab", timestamp: 10 },
        { action: "typeText", params: { text: "hello", delay: 5 }, timestamp: 20 },
      ],
      finalFrame: "final-frame",
    };

    const savedPath = await saveRecording(input, tempDir);
    expect(savedPath.endsWith(`${input.name}.json`)).toBe(true);

    const loaded = await loadRecording(input.name, tempDir);
    expect(loaded).toEqual(input);
  });

  test("listRecordings returns saved recording names", async () => {
    const first: Recording = {
      name: "first",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [{ action: "pressEnter", timestamp: 1 }],
    };
    const second: Recording = {
      name: "second",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [{ action: "pressEscape", timestamp: 2 }],
    };

    await saveRecording(first, tempDir);
    await saveRecording(second, tempDir);

    const names = await listRecordings(tempDir);
    expect(names).toContain("first");
    expect(names).toContain("second");
  });

  test("deleteRecording removes existing file and reports missing file", async () => {
    const recording: Recording = {
      name: "delete-me",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [{ action: "pressTab", timestamp: 1 }],
    };

    await saveRecording(recording, tempDir);

    const removed = await deleteRecording(recording.name, tempDir);
    expect(removed).toBe(true);

    const missingNow = await loadRecording(recording.name, tempDir);
    expect(missingNow).toBeNull();

    const removedMissing = await deleteRecording("does-not-exist", tempDir);
    expect(removedMissing).toBe(false);
  });

  test("loadRecording returns null for missing file", async () => {
    const loaded = await loadRecording("not-found", tempDir);
    expect(loaded).toBeNull();
  });
});

describe("replayRecording", () => {
  test("replays commands by calling matching driver methods with args", async () => {
    const { driver, calls } = createMockDriver(["final"]);

    const recording: Recording = {
      name: "replay-all-actions",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 100,
      height: 30,
      commands: [
        { action: "sendKeys", params: { keys: "abc" }, timestamp: 0 },
        { action: "pressKey", params: { key: "x", modifiers: { ctrl: true } }, timestamp: 1 },
        { action: "pressTab", timestamp: 2 },
        { action: "pressEnter", timestamp: 3 },
        { action: "pressEscape", timestamp: 4 },
        { action: "pressArrow", params: { direction: "down" }, timestamp: 5 },
        { action: "typeText", params: { text: "hello", delay: 7 }, timestamp: 6 },
        { action: "resize", params: { cols: 120, rows: 40 }, timestamp: 7 },
        {
          action: "waitForStable",
          params: { maxIterations: 4, intervalMs: 12 },
          timestamp: 8,
        },
        { action: "waitForText", params: { text: "Done", timeout: 900 }, timestamp: 9 },
      ],
    };

    const result = await replayRecording(driver, recording, { speed: Infinity });

    expect(result.success).toBe(true);
    expect(result.commandsExecuted).toBe(10);
    expect(result.totalCommands).toBe(10);
    expect(result.errors).toHaveLength(0);
    expect(result.finalFrame).toBe("final");

    const actionCalls = calls.filter((c) => c.method !== "capture");
    expect(actionCalls.map((c) => c.method)).toEqual([
      "sendKeys",
      "pressKey",
      "pressTab",
      "pressEnter",
      "pressEscape",
      "pressArrow",
      "typeText",
      "resize",
      "waitForStable",
      "waitForText",
    ]);

    expect(actionCalls[0]?.args).toEqual(["abc"]);
    expect(actionCalls[1]?.args).toEqual(["x", { ctrl: true }]);
    expect(actionCalls[5]?.args).toEqual(["down"]);
    expect(actionCalls[6]?.args).toEqual(["hello", 7]);
    expect(actionCalls[7]?.args).toEqual([120, 40]);
    expect(actionCalls[8]?.args).toEqual([{ maxIterations: 4, intervalMs: 12 }]);
    expect(actionCalls[9]?.args).toEqual(["Done", { timeout: 900 }]);
  });

  test("captures command errors and continues replay", async () => {
    const calls: DriverCall[] = [];

    const driver: ReplayDriver = {
      async launch() {},
      async close() {},
      isRunning() {
        return true;
      },
      async sendKeys() {},
      async pressKey() {},
      async typeText() {},
      async pressEnter() {
        calls.push({ method: "pressEnter", args: [] });
        throw new Error("enter failed");
      },
      async pressEscape() {
        calls.push({ method: "pressEscape", args: [] });
      },
      async pressTab() {
        calls.push({ method: "pressTab", args: [] });
      },
      async pressArrow() {},
      async capture() {
        return "final-frame";
      },
      async captureWithMeta() {
        return { frame: "meta", width: 80, height: 24, timestamp: Date.now() };
      },
      async waitForText() {
        return true;
      },
      async waitForStable() {},
      async settle() {},
      async resize() {},
      getSize() {
        return { width: 80, height: 24 };
      },
    };

    const recording: Recording = {
      name: "error-case",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [
        { action: "pressTab", timestamp: 0 },
        { action: "pressEnter", timestamp: 1 },
        { action: "pressEscape", timestamp: 2 },
      ],
    };

    const result = await replayRecording(driver, recording, { speed: Infinity });

    expect(result.success).toBe(false);
    expect(result.commandsExecuted).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.index).toBe(1);
    expect(result.errors[0]?.error).toContain("enter failed");
    expect(calls.map((c) => c.method)).toEqual(["pressTab", "pressEnter", "pressEscape"]);
  });

  test("speed Infinity skips timing delays", async () => {
    const { driver } = createMockDriver(["f1", "f2", "f3", "final"]);
    const recording: Recording = {
      name: "no-delay",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [
        { action: "pressTab", timestamp: 0 },
        { action: "pressEnter", timestamp: 100 },
        { action: "pressEscape", timestamp: 200 },
      ],
    };

    const originalSetTimeout = globalThis.setTimeout;
    let setTimeoutCalls = 0;

    globalThis.setTimeout = ((
      handler: Parameters<typeof setTimeout>[0],
      timeout?: number,
      ...args: unknown[]
    ) => {
      setTimeoutCalls++;
      return originalSetTimeout(handler, timeout, ...args);
    }) as typeof setTimeout;

    try {
      const result = await replayRecording(driver, recording, { speed: Infinity });
      expect(result.success).toBe(true);
      expect(setTimeoutCalls).toBe(0);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("onFrame callback receives frame after each command", async () => {
    const { driver } = createMockDriver(["after-1", "after-2", "final-frame"]);
    const recording: Recording = {
      name: "frames",
      createdAt: "2026-01-01T00:00:00.000Z",
      width: 80,
      height: 24,
      commands: [
        { action: "pressTab", timestamp: 0 },
        { action: "pressEnter", timestamp: 1 },
      ],
    };

    const seen: Array<{ frame: string; action: string }> = [];
    const result = await replayRecording(driver, recording, {
      speed: Infinity,
      onFrame(frame, cmd) {
        seen.push({ frame, action: cmd.action });
      },
    });

    expect(seen).toEqual([
      { frame: "after-1", action: "pressTab" },
      { frame: "after-2", action: "pressEnter" },
    ]);
    expect(result.finalFrame).toBe("final-frame");
  });
});
