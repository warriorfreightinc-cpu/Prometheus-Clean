# Chat Time And Age Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show compact clock/date plus relative age labels inside matching, direct chat, and booking chat surfaces.

**Architecture:** Add one shared frontend time formatter and reuse it from the workspace and AI matching console. Keep the existing full timestamp formatter for load-board and post-card areas so this feature does not add global timers outside chat.

**Tech Stack:** Angular 16, TypeScript, Jasmine/Karma, existing workspace and AI matching console components.

---

## File Structure

- Create `prometheus/src/app/shared/time/chat-time-label.ts`
  - Owns compact chat time formatting.
  - Accepts an optional `now` argument for deterministic tests.
- Create `prometheus/src/app/shared/time/chat-time-label.spec.ts`
  - Unit tests minute/hour/day/future/missing timestamp behavior.
- Modify `prometheus/src/app/features/workspace/workspace.component.ts`
  - Import the shared formatter.
  - Add `formatChatTime(value)` for chat templates only.
  - Leave existing `formatTimestamp(value)` unchanged for non-chat surfaces.
- Modify `prometheus/src/app/features/workspace/workspace.component.html`
  - Replace direct chat, company chat, and booking chat timestamp calls with `formatChatTime`.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
  - Import the shared formatter.
  - Use compact labels for match announcements, ChatBB messages, and candidate publish times.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
  - Add compact labels to ranked match cards and mini match cards.
- Modify `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`
  - Add quiet metadata styles for the new labels.

---

### Task 1: Shared Chat Time Formatter

**Files:**
- Create: `prometheus/src/app/shared/time/chat-time-label.ts`
- Create: `prometheus/src/app/shared/time/chat-time-label.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `prometheus/src/app/shared/time/chat-time-label.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' test --watch=false --browsers=ChromeHeadless --include 'src/app/shared/time/chat-time-label.spec.ts'
```

Expected: FAIL because `./chat-time-label` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `prometheus/src/app/shared/time/chat-time-label.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' test --watch=false --browsers=ChromeHeadless --include 'src/app/shared/time/chat-time-label.spec.ts'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
cd C:\Prometheus-Clean
& 'C:\Program Files\Git\cmd\git.exe' add prometheus/src/app/shared/time/chat-time-label.ts prometheus/src/app/shared/time/chat-time-label.spec.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: add chat time label formatter"
```

---

### Task 2: Workspace Chat Labels

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`

- [ ] **Step 1: Write the failing check**

No component unit test exists for this large workspace component. Use a template grep check after editing the template expectation first:

Expected final template must contain `formatChatTime(entry.date)` for the three chat message renderers and must keep `formatTimestamp` available for non-chat uses.

Run before implementation:

```powershell
Select-String -Path 'C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html' -Pattern 'formatChatTime\(entry\.date\)'
```

Expected: no matches.

- [ ] **Step 2: Add the formatter import and method**

In `workspace.component.ts`, add this import near the other shared imports:

```typescript
import { formatChatTimeLabel } from '../../shared/time/chat-time-label';
```

Add this public method near the existing `formatTimestamp` method:

```typescript
formatChatTime(value: string | Date | null | undefined): string {
  return formatChatTimeLabel(value);
}
```

Do not change the existing `formatTimestamp` method because load-board and post-card UI still use it.

- [ ] **Step 3: Replace chat-only timestamp bindings**

In `workspace.component.html`, replace each chat timestamp binding with a hidden-when-empty label.

Booking chat entry metadata:

```html
<span *ngIf="formatChatTime(entry.date) as timeLabel">{{ timeLabel }}</span>
```

Company chat messages:

```html
<time *ngIf="formatChatTime(entry.date) as timeLabel">{{ timeLabel }}</time>
```

Direct chat messages:

```html
<time *ngIf="formatChatTime(entry.date) as timeLabel">{{ timeLabel }}</time>
```

- [ ] **Step 4: Verify template check passes**

Run:

```powershell
Select-String -Path 'C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html' -Pattern 'formatChatTime\(entry\.date\)'
```

Expected: three matches.

- [ ] **Step 5: Commit**

```powershell
cd C:\Prometheus-Clean
& 'C:\Program Files\Git\cmd\git.exe' add prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.html
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: show chat time labels in workspace"
```

---

### Task 3: AI Matching Console Time Labels

**Files:**
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`

- [ ] **Step 1: Write the failing component spec**

Create `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts`:

```typescript
import { AiMatchingConsoleComponent } from './ai-matching-console.component';

describe('AiMatchingConsoleComponent time labels', () => {
  it('formats chat message time with clock and age', () => {
    const component = new AiMatchingConsoleComponent();
    const now = new Date(2026, 3, 30, 15, 41, 0);
    const value = new Date(2026, 3, 30, 15, 33, 0);

    expect(component.formatTimestamp(value.toISOString(), now)).toBe('3:33 PM | 8 min ago');
  });

  it('formats candidate publish time using the same compact label', () => {
    const component = new AiMatchingConsoleComponent();
    const now = new Date(2026, 3, 30, 15, 41, 0);

    expect(component.formatCandidateTime(
      { summary: { publishedAt: new Date(2026, 3, 30, 3, 33, 0).toISOString() } } as any,
      now
    )).toBe('3:33 AM | 12h ago');
  });
});
```

- [ ] **Step 2: Run component spec to verify it fails**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' test --watch=false --browsers=ChromeHeadless --include 'src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts'
```

Expected: FAIL because `formatTimestamp` does not accept a deterministic `now` value and `formatCandidateTime` does not exist.

- [ ] **Step 3: Wire the component to the shared formatter**

In `ai-matching-console.component.ts`, add:

```typescript
import { formatChatTimeLabel } from '../../../shared/time/chat-time-label';
```

Replace the existing `formatTimestamp` method with:

```typescript
formatTimestamp(value: string | Date | null | undefined, now = new Date()): string {
  return formatChatTimeLabel(value, now);
}

formatCandidateTime(candidate: MatchCandidate, now = new Date()): string {
  return formatChatTimeLabel(candidate.summary?.publishedAt, now);
}
```

- [ ] **Step 4: Add labels to matching templates**

In `ai-matching-console.component.html`, add a compact time label under the candidate metadata in the ranked match cards:

```html
<small class="match-card__time" *ngIf="formatCandidateTime(candidate) as timeLabel">{{ timeLabel }}</small>
```

Add the same label under the mini match card metadata:

```html
<small class="mini-match-card__time" *ngIf="formatCandidateTime(candidate) as timeLabel">{{ timeLabel }}</small>
```

Keep announcement and ChatBB metadata using:

```html
<span *ngIf="formatTimestamp(announcement.createdAt) as timeLabel">{{ timeLabel }}</span>
<span *ngIf="formatTimestamp(message.createdAt) as timeLabel">{{ timeLabel }}</span>
```

- [ ] **Step 5: Add quiet metadata styles**

In `ai-matching-console.component.scss`, add:

```scss
.match-card__time,
.mini-match-card__time {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.3;
}
```

- [ ] **Step 6: Run component spec to verify it passes**

Run:

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' test --watch=false --browsers=ChromeHeadless --include 'src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts'
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
cd C:\Prometheus-Clean
& 'C:\Program Files\Git\cmd\git.exe' add prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: show match time labels in chat inbox"
```

---

### Task 4: Final Verification

**Files:**
- Verify all changed frontend files.

- [ ] **Step 1: Run focused formatter tests**

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' test --watch=false --browsers=ChromeHeadless --include 'src/app/shared/time/chat-time-label.spec.ts' --include 'src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts'
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

```powershell
cd C:\Prometheus-Clean\prometheus
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\@angular\cli\bin\ng.js' build
```

Expected: PASS. Existing bundle/style budget warnings may remain; no new build errors.

- [ ] **Step 3: Browser smoke check**

Open `http://localhost:4300/workspace`, post or select a truck/load, and verify:

```text
3:33 PM | 8 min ago
Yesterday | 12h ago
Apr 29 | 2d ago
```

Labels should appear inside matching/direct/booking chat areas only.

- [ ] **Step 4: Commit final cleanup if needed**

If final verification required small fixes:

```powershell
cd C:\Prometheus-Clean
& 'C:\Program Files\Git\cmd\git.exe' add prometheus/src/app
& 'C:\Program Files\Git\cmd\git.exe' commit -m "fix: polish chat time labels"
```

If no cleanup was needed, skip this commit.
