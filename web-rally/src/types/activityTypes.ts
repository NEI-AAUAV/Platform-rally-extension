// Activity types for Rally extension
export enum ActivityType {
  TIME_BASED = "TimeBasedActivity",
  SCORE_BASED = "ScoreBasedActivity",
  BOOLEAN = "BooleanActivity",
  TEAM_VS = "TeamVsActivity",
  GENERAL = "GeneralActivity"
}

// Export classes for runtime access
export class Activity {
  id!: number;
  name!: string;
  description?: string;
  activity_type!: ActivityType;
  checkpoint_id!: number;
  config!: ActivityConfig;
  is_active!: boolean;
  order!: number;
  created_at!: string;
  updated_at!: string;
}

export class ActivityCreate {
  name!: string;
  description?: string;
  activity_type!: ActivityType;
  checkpoint_id!: number;
  config?: ActivityConfig;
  is_active?: boolean;
  order?: number;
}

export class ActivityUpdate {
  name?: string;
  description?: string;
  activity_type?: ActivityType;
  checkpoint_id?: number;
  config?: ActivityConfig;
  is_active?: boolean;
  order?: number;
}

export class Checkpoint {
  id!: number;
  name!: string;
  description?: string | null;
  latitude?: number;
  longitude?: number;
  order!: number;
}

// Base configuration interface with common properties
export interface BaseActivityConfig {
  min_points?: number;
  max_points?: number;
}

// Activity type configurations with specific properties
export interface TimeBasedConfig extends BaseActivityConfig {
  max_time_seconds?: number;
  points_per_second?: number;
}

export interface ScoreBasedConfig extends BaseActivityConfig {
  points_per_score?: number;
}

export interface BooleanConfig extends BaseActivityConfig {
  success_points?: number;
  failure_points?: number;
}

export interface TeamVsConfig extends BaseActivityConfig {
  base_points?: number;
  completion_points?: number;
  win_points?: number;
  lose_points?: number;
  draw_points?: number;
}

export interface GeneralConfig extends BaseActivityConfig {
  default_points?: number;
}

// Union type for all possible activity configurations
export type ActivityConfig =
  | TimeBasedConfig
  | ScoreBasedConfig
  | BooleanConfig
  | TeamVsConfig
  | GeneralConfig;

// Type guard functions for runtime validation
export function isTimeBasedConfig(config: ActivityConfig): config is TimeBasedConfig {
  return 'max_time_seconds' in config || 'points_per_second' in config;
}

export function isScoreBasedConfig(config: ActivityConfig): config is ScoreBasedConfig {
  return 'points_per_score' in config;
}

export function isBooleanConfig(config: ActivityConfig): config is BooleanConfig {
  return 'success_points' in config || 'failure_points' in config;
}

export function isTeamVsConfig(config: ActivityConfig): config is TeamVsConfig {
  return 'win_points' in config || 'lose_points' in config || 'draw_points' in config || 'base_points' in config || 'completion_points' in config;
}

export function isGeneralConfig(config: ActivityConfig): config is GeneralConfig {
  return 'default_points' in config;
}