import { ApiProperty, ApiPropertyOptional, ApiResponseProperty } from "@nestjs/swagger";
import { Exclude, Expose, Transform, Type } from "class-transformer";
import { IsArray, IsDate, IsNumber, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";
import { StopsCarrier } from "../interface/stops.interface";
import { CreateStopDTO } from "./create-post-stop.dto";
import { OriginDestinationDTO } from "./origin-destination.dto";
import { ResponseCarrierStopDTO } from "./stop.dto";


export class UpdateCarrierPostDTO {

    @IsString()
    @Type(() => String)
    @ApiProperty({description: 'post'})
    readonly _id: string;
  

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
  @ApiProperty({ description: 'Capacity.', enum: ['full', 'partial', 'both'] })
   capacitySearch: string;

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
  @ApiPropertyOptional({description: 'Reference number of the post.'})
  readonly refNum: string;

  @ApiProperty()
  readonly publishedAt: Date;

  @IsOptional()
  @IsString()
  @Type(() => String)
  @ApiProperty()
  readonly publisherId: string;

  @IsString()
  @Type(() => String)
  @ApiProperty({description: 'Capacity.',enum: ['Full','Both','Partial']})
  readonly capacity: string;

  @IsNumber()
  @Type(() => Number)
  @ApiProperty({description: 'Truck weight.'})
  readonly weight: number;

  @IsArray()
  @Type(() => Array)
  @ApiProperty({description: 'Equipment types.',enum: ['Van','Reefer','Flatbed','Container','Step Deck','Power Only']})
  readonly equipment: Array<string>;



  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @ApiProperty({ description: 'Distance between origin and destination.' })
  readonly distance: number;


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
  @ApiProperty()
  readonly endDate: Date;
  
  //  @IsDate()
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
   @ApiProperty({description: 'Data about destination.'})
   readonly destination: OriginDestinationDTO ;
}
