import { Type } from "class-transformer";
import { IsArray, IsInt, IsNumber, IsObject, IsOptional, IsString } from "class-validator";



export class SearchDTO {
  @IsInt()
  @Type(() => Number)
  readonly length: number;

  @IsOptional()
  @IsString()
  @Type(() => String)
  readonly capacitySearch: String;

  @IsOptional()
  @IsString()
  @Type(() => String)
  readonly capacity: String;
  
  @IsInt()
  @Type(() => Number)
  readonly weight: number;

  @IsArray()
  @Type(() => Array)
  readonly equipment: Array<string>;

  @IsObject()
  @Type(() => Object)
  readonly origin: object;

  @IsOptional()
  @IsString()
  @Type(() => String)
  readonly startDate: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  readonly endDate: string;

  @IsOptional()
  @IsObject()
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
}
