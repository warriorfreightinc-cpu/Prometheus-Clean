# Direct Chat V1 Design

## Goal

Direct Chat gives dispatchers a simple contact-driven room for broker/carrier conversations. A user can save the counterparty from Booking Chat, search existing contacts by email/name/company/phone, add a matched contact, and manage a conversation with mute, archive, and delete controls.

## Scope

- Add from Booking Chat keeps the selected booking counterparty and opens Direct Chat / Main chat.
- Main chat search filters current live rooms and saved contacts by email, contact name, company name, or phone.
- Search results show one clear action: add the result to contacts, or open it if it is already saved.
- Conversation header exposes Mute, Archive, and Delete controls.
- Mute keeps the conversation visible and marks it muted.
- Archive hides the conversation from the normal list and keeps the record/history.
- Delete removes the local saved contact and staged local thread only. It does not delete backend booking rooms or live booking history.

## Out Of Scope

- Backend company-wide contact search.
- Permanent deletion of backend room history.
- Notification delivery rules beyond local muted/archive state.
- Separate broker/carrier/company backend room permissions.

## User Flow

1. User books a load and clicks Add contact in Booking Chat.
2. Prometheus saves the selected counterparty and switches to Main chat.
3. User can search contacts/live rooms from Main chat.
4. If the result is not saved, user clicks Add to contacts.
5. User opens the conversation and can mute, archive, or delete the local contact entry.

