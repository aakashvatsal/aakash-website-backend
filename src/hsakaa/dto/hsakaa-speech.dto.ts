import { IsMongoId, IsUUID } from 'class-validator';

export class PublicHsakaaSpeechDto {
  @IsMongoId()
  conversationId: string;

  @IsMongoId()
  messageId: string;

  @IsUUID('4')
  sessionId: string;
}

export class VerifiedPersonHsakaaSpeechDto {
  @IsMongoId()
  conversationId: string;

  @IsMongoId()
  messageId: string;
}
