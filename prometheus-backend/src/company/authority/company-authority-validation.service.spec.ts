import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { CompanyAuthorityValidationService } from "./company-authority-validation.service";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("CompanyAuthorityValidationService", () => {
  const configService = {
    get: jest.fn().mockReturnValue("datahub")
  } as unknown as ConfigService;

  const basePayload: any = {
    name: "Warrior Freight Systems Inc",
    dot: "3448893",
    mc: "1122224",
    type: "carrier"
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns no blocking reasons when DOT and MC match active carrier authority", async () => {
    mockedAxios.get.mockImplementation((_url, options: any) => {
      if (options.params.dot_number === "03448893") {
        return Promise.resolve({ data: [authorityRecord()] });
      }
      return Promise.resolve({ data: [authorityRecord()] });
    });

    const reasons = await new CompanyAuthorityValidationService(configService).getBlockingReasons(basePayload);

    expect(reasons).toEqual([]);
  });

  it("blocks when the MC belongs to a different DOT", async () => {
    mockedAxios.get.mockImplementation((_url, options: any) => {
      if (options.params.dot_number === "31123623") {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [authorityRecord()] });
    });

    const reasons = await new CompanyAuthorityValidationService(configService).getBlockingReasons({
      ...basePayload,
      dot: "31123623"
    });

    expect(reasons).toContain("DOT 31123623 was not found in the FMCSA authority data.");
    expect(reasons.some((reason) => reason.includes("DOT 31123623 and MC 1122224 do not match"))).toBe(true);
  });

  it("blocks carrier signup when carrier authority is inactive", async () => {
    const inactiveRecord = authorityRecord({ common_stat: "I", contract_stat: "N" });
    mockedAxios.get.mockResolvedValue({ data: [inactiveRecord] });

    const reasons = await new CompanyAuthorityValidationService(configService).getBlockingReasons(basePayload);

    expect(reasons).toContain("Carrier authority is not active for MC1122224 under DOT 3448893 (WARRIOR FREIGHT SYSTEMS INC).");
  });

  it("does not block when external validation is disabled", async () => {
    const disabledConfig = {
      get: jest.fn().mockReturnValue("off")
    } as unknown as ConfigService;

    const reasons = await new CompanyAuthorityValidationService(disabledConfig).getBlockingReasons(basePayload);

    expect(reasons).toEqual([]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

function authorityRecord(overrides: Record<string, string> = {}) {
  return {
    docket_number: "MC1122224",
    dot_number: "03448893",
    legal_name: "WARRIOR FREIGHT SYSTEMS INC",
    common_stat: "A",
    contract_stat: "N",
    broker_stat: "N",
    ...overrides
  };
}
