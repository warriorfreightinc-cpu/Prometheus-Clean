import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(
    private readonly session: AuthSessionService,
    private readonly router: Router
  ) {}

  canActivate(): Observable<boolean | UrlTree> {
    if (!this.session.isAuthenticated()) {
      return of(true);
    }

    if (this.session.currentUser) {
      return of(this.router.createUrlTree(['/workspace']));
    }

    this.session.hydrateFromToken();
    return of(true);
  }
}
