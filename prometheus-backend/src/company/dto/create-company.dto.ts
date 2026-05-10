import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsInt, IsNotEmptyObject, IsOptional, IsString, Min, ValidateNested } from "class-validator";




import { AddressDTO } from "./address.dto";

import { Address, ContactPerson } from "../interface/company.interface";
import { ContactPersonDTO } from "./contact-person.dto";

export class CreateCompanyDTO {

@ApiPropertyOptional()
@IsOptional()
readonly adminId: any;

@ApiProperty()
@IsString()
readonly  name:string

@ApiPropertyOptional()
@IsString()
@IsOptional()
readonly dba?: string;

@ApiProperty()
@IsEmail()
@Transform((from: any) => {
    //console.log(from.obj.email);
    return from.obj.email.toLowerCase()
  })
readonly  email: string;

@ApiProperty()
@IsString()
readonly  phone:string;

@ApiProperty()
@IsString()
readonly  dot:string;

@ApiProperty()
@IsString()
readonly  mc:string;

@ApiProperty()
@Type(()=>AddressDTO)
@IsNotEmptyObject()
@ValidateNested()
readonly address:Address;

@ApiProperty()
@IsString()
readonly  type:string;

@ApiPropertyOptional()
@IsOptional()
@IsInt()
@Min(1)
readonly requestedSeats?: number;

@ApiPropertyOptional()
@IsString()
@IsOptional()
readonly  statusReason:string;

@ApiProperty()
@IsNotEmptyObject()
@ValidateNested()
@Type(()=>ContactPersonDTO)
readonly  contactPerson:ContactPerson

@ApiProperty()
readonly  filesNames:any
}
