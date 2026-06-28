# Prometheus Brain Pro BYOI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Brain Pro foundation: company AI provider settings, a backend AI provider gateway, a Brain Pro response path, and admin UI controls without weakening approval gates.

**Architecture:** Keep Prometheus as the system of record. Add a small backend provider gateway used by `PrometheusBrainService`; extend existing company `brainSettings` instead of adding a parallel settings object; expose only sanitized AI provider status to the frontend. The model may answer and suggest, but existing services still own search, route intelligence, approvals, memory, and audit events.

**Tech Stack:** NestJS, Mongoose, class-validator, OpenAI Node SDK, Angular reactive forms, Jasmine/Karma, Jest.

---

## Scope Check

The approved design includes six phases and a future ChatGPT companion path. This plan implements the first working foundation only:

- provider gateway;
- company/provider settings;
- sanitized provider status;
- Brain Pro model selection and fallback;
- admin UI controls;
- targeted backend and frontend tests.

The ChatGPT Companion, custom user-created agent ecosystem, OCR/image parsing, and live provider-booking tools should each get separate plans after this foundation is verified.

## File Structure

Create backend files:

- `prometheus-backend/src/brain/ai-provider/brain-ai-provider.types.ts`: shared provider settings, status, task class, and gateway result types.
- `prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.ts`: normalization, masking, provider-mode selection, and safe default helpers.
- `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.ts`: one service that selects local/OpenAI/company key/runtime fallback and calls the OpenAI SDK.
- `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.spec.ts`: provider gateway unit tests.
- `prometheus-backend/src/brain/brain-settings.service.ts`: company Brain settings read/update/test-provider operations; keeps provider configuration out of `BrainMemoryService`.
- `prometheus-backend/src/brain/brain-settings.service.spec.ts`: settings service tests.

Modify backend files:

- `prometheus-backend/src/brain/brain-settings.util.ts`: extend normalized settings to include AI provider config while preserving existing memory defaults.
- `prometheus-backend/src/company/schema/company.schema.ts`: extend `brainSettings` schema with provider mode, model settings, masked key metadata, and budget controls.
- `prometheus-backend/src/company/interface/company.interface.ts`: extend `CompanyBrainSettings`.
- `prometheus-backend/src/brain/dto/prometheus-brain.dto.ts`: extend settings DTO and add provider-test response DTO shape.
- `prometheus-backend/src/brain/prometheus-brain.controller.ts`: inject `BrainSettingsService`; add `GET /brain/settings` and `POST /brain/settings/test-provider`.
- `prometheus-backend/src/brain/brain.module.ts`: register/export `BrainSettingsService` and `BrainAiProviderGateway`.
- `prometheus-backend/src/brain/brain-memory.service.ts`: delegate company settings read/update to `BrainSettingsService` or keep only memory-specific reads.
- `prometheus-backend/src/brain/prometheus-brain.service.ts`: use `BrainAiProviderGateway` for model-generated answers and include provider metadata in events.
- `prometheus-backend/src/brain/prometheus-brain.service.spec.ts`: update constructor setup and add Brain Pro fallback/provider tests.
- `prometheus-backend/.env.example`: document Prometheus-managed cloud defaults and local fallback.

Modify frontend files:

- `prometheus/src/app/shared/types/models.ts`: add Brain provider mode/settings/status interfaces.
- `prometheus/src/app/core/api/brain-api.service.ts`: add `getSettings()` and `testProvider()` API calls.
- `prometheus/src/app/features/workspace/workspace.component.ts`: extend `brainSettingsForm`, load current settings, save provider fields, test provider connection.
- `prometheus/src/app/features/workspace/workspace.component.html`: evolve the Brain settings card into "Brain Pro and company AI".
- `prometheus/src/app/features/workspace/workspace.component.scss`: add compact styling for provider status/budget controls.
- `prometheus/src/app/features/workspace/workspace.component.spec.ts`: update existing Brain settings test and add provider mode/key masking tests.

---

### Task 1: Add Brain AI Provider Types And Normalization

**Files:**
- Create: `prometheus-backend/src/brain/ai-provider/brain-ai-provider.types.ts`
- Create: `prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.ts`
- Modify: `prometheus-backend/src/brain/brain-settings.util.ts`
- Modify: `prometheus-backend/src/company/interface/company.interface.ts`

- [ ] **Step 1: Write provider utility tests**

Create `prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.spec.ts`:

```ts
import {
  maskBrainAiKey,
  normalizeBrainAiSettings,
  resolveBrainProviderMode,
} from "./brain-ai-provider.util";

describe("brain-ai-provider.util", () => {
  it("defaults to local provider mode with safe model names", () => {
    const settings = normalizeBrainAiSettings(undefined);

    expect(settings).toEqual({
      providerMode: "local",
      reasoningModel: "gpt-5.5",
      economyModel: "gpt-5.4-mini",
      monthlyBudgetUsd: 50,
      dailyRequestLimit: 500,
      providerKeyStatus: "missing",
      providerKeyFingerprint: null,
      providerLastTestedAt: null,
      providerLastError: null,
    });
  });

  it("normalizes unsupported provider mode and invalid numeric limits", () => {
    const settings = normalizeBrainAiSettings({
      providerMode: "anything",
      monthlyBudgetUsd: -25,
      dailyRequestLimit: 0,
      reasoningModel: "",
      economyModel: "mini-custom",
    });

    expect(settings.providerMode).toBe("local");
    expect(settings.monthlyBudgetUsd).toBe(50);
    expect(settings.dailyRequestLimit).toBe(500);
    expect(settings.reasoningModel).toBe("gpt-5.5");
    expect(settings.economyModel).toBe("mini-custom");
  });

  it("masks provider keys without exposing the raw secret", () => {
    expect(maskBrainAiKey("sk-proj-abcdef1234567890")).toEqual({
      status: "connected",
      fingerprint: "sk-p...7890",
    });
    expect(maskBrainAiKey("")).toEqual({
      status: "missing",
      fingerprint: null,
    });
  });

  it("resolves company OpenAI only when a company key is present", () => {
    expect(resolveBrainProviderMode({
      providerMode: "companyOpenAi",
      hasCompanyKey: false,
      hasPrometheusKey: true,
      hasLocalBaseUrl: true,
    })).toBe("local");

    expect(resolveBrainProviderMode({
      providerMode: "companyOpenAi",
      hasCompanyKey: true,
      hasPrometheusKey: false,
      hasLocalBaseUrl: false,
    })).toBe("companyOpenAi");
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npm test -- brain-ai-provider.util.spec.ts --runInBand
```

Expected: FAIL because `brain-ai-provider.util.ts` does not exist.

- [ ] **Step 3: Add provider types**

Create `prometheus-backend/src/brain/ai-provider/brain-ai-provider.types.ts`:

```ts
export type BrainAiProviderMode =
  | "prometheusManaged"
  | "companyOpenAi"
  | "local"
  | "disabled";

export type BrainAiProviderKeyStatus =
  | "missing"
  | "connected"
  | "failed"
  | "rotating";

export type BrainAiTaskClass =
  | "simple"
  | "classification"
  | "reasoning"
  | "drafting"
  | "fallback";

export interface BrainAiSettings {
  providerMode: BrainAiProviderMode;
  reasoningModel: string;
  economyModel: string;
  monthlyBudgetUsd: number;
  dailyRequestLimit: number;
  providerKeyStatus: BrainAiProviderKeyStatus;
  providerKeyFingerprint: string | null;
  providerLastTestedAt: Date | string | null;
  providerLastError: string | null;
}

export interface BrainAiProviderResolutionInput {
  providerMode: BrainAiProviderMode;
  hasCompanyKey: boolean;
  hasPrometheusKey: boolean;
  hasLocalBaseUrl: boolean;
}

export interface BrainAiProviderRuntime {
  mode: BrainAiProviderMode;
  providerLabel: string;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface BrainAiGenerateInput {
  companyId: string;
  taskClass: BrainAiTaskClass;
  systemPrompt: string;
  userPayload: string;
  preferredModel?: string;
}

export interface BrainAiGenerateResult {
  text: string | null;
  providerMode: BrainAiProviderMode | "fallback";
  providerLabel: string;
  model: string | null;
  usedFallback: boolean;
  error?: string;
}
```

- [ ] **Step 4: Add provider utilities**

Create `prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.ts`:

```ts
import {
  BrainAiProviderMode,
  BrainAiProviderResolutionInput,
  BrainAiSettings,
} from "./brain-ai-provider.types";

export const DEFAULT_BRAIN_AI_SETTINGS: BrainAiSettings = {
  providerMode: "local",
  reasoningModel: "gpt-5.5",
  economyModel: "gpt-5.4-mini",
  monthlyBudgetUsd: 50,
  dailyRequestLimit: 500,
  providerKeyStatus: "missing",
  providerKeyFingerprint: null,
  providerLastTestedAt: null,
  providerLastError: null,
};

const PROVIDER_MODES: BrainAiProviderMode[] = [
  "prometheusManaged",
  "companyOpenAi",
  "local",
  "disabled",
];

export function normalizeBrainAiSettings(value: any): BrainAiSettings {
  const providerMode = PROVIDER_MODES.includes(value?.providerMode)
    ? value.providerMode
    : DEFAULT_BRAIN_AI_SETTINGS.providerMode;
  const monthlyBudgetUsd = Number(value?.monthlyBudgetUsd);
  const dailyRequestLimit = Number(value?.dailyRequestLimit);

  return {
    providerMode,
    reasoningModel: cleanModelName(value?.reasoningModel, DEFAULT_BRAIN_AI_SETTINGS.reasoningModel),
    economyModel: cleanModelName(value?.economyModel, DEFAULT_BRAIN_AI_SETTINGS.economyModel),
    monthlyBudgetUsd: monthlyBudgetUsd > 0 ? monthlyBudgetUsd : DEFAULT_BRAIN_AI_SETTINGS.monthlyBudgetUsd,
    dailyRequestLimit: dailyRequestLimit > 0 ? Math.floor(dailyRequestLimit) : DEFAULT_BRAIN_AI_SETTINGS.dailyRequestLimit,
    providerKeyStatus: ["missing", "connected", "failed", "rotating"].includes(value?.providerKeyStatus)
      ? value.providerKeyStatus
      : DEFAULT_BRAIN_AI_SETTINGS.providerKeyStatus,
    providerKeyFingerprint: optionalString(value?.providerKeyFingerprint),
    providerLastTestedAt: value?.providerLastTestedAt ?? null,
    providerLastError: optionalString(value?.providerLastError),
  };
}

export function maskBrainAiKey(rawKey: string | undefined | null) {
  const key = String(rawKey ?? "").trim();
  if (!key) {
    return { status: "missing" as const, fingerprint: null };
  }
  const start = key.slice(0, 4);
  const end = key.slice(-4);
  return { status: "connected" as const, fingerprint: `${start}...${end}` };
}

export function resolveBrainProviderMode(input: BrainAiProviderResolutionInput): BrainAiProviderMode {
  if (input.providerMode === "disabled") return "disabled";
  if (input.providerMode === "companyOpenAi" && input.hasCompanyKey) return "companyOpenAi";
  if (input.providerMode === "prometheusManaged" && input.hasPrometheusKey) return "prometheusManaged";
  if (input.hasLocalBaseUrl) return "local";
  if (input.hasPrometheusKey) return "prometheusManaged";
  return "disabled";
}

function cleanModelName(value: unknown, fallback: string): string {
  const model = String(value ?? "").trim();
  return model || fallback;
}

function optionalString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}
```

- [ ] **Step 5: Extend normalized Brain settings**

Modify `prometheus-backend/src/brain/brain-settings.util.ts` to:

```ts
import { BrainAiSettings } from "./ai-provider/brain-ai-provider.types";
import { normalizeBrainAiSettings } from "./ai-provider/brain-ai-provider.util";

export type BrainMemoryMode = "off" | "companyManaged" | "prometheusManaged";

export interface BrainSettings {
  memoryMode: BrainMemoryMode;
  auditRetentionDays: number;
  allowProviderTools: boolean;
  ai: BrainAiSettings;
}

export const DEFAULT_BRAIN_SETTINGS: BrainSettings = {
  memoryMode: "off",
  auditRetentionDays: 365,
  allowProviderTools: false,
  ai: normalizeBrainAiSettings(undefined),
};

export function normalizeBrainSettings(value: any): BrainSettings {
  const memoryMode = ["off", "companyManaged", "prometheusManaged"].includes(
    value?.memoryMode
  )
    ? value.memoryMode
    : DEFAULT_BRAIN_SETTINGS.memoryMode;

  return {
    memoryMode,
    auditRetentionDays: Number.isFinite(Number(value?.auditRetentionDays))
      ? Number(value.auditRetentionDays)
      : DEFAULT_BRAIN_SETTINGS.auditRetentionDays,
    allowProviderTools: Boolean(value?.allowProviderTools),
    ai: normalizeBrainAiSettings(value?.ai ?? value),
  };
}
```

- [ ] **Step 6: Extend the backend Company interface**

Modify `CompanyBrainSettings` in `prometheus-backend/src/company/interface/company.interface.ts`:

```ts
export interface CompanyBrainSettings {
  memoryMode?: "off" | "companyManaged" | "prometheusManaged";
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
  ai?: {
    providerMode?: "prometheusManaged" | "companyOpenAi" | "local" | "disabled";
    reasoningModel?: string;
    economyModel?: string;
    monthlyBudgetUsd?: number;
    dailyRequestLimit?: number;
    providerKeyStatus?: "missing" | "connected" | "failed" | "rotating";
    providerKeyFingerprint?: string | null;
    providerLastTestedAt?: Date | null;
    providerLastError?: string | null;
    encryptedOpenAiApiKey?: string;
  };
  updatedBy?: string;
  updatedAt?: Date;
}
```

- [ ] **Step 7: Run provider utility tests**

Run:

```powershell
npm test -- brain-ai-provider.util.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git add prometheus-backend/src/brain/ai-provider/brain-ai-provider.types.ts `
  prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.ts `
  prometheus-backend/src/brain/ai-provider/brain-ai-provider.util.spec.ts `
  prometheus-backend/src/brain/brain-settings.util.ts `
  prometheus-backend/src/company/interface/company.interface.ts
git commit -m "feat: add brain ai provider settings types"
```

---

### Task 2: Add Company Brain Settings Service

**Files:**
- Create: `prometheus-backend/src/brain/brain-settings.service.ts`
- Create: `prometheus-backend/src/brain/brain-settings.service.spec.ts`
- Modify: `prometheus-backend/src/company/schema/company.schema.ts`
- Modify: `prometheus-backend/src/brain/dto/prometheus-brain.dto.ts`
- Modify: `prometheus-backend/src/brain/brain.module.ts`
- Modify: `prometheus-backend/src/brain/brain-memory.service.ts`
- Modify: `prometheus-backend/src/brain/brain-memory.service.spec.ts`

- [ ] **Step 1: Write settings service tests**

Create `prometheus-backend/src/brain/brain-settings.service.spec.ts`:

```ts
import { BrainSettingsService } from "./brain-settings.service";

describe("BrainSettingsService", () => {
  const createService = (companyModel: any) => new BrainSettingsService(companyModel);

  it("returns normalized settings with no raw provider key", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          brainSettings: {
            memoryMode: "companyManaged",
            ai: {
              providerMode: "companyOpenAi",
              encryptedOpenAiApiKey: "SECRET",
              providerKeyStatus: "connected",
              providerKeyFingerprint: "sk-p...1234",
            },
          },
        }),
      }),
    };

    const settings = await createService(companyModel).getCompanySettings("company-1");

    expect(settings.memoryMode).toBe("companyManaged");
    expect(settings.ai.providerMode).toBe("companyOpenAi");
    expect(settings.ai.providerKeyFingerprint).toBe("sk-p...1234");
    expect(JSON.stringify(settings)).not.toContain("SECRET");
  });

  it("stores company key metadata and raw key server-side only", async () => {
    const lean = jest.fn().mockResolvedValue({ _id: "company-1" });
    const companyModel = {
      findByIdAndUpdate: jest.fn().mockReturnValue({ lean }),
    };

    await createService(companyModel).updateCompanySettings("company-1", "admin-1", {
      memoryMode: "companyManaged",
      auditRetentionDays: 90,
      allowProviderTools: true,
      ai: {
        providerMode: "companyOpenAi",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
        monthlyBudgetUsd: 100,
        dailyRequestLimit: 250,
        openAiApiKey: "sk-proj-abcdef1234567890",
      },
    });

    expect(companyModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        brainSettings: expect.objectContaining({
          memoryMode: "companyManaged",
          ai: expect.objectContaining({
            providerMode: "companyOpenAi",
            encryptedOpenAiApiKey: "sk-proj-abcdef1234567890",
            providerKeyStatus: "connected",
            providerKeyFingerprint: "sk-p...7890",
          }),
        }),
      }),
      { new: true }
    );
  });

  it("preserves existing provider key when update omits openAiApiKey", async () => {
    const companyModel = {
      findById: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          brainSettings: {
            ai: {
              encryptedOpenAiApiKey: "existing-secret",
              providerKeyStatus: "connected",
              providerKeyFingerprint: "sk-p...0001",
            },
          },
        }),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "company-1" }),
      }),
    };

    await createService(companyModel).updateCompanySettings("company-1", "admin-1", {
      ai: { providerMode: "companyOpenAi" },
    });

    expect(companyModel.findByIdAndUpdate).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({
        brainSettings: expect.objectContaining({
          ai: expect.objectContaining({
            encryptedOpenAiApiKey: "existing-secret",
            providerKeyStatus: "connected",
            providerKeyFingerprint: "sk-p...0001",
          }),
        }),
      }),
      { new: true }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- brain-settings.service.spec.ts --runInBand
```

Expected: FAIL because `BrainSettingsService` does not exist.

- [ ] **Step 3: Extend DTOs**

Modify `prometheus-backend/src/brain/dto/prometheus-brain.dto.ts`:

```ts
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PrometheusBrainSource } from "../interface/prometheus-brain-event.interface";

export class BrainAiSettingsDTO {
  @IsOptional()
  @IsIn(["prometheusManaged", "companyOpenAi", "local", "disabled"])
  providerMode?: "prometheusManaged" | "companyOpenAi" | "local" | "disabled";

  @IsOptional()
  @IsString()
  reasoningModel?: string;

  @IsOptional()
  @IsString()
  economyModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  monthlyBudgetUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  dailyRequestLimit?: number;

  @IsOptional()
  @IsString()
  openAiApiKey?: string;
}

export class UpdateBrainSettingsDTO {
  @IsOptional()
  @IsIn(["off", "companyManaged", "prometheusManaged"])
  memoryMode?: "off" | "companyManaged" | "prometheusManaged";

  @IsOptional()
  @IsInt()
  @Min(1)
  auditRetentionDays?: number;

  @IsOptional()
  @IsBoolean()
  allowProviderTools?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrainAiSettingsDTO)
  ai?: BrainAiSettingsDTO;
}
```

Keep the existing `PrometheusBrainPromptDTO` unchanged above these classes.

- [ ] **Step 4: Extend schema**

Modify the `brainSettings` object in `prometheus-backend/src/company/schema/company.schema.ts`:

```ts
    brainSettings: {
      memoryMode: {
        type: String,
        enum: ["off", "companyManaged", "prometheusManaged"],
        default: "off"
      },
      auditRetentionDays: {
        type: Number,
        default: 365
      },
      allowProviderTools: {
        type: Boolean,
        default: false
      },
      ai: {
        providerMode: {
          type: String,
          enum: ["prometheusManaged", "companyOpenAi", "local", "disabled"],
          default: "local"
        },
        reasoningModel: {
          type: String,
          default: "gpt-5.5"
        },
        economyModel: {
          type: String,
          default: "gpt-5.4-mini"
        },
        monthlyBudgetUsd: {
          type: Number,
          default: 50
        },
        dailyRequestLimit: {
          type: Number,
          default: 500
        },
        providerKeyStatus: {
          type: String,
          enum: ["missing", "connected", "failed", "rotating"],
          default: "missing"
        },
        providerKeyFingerprint: String,
        providerLastTestedAt: Date,
        providerLastError: String,
        encryptedOpenAiApiKey: String
      },
      updatedBy: String,
      updatedAt: Date
    },
```

- [ ] **Step 5: Implement settings service**

Create `prometheus-backend/src/brain/brain-settings.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { maskBrainAiKey, normalizeBrainAiSettings } from "./ai-provider/brain-ai-provider.util";
import { normalizeBrainSettings } from "./brain-settings.util";
import { UpdateBrainSettingsDTO } from "./dto/prometheus-brain.dto";

@Injectable()
export class BrainSettingsService {
  constructor(
    @InjectModel("Company")
    private readonly companyModel: Model<any>
  ) {}

  async getCompanySettings(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean<any>();
    return this.sanitizeSettings(company?.brainSettings);
  }

  async getCompanyProviderSecret(companyId: string): Promise<string | null> {
    const company = await this.companyModel.findById(companyId).lean<any>();
    const key = String(company?.brainSettings?.ai?.encryptedOpenAiApiKey ?? "").trim();
    return key || null;
  }

  async updateCompanySettings(companyId: string, userId: string, data: UpdateBrainSettingsDTO) {
    const existing = await this.companyModel.findById(companyId).lean<any>();
    const existingAi = existing?.brainSettings?.ai ?? {};
    const incomingAi: any = data.ai ?? {};
    const keyPatch = maskBrainAiKey(incomingAi.openAiApiKey);
    const shouldReplaceKey = Object.prototype.hasOwnProperty.call(incomingAi, "openAiApiKey");

    const nextSettings = normalizeBrainSettings({
      ...(existing?.brainSettings ?? {}),
      ...data,
      ai: {
        ...existingAi,
        ...incomingAi,
        encryptedOpenAiApiKey: shouldReplaceKey
          ? String(incomingAi.openAiApiKey ?? "").trim()
          : existingAi.encryptedOpenAiApiKey,
        providerKeyStatus: shouldReplaceKey
          ? keyPatch.status
          : existingAi.providerKeyStatus,
        providerKeyFingerprint: shouldReplaceKey
          ? keyPatch.fingerprint
          : existingAi.providerKeyFingerprint,
      },
    });

    const rawKey = shouldReplaceKey
      ? String(incomingAi.openAiApiKey ?? "").trim()
      : String(existingAi.encryptedOpenAiApiKey ?? "").trim();

    const update = {
      brainSettings: {
        memoryMode: nextSettings.memoryMode,
        auditRetentionDays: nextSettings.auditRetentionDays,
        allowProviderTools: nextSettings.allowProviderTools,
        ai: {
          ...normalizeBrainAiSettings(nextSettings.ai),
          encryptedOpenAiApiKey: rawKey,
        },
        updatedBy: userId,
        updatedAt: new Date(),
      },
    };

    const updated = await this.companyModel
      .findByIdAndUpdate(companyId, update, { new: true })
      .lean<any>();

    return this.sanitizeSettings(updated?.brainSettings ?? update.brainSettings);
  }

  sanitizeSettings(value: any) {
    const settings = normalizeBrainSettings(value);
    return {
      ...settings,
      ai: {
        ...settings.ai,
        encryptedOpenAiApiKey: undefined,
      },
    };
  }
}
```

- [ ] **Step 6: Register service in Brain module**

Modify `prometheus-backend/src/brain/brain.module.ts`:

```ts
import { BrainSettingsService } from "./brain-settings.service";
```

Add `BrainSettingsService` to `providers` and `exports`.

- [ ] **Step 7: Use settings service in memory service**

Modify constructor in `prometheus-backend/src/brain/brain-memory.service.ts`:

```ts
import { BrainSettingsService } from "./brain-settings.service";
```

Add dependency:

```ts
    private readonly settings: BrainSettingsService,
```

Replace `getCompanySettings` and `updateCompanySettings` bodies:

```ts
  async getCompanySettings(companyId: string) {
    return this.settings.getCompanySettings(companyId);
  }

  async updateCompanySettings(companyId: string, userId: string, data: any) {
    return this.settings.updateCompanySettings(companyId, userId, data);
  }
```

Update `brain-memory.service.spec.ts` helper:

```ts
  const createService = (
    memoryModel: any,
    companyModel: any,
    approvals: any,
    events: any = { record: jest.fn() },
    settings: any = {
      getCompanySettings: jest.fn().mockResolvedValue({ memoryMode: "off" }),
      updateCompanySettings: jest.fn(),
    }
  ) => new BrainMemoryService(memoryModel, companyModel, approvals, events, settings);
```

For tests that rely on company settings, pass explicit `settings` mocks:

```ts
const settings = {
  getCompanySettings: jest.fn().mockResolvedValue({ memoryMode: "companyManaged" }),
  updateCompanySettings: jest.fn(),
};
```

- [ ] **Step 8: Run settings and memory tests**

Run:

```powershell
npm test -- brain-settings.service.spec.ts brain-memory.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Run:

```powershell
git add prometheus-backend/src/brain/brain-settings.service.ts `
  prometheus-backend/src/brain/brain-settings.service.spec.ts `
  prometheus-backend/src/company/schema/company.schema.ts `
  prometheus-backend/src/brain/dto/prometheus-brain.dto.ts `
  prometheus-backend/src/brain/brain.module.ts `
  prometheus-backend/src/brain/brain-memory.service.ts `
  prometheus-backend/src/brain/brain-memory.service.spec.ts
git commit -m "feat: add brain pro company ai settings"
```

---

### Task 3: Add Brain AI Provider Gateway

**Files:**
- Create: `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.ts`
- Create: `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.spec.ts`
- Modify: `prometheus-backend/src/brain/brain.module.ts`

- [ ] **Step 1: Write gateway tests**

Create `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.spec.ts`:

```ts
import { BrainAiProviderGateway } from "./brain-ai-provider.gateway";

describe("BrainAiProviderGateway", () => {
  const settings: any = {
    getCompanySettings: jest.fn(),
    getCompanyProviderSecret: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("returns fallback when provider is disabled", async () => {
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "disabled",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });

    const gateway = new BrainAiProviderGateway(settings);
    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "reasoning",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(result).toMatchObject({
      text: null,
      providerMode: "fallback",
      usedFallback: true,
    });
  });

  it("uses local runtime when local base URL is configured", async () => {
    process.env.OPENAI_BASE_URL = "http://127.0.0.1:1234/v1";
    process.env.OPENAI_API_KEY = "lm-studio";
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "local",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });

    const gateway = new BrainAiProviderGateway(settings);
    jest.spyOn(gateway as any, "generateChatCompletion").mockResolvedValue("local answer");

    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "simple",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(result).toMatchObject({
      text: "local answer",
      providerMode: "local",
      providerLabel: "Local OpenAI-compatible server",
      model: "gpt-5.4-mini",
      usedFallback: false,
    });
  });

  it("uses company OpenAI key without reading from frontend-visible settings", async () => {
    settings.getCompanySettings.mockResolvedValue({
      ai: {
        providerMode: "companyOpenAi",
        reasoningModel: "gpt-5.5",
        economyModel: "gpt-5.4-mini",
      },
    });
    settings.getCompanyProviderSecret.mockResolvedValue("sk-company-secret");

    const gateway = new BrainAiProviderGateway(settings);
    jest.spyOn(gateway as any, "generateResponsesText").mockResolvedValue("company answer");

    const result = await gateway.generate({
      companyId: "company-1",
      taskClass: "reasoning",
      systemPrompt: "system",
      userPayload: "payload",
    });

    expect(settings.getCompanyProviderSecret).toHaveBeenCalledWith("company-1");
    expect(result).toMatchObject({
      text: "company answer",
      providerMode: "companyOpenAi",
      providerLabel: "Company OpenAI",
      model: "gpt-5.5",
      usedFallback: false,
    });
  });
});
```

- [ ] **Step 2: Run gateway tests to verify failure**

Run:

```powershell
npm test -- brain-ai-provider.gateway.spec.ts --runInBand
```

Expected: FAIL because gateway file does not exist.

- [ ] **Step 3: Implement gateway**

Create `prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.ts`:

```ts
import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { BrainSettingsService } from "../brain-settings.service";
import {
  BrainAiGenerateInput,
  BrainAiGenerateResult,
  BrainAiProviderMode,
  BrainAiProviderRuntime,
  BrainAiTaskClass,
} from "./brain-ai-provider.types";
import { resolveBrainProviderMode } from "./brain-ai-provider.util";

const nodeFetch: any = require("node-fetch");

@Injectable()
export class BrainAiProviderGateway {
  constructor(private readonly settings: BrainSettingsService) {}

  async generate(input: BrainAiGenerateInput): Promise<BrainAiGenerateResult> {
    if (process.env.NODE_ENV === "test" && !process.env.OPENAI_BASE_URL && !process.env.OPENAI_API_KEY) {
      return this.fallback("Provider disabled in test environment.");
    }

    const runtime = await this.resolveRuntime(input.companyId, input.taskClass, input.preferredModel);
    if (!runtime) {
      return this.fallback("No Brain Pro provider is connected.");
    }

    try {
      const text = runtime.baseURL
        ? await this.generateChatCompletion(runtime, input.systemPrompt, input.userPayload)
        : await this.generateResponsesText(runtime, input.systemPrompt, input.userPayload);

      return {
        text,
        providerMode: runtime.mode,
        providerLabel: runtime.providerLabel,
        model: runtime.model,
        usedFallback: false,
      };
    } catch (error) {
      return this.fallback(this.sanitizeError(error));
    }
  }

  async testProvider(companyId: string) {
    const result = await this.generate({
      companyId,
      taskClass: "simple",
      systemPrompt: "Answer with exactly: Prometheus Brain Pro connected.",
      userPayload: "Connection test",
    });

    return {
      ok: Boolean(result.text && !result.usedFallback),
      providerMode: result.providerMode,
      providerLabel: result.providerLabel,
      model: result.model,
      message: result.text || result.error || "Provider is not connected.",
    };
  }

  private async resolveRuntime(
    companyId: string,
    taskClass: BrainAiTaskClass,
    preferredModel?: string
  ): Promise<BrainAiProviderRuntime | null> {
    const settings = await this.settings.getCompanySettings(companyId);
    const companyKey = await this.settings.getCompanyProviderSecret(companyId);
    const prometheusKey = process.env.OPENAI_API_KEY?.trim() || "";
    const localBaseURL = process.env.OPENAI_BASE_URL?.trim() || "";
    const mode = resolveBrainProviderMode({
      providerMode: settings.ai.providerMode,
      hasCompanyKey: Boolean(companyKey),
      hasPrometheusKey: Boolean(prometheusKey),
      hasLocalBaseUrl: Boolean(localBaseURL),
    });

    const model = preferredModel || this.modelForTask(taskClass, settings.ai);
    return this.runtimeForMode(mode, model, companyKey, prometheusKey, localBaseURL);
  }

  private runtimeForMode(
    mode: BrainAiProviderMode,
    model: string,
    companyKey: string | null,
    prometheusKey: string,
    localBaseURL: string
  ): BrainAiProviderRuntime | null {
    if (mode === "disabled") return null;
    if (mode === "companyOpenAi" && companyKey) {
      return { mode, providerLabel: "Company OpenAI", apiKey: companyKey, model };
    }
    if (mode === "prometheusManaged" && prometheusKey) {
      return { mode, providerLabel: "Prometheus-managed OpenAI", apiKey: prometheusKey, model };
    }
    if (mode === "local" && localBaseURL) {
      return {
        mode,
        providerLabel: "Local OpenAI-compatible server",
        apiKey: prometheusKey || "lm-studio",
        model: process.env.OPENAI_MODEL?.trim() || model,
        baseURL: localBaseURL,
      };
    }
    return null;
  }

  private modelForTask(taskClass: BrainAiTaskClass, ai: any): string {
    if (taskClass === "simple" || taskClass === "classification") {
      return ai.economyModel || "gpt-5.4-mini";
    }
    return ai.reasoningModel || "gpt-5.5";
  }

  private async generateResponsesText(runtime: BrainAiProviderRuntime, systemPrompt: string, userPayload: string) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      fetch: nodeFetch,
      timeout: 30000,
    });

    const response = await client.responses.create({
      model: runtime.model,
      store: false,
      temperature: 0.35,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPayload }] },
      ],
      text: { verbosity: "medium" },
    });

    return response.output_text?.trim() || null;
  }

  private async generateChatCompletion(runtime: BrainAiProviderRuntime, systemPrompt: string, userPayload: string) {
    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseURL,
      fetch: nodeFetch,
      timeout: 45000,
    });

    const response = await client.chat.completions.create({
      model: runtime.model,
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload },
      ],
    });

    return response.choices?.[0]?.message?.content?.trim() || null;
  }

  private fallback(error: string): BrainAiGenerateResult {
    return {
      text: null,
      providerMode: "fallback",
      providerLabel: "Deterministic Prometheus fallback",
      model: null,
      usedFallback: true,
      error,
    };
  }

  private sanitizeError(error: any): string {
    return error?.error?.message || error?.response?.data?.error?.message || error?.message || "AI provider request failed.";
  }
}
```

- [ ] **Step 4: Register gateway**

Modify `prometheus-backend/src/brain/brain.module.ts`:

```ts
import { BrainAiProviderGateway } from "./ai-provider/brain-ai-provider.gateway";
```

Add `BrainAiProviderGateway` to `providers` and `exports`.

- [ ] **Step 5: Run gateway tests**

Run:

```powershell
npm test -- brain-ai-provider.gateway.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git add prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.ts `
  prometheus-backend/src/brain/ai-provider/brain-ai-provider.gateway.spec.ts `
  prometheus-backend/src/brain/brain.module.ts
git commit -m "feat: add brain pro ai provider gateway"
```

---

### Task 4: Route Prometheus Brain Through The Provider Gateway

**Files:**
- Modify: `prometheus-backend/src/brain/prometheus-brain.service.ts`
- Modify: `prometheus-backend/src/brain/prometheus-brain.service.spec.ts`
- Modify: `prometheus-backend/src/brain/prometheus-brain.controller.ts`
- Modify: `prometheus-backend/src/brain/brain.module.ts`

- [ ] **Step 1: Update Brain service tests first**

Modify the `createService` helper in `prometheus-backend/src/brain/prometheus-brain.service.spec.ts` to include `aiProvider`:

```ts
    aiProvider?: any;
```

Add default:

```ts
    const aiProvider = overrides.aiProvider ?? {
      generate: jest.fn().mockResolvedValue({
        text: null,
        providerMode: "fallback",
        providerLabel: "Deterministic Prometheus fallback",
        model: null,
        usedFallback: true,
      }),
      testProvider: jest.fn(),
    };
```

Instantiate:

```ts
      service: new PrometheusBrainService(events, approvals, memory, agentCommands, routingIntelligence, aiProvider),
```

Return `aiProvider`.

Add test:

```ts
  it("uses Brain Pro provider gateway for general transportation prompts", async () => {
    const { service, aiProvider, events } = createService({
      aiProvider: {
        generate: jest.fn().mockResolvedValue({
          text: "Morning. I can help you work the Chicago board and keep approvals clean.",
          providerMode: "companyOpenAi",
          providerLabel: "Company OpenAI",
          model: "gpt-5.5",
          usedFallback: false,
        }),
      },
    });

    const response: any = await service.handlePrompt({
      prompt: "good morning",
      source: "matching",
    }, user);

    expect(aiProvider.generate).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-1",
      taskClass: "simple",
      systemPrompt: expect.stringContaining("Prometheus"),
      userPayload: expect.stringContaining("good morning"),
    }));
    expect(response.answer).toContain("Morning");
    expect(response.metadata.ai).toEqual(expect.objectContaining({
      providerMode: "companyOpenAi",
      model: "gpt-5.5",
    }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      tool: "brainProProviderGateway",
      payload: expect.objectContaining({
        ai: expect.objectContaining({ providerMode: "companyOpenAi" }),
      }),
    }));
  });
```

- [ ] **Step 2: Run service test to verify failure**

Run:

```powershell
npm test -- prometheus-brain.service.spec.ts --runInBand
```

Expected: FAIL because constructor and implementation do not accept `aiProvider`.

- [ ] **Step 3: Inject provider gateway**

Modify imports in `prometheus-backend/src/brain/prometheus-brain.service.ts`:

```ts
import { BrainAiProviderGateway } from "./ai-provider/brain-ai-provider.gateway";
import { BrainAiTaskClass } from "./ai-provider/brain-ai-provider.types";
```

Remove direct `OpenAI` and `node-fetch` imports from this file after gateway migration.

Modify constructor:

```ts
    private readonly routingIntelligence: RoutingIntelligenceService,
    private readonly aiProvider: BrainAiProviderGateway
```

- [ ] **Step 4: Replace direct AI runtime methods**

Delete these methods from `PrometheusBrainService`:

- `getAiRuntimeConfig`
- `tryGenerateBrainAnswer`
- `generateLocalBrainAnswer`
- `generateOpenAiBrainAnswer`
- `extractResponseOutputText`

Add:

```ts
  private async tryGenerateBrainAnswer(
    intent: PrometheusBrainIntent,
    prompt: string,
    context: { companyId: string; role: string; source: PrometheusBrainSource; related?: Record<string, string> }
  ) {
    const result = await this.aiProvider.generate({
      companyId: context.companyId,
      taskClass: this.taskClassForIntent(intent),
      systemPrompt: this.buildBrainSystemPrompt(),
      userPayload: this.buildBrainUserPayload(intent, prompt, context),
    });

    return result;
  }

  private taskClassForIntent(intent: PrometheusBrainIntent): BrainAiTaskClass {
    if (intent === "generalTransportation") return "simple";
    if (intent === "draftEmail" || intent === "draftChat") return "drafting";
    if (intent === "map" || intent === "search") return "reasoning";
    return "reasoning";
  }
```

Update general fallback branch:

```ts
    const aiResult = await this.tryGenerateBrainAnswer(parsed.intent, prompt, {
      companyId,
      role,
      source,
      related: data.related,
    });
    const answer = aiResult.text ?? this.renderKnowledgeAnswer(parsed.intent, prompt);
    const aiMetadata = {
      providerMode: aiResult.providerMode,
      providerLabel: aiResult.providerLabel,
      model: aiResult.model,
      usedFallback: aiResult.usedFallback,
    };
    const event = await this.events.record({
      companyId,
      userId,
      role,
      source,
      type: "suggestionShown",
      prompt,
      intent: parsed.intent,
      tool: aiResult.text ? "brainProProviderGateway" : "deterministicTransportationAnswer",
      message: answer,
      payload: { ai: aiMetadata },
    });

    return {
      handled: true,
      intent: parsed.intent,
      answer,
      eventId: String(event?._id ?? ""),
      metadata: { ai: aiMetadata },
    };
```

- [ ] **Step 5: Add provider test endpoint**

Modify `prometheus-backend/src/brain/prometheus-brain.controller.ts` constructor:

```ts
    private readonly settings: BrainSettingsService,
    private readonly aiProvider: BrainAiProviderGateway
```

Add imports:

```ts
import { BrainAiProviderGateway } from "./ai-provider/brain-ai-provider.gateway";
import { BrainSettingsService } from "./brain-settings.service";
```

Add endpoints:

```ts
  @Roles("admin", "supervisor", "superadmin")
  @Get("settings")
  @ApiOkResponse({ status: 200 })
  getSettings(@Req() req) {
    return this.settings.getCompanySettings(String(req.user.companyId ?? ""));
  }

  @Roles("admin", "supervisor", "superadmin")
  @Post("settings/test-provider")
  @ApiOkResponse({ status: 200 })
  testProvider(@Req() req) {
    return this.aiProvider.testProvider(String(req.user.companyId ?? ""));
  }
```

- [ ] **Step 6: Run Brain service tests**

Run:

```powershell
npm test -- prometheus-brain.service.spec.ts brain-ai-provider.gateway.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add prometheus-backend/src/brain/prometheus-brain.service.ts `
  prometheus-backend/src/brain/prometheus-brain.service.spec.ts `
  prometheus-backend/src/brain/prometheus-brain.controller.ts `
  prometheus-backend/src/brain/brain.module.ts
git commit -m "feat: route brain prompts through brain pro gateway"
```

---

### Task 5: Add Frontend Brain Pro Types And API Calls

**Files:**
- Modify: `prometheus/src/app/shared/types/models.ts`
- Modify: `prometheus/src/app/core/api/brain-api.service.ts`

- [ ] **Step 1: Add frontend model types**

Modify `prometheus/src/app/shared/types/models.ts` near existing Brain types:

```ts
export type BrainAiProviderMode = 'prometheusManaged' | 'companyOpenAi' | 'local' | 'disabled';
export type BrainAiProviderKeyStatus = 'missing' | 'connected' | 'failed' | 'rotating';

export interface BrainAiSettingsView {
  providerMode: BrainAiProviderMode;
  reasoningModel: string;
  economyModel: string;
  monthlyBudgetUsd: number;
  dailyRequestLimit: number;
  providerKeyStatus: BrainAiProviderKeyStatus;
  providerKeyFingerprint?: string | null;
  providerLastTestedAt?: string | Date | null;
  providerLastError?: string | null;
}

export interface BrainSettingsView {
  memoryMode: 'off' | 'companyManaged' | 'prometheusManaged';
  auditRetentionDays: number;
  allowProviderTools: boolean;
  ai: BrainAiSettingsView;
}

export interface BrainAiSettingsPayload {
  providerMode?: BrainAiProviderMode;
  reasoningModel?: string;
  economyModel?: string;
  monthlyBudgetUsd?: number;
  dailyRequestLimit?: number;
  openAiApiKey?: string;
}
```

Update `UpdateBrainSettingsPayload`:

```ts
export interface UpdateBrainSettingsPayload {
  memoryMode?: 'off' | 'companyManaged' | 'prometheusManaged';
  auditRetentionDays?: number;
  allowProviderTools?: boolean;
  ai?: BrainAiSettingsPayload;
}
```

Add to `PrometheusBrainPromptResponse`:

```ts
  metadata?: {
    routeIntelligence?: RoutingIntelligencePanelState;
    ai?: {
      providerMode: string;
      providerLabel: string;
      model: string | null;
      usedFallback: boolean;
    };
    [key: string]: unknown;
  };
```

- [ ] **Step 2: Add Brain API calls**

Modify imports in `prometheus/src/app/core/api/brain-api.service.ts`:

```ts
  BrainSettingsView,
```

Add methods:

```ts
  getSettings(): Observable<BrainSettingsView> {
    return this.http.get<BrainSettingsView>('brain/settings');
  }

  testProvider(): Observable<{ ok: boolean; providerMode: string; providerLabel: string; model: string | null; message: string }> {
    return this.http.post<{ ok: boolean; providerMode: string; providerLabel: string; model: string | null; message: string }>('brain/settings/test-provider', {});
  }
```

- [ ] **Step 3: Run TypeScript build**

Run:

```powershell
npm run build
```

Expected: PASS with existing Angular budget warnings only.

- [ ] **Step 4: Commit Task 5**

Run:

```powershell
git add prometheus/src/app/shared/types/models.ts prometheus/src/app/core/api/brain-api.service.ts
git commit -m "feat: add brain pro frontend api types"
```

---

### Task 6: Extend Company Setup Brain Pro UI

**Files:**
- Modify: `prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `prometheus/src/app/features/workspace/workspace.component.html`
- Modify: `prometheus/src/app/features/workspace/workspace.component.scss`
- Modify: `prometheus/src/app/features/workspace/workspace.component.spec.ts`

- [ ] **Step 1: Update existing frontend Brain settings test**

Modify the existing test `shows Brain settings to company admins and saves changes` in `workspace.component.spec.ts` so `brainApi` includes:

```ts
      getSettings: jasmine.createSpy('getSettings').and.returnValue(of({
        memoryMode: 'off',
        auditRetentionDays: 365,
        allowProviderTools: false,
        ai: {
          providerMode: 'local',
          reasoningModel: 'gpt-5.5',
          economyModel: 'gpt-5.4-mini',
          monthlyBudgetUsd: 50,
          dailyRequestLimit: 500,
          providerKeyStatus: 'missing',
          providerKeyFingerprint: null,
          providerLastTestedAt: null,
          providerLastError: null,
        },
      })),
      testProvider: jasmine.createSpy('testProvider').and.returnValue(of({
        ok: true,
        providerMode: 'local',
        providerLabel: 'Local OpenAI-compatible server',
        model: 'gpt-5.4-mini',
        message: 'Prometheus Brain Pro connected.',
      })),
```

Update expectations:

```ts
    expect(fixture.nativeElement.textContent).toContain('Brain Pro and company AI');
```

Patch form:

```ts
    component.brainSettingsForm.patchValue({
      memoryMode: 'companyManaged',
      auditRetentionDays: 90,
      allowProviderTools: true,
      aiProviderMode: 'companyOpenAi',
      aiReasoningModel: 'gpt-5.5',
      aiEconomyModel: 'gpt-5.4-mini',
      aiMonthlyBudgetUsd: 100,
      aiDailyRequestLimit: 250,
      aiOpenAiApiKey: 'sk-proj-abcdef1234567890',
    });
```

Update expected payload:

```ts
    expect(brainApi.updateSettings).toHaveBeenCalledWith({
      memoryMode: 'companyManaged',
      auditRetentionDays: 90,
      allowProviderTools: true,
      ai: {
        providerMode: 'companyOpenAi',
        reasoningModel: 'gpt-5.5',
        economyModel: 'gpt-5.4-mini',
        monthlyBudgetUsd: 100,
        dailyRequestLimit: 250,
        openAiApiKey: 'sk-proj-abcdef1234567890',
      },
    });
```

Add test:

```ts
  it('tests Brain Pro provider without exposing a saved key', async () => {
    const brainApi = {
      sendPrompt: () => of({ handled: true, intent: 'generalTransportation', answer: 'Prometheus Brain is ready.' }),
      approve: () => of({}),
      reject: () => of({}),
      listApprovals: () => of([]),
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of({})),
      getSettings: jasmine.createSpy('getSettings').and.returnValue(of({
        memoryMode: 'off',
        auditRetentionDays: 365,
        allowProviderTools: false,
        ai: {
          providerMode: 'companyOpenAi',
          reasoningModel: 'gpt-5.5',
          economyModel: 'gpt-5.4-mini',
          monthlyBudgetUsd: 50,
          dailyRequestLimit: 500,
          providerKeyStatus: 'connected',
          providerKeyFingerprint: 'sk-p...7890',
          providerLastTestedAt: null,
          providerLastError: null,
        },
      })),
      testProvider: jasmine.createSpy('testProvider').and.returnValue(of({
        ok: true,
        providerMode: 'companyOpenAi',
        providerLabel: 'Company OpenAI',
        model: 'gpt-5.5',
        message: 'Prometheus Brain Pro connected.',
      })),
    };
    const fixture = await createFixture({
      providers: [{ provide: BrainApiService, useValue: brainApi }],
    });
    const component = fixture.componentInstance;

    fixture.detectChanges();
    component.testBrainProvider();

    expect(brainApi.testProvider).toHaveBeenCalled();
    expect(component.brainSettingsMessage).toContain('Company OpenAI');
    expect(component.brainSettingsForm.get('aiOpenAiApiKey')?.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('sk-p...7890');
  });
```

- [ ] **Step 2: Run frontend test to verify failure**

Run:

```powershell
npm test -- --watch=false --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: FAIL because form fields and UI do not exist.

- [ ] **Step 3: Extend component state and form**

Modify imports in `workspace.component.ts`:

```ts
  BrainSettingsView,
```

Extend `brainSettingsForm`:

```ts
  readonly brainSettingsForm: FormGroup = this.fb.group({
    memoryMode: ['off'],
    auditRetentionDays: [365, [Validators.required, Validators.min(1)]],
    allowProviderTools: [false],
    aiProviderMode: ['local'],
    aiReasoningModel: ['gpt-5.5', [Validators.required]],
    aiEconomyModel: ['gpt-5.4-mini', [Validators.required]],
    aiMonthlyBudgetUsd: [50, [Validators.required, Validators.min(1)]],
    aiDailyRequestLimit: [500, [Validators.required, Validators.min(1)]],
    aiOpenAiApiKey: [''],
  });
```

Add state:

```ts
  brainSettings: BrainSettingsView | null = null;
  brainProviderTesting = false;
```

After `this.loadWorkspaceData(this.user);` in `ngOnInit`, call:

```ts
      if (this.canManageCompanySetup) this.loadBrainSettings();
```

Add methods:

```ts
  loadBrainSettings(): void {
    if (!this.canManageCompanySetup) return;
    this.brainApi.getSettings().subscribe({
      next: (settings) => {
        this.brainSettings = settings;
        this.brainSettingsForm.patchValue({
          memoryMode: settings.memoryMode,
          auditRetentionDays: settings.auditRetentionDays,
          allowProviderTools: settings.allowProviderTools,
          aiProviderMode: settings.ai.providerMode,
          aiReasoningModel: settings.ai.reasoningModel,
          aiEconomyModel: settings.ai.economyModel,
          aiMonthlyBudgetUsd: settings.ai.monthlyBudgetUsd,
          aiDailyRequestLimit: settings.ai.dailyRequestLimit,
          aiOpenAiApiKey: '',
        }, { emitEvent: false });
      },
      error: () => {
        this.brainSettingsError = 'Brain Pro settings could not be loaded right now.';
      },
    });
  }

  testBrainProvider(): void {
    if (!this.canManageCompanySetup) return;
    this.brainSettingsMessage = '';
    this.brainSettingsError = '';
    this.brainProviderTesting = true;
    this.brainApi.testProvider().pipe(
      finalize(() => this.brainProviderTesting = false)
    ).subscribe({
      next: (result) => {
        if (result.ok) {
          this.brainSettingsMessage = `Brain Pro provider connected: ${result.providerLabel}${result.model ? ` (${result.model})` : ''}.`;
        } else {
          this.brainSettingsError = result.message || 'Brain Pro provider is not connected.';
        }
      },
      error: () => {
        this.brainSettingsError = 'Brain Pro provider test failed.';
      },
    });
  }
```

Modify `saveBrainSettings()` payload:

```ts
    const openAiApiKey = String(settings.aiOpenAiApiKey ?? '').trim();
    const payload: UpdateBrainSettingsPayload = {
      memoryMode: settings.memoryMode ?? 'off',
      auditRetentionDays: Number(settings.auditRetentionDays ?? 365),
      allowProviderTools: Boolean(settings.allowProviderTools),
      ai: {
        providerMode: settings.aiProviderMode ?? 'local',
        reasoningModel: settings.aiReasoningModel ?? 'gpt-5.5',
        economyModel: settings.aiEconomyModel ?? 'gpt-5.4-mini',
        monthlyBudgetUsd: Number(settings.aiMonthlyBudgetUsd ?? 50),
        dailyRequestLimit: Number(settings.aiDailyRequestLimit ?? 500),
        ...(openAiApiKey ? { openAiApiKey } : {}),
      },
    };
```

In save success:

```ts
      next: () => {
        this.addSystemNotice('Brain settings saved.');
        this.brainSettingsForm.patchValue({ aiOpenAiApiKey: '' }, { emitEvent: false });
        this.loadBrainSettings();
      },
```

- [ ] **Step 4: Update HTML**

Replace the current company setup Brain settings card copy in `workspace.component.html` with:

```html
        <section class="brain-settings-card insight-card insight-card--plan" *ngIf="canManageCompanySetup" [formGroup]="brainSettingsForm">
          <div>
            <span class="eyebrow">Prometheus Brain settings</span>
            <h3>Brain Pro and company AI</h3>
            <p>
              Choose how Prometheus uses AI for this company. API keys stay server-side, provider actions stay approval-gated,
              and deterministic Prometheus tools keep working if paid AI is unavailable.
            </p>
          </div>

          <div class="brain-provider-status" *ngIf="brainSettings?.ai as ai">
            <span>{{ ai.providerMode }}</span>
            <strong>{{ ai.providerKeyStatus }}</strong>
            <em *ngIf="ai.providerKeyFingerprint">{{ ai.providerKeyFingerprint }}</em>
          </div>

          <div class="form-grid form-grid--dispatch">
            <label class="field">
              <span>Memory mode</span>
              <select formControlName="memoryMode">
                <option value="off">Off</option>
                <option value="companyManaged">Company managed</option>
                <option value="prometheusManaged">Prometheus managed</option>
              </select>
            </label>

            <label class="field">
              <span>AI provider</span>
              <select formControlName="aiProviderMode">
                <option value="local">Local LM Studio</option>
                <option value="prometheusManaged">Prometheus managed</option>
                <option value="companyOpenAi">Company OpenAI key</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>

            <label class="field">
              <span>Reasoning model</span>
              <input type="text" formControlName="aiReasoningModel" />
            </label>

            <label class="field">
              <span>Economy model</span>
              <input type="text" formControlName="aiEconomyModel" />
            </label>

            <label class="field">
              <span>Monthly budget</span>
              <input type="number" min="1" formControlName="aiMonthlyBudgetUsd" />
            </label>

            <label class="field">
              <span>Daily requests</span>
              <input type="number" min="1" formControlName="aiDailyRequestLimit" />
            </label>

            <label class="field field--wide">
              <span>OpenAI API key</span>
              <input type="password" formControlName="aiOpenAiApiKey" placeholder="Paste a new key only when adding or rotating" autocomplete="off" />
            </label>

            <label class="brain-settings-toggle">
              <input type="checkbox" formControlName="allowProviderTools" />
              <span>Allow provider tools</span>
            </label>
          </div>

          <div class="message-banner" *ngIf="brainSettingsMessage">{{ brainSettingsMessage }}</div>
          <div class="message-banner error" *ngIf="brainSettingsError">{{ brainSettingsError }}</div>

          <div class="quick-actions quick-actions--compact">
            <button class="primary-button" type="button" (click)="saveBrainSettings()" [disabled]="brainSettingsSaving">
              {{ brainSettingsSaving ? 'Saving...' : 'Save Brain settings' }}
            </button>
            <button class="ghost-button" type="button" (click)="testBrainProvider()" [disabled]="brainProviderTesting">
              {{ brainProviderTesting ? 'Testing...' : 'Test provider' }}
            </button>
          </div>
        </section>
```

- [ ] **Step 5: Add SCSS**

Add to `workspace.component.scss` near Brain settings styles:

```scss
.brain-provider-status {
  align-items: center;
  border: 1px solid rgba(83, 197, 255, 0.24);
  border-radius: 8px;
  display: flex;
  gap: 12px;
  padding: 10px 12px;
}

.brain-provider-status span,
.brain-provider-status em {
  color: #9fbce0;
  font-size: 13px;
}

.brain-provider-status strong {
  color: #55d5ff;
  font-size: 13px;
  text-transform: uppercase;
}

.field--wide {
  grid-column: 1 / -1;
}
```

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
npm test -- --watch=false --include src/app/features/workspace/workspace.component.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

Run:

```powershell
git add prometheus/src/app/features/workspace/workspace.component.ts `
  prometheus/src/app/features/workspace/workspace.component.html `
  prometheus/src/app/features/workspace/workspace.component.scss `
  prometheus/src/app/features/workspace/workspace.component.spec.ts
git commit -m "feat: add brain pro provider settings ui"
```

---

### Task 7: Environment Documentation And Provider Catalog Copy

**Files:**
- Modify: `prometheus-backend/.env.example`
- Modify: `prometheus-backend/src/company/integrations/company-integrations.service.ts`
- Modify: `prometheus-backend/src/company/integrations/company-integrations.service.spec.ts`

- [ ] **Step 1: Update integration catalog test**

In `company-integrations.service.spec.ts`, update the OpenAI/platform expectation to check the new wording:

```ts
expect(openAiProvider?.description).toContain("Brain Pro");
expect(openAiProvider?.requiredKeys).toEqual(["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL"]);
```

- [ ] **Step 2: Run catalog test to verify failure if copy is stale**

Run:

```powershell
npm test -- company-integrations.service.spec.ts --runInBand
```

Expected: FAIL if current copy does not mention Brain Pro.

- [ ] **Step 3: Update `.env.example`**

Modify the AI section in `prometheus-backend/.env.example`:

```env
# Brain Pro local LM Studio / OpenAI-compatible settings.
# Keep OPENAI_BASE_URL set for local testing.
OPENAI_BASE_URL=http://127.0.0.1:1234/v1
OPENAI_API_KEY=lm-studio
OPENAI_MODEL=openai_gpt-oss-20b-wcb

# Brain Pro cloud OpenAI settings.
# For Prometheus-managed cloud mode, clear OPENAI_BASE_URL and set a server-side API key.
# Company-owned keys are entered by admins in Company Setup and are never returned to the frontend.
# OPENAI_BASE_URL=
# OPENAI_API_KEY=your_real_openai_api_key
# OPENAI_MODEL=gpt-5.5
```

- [ ] **Step 4: Update provider catalog description**

Modify the OpenAI platform provider description in `company-integrations.service.ts`:

```ts
this.platformProvider(
  "openai",
  "Brain Pro AI gateway",
  "local",
  ["OPENAI_BASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL"],
  this.envStatus(["OPENAI_BASE_URL", "OPENAI_API_KEY"]),
  "Prometheus Brain Pro can use local LM Studio, Prometheus-managed OpenAI, or a company-owned OpenAI key from Company Setup."
),
```

- [ ] **Step 5: Run catalog test**

Run:

```powershell
npm test -- company-integrations.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

Run:

```powershell
git add prometheus-backend/.env.example `
  prometheus-backend/src/company/integrations/company-integrations.service.ts `
  prometheus-backend/src/company/integrations/company-integrations.service.spec.ts
git commit -m "docs: document brain pro ai provider modes"
```

---

### Task 8: Final Verification

**Files:**
- No new implementation files.

- [ ] **Step 1: Run backend targeted tests**

Run:

```powershell
npm test -- brain-ai-provider.util.spec.ts brain-ai-provider.gateway.spec.ts brain-settings.service.spec.ts brain-memory.service.spec.ts prometheus-brain.service.spec.ts company-integrations.service.spec.ts --runInBand
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run frontend targeted tests**

Run:

```powershell
npm test -- --watch=false --include src/app/features/workspace/workspace.component.spec.ts --include src/app/features/workspace/ai-matching-console/ai-matching-console.component.spec.ts
```

Expected: all selected Angular specs PASS.

- [ ] **Step 3: Run backend build**

Run:

```powershell
npm run build
```

Expected: Nest build PASS.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
npm run build
```

Expected: Angular build PASS. Existing budget warnings are acceptable if they match the current known warnings.

- [ ] **Step 5: Manual smoke test**

Start servers if needed:

```powershell
$logDir = 'C:\Prometheus-Clean\artifacts\server-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile','-Command','Set-Location -LiteralPath "C:\Prometheus-Clean\prometheus-backend"; npm run start:dev *> "C:\Prometheus-Clean\artifacts\server-logs\backend.log"') -WindowStyle Hidden
Start-Process -FilePath 'powershell' -ArgumentList @('-NoProfile','-Command','Set-Location -LiteralPath "C:\Prometheus-Clean\prometheus"; npm start *> "C:\Prometheus-Clean\artifacts\server-logs\frontend.log"') -WindowStyle Hidden
```

Check:

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:3100/health-check' -UseBasicParsing
Invoke-WebRequest -Uri 'http://localhost:4300/' -UseBasicParsing
```

Expected: backend health returns `200 OK`; frontend returns HTML.

- [ ] **Step 6: Confirm final git state**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes. If verification exposed a defect, return to the task that introduced the defect, add a specific failing test for that defect, fix it, rerun Task 8 from Step 1, and commit that task's exact touched files with a focused message.

## Self-Review Notes

- Spec coverage: this plan covers provider gateway, company-owned key mode, Prometheus-managed/local modes, settings UI, provider status, sanitized secrets, Brain Pro model path, approval-safe continuation, and tests. The ChatGPT Companion and custom user agent ecosystem are intentionally split out for a later plan.
- Placeholder scan: no steps rely on unresolved values or unnamed files; model names are explicit and can be changed by company settings.
- Type consistency: `BrainAiProviderMode`, `BrainAiSettings`, `BrainSettingsView`, and `UpdateBrainSettingsPayload.ai` are defined before use in later tasks.
