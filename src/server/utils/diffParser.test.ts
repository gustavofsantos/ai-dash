import { expect, test, describe } from "bun:test";
import { parseDiff } from "./diffParser.ts";

describe("diffParser", () => {
  test("should parse a simple modified file", () => {
    const diff = `diff --git a/src/server/api.ts b/src/server/api.ts
index 1234567..89abcdef 100644
--- a/src/server/api.ts
+++ b/src/server/api.ts
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 modified
 line 3`;

    const result = parseDiff(diff);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].path).toBe("src/server/api.ts");
    expect(result.files[0].status).toBe("M");
    expect(result.files[0].additions).toBe(1);
    expect(result.files[0].deletions).toBe(1);
    expect(result.files[0].hunks).toHaveLength(1);
    expect(result.files[0].hunks[0].lines).toHaveLength(4);
    expect(result.files[0].hunks[0].lines[1].type).toBe("remove");
    expect(result.files[0].hunks[0].lines[2].type).toBe("add");
  });

  test("should handle new files", () => {
    const diff = `diff --git a/new_file.txt b/new_file.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new_file.txt
@@ -0,0 +1 @@
+content`;

    const result = parseDiff(diff);
    expect(result.files[0].status).toBe("A");
    expect(result.files[0].additions).toBe(1);
  });

  test("should handle deleted files", () => {
    const diff = `diff --git a/old_file.txt b/old_file.txt
deleted file mode 100644
index e69de29..0000000
--- a/old_file.txt
+++ /dev/null
@@ -1 +0,0 @@
-content`;

    const result = parseDiff(diff);
    expect(result.files[0].status).toBe("D");
    expect(result.files[0].deletions).toBe(1);
  });
});
