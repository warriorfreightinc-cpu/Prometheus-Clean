import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { CompanyApiService } from '../../../core/api/company-api.service';
import {
  CompanyIntegrationCategory,
  CompanyIntegrationRecord,
  CompanyIntegrationStatus,
  ProviderCatalog,
  ProviderCatalogItem,
  ProviderCatalogStatus,
  CompanySetupStatus,
  CompanyUser,
  CreateCompanyUserPayload,
  StripeProductOption,
  UpsertCompanyIntegrationPayload,
} from '../../../shared/types/models';

type SetupStepState = 'done' | 'active' | 'locked';
type IntegrationGroup = {
  category: CompanyIntegrationCategory;
  title: string;
  description: string;
};

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

  readonly integrationForm = this.fb.group({
    category: ['setup' as CompanyIntegrationCategory, Validators.required],
    provider: ['', Validators.required],
    label: ['', Validators.required],
    status: ['not_connected' as CompanyIntegrationStatus, Validators.required],
    enabled: [true],
    setupUrl: [''],
    credentialRef: [''],
    notes: [''],
  });

  readonly integrationGroups: IntegrationGroup[] = [
    {
      category: 'setup',
      title: 'Setup providers',
      description: 'Carrier and broker packet setup options.',
    },
    {
      category: 'tracking',
      title: 'Tracking providers',
      description: 'Broker tracking portals and APIs.',
    },
    {
      category: 'eld',
      title: 'Carrier ELD/API',
      description: 'Carrier-side ELD or custom tracking feeds.',
    },
  ];

  setupStatus: CompanySetupStatus | null = null;
  users: CompanyUser[] = [];
  products: StripeProductOption[] = [];
  integrations: CompanyIntegrationRecord[] = [];
  providerCatalogItems: ProviderCatalogItem[] = [];
  selectedPriceId = '';
  selectedIntegrationId = '';
  quantity = 1;
  loading = false;
  actionPending = false;
  userPending = false;
  integrationPending = false;
  message = '';
  error = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyApi: CompanyApiService
  ) {}

  ngOnInit(): void {
    this.loadSetup();
    this.applyPaymentReturnMessage();
  }

  get isActive(): boolean {
    return this.setupStatus?.status === 'active';
  }

  get billableUserCount(): number {
    return this.setupStatus?.activeUsers ?? this.users.filter((user) => this.isBillableUser(user)).length;
  }

  get paidSeatCount(): number {
    return this.setupStatus?.paidSeats || 0;
  }

  get seatLabel(): string {
    const paid = this.paidSeatCount || this.quantity || 1;
    return `${this.billableUserCount} of ${paid} seats used`;
  }

  get canCreateUsers(): boolean {
    return this.isActive && this.billableUserCount < this.paidSeatCount;
  }

  get canManageBilling(): boolean {
    return !!this.setupStatus?.company?.subscription?.customer;
  }

  get selectedProductLabel(): string {
    const product = this.products.find((entry) => entry.default_price?.id === this.selectedPriceId);
    if (!product) return 'No Stripe product selected';
    const amount = product.default_price?.unit_amount;
    if (typeof amount !== 'number') return product.name;
    return `${product.name} - ${(amount / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} / seat`;
  }

  stepState(step: 'approved' | 'payment' | 'users' | 'active'): SetupStepState {
    if (step === 'approved') {
      return 'done';
    }

    if (step === 'payment') {
      return this.isActive ? 'done' : 'active';
    }

    if (step === 'users') {
      return this.isActive && this.billableUserCount >= this.paidSeatCount ? 'done' : this.isActive ? 'active' : 'locked';
    }

    return this.isActive && this.billableUserCount > 0 ? 'done' : 'locked';
  }

  loadSetup(): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      setup: this.companyApi.getCompanySetupStatus(),
      users: this.companyApi.getCompanyUsers().pipe(catchError(() => of([] as CompanyUser[]))),
      products: this.companyApi.getSubscriptionProducts().pipe(catchError(() => of([] as StripeProductOption[]))),
      integrations: this.companyApi.getCompanyIntegrations().pipe(catchError(() => of([] as CompanyIntegrationRecord[]))),
      providerCatalog: this.companyApi.getProviderCatalog().pipe(catchError(() => of({ platform: [], company: [] } as ProviderCatalog))),
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: ({ setup, users, products, integrations, providerCatalog }) => {
        this.setupStatus = setup;
        this.users = users ?? [];
        this.products = products ?? [];
        this.integrations = integrations ?? [];
        this.providerCatalogItems = [...(providerCatalog?.platform ?? []), ...(providerCatalog?.company ?? [])];
        this.quantity = setup.paidSeats || setup.requestedSeats || 1;
        this.selectedPriceId = this.products[0]?.default_price?.id || '';
        this.statusChanged.emit(setup);
      },
      error: (error) => this.handleError(error, 'Company setup could not be loaded.'),
    });
  }

  integrationsByCategory(category: CompanyIntegrationCategory): CompanyIntegrationRecord[] {
    return this.integrations.filter((integration) => integration.category === category);
  }

  saveIntegration(): void {
    if (this.integrationForm.invalid) {
      this.integrationForm.markAllAsTouched();
      this.error = 'Choose a provider group and add a provider name and display label.';
      return;
    }

    const payload = this.buildIntegrationPayload();
    this.integrationPending = true;
    this.error = '';
    const request = this.selectedIntegrationId
      ? this.companyApi.updateCompanyIntegration(this.selectedIntegrationId, payload)
      : this.companyApi.upsertCompanyIntegration(payload);

    request.pipe(finalize(() => (this.integrationPending = false))).subscribe({
      next: () => {
        this.message = this.selectedIntegrationId ? 'Integration updated.' : 'Integration saved.';
        this.resetIntegrationForm();
        this.loadSetup();
      },
      error: (error) => this.handleError(error, 'Company integration could not be saved.'),
    });
  }

  editIntegration(integration: CompanyIntegrationRecord): void {
    this.selectedIntegrationId = this.integrationId(integration);
    this.integrationForm.reset({
      category: integration.category,
      provider: integration.provider,
      label: integration.label,
      status: integration.status,
      enabled: integration.enabled,
      setupUrl: integration.setupUrl ?? '',
      credentialRef: integration.credentialRef ?? '',
      notes: integration.notes ?? '',
    });
  }

  disableIntegration(integration: CompanyIntegrationRecord): void {
    const id = this.integrationId(integration);
    if (!id) {
      return;
    }

    this.integrationPending = true;
    this.error = '';
    this.companyApi.disableCompanyIntegration(id)
      .pipe(finalize(() => (this.integrationPending = false)))
      .subscribe({
        next: () => {
          this.message = `${integration.label} disabled.`;
          this.loadSetup();
        },
        error: (error) => this.handleError(error, 'Company integration could not be disabled.'),
      });
  }

  resetIntegrationForm(): void {
    this.selectedIntegrationId = '';
    this.integrationForm.reset({
      category: 'setup',
      provider: '',
      label: '',
      status: 'not_connected',
      enabled: true,
      setupUrl: '',
      credentialRef: '',
      notes: '',
    });
  }

  integrationId(integration: CompanyIntegrationRecord): string {
    return integration._id || integration.id || '';
  }

  statusLabel(status: CompanyIntegrationStatus): string {
    const labels: Record<CompanyIntegrationStatus, string> = {
      not_connected: 'Not connected',
      connected: 'Connected',
      needs_attention: 'Needs attention',
      disabled: 'Disabled',
    };
    return labels[status];
  }

  statusClass(status: CompanyIntegrationStatus): string {
    return `status-chip status-chip--${status.replace('_', '-')}`;
  }

  providerStatusLabel(status: ProviderCatalogStatus): string {
    const labels: Record<ProviderCatalogStatus, string> = {
      ready: 'Ready',
      needs_credentials: 'Needs credentials',
      requires_credentials: 'Requires credentials',
      requires_contract: 'Requires contract',
      manual: 'Manual',
    };
    return labels[status];
  }

  providerStatusClass(status: ProviderCatalogStatus): string {
    return `status-chip status-chip--provider-${status.replace('_', '-')}`;
  }

  providerCatalogId(index: number, item: ProviderCatalogItem): string {
    return `${item.category}:${item.provider}:${index}`;
  }

  startPayment(): void {
    if (!this.selectedPriceId) {
      this.error = 'Stripe product is not available. Use local activation for this development setup.';
      return;
    }

    this.actionPending = true;
    this.error = '';
    this.companyApi.createCheckoutSession({ priceId: this.selectedPriceId, quantity: Number(this.quantity) })
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: (session) => {
          if (session.sessionUrl) {
            this.redirectTo(session.sessionUrl);
            return;
          }
          this.message = `Stripe checkout session created: ${session.sessionId}`;
        },
        error: (error) => this.handleError(error, 'Stripe checkout could not be started.'),
      });
  }

  manageBilling(): void {
    if (!this.canManageBilling) {
      this.error = 'Stripe billing is not set up for this company yet.';
      return;
    }

    this.actionPending = true;
    this.error = '';
    this.companyApi.getBillingPortalSession()
      .pipe(finalize(() => (this.actionPending = false)))
      .subscribe({
        next: (session) => this.redirectTo(session.sessionUrl),
        error: (error) => this.handleError(error, 'Stripe billing portal could not be opened.'),
      });
  }

  activateLocally(): void {
    this.actionPending = true;
    this.error = '';
    this.companyApi.localActivateCompany(Number(this.quantity))
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

  private isBillableUser(user: CompanyUser): boolean {
    return !['admin', 'supervisor'].includes(user.role) && user.subscriptionEmail !== false;
  }

  private buildIntegrationPayload(): UpsertCompanyIntegrationPayload {
    const formValue = this.integrationForm.getRawValue();
    const payload: UpsertCompanyIntegrationPayload = {
      category: formValue.category ?? 'setup',
      provider: this.trimValue(formValue.provider),
      label: this.trimValue(formValue.label),
      status: formValue.status ?? 'not_connected',
      enabled: formValue.enabled ?? true,
    };

    const setupUrl = this.trimValue(formValue.setupUrl);
    const credentialRef = this.trimValue(formValue.credentialRef);
    const notes = this.trimValue(formValue.notes);

    if (setupUrl) {
      payload.setupUrl = setupUrl;
    }
    if (credentialRef) {
      payload.credentialRef = credentialRef;
    }
    if (notes) {
      payload.notes = notes;
    }

    return payload;
  }

  private trimValue(value: string | null | undefined): string {
    return (value ?? '').trim();
  }

  private applyPaymentReturnMessage(): void {
    if (typeof window === 'undefined') return;
    const paymentState = new URLSearchParams(window.location.search).get('payment');
    if (paymentState === 'success') {
      this.message = 'Payment returned from Stripe. Prometheus is refreshing setup status after the webhook updates the company seats.';
    }
    if (paymentState === 'cancelled') {
      this.error = 'Stripe payment was cancelled. You can restart checkout when ready.';
    }
    if (paymentState === 'portal') {
      this.message = 'Returned from Stripe billing portal.';
    }
  }

  private redirectTo(url: string): void {
    window.location.href = url;
  }

  private handleError(error: any, fallback: string): void {
    const backendMessage = Array.isArray(error?.error?.message)
      ? error.error.message.join(', ')
      : error?.error?.message;
    this.error = backendMessage || fallback;
  }
}
