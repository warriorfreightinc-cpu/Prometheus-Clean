import { ApiProperty } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsEmail, IsString } from "class-validator"

export class ContactPersonDTO{
    @ApiProperty()
    @IsString()
    readonly firstName:string

    @ApiProperty()
    @IsString()
    readonly lastName:string

    @ApiProperty()
    @IsString()
    @IsEmail()
    @Transform((from: any) => {
        //console.log(from.obj.email);
        return from.obj.email.toLowerCase()
      })
    readonly email:string

    @ApiProperty()
    @IsString()
    readonly phone:string

    @ApiProperty()
    @IsString()
    readonly verificationPhone:string

    @ApiProperty()
    @IsString()
    readonly role:string

}
