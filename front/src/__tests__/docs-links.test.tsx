// @vitest-environment-options { "url": "https://chainmmo.com/" }

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocsLinksPanel } from "../components/DocsLinks";

describe("DocsLinksPanel", () => {
  it("links docs and API to the selected apiBase", () => {
    const apiBase = "https://test.chainmmo.com";
    render(<DocsLinksPanel apiBase={apiBase} contractsText="{}" />);

    expect(screen.getByRole("link", { name: /Human Guide/i })).toHaveAttribute(
      "href",
      `${apiBase}/meta/playbook/product-purpose?format=markdown`,
    );
    expect(screen.getByRole("link", { name: /AI Agent Guide/i })).toHaveAttribute(
      "href",
      `${apiBase}/meta/playbook/agent-bootstrap-mcp-only-minimal?format=markdown`,
    );
    expect(screen.getByRole("link", { name: /Raw API/i })).toHaveAttribute(
      "href",
      `${apiBase}/meta/capabilities`,
    );
  });

  it("uses canonical social links (non-placeholder)", () => {
    render(<DocsLinksPanel apiBase="https://test.chainmmo.com" contractsText="{}" />);

    expect(screen.getByRole("link", { name: /@stokasz/i })).toHaveAttribute("href", "https://x.com/stokasz");
    expect(screen.getByRole("link", { name: /GitHub/i })).toHaveAttribute("href", "https://github.com/stokasz/chainmmo-monad");
  });
});
