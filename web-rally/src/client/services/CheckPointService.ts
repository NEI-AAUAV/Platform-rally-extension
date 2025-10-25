/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckPointCreate } from '../models/CheckPointCreate';
import type { CheckPointUpdate } from '../models/CheckPointUpdate';
import type { DetailedCheckPoint } from '../models/DetailedCheckPoint';
import type { ListingTeam } from '../models/ListingTeam';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class CheckPointService {

    /**
     * Get Checkpoints
     * @returns DetailedCheckPoint Successful Response
     * @throws ApiError
     */
    public static getCheckpointsApiRallyV1CheckpointGet(): CancelablePromise<Array<DetailedCheckPoint>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/checkpoint/',
        });
    }

    /**
     * Create Checkpoint
     * @param requestBody
     * @returns DetailedCheckPoint Successful Response
     * @throws ApiError
     */
    public static createCheckpointApiRallyV1CheckpointPost(
        requestBody: CheckPointCreate,
    ): CancelablePromise<DetailedCheckPoint> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/checkpoint/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Next Checkpoint
     * Return the next checkpoint a team must head to.
     * @returns DetailedCheckPoint Successful Response
     * @throws ApiError
     */
    public static getNextCheckpointApiRallyV1CheckpointMeGet(): CancelablePromise<DetailedCheckPoint> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/checkpoint/me',
        });
    }

    /**
     * Get Checkpoint Teams
     * If a staff is authenticated, returned all teams that just passed
     * through a staff's checkpoint.
     * If an admin is authenticated, returned all teams.
     * @param checkpointId
     * @returns ListingTeam Successful Response
     * @throws ApiError
     */
    public static getCheckpointTeamsApiRallyV1CheckpointTeamsGet(
        checkpointId?: (number | null),
    ): CancelablePromise<Array<ListingTeam>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/checkpoint/teams',
            query: {
                'checkpoint_id': checkpointId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Reorder Checkpoints
     * Reorder checkpoints by updating their order values.
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static reorderCheckpointsApiRallyV1CheckpointReorderPut(
        requestBody: Record<string, number>,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/checkpoint/reorder',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Checkpoint
     * @param id
     * @param requestBody
     * @returns DetailedCheckPoint Successful Response
     * @throws ApiError
     */
    public static updateCheckpointApiRallyV1CheckpointIdPut(
        id: number,
        requestBody: CheckPointUpdate,
    ): CancelablePromise<DetailedCheckPoint> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/checkpoint/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Delete Checkpoint
     * Delete a checkpoint. Only admins can delete checkpoints.
     * @param id
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteCheckpointApiRallyV1CheckpointIdDelete(
        id: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/rally/v1/checkpoint/{id}',
            path: {
                'id': id,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
