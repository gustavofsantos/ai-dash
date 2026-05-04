import { expect, test, describe } from "bun:test";
import { parseDiff } from "./diffParser.ts";
import { loadDiff } from "../../../fixtures/loader.ts";

describe("diffParser", () => {
  test("should parse a simple modified file", () => {
    const result = parseDiff(loadDiff("single-file-modified"));
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
    const result = parseDiff(loadDiff("file-added"));
    expect(result.files[0].status).toBe("A");
    expect(result.files[0].additions).toBe(1);
  });

  test("should handle deleted files", () => {
    const result = parseDiff(loadDiff("file-deleted"));
    expect(result.files[0].status).toBe("D");
    expect(result.files[0].deletions).toBe(1);
  });
});
