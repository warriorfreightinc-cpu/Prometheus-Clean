import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!context.switchToHttp().getRequest().url.includes("/health-check")) {

      const now = Date.now();
      return next.handle().pipe(tap(() => console.log(`Request completed for ${Date.now() - now}ms`)));
    } else {
      return next.handle();
    }
  }
}
