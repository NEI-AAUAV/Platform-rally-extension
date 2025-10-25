/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TeamMemberAdd } from '../models/TeamMemberAdd';
import type { TeamMemberResponse } from '../models/TeamMemberResponse';
import type { TeamMemberUpdate } from '../models/TeamMemberUpdate';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class TeamMembersService {

    /**
     * Add Team Member
     * Add a member to a team.
     * @param teamId
     * @param requestBody
     * @returns TeamMemberResponse Successful Response
     * @throws ApiError
     */
    public static addTeamMemberApiRallyV1TeamTeamIdMembersPost(
        teamId: number,
        requestBody: TeamMemberAdd,
    ): CancelablePromise<TeamMemberResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/rally/v1/team/{team_id}/members',
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
     * Get Team Members
     * Get all members of a team.
     * @param teamId
     * @returns TeamMemberResponse Successful Response
     * @throws ApiError
     */
    public static getTeamMembersApiRallyV1TeamTeamIdMembersGet(
        teamId: number,
    ): CancelablePromise<Array<TeamMemberResponse>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/team/{team_id}/members',
            path: {
                'team_id': teamId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Remove Team Member
     * Remove a member from a team.
     * @param teamId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static removeTeamMemberApiRallyV1TeamTeamIdMembersUserIdDelete(
        teamId: number,
        userId: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/rally/v1/team/{team_id}/members/{user_id}',
            path: {
                'team_id': teamId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * Update Team Member
     * Update a team member's information.
     * @param teamId
     * @param userId
     * @param requestBody
     * @returns TeamMemberResponse Successful Response
     * @throws ApiError
     */
    public static updateTeamMemberApiRallyV1TeamTeamIdMembersUserIdPut(
        teamId: number,
        userId: number,
        requestBody: TeamMemberUpdate,
    ): CancelablePromise<TeamMemberResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/team/{team_id}/members/{user_id}',
            path: {
                'team_id': teamId,
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

}
