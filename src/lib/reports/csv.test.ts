import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("CSV cell escaping", () => {
  it("quotes commas and escapes embedded quotes", () => {
    expect(csvCell('Sepatu, "Merah"')).toBe('"Sepatu, ""Merah"""');
  });

  it.each(["=1+1", "+cmd", "-1+2", "@SUM(A1:A2)", "\t=1+1", "\uFEFF=1+1"])(
    "neutralizes spreadsheet formulas beginning with %s",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it("preserves numeric amounts and represents empty cells", () => {
    expect(csvCell(150000)).toBe("150000");
    expect(csvCell(null)).toBe('""');
  });
});
