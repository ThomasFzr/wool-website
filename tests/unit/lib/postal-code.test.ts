import { describe, expect, it } from "vitest";
import { isPostalCodeAllowed, normalizePostalCode } from "@/lib/postal-code";

describe("normalizePostalCode", () => {
  it("retire les espaces et met en majuscules", () => {
    expect(normalizePostalCode(" sw1a 1aa ")).toBe("SW1A1AA");
    expect(normalizePostalCode(75011)).toBe("");
  });
});

describe("isPostalCodeAllowed", () => {
  it.each([
    ["75011", ["75011"]],
    ["75011", ["75"]],
    ["75 011", [" 75 "]],
  ])("accepte %s pour %j", (code, allowed) => {
    expect(isPostalCodeAllowed(code, allowed)).toBe(true);
  });

  it.each([
    ["7", ["75011"]],
    ["", ["75"]],
    ["   ", ["75"]],
    [undefined, ["75"]],
    ["69001", ["75", "92"]],
    ["75011", ["", "  "]],
  ])("refuse %j pour %j", (code, allowed) => {
    expect(isPostalCodeAllowed(code, allowed)).toBe(false);
  });
});
