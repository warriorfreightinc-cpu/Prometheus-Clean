import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap, timeout } from 'rxjs';
import { AuthApiService } from '../api/auth-api.service';
import { AuthUser } from '../../shared/types/models';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private readonly localTokenKey = 'prometheus.auth.local';
  private readonly sessionTokenKey = 'prometheus.auth.session';
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);

  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(private readonly authApi: AuthApiService) {}

  get token(): string {
    return sessionStorage.getItem(this.sessionTokenKey) || localStorage.getItem(this.localTokenKey) || '';
  }

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  setToken(token: string, rememberMe: boolean): void {
    this.clearToken();
    if (rememberMe) {
      localStorage.setItem(this.localTokenKey, token);
      return;
    }
    sessionStorage.setItem(this.sessionTokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.localTokenKey);
    sessionStorage.removeItem(this.sessionTokenKey);
  }

  setUser(user: AuthUser | null): void {
    this.currentUserSubject.next(user);
  }

  decodeToken(token: string): AuthUser | null {
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        companyId: decoded.companyId,
        isLogged: decoded.isLogged,
      };
    } catch {
      return null;
    }
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  hydrateFromToken(): void {
    const decoded = this.token ? this.decodeToken(this.token) : null;
    this.currentUserSubject.next(decoded);
  }

  restoreSession(): Observable<boolean> {
    if (!this.token) {
      this.currentUserSubject.next(null);
      return of(false);
    }

    return this.authApi.sessionStatus().pipe(
      switchMap(() => this.authApi.me()),
      timeout(5000),
      tap((user) => this.currentUserSubject.next(user)),
      map(() => true),
      catchError(() => {
        this.clear();
        return of(false);
      })
    );
  }

  signOut(): Observable<void> {
    return this.authApi.signOut().pipe(
      tap(() => this.clear()),
      map(() => void 0),
      catchError(() => {
        this.clear();
        return of(void 0);
      })
    );
  }

  clear(): void {
    this.clearToken();
    this.currentUserSubject.next(null);
  }
}
