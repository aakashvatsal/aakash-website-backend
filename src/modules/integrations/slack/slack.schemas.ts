import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SlackWorkspaceDocument = HydratedDocument<SlackWorkspace>;
export type SlackQueryDocument = HydratedDocument<SlackQuery>;
export type SlackKnowledgeDocument = HydratedDocument<SlackKnowledge>;
export type SlackOAuthStateDocument = HydratedDocument<SlackOAuthState>;
export type SlackOperationDocument = HydratedDocument<SlackOperation>;

export enum SlackWorkspaceApproval {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ collection: 'hsakaa_slack_workspaces', timestamps: true })
export class SlackWorkspace {
  @Prop({ required: true, unique: true, index: true }) teamId: string;
  @Prop({ required: true }) teamName: string;
  @Prop({ required: true, select: false }) encryptedBotToken: string;
  @Prop({ required: true }) botUserId: string;
  @Prop({ type: [String], default: [] }) scopes: string[];
  // Existing single-workspace installations without this field remain pending
  // until the owner explicitly approves them after upgrading.
  @Prop({
    type: String,
    enum: SlackWorkspaceApproval,
    default: SlackWorkspaceApproval.PENDING,
  })
  approvalStatus: SlackWorkspaceApproval;
  @Prop({ default: false }) enabled: boolean;
  @Prop({ default: false }) restrictChannelUsers: boolean;
  @Prop({ default: false }) monitorChannels: boolean;
  @Prop({ default: false }) allowDMs: boolean;
  @Prop({ type: [String], default: [] }) allowedChannelIds: string[];
  @Prop({ type: [String], default: [] }) allowedUserIds: string[];
  @Prop({ default: true }) connected: boolean;
  @Prop() connectedAt?: Date;
}
export const SlackWorkspaceSchema =
  SchemaFactory.createForClass(SlackWorkspace);

@Schema({ collection: 'hsakaa_slack_oauth_states', timestamps: true })
export class SlackOAuthState {
  @Prop({ required: true, unique: true }) stateHash: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ default: false }) consumed: boolean;
  @Prop({ default: false }) isOwner: boolean;
}
export const SlackOAuthStateSchema =
  SchemaFactory.createForClass(SlackOAuthState);
SlackOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

export enum SlackQueryStatus {
  RECEIVED = 'received',
  PROCESSING = 'processing',
  NEEDS_CLARIFICATION = 'needs_clarification',
  AWAITING_APPROVAL = 'awaiting_approval',
  PARTIALLY_RESOLVED = 'partially_resolved',
  RESOLVED = 'resolved',
  FAILED = 'failed',
  ACCESS_DENIED = 'access_denied',
}

@Schema({ collection: 'hsakaa_slack_queries', timestamps: true })
export class SlackQuery {
  @Prop({ required: true }) teamId: string;
  @Prop({ required: true }) eventId: string;
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) eventTs: string;
  @Prop({ required: true }) threadTs: string;
  @Prop({ required: true }) threadKey: string;
  @Prop({ default: false }) isDM: boolean;
  @Prop({ required: true }) query: string;
  // Denied requests never persist the original message or enter the AI pipeline.
  @Prop({ default: false }) accessDenied: boolean;
  @Prop() senderTeamId?: string;
  @Prop({
    type: String,
    enum: SlackQueryStatus,
    default: SlackQueryStatus.RECEIVED,
  })
  status: SlackQueryStatus;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ default: Date.now }) nextAttemptAt: Date;
  @Prop() leaseUntil?: Date;
  @Prop() intent?: string;
  @Prop() underlyingNeed?: string;
  @Prop() category?: string;
  @Prop() urgency?: string;
  @Prop() confidence?: number;
  @Prop({ type: [String], default: [] }) entities: string[];
  @Prop({ type: [String], default: [] }) missingInformation: string[];
  @Prop() requestedOutcome?: string;
  @Prop() answer?: string;
  @Prop() operationActionId?: string;
  @Prop() replyTs?: string;
  @Prop() failure?: string;
  @Prop() completedAt?: Date;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;
}
export const SlackQuerySchema = SchemaFactory.createForClass(SlackQuery);
SlackQuerySchema.index({ teamId: 1, eventId: 1 }, { unique: true });
SlackQuerySchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
SlackQuerySchema.index({ teamId: 1, channelId: 1, threadKey: 1, eventTs: 1 });

@Schema({ collection: 'hsakaa_slack_knowledge', timestamps: true })
export class SlackKnowledge {
  @Prop({ required: true, index: true }) teamId: string;
  @Prop({ required: true, trim: true, maxlength: 140 }) title: string;
  @Prop({ required: true, trim: true, maxlength: 15000 }) content: string;
  @Prop({ default: true }) enabled: boolean;
}
export const SlackKnowledgeSchema =
  SchemaFactory.createForClass(SlackKnowledge);

/** A Frayto-authorized, short-lived preview; NEVER stores raw Frayto credentials. */
export enum SlackOperationStatus {
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  APPROVED = 'approved',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Schema({ collection: 'hsakaa_slack_operations', timestamps: true })
export class SlackOperation {
  @Prop({ required: true }) teamId: string;
  @Prop({ required: true }) companyId: string;
  @Prop({ required: true }) channelId: string;
  @Prop({ required: true }) threadTs: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) sourceEventId: string;
  @Prop({ required: true }) operation:
    | 'delete_purchase_invoice'
    | 'reopen_docket_steps'
    | 'extend_quotation_validity';
  @Prop({ required: true }) resolutionId: string;
  @Prop({ required: true }) summary: string;
  @Prop({ type: String, enum: SlackOperationStatus, required: true })
  status: SlackOperationStatus;
  @Prop({ required: true }) idempotencyKey: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() result?: string;
  @Prop() replyTs?: string;
  @Prop() completedAt?: Date;
}
export const SlackOperationSchema =
  SchemaFactory.createForClass(SlackOperation);
SlackOperationSchema.index({ teamId: 1, sourceEventId: 1 }, { unique: true });
SlackOperationSchema.index({ status: 1, expiresAt: 1 });
