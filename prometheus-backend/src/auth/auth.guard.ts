import { Injectable, ExecutionContext, ForbiddenException, NotAcceptableException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";
import { Messages } from "src/shared/messages/messages.model";


@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
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

          const request = context.switchToHttp().getRequest();
          const user = request.user;

          if (roles && !(user && user.role && roles.includes(user.role))) {
            reject(new ForbiddenException(Messages.NoRights));
          } else if (!user.isActive) {
            reject(new NotAcceptableException(Messages.BlockedAccount));
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
