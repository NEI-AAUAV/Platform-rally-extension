/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ActivityCreate } from '../models/ActivityCreate';
import type { ActivityListResponse } from '../models/ActivityListResponse';
import type { ActivityRanking } from '../models/ActivityRanking';
import type { ActivityResponse } from '../models/ActivityResponse';
import type { ActivityResultCreate } from '../models/ActivityResultCreate';
import type { ActivityResultResponse } from '../models/ActivityResultResponse';
import type { ActivityResultUpdate } from '../models/ActivityResultUpdate';
import type { ActivityUpdate } from '../models/ActivityUpdate';
import type { GlobalRanking } from '../models/GlobalRanking';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class ActivitiesService {

    /**
     * Create Activity
     * Create a new activity
     * @param requestBody
     * @returns ActivityResponse Successful Response
     * @throws ApiError
     */
    public static createActivityApiRallyV1ActivitiesPost(
        requestBody: ActivityCreate,
    ): CancelablePromise<ActivityResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/activities/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Activities
     * Get activities list
     * @param skip
     * @param limit
     * @param checkpointId
     * @returns ActivityListResponse Successful Response
     * @throws ApiError
     */
    public static getActivitiesApiRallyV1ActivitiesGet(
        skip?: number,
        limit: number = 100,
        checkpointId?: (number | null),
    ): CancelablePromise<ActivityListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/',
            query: {
                'skip': skip,
                'limit': limit,
                'checkpoint_id': checkpointId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Activity
     * Get activity by ID
     * @param activityId
     * @returns ActivityResponse Successful Response
     * @throws ApiError
     */
    public static getActivityApiRallyV1ActivitiesActivityIdGet(
        activityId: number,
    ): CancelablePromise<ActivityResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/{activity_id}',
            path: {
                'activity_id': activityId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Activity
     * Update an activity
     * @param activityId
     * @param requestBody
     * @returns ActivityResponse Successful Response
     * @throws ApiError
     */
    public static updateActivityApiRallyV1ActivitiesActivityIdPut(
        activityId: number,
        requestBody: ActivityUpdate,
    ): CancelablePromise<ActivityResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/activities/{activity_id}',
            path: {
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
     * Delete Activity
     * Delete an activity
     * @param activityId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteActivityApiRallyV1ActivitiesActivityIdDelete(
        activityId: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/rally/v1/activities/{activity_id}',
            path: {
                'activity_id': activityId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Create Activity Result
     * Create a new activity result
     * @param requestBody
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static createActivityResultApiRallyV1ActivitiesResultsPost(
        requestBody: ActivityResultCreate,
    ): CancelablePromise<ActivityResultResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/activities/results/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get All Activity Results
     * Get all activity results (evaluations) with team and activity details
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static getAllActivityResultsApiRallyV1ActivitiesResultsGet(): CancelablePromise<Array<ActivityResultResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/results',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Activity Result
     * Get activity result by ID
     * @param resultId
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static getActivityResultApiRallyV1ActivitiesResultsResultIdGet(
        resultId: number,
    ): CancelablePromise<ActivityResultResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/results/{result_id}',
            path: {
                'result_id': resultId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Activity Result
     * Update an activity result
     * @param resultId
     * @param requestBody
     * @returns ActivityResultResponse Successful Response
     * @throws ApiError
     */
    public static updateActivityResultApiRallyV1ActivitiesResultsResultIdPut(
        resultId: number,
        requestBody: ActivityResultUpdate,
    ): CancelablePromise<ActivityResultResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/activities/results/{result_id}',
            path: {
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
     * Apply Extra Shots
     * Apply extra shots bonus to activity result
     * @param resultId
     * @param extraShots
     * @returns any Successful Response
     * @throws ApiError
     */
    public static applyExtraShotsApiRallyV1ActivitiesResultsResultIdExtraShotsPost(
        resultId: number,
        extraShots: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/activities/results/{result_id}/extra-shots',
            path: {
                'result_id': resultId,
            },
            query: {
                'extra_shots': extraShots,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Apply Penalty
     * Apply penalty to activity result
     * @param resultId
     * @param penaltyType
     * @param penaltyValue
     * @returns any Successful Response
     * @throws ApiError
     */
    public static applyPenaltyApiRallyV1ActivitiesResultsResultIdPenaltyPost(
        resultId: number,
        penaltyType: string,
        penaltyValue: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/activities/results/{result_id}/penalty',
            path: {
                'result_id': resultId,
            },
            query: {
                'penalty_type': penaltyType,
                'penalty_value': penaltyValue,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Activity Ranking
     * Get ranking for a specific activity
     * @param activityId
     * @returns ActivityRanking Successful Response
     * @throws ApiError
     */
    public static getActivityRankingApiRallyV1ActivitiesActivityIdRankingGet(
        activityId: number,
    ): CancelablePromise<ActivityRanking> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/{activity_id}/ranking',
            path: {
                'activity_id': activityId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Global Ranking
     * Get global team ranking
     * @returns GlobalRanking Successful Response
     * @throws ApiError
     */
    public static getGlobalRankingApiRallyV1ActivitiesRankingGlobalGet(): CancelablePromise<GlobalRanking> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/ranking/global',
        });
    }

    /**
     * Create Team Vs Result
     * Create team vs team activity results
     * @param activityId
     * @param team1Id
     * @param team2Id
     * @param winnerId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createTeamVsResultApiRallyV1ActivitiesTeamVsActivityIdPost(
        activityId: number,
        team1Id: number,
        team2Id: number,
        winnerId: number,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/activities/team-vs/{activity_id}',
            path: {
                'activity_id': activityId,
            },
            query: {
                'team1_id': team1Id,
                'team2_id': team2Id,
                'winner_id': winnerId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Activity Statistics
     * Get statistics for a specific activity
     * @param activityId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getActivityStatisticsApiRallyV1ActivitiesActivityIdStatisticsGet(
        activityId: number,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/activities/{activity_id}/statistics',
            path: {
                'activity_id': activityId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
