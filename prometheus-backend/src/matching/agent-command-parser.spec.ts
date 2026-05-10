import { parseAgentCommand } from "./agent-command-parser";

describe("parseAgentCommand", () => {
  it("parses city search with age and weight filters", () => {
    expect(parseAgentCommand("do you have anything out of Memphis from the last 5 hours under 44000 pounds")).toEqual({
      intent: "search",
      originCity: "Memphis",
      originState: "",
      maxAgeHours: 5,
      maxWeight: 44000,
      maxLength: null,
      capacity: "any",
      limit: 20,
      showMore: false,
      mapRequested: false,
    });
  });

  it("parses state abbreviations and partial filters", () => {
    expect(parseAgentCommand("show me only partial shipments out of Houston, TX under 30 feet")).toEqual({
      intent: "search",
      originCity: "Houston",
      originState: "TX",
      maxAgeHours: null,
      maxWeight: null,
      maxLength: 30,
      capacity: "partial",
      limit: 20,
      showMore: false,
      mapRequested: false,
    });
  });

  it("parses map requests", () => {
    expect(parseAgentCommand("show me a map with loads around my truck in Houston TX")).toMatchObject({
      intent: "search",
      originCity: "Houston",
      originState: "TX",
      mapRequested: true,
    });
  });

  it("parses show more", () => {
    expect(parseAgentCommand("show me more")).toMatchObject({
      intent: "showMore",
      showMore: true,
    });
  });

  it("returns unknown for booking commands handled by existing opportunity flow", () => {
    expect(parseAgentCommand("book option 1")).toEqual({ intent: "unknown" });
  });
});
