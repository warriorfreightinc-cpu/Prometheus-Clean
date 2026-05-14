import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  RoutingIntelligenceRequest,
  RoutingIntelligenceResponse,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class RoutingApiService {
  constructor(private readonly http: HttpClient) {}

  getRouteIntelligence(payload: RoutingIntelligenceRequest): Observable<RoutingIntelligenceResponse> {
    return this.http.post<RoutingIntelligenceResponse>('routing/intelligence', payload);
  }
}
