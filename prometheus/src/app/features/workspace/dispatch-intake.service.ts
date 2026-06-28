import { Injectable } from '@angular/core';

type WorkspaceRole = 'broker' | 'carrier';

export interface DispatchPlaceDraft {
  city: string;
  state: string;
}

export interface ParsedDispatchDraft {
  role: WorkspaceRole;
  quantity: number;
  equipmentPreset: string;
  equipmentCodes: string[];
  capacity: string;
  length: number;
  weight: number;
  rate?: number;
  readyDate: string;
  endDate: string;
  contactHint?: string;
  origin: DispatchPlaceDraft;
  destination: DispatchPlaceDraft | null;
  destinationOpen: boolean;
  hazmatRequested: boolean;
  teamRequested: boolean;
  note: string;
  summary: string;
  warnings: string[];
}

export interface DispatchParseResult {
  draft: ParsedDispatchDraft | null;
  error: string | null;
}

export interface DispatchImportRejectedRow {
  line: string;
  reason: string;
  index: number;
}

export interface DispatchImportParseResult {
  drafts: ParsedDispatchDraft[];
  rejected: DispatchImportRejectedRow[];
  ignored: string[];
}

type EquipmentPreset = {
  preset: string;
  codes: string[];
  terms: string[];
  defaultLength: number;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  { preset: 'VR', codes: ['V', 'R'], terms: ['van reefer', 'reefer van'], defaultLength: 53 },
  { preset: 'V', codes: ['V'], terms: ['dry van', 'van'], defaultLength: 53 },
  { preset: 'R', codes: ['R'], terms: ['reefer'], defaultLength: 53 },
  { preset: 'F', codes: ['F'], terms: ['flatbed'], defaultLength: 48 },
  { preset: 'S', codes: ['S'], terms: ['step deck', 'stepdeck'], defaultLength: 48 },
  { preset: 'P', codes: ['P'], terms: ['power only'], defaultLength: 53 },
  { preset: 'C', codes: ['C'], terms: ['tanker'], defaultLength: 48 },
];

@Injectable({ providedIn: 'root' })
export class DispatchIntakeService {
  parse(role: WorkspaceRole, input: string): DispatchParseResult {
    const note = this.normalizeInput(input);
    if (!note) {
      return { draft: null, error: 'Type the truck or load details in plain language first.' };
    }

    const quantity = this.parseQuantity(note, role);
    const equipment = this.parseEquipment(note);
    const origin = this.parseOrigin(note, role);
    const destination = this.parseDestination(note);
    const destinationOpen = this.hasOpenDestination(note);
    const readyOffset = this.parseReadyOffset(note);
    const startDate = this.shiftDate(readyOffset);
    const endDate = this.shiftDate(this.parseEndOffset(note, readyOffset));
    const weight = this.parseWeight(note);
    const rate = this.parseRate(note);
    const warnings: string[] = [];

    if (!origin) {
      return { draft: null, error: `Prometheus could not find an origin city/state in the ${role === 'carrier' ? 'truck' : 'load'} note.` };
    }

    if (role === 'broker' && !destination) {
      return { draft: null, error: 'Broker load posts still need a destination city/state in the note.' };
    }

    if (role === 'carrier' && !destination && destinationOpen) {
      warnings.push('Destination is open, so the truck will post with origin-only matching.');
    }

    if (note.includes('hazmat')) {
      warnings.push('Hazmat was detected in the note. The structured hazmat controls are still minimal, so verify the post after creation.');
    }

    if (!weight) {
      warnings.push('No weight was found, so Prometheus will use 45000 lbs as the default.');
    }

    if (!rate && role === 'broker') {
      warnings.push('No rate was found in the note, so the load will post without a quoted rate.');
    }

    const draft: ParsedDispatchDraft = {
      role,
      quantity,
      equipmentPreset: equipment.preset,
      equipmentCodes: equipment.codes,
      capacity: this.parseCapacity(note),
      length: this.parseLength(note) ?? equipment.defaultLength,
      weight: weight ?? 45000,
      rate: rate ?? undefined,
      readyDate: startDate,
      endDate,
      contactHint: this.parseContactHint(note),
      origin,
      destination,
      destinationOpen,
      hazmatRequested: note.includes('hazmat'),
      teamRequested: note.includes('team'),
      note: input.trim(),
      summary: this.buildSummary(role, quantity, origin, destination, destinationOpen, equipment.codes, weight ?? 45000, startDate),
      warnings,
    };

    return { draft, error: null };
  }

  parseBatch(role: WorkspaceRole, input: string): DispatchImportParseResult {
    const drafts: ParsedDispatchDraft[] = [];
    const rejected: DispatchImportRejectedRow[] = [];
    const ignored: string[] = [];
    const lines = this.importLines(input);

    lines.forEach((line, index) => {
      if (this.isImportHeader(line)) {
        ignored.push(line);
        return;
      }

      const parsed = this.parse(role, line);
      if (parsed.draft) {
        drafts.push(parsed.draft);
        return;
      }

      rejected.push({
        line,
        reason: parsed.error || 'Prometheus could not find enough lane details in this row.',
        index,
      });
    });

    return { drafts, rejected, ignored };
  }

  private normalizeInput(input: string): string {
    return input.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private importLines(input: string): string[] {
    return input
      .split(/\r?\n|;/)
      .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
  }

  private isImportHeader(line: string): boolean {
    const normalized = line.toLowerCase();
    const hasLaneHeaders = normalized.includes('origin') && normalized.includes('destination');
    const hasStopHeaders = normalized.includes('pickup') && normalized.includes('delivery');
    return hasLaneHeaders || hasStopHeaders;
  }

  private parseQuantity(input: string, role: WorkspaceRole): number {
    const unitPattern = role === 'carrier' ? /(\d+)\s+(truck|trucks)\b/ : /(\d+)\s+(load|loads)\b/;
    const directMatch = input.match(unitPattern);
    if (directMatch) {
      return Math.max(1, Number(directMatch[1]));
    }

    const wordPattern = role === 'carrier'
      ? new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+(truck|trucks)\\b`)
      : new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+(load|loads)\\b`);
    const wordMatch = input.match(wordPattern);
    if (wordMatch) {
      return NUMBER_WORDS[wordMatch[1]] ?? 1;
    }

    return 1;
  }

  private parseEquipment(input: string): EquipmentPreset {
    const match = EQUIPMENT_PRESETS.find((option) => option.terms.some((term) => input.includes(term)));
    return match ?? EQUIPMENT_PRESETS[1];
  }

  private parseOrigin(input: string, role: WorkspaceRole): DispatchPlaceDraft | null {
    const patterns = role === 'carrier'
      ? [
          /\b(?:in|out of|from)\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
          /\b(?:post|create|add|check)?\s*(?:\d+\s+)?(?:truck|trucks|driver|drivers|unit)\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
        ]
      : [
          /\bfrom\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
          /\bin\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
          /\b(?:post|create|add)?\s*(?:\d+\s+)?(?:hazmat\s+)?(?:load|loads|shipment|shipments)\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
        ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return this.normalizePlace(match[1], match[2]);
      }
    }

    const fallback = input.match(/\b([a-z .'-]+),\s*([a-z]{2})\b/i);
    return fallback ? this.normalizePlace(fallback[1], fallback[2]) : null;
  }

  private parseDestination(input: string): DispatchPlaceDraft | null {
    const patterns = [
      /\b(?:to|going to|headed to|deliver(?:y)? to|looking to go to)\s+([a-z .'-]+),\s*([a-z]{2})\b/i,
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return this.normalizePlace(match[1], match[2]);
      }
    }

    return null;
  }

  private normalizePlace(city: string, state: string): DispatchPlaceDraft {
    return {
      city: city
        .split(' ')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      state: state.toUpperCase(),
    };
  }

  private hasOpenDestination(input: string): boolean {
    return ['open destination', 'open dest', 'open lane', '48 states', 'all 48', 'open'].some((token) => input.includes(token));
  }

  private parseCapacity(input: string): string {
    if (input.includes('partial') || input.includes('ltl')) {
      return 'partial';
    }
    return 'full';
  }

  private parseLength(input: string): number | null {
    const match = input.match(/\b(\d{2})\s*(?:ft|feet|foot|')\b/i);
    return match ? Number(match[1]) : null;
  }

  private parseWeight(input: string): number | null {
    const prioritizedPatterns = [
      /\b(?:scale|can scale|scales|weight|weighs|up to)\s*\$?\s*([\d,]{4,6})\b/i,
      /\b([\d,]{4,6})\s*(?:lbs|lb|pounds)\b/i,
    ];

    for (const pattern of prioritizedPatterns) {
      const match = input.match(pattern);
      if (match) {
        return Number(match[1].replace(/,/g, ''));
      }
    }

    const numericCandidates = Array.from(input.matchAll(/\b([\d,]{4,6})\b/g))
      .map((match) => Number(match[1].replace(/,/g, '')))
      .filter((value) => Number.isFinite(value) && value >= 5000 && value <= 80000);

    return numericCandidates[0] ?? null;
  }

  private parseRate(input: string): number | null {
    const match = input.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  }

  private parseReadyOffset(input: string): number {
    if (input.includes('tomorrow') || input.includes('next day')) {
      return 1;
    }
    return 0;
  }

  private parseEndOffset(input: string, startOffset: number): number {
    if (input.includes('through tomorrow') || input.includes('tomorrow as well')) {
      return Math.max(startOffset, 1);
    }
    return startOffset;
  }

  private shiftDate(offset: number): string {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    value.setDate(value.getDate() + offset);
    return value.toISOString().slice(0, 10);
  }

  private parseContactHint(input: string): string | undefined {
    const emailMatch = input.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (emailMatch) {
      return emailMatch[0];
    }

    const phoneDigits = input.replace(/\D/g, '');
    return phoneDigits.length >= 10 ? phoneDigits.slice(0, 10) : undefined;
  }

  private buildSummary(
    role: WorkspaceRole,
    quantity: number,
    origin: DispatchPlaceDraft,
    destination: DispatchPlaceDraft | null,
    destinationOpen: boolean,
    equipmentCodes: string[],
    weight: number,
    readyDate: string
  ): string {
    const unitLabel = `${quantity} ${role === 'carrier' ? 'truck' : 'load'}${quantity === 1 ? '' : 's'}`;
    const destinationLabel = destination
      ? `${destination.city}, ${destination.state}`
      : destinationOpen
        ? 'open destination'
        : 'no destination';

    return `${unitLabel} from ${origin.city}, ${origin.state} to ${destinationLabel}, ${equipmentCodes.join('/')} ${weight.toLocaleString('en-US')} lbs, ready ${readyDate}.`;
  }
}
