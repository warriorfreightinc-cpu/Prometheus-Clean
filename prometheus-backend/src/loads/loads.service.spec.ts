import { ConflictException, ForbiddenException } from "@nestjs/common";

jest.mock("src/user/enums/user-roles.enum", () => ({
  UserRoleEnum: {
    Admin: "admin",
    Manager: "manager",
    Supervisor: "supervisor",
  },
}), { virtual: true });

import { LoadsService } from "./loads.service";

describe("LoadsService.createFromRoom booking guard", () => {
  const loadModel: any = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const messagesModel: any = {
    findOne: jest.fn(),
  };
  const brokerPostModel: any = {
    findById: jest.fn(),
  };
  const carrierPostModel: any = {
    findById: jest.fn(),
  };
  const userModel: any = {
    findById: jest.fn(),
  };
  const companyModel: any = {
    findById: jest.fn(),
  };

  function service() {
    return new LoadsService(
      loadModel,
      messagesModel,
      brokerPostModel,
      carrierPostModel,
      userModel,
      companyModel
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    loadModel.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    brokerPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "broker-post-1",
        companyId: "company-1",
        publisherId: "broker-user-1",
        origin: { type: "place", place: { city: "Chicago", state: "IL" } },
        destination: { type: "place", place: { city: "Houston", state: "TX" } },
        refNum: "LB-1",
      }),
    });
    carrierPostModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "carrier-post-1",
        companyId: "company-2",
        publisherId: "carrier-user-1",
        origin: { type: "place", place: { city: "Chicago", state: "IL" } },
        destination: { type: "place", place: { city: "Houston", state: "TX" } },
        equipment: ["Dry Van"],
      }),
    });
    userModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ firstName: "Demo", lastName: "User" }),
    });
    companyModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ name: "Demo Company" }),
    });
    loadModel.create.mockResolvedValue({
      toObject: () => ({
        _id: "load-1",
        status: "active",
        source: {
          brokerPostId: "broker-post-1",
          carrierPostId: "carrier-post-1",
        },
      }),
    });
  });

  it("rejects load creation while the room is still negotiating", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        bookingStatus: "negotiating",
      }),
    });

    await expect(
      service().createFromRoom(
        { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
        {
          _id: "broker-user-1",
          role: "broker",
          companyId: "company-1",
          email: "broker@test.local",
        }
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates a load when the room is booked", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        bookingStatus: "booked",
      }),
    });

    const result = await service().createFromRoom(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      {
        _id: "broker-user-1",
        role: "broker",
        companyId: "company-1",
        email: "broker@test.local",
      }
    );

    expect(loadModel.create).toHaveBeenCalled();
    expect(result.status).toBe("active");
  });

  it("returns the existing load when a duplicate create race hits the unique source index", async () => {
    messagesModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        bookingStatus: "booked",
      }),
    });
    loadModel.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: "load-existing",
          status: "active",
          source: {
            brokerPostId: "broker-post-1",
            carrierPostId: "carrier-post-1",
          },
        }),
      });
    loadModel.create.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: 11000 }));

    const result = await service().createFromRoom(
      { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      {
        _id: "broker-user-1",
        role: "broker",
        companyId: "company-1",
        email: "broker@test.local",
      }
    );

    expect(result._id).toBe("load-existing");
    expect(loadModel.findOne).toHaveBeenCalledTimes(2);
  });

  it("creates a pending access request for a coworker load", async () => {
    const load = editableLoad({
      dispatch: {
        assignedDispatcherId: "owner-user",
        assignedDispatcherName: "Owner Dispatcher",
        assignedDispatcherEmail: "owner@test.local",
      },
    });
    loadModel.findOne.mockResolvedValue(load);

    const result = await service().requestAccess("load-1", "company-1", {
      _id: "requester-user",
      firstName: "Casey",
      lastName: "Carrier",
      email: "casey@test.local",
      role: "carrier",
      companyId: "company-1",
    }, { note: "Covering the night shift." });

    expect(load.save).toHaveBeenCalled();
    expect(result.accessRequests?.[0]).toEqual(expect.objectContaining({
      requestedById: "requester-user",
      requestedByName: "Casey Carrier",
      targetDispatcherId: "owner-user",
      status: "pending",
      note: "Covering the night shift.",
    }));
  });

  it("approves an access request and reassigns the load to the requester", async () => {
    const load = editableLoad({
      dispatch: {
        assignedDispatcherId: "owner-user",
        assignedDispatcherName: "Owner Dispatcher",
        assignedDispatcherEmail: "owner@test.local",
      },
      accessRequests: [{
        id: "request-1",
        requestedById: "requester-user",
        requestedByName: "Casey Carrier",
        requestedByEmail: "casey@test.local",
        requestedAt: new Date("2026-05-18T10:00:00.000Z"),
        targetDispatcherId: "owner-user",
        targetDispatcherName: "Owner Dispatcher",
        status: "pending",
      }],
    });
    loadModel.findOne.mockResolvedValue(load);

    const result = await service().decideAccessRequest("load-1", "request-1", "company-1", {
      _id: "owner-user",
      firstName: "Owner",
      lastName: "Dispatcher",
      email: "owner@test.local",
      role: "broker",
      companyId: "company-1",
    }, { action: "approve" });

    expect(load.save).toHaveBeenCalled();
    expect(result.dispatch.assignedDispatcherId).toBe("requester-user");
    expect(result.dispatch.assignedDispatcherName).toBe("Casey Carrier");
    expect(result.accessRequests?.[0]).toEqual(expect.objectContaining({
      id: "request-1",
      status: "approved",
      decidedById: "owner-user",
    }));
  });

  it("allows the load creator to approve access before a dispatcher is assigned", async () => {
    const load = editableLoad({
      dispatch: {
        assignedDispatcherId: "",
        assignedDispatcherName: "",
        assignedDispatcherEmail: "",
      },
      accessRequests: [{
        id: "request-1",
        requestedById: "requester-user",
        requestedByName: "Casey Carrier",
        requestedByEmail: "casey@test.local",
        requestedAt: new Date("2026-05-18T10:00:00.000Z"),
        targetDispatcherId: "",
        targetDispatcherName: "Assigned dispatcher",
        status: "pending",
      }],
    });
    loadModel.findOne.mockResolvedValue(load);

    const result = await service().decideAccessRequest("load-1", "request-1", "company-1", {
      _id: "owner-user",
      firstName: "Owner",
      lastName: "Dispatcher",
      email: "owner@test.local",
      role: "broker",
      companyId: "company-1",
    }, { action: "approve" });

    expect(load.save).toHaveBeenCalled();
    expect(result.dispatch.assignedDispatcherId).toBe("requester-user");
  });

  it("rejects access approval from a regular coworker who is not the dispatcher", async () => {
    const load = editableLoad({
      dispatch: {
        assignedDispatcherId: "owner-user",
        assignedDispatcherName: "Owner Dispatcher",
        assignedDispatcherEmail: "owner@test.local",
      },
      accessRequests: [{
        id: "request-1",
        requestedById: "requester-user",
        requestedByName: "Casey Carrier",
        requestedByEmail: "casey@test.local",
        requestedAt: new Date("2026-05-18T10:00:00.000Z"),
        targetDispatcherId: "owner-user",
        targetDispatcherName: "Owner Dispatcher",
        status: "pending",
      }],
    });
    loadModel.findOne.mockResolvedValue(load);

    await expect(
      service().decideAccessRequest("load-1", "request-1", "company-1", {
        _id: "other-user",
        firstName: "Other",
        lastName: "Dispatcher",
        email: "other@test.local",
        role: "broker",
        companyId: "company-1",
      }, { action: "approve" })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(load.save).not.toHaveBeenCalled();
  });

  function editableLoad(overrides: Record<string, any> = {}) {
    const load: any = {
      _id: "load-1",
      companyId: "company-1",
      createdBy: "owner-user",
      creatorRole: "broker",
      loadNumber: "LD-1",
      reference: "LD-1",
      status: "active",
      lane: { origin: "Chicago, IL", destination: "Houston, TX" },
      source: { brokerPostId: "broker-post-1", carrierPostId: "carrier-post-1" },
      broker: {},
      carrier: {},
      driver: {},
      dispatch: {
        assignedDispatcherId: "owner-user",
        assignedDispatcherName: "Owner Dispatcher",
        assignedDispatcherEmail: "owner@test.local",
      },
      accessRequests: [],
      save: jest.fn(),
      toObject: jest.fn(),
      ...overrides,
    };
    load.toObject.mockImplementation(() => ({ ...load, save: undefined, toObject: undefined }));
    return load;
  }
});
