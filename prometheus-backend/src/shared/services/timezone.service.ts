import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|z|[+-]\d{2}:?\d{2})?$/;
const ZERO_OFFSET_PATTERN = /^[+-]0{2}:?0{2}$/;

function parseOffsetToSeconds(zone: string): number | null {
  if (!zone) {
    return null;
  }

  const normalized = zone.includes(':')
    ? zone
    : `${zone.slice(0, 3)}:${zone.slice(3)}`;

  if (!/^[+-]\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const sign = normalized.startsWith('-') ? -1 : 1;
  const [hoursStr, minutesStr] = normalized.slice(1).split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return sign * (hours * 3600 + minutes * 60);
}

export type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  offsetSeconds?: number | null;
};

interface TimeZoneInfo {
  timeZoneId: string;
  offsetSeconds: number | null;
}

@Injectable()
export class TimeZoneService {
  private readonly cache = new Map<string, TimeZoneInfo>();

  constructor(private readonly configService: ConfigService) {}

  extractDateParts(value: any): DateParts | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return this.dateToParts(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      const dateOnly = ISO_DATE_ONLY.exec(trimmed);
      if (dateOnly) {
        return {
          year: Number(dateOnly[1]),
          month: Number(dateOnly[2]),
          day: Number(dateOnly[3]),
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        };
      }

      const dateTime = ISO_DATE_TIME.exec(trimmed);
      if (dateTime) {
        const parts: DateParts = {
          year: Number(dateTime[1]),
          month: Number(dateTime[2]),
          day: Number(dateTime[3]),
          hour: Number(dateTime[4]),
          minute: Number(dateTime[5]),
          second: Number(dateTime[6] ?? '0'),
          millisecond: Number(dateTime[7] ?? '0'),
          offsetSeconds: null
        };

        const zone = dateTime[8];
        if (!zone) {
          return parts;
        }

        const zoneUpper = zone.toUpperCase();
        if (zoneUpper !== 'Z' && !ZERO_OFFSET_PATTERN.test(zoneUpper)) {
          const parsedOffset = parseOffsetToSeconds(zoneUpper);
          if (parsedOffset !== null) {
            parts.offsetSeconds = parsedOffset;
          }
          return parts;
        }

        const parsed = new Date(trimmed);
        if (!isNaN(parsed.getTime())) {
          return this.dateToParts(parsed);
        }
        return parts;
      }

      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return this.dateToParts(parsed);
      }
      return null;
    }

    if (typeof value === 'object') {
      const year = this.toNumber(value.year ?? value.Year ?? value.yyyy);
      const month = this.toNumber(value.month ?? value.Month ?? value.mm);
      const day = this.toNumber(value.day ?? value.Day ?? value.dd);

      if (year === null || month === null || day === null) {
        return null;
      }

      const hour = this.toNumber(value.hour ?? value.Hour) ?? 0;
      const minute = this.toNumber(value.minute ?? value.Minute) ?? 0;
      const second = this.toNumber(value.second ?? value.Second) ?? 0;
      const millisecond =
        this.toNumber(value.millisecond ?? value.Millisecond) ?? 0;

      return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        millisecond
      };
    }

    return null;
  }

  buildDateFromParts(parts: DateParts, offsetSeconds?: number | null): Date {
    const utcMillis = Date.UTC(
      parts.year,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
      parts.millisecond ?? 0
    );

    if (!Number.isFinite(utcMillis)) {
      return new Date();
    }

    if (offsetSeconds === null || offsetSeconds === undefined) {
      return new Date(utcMillis);
    }

    return new Date(utcMillis - offsetSeconds * 1000);
  }

  datePartsToUnixSeconds(parts: DateParts | null): number | null {
    if (!parts) {
      return null;
    }
    const millis = Date.UTC(
      parts.year,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
      parts.millisecond ?? 0
    );
    if (!Number.isFinite(millis)) {
      return null;
    }
    return Math.floor(millis / 1000);
  }

  async lookup(
    lat: number,
    lng: number,
    dateParts?: DateParts | null
  ): Promise<TimeZoneInfo | null> {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
    ) {
      return null;
    }

    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const apiKey =
      this.configService?.get<string>('AgmCoreModule') ??
      process.env.AgmCoreModule;
    if (!apiKey) {
      return null;
    }

    const timestamp =
      this.datePartsToUnixSeconds(dateParts ?? null) ??
      Math.floor(Date.now() / 1000);

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/timezone/json',
        {
          params: {
            location: `${lat},${lng}`,
            timestamp,
            key: apiKey
          }
        }
      );

      if (response.data?.status !== 'OK') {
        return null;
      }

      const timeZoneId = response.data?.timeZoneId;
      const rawOffset = Number(response.data?.rawOffset);
      const dstOffset = Number(response.data?.dstOffset);

      if (
        !timeZoneId ||
        !Number.isFinite(rawOffset) ||
        !Number.isFinite(dstOffset)
      ) {
        return null;
      }

      let offsetSeconds = rawOffset + dstOffset;
      if (!Number.isFinite(offsetSeconds)) {
        const baseDate = new Date(timestamp * 1000);
        offsetSeconds =
          this.getOffsetSecondsForZone(
            timeZoneId,
            this.extractDateParts(baseDate)
          ) ?? null;
      }

      const info: TimeZoneInfo = {
        timeZoneId,
        offsetSeconds
      };
      this.cache.set(cacheKey, info);
      return info;
    } catch {
      return null;
    }
  }

  getOffsetSecondsForZone(zoneId: string, parts?: DateParts | null): number | null {
    const baseParts = parts ?? this.extractDateParts(new Date());
    if (!baseParts) {
      return null;
    }

    const utcMillis = Date.UTC(
      baseParts.year,
      (baseParts.month ?? 1) - 1,
      baseParts.day ?? 1,
      baseParts.hour ?? 0,
      baseParts.minute ?? 0,
      baseParts.second ?? 0,
      baseParts.millisecond ?? 0
    );

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zoneId,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const partsList = formatter.formatToParts(new Date(utcMillis));
    const component = Object.create(null) as Record<string, string>;
    for (const part of partsList) {
      if (part.type !== 'literal') {
        component[part.type] = part.value;
      }
    }

    if (!component.year || !component.month || !component.day) {
      return null;
    }

    const localMillis = Date.UTC(
      Number(component.year),
      Number(component.month) - 1,
      Number(component.day),
      Number(component.hour ?? '0'),
      Number(component.minute ?? '0'),
      Number(component.second ?? '0'),
      baseParts.millisecond ?? 0
    );

    return Math.round((localMillis - utcMillis) / 1000);
  }

  private dateToParts(date: Date): DateParts {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      millisecond: date.getUTCMilliseconds()
    };
  }

  private toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : null;
    }
    return null;
  }
}
