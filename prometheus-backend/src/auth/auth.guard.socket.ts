import { Injectable, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";

@Injectable()
export class JwtAuthGuardSocket extends AuthGuard("jwt-socket") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic: boolean = this.reflector.get<boolean>("isPublic", context.getHandler());

    if (isPublic) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const res: any = super.canActivate(context);
      res
        .then(() => {
          const roles = this.reflector.get<string[]>("roles", context.getHandler());
          const request = context.switchToWs().getClient();
          const user = request.user;

          if (roles) {
            if (user && user.role && roles.includes(user.role)) {
              resolve(true);
            } else {
              reject(new ForbiddenException());
            }
          } else {
            resolve(true);
          }
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}
