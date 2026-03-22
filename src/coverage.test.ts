import { beforeEach, describe, expect, test } from "bun:test";
import {
  type CoverageReport,
  createCoverageTracker,
  detectViewFromFrame,
  formatCoverageReport,
} from "./coverage";

const realDateNow = Date.now;
let now = 0;

beforeEach(() => {
  now = 1_000;
  Date.now = () => now;
});

describe("createCoverageTracker", () => {
  test("start()/stop() lifecycle updates tracking state", () => {
    const tracker = createCoverageTracker();

    expect(tracker.isTracking()).toBe(false);

    tracker.start();
    expect(tracker.isTracking()).toBe(true);

    const report = tracker.stop();
    expect(tracker.isTracking()).toBe(false);
    expect(report.sessionStart).toBe(1_000);
    expect(report.sessionEnd).toBe(1_000);
  });

  test("recordView() adds visit and increments count", () => {
    const tracker = createCoverageTracker();
    tracker.start();

    tracker.recordView("Dashboard");

    const report = tracker.getReport();
    expect(report.viewsVisited).toHaveLength(1);
    expect(report.viewsVisited[0]).toEqual({ view: "Dashboard", visitedAt: 1_000 });
    expect(report.viewCounts).toEqual({ Dashboard: 1 });
    expect(report.uniqueViews).toEqual(["Dashboard"]);
    expect(report.totalViewChanges).toBe(1);
  });

  test("recordView() with same view twice deduplicates and does not increment", () => {
    const tracker = createCoverageTracker();
    tracker.start();

    tracker.recordView("Dashboard");
    now += 500;
    tracker.recordView("Dashboard");

    const report = tracker.getReport();
    expect(report.viewsVisited).toHaveLength(1);
    expect(report.viewCounts).toEqual({ Dashboard: 1 });
    expect(report.totalViewChanges).toBe(1);
    expect(tracker.getCurrentView()).toBe("Dashboard");
  });

  test("recordView() with different views tracks all and closes previous duration", () => {
    const tracker = createCoverageTracker();
    tracker.start();

    tracker.recordView("Dashboard");
    now += 2_000;
    tracker.recordView("Providers");

    const report = tracker.getReport();
    expect(report.viewsVisited).toHaveLength(2);
    expect(report.viewsVisited[0]?.duration).toBe(2_000);
    expect(report.viewsVisited[1]?.duration).toBeUndefined();
    expect(report.uniqueViews).toEqual(["Dashboard", "Providers"]);
    expect(report.viewCounts).toEqual({ Dashboard: 1, Providers: 1 });
    expect(report.totalViewChanges).toBe(2);
  });

  test("getCurrentView() returns current view or null", () => {
    const tracker = createCoverageTracker();
    expect(tracker.getCurrentView()).toBeNull();

    tracker.start();
    expect(tracker.getCurrentView()).toBeNull();

    tracker.recordView("Trends");
    expect(tracker.getCurrentView()).toBe("Trends");
  });

  test("getReport() returns expected structure while tracking", () => {
    const tracker = createCoverageTracker();
    tracker.start();
    tracker.recordView("Dashboard");
    now += 100;
    tracker.recordView("Projects");

    const report = tracker.getReport();
    expect(report).toMatchObject({
      sessionStart: 1_000,
      sessionEnd: undefined,
      uniqueViews: ["Dashboard", "Projects"],
      viewCounts: { Dashboard: 1, Projects: 1 },
      totalViewChanges: 2,
    });
    expect(report.coveragePercentage).toBe(40);
    expect(Array.isArray(report.viewsVisited)).toBe(true);
  });

  test("stop() calculates duration on last active view", () => {
    const tracker = createCoverageTracker();
    tracker.start();

    tracker.recordView("Settings");
    now += 750;

    const report = tracker.stop();
    expect(report.viewsVisited[0]?.duration).toBe(750);
    expect(report.sessionEnd).toBe(1_750);
  });

  test("coveragePercentage uses default known views", () => {
    const tracker = createCoverageTracker();
    tracker.start();

    tracker.recordView("Dashboard");
    tracker.recordView("Providers");

    const report = tracker.getReport();
    expect(report.coveragePercentage).toBe(40);
  });

  test("custom knownViews changes percentage calculation", () => {
    const tracker = createCoverageTracker(["Home", "Settings"]);
    tracker.start();

    tracker.recordView("Settings");
    tracker.recordView("Dashboard");

    const report = tracker.getReport();
    expect(report.uniqueViews).toEqual(["Settings", "Dashboard"]);
    expect(report.coveragePercentage).toBe(50);
  });

  test("empty knownViews sets coveragePercentage to undefined", () => {
    const tracker = createCoverageTracker([]);
    tracker.start();
    tracker.recordView("Dashboard");

    const report = tracker.getReport();
    expect(report.coveragePercentage).toBeUndefined();
  });

  test("recordView when not tracking is a no-op", () => {
    const tracker = createCoverageTracker();
    tracker.recordView("Dashboard");

    const report = tracker.getReport();
    expect(report.viewsVisited).toEqual([]);
    expect(report.viewCounts).toEqual({});
    expect(report.totalViewChanges).toBe(0);
    expect(tracker.getCurrentView()).toBeNull();
  });
});

describe("detectViewFromFrame", () => {
  test("detects view from [1] Dashboard header pattern", () => {
    const frame = [
      "┌──────────────────────────────────────────────────────────┐",
      "│ [1] Dashboard │ [2] Providers │ [3] Trends │ [4] Projects │",
      "│                                                          │",
      "│ content: welcome screen                                  │",
      "└──────────────────────────────────────────────────────────┘",
    ].join("\n");

    expect(detectViewFromFrame(frame)).toBe("Dashboard");
  });

  test("detects known view from body content", () => {
    const frame = ["App Header", "Providers", "Providers view", "Some detail text", "Footer"].join(
      "\n",
    );

    expect(detectViewFromFrame(frame)).toBe("Providers");
  });

  test("returns null when frame has no recognizable view", () => {
    const frame = ["App Header", "Metrics", "No view identifiers", "Footer"].join("\n");
    expect(detectViewFromFrame(frame)).toBeNull();
  });

  test("edge cases: partial match and lowercase-only content do not match", () => {
    const partialFrame = ["Header", "Dash", "Provider", "Footer"].join("\n");
    const lowercaseFrame = ["header", "dashboard view", "providers view", "footer"].join("\n");

    expect(detectViewFromFrame(partialFrame)).toBeNull();
    expect(detectViewFromFrame(lowercaseFrame)).toBeNull();
  });
});

describe("formatCoverageReport", () => {
  test("includes box drawing, session duration, view counts, and coverage", () => {
    const report: CoverageReport = {
      sessionStart: 1_000,
      sessionEnd: 3_500,
      viewsVisited: [
        { view: "Dashboard", visitedAt: 1_000, duration: 2_000 },
        { view: "Settings", visitedAt: 3_000, duration: 500 },
      ],
      uniqueViews: ["Dashboard", "Settings"],
      viewCounts: { Dashboard: 1, Settings: 1 },
      totalViewChanges: 2,
      coveragePercentage: 40,
    };

    const text = formatCoverageReport(report);

    expect(text).toContain("╔");
    expect(text).toContain("╚");
    expect(text).toContain("Session Duration: 2.5s");
    expect(text).toContain("Views Visited: 2 unique, 2 total");
    expect(text).toContain("Coverage: 40%");
    expect(text).toContain("Dashboard: 1x (2.0s)");
    expect(text).toContain("Settings: 1x (0.5s)");
  });
});

Date.now = realDateNow;
