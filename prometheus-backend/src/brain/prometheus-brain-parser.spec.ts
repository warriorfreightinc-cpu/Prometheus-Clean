import { parsePrometheusBrainPrompt } from "./prometheus-brain-parser";

describe("parsePrometheusBrainPrompt", () => {
  it("classifies search prompts", () => {
    expect(parsePrometheusBrainPrompt("do you have anything out of Memphis, TN?")).toEqual({
      intent: "search",
      normalizedPrompt: "do you have anything out of Memphis, TN?",
    });
  });

  it("classifies route and map prompts", () => {
    expect(parsePrometheusBrainPrompt("show me a map with deadhead miles")).toMatchObject({
      intent: "map",
    });
    expect(parsePrometheusBrainPrompt("show route from Chicago, IL to Memphis, TN")).toMatchObject({
      intent: "map",
    });
  });

  it("classifies approval-required communication drafts", () => {
    expect(parsePrometheusBrainPrompt("email Brian my truck list")).toMatchObject({
      intent: "draftEmail",
    });
    expect(parsePrometheusBrainPrompt("ask broker if VZ can work")).toMatchObject({
      intent: "draftChat",
    });
  });

  it("classifies booking and memory requests", () => {
    expect(parsePrometheusBrainPrompt("book match 1")).toMatchObject({
      intent: "bookingApproval",
    });
    expect(parsePrometheusBrainPrompt("remember James prefers under 44000")).toMatchObject({
      intent: "saveMemory",
    });
  });

  it("classifies hazmat operational questions", () => {
    expect(parsePrometheusBrainPrompt("can I transport 1.3 hazmat with this other product?")).toMatchObject({
      intent: "hazmatQuestion",
    });
    expect(parsePrometheusBrainPrompt("what should I check before moving a hazmat load through a route with tunnels?")).toMatchObject({
      intent: "hazmatQuestion",
    });
    expect(parsePrometheusBrainPrompt("what should a dispatcher check before accepting a hazmat shipment?")).toMatchObject({
      intent: "hazmatQuestion",
    });
  });

  it("keeps hazmat search prompts as search when the user asks to find loads or trucks", () => {
    expect(parsePrometheusBrainPrompt("find me hazmat loads out of Chicago under 44000 lbs")).toMatchObject({
      intent: "search",
    });
  });
});
