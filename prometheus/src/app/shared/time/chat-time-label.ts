const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatChatTimeLabel(value: string | Date | null | undefined, now = new Date()): string {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < -MINUTE_MS) return '';

  const age = formatAge(Math.max(0, diffMs));
  const prefix = formatPrefix(date, now);
  return prefix ? `${prefix} | ${age}` : age;
}

function formatAge(diffMs: number): string {
  if (diffMs < MINUTE_MS) return 'just now';
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} min ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  return `${Math.floor(diffMs / DAY_MS)}d ago`;
}

function formatPrefix(date: Date, now: Date): string {
  const dayDiff = calendarDayDiff(date, now);
  if (dayDiff === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function calendarDayDiff(date: Date, now: Date): number {
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.floor((nowStart - dateStart) / DAY_MS);
}
