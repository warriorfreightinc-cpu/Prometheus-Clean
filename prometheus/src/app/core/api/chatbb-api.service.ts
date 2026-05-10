import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  ChatbbMessageResponse,
  ChatbbRuntimeStatus,
  ChatbbThreadResponse,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class ChatbbApiService {
  constructor(private readonly http: HttpClient) {}

  getRuntimeStatus(): Observable<ChatbbRuntimeStatus> {
    return this.http.get<ChatbbRuntimeStatus>('chatbb/runtime');
  }

  getThread(carrierPostId: string, brokerPostId: string): Observable<ChatbbThreadResponse> {
    return this.http.get<ChatbbThreadResponse>('chatbb/thread', {
      params: { carrierPostId, brokerPostId },
    });
  }

  getContext(payload: { carrierPostId: string; brokerPostId: string }): Observable<unknown> {
    return this.http.post('chatbb/context', payload);
  }

  createMessage(payload: {
    carrierPostId: string;
    brokerPostId: string;
    prompt: string;
    previewOnly?: boolean;
  }): Observable<ChatbbMessageResponse> {
    return this.http.post<ChatbbMessageResponse>('chatbb/message', payload);
  }
}
