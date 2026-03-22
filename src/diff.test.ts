import { describe, expect, test } from "bun:test";
import { createCharDiff, diffFrames, highlightDiff } from "./diff";

describe("diffFrames", () => {
  test("returns identical result for identical frames", () => {
    const expected = "line 1\nline 2";
    const actual = "line 1\nline 2";

    const result = diffFrames(expected, actual, { contextLines: 0 });

    expect(result).toEqual({
      identical: true,
      changedLines: 0,
      totalLines: 2,
      changePercentage: 0,
      additions: [],
      deletions: [],
      modifications: [],
      visualDiff: "",
    });
  });

  test("detects a single line modification", () => {
    const expected = "line 1\nline 2";
    const actual = "line 1\nline TWO";

    const result = diffFrames(expected, actual, { contextLines: 0 });

    expect(result.identical).toBe(false);
    expect(result.changedLines).toBe(1);
    expect(result.totalLines).toBe(2);
    expect(result.changePercentage).toBe(50);
    expect(result.modifications).toEqual([
      {
        lineNumber: 2,
        content: "line TWO",
        expected: "line 2",
      },
    ]);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.visualDiff).toBe("-   2 │ line 2\n+   2 │ line TWO");
  });

  test("detects added line when actual frame is longer", () => {
    const expected = "a\nb";
    const actual = "a\nb\nc";

    const result = diffFrames(expected, actual, { contextLines: 0 });

    expect(result.identical).toBe(false);
    expect(result.changedLines).toBe(1);
    expect(result.totalLines).toBe(3);
    expect(result.changePercentage).toBeCloseTo(33.333333333333336, 10);
    expect(result.additions).toEqual([{ lineNumber: 3, content: "c" }]);
    expect(result.deletions).toEqual([]);
    expect(result.modifications).toEqual([]);
    expect(result.visualDiff).toBe("+   3 │ c");
  });

  test("detects deleted line when actual frame is shorter", () => {
    const expected = "a\nb\nc";
    const actual = "a\nb";

    const result = diffFrames(expected, actual, { contextLines: 0 });

    expect(result.identical).toBe(false);
    expect(result.changedLines).toBe(1);
    expect(result.totalLines).toBe(3);
    expect(result.changePercentage).toBeCloseTo(33.333333333333336, 10);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([{ lineNumber: 3, content: "c" }]);
    expect(result.modifications).toEqual([]);
    expect(result.visualDiff).toBe("-   3 │ c");
  });

  test("computes multiple changes with accurate counts and percentage", () => {
    const expected = "a\nb\nc\nd";
    const actual = "a\nB\nc\nD";

    const result = diffFrames(expected, actual);

    expect(result.identical).toBe(false);
    expect(result.changedLines).toBe(2);
    expect(result.totalLines).toBe(4);
    expect(result.changePercentage).toBe(50);
    expect(result.modifications).toEqual([
      { lineNumber: 2, content: "B", expected: "b" },
      { lineNumber: 4, content: "D", expected: "d" },
    ]);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
  });

  test("ignores whitespace-only changes with ignoreWhitespace option", () => {
    const expected = "hello   world\nnext";
    const actual = "hello world\nnext";

    const withoutIgnore = diffFrames(expected, actual);
    const withIgnore = diffFrames(expected, actual, { ignoreWhitespace: true });

    expect(withoutIgnore.identical).toBe(false);
    expect(withoutIgnore.changedLines).toBe(1);
    expect(withIgnore.identical).toBe(true);
    expect(withIgnore.changedLines).toBe(0);
    expect(withIgnore.modifications).toEqual([]);
    expect(withIgnore.visualDiff).toBe("");
  });

  test("changes context in visual diff output with contextLines option", () => {
    const expected = "a\nb\nc\nd\ne\nf";
    const actual = "a\nb\nc\nD\ne\nf";

    const withNoContext = diffFrames(expected, actual, { contextLines: 0 });
    const withOneContext = diffFrames(expected, actual, { contextLines: 1 });

    expect(withNoContext.visualDiff).toBe("-   4 │ d\n+   4 │ D");
    expect(withOneContext.visualDiff).toBe("    3 │ c\n-   4 │ d\n+   4 │ D\n    5 │ e");
  });

  test("handles empty string frames", () => {
    const result = diffFrames("", "");

    expect(result.identical).toBe(true);
    expect(result.changedLines).toBe(0);
    expect(result.totalLines).toBe(1);
    expect(result.changePercentage).toBe(0);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.modifications).toEqual([]);
    expect(result.visualDiff).toBe("");
  });
});

describe("highlightDiff", () => {
  test('returns "✓ Frames are identical" for matching frames', () => {
    const result = highlightDiff("same", "same");

    expect(result).toBe("✓ Frames are identical");
  });

  test("returns a formatted diff box with stats for different frames", () => {
    const result = highlightDiff("line 1\nline 2", "line 1\nline changed");

    expect(result).toContain(
      "╔══════════════════════════════════════════════════════════════════╗",
    );
    expect(result).toContain(
      "║ FRAME DIFF                                                       ║",
    );
    expect(result).toContain("Changed: 1/2 lines (50.0%)");
    expect(result).toContain(
      "║ - = removed   + = added                                          ║",
    );
    expect(result).toContain("-   2 │ line 2");
    expect(result).toContain("+   2 │ line changed");
    expect(result.endsWith("+   2 │ line changed")).toBe(true);
  });
});

describe("createCharDiff", () => {
  test("returns empty output for identical lines", () => {
    const result = createCharDiff("same\nlines", "same\nlines");

    expect(result).toBe("");
  });

  test("marks exact character difference positions", () => {
    const result = createCharDiff("abcd", "abXd");

    expect(result).toBe("Line 1:\n  exp: abcd\n  act: abXd\n         ^ \n");
  });

  test("handles lines with different lengths by padding comparisons", () => {
    const result = createCharDiff("abc", "abcde");

    expect(result).toBe("Line 1:\n  exp: abc\n  act: abcde\n          ^^\n");
  });
});
