export {
  type AssertOptions,
  type AssertResult,
  assertSnapshot,
  deleteGoldenFile,
  type GoldenFile,
  type GoldenFileInfo,
  getGoldenFile,
  listGoldenFiles,
} from "./assertions.ts";
export {
  type CoverageReport,
  type CoverageTracker,
  createCoverageTracker,
  detectViewFromFrame,
  formatCoverageReport,
  type ViewVisit,
} from "./coverage.ts";

export {
  createCharDiff,
  type DiffOptions,
  type DiffResult,
  diffFrames,
  highlightDiff,
  type LineChange,
} from "./diff.ts";
export {
  type CaptureResult,
  createDriver,
  type Driver,
  type DriverOptions,
  type KeyModifiers,
  type StableOptions,
  type WaitOptions,
} from "./driver.ts";

export {
  createRecorder,
  deleteRecording,
  listRecordings,
  loadRecording,
  type RecordedCommand,
  type Recorder,
  type RecorderOptions,
  type Recording,
  type ReplayOptions,
  type ReplayResult,
  replayRecording,
  saveRecording,
} from "./recorder.ts";
