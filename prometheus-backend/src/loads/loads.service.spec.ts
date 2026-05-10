import { ConflictException } from "@nestjs/common";

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
});
