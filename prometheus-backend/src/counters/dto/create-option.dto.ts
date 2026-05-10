import { IsObject, IsOptional } from "class-validator";

import { Type } from "class-transformer";

export class CreateCategoryDTO {
  @IsOptional()
  readonly name: string;
}

export class CreateOptionDTO {
  @IsObject()
  @IsOptional()
  @Type(() => CreateCategoryDTO)
  readonly categories: CreateCategoryDTO;
}
