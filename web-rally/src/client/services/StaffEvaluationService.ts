/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActivityResultEvaluation } from '../models/ActivityResultEvaluation';
import type { ActivityResultResponse } from '../models/ActivityResultResponse';
import type { ActivityResultUpdate } from '../models/ActivityResultUpdate';
import type { DetailedCheckPoint } from '../models/DetailedCheckPoint';
import type { DetailedUser } from '../models/DetailedUser';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class StaffEvaluationService {

    /**
     * Get My Checkpoint
     * Get the checkpoint assigned to the current staff member
     * @param requestBody
     * @returns DetailedCheckPoint Successful Response
     * @throws ApiError
     */
    public static getMyCheckpointApiRallyV1StaffMyCheckpointGet(
        requestBody?: DetailedUser,
    ): CancelablePromise<DetailedCheckPoint> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/staff/my-checkpoint',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Teams At My Checkpoint
     * Get all teams at the staff member's assigned checkpoint
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getTeamsAtMyCheckpointApiRallyV1StaffTeamsGet(
        requestBody?: DetailedUser,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/staff/teams',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Team Activities For Evaluation
     * Get activities for a specific team that can be evaluated by this staff member
     * @param teamId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getTeamActivitiesForEvaluationApiRallyV1StaffTeamsTeamIdActivitiesGet(
        teamId: number,
        requestBody?: DetailedUser,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/staff/teams/{team_id}/activities',
            path: {
                'team_id': teamId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Evaluate Team Activity
     * Evaluate a team's performance in an activity
     * @param teamId
     * @param activityId
     * @param requestBody
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static evaluateTeamActivityApiRallyV1StaffTeamsTeamIdActivitiesActivityIdEvaluatePost(
        teamId: number,
        activityId: number,
        requestBody: ActivityResultEvaluation,
    ): CancelablePromise<ActivityResultResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/staff/teams/{team_id}/activities/{activity_id}/evaluate',
            path: {
                'team_id': teamId,
                'activity_id': activityId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Team Activity Evaluation
     * Update a team's activity evaluation
     * @param teamId
     * @param activityId
     * @param resultId
     * @param requestBody
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static updateTeamActivityEvaluationApiRallyV1StaffTeamsTeamIdActivitiesActivityIdEvaluateResultIdPut(
        teamId: number,
        activityId: number,
        resultId: number,
        requestBody: ActivityResultUpdate,
    ): CancelablePromise<ActivityResultResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/staff/teams/{team_id}/activities/{activity_id}/evaluate/{result_id}',
            path: {
                'team_id': teamId,
                'activity_id': activityId,
                'result_id': resultId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get All Evaluations
     * Get all evaluations - accessible by managers only
     * @param checkpointId
     * @param teamId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAllEvaluationsApiRallyV1StaffAllEvaluationsGet(
        checkpointId?: (number | null),
        teamId?: (number | null),
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/staff/all-evaluations',
            query: {
                'checkpoint_id': checkpointId,
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
