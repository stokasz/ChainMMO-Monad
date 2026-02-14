// @vitest-environment-options { "url": "https://chainmmo.com/" }

import { describe, expect, it } from "vitest";
import { getApiBase } from "../lib/url";

describe("getApiBase", () => {
  it("returns window.location.origin when no override is provided", () => {
    window.history.replaceState({}, "", "/");
    expect(getApiBase()).toBe("https://chainmmo.com");
  });

  it("accepts a relative override", () => {
    window.history.replaceState({}, "", "/?api=/api");
    expect(getApiBase()).toBe("https://chainmmo.com/api");
  });

  it("accepts an absolute override and strips the trailing slash", () => {
    window.history.replaceState({}, "", "/?api=https://test.chainmmo.com/");
    expect(getApiBase()).toBe("https://test.chainmmo.com");
  });

  it("falls back to origin for invalid overrides", () => {
    window.history.replaceState({}, "", "/?api=http://%5B");
    expect(getApiBase()).toBe("https://chainmmo.com");
  });
});
