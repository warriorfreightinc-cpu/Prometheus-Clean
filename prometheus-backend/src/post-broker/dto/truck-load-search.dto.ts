import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { OriginDestinationDTO } from "./origin-destination.dto";




export class LoadTruckSearchDTO {

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Lenght of the truck.' })
  readonly length: number;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Comment.' })
  readonly comment: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Reference number of the post.' })
  readonly refNum: string;

  @IsOptional()
  @ApiProperty()
  readonly publishedAt: Date;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty()
  readonly publisherId: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Capacity.', enum: ['Full', 'Both', 'Partial'] })
  readonly capacity: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Capacity.', enum: ['Full', 'Both', 'Partial'] })
  readonly capacitySearch: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Truck weight.' })
  readonly weight: number;


  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Dead Head Origin radius.' })
  readonly dhoRadius: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Dead Head Destination radius..' })
  readonly dhdRadius: number;

  @IsOptional()
  @IsArray()
  @Type(() => String)
  @ApiProperty({ description: 'Equipment types.', enum: ['Van', 'Reefer', 'Flatbed', 'Container', 'Step Deck', 'Power Only'] })
  readonly equipment: string[];

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Company Name.' })
  readonly company: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Publisher contact.' })
  readonly contact: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty()
  readonly startDate: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty()
  readonly endDate: string;

  @IsOptional()
  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about origin.' })
  readonly origin: OriginDestinationDTO;

  @IsOptional()
  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about destination.' })
  readonly destination: OriginDestinationDTO;
}
