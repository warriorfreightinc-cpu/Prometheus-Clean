# Prometheus Universal Freight Connector

## Purpose

This contract lets a broker, load board, TMS, or approved technology partner share loads and trucks with Prometheus without changing the matching engine for every provider.

Prometheus supports two integration paths:

1. The partner pushes normalized records to the Prometheus webhook.
2. The partner provides API documentation and credentials. A small provider adapter pulls their API and produces the same normalized batch internally.

An API key by itself is not enough. Prometheus also needs the provider's authentication method, endpoints, field definitions, pagination rules, update/removal behavior, rate limits, sandbox access, and permission to use the data.

## Company Setup

Create a company integration with:

- `category`: `loadboard` or `tms`
- `provider`: stable provider key, such as `partner_acme`
- `label`: name users should see in search results
- `status`: `connected`
- `enabled`: `true`
- `credentialRef`: environment/secret-manager key containing the webhook token
- `setupUrl`: optional provider API base URL or partner documentation URL

The secret value is never stored in the integration record or returned to the browser.

## Webhook

```text
POST /external-connectors/webhooks/{integrationId}
Authorization: Bearer {connector-token}
Content-Type: application/json
```

`x-prometheus-connector-key` can be used instead of the bearer header when a partner cannot set `Authorization`.

## Normalized Batch

```json
{
  "sourceRequestId": "partner-request-20260803-001",
  "sentAt": "2026-08-03T15:00:00.000Z",
  "fullSnapshot": false,
  "items": [
    {
      "externalId": "LOAD-10045",
      "kind": "load",
      "status": "available",
      "origin": {
        "city": "Chicago",
        "state": "IL",
        "postalCode": "60601",
        "country": "US",
        "latitude": 41.8781,
        "longitude": -87.6298
      },
      "destination": {
        "city": "Memphis",
        "state": "TN",
        "postalCode": "38103",
        "country": "US"
      },
      "pickup": {
        "earliest": "2026-08-04T13:00:00.000Z",
        "latest": "2026-08-04T17:00:00.000Z",
        "timeZone": "America/Chicago"
      },
      "delivery": {
        "earliest": "2026-08-05T14:00:00.000Z",
        "latest": "2026-08-05T20:00:00.000Z",
        "timeZone": "America/Chicago"
      },
      "equipment": ["VZ"],
      "lengthFeet": 53,
      "weightLbs": 42000,
      "commodity": "Class 3 chemicals",
      "hazmat": true,
      "hazmatClass": "3",
      "unNumbers": ["UN1993"],
      "capacity": "full",
      "rate": 2600,
      "currency": "USD",
      "specialNotes": "Tanker endorsement required",
      "contact": {
        "name": "Broker Desk",
        "company": "Partner Brokerage",
        "email": "loads@example.com",
        "phone": "+1-555-555-0100"
      },
      "booking": {
        "mode": "email",
        "email": "loads@example.com"
      },
      "sourceUpdatedAt": "2026-08-03T14:58:00.000Z",
      "expiresAt": "2026-08-04T17:00:00.000Z"
    }
  ]
}
```

`kind` may be `load` or `truck`. Booking mode may be `api`, `email`, `link`, `phone`, or `manual`.

Use the same `externalId` for updates. Send `status: removed` when an item is no longer available. When `fullSnapshot` is true, Prometheus retires active records from that integration that are missing from the batch.

## Response

```json
{
  "ok": true,
  "provider": "partner_acme",
  "integrationId": "...",
  "received": 1,
  "created": 1,
  "updated": 0,
  "removed": 0,
  "rejected": 0,
  "snapshotApplied": false,
  "errors": []
}
```

## Data Rules

- External records are private to the company that connected the account.
- Prometheus stores normalized operating fields, not provider credentials.
- Unknown hazmat status is excluded from hazmat AI searches.
- Expired and removed records are excluded from searches.
- AI results display the provider label so users know where the opportunity came from.
- Booking, bidding, and external messages remain approval-gated.

## Partner API Checklist

Ask the partner for:

- Sandbox and production API base URLs.
- OAuth, API-key, or signed-webhook authentication details.
- Load/truck search endpoints and sample responses.
- Pickup/delivery, equipment, weight, commodity, hazmat, rate, contact, notes, and booking fields.
- Pagination, filtering, rate limits, and expected polling interval.
- Webhook events or a reliable removed/cancelled status.
- Booking, bidding, or offer endpoints if available.
- Data-display, storage, expiration, and redistribution permissions.
- Technical contact for certification and production activation.
