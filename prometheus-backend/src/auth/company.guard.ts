import { Injectable, ExecutionContext, ForbiddenException, NotAcceptableException, CanActivate, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "@nestjs/passport";
import { Observable } from "rxjs";
import { Messages } from "src/shared/messages/messages.model";


@Injectable()
export class JwtCompanyGuard implements CanActivate {
    constructor(private readonly reflector: Reflector, private jwtService: JwtService) {

    }

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {

        return new Promise((resolve, reject) => {

            const request = context.switchToHttp().getRequest();
            const key = request.query.key

            if (!key)
                throw new UnauthorizedException()

            let decoded: any
            try {
                decoded = this.jwtService.verify(key)
                request.companyId = decoded.companyId
                resolve(true)
            } catch (err) {
                throw new UnauthorizedException()
            }
        })


    }
}
