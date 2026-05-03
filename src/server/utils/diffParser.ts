export interface ParsedDiffLine {
  type: "context" | "add" | "remove";
  content: string;
}

export interface ParsedDiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: ParsedDiffLine[];
}

export interface ParsedDiffFile {
  path: string;
  status: "M" | "A" | "D" | "R";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: ParsedDiffHunk[];
  raw: string;
}

export function parseDiff(raw: string): { files: ParsedDiffFile[] } {
  const files: ParsedDiffFile[] = [];
  const sections = raw.split(/(?=^diff --git )/m).filter((s) => s.startsWith("diff --git"));

  for (const section of sections) {
    const lines = section.split("\n");
    if (lines.length === 0) continue;

    const firstLine = lines[0];
    if (!firstLine) continue;

    const pathMatch = firstLine.match(/diff --git a\/.+ b\/(.+)/);
    if (!pathMatch || !pathMatch[1]) continue;

    let path = pathMatch[1];
    let status: "M" | "A" | "D" | "R" = "M";
    let binary = false;
    let additions = 0;
    let deletions = 0;
    const hunks: ParsedDiffHunk[] = [];
    let currentHunk: ParsedDiffHunk | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (line.startsWith("new file mode")) {
        status = "A";
      } else if (line.startsWith("deleted file mode")) {
        status = "D";
      } else if (line.startsWith("rename to ")) {
        status = "R";
        path = line.slice("rename to ".length);
      } else if (line.includes("Binary files")) {
        binary = true;
      } else if (line.startsWith("@@ ")) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        currentHunk = {
          header: line,
          oldStart: m?.[1] ? parseInt(m[1]) : 0,
          newStart: m?.[2] ? parseInt(m[2]) : 0,
          lines: [],
        };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentHunk.lines.push({ type: "add", content: line.slice(1) });
          additions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentHunk.lines.push({ type: "remove", content: line.slice(1) });
          deletions++;
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({ type: "context", content: line.slice(1) });
        }
      }
    }

    files.push({ path, status, binary, additions, deletions, hunks, raw: section });
  }

  return { files };
}
