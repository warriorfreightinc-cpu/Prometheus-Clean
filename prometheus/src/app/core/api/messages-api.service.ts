import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  CreateDirectRoomResponse,
  DirectMessage,
  DirectRoomResponse,
  ExecuteRoomIntegrationPayload,
  InboxDot,
  RoomIntegrationChoicesResponse,
  RoomIntegrationExecutionResponse,
  UpdateDirectRoomBookingPayload,
  UpdateDirectRoomWorkflowPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class MessagesApiService {
  constructor(private readonly http: HttpClient) {}

  getRooms(payload: { postId: string }): Observable<DirectRoomResponse[]> {
    return this.http.post<DirectRoomResponse[]>('messages/rooms', payload);
  }

  getMessages(payload: { carrierPostId: string; brokerPostId: string }): Observable<DirectMessage[]> {
    return this.http.post<DirectMessage[]>('messages/all', payload);
  }

  clearCount(payload: { carrierPostId: string; brokerPostId: string }): Observable<unknown> {
    return this.http.post('messages/clearCount', payload);
  }

  getNewMessageDot(): Observable<InboxDot[]> {
    return this.http.post<InboxDot[]>('messages/new-messages', {});
  }

  createRoom(payload: { myPostId: string; otherPostId: string; otherUserId: string }): Observable<CreateDirectRoomResponse> {
    return this.http.post<CreateDirectRoomResponse>('messages/room', payload);
  }

  updateBookingStatus(payload: UpdateDirectRoomBookingPayload): Observable<DirectRoomResponse> {
    return this.http.patch<DirectRoomResponse>('messages/room/booking', payload);
  }

  updateBookingWorkflow(payload: UpdateDirectRoomWorkflowPayload): Observable<DirectRoomResponse> {
    return this.http.patch<DirectRoomResponse>('messages/room/workflow', payload);
  }

  getRoomIntegrationChoices(payload: { brokerPostId: string; carrierPostId: string }): Observable<RoomIntegrationChoicesResponse> {
    return this.http.get<RoomIntegrationChoicesResponse & {
      setupChoices?: RoomIntegrationChoicesResponse['setup'];
      trackingChoices?: RoomIntegrationChoicesResponse['tracking'];
    }>('company/integrations/room', { params: payload }).pipe(
      map((response) => ({
        setup: response.setup ?? response.setupChoices ?? [],
        tracking: response.tracking ?? response.trackingChoices ?? [],
      }))
    );
  }

  executeRoomIntegration(payload: ExecuteRoomIntegrationPayload): Observable<RoomIntegrationExecutionResponse> {
    return this.http.post<RoomIntegrationExecutionResponse>('company/integrations/room/execute', payload);
  }

  createMessage(payload: {
    text: string;
    type: 'message' | 'bid';
    carrierPostId: string;
    brokerPostId: string;
    role: string;
  }): Observable<unknown> {
    return this.http.post('messages', payload);
  }
}
