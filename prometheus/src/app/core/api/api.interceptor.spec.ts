import { HttpErrorResponse, HttpHandler, HttpRequest } from '@angular/common/http';
import { throwError } from 'rxjs';
import { ApiInterceptor } from './api.interceptor';

describe('ApiInterceptor auth failures', () => {
  it('does not clear a valid session when a role-limited endpoint returns forbidden', (done) => {
    const session = {
      token: 'token-1',
      clear: jasmine.createSpy('clear'),
    };
    const router = {
      navigate: jasmine.createSpy('navigate'),
    };
    const handler = {
      handle: jasmine.createSpy('handle').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 403 }))
      ),
    };

    const interceptor = new ApiInterceptor(session as any, router as any);

    interceptor
      .intercept(new HttpRequest('GET', 'company/integrations'), handler as HttpHandler)
      .subscribe({
        next: () => fail('Expected request to fail.'),
        error: () => {
          expect(session.clear).not.toHaveBeenCalled();
          expect(router.navigate).not.toHaveBeenCalled();
          done();
        },
      });
  });

  it('clears the session when authentication is actually rejected', (done) => {
    const session = {
      token: 'token-1',
      clear: jasmine.createSpy('clear'),
    };
    const router = {
      navigate: jasmine.createSpy('navigate'),
    };
    const handler = {
      handle: jasmine.createSpy('handle').and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 401 }))
      ),
    };

    const interceptor = new ApiInterceptor(session as any, router as any);

    interceptor
      .intercept(new HttpRequest('GET', 'users/me'), handler as HttpHandler)
      .subscribe({
        next: () => fail('Expected request to fail.'),
        error: () => {
          expect(session.clear).toHaveBeenCalled();
          expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
          done();
        },
      });
  });
});
