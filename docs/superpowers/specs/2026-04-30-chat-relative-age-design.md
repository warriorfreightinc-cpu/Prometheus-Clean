# Chat Time And Age Design

## Purpose

Prometheus should show lightweight time awareness inside the chat-style workflow without adding timers across the whole workspace. Dispatchers need to know when a message, match, or booking event happened and whether it is fresh or stale while staying focused in the matching chat and booking chat.

## UX Decision

Use a compact clock time plus relative age in the chat/matching surfaces.

Examples:
- `3:33 PM | just now`
- `3:33 PM | 8 min ago`
- `3:33 PM | 50 min ago`
- `Yesterday | 12h ago`
- `Apr 29 | 2d ago`

The label should be small, quiet, and placed in the existing metadata area of each chat bubble or match row. It should not be wrapped in explanatory text like `Posted 50 min ago`. For same-day events, show the clock time first; for older events, show a short date label first.

## Scope

This feature applies to:
- Matching chat announcement bubbles.
- Match candidate rows/cards inside the AI matching console.
- Direct chat messages.
- Booking chat assistant/system messages.

This feature does not add:
- Global timer chips on workspace cards.
- New backend timer jobs.
- Alerting or stale-match color states.
- Legal agreement logic. That remains a separate booking-approval feature.

## Data Sources

Use existing timestamps first:
- Match candidates use `candidate.summary.publishedAt`.
- Match snapshots and match announcements use `createdAt` only if no candidate timestamp exists.
- Direct chat messages use `message.date`.
- ChatBB and booking assistant messages use `createdAt`.
- Load records may continue to use existing `createdAt` / `updatedAt`, but no new load-board timer UI is part of this feature.

If a timestamp is missing or invalid, the UI should omit the time label instead of showing `No activity yet`.

## Components

### Workspace Component

Add a reusable chat time formatter:
- Input: string, Date, null, or undefined.
- Output: small display string or empty string.
- Time buckets:
  - Under 60 seconds: `3:33 PM | just now`
  - 1-59 minutes: `3:33 PM | N min ago`
  - 1-23 hours: `3:33 PM | Nh ago`
  - 1+ days: `Apr 29 | Nd ago`

Use this formatter for booking/direct chat entries where `workspace.component.html` currently renders timestamps.

### AI Matching Console

Expose the same chat time helper for match candidate rows and announcement entries. Each match row should show the compact clock/date plus relative age, based on the matched post publish time. If the candidate has no publish time, hide the time label.

The existing chat-first visual style stays intact.

## Data Flow

1. User posts a load or truck.
2. Prometheus creates/renders match announcements.
3. Each match candidate renders its own clock/date plus relative age from the counterpart posting timestamp.
4. When a direct or booking chat message is shown, the message renders compact clock/date plus relative age from its message timestamp.
5. Existing refresh flows keep the labels updated when data reloads. A live minute-by-minute frontend interval is out of scope for this spec.

## Error Handling

Invalid, missing, or future timestamps should not break rendering.

Rules:
- Missing timestamp: show nothing.
- Invalid timestamp: show nothing.
- Future timestamp under 60 seconds: show the clock time plus `just now`.
- Future timestamp beyond 60 seconds: show nothing, because that usually means bad data.

## Testing

Add frontend unit coverage for the chat time formatter:
- Missing and invalid timestamps return an empty string.
- Recent same-day timestamps return the clock time plus `just now`.
- Minute, hour, and day buckets render correctly.
- Future timestamps beyond one minute return an empty string.

Verify the Angular build still passes after template changes.

## Acceptance Criteria

- Matching rows show labels like `3:33 PM | 50 min ago` or `Yesterday | 12h ago`.
- Direct chat and booking chat messages show compact clock/date plus relative age.
- No extra explanatory text is added around the age label.
- No global card/button timers are added.
- Missing timestamps do not display noisy fallback text.
