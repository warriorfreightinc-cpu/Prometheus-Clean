import {
  classifyHazmatCandidate,
  normalizeEquipmentCodes,
} from "./hazmat-match-classifier";

describe("hazmat match classifier", () => {
  it("normalizes hazmat equipment codes without losing base equipment", () => {
    expect(normalizeEquipmentCodes(["v", "VZ", " reefer hazmat "])).toEqual([
      "V",
      "VZ",
      "RZ",
    ]);
  });

  it("classifies exact hazmat equipment and safe weight as strict hazmat", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 44000,
      candidateWeight: 41000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("strictHazmat");
    expect(decision.equipmentCompatibility).toBe("exact");
    expect(decision.permissionStatus).toBe("notNeeded");
    expect(decision.hazmatCompatible).toBe(true);
  });

  it("classifies RZ truck against VZ load as a permission-based hazmat substitution", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["RZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 44000,
      candidateWeight: 40000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatPermission");
    expect(decision.equipmentCompatibility).toBe("requiresPermission");
    expect(decision.permissionQuestion).toContain("reefer");
    expect(decision.permissionQuestion).toContain("van hazmat");
  });

  it("places non-hazmat candidates in the fallback tier", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["V"],
      sourceWeight: 44000,
      candidateWeight: 38000,
      sourceNonHazmat: false,
      candidateNonHazmat: true,
    });

    expect(decision.tier).toBe("nonHazmatFallback");
    expect(decision.hazmatCompatible).toBe(false);
  });

  it("marks overweight load candidates as rejected by weight", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 41000,
      candidateWeight: 45000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatMarketAlternative");
    expect(decision.reasonCodes).toContain("overweight");
  });

  it("marks broker-source loads above candidate truck capacity as overweight", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "brokerPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 45000,
      candidateWeight: 41000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatMarketAlternative");
    expect(decision.reasonCodes).toContain("overweight");
  });

  it("asks broker-source VZ load to RZ truck permission from load to equipment perspective", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "brokerPost",
      sourceEquipment: ["VZ"],
      candidateEquipment: ["RZ"],
      sourceWeight: 40000,
      candidateWeight: 44000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatPermission");
    expect(decision.equipmentCompatibility).toBe("requiresPermission");
    expect(decision.permissionQuestion).toContain("van hazmat load");
    expect(decision.permissionQuestion).toContain("reefer hazmat equipment");
  });

  it("marks unsupported hazmat equipment mismatches as incompatible market alternatives", () => {
    const decision = classifyHazmatCandidate({
      sourcePostType: "carrierPost",
      sourceEquipment: ["FZ"],
      candidateEquipment: ["VZ"],
      sourceWeight: 44000,
      candidateWeight: 40000,
      sourceNonHazmat: false,
      candidateNonHazmat: false,
    });

    expect(decision.tier).toBe("hazmatMarketAlternative");
    expect(decision.equipmentCompatibility).toBe("incompatible");
    expect(decision.reasonCodes).toContain("equipmentMismatch");
  });
});
