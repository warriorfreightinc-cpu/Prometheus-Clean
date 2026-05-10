import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  BrokerPostUpsertPayload,
  CarrierPostUpsertPayload,
  PostSearchPayload,
  WorkspacePost,
} from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class PostsApiService {
  constructor(private readonly http: HttpClient) {}

  getBrokerPosts(userId: string, type = 'mine'): Observable<WorkspacePost[]> {
    return this.http.get<WorkspacePost[]>(`broker/${type}/${userId}`);
  }

  getCarrierPosts(userId: string, type = 'mine'): Observable<WorkspacePost[]> {
    return this.http.get<WorkspacePost[]>(`carrier/${type}/${userId}`);
  }

  getBrokerPost(postId: string): Observable<WorkspacePost> {
    return this.http.get<WorkspacePost>(`broker/post/${postId}`);
  }

  getCarrierPost(postId: string): Observable<WorkspacePost> {
    return this.http.get<WorkspacePost>(`carrier/post/${postId}`);
  }

  searchBrokerPosts(payload: PostSearchPayload): Observable<WorkspacePost[]> {
    return this.http.post<WorkspacePost[]>('broker/search', payload);
  }

  searchCarrierPosts(payload: PostSearchPayload): Observable<WorkspacePost[]> {
    return this.http.post<WorkspacePost[]>('carrier/search', payload);
  }

  createBrokerPost(payload: BrokerPostUpsertPayload): Observable<WorkspacePost> {
    return this.http.post<WorkspacePost>('broker', payload);
  }

  createCarrierPost(payload: CarrierPostUpsertPayload): Observable<WorkspacePost> {
    return this.http.post<WorkspacePost>('carrier', payload);
  }

  updateBrokerPost(payload: BrokerPostUpsertPayload): Observable<WorkspacePost> {
    return this.http.patch<WorkspacePost>('broker', payload);
  }

  updateCarrierPost(payload: CarrierPostUpsertPayload): Observable<WorkspacePost> {
    return this.http.patch<WorkspacePost>('carrier', payload);
  }

  deleteBrokerPost(postId: string): Observable<unknown> {
    return this.http.delete(`broker/${postId}`);
  }

  deleteCarrierPost(postId: string): Observable<unknown> {
    return this.http.delete(`carrier/${postId}`);
  }
}
