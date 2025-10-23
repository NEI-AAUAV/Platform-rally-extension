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
  config!: Record<string, any>;
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
  config?: Record<string, any>;
  is_active?: boolean;
  order?: number;
}

export class ActivityUpdate {
  name?: string;
  description?: string;
  activity_type?: ActivityType;
  checkpoint_id?: number;
  config?: Record<string, any>;
  is_active?: boolean;
  order?: number;
}

export class Checkpoint {
  id!: number;
  name!: string;
  description!: string;
  latitude?: number;
  longitude?: number;
  order!: number;
}

export class ActivityConfig {
  [key: string]: any;
}

// Activity type configurations
export class TimeBasedConfig extends ActivityConfig {
  max_time_seconds?: number;
  points_per_second?: number;
  min_points?: number;
}

export class ScoreBasedConfig extends ActivityConfig {
  max_points?: number;
  points_per_score?: number;
}

export class BooleanConfig extends ActivityConfig {
  success_points?: number;
  failure_points?: number;
}

export class TeamVsConfig extends ActivityConfig {
  win_points?: number;
  lose_points?: number;
  draw_points?: number;
}

export class GeneralConfig extends ActivityConfig {
  min_points?: number;
  max_points?: number;
  default_points?: number;
}