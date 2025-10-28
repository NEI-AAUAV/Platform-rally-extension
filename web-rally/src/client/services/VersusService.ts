/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { VersusGroupListResponse } from '../models/VersusGroupListResponse';
import type { VersusOpponentResponse } from '../models/VersusOpponentResponse';
import type { VersusPairCreate } from '../models/VersusPairCreate';
import type { VersusPairResponse } from '../models/VersusPairResponse';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class VersusService {

    /**
     * Create Versus Pair
     * Create versus pair
     * @param requestBody
     * @returns VersusPairResponse Successful Response
     * @throws ApiError
     */
    public static createVersusPairApiRallyV1VersusPairPost(
        requestBody: VersusPairCreate,
    ): CancelablePromise<VersusPairResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/versus/pair',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Get Team Opponent
     * Get a team's opponent
     * @param teamId
     * @returns VersusOpponentResponse Successful Response
     * @throws ApiError
     */
    public static getTeamOpponentApiRallyV1VersusTeamTeamIdOpponentGet(
        teamId: number,
    ): CancelablePromise<VersusOpponentResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/versus/team/{team_id}/opponent',
            path: {
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * List Versus Groups
     * Get all versus groups
     * @returns VersusGroupListResponse Successful Response
     * @throws ApiError
     */
    public static listVersusGroupsApiRallyV1VersusGroupsGet(): CancelablePromise<VersusGroupListResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/versus/groups',
        });
    }

}
