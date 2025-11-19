import type {
  DetailedCheckPoint,
  ListingTeam,
  ActivityResponse,
  ActivityListResponse,
  RallySettingsResponse,
  ActivityResultResponse,
} from '@/client';
import { ActivityType } from '@/client';

// Mock checkpoint data
export const MOCK_CHECKPOINT: DetailedCheckPoint = {
  id: 1,
  name: 'Posto 1',
  description: 'First checkpoint',
  latitude: 40.6306,
  longitude: -8.6591,
  order: 1,
};

// Mock team data
export const MOCK_TEAM: ListingTeam = {
  id: 1,
  name: 'Test Team',
  total: 100,
  classification: 1,
  versus_group_id: null,
  num_members: 4,
  times: [],
  last_checkpoint_time: null,
  last_checkpoint_score: null,
  last_checkpoint_number: null,
  last_checkpoint_name: null,
  current_checkpoint_number: 1,
};

// Mock activity data
export const MOCK_ACTIVITY: ActivityResponse = {
  id: 1,
  name: 'Test Activity',
  description: 'A test activity for evaluation',
  activity_type: ActivityType.GENERAL_ACTIVITY,
  checkpoint_id: 1,
  config: {},
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock activity list response
export const MOCK_ACTIVITY_LIST: ActivityListResponse = {
  activities: [MOCK_ACTIVITY],
  total: 1,
  page: 1,
  size: 100,
};

// Mock activity result (evaluation)
export const MOCK_ACTIVITY_RESULT: ActivityResultResponse = {
  id: 1,
  activity_id: 1,
  team_id: 1,
  result_data: {},
  extra_shots: 0,
  penalties: {},
  time_score: null,
  points_score: null,
  boolean_score: null,
  team_vs_result: null,
  final_score: null,
  is_completed: false,
  completed_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock rally settings
export const MOCK_RALLY_SETTINGS: RallySettingsResponse = {
  max_teams: 20,
  max_members_per_team: 6,
  enable_versus: false,
  rally_start_time: new Date().toISOString(),
  rally_end_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours from now
  penalty_per_puke: 10,
  penalty_per_not_drinking: 5,
  bonus_per_extra_shot: 2,
  max_extra_shots_per_member: 3,
  checkpoint_order_matters: true,
  enable_staff_scoring: true,
  show_live_leaderboard: true,
  show_team_details: true,
  show_checkpoint_map: true,
  rally_theme: 'nei',
  public_access_enabled: true,
};

// Mock JWT token for staff (for testing - properly formatted with valid sub)
// This token decodes to: { sub: "test-user-123", name: "Test User", scopes: ["rally-staff"], iat: 1516239022 }
// Base64 encoded header + payload: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9
export const MOCK_JWT_TOKEN_STAFF =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test';

// Mock JWT token for manager (with manager-rally scope)
// This token decodes to: { sub: "manager-user-456", name: "Manager User", scopes: ["manager-rally"], iat: 1516239022 }
// Base64: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtYW5hZ2VyLXVzZXItNDU2IiwibmFtZSI6Ik1hbmFnZXIgVXNlciIsInNjb3BlcyI6WyJtYW5hZ2VyLXJhbGx5Il0sImlhdCI6MTUxNjIzOTAyMn0
export const MOCK_JWT_TOKEN_MANAGER =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtYW5hZ2VyLXVzZXItNDU2IiwibmFtZSI6Ik1hbmFnZXIgVXNlciIsInNjb3BlcyI6WyJtYW5hZ2VyLXJhbGx5Il0sImlhdCI6MTUxNjIzOTAyMn0.test';

// Backward compatibility - default to staff token
export const MOCK_JWT_TOKEN = MOCK_JWT_TOKEN_STAFF;

