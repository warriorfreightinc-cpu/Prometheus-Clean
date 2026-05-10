import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  CompanyDraft,
  CompanyIntegrationRecord,
  CompanyOnboardingRecord,
  CompanySetupStatus,
  CompanyUser,
  CreateCompanyUserPayload,
  OnboardingDocumentType,
  OnboardingQueueGroup,
  StateOption,
  StripeProductOption,
  UpsertCompanyIntegrationPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class CompanyApiService {
  constructor(private readonly http: HttpClient) {}

  createCompany(payload: Partial<CompanyDraft>): Observable<any> {
    return this.http.post('company', payload);
  }

  updateCompany(payload: Partial<CompanyDraft>, key: string): Observable<any> {
    return this.http.patch('company', payload, { params: { key } });
  }

  getDraftCompany(key: string): Observable<any> {
    return this.http.get('company/draft', { params: { key } });
  }

  deleteDraftCompany(key: string): Observable<any> {
    return this.http.delete('company', { params: { key } });
  }

  uploadFile(formData: FormData, type: string, key: string): Observable<any> {
    return this.http.post(`company/upload/${type}`, formData, { params: { key } });
  }

  createAdmin(payload: unknown, key: string): Observable<any> {
    return this.http.post('users/admin', payload, { params: { key } });
  }

  getDraftAdmin(key: string): Observable<any> {
    return this.http.get('users/draft/admin', { params: { key } });
  }

  updateDraftAdmin(payload: unknown, key: string): Observable<any> {
    return this.http.patch('users/draft/admin', payload, { params: { key } });
  }

  completeCompany(key: string): Observable<any> {
    return this.http.patch('company/pending', {}, { params: { key } });
  }

  getOnboardingQueue(group: OnboardingQueueGroup): Observable<CompanyOnboardingRecord[]> {
    return this.http.get<CompanyOnboardingRecord[]>(`company/onboarding/queue/${group}`);
  }

  getOnboardingCompany(companyId: string): Observable<CompanyOnboardingRecord> {
    return this.http.get<CompanyOnboardingRecord>(`company/onboarding/${companyId}`);
  }

  verifyOnboardingDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    payload: { expirationDate?: string; notes?: string; source?: string }
  ): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(
      `company/onboarding/${companyId}/document/${documentType}/verify`,
      payload
    );
  }

  rejectOnboardingDocument(
    companyId: string,
    documentType: OnboardingDocumentType,
    payload: { reason: string; notes?: string }
  ): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(
      `company/onboarding/${companyId}/document/${documentType}/reject`,
      payload
    );
  }

  approvePaperwork(companyId: string): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(`company/onboarding/${companyId}/approve-paperwork`, {});
  }

  requestCorrection(companyId: string, message: string): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(`company/onboarding/${companyId}/request-correction`, { message });
  }

  inactivateCompany(companyId: string, reason: string): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(`company/onboarding/${companyId}/inactivate`, { reason });
  }

  restoreCompany(companyId: string, status: string, reason?: string): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(`company/onboarding/${companyId}/restore`, { status, reason });
  }

  softDeleteCompany(companyId: string, reason: string): Observable<CompanyOnboardingRecord> {
    return this.http.patch<CompanyOnboardingRecord>(`company/onboarding/${companyId}/soft-delete`, { reason });
  }

  purgeCompany(companyId: string): Observable<{ result: string }> {
    return this.http.delete<{ result: string }>(`company/onboarding/${companyId}/purge`);
  }

  resendSetupEmail(companyId: string): Observable<{ result: string }> {
    return this.http.post<{ result: string }>(`company/onboarding/${companyId}/resend-setup-email`, {});
  }

  getCompanySetupStatus(): Observable<CompanySetupStatus> {
    return this.http.get<CompanySetupStatus>('company/setup/status');
  }

  getCompanyIntegrations(): Observable<CompanyIntegrationRecord[]> {
    return this.http.get<CompanyIntegrationRecord[]>('company/integrations');
  }

  upsertCompanyIntegration(payload: UpsertCompanyIntegrationPayload): Observable<CompanyIntegrationRecord> {
    return this.http.post<CompanyIntegrationRecord>('company/integrations', payload);
  }

  updateCompanyIntegration(
    id: string,
    payload: Partial<UpsertCompanyIntegrationPayload>
  ): Observable<CompanyIntegrationRecord> {
    return this.http.patch<CompanyIntegrationRecord>(`company/integrations/${id}`, payload);
  }

  disableCompanyIntegration(id: string): Observable<CompanyIntegrationRecord> {
    return this.http.delete<CompanyIntegrationRecord>(`company/integrations/${id}`);
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

  getBillingPortalSession(): Observable<{ sessionUrl: string }> {
    return this.http.get<{ sessionUrl: string }>('subscriptions/portal');
  }

  getStates(country: string): Observable<StateOption[]> {
    return this.http.get<StateOption[]>('states/list').pipe(
      map((states) => states.filter((state) => state.country === country))
    );
  }
}
