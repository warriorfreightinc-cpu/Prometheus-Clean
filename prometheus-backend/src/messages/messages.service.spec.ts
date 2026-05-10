import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

jest.mock("src/gateway/app.gateway", () => ({
  AppGateway: class AppGateway {},
}), { virtual: true });

jest.mock("./dto/create-room.dto", () => ({
  RoomDTO: class RoomDTO {},
}));

import { MessagesService } from "./messages.service";

describe("MessagesService booking lifecycle", () => {
  const companyModel: any = {};
  const userModel: any = {
    updateMany: jest.fn(),
  };
  const messagesModel: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const gateway: any = {
    broadcast: jest.fn(),
  };

  function service() {
    return new MessagesService(companyModel, userModel, messagesModel, gateway);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a room with negotiating booking state and returns the room", async () => {
    messagesModel.find.mockResolvedValue([]);
    messagesModel.create.mockResolvedValue({
      _id: "room-1",
      carrierPostId: "carrier-post-1",
      brokerPostId: "broker-post-1",
      brokerId: "broker-user-1",
      carrierId: "carrier-user-1",
      bookingStatus: "negotiating",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
      toObject: () => ({
        _id: "room-1",
        bookingStatus: "negotiating",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });

    const result = await service().createRoom(
      {
        myPostId: "broker-post-1",
        otherPostId: "carrier-post-1",
        otherUserId: "carrier-user-1",
      },
      "broker-user-1",
      "broker"
    );

    expect(messagesModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        carrierPostId: "carrier-post-1",
        brokerPostId: "broker-post-1",
        bookingStatus: "negotiating",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      })
    );
    expect(result.created).toBe(true);
    expect(result.room.bookingStatus).toBe("negotiating");
  });

  it("returns the existing room instead of false when the room already exists", async () => {
    messagesModel.find.mockResolvedValue([
      { _id: "room-1", bookingStatus: "negotiating" },
    ]);

    const result = await service().createRoom(
      {
        myPostId: "broker-post-1",
        otherPostId: "carrier-post-1",
        otherUserId: "carrier-user-1",
      },
      "broker-user-1",
      "broker"
    );

    expect(result.created).toBe(false);
    expect(result.room._id).toBe("room-1");
  });

  it("marks broker approval without booking the room until carrier also approves", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      brokerId: "broker-user-1",
      carrierId: "carrier-user-1",
      bookingStatus: "negotiating",
      brokerApprovedBooking: true,
      carrierApprovedBooking: false,
    });

    const result = await service().updateBookingStatus(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        action: "approve",
      },
      { _id: "broker-user-1", role: "broker" }
    );

    expect(messagesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      expect.objectContaining({
        brokerApprovedBooking: true,
        bookingStatus: "negotiating",
      }),
      { new: true }
    );
    expect(result.bookingStatus).toBe("negotiating");
    expect(gateway.broadcast).toHaveBeenCalledWith("broker-user-1", {
      type: "bookingStatusUpdated",
      data: expect.objectContaining({
        bookingStatus: "negotiating",
        brokerApprovedBooking: true,
        carrierApprovedBooking: false,
      }),
    });
    expect(gateway.broadcast).toHaveBeenCalledWith("carrier-user-1", {
      type: "bookingStatusUpdated",
      data: expect.objectContaining({
        bookingStatus: "negotiating",
        brokerApprovedBooking: true,
        carrierApprovedBooking: false,
      }),
    });
  });

  it("books the room when the second side approves", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: true,
        carrierApprovedBooking: false,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      bookingStatus: "booked",
      brokerApprovedBooking: true,
      carrierApprovedBooking: true,
    });

    const result = await service().updateBookingStatus(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        action: "approve",
      },
      { _id: "carrier-user-1", role: "carrier" }
    );

    expect(messagesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      expect.objectContaining({
        carrierApprovedBooking: true,
        bookingStatus: "booked",
        bookingConfirmedAt: expect.any(Date),
        bookingConfirmedBy: "carrier-user-1",
      }),
      { new: true }
    );
    expect(result.bookingStatus).toBe("booked");
  });

  it("rejects approval from a user who is not part of the room", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
      }),
    });

    await expect(
      service().updateBookingStatus(
        {
          brokerPostId: "broker-post-1",
          carrierPostId: "carrier-post-1",
          action: "approve",
        },
        { _id: "wrong-user", role: "broker" }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("cancels booking approval state", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
        brokerApprovedBooking: true,
        carrierApprovedBooking: true,
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      brokerId: "broker-user-1",
      carrierId: "carrier-user-1",
      bookingStatus: "cancelled",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
    });

    const result = await service().updateBookingStatus(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        action: "cancel",
      },
      { _id: "broker-user-1", role: "broker" }
    );

    expect(result.bookingStatus).toBe("cancelled");
    expect(gateway.broadcast).toHaveBeenCalledWith("broker-user-1", {
      type: "bookingStatusUpdated",
      data: expect.objectContaining({
        bookingStatus: "cancelled",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });
    expect(gateway.broadcast).toHaveBeenCalledWith("carrier-user-1", {
      type: "bookingStatusUpdated",
      data: expect.objectContaining({
        bookingStatus: "cancelled",
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      }),
    });
  });

  it("persists booking workflow state and broadcasts it to both room parties", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
      }),
    });
    messagesModel.findOneAndUpdate.mockResolvedValue({
      brokerId: "broker-user-1",
      carrierId: "carrier-user-1",
      bookingWorkflow: {
        setupProvider: "broker-packet",
        setupLabel: "Broker setup packet",
        setupSource: "carrier",
        trackingProvider: "macroPoint",
        trackingShared: true,
        updatedBy: "carrier-user-1",
      },
    });

    const result = await service().updateBookingWorkflow(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        action: "setup",
        setupProvider: "broker-packet",
        setupLabel: "Broker setup packet",
        setupSource: "carrier",
        trackingProvider: "macroPoint",
        trackingShared: true,
      },
      { _id: "carrier-user-1", role: "carrier" }
    );

    expect(messagesModel.findOneAndUpdate).toHaveBeenCalledWith(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      expect.objectContaining({
        "bookingWorkflow.setupProvider": "broker-packet",
        "bookingWorkflow.setupLabel": "Broker setup packet",
        "bookingWorkflow.setupSource": "carrier",
        "bookingWorkflow.trackingProvider": "macroPoint",
        "bookingWorkflow.trackingShared": true,
        "bookingWorkflow.updatedBy": "carrier-user-1",
        "bookingWorkflow.updatedAt": expect.any(Date),
      }),
      { new: true }
    );
    expect(result.bookingWorkflow.setupProvider).toBe("broker-packet");
    expect(gateway.broadcast).toHaveBeenCalledWith("broker-user-1", {
      type: "bookingWorkflowUpdated",
      data: expect.objectContaining({
        bookingWorkflow: expect.objectContaining({
          setupProvider: "broker-packet",
          trackingShared: true,
        }),
      }),
    });
    expect(gateway.broadcast).toHaveBeenCalledWith("carrier-user-1", {
      type: "bookingWorkflowUpdated",
      data: expect.objectContaining({
        bookingWorkflow: expect.objectContaining({
          setupProvider: "broker-packet",
          trackingShared: true,
        }),
      }),
    });
  });

  it("rejects booking workflow updates from a user outside the room", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        brokerId: "broker-user-1",
        carrierId: "carrier-user-1",
      }),
    });

    await expect(
      service().updateBookingWorkflow(
        {
          brokerPostId: "broker-post-1",
          carrierPostId: "carrier-post-1",
          action: "delivered",
          delivered: true,
        },
        { _id: "wrong-user", role: "carrier" }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an unsupported booking action", async () => {
    await expect(
      service().updateBookingStatus(
        {
          brokerPostId: "broker-post-1",
          carrierPostId: "carrier-post-1",
          action: "something" as any,
        },
        { _id: "broker-user-1", role: "broker" }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws not found when the room does not exist", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service().findRoomByPair("broker-post-1", "carrier-post-1")
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
