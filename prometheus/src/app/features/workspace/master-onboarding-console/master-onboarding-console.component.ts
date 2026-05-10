import { Component, OnInit } from '@angular/core';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CompanyApiService } from '../../../core/api/company-api.service';
import {
  CompanyOnboardingRecord,
  OnboardingDocumentType,
  OnboardingQueueGroup,
} from '../../../shared/types/models';

type MasterQueueTab = {
  id: OnboardingQueueGroup;
  label: string;
  metric: string;
  empty: string;
};

@Component({
  selector: 'app-master-onboarding-console',
  templateUrl: './master-onboarding-console.component.html',
  styleUrls: ['./master-onboarding-console.component.scss'],
})
export class MasterOnboardingConsoleComponent implements OnInit {
  readonly tabs: MasterQueueTab[] = [
    { id: 'pending', label: 'Pending paperwork', metric: 'Review', empty: 'No companies are waiting for paperwork review.' },
    { id: 'blocked', label: 'Blocked signup', metric: 'Gate', empty: 'No company signups are blocked right now.' },
    { id: 'waitingSetup', label: 'Waiting setup', metric: 'Pay/setup', empty: 'No approved companies are waiting on setup.' },
    { id: 'active', label: 'Active', metric: 'Live', empty: 'No active companies are visible yet.' },
    { id: 'inactive', label: 'Inactive / deleted', metric: 'Repair', empty: 'No inactive or deleted companies are in the queue.' },
  ];
  readonly documentTypes: OnboardingDocumentType[] = ['mc', 'insurance', 'hazmat'];

  activeTab: OnboardingQueueGroup = 'pending';
  queues: Record<OnboardingQueueGroup, CompanyOnboardingRecord[]> = {
    pending: [],
    blocked: [],
    waitingSetup: [],
    active: [],
    inactive: [],
  };
  selectedCompany: CompanyOnboardingRecord | null = null;
  loading = false;
  actionPending = false;
  error = '';
  message = '';
  correctionMessage = '';
  inactiveReason = '';
  deleteReason = '';
  restoreStatus: 'draft' | 'pending_review' | 'approved_waiting_setup' | 'active' | 'inactive' = 'pending_review';
  documentExpiration: Partial<Record<OnboardingDocumentType, string>> = {};
  documentNotes: Partial<Record<OnboardingDocumentType, string>> = {};
  rejectReasons: Partial<Record<OnboardingDocumentType, string>> = {};

  constructor(private readonly companyApi: CompanyApiService) {}

  ngOnInit(): void {
    this.loadQueues();
  }

  get activeCompanies(): CompanyOnboardingRecord[] {
    return this.queues[this.activeTab] ?? [];
  }

  get activeEmptyMessage(): string {
    return this.tabs.find((tab) => tab.id === this.activeTab)?.empty ?? 'No companies found.';
  }

  get totalCount(): number {
    return this.tabs.reduce((total, tab) => total + this.queues[tab.id].length, 0);
  }

  countFor(group: OnboardingQueueGroup): number {
    return this.queues[group]?.length ?? 0;
  }

  selectTab(tab: OnboardingQueueGroup): void {
    this.activeTab = tab;
    const currentStillVisible = this.selectedCompany
      ? this.activeCompanies.some((company) => company._id === this.selectedCompany?._id)
      : false;
    if (!currentStillVisible) {
      this.selectCompany(this.activeCompanies[0] ?? null);
    }
  }

  selectCompany(company: CompanyOnboardingRecord | null): void {
    this.selectedCompany = company;
    this.message = '';
    this.error = '';
    this.correctionMessage = '';
    this.inactiveReason = company?.deactivationReason ?? '';
    this.deleteReason = '';
    this.restoreStatus = this.restoreStatusFor(company);
    this.seedDocumentInputs();
    if (!company?._id) return;
    this.companyApi.getOnboardingCompany(company._id).subscribe({
      next: (detail) => {
        this.selectedCompany = detail;
        this.inactiveReason = detail.deactivationReason ?? '';
        this.restoreStatus = this.restoreStatusFor(detail);
        this.seedDocumentInputs();
      },
      error: () => {
        this.error = 'The selected company detail could not be loaded.';
      },
    });
  }

  refresh(): void {
    this.loadQueues(this.selectedCompany?._id);
  }

  verifyDocument(type: OnboardingDocumentType): void {
    const companyId = this.selectedCompany?._id;
    if (!companyId) return;
    this.runCompanyAction(
      this.companyApi.verifyOnboardingDocument(companyId, type, {
        expirationDate: this.documentExpiration[type] || undefined,
        notes: this.documentNotes[type] || undefined,
        source: 'manual',
      }),
      `${this.documentLabel(type)} verified.`
    );
  }

  rejectDocument(type: OnboardingDocumentType): void {
    const companyId = this.selectedCompany?._id;
    const reason = (this.rejectReasons[type] ?? '').trim();
    if (!companyId || !reason) {
      this.error = 'Add a reject reason before marking a document rejected.';
      return;
    }
    this.runCompanyAction(
      this.companyApi.rejectOnboardingDocument(companyId, type, {
        reason,
        notes: this.documentNotes[type] || undefined,
      }),
      `${this.documentLabel(type)} rejected.`
    );
  }

  approvePaperwork(): void {
    const companyId = this.selectedCompany?._id;
    if (!companyId) return;
    this.runCompanyAction(this.companyApi.approvePaperwork(companyId), 'Paperwork approved. Company moved to Waiting setup.', true);
  }

  requestCorrection(): void {
    const companyId = this.selectedCompany?._id;
    const message = this.correctionMessage.trim();
    if (!companyId || !message) {
      this.error = 'Write the correction message before sending it.';
      return;
    }
    this.runCompanyAction(this.companyApi.requestCorrection(companyId, message), 'Correction request sent.', true);
  }

  inactivateCompany(): void {
    const companyId = this.selectedCompany?._id;
    const reason = this.inactiveReason.trim();
    if (!companyId || !reason) {
      this.error = 'Add a reason before moving the company inactive.';
      return;
    }
    this.runCompanyAction(this.companyApi.inactivateCompany(companyId, reason), 'Company moved inactive.', true);
  }

  restoreCompany(): void {
    const companyId = this.selectedCompany?._id;
    if (!companyId) return;
    this.runCompanyAction(
      this.companyApi.restoreCompany(companyId, this.restoreStatus, 'Restored from master onboarding console.'),
      `Company restored to ${this.statusText(this.restoreStatus)}.`,
      true
    );
  }

  unlockBlockedCompany(): void {
    const companyId = this.selectedCompany?._id;
    if (!companyId) return;
    this.runCompanyAction(
      this.companyApi.restoreCompany(companyId, 'draft', 'Authority block released from master onboarding console.'),
      'Company signup unlocked. The applicant can continue with the saved onboarding request.',
      true
    );
  }

  softDeleteCompany(): void {
    const companyId = this.selectedCompany?._id;
    const reason = this.deleteReason.trim();
    if (!companyId || !reason) {
      this.error = 'Add a reason before soft deleting the company.';
      return;
    }
    this.runCompanyAction(this.companyApi.softDeleteCompany(companyId, reason), 'Company moved to deleted review.', true);
  }

  purgeCompany(): void {
    const company = this.selectedCompany;
    if (!company?._id || company.status !== 'deleted_pending_purge') return;
    const confirmed = window.confirm(`Delete ${company.name} forever? This removes the company, users, and uploaded files.`);
    if (!confirmed) return;

    this.actionPending = true;
    this.error = '';
    this.companyApi.purgeCompany(company._id).pipe(finalize(() => (this.actionPending = false))).subscribe({
      next: () => {
        this.message = `${company.name} was permanently deleted.`;
        this.selectedCompany = null;
        this.loadQueues();
      },
      error: (error) => this.handleActionError(error, 'The company could not be permanently deleted.'),
    });
  }

  resendSetupEmail(): void {
    const companyId = this.selectedCompany?._id;
    if (!companyId) return;
    this.actionPending = true;
    this.error = '';
    this.companyApi.resendSetupEmail(companyId).pipe(finalize(() => (this.actionPending = false))).subscribe({
      next: () => {
        this.message = 'Setup email resent.';
        this.refresh();
      },
      error: (error) => this.handleActionError(error, 'The setup email could not be sent.'),
    });
  }

  statusLabel(company: CompanyOnboardingRecord | null): string {
    return this.statusText(company?.status ?? company?.onboarding?.status ?? 'draft');
  }

  statusClass(company: CompanyOnboardingRecord | null): string {
    const status = company?.status ?? company?.onboarding?.status ?? '';
    if (status === 'active' || status === 'activated') return 'status-chip--active';
    if (status === 'inactive' || status === 'deactivated' || status === 'deleted_pending_purge') return 'status-chip--danger';
    if (status === 'blocked') return 'status-chip--danger';
    if (status === 'correction_needed') return 'status-chip--warning';
    return 'status-chip--pending';
  }

  companyMeta(company: CompanyOnboardingRecord): string {
    return `${this.companyTypeLabel(company.type)} | DOT ${company.dot || 'n/a'} | MC ${company.mc || 'n/a'}`;
  }

  contactLine(company: CompanyOnboardingRecord): string {
    const name = [company.contactPerson?.firstName, company.contactPerson?.lastName].filter(Boolean).join(' ');
    return [name, company.email].filter(Boolean).join(' | ');
  }

  documentLabel(type: OnboardingDocumentType): string {
    if (type === 'mc') return 'MC authority';
    if (type === 'insurance') return 'Insurance certificate';
    return 'HAZMAT authority';
  }

  documentStatus(type: OnboardingDocumentType): string {
    return this.statusText(this.documentRecord(type)?.status ?? 'missing');
  }

  documentSource(type: OnboardingDocumentType): string {
    return this.sourceText(this.documentRecord(type)?.source ?? 'manual');
  }

  documentFileLabel(type: OnboardingDocumentType): string {
    const record = this.documentRecord(type);
    const legacy = this.legacyFile(type);
    return record?.fileName || legacy?.name || 'No upload recorded';
  }

  documentPreviewUrl(type: OnboardingDocumentType): string {
    const companyId = this.selectedCompany?._id;
    const legacy = this.legacyFile(type);
    const fileType = legacy?.name ?? this.legacyFileKey(type);
    return companyId ? `${environment.apiBaseUrl}company/preview/${companyId}/${fileType}` : '';
  }

  canPreviewDocument(type: OnboardingDocumentType): boolean {
    return !!this.selectedCompany?._id && !!this.legacyFile(type);
  }

  formatDate(value: unknown): string {
    if (!value) return 'Not set';
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? 'Not set' : parsed.toLocaleDateString();
  }

  blockedReasons(company: CompanyOnboardingRecord | null = this.selectedCompany): string[] {
    return company?.onboarding?.blockedReasons?.length
      ? company.onboarding.blockedReasons
      : company?.deactivationReason
        ? [company.deactivationReason]
        : [];
  }

  isBlockedCompany(company: CompanyOnboardingRecord | null = this.selectedCompany): boolean {
    return (company?.status ?? company?.onboarding?.status) === 'blocked';
  }

  private loadQueues(preferredCompanyId = ''): void {
    this.loading = true;
    this.error = '';
    forkJoin({
      pending: this.companyApi.getOnboardingQueue('pending').pipe(catchError(() => of([] as CompanyOnboardingRecord[]))),
      blocked: this.companyApi.getOnboardingQueue('blocked').pipe(catchError(() => of([] as CompanyOnboardingRecord[]))),
      waitingSetup: this.companyApi.getOnboardingQueue('waitingSetup').pipe(catchError(() => of([] as CompanyOnboardingRecord[]))),
      active: this.companyApi.getOnboardingQueue('active').pipe(catchError(() => of([] as CompanyOnboardingRecord[]))),
      inactive: this.companyApi.getOnboardingQueue('inactive').pipe(catchError(() => of([] as CompanyOnboardingRecord[]))),
    }).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (queues) => {
        this.queues = queues;
        const allCompanies = this.tabs.flatMap((tab) => queues[tab.id]);
        const preferred = preferredCompanyId
          ? allCompanies.find((company) => company._id === preferredCompanyId)
          : null;
        const nextSelection = preferred ?? this.activeCompanies[0] ?? allCompanies[0] ?? null;
        this.selectCompany(nextSelection);
      },
      error: () => {
        this.error = 'The onboarding queues could not be loaded.';
      },
    });
  }

  private runCompanyAction(request$: ReturnType<CompanyApiService['approvePaperwork']>, successMessage: string, reloadQueues = false): void {
    this.actionPending = true;
    this.error = '';
    this.message = '';
    request$.pipe(finalize(() => (this.actionPending = false))).subscribe({
      next: (company) => {
        this.selectedCompany = company;
        this.seedDocumentInputs();
        this.message = successMessage;
        if (reloadQueues) this.loadQueues(company._id);
      },
      error: (error) => this.handleActionError(error, 'The onboarding action could not be completed.'),
    });
  }

  private handleActionError(error: any, fallback: string): void {
    const backendMessage = Array.isArray(error?.error?.message)
      ? error.error.message.join(', ')
      : error?.error?.message;
    this.error = backendMessage || fallback;
  }

  private seedDocumentInputs(): void {
    this.documentTypes.forEach((type) => {
      const record = this.documentRecord(type);
      this.documentExpiration[type] = this.inputDate(record?.expirationDate);
      this.documentNotes[type] = record?.notes ?? '';
      this.rejectReasons[type] = record?.rejectionReason ?? '';
    });
  }

  private documentRecord(type: OnboardingDocumentType) {
    return this.selectedCompany?.onboarding?.documents?.[type] ?? null;
  }

  private legacyFile(type: OnboardingDocumentType): { name: string; ext: string } | null {
    const files = this.selectedCompany?.filesNames ?? {};
    return files[this.legacyFileKey(type)] ?? files[type] ?? null;
  }

  private legacyFileKey(type: OnboardingDocumentType): string {
    if (type === 'mc') return 'MC-Authority';
    if (type === 'insurance') return 'Insurance-Certificate';
    return 'HAZMAT-Authority';
  }

  private inputDate(value: unknown): string {
    if (!value) return '';
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  private restoreStatusFor(company: CompanyOnboardingRecord | null): 'draft' | 'pending_review' | 'approved_waiting_setup' | 'active' | 'inactive' {
    const status = company?.onboarding?.previousStatus || company?.status;
    if (status === 'blocked' || status === 'draft') return 'draft';
    if (status === 'approved_waiting_setup') return 'approved_waiting_setup';
    if (status === 'active' || status === 'activated') return 'active';
    if (status === 'inactive' || status === 'deactivated') return 'inactive';
    return 'pending_review';
  }

  private statusText(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Draft',
      blocked: 'Blocked signup',
      pending: 'Pending review',
      pending_review: 'Pending review',
      correction_needed: 'Correction needed',
      unpaid: 'Waiting setup',
      approved_waiting_setup: 'Waiting setup',
      activated: 'Active',
      active: 'Active',
      deactivated: 'Inactive',
      inactive: 'Inactive',
      deleted_pending_purge: 'Deleted review',
      missing: 'Missing',
      verified: 'Verified',
      rejected: 'Rejected',
      expired: 'Expired',
    };
    return labels[status] ?? status;
  }

  private sourceText(source: string): string {
    const labels: Record<string, string> = {
      manual: 'Manual review',
      highway: 'Highway',
      mycarrierpacket: 'MyCarrierPacket',
      truckstop: 'Truckstop',
      other: 'Other',
    };
    return labels[source] ?? source;
  }

  private companyTypeLabel(type: string): string {
    if (type === 'both') return 'Carrier & Broker';
    return type ? `${type.slice(0, 1).toUpperCase()}${type.slice(1)}` : 'Company';
  }
}
