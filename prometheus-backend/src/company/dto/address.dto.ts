import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class AddressDTO{
    @ApiProperty()
    @IsString()
    readonly country:string

    @ApiProperty()
    @IsString()
    readonly city:string

    @ApiProperty()
    @IsString()
    readonly street:string

    @ApiProperty()
    @IsString()
    readonly zip:string

    @ApiProperty()
    @IsString()
    @IsOptional()
    readonly state:string
}