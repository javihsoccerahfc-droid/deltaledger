import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  it("renders primary variant by default with consistent disabled opacity", () => {
    render(<Button disabled>Run</Button>);
    const btn = screen.getByRole("button", { name: "Run" });
    expect(btn.className).toContain("bg-accent");
    expect(btn.className).toContain("disabled:opacity-40");
  });

  it("renders secondary, outline, and ghost variants with distinct styling", () => {
    render(
      <>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </>
    );
    expect(screen.getByRole("button", { name: "Secondary" }).className).toContain("border-line");
    expect(screen.getByRole("button", { name: "Outline" }).className).toContain("border-accent");
    expect(screen.getByRole("button", { name: "Ghost" }).className).toContain("text-ink-soft");
  });

  it("fires onClick when enabled and not when disabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole("button", { name: "Click me" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    const onClickDisabled = vi.fn();
    render(
      <Button onClick={onClickDisabled} disabled>
        Disabled
      </Button>
    );
    await user.click(screen.getByRole("button", { name: "Disabled" }));
    expect(onClickDisabled).not.toHaveBeenCalled();
  });
});
