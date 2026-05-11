import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthSessionService } from '../auth/auth-session.service';

@Injectable()
export class ApiInterceptor implements HttpInterceptor {
  constructor(
    private readonly session: AuthSessionService,
    private readonly router: Router
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    let nextReq = req;
    const isAbsolute = /^https?:\/\//i.test(req.url);

    if (!isAbsolute && !req.url.startsWith('assets/')) {
      nextReq = req.clone({
        url: `${environment.apiBaseUrl}${req.url}`,
      });
    }

    if (this.session.token) {
      nextReq = nextReq.clone({
        setHeaders: {
          Authorization: `Bearer ${this.session.token}`,
        },
      });
    }

    return next.handle(nextReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if ([401, 406].includes(error.status)) {
          this.session.clear();
          this.router.navigate(['/sign-in']);
        }
        return throwError(() => error);
      })
    );
  }
}
