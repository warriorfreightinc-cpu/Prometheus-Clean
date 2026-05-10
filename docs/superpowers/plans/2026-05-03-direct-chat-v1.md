# Direct Chat V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Direct Chat v1 flow for search/add contacts and local mute/archive/delete controls.

**Architecture:** Keep this slice inside the existing Angular workspace component because Direct Chat state already lives there. Extend the local contact record with muted/archived/deleted metadata, expose filtered/search result getters, and wire the template to the existing Main chat panel.

**Tech Stack:** Angular 16, TypeScript, Jasmine/Karma, localStorage for v1 direct contact state.

---

### Task 1: Contact State And Search

**Files:**
- Modify: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.ts`
- Test: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.spec.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `saveCurrentBrokerContact()` switches Booking Chat to Main chat and stores the selected room contact.
- `directSearchResults` filters by email, contact name, company name, and phone.
- An unsaved live room result can be saved through `saveBrokerDeskEntryContact(entry)`.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts`

Expected: FAIL because `directSearchResults` and `saveBrokerDeskEntryContact` are not implemented.

- [ ] **Step 3: Implement minimal state/search**

Extend `DirectContactRecord` and `BrokerDeskEntry` with local flags. Add `directContactSearch`, `showArchivedDirectContacts`, `visibleBrokerDeskEntries`, `directSearchResults`, `saveBrokerDeskEntryContact`, and helper functions for contact identity.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts`

Expected: PASS for Direct Chat tests.

### Task 2: Conversation Controls

**Files:**
- Modify: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.ts`
- Test: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.spec.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `muteSelectedBrokerConversation()` marks the selected contact as muted and keeps it in the normal list.
- `archiveSelectedBrokerConversation()` hides the contact from the normal list until archived contacts are shown.
- `deleteSelectedBrokerConversation()` removes the local contact and does not remove live backend rooms.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts`

Expected: FAIL because conversation controls are not implemented.

- [ ] **Step 3: Implement minimal controls**

Add methods that upsert or update the selected contact flags and persist local state. For live rooms, delete only removes the saved contact/suppresses it locally; it does not mutate `rooms`.

- [ ] **Step 4: Re-run the focused test**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts`

Expected: PASS.

### Task 3: Template And Styling

**Files:**
- Modify: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.html`
- Modify: `C:\Prometheus-Clean\prometheus\src\app\features\workspace\workspace.component.scss`

- [ ] **Step 1: Wire the Main chat search UI**

Replace the Add Broker first interaction with a compact search input, search result list, and Add to contacts/Open actions.

- [ ] **Step 2: Wire conversation controls**

Add Mute, Archive, and Delete buttons to the selected Main chat conversation header.

- [ ] **Step 3: Style active/muted/archived states**

Add minimal classes for search rows, contact actions, archived filter, and muted/archive/delete state labels.

### Task 4: Verification

**Files:**
- Verify project only.

- [ ] **Step 1: Run focused workspace tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/features/workspace/workspace.component.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run full frontend tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS. Existing budget warnings may remain.

