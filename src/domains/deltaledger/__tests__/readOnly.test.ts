import { describe, it, expect } from "vitest";
import { assertEditable, editableCheckReason, ReadOnlyEngineeringChangeError } from "@/domains/deltaledger/readOnly";

describe("read-only guard", () => {
  describe("assertEditable", () => {
    it("throws ReadOnlyEngineeringChangeError when the EC is read-only", () => {
      expect(() => assertEditable({ isReadOnly: true })).toThrow(ReadOnlyEngineeringChangeError);
    });
    it("does not throw when the EC is editable", () => {
      expect(() => assertEditable({ isReadOnly: false })).not.toThrow();
    });
    it("does not throw when the EC is null (a different, unrelated failure mode -- not this guard's job)", () => {
      expect(() => assertEditable(null)).not.toThrow();
    });
  });

  describe("editableCheckReason", () => {
    it("returns a message when read-only", () => {
      expect(editableCheckReason({ isReadOnly: true })).toMatch(/read-only/);
    });
    it("returns null when editable", () => {
      expect(editableCheckReason({ isReadOnly: false })).toBeNull();
    });
  });
});
