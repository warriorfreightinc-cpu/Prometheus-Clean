import { Exclude, Expose, Transform, Type } from "class-transformer";

@Exclude()
export class ResponseCategoryDTO {
  @Expose()
  @Transform(
    (from: any) => {
      return from.obj._id;
    },
    { toClassOnly: false }
  )
  readonly _id: string;

  @Expose()
  name: string;
}

@Exclude()
export class ResponseOptionDTO {
  @Expose()
  @Type(() => ResponseCategoryDTO)
  readonly categories: ResponseCategoryDTO[];
}
