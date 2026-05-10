import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreatePrometheusLoadFromRoomPayload,
  PrometheusLoad,
  UpdatePrometheusLoadPayload,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class LoadsApiService {
  constructor(private readonly http: HttpClient) {}

  getCompanyLoads(): Observable<PrometheusLoad[]> {
    return this.http.get<PrometheusLoad[]>('loads/company');
  }

  getLoad(loadId: string): Observable<PrometheusLoad> {
    return this.http.get<PrometheusLoad>(`loads/${loadId}`);
  }

  createFromRoom(payload: CreatePrometheusLoadFromRoomPayload): Observable<PrometheusLoad> {
    return this.http.post<PrometheusLoad>('loads/from-room', payload);
  }

  updateLoad(loadId: string, payload: UpdatePrometheusLoadPayload): Observable<PrometheusLoad> {
    return this.http.patch<PrometheusLoad>(`loads/${loadId}`, payload);
  }

  deleteLoad(loadId: string): Observable<{ deleted: boolean; loadId: string }> {
    return this.http.delete<{ deleted: boolean; loadId: string }>(`loads/${loadId}`);
  }
}
