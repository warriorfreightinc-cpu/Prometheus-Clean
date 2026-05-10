import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AssistantRoomResponse,
  CreateMatchSnapshotPayload,
  MatchingAssistantEvent,
  MatchSnapshot,
  MatchSourcePostType,
  OpportunityActionPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class MatchingApiService {
  constructor(private readonly http: HttpClient) {}

  createSnapshot(payload: CreateMatchSnapshotPayload): Observable<MatchSnapshot> {
    return this.http.post<MatchSnapshot>('matching/snapshots', payload);
  }

  getLatestSnapshot(sourcePostType: MatchSourcePostType, sourcePostId: string): Observable<MatchSnapshot | null> {
    return this.http.get<MatchSnapshot | null>(`matching/snapshots/latest/${sourcePostType}/${sourcePostId}`);
  }

  listAssistantEvents(): Observable<MatchingAssistantEvent[]> {
    return this.http.get<MatchingAssistantEvent[]>('matching/assistant/events');
  }

  sendAssistantCommand(payload: {
    prompt: string;
    sourcePostId?: string;
  }): Observable<MatchingAssistantEvent | AssistantRoomResponse> {
    return this.http.post<MatchingAssistantEvent | AssistantRoomResponse>('matching/assistant/command', payload);
  }

  updateOpportunityAction(
    opportunityId: string,
    payload: OpportunityActionPayload
  ): Observable<MatchingAssistantEvent | AssistantRoomResponse> {
    return this.http.patch<MatchingAssistantEvent | AssistantRoomResponse>(
      `matching/opportunities/${opportunityId}/action`,
      payload
    );
  }
}
