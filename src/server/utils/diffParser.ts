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
}

export function parseDiff(raw: string): { files: ParsedDiffFile[] } {
  const files: ParsedDiffFile[] = [];
  const sections = raw.split(/(?=^diff --git )/m).filter((s) => s.startsWith("diff --git"));

  for (const section of sections) {
    const lines = section.split("\n");
    const pathMatch = lines[0].match(/diff --git a\/.+ b\/(.+)/);
    if (!pathMatch) continue;

    let path = pathMatch[1];
    let status: "M" | "A" | "D" | "R" = "M";
    let binary = false;
    let additions = 0;
    let deletions = 0;
    const hunks: ParsedDiffHunk[] = [];
    let currentHunk: ParsedDiffHunk | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
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
          oldStart: m ? parseInt(m[1]) : 0,
          newStart: m ? parseInt(m[2]) : 0,
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

    files.push({ path, status, binary, additions, deletions, hunks });
  }

  return { files };
}
