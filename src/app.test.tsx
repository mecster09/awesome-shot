import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./app";
import { InMemoryGameSessionStore } from "./game-session/in-memory-game-session-store";

describe("Natball Insights setup", () => {
  it("lets a coach create reusable season, player, and opposition setup data", async () => {
    const user = userEvent.setup();
    render(<App store={new InMemoryGameSessionStore()} />);

    await user.type(await screen.findByLabelText("Season name"), "2026 Winter");
    await user.type(screen.getByLabelText("Team name"), "Roses");
    await user.click(screen.getByRole("button", { name: "Save season" }));

    await user.type(screen.getByLabelText("Player name"), "Natalie");
    await user.type(screen.getByLabelText("Nickname"), "Nat");
    await user.click(screen.getByRole("button", { name: "Add player" }));

    await user.type(screen.getByLabelText("Opposition name"), "Thunder");
    await user.click(screen.getByRole("button", { name: "Add opposition" }));

    expect(screen.getByText("2026 Winter")).toBeInTheDocument();
    expect(screen.getByText("Natalie (Nat)")).toBeInTheDocument();
    expect(screen.getByText("Thunder")).toBeInTheDocument();
  });
});
