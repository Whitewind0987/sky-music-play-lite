import { describe, expect, it } from "vitest";
import { formatText } from "./formatText";

describe("formatText", () => {
  it("replaces placeholders with values", () => {
    expect(formatText("{name}: {count}", { name: "song", count: 3 })).toBe(
      "song: 3",
    );
  });

  it("keeps dollar sequences in values literally", () => {
    expect(formatText("File {fileName} failed", { fileName: "a$'b$&c$$.txt" })).toBe(
      "File a$'b$&c$$.txt failed",
    );
  });

  it("replaces every occurrence of a placeholder", () => {
    expect(formatText("{x} and {x}", { x: "y" })).toBe("y and y");
  });
});
