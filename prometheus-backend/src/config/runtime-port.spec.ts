import { resolveRuntimePort } from "./runtime-port";

describe("resolveRuntimePort", () => {
  it("prefers the platform PORT over the local API_PORT", () => {
    expect(resolveRuntimePort({ PORT: "8080", API_PORT: "3100" } as NodeJS.ProcessEnv)).toBe(8080);
  });

  it("falls back to API_PORT for local development", () => {
    expect(resolveRuntimePort({ API_PORT: "3100" } as NodeJS.ProcessEnv)).toBe(3100);
  });

  it("uses 3100 when no valid port is configured", () => {
    expect(resolveRuntimePort({ PORT: "not-a-port" } as NodeJS.ProcessEnv)).toBe(3100);
  });
});
