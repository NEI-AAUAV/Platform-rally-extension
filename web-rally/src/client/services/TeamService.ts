/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { DetailedTeam } from '../models/DetailedTeam';
import type { ListingTeam } from '../models/ListingTeam';
import type { TeamCreate } from '../models/TeamCreate';
import type { TeamScoresUpdate } from '../models/TeamScoresUpdate';
import type { TeamUpdate } from '../models/TeamUpdate';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TeamService {

    /**
     * Get Teams
     * @returns ListingTeam Successful Response
     * @throws ApiError
     */
    public static getTeamsApiRallyV1TeamGet(): CancelablePromise<Array<ListingTeam>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/team/',
        });
    }

    /**
     * Create Team
     * @param requestBody
     * @returns DetailedTeam Successful Response
     * @throws ApiError
     */
    public static createTeamApiRallyV1TeamPost(
        requestBody: TeamCreate,
    ): CancelablePromise<DetailedTeam> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/team/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Own Team
     * @returns DetailedTeam Successful Response
     * @throws ApiError
     */
    public static getOwnTeamApiRallyV1TeamMeGet(): CancelablePromise<DetailedTeam> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/team/me',
        });
    }

    /**
     * Get Team By Id
     * @param id
     * @returns DetailedTeam Successful Response
     * @throws ApiError
     */
    public static getTeamByIdApiRallyV1TeamIdGet(
        id: number,
    ): CancelablePromise<DetailedTeam> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/team/{id}',
            path: {
                'id': id,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Team
     * @param id
     * @param requestBody
     * @returns DetailedTeam Successful Response
     * @throws ApiError
     */
    public static updateTeamApiRallyV1TeamIdPut(
        id: number,
        requestBody: TeamUpdate,
    ): CancelablePromise<DetailedTeam> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/team/{id}',
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
     * Delete Team
     * Delete a team. Only admins can delete teams.
     * @param id
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteTeamApiRallyV1TeamIdDelete(
        id: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/rally/v1/team/{id}',
            path: {
                'id': id,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Add Checkpoint
     * @param id
     * @param requestBody
     * @returns DetailedTeam Successful Response
     * @throws ApiError
     */
    public static addCheckpointApiRallyV1TeamIdCheckpointPut(
        id: number,
        requestBody: TeamScoresUpdate,
    ): CancelablePromise<DetailedTeam> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/team/{id}/checkpoint',
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

}
