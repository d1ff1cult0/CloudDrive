import { describe, expect, it } from "vitest";

import { parseRange } from "./range";

const TOTAL = 1000;

describe("parseRange", () => {
  it("returns null when there is no Range header", () => {
    expect(parseRange(null, TOTAL)).toBeNull();
  });

  it("ignores non-byte ranges (serve full)", () => {
    expect(parseRange("items=0-10", TOTAL)).toBeNull();
  });

  it("parses bytes=start-end (inclusive)", () => {
    expect(parseRange("bytes=0-1023", TOTAL)).toEqual({ start: 0, end: 999 }); // clamped
    expect(parseRange("bytes=100-199", TOTAL)).toEqual({ start: 100, end: 199 });
  });

  it("parses open-ended bytes=start-", () => {
    expect(parseRange("bytes=500-", TOTAL)).toEqual({ start: 500, end: 999 });
  });

  it("parses suffix bytes=-N (last N bytes)", () => {
    expect(parseRange("bytes=-200", TOTAL)).toEqual({ start: 800, end: 999 });
    expect(parseRange("bytes=-5000", TOTAL)).toEqual({ start: 0, end: 999 });
  });

  it("clamps end to totalSize-1", () => {
    expect(parseRange("bytes=0-99999", TOTAL)).toEqual({ start: 0, end: 999 });
  });

  it("flags unsatisfiable ranges", () => {
    expect(parseRange("bytes=1000-1001", TOTAL)).toBe("unsatisfiable"); // start >= total
    expect(parseRange("bytes=500-400", TOTAL)).toBe("unsatisfiable"); // start > end
    expect(parseRange("bytes=-0", TOTAL)).toBe("unsatisfiable"); // last 0 bytes
    expect(parseRange("bytes=abc-def", TOTAL)).toBe("unsatisfiable");
  });

  it("treats any range on an empty file as unsatisfiable", () => {
    expect(parseRange("bytes=0-0", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-10", 0)).toBe("unsatisfiable");
  });
});
