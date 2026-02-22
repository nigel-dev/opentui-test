import { createTestRenderer } from "@opentui/core/testing";
import { AppContext, createRoot } from "@opentui/react";
import React, { act, type ReactNode } from "react";

export interface DriverOptions {
  width?: number;
  height?: number;
  app?: ReactNode;
}

export interface CaptureResult {
  frame: string;
  width: number;
  height: number;
  timestamp: number;
}

export interface WaitOptions {
  timeout?: number;
  interval?: number;
}

export interface StableOptions {
  maxIterations?: number;
  intervalMs?: number;
  stableFrames?: number;
}

export interface KeyModifiers {
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  option?: boolean;
}

type TestSetup = Awaited<ReturnType<typeof createTestRenderer>> & {
  root: ReturnType<typeof createRoot> | null;
};

export interface Driver {
  launch(): Promise<void>;
  close(): Promise<void>;
  isRunning(): boolean;

  sendKeys(keys: string): Promise<void>;
  pressKey(key: string, modifiers?: KeyModifiers): Promise<void>;
  typeText(text: string, delay?: number): Promise<void>;
  pressEnter(): Promise<void>;
  pressEscape(): Promise<void>;
  pressTab(): Promise<void>;
  pressArrow(direction: "up" | "down" | "left" | "right"): Promise<void>;

  capture(): Promise<string>;
  captureWithMeta(): Promise<CaptureResult>;

  waitForText(text: string, options?: WaitOptions): Promise<boolean>;
  waitForStable(options?: StableOptions): Promise<void>;
  settle(): Promise<void>;

  resize(cols: number, rows: number): Promise<void>;
  getSize(): { width: number; height: number };
}

function setActEnvironment(value: boolean): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value;
}

export async function createDriver(options: DriverOptions = {}): Promise<Driver> {
  const width = options.width ?? 100;
  const height = options.height ?? 30;

  let testSetup: TestSetup | null = null;
  let currentWidth = width;
  let currentHeight = height;

  const assertRunning = (): TestSetup => {
    if (!testSetup) {
      throw new Error("Driver not launched. Call launch() first.");
    }
    return testSetup;
  };

  const driver: Driver = {
    async launch() {
      if (testSetup) {
        throw new Error("Driver already launched. Call close() first.");
      }

      setActEnvironment(true);

      const coreTestSetup = await createTestRenderer({
        width: currentWidth,
        height: currentHeight,
      });

      const root = createRoot(coreTestSetup.renderer);

      if (options.app) {
        const wrappedApp = React.createElement(
          AppContext.Provider,
          {
            value: {
              keyHandler: coreTestSetup.renderer.keyInput,
              renderer: coreTestSetup.renderer,
            },
          },
          options.app,
        );

        act(() => {
          root.render(wrappedApp);
        });
      }

      testSetup = { ...coreTestSetup, root };
      await testSetup.renderOnce();
    },

    async close() {
      if (testSetup) {
        const setup = testSetup;

        if (setup.root) {
          act(() => {
            setup.root?.unmount();
          });
        }
        setup.renderer.destroy();
        testSetup = null;
        setActEnvironment(false);
      }
    },

    isRunning() {
      return testSetup !== null;
    },

    async sendKeys(keys: string) {
      const setup = assertRunning();

      for (const char of keys) {
        if (char === "\r" || char === "\n") {
          setup.mockInput.pressEnter();
        } else if (char === "\t") {
          setup.mockInput.pressTab();
        } else if (char === "\x1b") {
          setup.mockInput.pressEscape();
        } else if (char === "\x7f") {
          setup.mockInput.pressBackspace();
        } else {
          setup.mockInput.pressKey(char);
        }
      }

      await this.settle();
    },

    async pressKey(key: string, modifiers: KeyModifiers = {}) {
      const setup = assertRunning();
      setup.mockInput.pressKey(key, modifiers);
      await this.settle();
    },

    async typeText(text: string, delay = 0) {
      const setup = assertRunning();
      await setup.mockInput.typeText(text, delay);
      await this.settle();
    },

    async pressEnter() {
      const setup = assertRunning();
      setup.mockInput.pressEnter();
      await this.settle();
    },

    async pressEscape() {
      const setup = assertRunning();
      setup.mockInput.pressEscape();
      await this.settle();
    },

    async pressTab() {
      const setup = assertRunning();
      setup.mockInput.pressTab();
      await this.settle();
    },

    async pressArrow(direction: "up" | "down" | "left" | "right") {
      const setup = assertRunning();
      setup.mockInput.pressArrow(direction);
      await this.settle();
    },

    async capture(): Promise<string> {
      const setup = assertRunning();
      await setup.renderOnce();
      return setup.captureCharFrame();
    },

    async captureWithMeta(): Promise<CaptureResult> {
      const frame = await this.capture();
      return {
        frame,
        width: currentWidth,
        height: currentHeight,
        timestamp: Date.now(),
      };
    },

    async waitForText(text: string, options: WaitOptions = {}): Promise<boolean> {
      const { timeout = 5000, interval = 50 } = options;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        const frame = await this.capture();
        if (frame.includes(text)) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }

      return false;
    },

    async waitForStable(options: StableOptions = {}): Promise<void> {
      const { maxIterations = 10, intervalMs = 50, stableFrames = 2 } = options;
      let lastFrame = "";
      let stableCount = 0;

      for (let i = 0; i < maxIterations; i++) {
        const frame = await this.capture();
        if (frame === lastFrame) {
          stableCount++;
          if (stableCount >= stableFrames) {
            return;
          }
        } else {
          stableCount = 0;
        }
        lastFrame = frame;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    },

    async settle(): Promise<void> {
      const setup = assertRunning();
      await setup.renderOnce();
    },

    async resize(cols: number, rows: number): Promise<void> {
      const setup = assertRunning();
      currentWidth = cols;
      currentHeight = rows;
      setup.resize(cols, rows);
      await this.settle();
    },

    getSize() {
      return { width: currentWidth, height: currentHeight };
    },
  };

  return driver;
}
