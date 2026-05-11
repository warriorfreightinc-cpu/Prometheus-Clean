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
  });
});
