import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthNotificationPreferencesDocument =
  HydratedDocument<HealthNotificationPreferences>;

@Schema({ timestamps: true, collection: 'health_notification_preferences' })
export class HealthNotificationPreferences {
  @Prop({ default: 'owner', unique: true, index: true })
  ownerKey: string;

  @Prop({ default: true })
  morningBriefEnabled: boolean;

  @Prop({ default: '07:30', trim: true })
  morningBriefTime: string;

  @Prop({ default: true })
  workoutRemindersEnabled: boolean;

  @Prop({ default: '18:30', trim: true })
  defaultWorkoutTime: string;

  @Prop({ default: 30, min: 0, max: 180 })
  workoutLeadMinutes: number;

  @Prop({ default: false })
  mealRemindersEnabled: boolean;

  @Prop({ default: true })
  supplementRemindersEnabled: boolean;

  @Prop({ default: false })
  meditationRemindersEnabled: boolean;

  @Prop({ default: false })
  skincareRemindersEnabled: boolean;

  @Prop({ default: false })
  haircareRemindersEnabled: boolean;

  @Prop({ default: false })
  intimateCareRemindersEnabled: boolean;

  @Prop({ default: true })
  sleepRemindersEnabled: boolean;

  @Prop({ default: 45, min: 0, max: 180 })
  sleepLeadMinutes: number;

  @Prop({ default: true })
  importantAlertsEnabled: boolean;

  @Prop({ default: '23:00', trim: true })
  quietHoursStart: string;

  @Prop({ default: '07:00', trim: true })
  quietHoursEnd: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const HealthNotificationPreferencesSchema = SchemaFactory.createForClass(
  HealthNotificationPreferences,
);
