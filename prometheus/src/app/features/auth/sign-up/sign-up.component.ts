import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { CompanyApiService } from '../../../core/api/company-api.service';
import { CompanyDraft, StateOption } from '../../../shared/types/models';

@Component({
  selector: 'app-sign-up',
  templateUrl: './sign-up.component.html',
  styleUrls: ['./sign-up.component.scss'],
})
export class SignUpComponent implements OnInit {
  private readonly draftKeyStorage = 'prometheus.signup.key';
  private readonly draftStepStorage = 'prometheus.signup.step';

  readonly companyForm = this.fb.group({
    name: ['', Validators.required],
    dba: [''],
    dot: ['', Validators.required],
    mc: ['', Validators.required],
    type: ['carrier', Validators.required],
    requestedSeats: [1, [Validators.required, Validators.min(1)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    address: this.fb.group({
      country: ['USA', Validators.required],
      street: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      zip: ['', Validators.required],
    }),
    contactPerson: this.fb.group({
      fullName: ['', Validators.required],
      role: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', Validators.required],
      verificationPhone: ['', Validators.required],
    }),
  });

  readonly accessForm = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  states: StateOption[] = [];
  currentStep = 0;
  draftKey = '';
  companyId = '';
  companyDraft: CompanyDraft | null = null;
  adminDraftExists = false;
  busy = false;
  submitted = false;
  error = '';
  errorReasons: string[] = [];
  termsAccepted = false;

  files: Record<string, File | null> = {
    'MC-Authority': null,
    'HAZMAT-Authority': null,
    'Insurance-Certificate': null,
  };

  constructor(
    private readonly fb: FormBuilder,
    private readonly companyApi: CompanyApiService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.currentStep = Number(localStorage.getItem(this.draftStepStorage) || '0');
    this.draftKey = localStorage.getItem(this.draftKeyStorage) || '';
    this.loadStates();

    if (this.draftKey) {
      this.loadDraft();
    }
  }

  get stepTitle(): string {
    return ['Company profile', 'Verification files', 'Access account', 'Review and submit'][this.currentStep];
  }

  onFileSelected(event: Event, type: string): void {
    const input = event.target as HTMLInputElement;
    this.files[type] = input.files?.[0] || null;
  }

  submitCompany(): void {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      this.error = 'Complete the required company fields before continuing.';
      this.errorReasons = [];
      return;
    }

    this.busy = true;
    this.clearError();
    const payload = this.buildCompanyPayload();
    const request$ = this.draftKey
      ? this.companyApi.updateCompany(payload, this.draftKey)
      : this.companyApi.createCompany(payload);

    request$
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: (draft) => {
          this.companyDraft = draft;
          this.draftKey = draft.key || this.draftKey;
          this.companyId = draft._id || this.companyId;
          localStorage.setItem(this.draftKeyStorage, this.draftKey);
          this.clearError();
          this.setStep(1);
        },
        error: (error) => this.handleError(error, 'The company draft could not be saved.'),
      });
  }

  submitFiles(): void {
    if (!this.files['MC-Authority'] || !this.files['Insurance-Certificate']) {
      this.error = 'MC authority and insurance certificate are required.';
      this.errorReasons = [];
      return;
    }

    if ((this.companyForm.value.type === 'carrier' || this.companyForm.value.type === 'both') && !this.files['HAZMAT-Authority']) {
      this.error = 'HAZMAT authority is required for carrier access.';
      this.errorReasons = [];
      return;
    }

    if (!this.draftKey) {
      this.error = 'Company draft key is missing. Save the company profile first.';
      this.errorReasons = [];
      return;
    }

    this.busy = true;
    this.clearError();

    const filesNames: Record<string, { name: string; ext: string }> = {};
    const requests = Object.entries(this.files)
      .filter(([, file]) => !!file)
      .map(([type, file]) => {
        const formData = new FormData();
        formData.append('files', file as File);
        filesNames[type] = {
          name: type,
          ext: (file as File).name.split('.').pop() || 'pdf',
        };
        return this.companyApi.uploadFile(formData, type, this.draftKey);
      });

    requests.push(this.companyApi.updateCompany({ filesNames }, this.draftKey));

    forkJoin(requests)
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: () => {
          this.companyDraft = {
            ...(this.companyDraft as CompanyDraft),
            ...this.buildCompanyPayload(),
            filesNames,
          };
          this.setStep(2);
        },
        error: (error) => this.handleError(error, 'The verification files could not be uploaded.'),
      });
  }

  submitAccess(): void {
    if (this.accessForm.invalid) {
      this.accessForm.markAllAsTouched();
      this.error = 'Complete the access account fields before continuing.';
      this.errorReasons = [];
      return;
    }

    if (this.accessForm.value.password !== this.accessForm.value.confirmPassword) {
      this.error = 'Password and confirm password must match.';
      this.errorReasons = [];
      return;
    }

    if (!this.draftKey) {
      this.error = 'Company draft key is missing. Save the company profile first.';
      this.errorReasons = [];
      return;
    }

    const payload = {
      firstName: this.accessForm.value.firstName,
      lastName: this.accessForm.value.lastName,
      email: this.accessForm.value.email,
      phone: this.accessForm.value.phone,
      password: this.accessForm.value.password,
    };

    this.busy = true;
    this.clearError();

    const request$ = this.adminDraftExists
      ? this.companyApi.updateDraftAdmin(payload, this.draftKey)
      : this.companyApi.createAdmin(payload, this.draftKey);

    request$
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: () => {
          this.adminDraftExists = true;
          this.setStep(3);
        },
        error: (error) => this.handleError(error, 'The access account could not be saved.'),
      });
  }

  submitRequest(): void {
    if (!this.termsAccepted) {
      this.error = 'Accept the terms before submitting the company request.';
      this.errorReasons = [];
      return;
    }

    if (!this.draftKey) {
      this.error = 'Company draft key is missing.';
      this.errorReasons = [];
      return;
    }

    this.busy = true;
    this.clearError();

    this.companyApi
      .completeCompany(this.draftKey)
      .pipe(finalize(() => (this.busy = false)))
      .subscribe({
        next: () => {
          this.submitted = true;
          this.clearDraftState();
        },
        error: (error) => this.handleError(error, 'The company request could not be submitted.'),
      });
  }

  back(): void {
    if (this.currentStep === 0) {
      this.router.navigate(['/sign-in']);
      return;
    }

    this.setStep(this.currentStep - 1);
  }

  goToSignIn(): void {
    this.router.navigate(['/sign-in']);
  }

  resetDraft(): void {
    if (!this.draftKey) {
      this.resetLocalForms();
      return;
    }

    this.companyApi.deleteDraftCompany(this.draftKey).subscribe({
      next: () => this.resetLocalForms(),
      error: () => this.resetLocalForms(),
    });
  }

  trackByCode(_: number, state: StateOption): string {
    return state.code;
  }

  private loadStates(): void {
    this.companyApi.getStates('USA').subscribe({
      next: (states) => {
        this.states = [...states].sort((a, b) => a.code.localeCompare(b.code));
      },
      error: () => {
        this.states = [];
      },
    });
  }

  private loadDraft(): void {
    forkJoin({
      company: this.companyApi.getDraftCompany(this.draftKey).pipe(catchError(() => of(null))),
      admin: this.companyApi.getDraftAdmin(this.draftKey).pipe(catchError(() => of(null))),
    }).subscribe(({ company, admin }) => {
      if (company) {
        this.companyDraft = company;
        this.companyId = company._id || '';
        this.patchCompanyDraft(company);
      }

      if (admin) {
        this.adminDraftExists = true;
        this.accessForm.patchValue({
          firstName: admin.firstName || '',
          lastName: admin.lastName || '',
          email: admin.email || '',
          phone: admin.phone || '',
        });
      }
    });
  }

  private patchCompanyDraft(company: CompanyDraft): void {
    const contactFullName =
      company.contactPerson?.fullName ||
      [company.contactPerson?.firstName, company.contactPerson?.lastName].filter(Boolean).join(' ');

    this.companyForm.patchValue({
      name: company.name || '',
      dba: company.dba || '',
      dot: company.dot || '',
      mc: company.mc || '',
      type: company.type || 'carrier',
      requestedSeats: company.requestedSeats || company.onboarding?.requestedSeats || 1,
      email: company.email || '',
      phone: company.phone || '',
      address: {
        country: company.address?.country || 'USA',
        street: company.address?.street || '',
        city: company.address?.city || '',
        state: company.address?.state || '',
        zip: company.address?.zip || '',
      },
      contactPerson: {
        fullName: contactFullName || '',
        role: company.contactPerson?.role || '',
        email: company.contactPerson?.email || '',
        phone: company.contactPerson?.phone || '',
        verificationPhone: company.contactPerson?.verificationPhone || '',
      },
    });
  }

  private buildCompanyPayload(): CompanyDraft {
    const payload = this.companyForm.getRawValue();
    const fullName = `${payload.contactPerson.fullName || ''}`.trim();
    const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);

    return {
      ...payload,
      address: {
        ...payload.address,
        country: 'USA',
      },
      contactPerson: {
        ...payload.contactPerson,
        firstName: firstName || '',
        lastName: lastNameParts.join(' '),
      },
    } as CompanyDraft;
  }

  private setStep(step: number): void {
    this.currentStep = step;
    localStorage.setItem(this.draftStepStorage, `${step}`);
  }

  private clearDraftState(): void {
    localStorage.removeItem(this.draftKeyStorage);
    localStorage.removeItem(this.draftStepStorage);
    this.draftKey = '';
    this.companyId = '';
  }

  private resetLocalForms(): void {
    this.clearDraftState();
    this.companyDraft = null;
    this.adminDraftExists = false;
    this.submitted = false;
    this.error = '';
    this.errorReasons = [];
    this.termsAccepted = false;
    this.files = {
      'MC-Authority': null,
      'HAZMAT-Authority': null,
      'Insurance-Certificate': null,
    };
    this.companyForm.reset({
      type: 'carrier',
      requestedSeats: 1,
      address: { country: 'USA' },
    });
    this.accessForm.reset();
    this.setStep(0);
  }

  private handleError(error: any, fallback: string): void {
    const response = error?.error ?? {};
    const backendMessages = Array.isArray(response.message)
      ? response.message
      : response.message
        ? [response.message]
        : [];
    const reasons = Array.isArray(response.reasons) ? response.reasons.filter(Boolean) : [];
    const meaningfulMessages = backendMessages.filter((message: string) => message && message !== 'Bad Request');

    if (response.key) {
      this.draftKey = response.key;
      localStorage.setItem(this.draftKeyStorage, this.draftKey);
    }

    if (response.companyId) {
      this.companyId = response.companyId;
    }

    this.error = meaningfulMessages[0] || fallback;
    this.errorReasons = reasons.length ? reasons : meaningfulMessages.slice(1);
  }

  private clearError(): void {
    this.error = '';
    this.errorReasons = [];
  }
}
