import { MatchSourcePostType } from "./interface/match-snapshot.interface";

export type MatchOpportunityTier =
  | "strictHazmat"
  | "hazmatNearMatch"
  | "hazmatPermission"
  | "hazmatMarketAlternative"
  | "nonHazmatFallback";

export type EquipmentCompatibility =
  | "exact"
  | "compatible"
  | "requiresPermission"
  | "incompatible";

export type PermissionStatus =
  | "notNeeded"
  | "notAsked"
  | "asked"
  | "accepted"
  | "rejected"
  | "expired";

export interface HazmatCandidateInput {
  sourcePostType: MatchSourcePostType;
  sourceEquipment: unknown;
  candidateEquipment: unknown;
  sourceWeight: number | null;
  candidateWeight: number | null;
  sourceNonHazmat?: boolean;
  candidateNonHazmat?: boolean;
}

export interface HazmatCandidateDecision {
  tier: MatchOpportunityTier;
  hazmatCompatible: boolean;
  equipmentCompatibility: EquipmentCompatibility;
  permissionStatus: PermissionStatus;
  permissionQuestion: string;
  reasonCodes: string[];
}

const EQUIPMENT_ALIASES: Record<string, string> = {
  V: "V",
  VAN: "V",
  "DRY VAN": "V",
  VZ: "VZ",
  "VAN HAZMAT": "VZ",
  R: "R",
  REEFER: "R",
  RZ: "RZ",
  "REEFER HAZMAT": "RZ",
  F: "F",
  FLATBED: "F",
  FZ: "FZ",
  "FLATBED HAZMAT": "FZ",
};

const HAZMAT_CODES = new Set(["VZ", "RZ", "FZ", "CZ", "TZ"]);

const BASE_TO_HAZMAT_CODE: Record<string, string> = {
  V: "VZ",
  R: "RZ",
  F: "FZ",
  C: "CZ",
  T: "TZ",
};

const HAZMAT_EQUIPMENT_NAMES: Record<string, string> = {
  VZ: "van hazmat",
  RZ: "reefer hazmat",
  FZ: "flatbed hazmat",
  CZ: "container hazmat",
  TZ: "tanker hazmat",
};

export function normalizeEquipmentCodes(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : [value];
  const codes = rawItems
    .map((item) => String(item ?? "").trim().toUpperCase())
    .filter(Boolean)
    .map((item) => EQUIPMENT_ALIASES[item] ?? item);
  return [...new Set(codes)];
}

function effectiveHazmatCodes(equipment: string[], nonHazmat?: boolean): string[] {
  if (nonHazmat) {
    return equipment;
  }

  return [...new Set(equipment.map((code) => BASE_TO_HAZMAT_CODE[code] ?? code))];
}

export function classifyHazmatCandidate(
  input: HazmatCandidateInput
): HazmatCandidateDecision {
  const sourceEquipment = effectiveHazmatCodes(
    normalizeEquipmentCodes(input.sourceEquipment),
    input.sourceNonHazmat
  );
  const candidateEquipment = effectiveHazmatCodes(
    normalizeEquipmentCodes(input.candidateEquipment),
    input.candidateNonHazmat
  );
  const reasonCodes: string[] = [];

  const sourceHazmat =
    !input.sourceNonHazmat &&
    sourceEquipment.some((code) => HAZMAT_CODES.has(code));
  const candidateHazmat =
    !input.candidateNonHazmat &&
    candidateEquipment.some((code) => HAZMAT_CODES.has(code));

  if (!sourceHazmat || !candidateHazmat) {
    return {
      tier: "nonHazmatFallback",
      hazmatCompatible: false,
      equipmentCompatibility: "incompatible",
      permissionStatus: "notAsked",
      permissionQuestion: "",
      reasonCodes: ["nonHazmatFallback"],
    };
  }

  const exact = sourceEquipment.some((code) => candidateEquipment.includes(code));
  const reeferToVan =
    sourceEquipment.includes("RZ") && candidateEquipment.includes("VZ");
  const vanToReefer =
    sourceEquipment.includes("VZ") && candidateEquipment.includes("RZ");
  const requiresPermission = reeferToVan || vanToReefer;

  const overweight =
    input.sourceWeight !== null &&
    input.candidateWeight !== null &&
    (input.sourcePostType === "carrierPost"
      ? input.candidateWeight > input.sourceWeight
      : input.sourceWeight > input.candidateWeight);
  const equipmentMismatch = !exact && !requiresPermission;

  if (overweight) {
    reasonCodes.push("overweight");
  }

  if (equipmentMismatch) {
    reasonCodes.push("equipmentMismatch");
  }

  if (requiresPermission && !overweight) {
    const loadEquipment =
      input.sourcePostType === "brokerPost" ? sourceEquipment : candidateEquipment;
    const truckEquipment =
      input.sourcePostType === "brokerPost" ? candidateEquipment : sourceEquipment;
    const loadHazmatCode = loadEquipment.find((code) => HAZMAT_CODES.has(code));
    const truckHazmatCode = truckEquipment.find((code) =>
      HAZMAT_CODES.has(code)
    );

    return {
      tier: "hazmatPermission",
      hazmatCompatible: true,
      equipmentCompatibility: "requiresPermission",
      permissionStatus: "notAsked",
      permissionQuestion: `Can this ${
        HAZMAT_EQUIPMENT_NAMES[loadHazmatCode ?? ""] ?? "hazmat"
      } load move safely on ${
        HAZMAT_EQUIPMENT_NAMES[truckHazmatCode ?? ""] ?? "hazmat"
      } equipment?`,
      reasonCodes: ["equipmentPermission"],
    };
  }

  if (exact && !overweight) {
    return {
      tier: "strictHazmat",
      hazmatCompatible: true,
      equipmentCompatibility: "exact",
      permissionStatus: "notNeeded",
      permissionQuestion: "",
      reasonCodes,
    };
  }

  return {
    tier:
      overweight || equipmentMismatch
        ? "hazmatMarketAlternative"
        : "hazmatNearMatch",
    hazmatCompatible: true,
    equipmentCompatibility: exact
      ? "exact"
      : equipmentMismatch
      ? "incompatible"
      : "compatible",
    permissionStatus: "notNeeded",
    permissionQuestion: "",
    reasonCodes: reasonCodes.length ? reasonCodes : ["nearMatch"],
  };
}
