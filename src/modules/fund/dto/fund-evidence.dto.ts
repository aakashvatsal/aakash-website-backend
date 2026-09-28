import { IsMongoId, IsUUID } from 'class-validator';

export class FundEvidenceUploadDto {
  @IsUUID('4')
  sessionId: string;

  @IsMongoId()
  caseId: string;
}
