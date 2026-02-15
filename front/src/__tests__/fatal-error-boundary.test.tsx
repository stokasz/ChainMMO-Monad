import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { FatalErrorBoundary } from "../components/FatalErrorBoundary";

const Boom: React.FC = () => {
  throw new Error("boom");
};

describe("<FatalErrorBoundary />", () => {
  it("renders a crash screen when a child throws", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <FatalErrorBoundary>
          <Boom />
        </FatalErrorBoundary>,
      );
      expect(screen.getByTestId("fatal-error")).toBeInTheDocument();
      expect(screen.getByText(/chainmmo crashed/i)).toBeInTheDocument();
      expect(screen.getByText(/boom/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy error/i })).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
    }
  });
});
