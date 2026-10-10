import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { ErrorBoundary } from "./ErrorBoundary";

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error("boom");
  return <p>fine</p>;
}

describe("ErrorBoundary", () => {
  it("shows a recoverable message and recovers on Try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Harness() {
      const [armed, setArmed] = useState(true);
      return (
        <>
          <button onClick={() => setArmed(false)}>defuse</button>
          <ErrorBoundary>
            <Bomb armed={armed} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    await userEvent.click(screen.getByText("defuse"));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("fine")).toBeInTheDocument();
  });
});
