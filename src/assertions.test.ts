import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { assertSnapshot, deleteGoldenFile, getGoldenFile, listGoldenFiles } from "./assertions";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("assertSnapshot", () => {
  let tmpDir = "";
  let goldenDir = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "opentui-test-assertions-"));
    goldenDir = path.join(tmpDir, "golden");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("fails when no golden exists and dimensions are missing", async () => {
    const result = await assertSnapshot("missing-dimensions", "frame", { goldenDir });

    expect(result.passed).toBe(false);
    expect(result.goldenExists).toBe(false);
    expect(result.message).toBe("Cannot create golden file: width and height are required");
    expect(result.goldenPath).toBe(
      path.resolve(path.join(goldenDir, "missing-dimensions.golden.json")),
    );
  });

  test("creates a new golden file when dimensions are provided", async () => {
    const frame = "hello\nworld";
    const result = await assertSnapshot("create-new", frame, {
      goldenDir,
      width: 80,
      height: 24,
    });

    expect(result.passed).toBe(true);
    expect(result.goldenExists).toBe(false);
    expect(result.message).toContain("Created new golden file");

    const goldenPath = path.join(goldenDir, "create-new.golden.json");
    expect(await pathExists(goldenPath)).toBe(true);

    const raw = await readFile(goldenPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({
      version: 1,
      width: 80,
      height: 24,
      frame,
    });
    expect(typeof parsed.createdAt).toBe("string");
    expect(typeof parsed.updatedAt).toBe("string");
  });

  test("passes when existing golden frame matches", async () => {
    await assertSnapshot("match", "exact frame", {
      goldenDir,
      width: 100,
      height: 30,
    });

    const result = await assertSnapshot("match", "exact frame", { goldenDir });

    expect(result.passed).toBe(true);
    expect(result.goldenExists).toBe(true);
    expect(result.diff?.identical).toBe(true);
    expect(result.visual).toBeUndefined();
    expect(result.message).toContain("Snapshot matches golden file");
  });

  test("fails with diff and visual output when existing golden differs", async () => {
    await assertSnapshot("different", "line 1\nline 2", {
      goldenDir,
      width: 100,
      height: 30,
    });

    const result = await assertSnapshot("different", "line 1\nline changed", { goldenDir });

    expect(result.passed).toBe(false);
    expect(result.goldenExists).toBe(true);
    expect(result.diff).toBeDefined();
    expect(result.diff?.identical).toBe(false);
    expect(result.visual).toBeDefined();
    expect(result.visual).toContain("FRAME DIFF");
    expect(result.message).toContain("Snapshot differs from golden file");
  });

  test("overwrites existing golden when updateGolden is true", async () => {
    await assertSnapshot("update", "old", {
      goldenDir,
      width: 80,
      height: 24,
    });

    const result = await assertSnapshot("update", "new", {
      goldenDir,
      updateGolden: true,
      width: 80,
      height: 24,
    });

    expect(result.passed).toBe(true);
    expect(result.goldenExists).toBe(true);
    expect(result.message).toContain("Updated golden file");

    const raw = await readFile(path.join(goldenDir, "update.golden.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.frame).toBe("new");
  });

  test("fails with dimension mismatch details when runtime size differs", async () => {
    await assertSnapshot("size-check", "same", {
      goldenDir,
      width: 80,
      height: 24,
    });

    const result = await assertSnapshot("size-check", "same", {
      goldenDir,
      width: 120,
      height: 40,
    });

    expect(result.passed).toBe(false);
    expect(result.dimensionMismatch).toEqual({
      expected: { width: 80, height: 24 },
      actual: { width: 120, height: 40 },
    });
    expect(result.message).toContain("Terminal size mismatch");
  });

  test("passes whitespace-only changes when ignoreWhitespace is true", async () => {
    await assertSnapshot("ws", "hello   world\nnext", {
      goldenDir,
      width: 80,
      height: 24,
    });

    const withoutIgnore = await assertSnapshot("ws", "hello world\nnext", {
      goldenDir,
      ignoreWhitespace: false,
    });
    const withIgnore = await assertSnapshot("ws", "hello world\nnext", {
      goldenDir,
      ignoreWhitespace: true,
    });

    expect(withoutIgnore.passed).toBe(false);
    expect(withIgnore.passed).toBe(true);
    expect(withIgnore.diff?.identical).toBe(true);
  });

  test("reads and compares legacy .golden.txt format", async () => {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path.join(goldenDir, "legacy.golden.txt"), "legacy frame", "utf-8");

    const result = await assertSnapshot("legacy", "legacy frame", { goldenDir });

    expect(result.passed).toBe(true);
    expect(result.goldenExists).toBe(true);
    expect(result.diff?.identical).toBe(true);
    expect(result.message).toContain("legacy format");
    expect(result.goldenPath).toBe(path.resolve(path.join(goldenDir, "legacy.golden.txt")));
  });

  test("migrates legacy file to JSON and deletes legacy file on updateGolden", async () => {
    await mkdir(goldenDir, { recursive: true });
    const legacyPath = path.join(goldenDir, "migrate.golden.txt");
    const jsonPath = path.join(goldenDir, "migrate.golden.json");
    await writeFile(legacyPath, "old legacy", "utf-8");

    const result = await assertSnapshot("migrate", "new content", {
      goldenDir,
      updateGolden: true,
      width: 90,
      height: 33,
    });

    expect(result.passed).toBe(true);
    expect(result.goldenExists).toBe(true);
    expect(result.message).toContain("Updated golden file");
    expect(await pathExists(legacyPath)).toBe(false);
    expect(await pathExists(jsonPath)).toBe(true);

    const raw = await readFile(jsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toMatchObject({
      version: 1,
      width: 90,
      height: 33,
      frame: "new content",
    });
  });
});

describe("listGoldenFiles", () => {
  let tmpDir = "";
  let goldenDir = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "opentui-test-list-"));
    goldenDir = path.join(tmpDir, "golden");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns empty array for empty directory", async () => {
    await mkdir(goldenDir, { recursive: true });

    const result = await listGoldenFiles(goldenDir);

    expect(result).toEqual([]);
  });

  test("returns base names for json and legacy golden files", async () => {
    await mkdir(goldenDir, { recursive: true });
    await writeFile(path.join(goldenDir, "alpha.golden.json"), "{}", "utf-8");
    await writeFile(path.join(goldenDir, "beta.golden.txt"), "legacy", "utf-8");
    await writeFile(path.join(goldenDir, "ignore.txt"), "x", "utf-8");

    const result = await listGoldenFiles(goldenDir);

    expect(result.sort()).toEqual(["alpha", "beta"]);
  });

  test("returns empty array when directory does not exist", async () => {
    const missingDir = path.join(tmpDir, "missing");

    const result = await listGoldenFiles(missingDir);

    expect(result).toEqual([]);
  });
});

describe("deleteGoldenFile", () => {
  let tmpDir = "";
  let goldenDir = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "opentui-test-delete-"));
    goldenDir = path.join(tmpDir, "golden");
    await mkdir(goldenDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("deletes existing golden file and returns true", async () => {
    const jsonPath = path.join(goldenDir, "remove-me.golden.json");
    await writeFile(jsonPath, "{}", "utf-8");

    const result = await deleteGoldenFile("remove-me", goldenDir);

    expect(result).toBe(true);
    expect(await pathExists(jsonPath)).toBe(false);
  });

  test("returns false for non-existent golden file", async () => {
    const result = await deleteGoldenFile("nope", goldenDir);

    expect(result).toBe(false);
  });
});

describe("getGoldenFile", () => {
  let tmpDir = "";
  let goldenDir = "";

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "opentui-test-get-"));
    goldenDir = path.join(tmpDir, "golden");
    await mkdir(goldenDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("returns JSON golden info with dimensions and metadata", async () => {
    const createdAt = "2026-03-21T00:00:00.000Z";
    const updatedAt = "2026-03-21T01:00:00.000Z";
    await writeFile(
      path.join(goldenDir, "json-file.golden.json"),
      JSON.stringify(
        {
          version: 1,
          width: 120,
          height: 40,
          frame: "json frame",
          createdAt,
          updatedAt,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const result = await getGoldenFile("json-file", goldenDir);

    expect(result).toEqual({
      name: "json-file",
      content: "json frame",
      width: 120,
      height: 40,
      createdAt,
      updatedAt,
      isLegacy: false,
    });
  });

  test("returns legacy golden info for txt file", async () => {
    await writeFile(path.join(goldenDir, "legacy-file.golden.txt"), "legacy text", "utf-8");

    const result = await getGoldenFile("legacy-file", goldenDir);

    expect(result).toEqual({
      name: "legacy-file",
      content: "legacy text",
      isLegacy: true,
    });
  });

  test("returns null when no golden file exists", async () => {
    const result = await getGoldenFile("missing", goldenDir);

    expect(result).toBeNull();
  });
});
