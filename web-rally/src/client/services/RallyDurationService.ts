/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class RallyDurationService {

    /**
     * Get Rally Duration
     * Get rally duration and timing information.
     *
     * Returns:
     * Rally timing status including current time, start/end times,
     * time remaining/elapsed, and progress percentage.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getRallyDurationApiRallyV1RallyDurationGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/rally/duration',
        });
    }

    /**
     * Get Team Rally Duration
     * Get rally duration information for a specific team.
     *
     * Args:
     * team_id: ID of the team to get duration info for
     *
     * Returns:
     * Team-specific rally duration information.
     * @param teamId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getTeamRallyDurationApiRallyV1RallyTeamDurationTeamIdGet(
        teamId: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/rally/team-duration/{team_id}',
            path: {
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
