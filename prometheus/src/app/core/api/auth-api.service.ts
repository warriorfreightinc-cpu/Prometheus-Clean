import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { AuthUser } from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(private readonly http: HttpClient) {}

  signIn(credentials: { email: string; password: string; rememberMe: boolean }): Observable<{ token: string }> {
    return this.http.post<{ token: string }>('login', credentials);
  }

  checkLogin(credentials: { email: string; password: string }): Observable<boolean> {
    return this.http.post<boolean>('loginCheck', credentials);
  }

  sessionStatus(): Observable<{ active: boolean }> {
    return this.http.get<{ active: boolean }>('session-status');
  }

  me(): Observable<AuthUser> {
    return this.http
      .get<AuthUser & { _id?: string }>('users/me')
      .pipe(map((user) => ({ ...user, id: user.id || user._id || '' })));
  }

  signOut(): Observable<unknown> {
    return this.http.post('signOut', {});
  }
}
