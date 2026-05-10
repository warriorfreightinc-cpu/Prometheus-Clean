import { IsIn, IsString } from "class-validator";
import { MatchSourcePostType } from "../interface/match-snapshot.interface";

export class CreateMatchSnapshotDTO {
  @IsIn(["carrierPost", "brokerPost"])
  readonly sourcePostType: MatchSourcePostType;

  @IsString()
  readonly sourcePostId: string;
}
