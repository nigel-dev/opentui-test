export interface ViewVisit {
  view: string;
  visitedAt: number;
  duration?: number;
}

export interface CoverageReport {
  sessionStart: number;
  sessionEnd?: number | undefined;
  viewsVisited: ViewVisit[];
  uniqueViews: string[];
  viewCounts: Record<string, number>;
  totalViewChanges: number;
  coveragePercentage?: number | undefined;
}

export interface CoverageTracker {
  start(): void;
  stop(): CoverageReport;
  recordView(view: string): void;
  getCurrentView(): string | null;
  getReport(): CoverageReport;
  isTracking(): boolean;
}

/**
 * Create a coverage tracker for monitoring view navigation during test sessions.
 *
 * @param knownViews - The complete list of views in your app. Used to calculate
 *   coverage percentage (views visited / total views). Pass your app's view names
 *   e.g. `["Home", "Settings", "Profile"]`. If empty, coveragePercentage will be undefined.
 */
export function createCoverageTracker(knownViews: string[] = []): CoverageTracker {
  let tracking = false;
  let sessionStart = 0;
  let currentView: string | null = null;
  let currentViewStart = 0;
  const viewsVisited: ViewVisit[] = [];
  const viewCounts: Record<string, number> = {};

  function buildReport(): CoverageReport {
    const uniqueViews = [...new Set(viewsVisited.map((v) => v.view))];
    const coveragePercentage =
      knownViews.length > 0
        ? (uniqueViews.filter((v) => knownViews.includes(v)).length / knownViews.length) * 100
        : undefined;

    return {
      sessionStart,
      sessionEnd: tracking ? undefined : Date.now(),
      viewsVisited: [...viewsVisited],
      uniqueViews,
      viewCounts: { ...viewCounts },
      totalViewChanges: viewsVisited.length,
      coveragePercentage,
    };
  }

  return {
    start() {
      tracking = true;
      sessionStart = Date.now();
      currentView = null;
      currentViewStart = 0;
      viewsVisited.length = 0;
      for (const k of Object.keys(viewCounts)) {
        delete viewCounts[k];
      }
    },

    stop() {
      if (currentView && currentViewStart > 0) {
        const lastVisit = viewsVisited[viewsVisited.length - 1];
        if (lastVisit && lastVisit.view === currentView) {
          lastVisit.duration = Date.now() - currentViewStart;
        }
      }
      tracking = false;
      return buildReport();
    },

    recordView(view: string) {
      if (!tracking) return;
      if (view === currentView) return;

      const now = Date.now();

      if (currentView && currentViewStart > 0) {
        const lastVisit = viewsVisited[viewsVisited.length - 1];
        if (lastVisit && lastVisit.view === currentView) {
          lastVisit.duration = now - currentViewStart;
        }
      }

      currentView = view;
      currentViewStart = now;
      viewsVisited.push({ view, visitedAt: now });
      viewCounts[view] = (viewCounts[view] ?? 0) + 1;
    },

    getCurrentView() {
      return currentView;
    },

    getReport() {
      return buildReport();
    },

    isTracking() {
      return tracking;
    },
  };
}

export function detectViewFromFrame(frame: string, knownViews: string[] = []): string | null {
  const lines = frame.split("\n").slice(0, 5);
  const headerArea = lines.join("\n");

  const numberedViewPattern = /\[(\d)\] (\w+)/g;
  const matches = headerArea.match(numberedViewPattern);
  if (matches && headerArea.includes("│")) {
    for (const m of matches) {
      const viewMatch = m.match(/\[(\d)\] (\w+)/);
      if (viewMatch) {
        const num = viewMatch[1];
        const name = viewMatch[2];
        if (
          headerArea.includes(`[${num}]`) &&
          frame.toLowerCase().includes(name?.toLowerCase() ?? "")
        ) {
          if (headerArea.includes(`[${num}] ${name}`) && !headerArea.includes(`│ ${name}`)) {
            return name ?? null;
          }
        }
      }
    }
  }

  for (const view of knownViews) {
    if (frame.includes(`${view} `) || frame.includes(` ${view}`)) {
      const viewLower = view.toLowerCase();
      const frameLower = frame.toLowerCase();
      if (
        frameLower.includes(`${viewLower} view`) ||
        frameLower.includes(`${viewLower}:`) ||
        (frameLower.includes(viewLower) && lines.some((l) => l.includes(view)))
      ) {
        return view;
      }
    }
  }

  return null;
}

export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════════╗",
    "║ COVERAGE REPORT                                                  ║",
    "╠══════════════════════════════════════════════════════════════════╣",
  ];

  const duration = (report.sessionEnd ?? Date.now()) - report.sessionStart;
  const durationSec = (duration / 1000).toFixed(1);

  lines.push(`${`║ Session Duration: ${durationSec}s`.padEnd(67)}║`);
  lines.push(
    `${`║ Views Visited: ${report.uniqueViews.length} unique, ${report.totalViewChanges} total`.padEnd(
      67,
    )}║`,
  );

  if (report.coveragePercentage !== undefined) {
    lines.push(`${`║ Coverage: ${report.coveragePercentage.toFixed(0)}%`.padEnd(67)}║`);
  }

  lines.push("╠══════════════════════════════════════════════════════════════════╣");
  lines.push("║ View Breakdown:                                                  ║");

  for (const [view, count] of Object.entries(report.viewCounts).sort((a, b) => b[1] - a[1])) {
    const visits = report.viewsVisited.filter((v) => v.view === view);
    const totalTime = visits.reduce((sum, v) => sum + (v.duration ?? 0), 0);
    const timeStr = totalTime > 0 ? ` (${(totalTime / 1000).toFixed(1)}s)` : "";
    lines.push(`${`║   ${view}: ${count}x${timeStr}`.padEnd(67)}║`);
  }

  lines.push("╚══════════════════════════════════════════════════════════════════╝");

  return lines.join("\n");
}
