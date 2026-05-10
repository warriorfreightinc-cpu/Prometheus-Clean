import { formatChatTimeLabel } from './chat-time-label';

describe('formatChatTimeLabel', () => {
  const now = new Date(2026, 3, 30, 15, 41, 0);

  it('returns an empty label for missing or invalid timestamps', () => {
    expect(formatChatTimeLabel(null, now)).toBe('');
    expect(formatChatTimeLabel(undefined, now)).toBe('');
    expect(formatChatTimeLabel('not-a-date', now)).toBe('');
  });

  it('formats recent same-day events as clock time plus just now', () => {
    const value = new Date(2026, 3, 30, 15, 40, 45);
    expect(formatChatTimeLabel(value, now)).toBe('3:40 PM | just now');
  });

  it('formats same-day minute age with clock time', () => {
    const value = new Date(2026, 3, 30, 15, 33, 0);
    expect(formatChatTimeLabel(value, now)).toBe('3:33 PM | 8 min ago');
  });

  it('formats same-day hour age with clock time', () => {
    const value = new Date(2026, 3, 30, 3, 33, 0);
    expect(formatChatTimeLabel(value, now)).toBe('3:33 AM | 12h ago');
  });

  it('formats previous-calendar-day events with Yesterday', () => {
    const earlyMorningNow = new Date(2026, 3, 30, 1, 33, 0);
    const value = new Date(2026, 3, 29, 13, 33, 0);
    expect(formatChatTimeLabel(value, earlyMorningNow)).toBe('Yesterday | 12h ago');
  });

  it('formats older events with short date and day age', () => {
    const value = new Date(2026, 3, 28, 15, 41, 0);
    expect(formatChatTimeLabel(value, now)).toBe('Apr 28 | 2d ago');
  });

  it('hides future timestamps more than one minute ahead', () => {
    const value = new Date(2026, 3, 30, 15, 43, 0);
    expect(formatChatTimeLabel(value, now)).toBe('');
  });
});
