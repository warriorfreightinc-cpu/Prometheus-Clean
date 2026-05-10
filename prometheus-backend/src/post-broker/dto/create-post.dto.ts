import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { OriginDestinationDTO } from "./origin-destination.dto";



export class CreateBrokerPostDTO {

  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Load lenght.' })
  readonly length: number;

  @IsOptional()
  @IsString()
  // @ApiProperty()
  readonly publisherId: string;

  @IsString()
  @ApiProperty({ description: 'Capacity.', enum: ['Full', 'Partial'] })
  readonly capacity: string;

  @IsOptional()
  @IsString()
  // @ApiProperty({ description: 'Capacity.', enum: ['full', 'partial', 'both'] })
  capacitySearch: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Comment.' })
  readonly comment: string | null;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Book Url.' })
  readonly bookUrl: string | null;

  @IsString()
  @ApiProperty({ description: 'Publisher contact.' })
  readonly contact: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Reference number of the post.', nullable: true })
  readonly refNum: string | null;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Load weight.' })
  readonly weight: number;

  @IsArray()
  @ApiProperty({ description: 'Equipment types.', enum: ['Van', 'Reefer', 'Flatbed', 'Container', 'Step Deck', 'Power Only'] })
  readonly equipment: Array<string>;

  @IsOptional()
  @IsString()
  // @ApiProperty({ description: 'Company name.' })
  readonly company: string;

  @IsArray()
  @ApiProperty({ description: 'Stops between origin and destination.' })
  readonly stops: Array<Object>;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiPropertyOptional({ description: 'Load rate.' })
  readonly rate: number;


  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Distance between origin and destination.' })
  readonly distance: number;

  @IsArray()
  @ApiProperty({ description: 'Distance between stops.' })
  readonly stopsDistances: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  // @ApiPropertyOptional({ description: 'Search Dead Head Origin Radius' })
  readonly dhoRadius: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  // @ApiPropertyOptional({ description: 'Search Dead Head Destination Radius' })
  readonly dhdRadius: number;

  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about origin.' })
  readonly origin: OriginDestinationDTO;

  @IsObject()
  @Type(() => OriginDestinationDTO)
  @ApiProperty({ description: 'Data about destination.' })
  readonly destination: OriginDestinationDTO;

  @ApiProperty()
  readonly publishedAt: Date;

  @IsOptional()
  @IsBoolean()
  @ApiProperty()
  readonly tankerEndorsement: Boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty()
  readonly nonHazmat: Boolean;

  @IsOptional()
  @IsBoolean()
  @ApiProperty()
  readonly team: Boolean;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyMc: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyDot: string;
  
  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyName: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyFirstName: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyLastName: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyEmail: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  readonly companyPhone: string;
}
