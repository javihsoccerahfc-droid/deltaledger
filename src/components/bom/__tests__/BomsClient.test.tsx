import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BomsClient } from "../BomsClient";

vi.mock("@/app/actions", () => ({ importBomAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/context/DemoUserContext", () => ({
  useDemoUser: () => ({ currentUser: { id: "u-1", name: "Pat", role: "part_data_owner" } }),
}));

describe("BomsClient", () => {
  it("Phase 6D -- the InfoHero shows an honest 'no comparison yet' state when there's no diff", () => {
    render(<BomsClient ecId="ec-1" imports={{}} diff={[]} />);
    expect(screen.getByText("No comparison yet")).toBeInTheDocument();
  });

  it("Phase 6D -- the InfoHero shows the change count once a diff exists, and no duplicate 'BOM Diff' heading remains", () => {
    render(
      <BomsClient
        ecId="ec-1"
        imports={{}}
        diff={[
          { id: "d1", partId: "PN-1", changeType: "removed", fromQuantity: 10, toQuantity: 0 },
          { id: "d2", partId: "PN-2", changeType: "added", fromQuantity: 0, toQuantity: 5 },
        ]}
      />
    );
    expect(screen.getByText("2 changes detected")).toBeInTheDocument();
    expect(screen.queryByText("BOM Diff", { selector: "h2" })).not.toBeInTheDocument();
  });
});
