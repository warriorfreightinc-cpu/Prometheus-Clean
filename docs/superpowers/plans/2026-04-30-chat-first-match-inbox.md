# Chat-First Match Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI Load/Truck Matching Console into a chat-first match inbox that automatically announces ranked matches after posts load or are created.

**Architecture:** Keep the backend matching API shape unchanged, but normalize saved post documents before handing them to the legacy search services. Add a presentational `MatchAnnouncement` model in the workspace feature, generate announcements from `MatchSnapshot`, and render them as chat bubbles with embedded match cards. The existing ranked card panel stays available as a compact current-selection summary.

**Tech Stack:** Angular 16 components/templates/SCSS, NestJS matching service, existing `MatchingApiService`, existing `MatchSnapshot` and `MatchCandidate` types.

---

### Task 1: Model Match Announcements

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts`

- [ ] **Step 1: Add typed announcement models**

In `workspace.component.ts`, add these types near the other local type aliases:

```ts
type MatchAnnouncement = {
  id: string;
  sourcePostId: string;
  sourceLabel: string;
  sourceLane: string;
  count: number;
  createdAt: string;
  candidates: MatchCandidate[];
};
```

In `ai-matching-console.component.ts`, add the same local type or import it if it is exported later.

- [ ] **Step 2: Add component state and input**

In `WorkspaceComponent`, add:

```ts
matchAnnouncements: MatchAnnouncement[] = [];
```

In `AiMatchingConsoleComponent`, add:

```ts
@Input() matchAnnouncements: MatchAnnouncement[] = [];
@Output() openAnnouncementMatch = new EventEmitter<MatchCandidate>();
```

- [ ] **Step 3: Run frontend build to verify type errors fail fast**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\.worktrees\chat-first-match-inbox\prometheus\node_modules\@angular\cli\bin\ng.js' build
```

Expected before template changes: build may still pass if the new types are unused.

### Task 2: Generate Announcements Automatically

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`

- [ ] **Step 1: Add helper methods**

Add methods that convert a `MatchSnapshot` into a deduplicated announcement:

```ts
private upsertMatchAnnouncement(post: WorkspacePost, snapshot: MatchSnapshot): void {
  const candidates = snapshot?.candidates ?? [];
  const id = `match-${post._id}`;
  const announcement: MatchAnnouncement = {
    id,
    sourcePostId: post._id,
    sourceLabel: this.isBroker ? 'Your load' : 'Your truck',
    sourceLane: this.formatLane(post),
    count: candidates.length,
    createdAt: new Date().toISOString(),
    candidates,
  };
  this.matchAnnouncements = [
    announcement,
    ...this.matchAnnouncements.filter((entry) => entry.sourcePostId !== post._id),
  ].slice(0, 8);
}
```

Add a chat text helper:

```ts
private announceMatchSnapshot(post: WorkspacePost, snapshot: MatchSnapshot): void {
  const count = snapshot?.candidateCount ?? snapshot?.candidates?.length ?? 0;
  const counterpart = this.counterpartLabel.toLowerCase();
  const message = count
    ? `${count} matching ${counterpart} found for ${this.formatLane(post)}. Review the cards above and open the best lane when ready.`
    : `No matching ${counterpart} found yet for ${this.formatLane(post)}. Prometheus will show matches here after counterpart posts line up.`;
  this.appendMatchingBubble('assistant', message, 'Prometheus');
}
```

- [ ] **Step 2: Call helpers from `loadMatchCandidates`**

Inside `loadMatchCandidates` success:

```ts
this.upsertMatchAnnouncement(post, snapshot);
this.announceMatchSnapshot(post, snapshot);
```

Do this after setting `this.matchCandidates`.

- [ ] **Step 3: Improve dispatch success copy**

Change the manual/narrative dispatch success messages from “type show matches” to language that says Prometheus is checking matches automatically.

- [ ] **Step 4: Run frontend build**

Run the Angular build command. Expected: pass with existing budget warnings only.

### Task 3: Render Chat-First Match Cards

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html`
- Modify: `prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss`

- [ ] **Step 1: Pass announcements to component**

Update the workspace template where `app-ai-matching-console` is used:

```html
[matchAnnouncements]="matchAnnouncements"
(openAnnouncementMatch)="createRoomFromMatchCandidate($event)"
```

- [ ] **Step 2: Render announcement cards above normal console bubbles**

In the matching component template, render a section before regular chat bubbles:

```html
<article class="chat-bubble chat-bubble--announcement" *ngFor="let announcement of matchAnnouncements; trackBy: trackByAnnouncement">
  <div class="chat-bubble__meta">
    <strong>Prometheus matches</strong>
    <span>{{ formatTimestamp(announcement.createdAt) }}</span>
  </div>
  <div class="match-announcement">
    <div class="match-announcement__summary">
      <span>{{ announcement.sourceLabel }}</span>
      <strong>{{ announcement.sourceLane }}</strong>
      <em>{{ announcement.count }} matching {{ dispatchRoleLabel === 'loads' ? 'trucks' : 'loads' }} found</em>
    </div>
    <div class="match-announcement__cards">
      <article class="mini-match-card" *ngFor="let candidate of announcement.candidates; let index = index; trackBy: trackByCandidate">
        <strong>#{{ index + 1 }} {{ candidateLane(candidate) }}</strong>
        <span>{{ candidateMeta(candidate) }}</span>
        <div class="match-card__reasons">
          <em *ngFor="let reason of candidateReasons(candidate)">{{ reason }}</em>
        </div>
        <button class="secondary-button" type="button" (click)="openAnnouncementMatch.emit(candidate)">
          Open chat
        </button>
      </article>
    </div>
  </div>
</article>
```

- [ ] **Step 3: Add compact styles**

Add SCSS for `.chat-bubble--announcement`, `.match-announcement`, `.match-announcement__summary`, `.match-announcement__cards`, and `.mini-match-card` so desktop is comparison-friendly and mobile stacks like chat.

- [ ] **Step 4: Run frontend build**

Run Angular build. Expected: pass with existing budget warnings only.

### Task 4: Verify Live Workflow

**Files:**
- Modify: `prometheus-backend/src/matching/matching.service.ts`
- Test: `prometheus-backend/src/matching/matching.service.spec.ts`

- [ ] **Step 1: Write backend regression test for saved post normalization**

Create `prometheus-backend/src/matching/matching.service.spec.ts` with a test that calls `createSnapshotForCarrierPost` using a saved carrier post containing `Date` fields and asserts `brokerService.search` receives a cloned JSON-safe payload with ISO date strings.

- [ ] **Step 2: Run the backend regression test and verify it fails**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\.worktrees\chat-first-match-inbox\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.service.spec.ts --runInBand
```

Expected before implementation: FAIL because `brokerService.search` receives the original saved post object.

- [ ] **Step 3: Normalize saved posts in `MatchingService`**

Add a private `toSearchPayload(post)` helper that returns `JSON.parse(JSON.stringify(post ?? {}))`, use it before calling `brokerService.search` and `carrierService.search`, and persist snapshots from that normalized payload.

- [ ] **Step 4: Run the backend regression test and verify it passes**

Run the same Jest command. Expected: PASS.

### Task 5: Verify Live Workflow

**Files:**
- No source edits expected.

- [ ] **Step 1: Run frontend build from worktree**

Run Angular build. Expected: pass with existing budget warnings only.

- [ ] **Step 2: Run backend focused tests from worktree**

Run:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'C:\Prometheus-Clean\.worktrees\chat-first-match-inbox\prometheus-backend\node_modules\jest\bin\jest.js' src/matching/matching.controller.spec.ts src/messages/messages.service.spec.ts src/loads/loads.service.spec.ts --runInBand
```

Expected: all focused tests pass.

- [ ] **Step 3: Live API smoke against current backend**

If the running backend is stale, restart it from `prometheus-backend/dist/main.js`. Login as broker and carrier demo users and call `POST /matching/snapshots` for the latest posts. Expected: snapshot route exists and returns candidate counts for at least one demo post.

- [ ] **Step 4: Git status and commit**

Run:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' status --short --branch
```

Commit the completed UI change:

```powershell
& 'C:\Program Files\Git\cmd\git.exe' add docs/superpowers/plans/2026-04-30-chat-first-match-inbox.md prometheus/src/app/features/workspace/workspace.component.ts prometheus/src/app/features/workspace/workspace.component.html prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.ts prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.html prometheus/src/app/features/workspace/ai-matching-console/ai-matching-console.component.scss
& 'C:\Program Files\Git\cmd\git.exe' commit -m "feat: add chat first match inbox"
```
