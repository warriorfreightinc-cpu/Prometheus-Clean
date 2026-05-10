import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsInt, IsNotEmptyObject, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Address } from "cluster";
import { ContactPerson } from "../interface/company.interface";
import { AddressDTO } from "./address.dto";
import { ContactPersonDTO } from "./contact-person.dto";



export class UpdateCompanyDTO {
    @ApiPropertyOptional()
    @IsOptional()
    readonly adminId?: any;
    
    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly  name?:string

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    readonly dba?: string;
    
    @ApiProperty()
    @IsOptional()
    @Transform((from: any) => {
       // console.log(from.obj.email);
        return from.obj.email.toLowerCase()
      })
    readonly  email?: string;
    
    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly  phone?:string;
    
    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly  dot?:string;

    @ApiProperty()
    @IsOptional()
    readonly  filesNames?:Object;

    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly  mc?:string;
    
    @ApiProperty()
    @Type(()=>AddressDTO)
    @IsNotEmptyObject()
    @ValidateNested()
    @IsOptional()
    readonly address?:Address;
    
    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly  type?:string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(1)
    readonly requestedSeats?: number;
    
    
    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    readonly  statusReason?:string;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    readonly  filesUploaded?:boolean;
    
    
    @ApiProperty()
    @IsNotEmptyObject()
    @ValidateNested()
    @IsOptional()
    @Type(()=>ContactPersonDTO)
    readonly  contactPerson?:ContactPerson
}
