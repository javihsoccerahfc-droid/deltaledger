import { describe, it, expect } from "vitest";
import { getTimeAwareGreeting } from "../greeting";

describe("getTimeAwareGreeting", () => {
  it("returns a morning greeting before noon", () => {
    expect(getTimeAwareGreeting(new Date(2026, 0, 1, 9))).toBe("Good morning");
  });
  it("returns an afternoon greeting from noon to before 6pm", () => {
    expect(getTimeAwareGreeting(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
  });
  it("returns an evening greeting from 6pm onward", () => {
    expect(getTimeAwareGreeting(new Date(2026, 0, 1, 20))).toBe("Good evening");
  });
});
