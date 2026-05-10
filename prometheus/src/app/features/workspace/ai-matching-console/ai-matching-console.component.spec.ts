import { AiMatchingConsoleComponent } from './ai-matching-console.component';

describe('AiMatchingConsoleComponent time labels', () => {
  it('keeps the matching console as a chat-only surface', () => {
    const component = new AiMatchingConsoleComponent() as any;

    expect(component.openDirectRoom).toBeUndefined();
    expect(component.openAnnouncementMatch).toBeUndefined();
    expect(component.refreshMatches).toBeUndefined();
    expect(component.runChatbbAction).toBeUndefined();
  });

  it('formats chat message time with clock and age', () => {
    const component = new AiMatchingConsoleComponent();
    const now = new Date(2026, 3, 30, 15, 41, 0);
    const value = new Date(2026, 3, 30, 15, 33, 0);

    expect(component.formatTimestamp(value.toISOString(), now)).toBe('3:33 PM | 8 min ago');
  });
});
