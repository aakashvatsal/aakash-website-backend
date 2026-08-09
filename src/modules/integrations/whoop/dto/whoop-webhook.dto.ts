import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
} from 'class-validator';

import {
  WhoopWebhookEventType,
} from '../schemas/whoop-webhook-event.schema';

export class WhoopWebhookDto {
  @IsInt()
  user_id:
    number;

  @IsString()
  @IsNotEmpty()
  id:
    string;

  @IsEnum(
    WhoopWebhookEventType,
  )
  type:
    WhoopWebhookEventType;

  @IsString()
  @IsNotEmpty()
  trace_id:
    string;
}