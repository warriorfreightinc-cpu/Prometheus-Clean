import { Document } from "mongoose";

export type MessageBookingStatus = "negotiating" | "booked" | "cancelled" | "delivered";

export interface BookingWorkflowState {
  setupProvider?: string;
  setupLabel?: string;
  setupSource?: string;
  setupUpdatedAt?: Date;
  driverId?: string;
  driverName?: string;
  truckLabel?: string;
  driverUpdatedAt?: Date;
  contactSaved?: boolean;
  contactName?: string;
  contactEmail?: string;
  contactUpdatedAt?: Date;
  trackingProvider?: string;
  trackingSource?: string;
  trackingShared?: boolean;
  trackingUpdatedAt?: Date;
  delivered?: boolean;
  deliveredAt?: Date;
  cancelled?: boolean;
  cancellationMode?: string;
  cancellationNote?: string;
  cancellationAt?: Date;
  readyToBill?: boolean;
  readyToBillAt?: Date;
  updatedAt?: Date;
  updatedBy?: string;
}

export interface Messages extends Document {
  carrierPostId: string;
  brokerPostId: string;
  brokerId: string;
  hiddenForBroker: boolean;
  hiddenForCarrier: boolean;
  carrierId: string;
  createdBy: string;
  messages: Array<Object>;
  seen: { brokerCount: Number; carrierCount: Number };
  bookingStatus: MessageBookingStatus;
  brokerApprovedBooking: boolean;
  carrierApprovedBooking: boolean;
  bookingConfirmedAt?: Date;
  bookingConfirmedBy?: string;
  bookingRate?: number;
  bookingNotes?: string;
  loadId?: string;
  bookingCancelledAt?: Date;
  bookingStatusUpdatedAt?: Date;
  bookingStatusUpdatedBy?: string;
  bookingWorkflow?: BookingWorkflowState;
}
