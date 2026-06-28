export type AgentCommandIntent = "search" | "showMore" | "unknown";

export interface ParsedAgentCommand {
  intent: AgentCommandIntent;
  originCity?: string;
  originState?: string;
  maxAgeHours?: number | null;
  maxWeight?: number | null;
  maxLength?: number | null;
  capacity?: "full" | "partial" | "any";
  equipmentCodes?: string[];
  limit?: number;
  showMore?: boolean;
  mapRequested?: boolean;
}

const BOOKING_COMMAND = /\b(book|ask about|ask|accept|reject)\s+(option|match)?\s*\d+\b/i;
const AGE_PATTERN = /\b(?:last|past)\s+(\d{1,3})\s*(?:h|hr|hrs|hour|hours)\b/i;
const WEIGHT_PATTERN = /\b(?:under|below|less than|max(?:imum)?)\s*\$?\s*((?:\d{2,3},\d{3})|\d{4,6})\s*(?:lb|lbs|pounds)?\b/i;
const LENGTH_PATTERN = /\b(?:under|below|less than|max(?:imum)?)\s*(\d{1,2})\s*(?:ft|feet|foot)\b/i;
const LOCATION_PATTERN = /\b(?:out of|around|near|in|from)\s+(.+?)(?=\s+(?:from the|for the|last|past|under|below|less than|max|only|with|and|in|ready|posted|hazmat|loads?|trucks?|shipments?|partials?|partial|full|map)\b|$)/i;
const IN_CITY_STATE_PATTERN = /\bin\s+([a-zA-Z .'-]+?)(?:,\s*|\s+)([A-Z]{2})\b/i;
const STATE_PATTERN = /^(.+?)(?:,\s*|\s+)([A-Z]{2})$/i;
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
]);

export function parseAgentCommand(prompt: string): ParsedAgentCommand {
  const text = String(prompt ?? "").trim();

  if (!text || BOOKING_COMMAND.test(text)) {
    return { intent: "unknown" };
  }

  if (/\b(show|see)\s+(me\s+)?more\b/i.test(text)) {
    return { intent: "showMore", showMore: true };
  }

  const looksSearchLike = /\b(anything|loads?|trucks?|shipments?|partials?|map|around|out of|near|from)\b/i.test(text);
  if (!looksSearchLike) {
    return { intent: "unknown" };
  }

  const location = parseLocation(text);
  const ageMatch = text.match(AGE_PATTERN);
  const weightMatch = text.match(WEIGHT_PATTERN);
  const lengthMatch = text.match(LENGTH_PATTERN);
  const capacity = /\bpartial|partials|ltl\b/i.test(text)
    ? "partial"
    : /\bfull|ftl\b/i.test(text)
    ? "full"
    : "any";
  const equipmentCodes = parseEquipmentCodes(text);

  return {
    intent: "search",
    originCity: location.city,
    originState: location.state,
    maxAgeHours: ageMatch ? Number(ageMatch[1]) : null,
    maxWeight: weightMatch ? Number(weightMatch[1].replace(/,/g, "")) : null,
    maxLength: lengthMatch ? Number(lengthMatch[1]) : null,
    capacity,
    ...(equipmentCodes.length ? { equipmentCodes } : {}),
    limit: 20,
    showMore: false,
    mapRequested: /\bmap|around\b/i.test(text),
  };
}

function parseEquipmentCodes(text: string): string[] {
  if (/\b(rz|reefer|refrigerated)\b/i.test(text)) {
    return ["RZ"];
  }
  if (/\b(vz|dry\s*van|van)\b/i.test(text)) {
    return ["VZ"];
  }
  return [];
}

function parseLocation(text: string): { city: string; state: string } {
  const locationMatch = text.match(LOCATION_PATTERN);
  const rawLocation = cleanLocation(locationMatch?.[1]);
  if (!rawLocation) {
    const inMatch = text.match(IN_CITY_STATE_PATTERN);
    if (inMatch) {
      return {
        city: cleanCity(inMatch[1]),
        state: inMatch[2].toUpperCase(),
      };
    }
  }
  if (!rawLocation) {
    return { city: "", state: "" };
  }

  const stateOnly = rawLocation.toUpperCase();
  if (US_STATE_CODES.has(stateOnly)) {
    return { city: "", state: stateOnly };
  }

  const stateMatch = rawLocation.match(STATE_PATTERN);
  if (stateMatch) {
    return {
      city: cleanCity(stateMatch[1]),
      state: stateMatch[2].toUpperCase(),
    };
  }

  return { city: cleanCity(rawLocation), state: "" };
}

function cleanLocation(value: string | undefined): string {
  return String(value ?? "")
    .replace(/\b(my|the|your|truck|hazmat|loads?|shipments?)\b/gi, "")
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCity(value: string | undefined): string {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "";
}
