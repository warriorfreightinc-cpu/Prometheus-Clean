# Company Setup After Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved-company setup flow so a company admin can confirm seats, activate locally during development, and create company users after activation.

**Architecture:** Add a focused backend setup service/controller under the existing Company module, reusing Company and User models plus the existing Stripe and user endpoints. Add a frontend Company Setup Console and route admin users into it before operational workspace data loads. Keep production payment routed through the existing Stripe checkout endpoint, while local activation is guarded by environment/config.

**Tech Stack:** NestJS 10, Mongoose, Jest, Angular 16, RxJS, existing Stripe and nodemailer/user flows.

---

## File Structure

Backend:

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/setup/dto/company-setup.dto.ts`
  Defines request DTOs and response shape for setup status and local activation.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.service.ts`
  Reads setup status and performs guarded local activation.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.service.spec.ts`
  Tests setup status and local activation rules with mocked Mongoose models.

- Create `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.controller.ts`
  Exposes admin-only setup endpoints.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/company/company.module.ts`
  Registers setup controller and service.

- Modify `C:/Prometheus-Clean/prometheus-backend/src/payments-subscriptions/payments.controller.ts`
  Return `sessionUrl` from Stripe checkout when available so the frontend can redirect without adding Stripe.js immediately.

- Modify `C:/Prometheus-Clean/prometheus-backend/scripts/seed-local-demo.js`
  Add a waiting-setup admin login for local smoke testing.

Frontend:

- Modify `C:/Prometheus-Clean/prometheus/src/app/shared/types/models.ts`
  Adds setup status/user types.

- Modify `C:/Prometheus-Clean/prometheus/src/app/core/api/company-api.service.ts`
  Adds setup status, local activation, users, products, and checkout methods.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.ts`
  Company admin setup logic.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.html`
  Setup console UI.

- Create `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.scss`
  Setup console styling.

- Modify `C:/Prometheus-Clean/prometheus/src/app/app.module.ts`
  Declares the setup console component.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.ts`
  Routes admin users to setup before loading operational data.

- Modify `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.html`
  Renders setup console.

Verification:

- Backend focused tests:
  `& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' company-setup --runInBand`

- Existing onboarding tests:
  `& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' onboarding --runInBand`

- Backend build:
  `& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/@nestjs/cli/bin/nest.js' build`

- Frontend build:
  `& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus/node_modules/@angular/cli/bin/ng.js' build`

Git note:

- `C:/Prometheus-Clean` is not currently a git repository. Skip commit commands in this workspace. When git is restored, commit by task.

---

### Task 1: Backend Setup Status And Local Activation Service

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/setup/dto/company-setup.dto.ts`
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.service.ts`
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.service.spec.ts`

- [ ] **Step 1: Write failing setup service tests**

Create `company-setup.service.spec.ts` with these tests:

```ts
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
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' company-setup --runInBand
```

Expected:

- FAIL because `company-setup.service.ts` does not exist.

- [ ] **Step 3: Add setup DTOs**

Create `company-setup.dto.ts`:

```ts
import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";

export class LocalActivateCompanyDTO {
  @ApiProperty()
  @IsInt()
  @Min(1)
  readonly quantity: number;
}

export interface CompanySetupStatusDTO {
  status: string;
  requestedSeats: number;
  paidSeats: number;
  activeUsers: number;
  canLocalActivate: boolean;
  company: any;
}
```

- [ ] **Step 4: Add setup service**

Create `company-setup.service.ts`:

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "src/user/interface/user.interface";
import { Company } from "../interface/company.interface";
import { COMPANY_ONBOARDING_STATUSES } from "../onboarding/onboarding.constants";
import { isCompanyInSetup, normalizeCompanyStatus } from "../onboarding/onboarding.utils";
import { CompanySetupStatusDTO, LocalActivateCompanyDTO } from "./dto/company-setup.dto";

@Injectable()
export class CompanySetupService {
  constructor(
    @InjectModel("Company") private readonly companyModel: Model<Company>,
    @InjectModel("User") private readonly userModel: Model<User>,
    private readonly configService: ConfigService
  ) {}

  async getStatus(companyId: string): Promise<CompanySetupStatusDTO> {
    const company = await this.companyModel.findById(companyId).lean();
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    const activeUsers = await this.userModel.countDocuments({
      companyId,
      isActive: true,
      role: { $ne: "supervisor" }
    });

    return {
      status: normalizeCompanyStatus(company.status),
      requestedSeats: Number(company.onboarding?.requestedSeats ?? company.subscription?.quantity ?? 1),
      paidSeats: Number(company.subscription?.quantity ?? 0),
      activeUsers,
      canLocalActivate: this.canUseLocalActivation(),
      company
    };
  }

  async localActivate(companyId: string, data: LocalActivateCompanyDTO): Promise<CompanySetupStatusDTO> {
    const quantity = Number(data.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Seat quantity must be at least 1.");
    }

    if (!this.canUseLocalActivation()) {
      throw new ForbiddenException("Local setup activation is disabled. Use Stripe checkout.");
    }

    const company = await this.companyModel.findById(companyId);
    if (!company) {
      throw new NotFoundException("Company not found.");
    }

    if (!isCompanyInSetup(company.status)) {
      throw new BadRequestException("Company must be approved and waiting setup before local activation.");
    }

    const now = new Date();
    const endPeriod = new Date(now);
    endPeriod.setMonth(endPeriod.getMonth() + 1);

    await this.companyModel.findOneAndUpdate(
      { _id: companyId },
      {
        status: COMPANY_ONBOARDING_STATUSES.Active,
        "onboarding.status": COMPANY_ONBOARDING_STATUSES.Active,
        "subscription.customer": company.subscription?.customer ?? `local-setup-${companyId}`,
        "subscription.quantity": quantity,
        "subscription.amount_due": 0,
        "subscription.lastPayment": now,
        "subscription.endPeriod": endPeriod,
        "subscription.status": "local_active",
        deactivationReason: "",
        $push: {
          notes: {
            text: `Company activated locally with ${quantity} paid seats.`,
            type: "action",
            date: now
          }
        }
      },
      { new: true }
    );

    return this.getStatus(companyId);
  }

  private canUseLocalActivation(): boolean {
    const explicit = this.configService.get<string>("ALLOW_LOCAL_SETUP_ACTIVATION") === "true";
    const stripeKey = this.configService.get<string>("STRIPE_API_KEY") ?? "";
    return explicit || stripeKey.includes("placeholder") || stripeKey.startsWith("sk_test_local");
  }
}
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' company-setup --runInBand
```

Expected:

- PASS for `company-setup.service.spec.ts`.

---

### Task 2: Backend Setup Controller And Stripe Return URL

**Files:**
- Create: `C:/Prometheus-Clean/prometheus-backend/src/company/setup/company-setup.controller.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/company/company.module.ts`
- Modify: `C:/Prometheus-Clean/prometheus-backend/src/payments-subscriptions/payments.controller.ts`

- [ ] **Step 1: Add setup controller**

Create `company-setup.controller.ts`:

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Roles } from "src/shared/decorators/roles.decorator";
import { CompanySetupService } from "./company-setup.service";
import { LocalActivateCompanyDTO } from "./dto/company-setup.dto";

@ApiExcludeController()
@Controller("company/setup")
export class CompanySetupController {
  constructor(private readonly setupService: CompanySetupService) {}

  @Get("status")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  getStatus(@Req() req) {
    return this.setupService.getStatus(req.user.companyId);
  }

  @Post("local-activate")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  localActivate(@Req() req, @Body() body: LocalActivateCompanyDTO) {
    return this.setupService.localActivate(req.user.companyId, body);
  }
}
```

- [ ] **Step 2: Register setup controller/service**

Modify `company.module.ts`:

```ts
import { CompanySetupController } from "./setup/company-setup.controller";
import { CompanySetupService } from "./setup/company-setup.service";
```

Change the module metadata to:

```ts
controllers: [CompanyController, OnboardingController, CompanySetupController],
providers: [CompanyService, OnboardingService, CompanySetupService],
```

- [ ] **Step 3: Return Stripe Checkout session URL**

Modify `payments.controller.ts` in `createCheckoutSession`, changing:

```ts
return { sessionId: session.id }
```

To:

```ts
return { sessionId: session.id, sessionUrl: session.url }
```

- [ ] **Step 4: Build backend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/@nestjs/cli/bin/nest.js' build
```

Expected:

- Build exits `0`.

---

### Task 3: Frontend Setup Types And API Methods

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus/src/app/shared/types/models.ts`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/core/api/company-api.service.ts`

- [ ] **Step 1: Add setup and user types**

Add to `models.ts`:

```ts
export interface CompanySetupStatus {
  status: string;
  requestedSeats: number;
  paidSeats: number;
  activeUsers: number;
  canLocalActivate: boolean;
  company: CompanyOnboardingRecord;
}

export interface CompanyUser {
  _id?: string;
  id?: string;
  companyId?: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive?: boolean;
  subscriptionEmail?: boolean;
}

export interface CreateCompanyUserPayload {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: 'broker' | 'carrier' | 'manager';
  contactEmail?: string;
}

export interface StripeProductOption {
  id: string;
  name: string;
  default_price?: {
    id?: string;
    unit_amount?: number;
  };
}
```

- [ ] **Step 2: Add company setup API methods**

Add imports in `company-api.service.ts`:

```ts
  CompanySetupStatus,
  CompanyUser,
  CreateCompanyUserPayload,
  StripeProductOption,
```

Add methods:

```ts
  getCompanySetupStatus(): Observable<CompanySetupStatus> {
    return this.http.get<CompanySetupStatus>('company/setup/status');
  }

  localActivateCompany(quantity: number): Observable<CompanySetupStatus> {
    return this.http.post<CompanySetupStatus>('company/setup/local-activate', { quantity });
  }

  getCompanyUsers(): Observable<CompanyUser[]> {
    return this.http.get<CompanyUser[]>('users');
  }

  createCompanyUser(payload: CreateCompanyUserPayload): Observable<CompanyUser> {
    return this.http.post<CompanyUser>('users', payload);
  }

  getSubscriptionProducts(): Observable<StripeProductOption[]> {
    return this.http.get<StripeProductOption[]>('subscriptions/products');
  }

  createCheckoutSession(payload: { priceId: string; quantity: number }): Observable<{ sessionId: string; sessionUrl?: string }> {
    return this.http.post<{ sessionId: string; sessionUrl?: string }>('subscriptions', payload);
  }
```

- [ ] **Step 3: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus/node_modules/@angular/cli/bin/ng.js' build
```

Expected:

- Build exits `0`. Existing budget warnings may remain.

---

### Task 4: Company Setup Console Component

**Files:**
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.ts`
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.html`
- Create: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/company-setup-console/company-setup-console.component.scss`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/app.module.ts`

- [ ] **Step 1: Create setup component TypeScript**

Create `company-setup-console.component.ts`:

```ts
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { CompanyApiService } from '../../../core/api/company-api.service';
import {
  CompanySetupStatus,
  CompanyUser,
  CreateCompanyUserPayload,
  StripeProductOption,
} from '../../../shared/types/models';

@Component({
  selector: 'app-company-setup-console',
  templateUrl: './company-setup-console.component.html',
  styleUrls: ['./company-setup-console.component.scss'],
})
export class CompanySetupConsoleComponent implements OnInit {
  @Output() statusChanged = new EventEmitter<CompanySetupStatus>();

  readonly userForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    role: ['broker' as 'broker' | 'carrier' | 'manager', Validators.required],
  });

  setupStatus: CompanySetupStatus | null = null;
  users: CompanyUser[] = [];
  products: StripeProductOption[] = [];
  selectedPriceId = '';
  quantity = 1;
  loading = false;
  actionPending = false;
  userPending = false;
  message = '';
  error = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyApi: CompanyApiService
  ) {}

  ngOnInit(): void {
    this.loadSetup();
  }

  get isActive(): boolean {
    return this.setupStatus?.status === 'active';
  }

  get seatLabel(): string {
    const paid = this.setupStatus?.paidSeats || this.quantity || 1;
    const active = this.setupStatus?.activeUsers || this.users.length || 0;
    return `${active} of ${paid} seats used`;
  }

  get canCreateUsers(): boolean {
    const paid = this.setupStatus?.paidSeats || 0;
    return this.isActive && this.users.length < paid;
  }

  loadSetup(): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      setup: this.companyApi.getCompanySetupStatus(),
      users: this.companyApi.getCompanyUsers().pipe(catchError(() => of([] as CompanyUser[]))),
      products: this.companyApi.getSubscriptionProducts().pipe(catchError(() => of([] as StripeProductOption[]))),
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: ({ setup, users, products }) => {
        this.setupStatus = setup;
        this.users = users ?? [];
        this.products = products ?? [];
        this.quantity = setup.paidSeats || setup.requestedSeats || 1;
        this.selectedPriceId = this.products[0]?.default_price?.id || '';
        this.statusChanged.emit(setup);
      },
      error: (error) => this.handleError(error, 'Company setup could not be loaded.'),
    });
  }

  startPayment(): void {
    if (!this.selectedPriceId) {
      this.error = 'Stripe product is not available. Use local activation for this development setup.';
      return;
    }

    this.actionPending = true;
    this.error = '';
    this.companyApi.createCheckoutSession({ priceId: this.selectedPriceId, quantity: this.quantity })
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: (session) => {
          if (session.sessionUrl) {
            window.location.href = session.sessionUrl;
            return;
          }
          this.message = `Stripe checkout session created: ${session.sessionId}`;
        },
        error: (error) => this.handleError(error, 'Stripe checkout could not be started.'),
      });
  }

  activateLocally(): void {
    this.actionPending = true;
    this.error = '';
    this.companyApi.localActivateCompany(this.quantity)
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: (setup) => {
          this.setupStatus = setup;
          this.message = 'Company activated locally. You can now create company users.';
          this.statusChanged.emit(setup);
          this.loadSetup();
        },
        error: (error) => this.handleError(error, 'Local activation could not be completed.'),
      });
  }

  createUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      this.error = 'Complete all user fields before creating the account.';
      return;
    }

    if (!this.canCreateUsers) {
      this.error = 'Paid seat limit has been reached.';
      return;
    }

    this.userPending = true;
    this.error = '';
    const payload = this.userForm.getRawValue() as CreateCompanyUserPayload;
    this.companyApi.createCompanyUser(payload)
      .pipe(finalize(() => (this.userPending = false)))
      .subscribe({
        next: () => {
          this.message = 'Company user created. They will receive the password setup email.';
          this.userForm.reset({ role: 'broker' });
          this.loadSetup();
        },
        error: (error) => this.handleError(error, 'Company user could not be created.'),
      });
  }

  statusText(status: string | undefined): string {
    const labels: Record<string, string> = {
      approved_waiting_setup: 'Waiting setup',
      active: 'Active',
      pending_review: 'Pending review',
      correction_needed: 'Correction needed',
      inactive: 'Inactive',
      deleted_pending_purge: 'Deleted review',
    };
    return labels[status ?? ''] ?? status ?? 'Unknown';
  }

  private handleError(error: any, fallback: string): void {
    const backendMessage = Array.isArray(error?.error?.message)
      ? error.error.message.join(', ')
      : error?.error?.message;
    this.error = backendMessage || fallback;
  }
}
```

- [ ] **Step 2: Create setup component HTML**

Create `company-setup-console.component.html`:

```html
<section class="company-setup">
  <header class="company-setup__header">
    <div>
      <div class="eyebrow">Company setup</div>
      <h2>{{ setupStatus?.company?.name || 'Approved company' }}</h2>
      <p>{{ statusText(setupStatus?.status) }}</p>
    </div>
    <button class="secondary-button" type="button" (click)="loadSetup()" [disabled]="loading">
      {{ loading ? 'Refreshing...' : 'Refresh setup' }}
    </button>
  </header>

  <div class="message-banner" *ngIf="message">{{ message }}</div>
  <div class="message-banner error" *ngIf="error">{{ error }}</div>

  <section class="setup-summary" *ngIf="setupStatus">
    <article>
      <span>Requested seats</span>
      <strong>{{ setupStatus.requestedSeats }}</strong>
    </article>
    <article>
      <span>Paid seats</span>
      <strong>{{ setupStatus.paidSeats || 'Not active' }}</strong>
    </article>
    <article>
      <span>Users</span>
      <strong>{{ seatLabel }}</strong>
    </article>
  </section>

  <section class="setup-grid">
    <article class="setup-card">
      <div class="eyebrow">Payment and seats</div>
      <h3>Choose company seats</h3>
      <label>
        <span>Seat count</span>
        <input type="number" min="1" [(ngModel)]="quantity" />
      </label>
      <label>
        <span>Stripe product</span>
        <select [(ngModel)]="selectedPriceId">
          <option value="">No product loaded</option>
          <option *ngFor="let product of products" [value]="product.default_price?.id || ''">
            {{ product.name }}
          </option>
        </select>
      </label>
      <div class="setup-actions">
        <button class="primary-button" type="button" (click)="startPayment()" [disabled]="actionPending || isActive">Start payment</button>
        <button class="secondary-button" type="button" (click)="activateLocally()" [disabled]="actionPending || isActive || !setupStatus?.canLocalActivate">Activate locally</button>
      </div>
    </article>

    <article class="setup-card setup-card--users">
      <div class="eyebrow">Company users</div>
      <h3>Create access</h3>
      <form [formGroup]="userForm" (ngSubmit)="createUser()" class="user-form">
        <label>
          <span>First name</span>
          <input formControlName="firstName" type="text" />
        </label>
        <label>
          <span>Last name</span>
          <input formControlName="lastName" type="text" />
        </label>
        <label>
          <span>Email</span>
          <input formControlName="email" type="email" />
        </label>
        <label>
          <span>Phone</span>
          <input formControlName="phone" type="text" />
        </label>
        <label>
          <span>Role</span>
          <select formControlName="role">
            <option value="broker">Broker</option>
            <option value="carrier">Carrier</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        <button class="primary-button" type="submit" [disabled]="userPending || !canCreateUsers">
          {{ userPending ? 'Creating...' : 'Create user' }}
        </button>
      </form>
    </article>
  </section>

  <section class="user-list">
    <article *ngFor="let user of users">
      <strong>{{ user.firstName }} {{ user.lastName }}</strong>
      <span>{{ user.role }} | {{ user.email }}</span>
      <em>{{ user.isActive === false ? 'Inactive' : 'Active' }}</em>
    </article>
  </section>
</section>
```

- [ ] **Step 3: Create setup component SCSS**

Create `company-setup-console.component.scss`:

```scss
.company-setup {
  display: grid;
  gap: 18px;
}

.company-setup__header,
.setup-summary,
.setup-grid,
.setup-actions {
  display: grid;
  gap: 14px;
}

.company-setup__header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;

  h2 {
    margin: 4px 0;
    font-size: 34px;
    line-height: 1.05;
  }

  p {
    margin: 0;
    color: var(--muted);
  }
}

.setup-summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));

  article {
    min-height: 92px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(10, 22, 36, 0.84);
    display: grid;
    align-content: center;
    gap: 6px;
  }

  span {
    color: var(--muted);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  strong {
    font-size: 24px;
  }
}

.setup-grid {
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
}

.setup-card,
.user-list article {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(10, 22, 36, 0.84);
}

.setup-card {
  padding: 18px;
  display: grid;
  gap: 14px;

  h3 {
    margin: 0;
    font-size: 26px;
  }
}

.setup-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.user-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

label {
  display: grid;
  gap: 6px;

  span {
    color: var(--muted);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}

input,
select {
  width: 100%;
  min-height: 46px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(8, 18, 30, 0.92);
  color: var(--text);
}

.user-list {
  display: grid;
  gap: 10px;
}

.user-list article {
  min-height: 68px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px;

  span,
  em {
    color: var(--muted);
    font-style: normal;
  }
}

@media (max-width: 1100px) {
  .company-setup__header,
  .setup-summary,
  .setup-grid,
  .setup-actions,
  .user-form,
  .user-list article {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Declare setup component**

Modify `app.module.ts`:

```ts
import { CompanySetupConsoleComponent } from './features/workspace/company-setup-console/company-setup-console.component';
```

Add to declarations:

```ts
CompanySetupConsoleComponent,
```

- [ ] **Step 5: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus/node_modules/@angular/cli/bin/ng.js' build
```

Expected:

- Build exits `0`.

---

### Task 5: Wire Setup Console Into Workspace

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.ts`
- Modify: `C:/Prometheus-Clean/prometheus/src/app/features/workspace/workspace.component.html`

- [ ] **Step 1: Extend workspace tab type**

Change:

```ts
type WorkspaceTab = 'masterOnboarding' | 'dispatch' | 'matching' | 'loads' | 'direct';
```

To:

```ts
type WorkspaceTab = 'masterOnboarding' | 'companySetup' | 'dispatch' | 'matching' | 'loads' | 'direct';
```

Add setup tab to `WORKSPACE_TABS`:

```ts
{ id: 'companySetup', title: 'Company Setup', detail: 'Finish payment and create users after approval' },
```

- [ ] **Step 2: Add admin setup state**

In `WorkspaceComponent`, add:

```ts
adminSetupStatus: string | null = null;
```

Add getter:

```ts
get isCompanyAdmin(): boolean { return this.user?.role === 'admin'; }
```

Modify `workspaceTabs` getter:

```ts
if (this.isCompanyAdmin) {
  return WORKSPACE_TABS.filter((tab) => tab.id === 'companySetup');
}
```

- [ ] **Step 3: Route admin users to setup before loading operations**

In `ngOnInit`, after `this.user = this.session.currentUser`, set:

```ts
if (this.user.role === 'admin') this.activeTab = 'companySetup';
```

Do the same in the restore-session branch after assigning `this.user`.

In `loadWorkspaceData`, add before post/load API calls:

```ts
if (user.role === 'admin') {
  this.user = user;
  this.posts = [];
  this.companyPosts = [];
  this.loads = [];
  this.matchCandidates = [];
  this.rooms = [];
  this.previewDirectRooms = [];
  this.loading = false;
  return;
}
```

- [ ] **Step 4: Render setup console**

In `workspace.component.html`, after the master onboarding section, add:

```html
      <section class="panel" *ngIf="activeTab === 'companySetup'">
        <app-company-setup-console></app-company-setup-console>
      </section>
```

- [ ] **Step 5: Build frontend**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus/node_modules/@angular/cli/bin/ng.js' build
```

Expected:

- Build exits `0`.

---

### Task 6: Seed Waiting Setup Admin And Smoke Data

**Files:**
- Modify: `C:/Prometheus-Clean/prometheus-backend/scripts/seed-local-demo.js`

- [ ] **Step 1: Add waiting setup admin user**

After seeding `Setup Broker Review`, store the returned company:

```js
  const setupBrokerCompany = await upsertCompany(companies, "setup.broker.local@prometheus.test", {
```

Then add:

```js
  await upsertUser(users, "setup.admin.local@prometheus.test", {
    companyId: setupBrokerCompany._id,
    email: "setup.admin.local@prometheus.test",
    password: passwordHash,
    role: "admin",
    firstName: "Sam",
    lastName: "Setup",
    emailConfirmation: true,
    isActive: true,
    phone: "555-000-4001",
    contactEmail: "setup.broker.local@prometheus.test",
    previewedPosts: [],
    blacklist: [],
    isLogged: "",
    subscriptionEmail: true,
    messages: [],
  });

  await companies.updateOne(
    { _id: setupBrokerCompany._id },
    { $set: { adminId: setupAdmin._id } }
  );
```

Use a `const setupAdmin = await upsertUser(...)` variable so the `adminId` update has the created user id.

- [ ] **Step 2: Print login**

Add:

```js
console.log("setup.admin.local@prometheus.test / Prometheus123!");
```

To the login credentials output.

- [ ] **Step 3: Run seed**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' scripts/seed-local-demo.js
```

Expected:

- Script prints local demo data is ready.

---

### Task 7: Verification And Local Server Restart

**Files:**
- No new files.

- [ ] **Step 1: Run focused backend setup tests**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' company-setup --runInBand
```

Expected:

- PASS for setup tests.

- [ ] **Step 2: Run onboarding regression tests**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/jest/bin/jest.js' onboarding --runInBand
```

Expected:

- PASS for onboarding tests.

- [ ] **Step 3: Run backend build**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus-backend
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus-backend/node_modules/@nestjs/cli/bin/nest.js' build
```

Expected:

- Build exits `0`.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd C:/Prometheus-Clean/prometheus
& 'C:/Program Files/nodejs/node.exe' 'C:/Prometheus-Clean/prometheus/node_modules/@angular/cli/bin/ng.js' build
```

Expected:

- Build exits `0`. Existing Angular budget warnings may remain.

- [ ] **Step 5: Restart local servers**

Run:

```powershell
$backend = Get-NetTCPConnection -LocalPort 3100 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1
if ($backend) { Stop-Process -Id $backend.OwningProcess -Force; Start-Sleep -Seconds 1 }
Start-Process -FilePath 'C:/Program Files/nodejs/node.exe' -ArgumentList 'dist/main.js' -WorkingDirectory 'C:/Prometheus-Clean/prometheus-backend' -WindowStyle Hidden -RedirectStandardOutput 'C:/Prometheus-Clean/prometheus-backend/local-backend.out.log' -RedirectStandardError 'C:/Prometheus-Clean/prometheus-backend/local-backend.err.log'

$frontend = Get-NetTCPConnection -LocalPort 4300 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' } | Select-Object -First 1
if ($frontend) { Stop-Process -Id $frontend.OwningProcess -Force; Start-Sleep -Seconds 1 }
Start-Process -FilePath 'C:/Program Files/nodejs/node.exe' -ArgumentList 'node_modules/@angular/cli/bin/ng.js','serve','--port','4300' -WorkingDirectory 'C:/Prometheus-Clean/prometheus' -WindowStyle Hidden -RedirectStandardOutput 'C:/Prometheus-Clean/prometheus/local-frontend.out.log' -RedirectStandardError 'C:/Prometheus-Clean/prometheus/local-frontend.err.log'
```

Expected:

- `localhost:3100` and `localhost:4300` both listen.

- [ ] **Step 6: API smoke test setup admin login**

Run:

```powershell
$login = Invoke-RestMethod -Uri 'http://localhost:3100/login' -Method Post -ContentType 'application/json' -Body '{"email":"setup.admin.local@prometheus.test","password":"Prometheus123!","rememberMe":true}'
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri 'http://localhost:3100/company/setup/status' -Headers $headers
```

Expected:

- Response includes `status: approved_waiting_setup`, `requestedSeats: 3`, and `canLocalActivate: true`.

- [ ] **Step 7: API smoke test local activation**

Run:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3100/company/setup/local-activate' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"quantity":3}'
Invoke-RestMethod -Uri 'http://localhost:3100/company/setup/status' -Headers $headers
```

Expected:

- First response includes `status: active`.
- Second response includes `paidSeats: 3`.

---

## Plan Self-Review

Spec coverage:

- Admin-only setup status is covered in Tasks 1, 2, and 5.
- Local activation is covered in Tasks 1, 2, and 7.
- Stripe checkout compatibility is covered in Tasks 2 and 4.
- User creation after activation is covered in Tasks 3 and 4.
- Setup routing before operational workspace loads is covered in Task 5.
- Local smoke data is covered in Task 6.

Placeholder scan:

- No incomplete placeholder sections are intentionally left in the plan.
- Every created file has concrete code content or a specific code edit.

Type consistency:

- Backend DTO names match service/controller usage.
- Frontend setup type names match API service and component usage.
- Status names match existing canonical statuses: `approved_waiting_setup` and `active`.

Execution constraints:

- Use direct Node commands because PowerShell cannot run the local npm shims reliably on this machine.
- Skip git commit steps because this workspace is not a git repository.
