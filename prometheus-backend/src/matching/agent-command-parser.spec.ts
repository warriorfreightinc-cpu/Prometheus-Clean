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
      hazmatMode: "hazmat",
      rateRequested: false,
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
      hazmatMode: "hazmat",
      rateRequested: false,
      limit: 20,
      showMore: false,
      mapRequested: false,
    });
  });

  it("parses state-only availability searches", () => {
    expect(parseAgentCommand("show available trucks in WA")).toMatchObject({
      intent: "search",
      originCity: "",
      originState: "WA",
    });
    expect(parseAgentCommand("search loads in IL")).toMatchObject({
      intent: "search",
      originCity: "",
      originState: "IL",
    });
  });

  it("parses state-to-state lane searches", () => {
    expect(parseAgentCommand("show loads from IL-TN")).toMatchObject({
      intent: "search",
      originCity: "",
      originState: "IL",
      destinationCity: "",
      destinationState: "TN",
    });
    expect(parseAgentCommand("search available trucks from IL to TN")).toMatchObject({
      intent: "search",
      originCity: "",
      originState: "IL",
      destinationCity: "",
      destinationState: "TN",
    });
    expect(parseAgentCommand("IL-TN")).toMatchObject({
      intent: "search",
      originCity: "",
      originState: "IL",
      destinationCity: "",
      destinationState: "TN",
    });
  });

  it("parses city-state lane searches", () => {
    expect(parseAgentCommand("show loads from Chicago, IL to Memphis, TN")).toMatchObject({
      intent: "search",
      originCity: "Chicago",
      originState: "IL",
      destinationCity: "Memphis",
      destinationState: "TN",
    });
  });

  it("parses rate questions for city-to-city lanes", () => {
    expect(parseAgentCommand("how much is the load from chicago to memphis paying?")).toMatchObject({
      intent: "search",
      originCity: "Chicago",
      originState: "",
      destinationCity: "Memphis",
      destinationState: "",
      rateRequested: true,
    });
  });

  it("parses non-hazmat availability searches", () => {
    expect(parseAgentCommand("any load that are non hazmat?")).toMatchObject({
      intent: "search",
      hazmatMode: "nonHazmat",
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

  it("parses hazmat equipment preferences", () => {
    expect(parseAgentCommand("find reefer hazmat loads out of Houston TX")).toMatchObject({
      intent: "search",
      originCity: "Houston",
      originState: "TX",
      equipmentCodes: ["RZ"],
    });
    expect(parseAgentCommand("show dry van hazmat around Chicago IL")).toMatchObject({
      intent: "search",
      originCity: "Chicago",
      originState: "IL",
      equipmentCodes: ["VZ"],
    });
  });

  it("does not treat hazmat as part of the city name", () => {
    expect(parseAgentCommand("find me a load from chicago hazmat")).toMatchObject({
      intent: "search",
      originCity: "Chicago",
      originState: "",
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
