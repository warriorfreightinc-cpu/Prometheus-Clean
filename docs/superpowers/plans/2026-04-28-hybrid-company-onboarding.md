# Hybrid Company Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hybrid company onboarding workflow where a master account reviews paperwork locally now, while the data model stays ready for future Highway-style verification providers.

**Architecture:** Extend the existing Company module instead of creating a parallel onboarding stack. Add canonical onboarding status helpers, structured document verification records, master-only queue/actions APIs, and an Angular master onboarding tab that reads those APIs. Preserve compatibility with existing `draft`, `pending`, `activated`, `deactivated`, and Stripe subscription behavior while introducing canonical statuses.

**Tech Stack:** NestJS 10, Mongoose, Jest, Angular 16, RxJS, existing Stripe and nodemailer integration.

---

## File Structure

Backend files:

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.constants.ts`
  Defines canonical statuses, legacy status mapping, document types, verification statuses, and status groups.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.utils.ts`
  Provides pure helper functions for status normalization, required documents by company type, queue group filters, and approval eligibility.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.utils.spec.ts`
  Unit tests for pure onboarding helpers.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/dto/onboarding-action.dto.ts`
  DTOs for document verification, rejection, correction, inactivation, restore, and setup email actions.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.ts`
  Owns master queue reads and onboarding state transitions.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.spec.ts`
  Unit tests for service transitions using mocked Mongoose models and mocked email/Stripe-side dependencies.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.controller.ts`
  Exposes master onboarding endpoints.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/schema/company.schema.ts`
  Adds `onboarding` object, `deletedAt`, and `deletedBy`.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/interface/company.interface.ts`
  Adds TypeScript interfaces for onboarding metadata and document verification.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/dto/response.company.dto.ts`
  Exposes onboarding data to the master UI.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/company.module.ts`
  Registers the onboarding controller/service.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/company.service.ts`
  Delegates status logic where appropriate, writes canonical status on submit, and keeps existing emails.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/auth/auth.service.ts`
  Blocks operational login/session use for non-active company statuses while still allowing company admin setup.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/auth/jwt-strategy.ts`
  Uses the same canonical active/setup status logic as login.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/auth/jwt-socket-strategy.ts`
  Applies canonical company status blocking to socket authentication.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/payments-subscriptions/payments.controller.ts`
  Keeps existing Stripe flow but lets payment activation write canonical `active`.

Frontend files:

- Modify `C:/Prometheus-Clean/prometheus/src/app/shared/types/models.ts`
  Adds onboarding types and master queue response types.

- Modify `C:/Prometheus-Clean/prometheus/src/app/core/api/company-api.service.ts`
  Adds master onboarding API methods.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.ts`
  Master console logic.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.html`
  Four-tab master console UI.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.scss`
  Console styling.

- Modify `C:/Prometheus-Clean/prometheus/src/app/app.module.ts`
  Declares the new component.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.ts`
  Adds a master-only tab and hides operational tabs for `superadmin`.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.html`
  Renders the master console.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/auth/sign-up/sign-up.component.ts`
  Sends requested seat count and adjusts submitted-state wording.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/auth/sign-up/sign-up.component.html`
  Adds requested seats and clearer review/submitted copy.

Verification commands:

- Backend focused tests: `cd C:/Prometheus-Clean/prometheus-backend; npm test -- onboarding --runInBand`
- Backend build: `cd C:/Prometheus-Clean/prometheus-backend; npm run build`
- Frontend build: `cd C:/Prometheus-Clean/prometheus; npm run build`
- Local smoke: login as `superadmin.local@prometheus.test`, open `http://localhost:4300/workspace`, verify the master onboarding tab appears.

Git note:

- `C:/Prometheus-Clean` is not currently a git repository. Commit steps below are written for when git is restored. In this workspace, skip commit commands and keep the changed files unstaged.

---

### Task 1: Canonical Onboarding Status Helpers

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.constants.ts`
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.utils.ts`
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.utils.spec.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/company/onboarding/onboarding.utils.spec.ts`:

```ts
import {
  getQueueStatuses,
  getRequiredOnboardingDocuments,
  isCompanyOperational,
  normalizeCompanyStatus,
  canApproveOnboardingDocuments
} from "./onboarding.utils";

describe("onboarding helpers", () => {
  it("maps legacy statuses to canonical statuses", () => {
    expect(normalizeCompanyStatus("pending")).toBe("pending_review");
    expect(normalizeCompanyStatus("activated")).toBe("active");
    expect(normalizeCompanyStatus("deactivated")).toBe("inactive");
    expect(normalizeCompanyStatus("draft")).toBe("draft");
    expect(normalizeCompanyStatus("approved_waiting_setup")).toBe("approved_waiting_setup");
  });

  it("groups statuses for master tabs", () => {
    expect(getQueueStatuses("pending")).toEqual(["pending_review", "correction_needed", "pending"]);
    expect(getQueueStatuses("waitingSetup")).toEqual(["approved_waiting_setup", "unpaid"]);
    expect(getQueueStatuses("active")).toEqual(["active", "activated"]);
    expect(getQueueStatuses("inactive")).toEqual(["inactive", "deleted_pending_purge", "deactivated"]);
  });

  it("requires hazmat for carrier and both companies", () => {
    expect(getRequiredOnboardingDocuments("broker")).toEqual(["mc", "insurance"]);
    expect(getRequiredOnboardingDocuments("carrier")).toEqual(["mc", "insurance", "hazmat"]);
    expect(getRequiredOnboardingDocuments("both")).toEqual(["mc", "insurance", "hazmat"]);
  });

  it("only treats active and activated companies as operational", () => {
    expect(isCompanyOperational("active")).toBe(true);
    expect(isCompanyOperational("activated")).toBe(true);
    expect(isCompanyOperational("approved_waiting_setup")).toBe(false);
    expect(isCompanyOperational("pending_review")).toBe(false);
    expect(isCompanyOperational("inactive")).toBe(false);
  });

  it("allows approval only when required documents are verified", () => {
    const onboarding = {
      documents: {
        mc: { status: "verified" },
        insurance: { status: "verified" },
        hazmat: { status: "pending" }
      }
    };

    expect(canApproveOnboardingDocuments("broker", onboarding as any)).toEqual({
      ok: true,
      missing: [],
      rejected: []
    });

    expect(canApproveOnboardingDocuments("carrier", onboarding as any)).toEqual({
      ok: false,
      missing: ["hazmat"],
      rejected: []
    });
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.utils.spec.ts --runInBand
```

Expected:

- FAIL because `onboarding.utils` does not exist.

- [ ] **Step 3: Add status constants**

Create `src/company/onboarding/onboarding.constants.ts`:

```ts
export const COMPANY_ONBOARDING_STATUSES = {
  Draft: "draft",
  PendingReview: "pending_review",
  CorrectionNeeded: "correction_needed",
  ApprovedWaitingSetup: "approved_waiting_setup",
  Active: "active",
  Inactive: "inactive",
  DeletedPendingPurge: "deleted_pending_purge",
  Purged: "purged"
} as const;

export type CompanyOnboardingStatus =
  typeof COMPANY_ONBOARDING_STATUSES[keyof typeof COMPANY_ONBOARDING_STATUSES];

export const LEGACY_COMPANY_STATUS_MAP: Record<string, CompanyOnboardingStatus> = {
  draft: COMPANY_ONBOARDING_STATUSES.Draft,
  pending: COMPANY_ONBOARDING_STATUSES.PendingReview,
  unpaid: COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
  activated: COMPANY_ONBOARDING_STATUSES.Active,
  deactivated: COMPANY_ONBOARDING_STATUSES.Inactive
};

export const ONBOARDING_DOCUMENT_TYPES = {
  Mc: "mc",
  Insurance: "insurance",
  Hazmat: "hazmat"
} as const;

export type OnboardingDocumentType =
  typeof ONBOARDING_DOCUMENT_TYPES[keyof typeof ONBOARDING_DOCUMENT_TYPES];

export const ONBOARDING_DOCUMENT_STATUS = {
  Missing: "missing",
  Pending: "pending",
  Verified: "verified",
  Rejected: "rejected",
  Expired: "expired"
} as const;

export type OnboardingDocumentStatus =
  typeof ONBOARDING_DOCUMENT_STATUS[keyof typeof ONBOARDING_DOCUMENT_STATUS];

export const VERIFICATION_SOURCES = {
  Manual: "manual",
  Highway: "highway",
  MyCarrierPacket: "mycarrierpacket",
  Truckstop: "truckstop",
  Other: "other"
} as const;

export type VerificationSource =
  typeof VERIFICATION_SOURCES[keyof typeof VERIFICATION_SOURCES];

export type OnboardingQueueGroup = "pending" | "waitingSetup" | "active" | "inactive";
```

- [ ] **Step 4: Add pure helper functions**

Create `src/company/onboarding/onboarding.utils.ts`:

```ts
import {
  COMPANY_ONBOARDING_STATUSES,
  CompanyOnboardingStatus,
  LEGACY_COMPANY_STATUS_MAP,
  ONBOARDING_DOCUMENT_STATUS,
  OnboardingDocumentType,
  OnboardingQueueGroup
} from "./onboarding.constants";

export function normalizeCompanyStatus(status?: string | null): CompanyOnboardingStatus {
  const normalized = String(status ?? "").trim();
  if (normalized in LEGACY_COMPANY_STATUS_MAP) {
    return LEGACY_COMPANY_STATUS_MAP[normalized];
  }

  const canonical = Object.values(COMPANY_ONBOARDING_STATUSES).find((value) => value === normalized);
  return canonical ?? COMPANY_ONBOARDING_STATUSES.Draft;
}

export function getQueueStatuses(group: OnboardingQueueGroup): string[] {
  if (group === "pending") {
    return [
      COMPANY_ONBOARDING_STATUSES.PendingReview,
      COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
      "pending"
    ];
  }

  if (group === "waitingSetup") {
    return [
      COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
      "unpaid"
    ];
  }

  if (group === "active") {
    return [
      COMPANY_ONBOARDING_STATUSES.Active,
      "activated"
    ];
  }

  return [
    COMPANY_ONBOARDING_STATUSES.Inactive,
    COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
    "deactivated"
  ];
}

export function getRequiredOnboardingDocuments(companyType?: string): OnboardingDocumentType[] {
  const type = String(companyType ?? "").toLowerCase();
  if (type === "carrier" || type === "both") {
    return ["mc", "insurance", "hazmat"];
  }
  return ["mc", "insurance"];
}

export function isCompanyOperational(status?: string | null): boolean {
  return normalizeCompanyStatus(status) === COMPANY_ONBOARDING_STATUSES.Active;
}

export function isCompanyInSetup(status?: string | null): boolean {
  return normalizeCompanyStatus(status) === COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup;
}

export function canApproveOnboardingDocuments(
  companyType: string,
  onboarding: { documents?: Record<string, { status?: string }> } | null | undefined
): { ok: boolean; missing: OnboardingDocumentType[]; rejected: OnboardingDocumentType[] } {
  const documents = onboarding?.documents ?? {};
  const required = getRequiredOnboardingDocuments(companyType);
  const missing: OnboardingDocumentType[] = [];
  const rejected: OnboardingDocumentType[] = [];

  required.forEach((documentType) => {
    const status = documents[documentType]?.status;
    if (status === ONBOARDING_DOCUMENT_STATUS.Rejected) {
      rejected.push(documentType);
      return;
    }

    if (status !== ONBOARDING_DOCUMENT_STATUS.Verified) {
      missing.push(documentType);
    }
  });

  return {
    ok: missing.length === 0 && rejected.length === 0,
    missing,
    rejected
  };
}
```

- [ ] **Step 5: Run helper tests and verify pass**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.utils.spec.ts --runInBand
```

Expected:

- PASS for `onboarding.utils.spec.ts`.

- [ ] **Step 6: Commit helper changes when git is restored**

If git exists in this workspace later:

```powershell
git add src/company/onboarding/onboarding.constants.ts src/company/onboarding/onboarding.utils.ts src/company/onboarding/onboarding.utils.spec.ts
git commit -m "feat: add company onboarding status helpers"
```

---

### Task 2: Extend Company Data Model

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/interface/company.interface.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/schema/company.schema.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/dto/response.company.dto.ts`

- [ ] **Step 1: Add TypeScript interfaces**

Modify `src/company/interface/company.interface.ts` to include these exported types above `export interface Company extends Document`:

```ts
export interface OnboardingProviderReference {
  provider: string;
  externalId?: string;
  rawStatus?: string;
  lastSyncedAt?: Date;
}

export interface OnboardingDocumentVerification {
  fileType: "mc" | "insurance" | "hazmat";
  displayName: string;
  fileName?: string;
  ext?: string;
  source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
  status: "missing" | "pending" | "verified" | "rejected" | "expired";
  expirationDate?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  notes?: string;
  providerReference?: OnboardingProviderReference;
}

export interface OnboardingState {
  status?: string;
  submittedAt?: Date;
  approvedAt?: Date;
  approvedBy?: string;
  correctionRequestedAt?: Date;
  correctionRequestedBy?: string;
  setupEmailSentAt?: Date;
  requestedSeats?: number;
  previousStatus?: string;
  verificationSummary?: {
    source: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
    status: "pending" | "verified" | "rejected" | "expired";
    checkedAt?: Date;
    checkedBy?: string;
  };
  documents?: {
    mc?: OnboardingDocumentVerification;
    insurance?: OnboardingDocumentVerification;
    hazmat?: OnboardingDocumentVerification;
  };
}
```

Then add these fields to `Company`:

```ts
onboarding?: OnboardingState;
deletedAt?: Date;
deletedBy?: string;
```

- [ ] **Step 2: Extend the Mongoose schema**

Modify `src/company/schema/company.schema.ts` and add this inside the schema field object near `subscription`:

```ts
    onboarding: {
      status: String,
      submittedAt: Date,
      approvedAt: Date,
      approvedBy: String,
      correctionRequestedAt: Date,
      correctionRequestedBy: String,
      setupEmailSentAt: Date,
      requestedSeats: Number,
      previousStatus: String,
      verificationSummary: {
        source: String,
        status: String,
        checkedAt: Date,
        checkedBy: String
      },
      documents: {
        mc: Object,
        insurance: Object,
        hazmat: Object
      }
    },
    deletedAt: Date,
    deletedBy: String,
```

Add indexes after schema creation:

```ts
CompanySchema.index({ status: 1, createdAt: -1 });
CompanySchema.index({ "onboarding.status": 1, createdAt: -1 });
CompanySchema.index({ deletedAt: 1 });
```

- [ ] **Step 3: Expose onboarding in company responses**

Modify `src/company/dto/response.company.dto.ts` and add:

```ts
  @ApiResponseProperty()
  @Expose()
  readonly onboarding:any;

  @ApiResponseProperty()
  @Expose()
  readonly deletedAt?: Date;

  @ApiResponseProperty()
  @Expose()
  readonly deletedBy?: string;
```

- [ ] **Step 4: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
```

Expected:

- PASS TypeScript build.

- [ ] **Step 5: Commit model changes when git is restored**

If git exists later:

```powershell
git add src/company/interface/company.interface.ts src/company/schema/company.schema.ts src/company/dto/response.company.dto.ts
git commit -m "feat: extend company onboarding model"
```

---

### Task 3: DTOs for Master Onboarding Actions

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/dto/onboarding-action.dto.ts`

- [ ] **Step 1: Create DTO file**

Create `src/company/onboarding/dto/onboarding-action.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

const verificationSources = ["manual", "highway", "mycarrierpacket", "truckstop", "other"];
const restoreStatuses = ["pending_review", "approved_waiting_setup", "active", "inactive"];

export class VerifyOnboardingDocumentDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  readonly expirationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly notes?: string;

  @ApiPropertyOptional({ enum: verificationSources })
  @IsOptional()
  @IsIn(verificationSources)
  readonly source?: "manual" | "highway" | "mycarrierpacket" | "truckstop" | "other";
}

export class RejectOnboardingDocumentDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly notes?: string;
}

export class RequestCorrectionDTO {
  @ApiProperty()
  @IsString()
  readonly message: string;
}

export class InactivateCompanyDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;
}

export class RestoreCompanyDTO {
  @ApiProperty({ enum: restoreStatuses })
  @IsIn(restoreStatuses)
  readonly status: "pending_review" | "approved_waiting_setup" | "active" | "inactive";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readonly reason?: string;
}

export class SoftDeleteCompanyDTO {
  @ApiProperty()
  @IsString()
  readonly reason: string;
}

export class ResendSetupEmailDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  readonly includeContactPerson?: boolean;
}

export class SubmitCompanyOnboardingDTO {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  readonly requestedSeats?: number;
}
```

- [ ] **Step 2: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
```

Expected:

- PASS TypeScript build.

- [ ] **Step 3: Commit DTO changes when git is restored**

If git exists later:

```powershell
git add src/company/onboarding/dto/onboarding-action.dto.ts
git commit -m "feat: add onboarding action DTOs"
```

---

### Task 4: Onboarding Service Queue and Detail Reads

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.ts`
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.spec.ts`

- [ ] **Step 1: Write failing queue tests**

Create `src/company/onboarding/onboarding.service.spec.ts` with this starting test suite:

```ts
import { OnboardingService } from "./onboarding.service";

describe("OnboardingService", () => {
  const companyModel: any = {
    find: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn()
  };
  const userModel: any = {
    deleteMany: jest.fn(),
    updateMany: jest.fn()
  };
  const historyModel: any = {
    findOneAndUpdate: jest.fn(),
    create: jest.fn()
  };
  const configService: any = {
    get: jest.fn((key: string) => {
      const values = {
        PROJECT_NAME: "Prometheus",
        APP_URL: "http://localhost:4300",
        MAIL_HOST: "localhost",
        MAIL_PORT: "1025",
        MAIL_PORT_SECURE: "0",
        MAIL_USER: "prometheus@local.test",
        MAIL_PASSWORD: ""
      };
      return values[key];
    })
  };

  function createService() {
    return new OnboardingService(companyModel, userModel, historyModel, configService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads companies by queue group", async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: "company-1", status: "pending_review" }]);
    const sort = jest.fn(() => ({ lean }));
    companyModel.find.mockReturnValue({ sort });

    const result = await createService().getQueue("pending");

    expect(companyModel.find).toHaveBeenCalledWith({
      status: { $in: ["pending_review", "correction_needed", "pending"] },
      deletedAt: { $exists: false }
    });
    expect(sort).toHaveBeenCalledWith({ isWaiting: -1, createdAt: -1 });
    expect(result).toEqual([{ _id: "company-1", status: "pending_review" }]);
  });

  it("loads a single onboarding detail", async () => {
    const lean = jest.fn().mockResolvedValue({ _id: "company-1", status: "pending_review" });
    companyModel.findById.mockReturnValue({ lean });

    const result = await createService().getDetail("company-1");

    expect(companyModel.findById).toHaveBeenCalledWith("company-1");
    expect(result).toEqual({ _id: "company-1", status: "pending_review" });
  });
});
```

- [ ] **Step 2: Run tests and verify fail**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.service.spec.ts --runInBand
```

Expected:

- FAIL because `onboarding.service` does not exist.

- [ ] **Step 3: Implement queue and detail service methods**

Create `src/company/onboarding/onboarding.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as nodemailer from "nodemailer";
import { History } from "../interface/history.interface";
import { Company } from "../interface/company.interface";
import { User } from "src/user/interface/user.interface";
import {
  COMPANY_ONBOARDING_STATUSES,
  ONBOARDING_DOCUMENT_STATUS,
  OnboardingDocumentType,
  OnboardingQueueGroup,
  VERIFICATION_SOURCES
} from "./onboarding.constants";
import {
  canApproveOnboardingDocuments,
  getQueueStatuses
} from "./onboarding.utils";
import {
  InactivateCompanyDTO,
  RejectOnboardingDocumentDTO,
  RequestCorrectionDTO,
  RestoreCompanyDTO,
  SoftDeleteCompanyDTO,
  VerifyOnboardingDocumentDTO
} from "./dto/onboarding-action.dto";

@Injectable()
export class OnboardingService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("User") private readonly userModel: Model<User>,
    @InjectModel("History") private readonly historyModel: Model<History>,
    private readonly configService: ConfigService
  ) {}

  async getQueue(group: OnboardingQueueGroup) {
    return this.companyModel
      .find({
        status: { $in: getQueueStatuses(group) },
        deletedAt: { $exists: false }
      })
      .sort({ isWaiting: -1, createdAt: -1 })
      .lean();
  }

  async getDetail(companyId: string) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }
    return company;
  }

  private async appendAudit(companyId: string, actor: any, action: string, text: string, metadata: Record<string, unknown> = {}) {
    const entry = {
      mail: actor?.email ?? "system",
      operation: text,
      action,
      metadata,
      date: new Date()
    };
    await this.historyModel.findOneAndUpdate(
      { companyId: companyId.toString() },
      { $push: { history: entry } },
      { upsert: true, new: true }
    );
  }

  private buildDocumentPath(documentType: OnboardingDocumentType): string {
    if (documentType === "insurance") return "onboarding.documents.insurance";
    if (documentType === "hazmat") return "onboarding.documents.hazmat";
    return "onboarding.documents.mc";
  }

  private async sendEmail(targetEmail: string[], emailSubject: string, htmlContent: string) {
    const transporter = nodemailer.createTransport({
      host: this.configService.get<string>("MAIL_HOST"),
      port: +this.configService.get<string>("MAIL_PORT"),
      pool: true,
      secure: !!+this.configService.get<string>("MAIL_PORT_SECURE"),
      auth: {
        user: this.configService.get<string>("MAIL_USER"),
        pass: this.configService.get<string>("MAIL_PASSWORD")
      },
      tls: { rejectUnauthorized: false }
    });

    try {
      await transporter.sendMail({
        from: `${this.configService.get<string>("PROJECT_NAME")} <${this.configService.get<string>("MAIL_USER")}>`,
        to: targetEmail,
        subject: emailSubject,
        html: htmlContent
      });
    } catch (error) {
      console.log("Onboarding email not sent: ", targetEmail, error);
    }
  }
}
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.service.spec.ts --runInBand
```

Expected:

- PASS for queue/detail tests.

- [ ] **Step 5: Commit service read changes when git is restored**

If git exists later:

```powershell
git add src/company/onboarding/onboarding.service.ts src/company/onboarding/onboarding.service.spec.ts
git commit -m "feat: add onboarding queue service"
```

---

### Task 5: Document Verify and Reject Transitions

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.spec.ts`

- [ ] **Step 1: Add failing tests for document transitions**

Append to `onboarding.service.spec.ts`:

```ts
  it("marks an onboarding document verified", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-1",
      onboarding: { documents: { mc: { status: "verified" } } }
    });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    const result = await createService().verifyDocument(
      "company-1",
      "mc",
      { expirationDate: "2027-04-28", notes: "Matched FMCSA record.", source: "manual" },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "onboarding.documents.mc.status": "verified",
          "onboarding.documents.mc.source": "manual",
          "onboarding.documents.mc.expirationDate": new Date("2027-04-28")
        })
      }),
      { new: true }
    );
    expect(result.onboarding.documents.mc.status).toBe("verified");
  });

  it("marks an onboarding document rejected", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({
      _id: "company-1",
      onboarding: { documents: { insurance: { status: "rejected" } } }
    });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    await createService().rejectDocument(
      "company-1",
      "insurance",
      { reason: "Insured name does not match company.", notes: "Ask for corrected COI." },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "onboarding.documents.insurance.status": "rejected",
          "onboarding.documents.insurance.rejectionReason": "Insured name does not match company."
        })
      }),
      { new: true }
    );
  });
```

- [ ] **Step 2: Run tests and verify fail**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.service.spec.ts --runInBand
```

Expected:

- FAIL because `verifyDocument` and `rejectDocument` are not implemented.

- [ ] **Step 3: Implement `verifyDocument` and `rejectDocument`**

Add these public methods inside `OnboardingService`:

```ts
  async verifyDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    data: VerifyOnboardingDocumentDTO,
    actor: any
  ) {
    const path = this.buildDocumentPath(documentType);
    const now = new Date();
    const displayName = documentType === "mc"
      ? "MC authority"
      : documentType === "insurance"
        ? "Insurance certificate"
        : "HAZMAT authority";

    const update = {
      $set: {
        [`${path}.fileType`]: documentType,
        [`${path}.displayName`]: displayName,
        [`${path}.source`]: data.source ?? VERIFICATION_SOURCES.Manual,
        [`${path}.status`]: ONBOARDING_DOCUMENT_STATUS.Verified,
        [`${path}.expirationDate`]: data.expirationDate ? new Date(data.expirationDate) : undefined,
        [`${path}.verifiedAt`]: now,
        [`${path}.verifiedBy`]: actor?._id?.toString?.() ?? actor?.id ?? "system",
        [`${path}.notes`]: data.notes ?? ""
      },
      $push: {
        notes: {
          text: `${displayName} verified by ${actor?.firstName ?? "Master"} ${actor?.lastName ?? ""}`.trim(),
          type: "action",
          date: now
        }
      }
    };

    const company = await this.companyModel.findOneAndUpdate({ _id: companyId }, update, { new: true });
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "document_verified", `${displayName} marked verified.`, { documentType });
    return company;
  }

  async rejectDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    data: RejectOnboardingDocumentDTO,
    actor: any
  ) {
    const path = this.buildDocumentPath(documentType);
    const now = new Date();
    const displayName = documentType === "mc"
      ? "MC authority"
      : documentType === "insurance"
        ? "Insurance certificate"
        : "HAZMAT authority";

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          [`${path}.fileType`]: documentType,
          [`${path}.displayName`]: displayName,
          [`${path}.source`]: VERIFICATION_SOURCES.Manual,
          [`${path}.status`]: ONBOARDING_DOCUMENT_STATUS.Rejected,
          [`${path}.rejectedAt`]: now,
          [`${path}.rejectedBy`]: actor?._id?.toString?.() ?? actor?.id ?? "system",
          [`${path}.rejectionReason`]: data.reason,
          [`${path}.notes`]: data.notes ?? ""
        },
        $push: {
          notes: {
            text: `${displayName} rejected: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "document_rejected", `${displayName} rejected.`, { documentType, reason: data.reason });
    return company;
  }
```

- [ ] **Step 4: Run document transition tests**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.service.spec.ts --runInBand
```

Expected:

- PASS for document transition tests.

- [ ] **Step 5: Commit document transition changes when git is restored**

If git exists later:

```powershell
git add src/company/onboarding/onboarding.service.ts src/company/onboarding/onboarding.service.spec.ts
git commit -m "feat: add onboarding document review actions"
```

---

### Task 6: Submit, Approve, Correction, Inactive, Restore, and Delete Transitions

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.service.spec.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/company.service.ts`

- [ ] **Step 1: Add failing tests for approval and correction**

Append tests to `onboarding.service.spec.ts`:

```ts
  it("approves paperwork when required documents are verified", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      name: "Lakefront Carrier",
      email: "ops@lakefront.test",
      type: "broker",
      contactPerson: { email: "owner@lakefront.test" },
      onboarding: {
        documents: {
          mc: { status: "verified" },
          insurance: { status: "verified" }
        }
      }
    });
    companyModel.findOneAndUpdate.mockResolvedValue({ _id: "company-1", status: "approved_waiting_setup" });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    const result = await createService().approvePaperwork("company-1", {
      _id: "master-1",
      email: "master@prometheus.test",
      firstName: "Master",
      lastName: "User"
    });

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "approved_waiting_setup",
          "onboarding.status": "approved_waiting_setup",
          "onboarding.approvedBy": "master-1"
        })
      }),
      { new: true }
    );
    expect(result.status).toBe("approved_waiting_setup");
  });

  it("blocks paperwork approval when required documents are missing", async () => {
    companyModel.findById.mockResolvedValue({
      _id: "company-1",
      type: "carrier",
      onboarding: {
        documents: {
          mc: { status: "verified" },
          insurance: { status: "verified" }
        }
      }
    });

    await expect(createService().approvePaperwork("company-1", { _id: "master-1" }))
      .rejects
      .toThrow("Cannot approve company. Missing or unverified documents: hazmat.");
  });

  it("requests correction and moves company to correction_needed", async () => {
    companyModel.findOneAndUpdate.mockResolvedValue({ _id: "company-1", status: "correction_needed" });
    historyModel.findOneAndUpdate.mockResolvedValue({});

    await createService().requestCorrection(
      "company-1",
      { message: "Please upload a corrected insurance certificate." },
      { _id: "master-1", email: "master@prometheus.test", firstName: "Master", lastName: "User" }
    );

    expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "company-1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "correction_needed",
          "onboarding.status": "correction_needed",
          "onboarding.correctionRequestedBy": "master-1"
        })
      }),
      { new: true }
    );
  });
```

- [ ] **Step 2: Implement transition methods**

Add these public methods to `OnboardingService`:

```ts
  async submitForReview(companyId: string, requestedSeats = 1) {
    const now = new Date();
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.PendingReview,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.PendingReview,
          "onboarding.submittedAt": now,
          "onboarding.requestedSeats": requestedSeats
        },
        $push: {
          notes: {
            text: "Company submitted onboarding request.",
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, { email: company.email }, "onboarding_submitted", "Company submitted onboarding request.", { requestedSeats });
    return company;
  }

  async approvePaperwork(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const approval = canApproveOnboardingDocuments(company.type, company.onboarding as any);
    if (!approval.ok) {
      const missing = [...approval.missing, ...approval.rejected].join(", ");
      throw new BadRequestException(`Cannot approve company. Missing or unverified documents: ${missing}.`);
    }

    const now = new Date();
    const actorId = actor?._id?.toString?.() ?? actor?.id ?? "system";
    const updated = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.ApprovedWaitingSetup,
          "onboarding.approvedAt": now,
          "onboarding.approvedBy": actorId,
          "onboarding.setupEmailSentAt": now,
          "onboarding.verificationSummary": {
            source: VERIFICATION_SOURCES.Manual,
            status: ONBOARDING_DOCUMENT_STATUS.Verified,
            checkedAt: now,
            checkedBy: actorId
          }
        },
        $push: {
          notes: {
            text: "Company paperwork approved. Waiting for payment/setup.",
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.appendAudit(companyId, actor, "paperwork_approved", "Company paperwork approved.", {});
    await this.sendSetupEmail(updated as any);
    return updated;
  }

  async requestCorrection(companyId: string, data: RequestCorrectionDTO, actor: any) {
    const now = new Date();
    const actorId = actor?._id?.toString?.() ?? actor?.id ?? "system";
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.CorrectionNeeded,
          "onboarding.correctionRequestedAt": now,
          "onboarding.correctionRequestedBy": actorId
        },
        $push: {
          notes: {
            text: `Correction requested: ${data.message}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "correction_requested", data.message, {});
    await this.sendCorrectionEmail(company as any, data.message);
    return company;
  }

  async inactivateCompany(companyId: string, data: InactivateCompanyDTO, actor: any) {
    const now = new Date();
    const current = await this.companyModel.findById(companyId).lean();
    if (!current) {
      throw new NotFoundException("Company not found.");
    }

    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.Inactive,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.Inactive,
          "onboarding.previousStatus": current.status,
          deactivationReason: data.reason
        },
        $push: {
          notes: {
            text: `Company moved inactive: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.userModel.updateMany({ companyId }, { $set: { isActive: false } });
    await this.appendAudit(companyId, actor, "company_inactivated", data.reason, {});
    return company;
  }

  async restoreCompany(companyId: string, data: RestoreCompanyDTO, actor: any) {
    const now = new Date();
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: data.status,
          "onboarding.status": data.status,
          deactivationReason: "",
          deletedAt: null,
          deletedBy: null
        },
        $push: {
          notes: {
            text: `Company restored to ${data.status}${data.reason ? `: ${data.reason}` : ""}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.appendAudit(companyId, actor, "company_restored", `Company restored to ${data.status}.`, { reason: data.reason ?? "" });
    return company;
  }

  async softDeleteCompany(companyId: string, data: SoftDeleteCompanyDTO, actor: any) {
    const now = new Date();
    const current = await this.companyModel.findById(companyId).lean();
    if (!current) {
      throw new NotFoundException("Company not found.");
    }

    const actorId = actor?._id?.toString?.() ?? actor?.id ?? "system";
    const company = await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: {
          status: COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
          "onboarding.status": COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge,
          "onboarding.previousStatus": current.status,
          deletedAt: now,
          deletedBy: actorId,
          deactivationReason: data.reason
        },
        $push: {
          notes: {
            text: `Company soft-deleted: ${data.reason}`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    await this.userModel.updateMany({ companyId }, { $set: { isActive: false } });
    await this.appendAudit(companyId, actor, "company_soft_deleted", data.reason, {});
    return company;
  }

  async purgeCompany(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    if (company.status !== COMPANY_ONBOARDING_STATUSES.DeletedPendingPurge) {
      throw new BadRequestException("Company must be soft-deleted before permanent deletion.");
    }

    await this.appendAudit(companyId, actor, "company_purged", "Company permanently deleted.", { companyName: company.name });
    await this.userModel.deleteMany({ companyId });
    await this.companyModel.findByIdAndDelete(companyId);
    fs.rmSync(`files/${companyId}`, { recursive: true, force: true });
    return { result: "OK" };
  }
```

Add these private email methods to `OnboardingService`:

```ts
  private async sendSetupEmail(company: any) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const recipients = [company.email, company.contactPerson?.email].filter(Boolean);
    const html = `Dear ${company.contactPerson?.firstName ?? company.name},<br><br>
Your company paperwork has been approved for ${projectName}. Please open ${appUrl} to complete payment and company setup.<br><br>
Best regards,<br>${projectName}`;
    await this.sendEmail(recipients, `${projectName}: Company Approved`, html);
  }

  private async sendCorrectionEmail(company: any, message: string) {
    const appUrl = this.configService.get<string>("APP_URL") || "http://localhost:4300";
    const projectName = this.configService.get<string>("PROJECT_NAME") || "Prometheus";
    const recipients = [company.email, company.contactPerson?.email].filter(Boolean);
    const html = `Dear ${company.contactPerson?.firstName ?? company.name},<br><br>
Your ${projectName} onboarding needs a correction:<br><br>
${message}<br><br>
Open ${appUrl} to update the paperwork.<br><br>
Best regards,<br>${projectName}`;
    await this.sendEmail(recipients, `${projectName}: Onboarding Correction Needed`, html);
  }
```

- [ ] **Step 3: Update existing pending submit to use canonical service or equivalent logic**

Modify `CompanyService.changeCompanyStatus` behavior for `pending` or modify `CompanyController.changeStatusPending` later to call `OnboardingService.submitForReview`.

For this task, change `CompanyService.changeCompanyStatus` when `status === "pending"` to write canonical data:

```ts
      if (status === "pending") {
        status = "pending_review";
        let supervisors = await this.UserModel.find({ role: "supervisor" });
        let mails = supervisors.map((x) => x.email);
        this.sendMailToSupervisors(mails);
      }
```

In the final `findOneAndUpdate` body, add:

```ts
          "onboarding.status": status,
          "onboarding.submittedAt": status === "pending_review" ? new Date() : company.onboarding?.submittedAt
```

- [ ] **Step 4: Run service tests**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding.service.spec.ts --runInBand
```

Expected:

- PASS for approval/correction tests.

- [ ] **Step 5: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
```

Expected:

- PASS TypeScript build.

- [ ] **Step 6: Commit transition changes when git is restored**

If git exists later:

```powershell
git add src/company/onboarding/onboarding.service.ts src/company/onboarding/onboarding.service.spec.ts src/company/company.service.ts
git commit -m "feat: add onboarding state transitions"
```

---

### Task 7: Master Onboarding Controller and Module Registration

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/onboarding/onboarding.controller.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/company.module.ts`

- [ ] **Step 1: Create controller**

Create `src/company/onboarding/onboarding.controller.ts`:

```ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from "@nestjs/common";
import { Roles } from "src/shared/decorators/roles.decorator";
import { OnboardingService } from "./onboarding.service";
import { OnboardingDocumentType, OnboardingQueueGroup } from "./onboarding.constants";
import {
  InactivateCompanyDTO,
  RejectOnboardingDocumentDTO,
  RequestCorrectionDTO,
  RestoreCompanyDTO,
  SoftDeleteCompanyDTO,
  VerifyOnboardingDocumentDTO
} from "./dto/onboarding-action.dto";

@Controller("company/onboarding")
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get("queue/:group")
  @Roles("superadmin", "supervisor")
  getQueue(@Param("group") group: OnboardingQueueGroup) {
    return this.service.getQueue(group);
  }

  @Get(":companyId")
  @Roles("superadmin", "supervisor")
  getDetail(@Param("companyId") companyId: string) {
    return this.service.getDetail(companyId);
  }

  @Patch(":companyId/document/:documentType/verify")
  @Roles("superadmin", "supervisor")
  verifyDocument(
    @Param("companyId") companyId: string,
    @Param("documentType") documentType: OnboardingDocumentType,
    @Body() data: VerifyOnboardingDocumentDTO,
    @Req() req
  ) {
    return this.service.verifyDocument(companyId, documentType, data, req.user);
  }

  @Patch(":companyId/document/:documentType/reject")
  @Roles("superadmin", "supervisor")
  rejectDocument(
    @Param("companyId") companyId: string,
    @Param("documentType") documentType: OnboardingDocumentType,
    @Body() data: RejectOnboardingDocumentDTO,
    @Req() req
  ) {
    return this.service.rejectDocument(companyId, documentType, data, req.user);
  }

  @Patch(":companyId/request-correction")
  @Roles("superadmin", "supervisor")
  requestCorrection(@Param("companyId") companyId: string, @Body() data: RequestCorrectionDTO, @Req() req) {
    return this.service.requestCorrection(companyId, data, req.user);
  }

  @Patch(":companyId/approve-paperwork")
  @Roles("superadmin")
  approvePaperwork(@Param("companyId") companyId: string, @Req() req) {
    return this.service.approvePaperwork(companyId, req.user);
  }

  @Patch(":companyId/inactivate")
  @Roles("superadmin")
  inactivateCompany(@Param("companyId") companyId: string, @Body() data: InactivateCompanyDTO, @Req() req) {
    return this.service.inactivateCompany(companyId, data, req.user);
  }

  @Patch(":companyId/restore")
  @Roles("superadmin")
  restoreCompany(@Param("companyId") companyId: string, @Body() data: RestoreCompanyDTO, @Req() req) {
    return this.service.restoreCompany(companyId, data, req.user);
  }

  @Patch(":companyId/soft-delete")
  @Roles("superadmin")
  softDeleteCompany(@Param("companyId") companyId: string, @Body() data: SoftDeleteCompanyDTO, @Req() req) {
    return this.service.softDeleteCompany(companyId, data, req.user);
  }

  @Delete(":companyId/purge")
  @Roles("superadmin")
  @HttpCode(HttpStatus.OK)
  purgeCompany(@Param("companyId") companyId: string, @Req() req) {
    return this.service.purgeCompany(companyId, req.user);
  }

  @Post(":companyId/resend-setup-email")
  @Roles("superadmin", "supervisor")
  resendSetupEmail(@Param("companyId") companyId: string, @Req() req) {
    return this.service.resendSetupEmail(companyId, req.user);
  }
}
```

- [ ] **Step 2: Add resend setup method**

Add to `OnboardingService`:

```ts
  async resendSetupEmail(companyId: string, actor: any) {
    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    await this.sendSetupEmail(company as any);
    await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        $set: { "onboarding.setupEmailSentAt": new Date() },
        $push: {
          notes: {
            text: "Setup email resent.",
            type: "action",
            date: new Date()
          }
        }
      },
      { new: true }
    );
    await this.appendAudit(companyId, actor, "setup_email_resent", "Setup email resent.", {});
    return { result: "OK" };
  }
```

- [ ] **Step 3: Register controller and service**

Modify `src/company/company.module.ts`:

```ts
import { OnboardingController } from "./onboarding/onboarding.controller";
import { OnboardingService } from "./onboarding/onboarding.service";
```

Change module metadata:

```ts
  controllers: [CompanyController, OnboardingController],
  providers: [CompanyService, OnboardingService],
  exports: [CompanyService, OnboardingService]
```

- [ ] **Step 4: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
```

Expected:

- PASS TypeScript build.

- [ ] **Step 5: Commit controller changes when git is restored**

If git exists later:

```powershell
git add src/company/onboarding/onboarding.controller.ts src/company/onboarding/onboarding.service.ts src/company/company.module.ts
git commit -m "feat: expose master onboarding APIs"
```

---

### Task 8: Auth and Payment Status Compatibility

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/auth/auth.service.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/auth/jwt-strategy.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/auth/jwt-socket-strategy.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/company.service.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/payments-subscriptions/payments.controller.ts`

- [ ] **Step 1: Import helpers in auth files**

Add to each auth strategy/service file that checks company status:

```ts
import { isCompanyOperational } from "src/company/onboarding/onboarding.utils";
```

- [ ] **Step 2: Replace legacy status checks**

In `auth.service.ts`, replace this logic:

```ts
          if (company.status !== 'draft' && company.status !== 'pending') {
            let endPeriod = new Date(company.subscription.endPeriod);
            let today = new Date();
            if ((company.status === "deactivated" || today.getTime() > endPeriod.getTime())) {
              throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
            }
          }
```

With:

```ts
          if (!isCompanyOperational(company.status)) {
            throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
          }
          let endPeriod = new Date(company.subscription?.endPeriod);
          let today = new Date();
          if (Number.isFinite(endPeriod.getTime()) && today.getTime() > endPeriod.getTime()) {
            throw new NotFoundException(Messages.IncorrectNickNameOrPassword);
          }
```

Apply the same canonical operational check in `jwt-strategy.ts` and `jwt-socket-strategy.ts`.

- [ ] **Step 3: Keep setup access separate from operational login**

If the current frontend needs company admin to sign in before payment while company is `approved_waiting_setup`, add a setup-specific exception in `auth.service.ts`:

```ts
          if (user.role === "admin" && company.status === "approved_waiting_setup") {
            return true;
          }
```

Place this before the `!isCompanyOperational(company.status)` rejection in both `checkLogin` and `login`.

- [ ] **Step 4: Update Stripe activation to canonical `active`**

In `CompanyService.updateSubscription`, change:

```ts
          status: "activated",
```

To:

```ts
          status: "active",
          "onboarding.status": "active",
```

In `CompanyService.failedSubscription`, change:

```ts
await this.CompanyModel.findOneAndUpdate({ "subscription.customer": customerId },{status:'deactivated'});
```

To:

```ts
await this.CompanyModel.findOneAndUpdate(
  { "subscription.customer": customerId },
  {
    status: "inactive",
    "onboarding.status": "inactive",
    deactivationReason: "Payment failed"
  }
);
```

- [ ] **Step 5: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
```

Expected:

- PASS TypeScript build.

- [ ] **Step 6: Commit compatibility changes when git is restored**

If git exists later:

```powershell
git add src/auth/auth.service.ts src/auth/jwt-strategy.ts src/auth/jwt-socket-strategy.ts src/company/company.service.ts src/payments-subscriptions/payments.controller.ts
git commit -m "feat: enforce canonical company onboarding access"
```

---

### Task 9: Frontend Types and API Client

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus/src/app/shared/types/models.ts`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/core/api/company-api.service.ts`

- [ ] **Step 1: Add frontend onboarding types**

Append to `src/app/shared/types/models.ts`:

```ts
export type CompanyOnboardingStatus =
  | 'draft'
  | 'pending_review'
  | 'correction_needed'
  | 'approved_waiting_setup'
  | 'active'
  | 'inactive'
  | 'deleted_pending_purge'
  | 'purged'
  | string;

export type OnboardingQueueGroup = 'pending' | 'waitingSetup' | 'active' | 'inactive';
export type OnboardingDocumentType = 'mc' | 'insurance' | 'hazmat';
export type OnboardingDocumentStatus = 'missing' | 'pending' | 'verified' | 'rejected' | 'expired' | string;

export interface OnboardingDocumentVerification {
  fileType?: OnboardingDocumentType;
  displayName?: string;
  fileName?: string;
  ext?: string;
  source?: 'manual' | 'highway' | 'mycarrierpacket' | 'truckstop' | 'other' | string;
  status?: OnboardingDocumentStatus;
  expirationDate?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
}

export interface CompanyOnboardingState {
  status?: CompanyOnboardingStatus;
  submittedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  correctionRequestedAt?: string | null;
  correctionRequestedBy?: string | null;
  setupEmailSentAt?: string | null;
  requestedSeats?: number | null;
  previousStatus?: string | null;
  verificationSummary?: {
    source?: string;
    status?: string;
    checkedAt?: string | null;
    checkedBy?: string | null;
  };
  documents?: Partial<Record<OnboardingDocumentType, OnboardingDocumentVerification>>;
}

export interface OnboardingCompany extends CompanyDraft {
  _id: string;
  adminId?: string | null;
  clientId?: string | null;
  status: CompanyOnboardingStatus;
  statusReason?: string | null;
  deactivationReason?: string | null;
  subscription?: Record<string, unknown>;
  filesUploaded?: boolean;
  isWaiting?: boolean;
  notes?: Array<Record<string, unknown>>;
  onboarding?: CompanyOnboardingState;
  activeUsers?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}
```

- [ ] **Step 2: Add API methods**

Modify `src/app/core/api/company-api.service.ts` imports:

```ts
import { CompanyDraft, OnboardingCompany, OnboardingDocumentType, OnboardingQueueGroup, StateOption } from '../../shared/types/models';
```

Add methods:

```ts
  getOnboardingQueue(group: OnboardingQueueGroup): Observable<OnboardingCompany[]> {
    return this.http.get<OnboardingCompany[]>(`company/onboarding/queue/${group}`);
  }

  getOnboardingCompany(companyId: string): Observable<OnboardingCompany> {
    return this.http.get<OnboardingCompany>(`company/onboarding/${companyId}`);
  }

  verifyOnboardingDocument(companyId: string, documentType: OnboardingDocumentType, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/document/${documentType}/verify`, payload);
  }

  rejectOnboardingDocument(companyId: string, documentType: OnboardingDocumentType, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/document/${documentType}/reject`, payload);
  }

  requestOnboardingCorrection(companyId: string, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/request-correction`, payload);
  }

  approveOnboardingPaperwork(companyId: string): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/approve-paperwork`, {});
  }

  inactivateOnboardingCompany(companyId: string, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/inactivate`, payload);
  }

  restoreOnboardingCompany(companyId: string, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/restore`, payload);
  }

  softDeleteOnboardingCompany(companyId: string, payload: unknown): Observable<OnboardingCompany> {
    return this.http.patch<OnboardingCompany>(`company/onboarding/${companyId}/soft-delete`, payload);
  }

  purgeOnboardingCompany(companyId: string): Observable<{ result: string }> {
    return this.http.delete<{ result: string }>(`company/onboarding/${companyId}/purge`);
  }

  resendSetupEmail(companyId: string): Observable<{ result: string }> {
    return this.http.post<{ result: string }>(`company/onboarding/${companyId}/resend-setup-email`, {});
  }
```

- [ ] **Step 3: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
npm run build
```

Expected:

- PASS Angular build.

- [ ] **Step 4: Commit frontend API changes when git is restored**

If git exists later:

```powershell
git add src/app/shared/types/models.ts src/app/core/api/company-api.service.ts
git commit -m "feat: add onboarding frontend API types"
```

---

### Task 10: Master Onboarding Console Component

**Files:**
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.ts`
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.html`
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/master-onboarding-console/master-onboarding-console.component.scss`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/app.module.ts`

- [ ] **Step 1: Create component TypeScript**

Create `master-onboarding-console.component.ts`:

```ts
import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { OnboardingCompany, OnboardingDocumentType, OnboardingQueueGroup } from '../../../shared/types/models';

type QueueTab = {
  id: OnboardingQueueGroup;
  label: string;
  empty: string;
};

const QUEUE_TABS: QueueTab[] = [
  { id: 'pending', label: 'Pending paperwork', empty: 'No companies are waiting for paperwork review.' },
  { id: 'waitingSetup', label: 'Waiting setup', empty: 'No approved companies are waiting for setup.' },
  { id: 'active', label: 'Active', empty: 'No active companies found.' },
  { id: 'inactive', label: 'Inactive / deleted', empty: 'No inactive or deleted companies found.' },
];

@Component({
  selector: 'app-master-onboarding-console',
  templateUrl: './master-onboarding-console.component.html',
  styleUrls: ['./master-onboarding-console.component.scss'],
})
export class MasterOnboardingConsoleComponent implements OnInit {
  readonly tabs = QUEUE_TABS;
  readonly documentTypes: OnboardingDocumentType[] = ['mc', 'insurance', 'hazmat'];

  activeTab: OnboardingQueueGroup = 'pending';
  companies: OnboardingCompany[] = [];
  selectedCompany: OnboardingCompany | null = null;
  loading = false;
  actionPending = false;
  error = '';
  message = '';
  correctionMessage = '';
  inactiveReason = '';
  deleteReason = '';
  restoreStatus = 'pending_review';
  documentExpiration: Partial<Record<OnboardingDocumentType, string>> = {};
  documentNotes: Partial<Record<OnboardingDocumentType, string>> = {};
  rejectReasons: Partial<Record<OnboardingDocumentType, string>> = {};

  constructor(private readonly companyApi: CompanyApiService) {}

  ngOnInit(): void {
    this.loadQueue('pending');
  }

  loadQueue(tab: OnboardingQueueGroup): void {
    this.activeTab = tab;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.companyApi.getOnboardingQueue(tab)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (companies) => {
          this.companies = companies;
          this.selectedCompany = companies[0] ?? null;
          this.primeDocumentForms();
        },
        error: (error) => this.error = this.readError(error, 'Could not load onboarding queue.'),
      });
  }

  selectCompany(company: OnboardingCompany): void {
    this.selectedCompany = company;
    this.message = '';
    this.error = '';
    this.primeDocumentForms();
  }

  verifyDocument(type: OnboardingDocumentType): void {
    if (!this.selectedCompany) return;
    this.runCompanyAction(
      this.companyApi.verifyOnboardingDocument(this.selectedCompany._id, type, {
        expirationDate: this.documentExpiration[type] || undefined,
        notes: this.documentNotes[type] || undefined,
        source: 'manual',
      }),
      `${this.documentLabel(type)} verified.`
    );
  }

  rejectDocument(type: OnboardingDocumentType): void {
    if (!this.selectedCompany) return;
    const reason = (this.rejectReasons[type] || '').trim();
    if (!reason) {
      this.error = `Enter a rejection reason for ${this.documentLabel(type)}.`;
      return;
    }

    this.runCompanyAction(
      this.companyApi.rejectOnboardingDocument(this.selectedCompany._id, type, {
        reason,
        notes: this.documentNotes[type] || undefined,
      }),
      `${this.documentLabel(type)} rejected.`
    );
  }

  approvePaperwork(): void {
    if (!this.selectedCompany) return;
    this.runCompanyAction(
      this.companyApi.approveOnboardingPaperwork(this.selectedCompany._id),
      'Paperwork approved. Company moved to Waiting setup.'
    );
  }

  requestCorrection(): void {
    if (!this.selectedCompany) return;
    if (!this.correctionMessage.trim()) {
      this.error = 'Enter the correction message before sending.';
      return;
    }
    this.runCompanyAction(
      this.companyApi.requestOnboardingCorrection(this.selectedCompany._id, { message: this.correctionMessage.trim() }),
      'Correction request sent.'
    );
  }

  inactivateCompany(): void {
    if (!this.selectedCompany) return;
    if (!this.inactiveReason.trim()) {
      this.error = 'Enter the inactive reason first.';
      return;
    }
    this.runCompanyAction(
      this.companyApi.inactivateOnboardingCompany(this.selectedCompany._id, { reason: this.inactiveReason.trim() }),
      'Company moved inactive.'
    );
  }

  restoreCompany(): void {
    if (!this.selectedCompany) return;
    this.runCompanyAction(
      this.companyApi.restoreOnboardingCompany(this.selectedCompany._id, {
        status: this.restoreStatus,
        reason: 'Restored from master onboarding console.',
      }),
      'Company restored.'
    );
  }

  softDeleteCompany(): void {
    if (!this.selectedCompany) return;
    if (!this.deleteReason.trim()) {
      this.error = 'Enter the delete reason first.';
      return;
    }
    this.runCompanyAction(
      this.companyApi.softDeleteOnboardingCompany(this.selectedCompany._id, { reason: this.deleteReason.trim() }),
      'Company soft-deleted.'
    );
  }

  purgeCompany(): void {
    if (!this.selectedCompany) return;
    const confirmed = window.confirm(`Permanently delete ${this.selectedCompany.name}? This removes company users and uploaded files.`);
    if (!confirmed) return;

    this.actionPending = true;
    this.companyApi.purgeOnboardingCompany(this.selectedCompany._id)
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: () => {
          this.message = 'Company permanently deleted.';
          this.loadQueue(this.activeTab);
        },
        error: (error) => this.error = this.readError(error, 'Company could not be permanently deleted.'),
      });
  }

  resendSetupEmail(): void {
    if (!this.selectedCompany) return;
    this.actionPending = true;
    this.companyApi.resendSetupEmail(this.selectedCompany._id)
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: () => this.message = 'Setup email resent.',
        error: (error) => this.error = this.readError(error, 'Setup email could not be resent.'),
      });
  }

  documentStatus(type: OnboardingDocumentType): string {
    return this.selectedCompany?.onboarding?.documents?.[type]?.status || 'missing';
  }

  documentSource(type: OnboardingDocumentType): string {
    return this.selectedCompany?.onboarding?.documents?.[type]?.source || 'manual';
  }

  documentLabel(type: OnboardingDocumentType): string {
    if (type === 'mc') return 'MC authority';
    if (type === 'insurance') return 'Insurance certificate';
    return 'HAZMAT authority';
  }

  statusLabel(company: OnboardingCompany | null): string {
    return company?.status?.replace(/_/g, ' ') || 'unknown';
  }

  private runCompanyAction(request$: any, successMessage: string): void {
    this.actionPending = true;
    this.error = '';
    this.message = '';
    request$
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: (company: OnboardingCompany) => {
          this.selectedCompany = company;
          this.message = successMessage;
          this.loadQueue(this.activeTab);
        },
        error: (error: any) => this.error = this.readError(error, 'Action could not be completed.'),
      });
  }

  private primeDocumentForms(): void {
    this.documentExpiration = {};
    this.documentNotes = {};
    this.rejectReasons = {};
    this.documentTypes.forEach((type) => {
      const document = this.selectedCompany?.onboarding?.documents?.[type];
      this.documentExpiration[type] = document?.expirationDate ? `${document.expirationDate}`.slice(0, 10) : '';
      this.documentNotes[type] = document?.notes || '';
      this.rejectReasons[type] = document?.rejectionReason || '';
    });
  }

  private readError(error: any, fallback: string): string {
    const backendMessage = Array.isArray(error?.error?.message)
      ? error.error.message.join(', ')
      : error?.error?.message;
    return backendMessage || fallback;
  }
}
```

- [ ] **Step 2: Create component HTML**

Create `master-onboarding-console.component.html`:

```html
<section class="master-onboarding">
  <header class="master-onboarding__header">
    <div>
      <div class="eyebrow">Master account</div>
      <h2>Company onboarding</h2>
    </div>
    <button class="secondary-button" type="button" (click)="loadQueue(activeTab)" [disabled]="loading">Refresh</button>
  </header>

  <nav class="master-onboarding__tabs">
    <button
      type="button"
      *ngFor="let tab of tabs"
      [class.active]="activeTab === tab.id"
      (click)="loadQueue(tab.id)"
    >
      <strong>{{ tab.label }}</strong>
    </button>
  </nav>

  <div class="message-banner error" *ngIf="error">{{ error }}</div>
  <div class="message-banner" *ngIf="message">{{ message }}</div>
  <div class="loading-inline" *ngIf="loading">Loading onboarding queue...</div>

  <div class="master-onboarding__grid" *ngIf="!loading">
    <aside class="company-queue">
      <button
        type="button"
        class="company-queue__item"
        *ngFor="let company of companies"
        [class.active]="selectedCompany?._id === company._id"
        (click)="selectCompany(company)"
      >
        <strong>{{ company.name }}</strong>
        <span>{{ company.type }} | DOT {{ company.dot }} | MC {{ company.mc }}</span>
        <em>{{ statusLabel(company) }}</em>
      </button>

      <div class="empty-state" *ngIf="!companies.length">
        {{ tabs.find(tab => tab.id === activeTab)?.empty }}
      </div>
    </aside>

    <section class="company-detail" *ngIf="selectedCompany">
      <header class="company-detail__header">
        <div>
          <h3>{{ selectedCompany.name }}</h3>
          <p>{{ selectedCompany.contactPerson?.firstName }} {{ selectedCompany.contactPerson?.lastName }} | {{ selectedCompany.email }}</p>
        </div>
        <span class="status-chip">{{ statusLabel(selectedCompany) }}</span>
      </header>

      <section class="document-grid">
        <article class="document-card" *ngFor="let type of documentTypes">
          <header>
            <strong>{{ documentLabel(type) }}</strong>
            <span>{{ documentStatus(type) }} | {{ documentSource(type) }}</span>
          </header>

          <label>
            <span>Expiration</span>
            <input type="date" [(ngModel)]="documentExpiration[type]" />
          </label>

          <label>
            <span>Notes</span>
            <input type="text" [(ngModel)]="documentNotes[type]" placeholder="Reviewer note" />
          </label>

          <label>
            <span>Reject reason</span>
            <input type="text" [(ngModel)]="rejectReasons[type]" placeholder="Reason if rejecting" />
          </label>

          <div class="document-card__actions">
            <button class="secondary-button" type="button" (click)="verifyDocument(type)" [disabled]="actionPending">Verify</button>
            <button class="ghost-button" type="button" (click)="rejectDocument(type)" [disabled]="actionPending">Reject</button>
          </div>
        </article>
      </section>

      <section class="action-panel">
        <div>
          <label>
            <span>Correction message</span>
            <textarea rows="2" [(ngModel)]="correctionMessage" placeholder="Explain exactly what must be fixed"></textarea>
          </label>
          <button class="secondary-button" type="button" (click)="requestCorrection()" [disabled]="actionPending">Request correction</button>
        </div>

        <div>
          <label>
            <span>Inactive / delete reason</span>
            <textarea rows="2" [(ngModel)]="inactiveReason" placeholder="Reason for inactive status"></textarea>
          </label>
          <button class="ghost-button" type="button" (click)="inactivateCompany()" [disabled]="actionPending">Move inactive</button>
        </div>

        <div>
          <label>
            <span>Restore status</span>
            <select [(ngModel)]="restoreStatus">
              <option value="pending_review">Pending review</option>
              <option value="approved_waiting_setup">Waiting setup</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button class="secondary-button" type="button" (click)="restoreCompany()" [disabled]="actionPending">Restore</button>
        </div>

        <div>
          <label>
            <span>Soft delete reason</span>
            <textarea rows="2" [(ngModel)]="deleteReason" placeholder="Required before delete"></textarea>
          </label>
          <button class="ghost-button" type="button" (click)="softDeleteCompany()" [disabled]="actionPending">Soft delete</button>
          <button class="danger-button" type="button" (click)="purgeCompany()" [disabled]="actionPending || selectedCompany.status !== 'deleted_pending_purge'">Delete forever</button>
        </div>
      </section>

      <footer class="company-detail__footer">
        <button class="primary-button" type="button" (click)="approvePaperwork()" [disabled]="actionPending">Approve paperwork</button>
        <button class="secondary-button" type="button" (click)="resendSetupEmail()" [disabled]="actionPending">Resend setup email</button>
      </footer>
    </section>
  </div>
</section>
```

- [ ] **Step 3: Fix Angular template method issue**

Angular templates should not call `Array.find` inline in older strict settings. Add this getter to the component:

```ts
  get activeEmptyMessage(): string {
    return this.tabs.find((tab) => tab.id === this.activeTab)?.empty || 'No companies found.';
  }
```

Replace in HTML:

```html
{{ tabs.find(tab => tab.id === activeTab)?.empty }}
```

With:

```html
{{ activeEmptyMessage }}
```

- [ ] **Step 4: Create component SCSS**

Create `master-onboarding-console.component.scss`:

```scss
.master-onboarding {
  display: grid;
  gap: 18px;
}

.master-onboarding__header,
.company-detail__header,
.company-detail__footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.master-onboarding__header h2,
.company-detail__header h3 {
  margin: 4px 0 0;
}

.master-onboarding__tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;

  button {
    min-height: 68px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 14px 14px 0 0;
    background: rgba(10, 22, 36, 0.84);
    color: var(--text);
    text-align: left;

    &.active {
      border-color: var(--line-strong);
      box-shadow: inset 0 -3px 0 var(--accent);
    }
  }
}

.master-onboarding__grid {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
}

.company-queue,
.company-detail,
.document-card,
.action-panel > div {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(10, 22, 36, 0.84);
}

.company-queue {
  padding: 10px;
  display: grid;
  gap: 10px;
  align-content: start;
}

.company-queue__item {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(9, 20, 33, 0.82);
  color: var(--text);
  text-align: left;

  span,
  em {
    color: var(--muted);
    font-size: 13px;
    font-style: normal;
  }

  &.active {
    border-color: var(--accent);
  }
}

.company-detail {
  padding: 18px;
  display: grid;
  gap: 18px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
}

.document-grid,
.action-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.document-card,
.action-panel > div {
  padding: 14px;
  display: grid;
  gap: 12px;
}

.document-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

label {
  display: grid;
  gap: 6px;

  span {
    color: var(--muted);
    font-size: 12px;
  }
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(8, 18, 30, 0.92);
  color: var(--text);
  padding: 10px;
}

.document-card__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.danger-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(255, 87, 87, 0.6);
  border-radius: 12px;
  background: rgba(255, 87, 87, 0.1);
  color: #ff8a8a;
}

@media (max-width: 1100px) {
  .master-onboarding__grid,
  .document-grid,
  .action-panel,
  .master-onboarding__tabs {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Declare component in app module**

Modify `src/app/app.module.ts`.

Add import:

```ts
import { MasterOnboardingConsoleComponent } from './features/workspace/master-onboarding-console/master-onboarding-console.component';
```

Add to `declarations`:

```ts
MasterOnboardingConsoleComponent
```

- [ ] **Step 6: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
npm run build
```

Expected:

- PASS Angular build.

- [ ] **Step 7: Commit component changes when git is restored**

If git exists later:

```powershell
git add src/app/features/workspace/master-onboarding-console src/app/app.module.ts
git commit -m "feat: add master onboarding console"
```

---

### Task 11: Wire Master Console Into Workspace

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.html`

- [ ] **Step 1: Extend workspace tab types**

In `workspace.component.ts`, change:

```ts
type WorkspaceTab = 'dispatch' | 'matching' | 'loads' | 'direct';
```

To:

```ts
type WorkspaceTab = 'masterOnboarding' | 'dispatch' | 'matching' | 'loads' | 'direct';
```

Change `WORKSPACE_TABS` to include master onboarding:

```ts
const WORKSPACE_TABS: WorkspaceTabConfig[] = [
  { id: 'masterOnboarding', title: 'Master Onboarding', detail: 'Approve company paperwork, setup, active, and inactive companies' },
  { id: 'dispatch', title: 'Dispatch Posting Console', detail: 'Create trucks or loads from one posting bot window' },
  { id: 'matching', title: 'AI Load/Truck Matching Console', detail: 'Run match commands, save templates, and open direct lanes' },
  { id: 'loads', title: 'Loads Console', detail: 'Review posted capacity, lane status, and next operational moves' },
  { id: 'direct', title: 'Direct Chat Console', detail: 'Work broker-carrier conversations in a dedicated room view' },
];
```

Add getters:

```ts
  get isMasterAccount(): boolean { return this.user?.role === 'superadmin'; }

  get workspaceTabs(): WorkspaceTabConfig[] {
    if (this.isMasterAccount) {
      return WORKSPACE_TABS.filter((tab) => tab.id === 'masterOnboarding');
    }
    return WORKSPACE_TABS.filter((tab) => tab.id !== 'masterOnboarding');
  }
```

Remove or replace the existing `workspaceTabs` getter so only one getter exists.

- [ ] **Step 2: Select master tab automatically for superadmin**

In `ngOnInit`, after `this.user = this.session.currentUser;`, add:

```ts
      if (this.user?.role === 'superadmin') {
        this.activeTab = 'masterOnboarding';
      }
```

Also add the same assignment inside the `restoreSession` subscribe block after setting `this.user`.

- [ ] **Step 3: Render master console**

In `workspace.component.html`, add this inside `<main class="workspace-main">` before the dispatch section:

```html
      <app-master-onboarding-console
        *ngIf="activeTab === 'masterOnboarding'"
      ></app-master-onboarding-console>
```

- [ ] **Step 4: Prevent operational data loading for superadmin**

In `loadWorkspaceData` or the call site around it, guard:

```ts
      if (this.user.role === 'superadmin') {
        this.loading = false;
        return;
      }
```

Place this before calling post/load/message APIs.

- [ ] **Step 5: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
npm run build
```

Expected:

- PASS Angular build.

- [ ] **Step 6: Commit workspace wiring when git is restored**

If git exists later:

```powershell
git add src/app/features/workspace/workspace.component.ts src/app/features/workspace/workspace.component.html
git commit -m "feat: wire master onboarding workspace tab"
```

---

### Task 12: Signup Requested Seats and Submitted State

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/auth/sign-up/sign-up.component.ts`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/auth/sign-up/sign-up.component.html`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/shared/types/models.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/dto/create-company.dto.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/company.service.ts`

- [ ] **Step 1: Add requested seats to frontend model**

Modify `CompanyDraft` in `models.ts`:

```ts
  requestedSeats?: number;
```

- [ ] **Step 2: Add requested seats to signup form**

In `sign-up.component.ts`, add to `companyForm`:

```ts
    requestedSeats: [1, [Validators.required, Validators.min(1)]],
```

Add patching in `patchCompanyDraft`:

```ts
      requestedSeats: company.requestedSeats || company.onboarding?.requestedSeats || 1,
```

Ensure `buildCompanyPayload()` includes `requestedSeats` by keeping the current spread of `payload`.

- [ ] **Step 3: Add requested seats input to signup HTML**

In the company profile section, add a field near company type:

```html
              <label class="field">
                <span>Requested users</span>
                <input formControlName="requestedSeats" type="number" min="1" placeholder="1" />
              </label>
```

Change submitted copy:

```html
<div class="message success" *ngIf="submitted">Company request submitted. The next step is paperwork review. You will receive setup/payment instructions after approval.</div>
```

And:

```html
        The Prometheus onboarding request is now in review. You will receive setup/payment instructions after approval.
```

- [ ] **Step 4: Accept requested seats in backend DTO**

Modify `src/company/dto/create-company.dto.ts` imports:

```ts
import { IsEmail, IsInt, IsNotEmptyObject, IsOptional, IsString, Min, ValidateNested } from "class-validator";
```

Add property:

```ts
@ApiPropertyOptional()
@IsOptional()
@IsInt()
@Min(1)
readonly requestedSeats?: number;
```

- [ ] **Step 5: Store requested seats during company create/update**

In `CompanyService.create`, change company creation to:

```ts
      let dbCompany: any = await this.CompanyModel.create({
        ...data,
        status: "draft",
        isWaiting: false,
        clientId: clientId,
        onboarding: {
          status: "draft",
          requestedSeats: data.requestedSeats ?? 1
        }
      });
```

In `CompanyService.update`, if `requestedSeats` is present, set onboarding requested seats:

```ts
      const updateData: any = { ...data };
      if (data.requestedSeats) {
        updateData["onboarding.requestedSeats"] = data.requestedSeats;
      }
      let dbCompany: any = await this.CompanyModel.findOneAndUpdate({ _id: id, status: "draft" }, updateData,{new:true});
```

- [ ] **Step 6: Build frontend and backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
cd C:/Prometheus-Clean/prometheus
npm run build
```

Expected:

- PASS backend build.
- PASS frontend build.

- [ ] **Step 7: Commit signup changes when git is restored**

If git exists later:

```powershell
git add src/app/features/auth/sign-up/sign-up.component.ts src/app/features/auth/sign-up/sign-up.component.html src/app/shared/types/models.ts
git add ../prometheus-backend/src/company/dto/create-company.dto.ts ../prometheus-backend/src/company/company.service.ts
git commit -m "feat: capture requested seats during onboarding"
```

---

### Task 13: Local Smoke Data and Manual Verification

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/scripts/seed-local-demo.js`

- [ ] **Step 1: Seed one pending and one waiting setup company**

Modify `scripts/seed-local-demo.js` to add two extra companies after the existing local demo companies:

```js
  await upsertCompany(companies, "pending.carrier.local@prometheus.test", {
    name: "Pending Carrier Review",
    email: "pending.carrier.local@prometheus.test",
    phone: "555-000-3000",
    dot: "3333000",
    mc: "MC-PENDING-CARRIER",
    type: "carrier",
    status: "pending_review",
    isWaiting: false,
    filesUploaded: true,
    filesNames: {
      mc: { name: "MC-Authority", ext: "pdf" },
      insurance: { name: "Insurance-Certificate", ext: "pdf" },
      hazmat: { name: "HAZMAT-Authority", ext: "pdf" }
    },
    onboarding: {
      status: "pending_review",
      submittedAt: now,
      requestedSeats: 4,
      documents: {
        mc: { fileType: "mc", displayName: "MC authority", source: "manual", status: "pending" },
        insurance: { fileType: "insurance", displayName: "Insurance certificate", source: "manual", status: "pending" },
        hazmat: { fileType: "hazmat", displayName: "HAZMAT authority", source: "manual", status: "pending" }
      }
    },
    contactPerson: {
      firstName: "Pat",
      lastName: "Pending",
      email: "pending.carrier.local@prometheus.test",
      phone: "555-000-3001",
      verificationPhone: "555-000-3002",
      role: "Owner"
    }
  });

  await upsertCompany(companies, "setup.broker.local@prometheus.test", {
    name: "Setup Broker Review",
    email: "setup.broker.local@prometheus.test",
    phone: "555-000-4000",
    dot: "4444000",
    mc: "MC-SETUP-BROKER",
    type: "broker",
    status: "approved_waiting_setup",
    isWaiting: false,
    filesUploaded: true,
    onboarding: {
      status: "approved_waiting_setup",
      submittedAt: now,
      approvedAt: now,
      requestedSeats: 3,
      documents: {
        mc: { fileType: "mc", displayName: "MC authority", source: "manual", status: "verified", expirationDate: nextYear },
        insurance: { fileType: "insurance", displayName: "Insurance certificate", source: "manual", status: "verified", expirationDate: nextYear }
      }
    },
    contactPerson: {
      firstName: "Sam",
      lastName: "Setup",
      email: "setup.broker.local@prometheus.test",
      phone: "555-000-4001",
      verificationPhone: "555-000-4002",
      role: "Owner"
    }
  });
```

- [ ] **Step 2: Run seed**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
node scripts/seed-local-demo.js
```

Expected:

- Script prints local demo data is ready.

- [ ] **Step 3: Start/restart app**

Run backend:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm run build
node dist/main.js
```

Run frontend in another terminal:

```powershell
cd C:/Prometheus-Clean/prometheus
npm start
```

Expected:

- Backend on `http://localhost:3100`.
- Frontend on `http://localhost:4300`.

- [ ] **Step 4: Manual smoke test**

Use browser:

1. Go to `http://localhost:4300/sign-in`.
2. Login as `superadmin.local@prometheus.test` with `Prometheus123!`.
3. Confirm only `Master Onboarding` tab is visible.
4. Confirm Pending paperwork list includes `Pending Carrier Review`.
5. Mark MC and insurance verified.
6. Try approve while HAZMAT pending and confirm backend blocks approval.
7. Mark HAZMAT verified.
8. Approve paperwork.
9. Confirm company moves out of Pending paperwork.
10. Open Waiting setup and confirm approved companies are visible.

- [ ] **Step 5: Build all**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
npm test -- onboarding --runInBand
npm run build
cd C:/Prometheus-Clean/prometheus
npm run build
```

Expected:

- PASS onboarding tests.
- PASS backend build.
- PASS frontend build.

- [ ] **Step 6: Commit smoke seed changes when git is restored**

If git exists later:

```powershell
git add scripts/seed-local-demo.js
git commit -m "test: seed onboarding review companies"
```

---

## Plan Self-Review

Spec coverage:

- Hybrid verification is covered in Tasks 1, 2, 5, and 6.
- Master tabs are covered in Tasks 7, 9, 10, and 11.
- Company lifecycle transitions are covered in Tasks 6 and 8.
- Payment/setup compatibility is covered in Task 8.
- Company admin seat setup capture is covered in Task 12.
- Inactive, soft-delete, restore, and purge are covered in Tasks 6, 7, and 10.
- Local smoke verification is covered in Task 13.

Placeholder scan:

- No `TBD`, `FIXME`, or incomplete sections are intentionally left in this plan.
- The plan avoids hidden future work by naming the exact first implementation slice and local smoke checks.

Type consistency:

- Canonical statuses match the approved spec.
- Frontend queue group names match backend `OnboardingQueueGroup`.
- Document type names match backend and frontend: `mc`, `insurance`, `hazmat`.
- Verification source names match backend and frontend: `manual`, `highway`, `mycarrierpacket`, `truckstop`, `other`.
