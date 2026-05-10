import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly session: AuthSessionService,
    private readonly router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    if (!this.session.isAuthenticated()) {
      return of(this.router.createUrlTree(['/sign-in']));
    }

    if (this.session.currentUser) {
      return of(true);
    }

    this.session.hydrateFromToken();
    return of(true);
  }
}
