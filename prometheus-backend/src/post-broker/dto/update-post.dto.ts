import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString } from "class-validator";

import { OriginDestinationDTO } from "./origin-destination.dto";


export class UpdateBrokerPostDTO {

  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'post' })
  readonly _id: string;


  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Lenght of the truck.' })
  readonly length: number;

  @IsOptional()
  @IsString()
  // @ApiProperty({ description: 'Capacity.', enum: ['full', 'partial', 'both'] })
  capacitySearch: string;

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
  @IsBoolean()
  @Type(() => Boolean)
  @ApiProperty({ description: 'Tanker endorsement of the post.' })
  readonly tankerEndorsement: Boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @ApiProperty({ description: 'Non hazmat endorsement of the post.' })
  readonly nonHazmat: Boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  @ApiProperty({ description: 'Team needed of the post.' })
  readonly team: Boolean;


  @ApiProperty()
  readonly publishedAt: Date;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty()
  readonly publisherId: string;

  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Capacity.', enum: ['Full', 'Both', 'Partial'] })
  readonly capacity: string;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Truck weight.' })
  readonly weight: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Distance between origin and destination.' })
  readonly distance: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Load rate.' })
  readonly rate: number;

  @IsArray()
  @Type(() => Array)
  @ApiProperty({ description: 'Equipment types.', enum: ['Van', 'Reefer', 'Flatbed', 'Container', 'Step Deck', 'Power Only'] })
  readonly equipment: Array<string>;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Company Name.' })
  readonly company: string;

  @IsString()
  @Type(() => String)
  @ApiProperty({ description: 'Publisher contact.' })
  readonly contact: string;

  @IsArray()
  @ApiProperty({ description: 'Stops between origin and destination.' })
  readonly stops: [{}];

  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about origin.' })
  readonly origin: OriginDestinationDTO;

  @IsOptional()
  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about destination.' })
  readonly destination: OriginDestinationDTO;

  @IsOptional()
  @IsObject()
  @ApiProperty({ description: 'Data about destination.' })
  readonly companyData: OriginDestinationDTO;
}
