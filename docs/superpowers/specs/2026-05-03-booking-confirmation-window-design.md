# Booking Confirmation Window Design

## Goal

Prometheus should not create a live Booking Chat load when only one side casually clicks an approval prompt. The AI should ask in chat, then open a short legal-style confirmation window. Broker and carrier must both accept through the shared booking-status endpoint before Prometheus creates the live load.

## User Flow

1. A broker/carrier reaches a booking-ready conversation.
2. The AI prompt asks: "Approve booking or reject the offer?"
3. Clicking "Approve booking" opens a confirmation window instead of calling the backend immediately.
4. The window shows the lane, counterparty, rate, and a five-minute countdown.
5. "Accept booking" saves this user's approval through the existing `updateBookingStatus(... action: 'approve')` endpoint.
6. "Reject booking" saves cancellation through `updateBookingStatus(... action: 'cancel')`.
7. If the backend returns `bookingStatus: booked`, both sides have approved and Prometheus creates the live load from the room.
8. If the timer expires before the user acts, no backend call is made and the AI tells the user to ask Prometheus to book again.

## Implementation Notes

- Keep the source of truth in the backend booking room fields that already exist: `bookingStatus`, `brokerApprovedBooking`, and `carrierApprovedBooking`.
- Keep duplicate-load protection in `LoadsApiService.createFromRoom` and the backend load service.
- The popup timer is frontend-only for this slice. The backend remains the authority for final approval state.
- Existing direct calls to `confirmSelectedBookingApproval()` remain available for tests and internal flows, but visible AI actions must route through the confirmation window.

## Testing

- Button approval opens the confirmation window and does not call the backend yet.
- Accepting the window calls the approve endpoint.
- Rejecting the window calls the cancel endpoint.
- Expired windows do not call the backend and leave an assistant message.
