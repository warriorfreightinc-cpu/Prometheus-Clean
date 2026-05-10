import { ApiProperty, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { ResponseCarrierStopDTO } from "./stop.dto";



export class SearchDTO {
  @IsInt()
  @ApiProperty({description: 'Data about origin.'})
  @Type(() => Number)
  readonly length: number;

  @IsString()
  @ApiProperty({description: 'Capacity.',enum: ['Full','Both','Partial']})
  @Type(() => String)
  readonly capacity: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  readonly capacitySearch: String;

  @IsInt()
  @ApiProperty({description: 'Weight.'})
  @Type(() => Number)
  readonly weight: number;

  @IsArray()
  @ApiProperty({description: 'Equipment types.',enum: ['Van','Reefer','Flatbed','Container','Step Deck','Power Only']})
  @Type(() => Array)
  readonly equipment: Array<string>;

  @IsObject()
  @ApiProperty({description: 'Origin data.'})
  @Type(() => Object)
  readonly origin: object;

  @IsObject()
  @ApiProperty({description: 'Destination data.'})
  @Type(() => Object)
  readonly destination: object;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly dhoRadius: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  readonly dhdRadius: number;

  @IsOptional()
  @IsArray()
  @Type(() => ResponseCarrierStopDTO)
  readonly stops: ResponseCarrierStopDTO ;
}
