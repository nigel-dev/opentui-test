# opentui-test

**Testing framework for [OpenTUI](https://github.com/anthropics/opentui) terminal user interfaces.**

Headless rendering, input simulation, frame capture, golden file assertions, and LLM-driven automation — everything you need to test OpenTUI apps without a real terminal.

[![CI](https://img.shields.io/github/actions/workflow/status/nigel-dev/opentui-test/ci.yml?style=flat-square&label=CI)](https://github.com/nigel-dev/opentui-test/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-runtime-f9f1e1?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)

---

## Why opentui-test?

OpenTUI gives you primitives — a virtual screen buffer, input simulation, frame capture. You're on your own for everything else.

opentui-test gives you the framework:

- **Headless driver** — Mount any OpenTUI app in memory, no terminal needed
- **Input simulation** — Keyboard events that feed into your app's normal handlers
- **Frame capture** — Read the virtual screen back as plain text
- **Golden file assertions** — Snapshot testing with dimension validation
- **Frame diffing** — Line-level and character-level comparison with visual output
- **Recording & replay** — Record interaction sequences and play them back
- **Coverage tracking** — Monitor which views/screens your tests exercise
- **CLI protocol** — JSON-line interface for LLM-driven automation
- **Cross-platform** — Works on macOS, Linux, and Windows

## Install

```bash
bun add -d @nigel-dev/opentui-test
```

Requires [Bun](https://bun.sh) and `@opentui/core`, `@opentui/react`, `react` as peer dependencies.

## Quick Start

### Programmatic API

```typescript
import { createDriver } from "@nigel-dev/opentui-test";

// Launch your app headlessly
const driver = await createDriver({
  width: 80,
  height: 24,
  app: <MyApp />,
});

await driver.launch();
await driver.waitForStable();

// Capture the screen
const frame = await driver.capture();
console.log(frame);

// Simulate input
await driver.pressKey("2");
await driver.waitForStable();

// Capture again
const frame2 = await driver.capture();

await driver.close();
```

### CLI Protocol (for LLM automation)

Create an entry point for your app:

```typescript
#!/usr/bin/env bun
// my-app-driver.ts
import { createDriver } from "@nigel-dev/opentui-test";

const driver = await createDriver({
  width: 80,
  height: 24,
  app: <MyApp />,
});

// Then use the JSON-line protocol from stdin
// (see CLI section below)
```

Or use the built-in generic CLI:

```bash
echo '{"action":"launch","width":80,"height":24}
{"action":"waitForStable"}
{"action":"snapshot","name":"initial"}
{"action":"close"}' | bunx @nigel-dev/opentui-test
```

## API Reference

### `createDriver(options)`

Creates a headless driver for an OpenTUI application.

```typescript
interface DriverOptions {
  width?: number;   // Terminal width (default: 100)
  height?: number;  // Terminal height (default: 30)
  app?: ReactNode;  // Your OpenTUI app element
}

const driver = await createDriver({
  width: 80,
  height: 24,
  app: <MyApp />,
});
```

### Driver Methods

#### Lifecycle

| Method | Description |
|--------|-------------|
| `launch()` | Mount the app and start rendering |
| `close()` | Unmount and clean up |
| `isRunning()` | Check if driver is active |

#### Input Simulation

| Method | Description |
|--------|-------------|
| `pressKey(key, modifiers?)` | Press a single key |
| `typeText(text, delay?)` | Type a string of characters |
| `sendKeys(keys)` | Send a key sequence |
| `pressEnter()` | Press Enter |
| `pressEscape()` | Press Escape |
| `pressTab()` | Press Tab |
| `pressArrow(direction)` | Press an arrow key |

#### Frame Capture

| Method | Description |
|--------|-------------|
| `capture()` | Get current screen as text |
| `captureWithMeta()` | Get screen with width, height, timestamp |

#### Waiting

| Method | Description |
|--------|-------------|
| `waitForStable(options?)` | Wait until two consecutive frames match |
| `waitForText(text, options?)` | Wait for specific text to appear |
| `settle()` | Trigger a single render pass |

#### Terminal

| Method | Description |
|--------|-------------|
| `resize(cols, rows)` | Resize the virtual terminal |
| `getSize()` | Get current dimensions |

### Assertions

```typescript
import { assertSnapshot, diffFrames } from "@nigel-dev/opentui-test";

// Golden file assertion
const result = await assertSnapshot("dashboard", frame, {
  goldenDir: "./golden",
  updateGolden: false,     // Set true to update golden files
  ignoreWhitespace: false,
  width: 80,
  height: 24,
});

if (!result.passed) {
  console.log(result.message);
  console.log(result.visual); // Visual diff output
}

// Frame comparison
const diff = diffFrames(expectedFrame, actualFrame);
console.log(`Changed: ${diff.changedLines}/${diff.totalLines} lines`);
```

### Recording & Replay

```typescript
import { createRecorder, replayRecording } from "@nigel-dev/opentui-test";

// Record a session
const recorder = createRecorder(80, 24, { name: "my-test", captureFrames: true });
recorder.start();
recorder.addCommand("pressKey", { key: "1" });
recorder.addCommand("waitForStable");
const recording = recorder.stop();

// Save and replay
await saveRecording(recording, "./recordings");
const result = await replayRecording(driver, recording, { speed: 2 });
```

### Coverage Tracking

```typescript
import { createCoverageTracker, detectViewFromFrame } from "@nigel-dev/opentui-test";

const tracker = createCoverageTracker(["Dashboard", "Settings", "Help"]);
tracker.start();

// After each navigation
const view = detectViewFromFrame(frame);
if (view) tracker.recordView(view);

const report = tracker.stop();
console.log(`Coverage: ${report.coveragePercentage}%`);
```

## CLI Protocol

The CLI accepts JSON commands via stdin and returns JSON responses on stdout. One command per line.

### Commands

| Action | Parameters | Description |
|--------|------------|-------------|
| `launch` | `width`, `height`, `debug` | Start the headless renderer |
| `close` | — | Stop the renderer |
| `pressKey` | `key`, `modifiers` | Press a single key |
| `typeText` | `text`, `delay` | Type a string |
| `sendKeys` | `keys` | Send key sequence |
| `pressTab` | — | Press Tab |
| `pressEnter` | — | Press Enter |
| `pressEscape` | — | Press Escape |
| `pressArrow` | `direction` | Press arrow key |
| `capture` | `meta`, `save` | Get current frame |
| `snapshot` | `name`, `dir` | Save frame to file |
| `waitForStable` | `maxIterations`, `intervalMs` | Wait for stable frame |
| `waitForText` | `text`, `timeout` | Wait for text to appear |
| `resize` | `cols`, `rows` | Resize terminal |
| `diff` | `file1`/`file2` or `frame1`/`frame2` | Compare two frames |
| `assert` | `name`, `goldenDir`, `update` | Golden file assertion |
| `startRecording` | `name`, `captureFrames` | Start recording |
| `stopRecording` | `dir` | Stop and save recording |
| `replay` | `name`, `dir`, `speed` | Replay a recording |
| `startCoverage` | `knownViews` | Start coverage tracking |
| `stopCoverage` | `visual` | Stop and get report |
| `status` | — | Get driver status |
| `help` | — | List all commands |

### Example: LLM-Driven Testing

```bash
# An AI agent can drive your app like this:
echo '{"action":"launch","width":100,"height":30}
{"action":"waitForStable","maxIterations":15}
{"action":"pressKey","key":"1"}
{"action":"waitForStable"}
{"action":"snapshot","name":"view-1"}
{"action":"pressKey","key":"2"}
{"action":"waitForStable"}
{"action":"snapshot","name":"view-2"}
{"action":"diff","file1":"snapshots/view-1.txt","file2":"snapshots/view-2.txt"}
{"action":"close"}' | bun my-app-driver.ts 2>/dev/null
```

## Golden File Format

Golden files are stored as JSON with terminal dimensions:

```json
{
  "version": 1,
  "width": 80,
  "height": 24,
  "frame": "...",
  "createdAt": "2026-02-22T...",
  "updatedAt": "2026-02-22T..."
}
```

When asserting, the driver validates that the current terminal size matches the golden file's dimensions. Size mismatches fail with a `dimensionMismatch` error.

## File Locations

| Type | Default Path |
|------|-------------|
| Snapshots | `./snapshots/` |
| Golden files | `./golden/` |
| Recordings | `./recordings/` |

## Roadmap

This framework is under active development. See the [issues](https://github.com/nigel-dev/opentui-test/issues) for planned features:

- **Queries & selectors** — `getByText()`, `getByRole()`, positional queries
- **Mouse support** — Click, drag, scroll via OpenTUI's `mockMouse`
- **Rich frame capture** — Colors and styles via `captureSpans()`
- **Test runner integration** — `bun:test` matchers and lifecycle hooks
- **Auto-waiting** — Actions that automatically wait for stable frames
- **Diff masks** — Ignore dynamic regions (timestamps, etc.)
- **Component-level rendering** — `testRender()` wrapper for isolated components
- **Accessibility validation** — Focus order, keyboard reachability
- **Trace viewer** — Step-through debugging with frame history
- **Performance instrumentation** — Render timing and memory tracking

## Development

```bash
bun install          # Install dependencies
bun run typecheck    # TypeScript check
bun run lint         # Biome lint
bun test             # Run tests
```

## Contributing

Contributions welcome! Please:

1. Follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)
2. Run `bun run typecheck && bun run lint` before submitting
3. Add tests for new functionality
4. Open an issue first to discuss larger changes

## License

[MIT](LICENSE)
