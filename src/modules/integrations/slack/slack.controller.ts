import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Public } from '../../../common/decorators/public.decorator';
import { HsakaaOwnerSessionGuard } from '../../../hsakaa/guards/hsakaa-owner-session.guard';
import { SlackService } from './slack.service';
import { SlackWorkspaceApproval } from './slack.schemas';

class SlackWorkspaceSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional()
  @IsEnum(SlackWorkspaceApproval)
  approvalStatus?: SlackWorkspaceApproval;
  @IsOptional() @IsBoolean() restrictChannelUsers?: boolean;
  @IsOptional() @IsBoolean() monitorChannels?: boolean;
  @IsOptional() @IsBoolean() allowDMs?: boolean;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedChannelIds?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allowedUserIds?: string[];
}
class SlackKnowledgeDto {
  @IsString() teamId: string;
  @IsString() @MaxLength(140) title: string;
  @IsString() @MaxLength(15000) content: string;
}

@Controller('integrations/slack')
export class SlackController {
  constructor(private readonly slack: SlackService) {}

  /** Public installation link for Slack distribution to other workspaces. */
  @Get('install')
  @Public()
  async install(@Res() response: Response) {
    const { authorizationUrl } = await this.slack.getAuthorizationUrl(false);
    response.redirect(303, authorizationUrl);
  }

  @Get('connect')
  @UseGuards(HsakaaOwnerSessionGuard)
  connect() {
    return this.slack.getAuthorizationUrl(true);
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Res() response?: Response,
  ) {
    const result = await this.slack.handleCallback(code, state, error);
    response?.redirect(303, this.slack.getFrontendReturnUrl(result.isOwner));
  }

  @Post('events')
  @Public()
  async events(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-slack-request-timestamp') timestamp?: string,
    @Headers('x-slack-signature') signature?: string,
  ) {
    this.slack.verifySignature(request.rawBody, timestamp, signature);
    return this.slack.acceptEvent(request.body as Record<string, unknown>);
  }

  /** Slack sends application/x-www-form-urlencoded containing a JSON payload. */
  @Post('interactions')
  @Public()
  async interactions(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-slack-request-timestamp') timestamp?: string,
    @Headers('x-slack-signature') signature?: string,
  ) {
    this.slack.verifySignature(request.rawBody, timestamp, signature);
    const payload = (request.body as { payload?: unknown } | undefined)
      ?.payload;
    if (typeof payload !== 'string' || payload.length > 30000)
      return { ok: true };
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return { ok: true };
    }
    await this.slack.acceptInteraction(parsed);
    return { ok: true };
  }

  @Get('status')
  @UseGuards(HsakaaOwnerSessionGuard)
  status() {
    return this.slack.getStatus();
  }

  @Patch('workspaces/:teamId')
  @UseGuards(HsakaaOwnerSessionGuard)
  update(
    @Param('teamId') teamId: string,
    @Body() dto: SlackWorkspaceSettingsDto,
  ) {
    return this.slack.updateWorkspace(teamId, dto);
  }

  @Delete('workspaces/:teamId')
  @UseGuards(HsakaaOwnerSessionGuard)
  disconnect(@Param('teamId') teamId: string) {
    return this.slack.disconnect(teamId);
  }

  @Get('queries')
  @UseGuards(HsakaaOwnerSessionGuard)
  queries(@Query('limit') limit?: string) {
    return this.slack.getQueries(Number(limit ?? 50));
  }

  @Get('knowledge')
  @UseGuards(HsakaaOwnerSessionGuard)
  knowledge(@Query('teamId') teamId: string) {
    return this.slack.getKnowledge(teamId);
  }

  @Post('knowledge')
  @UseGuards(HsakaaOwnerSessionGuard)
  addKnowledge(@Body() dto: SlackKnowledgeDto) {
    return this.slack.addKnowledge(dto.teamId, dto.title, dto.content);
  }

  @Delete('knowledge/:id')
  @UseGuards(HsakaaOwnerSessionGuard)
  deleteKnowledge(@Param('id') id: string, @Query('teamId') teamId: string) {
    return this.slack.deleteKnowledge(teamId, id);
  }
}
