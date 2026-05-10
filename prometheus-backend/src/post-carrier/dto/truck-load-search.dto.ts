import { ApiProperty, ApiPropertyOptional, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsArray, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { StopsCarrier } from "../interface/stops.interface";
import { CreateStopDTO } from "./create-post-stop.dto";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";



export class LoadTruckSearchDTO {

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Lenght of the truck.' })
  readonly length: number;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Comment.' })
  readonly comment: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Reference number of the post.' })
  readonly refNum: string;

  @IsOptional()
  @ApiPropertyOptional()
  readonly publishedAt: Date;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional()
  readonly publisherId: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Capacity.', enum: ['Full', 'Both', 'Partial'] })
  readonly capacity: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Truck weight.' })
  readonly weight: number;


  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Dead Head Origin radius.' })
  readonly dhoRadius: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Dead Head Destination radius..' })
  readonly dhdRadius: number;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Equipment types.', enum: ['Van', 'Reefer', 'Flatbed', 'Container', 'Step Deck', 'Power Only'] })
  readonly equipment: string[];

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Company Name.' })
  readonly company: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({ description: 'Publisher contact.' })
  readonly contact: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional()
  readonly startDate: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional()
  readonly endDate: string;

  //   @IsDate()
  // @Type(() => Date)
  // @ApiProperty()
  // readonly date: Date;
  @IsOptional()
  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiPropertyOptional({ description: 'Data about origin.' })
  readonly origin: OriginDestinationDTO;

  @IsOptional()
  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiPropertyOptional({ description: 'Data about destination.' })
  readonly destination: OriginDestinationDTO;
}
