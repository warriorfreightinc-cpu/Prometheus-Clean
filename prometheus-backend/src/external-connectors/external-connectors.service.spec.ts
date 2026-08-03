import { UnauthorizedException } from "@nestjs/common";
import { ExternalConnectorsService } from "./external-connectors.service";

describe("ExternalConnectorsService", () => {
  const integrationId = "68d53dbe83716b395750a8ca";
  const integration = {
    _id: integrationId,
    category: "loadboard",
    provider: "partner_api",
    label: "Partner Load Board",
    status: "connected",
    enabled: true,
    credentialRef: "PARTNER_WEBHOOK_TOKEN",
  };
  const companyModel: any = { findOne: jest.fn() };
  const opportunityModel: any = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    find: jest.fn(),
  };
  const configService: any = { get: jest.fn() };

  const service = () =>
    new ExternalConnectorsService(companyModel, opportunityModel, configService);

  const connectorContext = () => {
    companyModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "company-1",
        integrations: [integration],
      }),
    });
    configService.get.mockImplementation((key: string) =>
      key === "PARTNER_WEBHOOK_TOKEN" ? "secret-123" : undefined
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connectorContext();
    opportunityModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    opportunityModel.findOneAndUpdate.mockResolvedValue({ _id: "external-1" });
    opportunityModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  it("normalizes a partner load into a company-private opportunity", async () => {
    const result = await service().ingestWebhook(
      integrationId,
      "Bearer secret-123",
      undefined,
      {
        sourceRequestId: "request-1",
        items: [
          {
            externalId: "LOAD-100",
            kind: "load",
            origin: { city: "Chicago", state: "il", postalCode: "60601" },
            destination: { city: "Memphis", state: "tn", postalCode: "38103" },
            equipment: ["Dry Van", "VZ"],
            lengthFeet: 53,
            weightLbs: 42000,
            commodity: "Chemicals",
            hazmat: true,
            rate: 2600,
            specialNotes: "Tanker endorsement required",
            contact: { email: "broker@example.com" },
            booking: { mode: "email", email: "broker@example.com" },
            sourceUpdatedAt: "2026-08-03T12:00:00.000Z",
          },
        ],
      }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      created: 1,
      provider: "partner_api",
    }));
    expect(opportunityModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        integrationId,
        externalId: "LOAD-100",
      }),
      {
        $set: expect.objectContaining({
          companyId: "company-1",
          provider: "partner_api",
          providerLabel: "Partner Load Board",
          equipment: ["V", "VZ"],
          weight: 42000,
          hazmat: true,
          status: "active",
          origin: expect.objectContaining({
            place: expect.objectContaining({ state: "IL", zip: "60601" }),
          }),
        }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  });

  it("rejects a webhook when the connector credential does not match", async () => {
    await expect(
      service().ingestWebhook(integrationId, "Bearer wrong", undefined, {
        items: [{
          externalId: "LOAD-100",
          kind: "load",
          origin: { state: "IL" },
          destination: { state: "TN" },
        }],
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(opportunityModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("retires records missing from a full provider snapshot", async () => {
    opportunityModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await service().ingestWebhook(
      integrationId,
      undefined,
      "secret-123",
      {
        fullSnapshot: true,
        items: [{
          externalId: "LOAD-NEW",
          kind: "load",
          origin: { state: "IL" },
          destination: { state: "TX" },
          hazmat: true,
        }],
      }
    );

    expect(opportunityModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        integrationId,
        kind: "load",
        externalId: { $nin: ["LOAD-NEW"] },
      }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "removed" }) })
    );
    expect(result.removed).toBe(3);
    expect(result.snapshotApplied).toBe(true);
  });

  it("does not retire a snapshot when any incoming item is rejected", async () => {
    const result = await service().ingestTrustedBatch(
      { companyId: "company-1", integration },
      {
        fullSnapshot: true,
        items: [{
          externalId: "LOAD-BAD",
          kind: "load",
          origin: {},
          destination: { state: "TN" },
        }],
      }
    );

    expect(result.snapshotApplied).toBe(false);
    expect(result.rejected).toBe(1);
    expect(opportunityModel.updateMany).not.toHaveBeenCalled();
  });

  it("searches only active, unexpired hazmat loads for one company", async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const limit = jest.fn().mockReturnValue({ lean });
    const sort = jest.fn().mockReturnValue({ limit });
    opportunityModel.find.mockReturnValue({ sort });

    await service().searchForCompany("company-1", {
      kind: "load",
      hazmatMode: "hazmat",
      originState: "IL",
      equipmentCodes: ["VZ"],
      limit: 10,
    });

    expect(opportunityModel.find).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      kind: "load",
      status: "active",
      hazmat: true,
      "origin.place.state": /^IL$/i,
      equipment: { $in: ["VZ"] },
    }));
  });
});
