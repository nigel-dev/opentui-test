export interface DiffResult {
  identical: boolean;
  changedLines: number;
  totalLines: number;
  changePercentage: number;
  additions: LineChange[];
  deletions: LineChange[];
  modifications: LineChange[];
  visualDiff: string;
}

export interface LineChange {
  lineNumber: number;
  content: string;
  expected?: string;
}

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  contextLines?: number;
}

export function diffFrames(
  expected: string,
  actual: string,
  options: DiffOptions = {},
): DiffResult {
  const { ignoreWhitespace = false, contextLines = 2 } = options;

  const normalize = (s: string) => (ignoreWhitespace ? s.replace(/\s+/g, " ").trim() : s);

  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");

  const additions: LineChange[] = [];
  const deletions: LineChange[] = [];
  const modifications: LineChange[] = [];
  const diffLines: string[] = [];

  const maxLines = Math.max(expectedLines.length, actualLines.length);
  const changedLineNumbers = new Set<number>();

  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i] ?? "";
    const actLine = actualLines[i] ?? "";
    const expNorm = normalize(expLine);
    const actNorm = normalize(actLine);

    if (expNorm !== actNorm) {
      changedLineNumbers.add(i);

      if (i >= expectedLines.length) {
        additions.push({ lineNumber: i + 1, content: actLine });
      } else if (i >= actualLines.length) {
        deletions.push({ lineNumber: i + 1, content: expLine });
      } else {
        modifications.push({
          lineNumber: i + 1,
          content: actLine,
          expected: expLine,
        });
      }
    }
  }

  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i] ?? "";
    const actLine = actualLines[i] ?? "";

    const isInContext = Array.from(changedLineNumbers).some(
      (changed) => Math.abs(changed - i) <= contextLines,
    );

    if (changedLineNumbers.has(i)) {
      if (i >= expectedLines.length) {
        diffLines.push(`+ ${String(i + 1).padStart(3)} │ ${actLine}`);
      } else if (i >= actualLines.length) {
        diffLines.push(`- ${String(i + 1).padStart(3)} │ ${expLine}`);
      } else {
        diffLines.push(`- ${String(i + 1).padStart(3)} │ ${expLine}`);
        diffLines.push(`+ ${String(i + 1).padStart(3)} │ ${actLine}`);
      }
    } else if (isInContext) {
      diffLines.push(`  ${String(i + 1).padStart(3)} │ ${actLine}`);
    }
  }

  const identical = changedLineNumbers.size === 0;
  const changedLines = changedLineNumbers.size;
  const totalLines = maxLines;
  const changePercentage = totalLines > 0 ? (changedLines / totalLines) * 100 : 0;

  return {
    identical,
    changedLines,
    totalLines,
    changePercentage,
    additions,
    deletions,
    modifications,
    visualDiff: diffLines.join("\n"),
  };
}

export function highlightDiff(expected: string, actual: string, options: DiffOptions = {}): string {
  const result = diffFrames(expected, actual, options);

  if (result.identical) {
    return "✓ Frames are identical";
  }

  const lines: string[] = [
    `╔══════════════════════════════════════════════════════════════════╗`,
    `║ FRAME DIFF                                                       ║`,
    `║ Changed: ${result.changedLines}/${result.totalLines} lines (${result.changePercentage.toFixed(1)}%)${" ".repeat(Math.max(0, 24 - result.changePercentage.toFixed(1).length))}║`,
    `╠══════════════════════════════════════════════════════════════════╣`,
    `║ - = removed   + = added                                          ║`,
    `╚══════════════════════════════════════════════════════════════════╝`,
    "",
    result.visualDiff,
  ];

  return lines.join("\n");
}

export function createCharDiff(expected: string, actual: string): string {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  const diffLines: string[] = [];

  for (let i = 0; i < maxLines; i++) {
    const expLine = expectedLines[i] ?? "";
    const actLine = actualLines[i] ?? "";

    if (expLine === actLine) {
      continue;
    }

    const maxLen = Math.max(expLine.length, actLine.length);
    let markers = "";

    for (let j = 0; j < maxLen; j++) {
      const expChar = expLine[j] ?? " ";
      const actChar = actLine[j] ?? " ";
      markers += expChar === actChar ? " " : "^";
    }

    if (markers.trim()) {
      diffLines.push(`Line ${i + 1}:`);
      diffLines.push(`  exp: ${expLine}`);
      diffLines.push(`  act: ${actLine}`);
      diffLines.push(`       ${markers}`);
      diffLines.push("");
    }
  }

  return diffLines.join("\n");
}
