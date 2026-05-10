import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { CompanyService } from "src/company/company.service";

@Injectable()
export class HistoryInterceptor implements NestInterceptor {
  constructor(private service: CompanyService){

  }
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if(!context.switchToHttp().getRequest().user){
      return next.handle();
    }
    // if(context.switchToHttp().getRequest().route.path === '/company' ){
     
    //   //this.service;
    //   return next.handle();
    // }
    if ((context.switchToHttp().getRequest().user?.role === 'admin') && (context.switchToHttp().getRequest().method === 'POST' ||  context.switchToHttp().getRequest().method === 'PATCH')) {
      let operation ;
      if(context.switchToHttp().getRequest().method === 'POST' && context.switchToHttp().getRequest().body.firstName){
        operation = 'Create new user'
      }else{
        operation = 'Subscription change'
      }
      if(context.switchToHttp().getRequest().method === 'PATCH'){
        operation = 'Update user'
      }
      this.service.addAdminActivity(context.switchToHttp().getRequest().user.companyId,context.switchToHttp().getRequest().user.email,operation)
      const now = Date.now();
      return next.handle();
    } else {
      return next.handle();
    }
  }
}
