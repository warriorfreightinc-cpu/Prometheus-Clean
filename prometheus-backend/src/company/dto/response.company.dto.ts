import { ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";



import { ResponseContactPersonDTO } from "./response-contact-person.dto";
import { ResponseAddressDTO } from "./response.address.dto";

@Exclude()
export class ResponseCompanyDTO {

  @Expose()
  @ApiResponseProperty()
  @Transform(( from: any) => {
    return from.obj._id}, { toClassOnly: false })
  readonly _id: string


  @ApiResponseProperty()
  @Expose()
  @Transform((from: any) => {
    return from.obj.adminId
  }, { toClassOnly: false })
  readonly adminId: any;
  
  @ApiResponseProperty()
  @Expose()
  readonly  name:string

  @ApiResponseProperty()
  @Expose()
  readonly dba?: string

  @ApiResponseProperty()
  @Expose()
  readonly  clientId:string
  
  @ApiResponseProperty()
  @Expose()
  readonly  email: string;
  
  @ApiResponseProperty()
  @Expose()
  readonly  phone:string;
  
  @ApiResponseProperty()
  @Expose()
  readonly  dot:string;
  
  @ApiResponseProperty()
  @Expose()
  readonly  mc:string;
  
  @ApiResponseProperty()
  @Expose()
  @Type(()=>ResponseAddressDTO)
  readonly  address:ResponseAddressDTO;
  
  @ApiResponseProperty()
  @Expose()
  readonly  type:string;



  @ApiResponseProperty()
  @Expose()
  readonly  status:string;

  @ApiResponseProperty()
  @Expose()
  readonly  deactivationReason:string;

  
  @ApiResponseProperty()
  @Expose()
  readonly  statusReason:string;
  
  @ApiResponseProperty()
  @Expose()
  @Type(()=>ResponseContactPersonDTO)
  readonly  contactPerson:ResponseContactPersonDTO

  @ApiResponseProperty()
  @Expose()
  readonly  subscription:any;

  @ApiResponseProperty()
  @Expose()
  readonly  filesUploaded:boolean;

  @ApiResponseProperty()
  @Expose()
  readonly  isWaiting:boolean;

  @ApiResponseProperty()
  @Expose()
  readonly  notes:any;

  @ApiResponseProperty()
  @Expose()
  readonly  filesNames:Object;

  @ApiResponseProperty()
  @Expose()
  readonly onboarding:any;

  @ApiResponseProperty()
  @Expose()
  readonly deletedAt?: Date;

  @ApiResponseProperty()
  @Expose()
  readonly deletedBy?: string;

  @ApiResponseProperty()
  @Expose()
  readonly  key:string;

  @ApiResponseProperty()
  @Expose()
  readonly activeUsers?: number;
}
