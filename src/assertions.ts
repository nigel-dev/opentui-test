import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type DiffResult, diffFrames, highlightDiff } from "./diff.ts";

const DEFAULT_GOLDEN_DIR = "./golden";

export interface GoldenFile {
  version: 1;
  width: number;
  height: number;
  frame: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssertResult {
  passed: boolean;
  goldenExists: boolean;
  diff?: DiffResult;
  visual?: string;
  goldenPath: string;
  message: string;
  dimensionMismatch?: {
    expected: { width: number; height: number };
    actual: { width: number; height: number };
  };
}

export interface AssertOptions {
  goldenDir?: string;
  updateGolden?: boolean;
  ignoreWhitespace?: boolean;
  width?: number;
  height?: number;
}

function parseGoldenFile(content: string): GoldenFile | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.version === 1 && typeof parsed.frame === "string") {
      return parsed as GoldenFile;
    }
    return null;
  } catch {
    return null;
  }
}

function createGoldenContent(
  frame: string,
  width: number,
  height: number,
  existingCreatedAt?: string,
): string {
  const now = new Date().toISOString();
  const golden: GoldenFile = {
    version: 1,
    width,
    height,
    frame,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
  return JSON.stringify(golden, null, 2);
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function tryUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {}
}

export async function assertSnapshot(
  name: string,
  actual: string,
  options: AssertOptions = {},
): Promise<AssertResult> {
  const {
    goldenDir = DEFAULT_GOLDEN_DIR,
    updateGolden = false,
    ignoreWhitespace = false,
    width,
    height,
  } = options;

  const goldenPath = path.join(goldenDir, `${name}.golden.json`);
  const legacyPath = path.join(goldenDir, `${name}.golden.txt`);

  await fs.mkdir(goldenDir, { recursive: true });

  let goldenExists = false;
  let golden: GoldenFile | null = null;
  let actualGoldenPath = goldenPath;
  let legacyContent: string | null = null;

  const jsonContent = await tryReadFile(goldenPath);
  if (jsonContent !== null) {
    golden = parseGoldenFile(jsonContent);
    goldenExists = true;
  } else {
    legacyContent = await tryReadFile(legacyPath);
    if (legacyContent !== null) {
      goldenExists = true;
      actualGoldenPath = legacyPath;
    }
  }

  if (!goldenExists || updateGolden) {
    if (width === undefined || height === undefined) {
      return {
        passed: false,
        goldenExists,
        goldenPath: path.resolve(goldenPath),
        message: "Cannot create golden file: width and height are required",
      };
    }

    const content = createGoldenContent(actual, width, height, golden?.createdAt);
    await fs.writeFile(goldenPath, content, "utf-8");

    if (actualGoldenPath === legacyPath) {
      await tryUnlink(legacyPath);
    }

    const action = goldenExists ? "Updated" : "Created new";
    return {
      passed: true,
      goldenExists: !!goldenExists,
      goldenPath: path.resolve(goldenPath),
      message: `${action} golden file: ${goldenPath} (${width}x${height})`,
    };
  }

  if (golden === null && legacyContent !== null) {
    const diff = diffFrames(legacyContent, actual, { ignoreWhitespace });

    if (diff.identical) {
      return {
        passed: true,
        goldenExists: true,
        diff,
        goldenPath: path.resolve(actualGoldenPath),
        message: `Snapshot matches golden file (legacy format - consider updating with dimensions)`,
      };
    }

    return {
      passed: false,
      goldenExists: true,
      diff,
      visual: highlightDiff(legacyContent, actual, { ignoreWhitespace }),
      goldenPath: path.resolve(actualGoldenPath),
      message: `Snapshot differs from golden file (legacy format): ${diff.changedLines}/${diff.totalLines} lines changed (${diff.changePercentage.toFixed(1)}%)`,
    };
  }

  if (golden === null) {
    return {
      passed: false,
      goldenExists: false,
      goldenPath: path.resolve(goldenPath),
      message: "Golden file is corrupted or in unknown format",
    };
  }

  if (width !== undefined && height !== undefined) {
    if (golden.width !== width || golden.height !== height) {
      return {
        passed: false,
        goldenExists: true,
        goldenPath: path.resolve(goldenPath),
        message: `Terminal size mismatch: golden was captured at ${golden.width}x${golden.height}, current is ${width}x${height}`,
        dimensionMismatch: {
          expected: { width: golden.width, height: golden.height },
          actual: { width, height },
        },
      };
    }
  }

  const diff = diffFrames(golden.frame, actual, { ignoreWhitespace });

  if (diff.identical) {
    return {
      passed: true,
      goldenExists: true,
      diff,
      goldenPath: path.resolve(goldenPath),
      message: `Snapshot matches golden file (${golden.width}x${golden.height})`,
    };
  }

  return {
    passed: false,
    goldenExists: true,
    diff,
    visual: highlightDiff(golden.frame, actual, { ignoreWhitespace }),
    goldenPath: path.resolve(goldenPath),
    message: `Snapshot differs from golden file: ${diff.changedLines}/${diff.totalLines} lines changed (${diff.changePercentage.toFixed(1)}%)`,
  };
}

export async function listGoldenFiles(goldenDir: string = DEFAULT_GOLDEN_DIR): Promise<string[]> {
  try {
    const files = await fs.readdir(goldenDir);
    return files
      .filter((f: string) => f.endsWith(".golden.json") || f.endsWith(".golden.txt"))
      .map((f: string) => f.replace(".golden.json", "").replace(".golden.txt", ""));
  } catch {
    return [];
  }
}

export async function deleteGoldenFile(
  name: string,
  goldenDir: string = DEFAULT_GOLDEN_DIR,
): Promise<boolean> {
  const jsonPath = path.join(goldenDir, `${name}.golden.json`);
  const txtPath = path.join(goldenDir, `${name}.golden.txt`);

  let deleted = false;

  try {
    await fs.unlink(jsonPath);
    deleted = true;
  } catch {}

  try {
    await fs.unlink(txtPath);
    deleted = true;
  } catch {}

  return deleted;
}

export interface GoldenFileInfo {
  name: string;
  content: string;
  width?: number;
  height?: number;
  createdAt?: string;
  updatedAt?: string;
  isLegacy: boolean;
}

export async function getGoldenFile(
  name: string,
  goldenDir: string = DEFAULT_GOLDEN_DIR,
): Promise<GoldenFileInfo | null> {
  const jsonPath = path.join(goldenDir, `${name}.golden.json`);
  const txtPath = path.join(goldenDir, `${name}.golden.txt`);

  const jsonContent = await tryReadFile(jsonPath);
  if (jsonContent !== null) {
    const golden = parseGoldenFile(jsonContent);
    if (golden) {
      return {
        name,
        content: golden.frame,
        width: golden.width,
        height: golden.height,
        createdAt: golden.createdAt,
        updatedAt: golden.updatedAt,
        isLegacy: false,
      };
    }
  }

  const txtContent = await tryReadFile(txtPath);
  if (txtContent !== null) {
    return {
      name,
      content: txtContent,
      isLegacy: true,
    };
  }

  return null;
}
