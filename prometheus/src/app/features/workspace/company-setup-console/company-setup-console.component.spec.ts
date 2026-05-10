import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { CompanyApiService } from '../../../core/api/company-api.service';
import {
  CompanyIntegrationRecord,
  CompanySetupStatus,
  CompanyUser,
  StripeProductOption,
} from '../../../shared/types/models';
import { CompanySetupConsoleComponent } from './company-setup-console.component';

describe('CompanySetupConsoleComponent', () => {
  let fixture: ComponentFixture<CompanySetupConsoleComponent>;
  let component: CompanySetupConsoleComponent;
  let companyApi: jasmine.SpyObj<CompanyApiService>;

  const setupStatus: CompanySetupStatus = {
    status: 'active',
    requestedSeats: 2,
    paidSeats: 2,
    activeUsers: 1,
    canLocalActivate: false,
    company: {
      _id: 'company-1',
      name: 'Prometheus Logistics',
      email: 'ops@example.com',
      phone: '555-0100',
      dot: '123',
      mc: '456',
      type: 'broker',
      address: {
        country: 'US',
        city: 'Chicago',
        street: '1 Main',
        zip: '60601',
        state: 'IL',
      },
      contactPerson: {
        email: 'admin@example.com',
        phone: '555-0101',
        verificationPhone: '555-0101',
        role: 'admin',
      },
    },
  };

  const integrations: CompanyIntegrationRecord[] = [
    {
      _id: 'setup-1',
      companyId: 'company-1',
      category: 'setup',
      provider: 'highway',
      label: 'Highway',
      status: 'connected',
      enabled: true,
      setupUrl: 'https://setup.example.com',
      updatedAt: '2026-05-07T12:00:00.000Z',
    },
    {
      _id: 'tracking-1',
      companyId: 'company-1',
      category: 'tracking',
      provider: 'macropoint',
      label: 'MacroPoint',
      status: 'needs_attention',
      enabled: true,
    },
    {
      _id: 'eld-1',
      companyId: 'company-1',
      category: 'eld',
      provider: 'samsara',
      label: 'Carrier ELD',
      status: 'disabled',
      enabled: false,
    },
  ];

  beforeEach(async () => {
    companyApi = jasmine.createSpyObj<CompanyApiService>('CompanyApiService', [
      'getCompanySetupStatus',
      'getCompanyUsers',
      'getSubscriptionProducts',
      'createCheckoutSession',
      'getBillingPortalSession',
      'localActivateCompany',
      'createCompanyUser',
      'getCompanyIntegrations',
      'upsertCompanyIntegration',
      'updateCompanyIntegration',
      'disableCompanyIntegration',
    ]);
    companyApi.getCompanySetupStatus.and.returnValue(of(setupStatus));
    companyApi.getCompanyUsers.and.returnValue(of([] as CompanyUser[]));
    companyApi.getSubscriptionProducts.and.returnValue(of([] as StripeProductOption[]));
    companyApi.getCompanyIntegrations.and.returnValue(of(integrations));
    companyApi.getBillingPortalSession.and.returnValue(of({ sessionUrl: 'https://billing.stripe.test/session' }));
    companyApi.upsertCompanyIntegration.and.returnValue(of(integrations[0]));
    companyApi.updateCompanyIntegration.and.returnValue(of(integrations[0]));
    companyApi.disableCompanyIntegration.and.returnValue(of({ ...integrations[0], enabled: false, status: 'disabled' }));

    await TestBed.configureTestingModule({
      declarations: [CompanySetupConsoleComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [{ provide: CompanyApiService, useValue: companyApi }],
    }).compileComponents();

    fixture = TestBed.createComponent(CompanySetupConsoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders setup, tracking, and ELD integration groups with statuses', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Company integrations');
    expect(text).toContain('Setup providers');
    expect(text).toContain('Tracking providers');
    expect(text).toContain('Carrier ELD/API');
    expect(text).toContain('Highway');
    expect(text).toContain('Connected');
    expect(text).toContain('Needs attention');
    expect(text).toContain('Disabled');
  });

  it('calls the upsert integration API from the add provider form', () => {
    component.integrationForm.setValue({
      category: 'tracking',
      provider: 'fourkites',
      label: 'FourKites',
      status: 'connected',
      enabled: true,
      setupUrl: '',
      credentialRef: '',
      notes: 'Broker tracking',
    });

    component.saveIntegration();

    expect(companyApi.upsertCompanyIntegration).toHaveBeenCalledWith({
      category: 'tracking',
      provider: 'fourkites',
      label: 'FourKites',
      status: 'connected',
      enabled: true,
      notes: 'Broker tracking',
    });
  });

  it('redirects admins to Stripe Checkout for the selected seats', () => {
    companyApi.createCheckoutSession.and.returnValue(of({
      sessionId: 'cs_test_123',
      sessionUrl: 'https://checkout.stripe.test/session',
    }));
    spyOn(component as any, 'redirectTo');
    component.products = [{
      id: 'prod-1',
      name: 'Prometheus seat',
      default_price: { id: 'price_123', unit_amount: 25000 },
    }];
    component.selectedPriceId = 'price_123';
    component.quantity = 3;
    component.setupStatus = { ...setupStatus, status: 'approved_waiting_setup', paidSeats: 0 };

    component.startPayment();

    expect(companyApi.createCheckoutSession).toHaveBeenCalledWith({
      priceId: 'price_123',
      quantity: 3,
    });
    expect((component as any).redirectTo).toHaveBeenCalledWith('https://checkout.stripe.test/session');
  });

  it('opens the Stripe billing portal when billing is already set up', () => {
    spyOn(component as any, 'redirectTo');
    component.setupStatus = {
      ...setupStatus,
      company: {
        ...setupStatus.company,
        subscription: { customer: 'cus_123' },
      },
    };

    component.manageBilling();

    expect(companyApi.getBillingPortalSession).toHaveBeenCalled();
    expect((component as any).redirectTo).toHaveBeenCalledWith('https://billing.stripe.test/session');
  });

  it('shows a setup status message after returning from Stripe Checkout', () => {
    window.history.pushState({}, '', '/workspace?payment=success&session_id=cs_test_123');

    (component as any).applyPaymentReturnMessage();

    expect(component.message).toContain('Payment returned from Stripe');

    window.history.pushState({}, '', '/workspace');
  });
});
