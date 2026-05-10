import { SetMetadata } from "@nestjs/common";

export const UploadRights = (...rights: string[]) => SetMetadata("rights", rights);
