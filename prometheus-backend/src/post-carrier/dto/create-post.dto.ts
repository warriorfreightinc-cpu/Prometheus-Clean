import { ApiProperty, ApiPropertyOptional, ApiQuery, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsDate, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { StopsCarrier } from "../interface/stops.interface";
import { CreateStopDTO } from "./create-post-stop.dto";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";
import { UserRoleEnum } from "src/user/enums/user-roles.enum";



export class CreateCarrierPostDTO {

  @IsNumber()
  @Type(() => Number)
  @ApiProperty({description: 'Lenght of the truck.'})
  readonly length: number;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({description: 'Comment.'})
  readonly comment: string;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiPropertyOptional({description: 'Reference number of the post.'})
  readonly refNum: string;

  @ApiProperty()
  readonly publishedAt: Date;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Distance between origin and destination.' })
  readonly distance: number;

  @IsOptional()
  @IsString()
  @Type(() => String)
  // @ApiProperty()
  readonly publisherId: string;

  @IsString()
  @Type(() => String)
  @ApiProperty({description: 'Capacity.',enum: ['Full','Both','Partial']})
  readonly capacity: string;

  @IsOptional()
  @Type(() => Boolean)
  @ApiPropertyOptional({description: 'Team.'})
  readonly team: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @ApiPropertyOptional({description: 'Non Tanker.'})
  readonly nonTanker: boolean;

  @IsOptional()
  @IsString()
  @Type(() => String)
  // @ApiProperty({description: 'CapacitySearch.',enum: ['Full','Both','Partial']})
   capacitySearch: string;


  @IsNumber()
  @Type(() => Number)
  @ApiProperty({description: 'Truck weight.'})
  readonly weight: number;


  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({description: 'Dead Head Origin radius.'})
  readonly dhoRadius: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({description: 'Dead Head Destination radius..'})
  readonly dhdRadius: number;


  @IsArray()
  @Type(() => Array)
  @ApiProperty({description: 'Equipment types.',enum: ['Van','Reefer','Flatbed','Container','Step Deck','Power Only']})
  readonly equipment: Array<string>;
  
  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty({description: 'Company Name.'})
  readonly company: string;

  @IsString()
  @Type(() => String)
  @ApiProperty({description: 'Publisher contact.'})
  readonly contact: string;

  @IsDate()
  @Type(() => Date)
  @ApiProperty()
  readonly startDate: Date;

  @IsDate()
  @Type(() => Date)
  @ApiPropertyOptional()
  readonly endDate: Date;

  //   @IsDate()
  // @Type(() => Date)
  // @ApiProperty()
  // readonly date: Date;
  
  @IsObject()
  @Type(() => OriginDestinationDTO )
  @ApiProperty({description: 'Data about origin.'})
   readonly origin: OriginDestinationDTO ;

   @IsOptional()
   @IsObject()
   @Type(() => OriginDestinationDTO )
   @ApiPropertyOptional({description: 'Data about destination.'})
   readonly destination: OriginDestinationDTO ;
}
