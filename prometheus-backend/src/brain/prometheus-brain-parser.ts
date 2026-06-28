export type PrometheusBrainIntent =
  | "search"
  | "map"
  | "nearbyService"
  | "hazmatQuestion"
  | "draftEmail"
  | "draftChat"
  | "bookingApproval"
  | "saveMemory"
  | "generalTransportation";

export interface ParsedPrometheusBrainPrompt {
  intent: PrometheusBrainIntent;
  normalizedPrompt: string;
}

export function parsePrometheusBrainPrompt(
  prompt: string
): ParsedPrometheusBrainPrompt {
  const normalizedPrompt = String(prompt ?? "").trim();
  const lower = normalizedPrompt.toLowerCase();

  if (/\b(remember|save this|learn this|keep this)\b/.test(lower)) {
    return { intent: "saveMemory", normalizedPrompt };
  }

  if (/\b(email|send my truck list|send load list)\b/.test(lower)) {
    return { intent: "draftEmail", normalizedPrompt };
  }

  if (/\b(chat|message|ask broker|ask carrier|ask the broker|ask the carrier)\b/.test(lower)) {
    return { intent: "draftChat", normalizedPrompt };
  }

  if (/\b(book|approve booking|confirm booking|secure load)\b/.test(lower)) {
    return { intent: "bookingApproval", normalizedPrompt };
  }

  if (isHazmatOperationalQuestion(lower)) {
    return { intent: "hazmatQuestion", normalizedPrompt };
  }

  if (/\b(map|route|deadhead|loaded miles|tolls|fuel|avoid tolls)\b/.test(lower)) {
    return { intent: "map", normalizedPrompt };
  }

  if (/\b(truck stop|tire shop|repair shop|washout|nearest)\b/.test(lower)) {
    return { intent: "nearbyService", normalizedPrompt };
  }

  if (
    /\b(anything|loads?|trucks?|shipments?|partials?|out of|near|from|last|past|under)\b/.test(
      lower
    )
  ) {
    return { intent: "search", normalizedPrompt };
  }

  if (
    /\b(hazmat|placard|compatible|segregation|can i transport|1\.3|tanker)\b/.test(
      lower
    )
  ) {
    return { intent: "hazmatQuestion", normalizedPrompt };
  }

  return { intent: "generalTransportation", normalizedPrompt };
}

function isHazmatOperationalQuestion(lower: string): boolean {
  const hazmatContext =
    /\b(hazmat|placard|placarding|compatible|compatibility|segregation|1\.3|tanker|tunnel|tunnels|shipment)\b/.test(lower) ||
    /\bcan i transport\b/.test(lower);

  if (!hazmatContext) {
    return false;
  }

  const asksForReview =
    /\b(can i|can we|should|check|verify|review|accepting|moving|transport|allowed|legal|permit|permits|restriction|restrictions|through)\b/.test(lower);

  const explicitlySearching =
    /\b(find|search|show|list|available|anything|loads?|trucks?|out of|near|from|last|past|under)\b/.test(lower) &&
    !asksForReview;

  return asksForReview && !explicitlySearching;
}
