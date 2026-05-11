import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  PrometheusBrainApproval,
  PrometheusBrainEvent,
  PrometheusBrainPromptRequest,
  PrometheusBrainPromptResponse,
  UpdateBrainSettingsPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class BrainApiService {
  constructor(private readonly http: HttpClient) {}

  sendPrompt(payload: PrometheusBrainPromptRequest): Observable<PrometheusBrainPromptResponse> {
    return this.http.post<PrometheusBrainPromptResponse>('brain/prompt', payload);
  }

  listEvents(): Observable<PrometheusBrainEvent[]> {
    return this.http.get<PrometheusBrainEvent[]>('brain/events');
  }

  listApprovals(): Observable<PrometheusBrainApproval[]> {
    return this.http.get<PrometheusBrainApproval[]>('brain/approvals');
  }

  approve(approvalId: string): Observable<PrometheusBrainApproval> {
    return this.http.patch<PrometheusBrainApproval>(`brain/approvals/${approvalId}/approve`, {});
  }

  reject(approvalId: string): Observable<PrometheusBrainApproval> {
    return this.http.patch<PrometheusBrainApproval>(`brain/approvals/${approvalId}/reject`, {});
  }

  updateSettings(payload: UpdateBrainSettingsPayload): Observable<unknown> {
    return this.http.patch('brain/settings', payload);
  }
}
