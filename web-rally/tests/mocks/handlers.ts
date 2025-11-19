/**
 * LEGACY: MSW handlers for Rally API endpoints
 * 
 * NOTE: These handlers are NOT currently used. We use Playwright's native
 * `page.route()` for request mocking in E2E tests (see tests/e2e/staff-evaluation.spec.ts).
 * 
 * This file is kept for reference only. If MSW is needed in the future,
 * these handlers can be adapted for use with MSW's setupServer.
 * 
 * @deprecated Use Playwright's page.route() instead
 */

import { http, HttpResponse } from 'msw';
import {
  MOCK_CHECKPOINT,
  MOCK_TEAM,
  MOCK_ACTIVITY_LIST,
  MOCK_RALLY_SETTINGS,
  MOCK_ACTIVITY_RESULT,
  MOCK_ACTIVITY,
} from './data';

const API_BASE = '/api/rally/v1';
const API_NEI_BASE = '/api/nei/v1';
export const handlers = [
  // NEI Auth endpoints (required for authentication)
  // Handle both relative and absolute URLs
  http.post(`${API_NEI_BASE}/auth/refresh/`, () => {
    // Return a new access token (same as the mock token)
    return HttpResponse.json({
      access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test',
    });
  }),
  // Also handle with trailing slash
  http.post(`${API_NEI_BASE}/auth/refresh`, () => {
    return HttpResponse.json({
      access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwibmFtZSI6IlRlc3QgVXNlciIsInNjb3BlcyI6WyJyYWxseS1zdGFmZiJdLCJpYXQiOjE1MTYyMzkwMjJ9.test',
    });
  }),

  // Public rally settings
  http.get(`${API_BASE}/rally/settings/public`, () => {
    return HttpResponse.json(MOCK_RALLY_SETTINGS);
  }),

  // Get all checkpoints
  http.get(`${API_BASE}/checkpoint/`, () => {
    return HttpResponse.json([MOCK_CHECKPOINT]);
  }),

  // Get teams
  http.get(`${API_BASE}/team/`, () => {
    return HttpResponse.json([MOCK_TEAM]);
  }),

  // Get activities
  http.get(`${API_BASE}/activities/`, ({ request }) => {
    const url = new URL(request.url);
    const checkpointId = url.searchParams.get('checkpoint_id');
    
    // Filter activities by checkpoint if specified
    const activities = checkpointId
      ? MOCK_ACTIVITY_LIST.activities.filter(
          (activity) => activity.checkpoint_id === Number(checkpointId),
        )
      : MOCK_ACTIVITY_LIST.activities;

    return HttpResponse.json({
      ...MOCK_ACTIVITY_LIST,
      activities,
      total: activities.length,
    });
  }),

  // Get all activity results (evaluations)
  http.get(`${API_BASE}/activities/results`, () => {
    return HttpResponse.json([MOCK_ACTIVITY_RESULT]);
  }),

  // Get teams at checkpoint (staff evaluation endpoint)
  http.get(`${API_BASE}/checkpoint/teams`, ({ request }) => {
    const url = new URL(request.url);
    const checkpointId = url.searchParams.get('checkpoint_id');
    
    // Return teams if checkpoint matches, empty array otherwise
    if (checkpointId && Number(checkpointId) === MOCK_CHECKPOINT.id) {
      return HttpResponse.json([MOCK_TEAM]);
    }
    return HttpResponse.json([]);
  }),

  // Submit staff evaluation
  http.post(`${API_BASE}/staff/evaluation`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      ...MOCK_ACTIVITY_RESULT,
      ...(body as Record<string, unknown>),
      is_completed: true,
      completed_at: new Date().toISOString(),
    });
  }),

  // Get team activities for evaluation
  http.get(`${API_BASE}/staff/teams/:teamId/activities`, ({ params }) => {
    const { teamId } = params;
    
    if (Number(teamId) === MOCK_TEAM.id) {
      return HttpResponse.json({
        team: MOCK_TEAM,
        activities: MOCK_ACTIVITY_LIST.activities,
        evaluation_summary: {
          total_activities: 1,
          completed_activities: 0,
          pending_activities: 1,
          completion_rate: 0,
          has_incomplete: true,
          missing_activities: [MOCK_ACTIVITY.name],
          checkpoint_mismatch: false,
          team_checkpoint: 1,
          current_checkpoint: 1,
        },
      });
    }
    
    return HttpResponse.json(
      { detail: 'Not found' },
      { status: 404 },
    );
  }),

  // Evaluate team activity
  http.post(
    `${API_BASE}/staff/teams/:teamId/activities/:activityId/evaluate`,
    async ({ request, params }) => {
      const body = await request.json();
      return HttpResponse.json({
        ...MOCK_ACTIVITY_RESULT,
        activity_id: Number(params.activityId),
        team_id: Number(params.teamId),
        ...(body as Record<string, unknown>),
        is_completed: true,
        completed_at: new Date().toISOString(),
      });
    },
  ),
];

