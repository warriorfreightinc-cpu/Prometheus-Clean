import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { CompanyIntegrationsService } from "./company-integrations.service";

describe("CompanyIntegrationsService", () => {
  const companyModel: any = {
    findById: jest.fn(),
    find: jest.fn()
  };
  const brokerPostModel: any = {
    findById: jest.fn()
  };
  const carrierPostModel: any = {
    findById: jest.fn()
  };
  const configService: any = {
    get: jest.fn()
  };

  function service() {
    return new CompanyIntegrationsService(companyModel, brokerPostModel, carrierPostModel, configService);
  }

  function companyDoc(overrides: any = {}) {
    return {
      _id: "company-1",
      integrations: [],
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides
    };
  }

  function leanResult(value: any) {
    return { lean: jest.fn().mockResolvedValue(value) };
  }

  const roomUser = { _id: "broker-user-1", role: "broker", companyId: "broker-company-1" };

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        FMCSA_AUTHORITY_VALIDATION: "datahub",
        STRIPE_API_KEY: "sk_test_live_enough",
        MAIL_HOST: "127.0.0.1",
        MAIL_USER: "prometheus@local.test",
        OPENAI_BASE_URL: "http://127.0.0.1:1234/v1",
        OPENAI_API_KEY: "lm-studio",
        AgmCoreModule: ""
      };
      return values[key];
    });
  });

  function enableSandboxProviders() {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        FMCSA_AUTHORITY_VALIDATION: "datahub",
        STRIPE_API_KEY: "sk_test_live_enough",
        MAIL_HOST: "127.0.0.1",
        MAIL_USER: "prometheus@local.test",
        OPENAI_BASE_URL: "http://127.0.0.1:1234/v1",
        OPENAI_API_KEY: "lm-studio",
        AgmCoreModule: "",
        PROMETHEUS_SANDBOX_PROVIDERS: "1"
      };
      return values[key];
    });
  }

  it("returns provider catalog with configured platform readiness and contracted trucking providers", () => {
    const result = service().listProviderCatalog();

    expect(result.platform).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "fmcsa",
          label: "FMCSA authority data",
          status: "ready",
          freeTier: "free"
        }),
        expect.objectContaining({
          provider: "stripe",
          status: "ready",
          freeTier: "paid"
        }),
        expect.objectContaining({
          provider: "smtp",
          status: "ready",
          freeTier: "local"
        }),
        expect.objectContaining({
          provider: "openai",
          status: "ready",
          freeTier: "local"
        }),
        expect.objectContaining({
          provider: "google_maps",
          status: "needs_credentials",
          environmentKeys: expect.arrayContaining(["AgmCoreModule", "GOOGLE_MAPS_API_KEY"])
        })
      ])
    );
    const openAiProvider = result.platform.find((provider) => provider.provider === "openai");
    expect(openAiProvider?.notes).toContain("Brain Pro");
    expect(openAiProvider?.environmentKeys).toEqual(["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL"]);
    expect(result.company).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "setup",
          provider: "highway",
          status: "requires_contract"
        }),
        expect.objectContaining({
          category: "tracking",
          provider: "macropoint",
          status: "requires_contract"
        }),
        expect.objectContaining({
          category: "eld",
          provider: "samsara",
          status: "requires_credentials"
        }),
        expect.objectContaining({
          category: "loadboard",
          provider: "dat",
          status: "requires_contract"
        })
      ])
    );
  });

  it("marks contracted trucking providers as local sandbox previews when sandbox mode is enabled", () => {
    enableSandboxProviders();

    const result = service().listProviderCatalog();

    expect(result.company).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "highway",
          status: "ready",
          freeTier: "local",
          notes: expect.stringContaining("Sandbox preview")
        }),
        expect.objectContaining({
          provider: "macropoint",
          status: "ready",
          freeTier: "local",
          notes: expect.stringContaining("Sandbox preview")
        }),
        expect.objectContaining({
          provider: "samsara",
          status: "ready",
          freeTier: "local",
          notes: expect.stringContaining("Sandbox preview")
        }),
        expect.objectContaining({
          provider: "dat",
          status: "ready",
          freeTier: "local",
          notes: expect.stringContaining("Sandbox preview")
        })
      ])
    );
  });

  it("allows an admin to upsert a connected setup provider for their company", async () => {
    const company = companyDoc();
    companyModel.findById.mockResolvedValue(company);

    const result = await service().upsertIntegration(
      "company-1",
      { _id: "admin-1", role: "admin" },
      {
        category: "setup",
        provider: "highway",
        label: "Highway",
        status: "connected",
        enabled: true,
        credentialRef: "vault:company-1:highway",
        credentialValue: "raw-secret-value",
        notes: "Use for carrier packets"
      }
    );

    expect(company.integrations).toHaveLength(1);
    expect(company.integrations[0]).toEqual(
      expect.objectContaining({
        category: "setup",
        provider: "highway",
        label: "Highway",
        status: "connected",
        enabled: true,
        credentialRef: "vault:company-1:highway",
        createdBy: "admin-1"
      })
    );
    expect(company.integrations[0]).not.toHaveProperty("credentialValue");
    expect(company.save).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        category: "setup",
        provider: "highway",
        label: "Highway",
        status: "connected",
        enabled: true
      })
    );
    expect(result).not.toHaveProperty("credentialRef");
    expect(result).not.toHaveProperty("credentialValue");
  });

  it("rejects non-admin users when they upsert integrations", async () => {
    await expect(
      service().upsertIntegration(
        "company-1",
        { _id: "broker-1", role: "broker" },
        {
          category: "tracking",
          provider: "macropoint",
          label: "MacroPoint"
        }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(companyModel.findById).not.toHaveBeenCalled();
  });

  it("sanitizes credential metadata from service responses", async () => {
    companyModel.findById.mockReturnValue(
      leanResult({
        _id: "company-1",
        integrations: [
          {
            _id: "integration-1",
            category: "tracking",
            provider: "fourkites",
            label: "FourKites",
            status: "connected",
            enabled: true,
            credentialRef: "vault:fourkites",
            credentialValue: "raw-secret-value"
          }
        ]
      })
    );

    const result = await service().listIntegrations("company-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: "integration-1",
        provider: "fourkites",
        label: "FourKites"
      })
    );
    expect(result[0]).not.toHaveProperty("credentialRef");
    expect(result[0]).not.toHaveProperty("credentialValue");
  });

  it("omits disabled integrations from room provider choices", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(
      leanResult([
        {
          _id: "broker-company-1",
          integrations: [
            {
              _id: "integration-1",
              category: "tracking",
              provider: "macropoint",
              label: "Broker MacroPoint",
              status: "connected",
              enabled: false
            }
          ]
        },
        {
          _id: "carrier-company-1",
          integrations: [
            {
              _id: "integration-2",
              category: "eld",
              provider: "samsara",
              label: "Carrier ELD",
              status: "disabled",
              enabled: true
            }
          ]
        }
      ])
    );

    const result = await service().getRoomIntegrationChoices(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1"
      },
      roomUser
    );

    expect(result.trackingChoices).toEqual([
      expect.objectContaining({
        category: "manual",
        provider: "manual",
        label: "Manual tracking update"
      })
    ]);
  });

  it("returns broker tracking and carrier ELD room provider choices", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(
      leanResult([
        {
          _id: "broker-company-1",
          integrations: [
            {
              _id: "integration-1",
              category: "tracking",
              provider: "macropoint",
              label: "MacroPoint",
              status: "connected",
              enabled: true,
              credentialRef: "vault:macropoint"
            }
          ]
        },
        {
          _id: "carrier-company-1",
          integrations: [
            {
              _id: "integration-2",
              category: "eld",
              provider: "samsara",
              label: "Samsara ELD",
              status: "connected",
              enabled: true,
              credentialRef: "vault:samsara"
            }
          ]
        }
      ])
    );

    const result = await service().getRoomIntegrationChoices(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1"
      },
      roomUser
    );

    expect(result.setupChoices).toEqual([
      expect.objectContaining({
        category: "manual",
        provider: "manual",
        label: "Manual packet"
      })
    ]);
    expect(result.trackingChoices).toEqual([
      expect.objectContaining({
        category: "tracking",
        provider: "macropoint",
        label: "Broker MacroPoint",
        source: "broker"
      }),
      expect.objectContaining({
        category: "eld",
        provider: "samsara",
        label: "Carrier Samsara ELD",
        source: "carrier"
      }),
      expect.objectContaining({
        category: "manual",
        provider: "manual",
        label: "Manual tracking update"
      })
    ]);
    expect(result.trackingChoices[0]).not.toHaveProperty("credentialRef");
    expect(result.trackingChoices[1]).not.toHaveProperty("credentialRef");
  });

  it("returns sandbox setup, tracking, and ELD room choices when no live integrations are connected", async () => {
    enableSandboxProviders();
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(leanResult([{ _id: "broker-company-1", integrations: [] }, { _id: "carrier-company-1", integrations: [] }]));

    const result = await service().getRoomIntegrationChoices(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1"
      },
      roomUser
    );

    expect(result.setupChoices).toEqual([
      expect.objectContaining({ provider: "highway", label: "Broker Highway Demo", source: "broker", category: "setup" }),
      expect.objectContaining({ provider: "mycarrierpacket", label: "Broker MyCarrierPackets Demo", source: "broker", category: "setup" }),
      expect.objectContaining({ provider: "truckstop", label: "Broker Truckstop Setup Demo", source: "broker", category: "setup" })
    ]);
    expect(result.trackingChoices).toEqual([
      expect.objectContaining({ provider: "macropoint", label: "Broker MacroPoint Demo", source: "broker", category: "tracking" }),
      expect.objectContaining({ provider: "fourkites", label: "Broker FourKites Demo", source: "broker", category: "tracking" }),
      expect.objectContaining({ provider: "tql", label: "Broker TQL Tracking Demo", source: "broker", category: "tracking" }),
      expect.objectContaining({ provider: "samsara", label: "Carrier Samsara ELD Demo", source: "carrier", category: "eld" }),
      expect.objectContaining({ provider: "motive", label: "Carrier Motive ELD Demo", source: "carrier", category: "eld" }),
      expect.objectContaining({ provider: "geotab", label: "Carrier Geotab ELD Demo", source: "carrier", category: "eld" }),
      expect.objectContaining({ provider: "manual", label: "Manual tracking update", source: "manual", category: "manual" })
    ]);
  });

  it("stages a configured setup provider execution for a booking room", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(
      leanResult([
        {
          _id: "broker-company-1",
          integrations: [
            {
              _id: "integration-1",
              companyId: "broker-company-1",
              category: "setup",
              provider: "highway",
              label: "Highway",
              status: "connected",
              enabled: true,
              setupUrl: "https://highway.test/packet/coyote",
              credentialRef: "vault:highway"
            }
          ]
        },
        { _id: "carrier-company-1", integrations: [] }
      ])
    );

    const result = await service().executeRoomIntegration(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        category: "setup",
        provider: "highway",
        source: "broker"
      },
      roomUser
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "staged",
        mode: "configured",
        provider: "highway",
        label: "Broker Highway",
        category: "setup",
        source: "broker",
        setupUrl: "https://highway.test/packet/coyote"
      })
    );
    expect(result.message).toContain("Broker Highway setup is staged");
    expect(result).not.toHaveProperty("credentialRef");
  });

  it("stages a placeholder tracking execution when the live provider has not been connected yet", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(leanResult([{ _id: "broker-company-1", integrations: [] }, { _id: "carrier-company-1", integrations: [] }]));

    const result = await service().executeRoomIntegration(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        category: "tracking",
        provider: "macropoint",
        label: "MacroPoint"
      },
      roomUser
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "staged",
        mode: "placeholder",
        provider: "macropoint",
        label: "MacroPoint",
        category: "tracking"
      })
    );
    expect(result.message).toContain("MacroPoint tracking is staged");
    expect(result.message).toContain("Company Integrations");
  });

  it("stages sandbox tracking execution with a demo reference", async () => {
    enableSandboxProviders();
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(leanResult([{ _id: "broker-company-1", integrations: [] }, { _id: "carrier-company-1", integrations: [] }]));

    const result = await service().executeRoomIntegration(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        category: "tracking",
        provider: "macropoint",
        source: "broker"
      },
      roomUser
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "staged",
        mode: "placeholder",
        provider: "macropoint",
        label: "Broker MacroPoint Demo",
        category: "tracking",
        source: "broker"
      })
    );
    expect(result.message).toContain("Sandbox preview");
    expect(result.message).toContain("DEMO-MACROPOINT-BROKER");
  });

  it("does not call a connected tracking provider live until credential metadata exists", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(
      leanResult([
        {
          _id: "broker-company-1",
          integrations: [
            {
              _id: "integration-1",
              companyId: "broker-company-1",
              category: "tracking",
              provider: "macropoint",
              label: "MacroPoint",
              status: "connected",
              enabled: true
            }
          ]
        },
        { _id: "carrier-company-1", integrations: [] }
      ])
    );

    const result = await service().executeRoomIntegration(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        category: "tracking",
        provider: "macropoint",
        source: "broker"
      },
      roomUser
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "staged",
        mode: "placeholder",
        provider: "macropoint",
        label: "Broker MacroPoint",
        category: "tracking",
        source: "broker"
      })
    );
    expect(result.message).toContain("Add live credentials");
  });

  it("keeps carrier-side labels when executing a carrier ELD provider without subdocument companyId", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));
    companyModel.find.mockReturnValue(
      leanResult([
        { _id: "broker-company-1", integrations: [] },
        {
          _id: "carrier-company-1",
          integrations: [
            {
              _id: "integration-2",
              category: "eld",
              provider: "samsara",
              label: "Samsara ELD",
              status: "connected",
              enabled: true,
              credentialRef: "vault:samsara"
            }
          ]
        }
      ])
    );

    const result = await service().executeRoomIntegration(
      {
        brokerPostId: "broker-post-1",
        carrierPostId: "carrier-post-1",
        category: "eld",
        provider: "samsara",
        source: "carrier"
      },
      roomUser
    );

    expect(result.label).toBe("Carrier Samsara ELD");
    expect(result.source).toBe("carrier");
  });

  it("throws not found when a room post cannot be resolved", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult(null));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));

    await expect(
      service().getRoomIntegrationChoices(
        {
          brokerPostId: "missing-post",
          carrierPostId: "carrier-post-1"
        },
        roomUser
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects room provider choices for users outside both booking companies", async () => {
    brokerPostModel.findById.mockReturnValue(leanResult({ _id: "broker-post-1", companyId: "broker-company-1" }));
    carrierPostModel.findById.mockReturnValue(leanResult({ _id: "carrier-post-1", companyId: "carrier-company-1" }));

    await expect(
      service().getRoomIntegrationChoices(
        {
          brokerPostId: "broker-post-1",
          carrierPostId: "carrier-post-1"
        },
        { _id: "outsider-user-1", role: "carrier", companyId: "outside-company" }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(companyModel.find).not.toHaveBeenCalled();
  });
});
