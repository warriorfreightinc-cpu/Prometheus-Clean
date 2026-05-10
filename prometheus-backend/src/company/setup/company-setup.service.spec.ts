import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { CompanySetupService } from "./company-setup.service";

describe("CompanySetupService", () => {
  const companyModel: any = {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn()
  };
  const userModel: any = {
    countDocuments: jest.fn()
  };
  const configService: any = {
    get: jest.fn((key: string) => {
      const values = {
        ALLOW_LOCAL_SETUP_ACTIVATION: "true",
        STRIPE_API_KEY: "sk_test_local_placeholder"
      };
      return values[key];
    })
  };

  function service() {
    return new CompanySetupService(companyModel, userModel, configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      const values = {
        ALLOW_LOCAL_SETUP_ACTIVATION: "true",
        STRIPE_API_KEY: "sk_test_local_placeholder"
      };
      return values[key];
    });
  });

  it("returns setup status with active user count", async () => {
    companyModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "company-1",
        name: "Setup Broker",
        status: "approved_waiting_setup",
        onboarding: { requestedSeats: 3 },
        subscription: {}
      })
    });
    userModel.countDocuments.mockResolvedValue(1);

    const result = await service().getStatus("company-1");

    expect(result.company.name).toBe("Setup Broker");
    expect(result.status).toBe("approved_waiting_setup");
    expect(result.requestedSeats).toBe(3);
    expect(result.activeUsers).toBe(1);
    expect(userModel.countDocuments).toHaveBeenCalledWith({
      companyId: "company-1",
      isActive: true,
      subscriptionEmail: true,
      role: { $nin: ["admin", "supervisor"] }
    });
  });

  it("rejects local activation when quantity is less than one", async () => {
    await expect(service().localActivate("company-1", { quantity: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects local activation when local activation is disabled", async () => {
    configService.get.mockImplementation((key: string) => {
      const values = {
        ALLOW_LOCAL_SETUP_ACTIVATION: "false",
        STRIPE_API_KEY: "sk_live_real"
      };
      return values[key];
    });

    await expect(service().localActivate("company-1", { quantity: 2 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects local activation unless company is waiting setup", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      status: "pending_review",
      onboarding: { status: "pending_review" },
      subscription: {}
    });

    await expect(service().localActivate("company-1", { quantity: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("activates waiting setup company locally", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      status: "approved_waiting_setup",
      onboarding: { status: "approved_waiting_setup", requestedSeats: 3 },
      subscription: {}
    });
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-1",
      status: "active",
      onboarding: { status: "active" },
      subscription: { quantity: 4 }
    });
    userModel.countDocuments.mockResolvedValue(1);

    const result = await service().localActivate("company-1", { quantity: 4 });

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        status: "active",
        "onboarding.status": "active",
        "subscription.quantity": 4,
        "subscription.customer": "local-setup-company-1"
      }),
      { new: true }
    );
    expect(result.company.status).toBe("active");
  });
});
