import { afterEach, describe, expect, test } from "bun:test";
import React from "react";

import { createDriver } from "./driver.ts";

const launchedDrivers: Array<Awaited<ReturnType<typeof createDriver>>> = [];

const TestApp = () =>
  React.createElement("box", { width: 10, height: 1 }, React.createElement("text", null, "Hello"));

async function makeDriver(options?: Parameters<typeof createDriver>[0]) {
  const driver = await createDriver(options);
  launchedDrivers.push(driver);
  return driver;
}

async function expectRejectsWithMessage(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(pattern);
  }
}

afterEach(async () => {
  while (launchedDrivers.length > 0) {
    const driver = launchedDrivers.pop();
    if (driver?.isRunning()) {
      await driver.close();
    }
  }
});

describe("createDriver integration", () => {
  test("returns a Driver object with the full API", async () => {
    const driver = await makeDriver();

    expect(typeof driver.launch).toBe("function");
    expect(typeof driver.close).toBe("function");
    expect(typeof driver.isRunning).toBe("function");
    expect(typeof driver.sendKeys).toBe("function");
    expect(typeof driver.pressKey).toBe("function");
    expect(typeof driver.typeText).toBe("function");
    expect(typeof driver.pressEnter).toBe("function");
    expect(typeof driver.pressEscape).toBe("function");
    expect(typeof driver.pressTab).toBe("function");
    expect(typeof driver.pressArrow).toBe("function");
    expect(typeof driver.capture).toBe("function");
    expect(typeof driver.captureWithMeta).toBe("function");
    expect(typeof driver.waitForText).toBe("function");
    expect(typeof driver.waitForStable).toBe("function");
    expect(typeof driver.settle).toBe("function");
    expect(typeof driver.resize).toBe("function");
    expect(typeof driver.getSize).toBe("function");
  });

  test("launch and close toggle running state", async () => {
    const driver = await makeDriver();

    expect(driver.isRunning()).toBe(false);

    await driver.launch();
    expect(driver.isRunning()).toBe(true);

    await driver.close();
    expect(driver.isRunning()).toBe(false);
  });

  test("launch twice throws already launched", async () => {
    const driver = await makeDriver();

    await driver.launch();

    await expectRejectsWithMessage(driver.launch(), /already launched/i);
  });

  test("close when not launched is graceful", async () => {
    const driver = await makeDriver();

    await driver.close();
    expect(driver.isRunning()).toBe(false);
  });

  test("methods before launch throw not launched", async () => {
    const driver = await makeDriver();

    await expectRejectsWithMessage(driver.sendKeys("abc"), /not launched/i);
    await expectRejectsWithMessage(driver.pressKey("a"), /not launched/i);
    await expectRejectsWithMessage(driver.typeText("abc"), /not launched/i);
    await expectRejectsWithMessage(driver.pressEnter(), /not launched/i);
    await expectRejectsWithMessage(driver.pressEscape(), /not launched/i);
    await expectRejectsWithMessage(driver.pressTab(), /not launched/i);
    await expectRejectsWithMessage(driver.pressArrow("up"), /not launched/i);
    await expectRejectsWithMessage(driver.capture(), /not launched/i);
    await expectRejectsWithMessage(driver.captureWithMeta(), /not launched/i);
    await expectRejectsWithMessage(driver.waitForText("Hello"), /not launched/i);
    await expectRejectsWithMessage(driver.waitForStable(), /not launched/i);
    await expectRejectsWithMessage(driver.settle(), /not launched/i);
    await expectRejectsWithMessage(driver.resize(80, 24), /not launched/i);
  });
});

describe("frame capture", () => {
  test("capture returns a string", async () => {
    const driver = await makeDriver();
    await driver.launch();

    const frame = await driver.capture();

    expect(typeof frame).toBe("string");
  });

  test("captureWithMeta returns frame and dimensions", async () => {
    const driver = await makeDriver();
    await driver.launch();

    const result = await driver.captureWithMeta();

    expect(typeof result.frame).toBe("string");
    expect(result.width).toBe(100);
    expect(result.height).toBe(30);
    expect(typeof result.timestamp).toBe("number");
    expect(result.timestamp).toBeGreaterThan(0);
  });

  test("custom dimensions are applied", async () => {
    const driver = await makeDriver({ width: 80, height: 24 });
    await driver.launch();

    const result = await driver.captureWithMeta();

    expect(result.width).toBe(80);
    expect(result.height).toBe(24);
  });
});

describe("input", () => {
  test("press and typing APIs do not throw", async () => {
    const driver = await makeDriver();
    await driver.launch();

    await driver.pressKey("a");
    await driver.pressEnter();
    await driver.pressEscape();
    await driver.pressTab();
    await driver.pressArrow("up");
    await driver.pressArrow("down");
    await driver.pressArrow("left");
    await driver.pressArrow("right");
    await driver.typeText("hello");
    await driver.sendKeys("a\rb\t\x1bc\x7f");
  });
});

describe("waiting", () => {
  test("waitForStable resolves for a stable frame", async () => {
    const driver = await makeDriver();
    await driver.launch();

    await driver.waitForStable();
  });

  test("settle resolves", async () => {
    const driver = await makeDriver();
    await driver.launch();

    await driver.settle();
  });
});

describe("resize", () => {
  test("getSize returns initial dimensions and updates after resize", async () => {
    const driver = await makeDriver();
    await driver.launch();

    expect(driver.getSize()).toEqual({ width: 100, height: 30 });

    await driver.resize(80, 24);

    expect(driver.getSize()).toEqual({ width: 80, height: 24 });
  });
});

describe("app rendering", () => {
  test("capture, waitForText found, and waitForText missing", async () => {
    const driver = await makeDriver({ app: React.createElement(TestApp) });
    await driver.launch();

    const frame = await driver.capture();
    expect(frame).toContain("Hello");

    const foundHello = await driver.waitForText("Hello", { timeout: 500, interval: 10 });
    expect(foundHello).toBe(true);

    const foundMissing = await driver.waitForText("Missing", { timeout: 100, interval: 10 });
    expect(foundMissing).toBe(false);
  }, 30000);
});
