import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthBaselineDocument = HydratedDocument<HealthBaseline>;

export enum HealthGymPlanningMode {
  HSAKAA = 'hsakaa',
  TRAINER_PROGRAM = 'trainer_program',
}

@Schema({ timestamps: true, collection: 'health_baselines' })
export class HealthBaseline {
  @Prop({ required: true, unique: true, default: 'owner' })
  key: string;

  @Prop({ trim: true, default: '' })
  currentLookSummary: string;

  @Prop({ trim: true, default: '' })
  expectationSummary: string;

  @Prop({ type: Object, default: {} })
  body: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {
      city: 'Mumbai',
      region: 'Maharashtra',
      country: 'India',
      countryCode: 'IN',
      timezone: 'Asia/Kolkata',
    },
  })
  location: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  lifestyle: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  constraints: Record<string, unknown>;

  @Prop({
    type: Object,
    default: {
      planningMode: HealthGymPlanningMode.HSAKAA,
      daysPerWeek: 4,
      preferredSessionMinutes: 60,
      experienceLevel: 'beginner',
      availableEquipment: [],
      trainerProgramText: '',
    },
  })
  gym: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  diet: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  meditation: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  skin: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  hair: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  intimateCare: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  reportNotes: string[];

  @Prop({ default: false })
  onboardingCompleted: boolean;

  @Prop({ type: Date, default: null })
  onboardingCompletedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastReviewedAt?: Date | null;

  @Prop({ min: 0, default: 0 })
  reviewVersion: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthBaselineSchema =
  SchemaFactory.createForClass(HealthBaseline);
