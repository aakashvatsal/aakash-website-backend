import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MediaPlatform } from './media-post.schema';

export type MediaPresenceReviewDocument = HydratedDocument<MediaPresenceReview>;

@Schema({ _id: false })
export class MediaPresencePlatformScore {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;

  @Prop({ required: true, min: 0, max: 100 }) score: number;
  @Prop({ required: true, min: 0, max: 100 }) consistency: number;
  @Prop({ required: true, min: 0, max: 100 }) reachMomentum: number;
  @Prop({ required: true, min: 0, max: 100 }) contentQuality: number;
  @Prop({ required: true, min: 0, max: 100 }) audienceResponse: number;
  @Prop({ required: true, min: 0, max: 100 }) strategicFit: number;
  @Prop({ required: true, min: 0, max: 100 }) dataConfidence: number;
  @Prop({ required: true, trim: true }) rationale: string;
}
export const MediaPresencePlatformScoreSchema = SchemaFactory.createForClass(
  MediaPresencePlatformScore,
);

@Schema({ _id: false })
export class MediaPresenceCadenceAdjustment {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;
  @Prop({
    type: String,
    enum: ['increase', 'hold', 'decrease'],
    required: true,
  })
  direction: 'increase' | 'hold' | 'decrease';
  @Prop({ required: true, trim: true }) reason: string;
}
export const MediaPresenceCadenceAdjustmentSchema =
  SchemaFactory.createForClass(MediaPresenceCadenceAdjustment);

@Schema({ _id: false })
export class MediaPresenceNarrativeAdjustment {
  @Prop({ required: true, trim: true }) narrative: string;
  @Prop({
    type: String,
    enum: ['increase', 'hold', 'decrease'],
    required: true,
  })
  direction: 'increase' | 'hold' | 'decrease';
  @Prop({ required: true, trim: true }) reason: string;
}
export const MediaPresenceNarrativeAdjustmentSchema =
  SchemaFactory.createForClass(MediaPresenceNarrativeAdjustment);

@Schema({ _id: false })
export class MediaPresenceStrategyChangeCandidate {
  @Prop({ required: true, trim: true }) field: string;
  @Prop({ required: true, trim: true }) proposedChange: string;
  @Prop({ required: true, trim: true }) reason: string;
  @Prop({ default: true }) requiresApproval: boolean;
}
export const MediaPresenceStrategyChangeCandidateSchema =
  SchemaFactory.createForClass(MediaPresenceStrategyChangeCandidate);

@Schema({ timestamps: true, collection: 'media_presence_reviews' })
export class MediaPresenceReview {
  @Prop({ required: true, unique: true, index: true, trim: true }) key: string;
  @Prop({ required: true }) windowStart: Date;
  @Prop({ required: true }) windowEnd: Date;
  @Prop({ required: true, min: 0, max: 100 }) overallScore: number;
  @Prop({ min: 0, max: 100 }) previousScore?: number;
  @Prop({ required: true }) scoreDelta: number;
  @Prop({ required: true, min: 0, max: 100 }) dataConfidence: number;
  @Prop({ type: [MediaPresencePlatformScoreSchema], default: [] })
  platformScores: MediaPresencePlatformScore[];
  @Prop({ required: true, trim: true }) summary: string;
  @Prop({ type: [String], default: [] }) wins: string[];
  @Prop({ type: [String], default: [] }) risks: string[];
  @Prop({ type: [String], default: [] }) focusThisWeek: string[];
  @Prop({ type: [String], default: [] }) avoidThisWeek: string[];
  @Prop({ type: [String], default: [] }) experiments: string[];
  @Prop({ type: [String], default: [] }) planningGuidance: string[];
  @Prop({ type: [MediaPresenceCadenceAdjustmentSchema], default: [] })
  cadenceAdjustments: MediaPresenceCadenceAdjustment[];
  @Prop({ type: [MediaPresenceNarrativeAdjustmentSchema], default: [] })
  narrativeAdjustments: MediaPresenceNarrativeAdjustment[];
  @Prop({ type: [MediaPresenceStrategyChangeCandidateSchema], default: [] })
  strategyChangeCandidates: MediaPresenceStrategyChangeCandidate[];
  @Prop({ required: true, trim: true }) sourceFingerprint: string;
  @Prop({ required: true, trim: true }) aiModel: string;
  @Prop({ trim: true }) aiResponseId?: string;
  @Prop({ required: true, default: Date.now }) generatedAt: Date;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export const MediaPresenceReviewSchema =
  SchemaFactory.createForClass(MediaPresenceReview);
MediaPresenceReviewSchema.index({ windowEnd: -1, generatedAt: -1 });
