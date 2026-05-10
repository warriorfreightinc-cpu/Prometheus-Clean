import { IsIn, IsOptional, IsString } from "class-validator";

export class MatchingAssistantCommandDTO {
  @IsString()
  readonly prompt: string;

  @IsOptional()
  @IsString()
  readonly sourcePostId?: string;
}

export class OpportunityActionDTO {
  @IsIn(["ask", "accept", "reject", "book"])
  readonly action: "ask" | "accept" | "reject" | "book";
}
