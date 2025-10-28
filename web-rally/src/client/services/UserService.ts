/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckpointAssignmentUpdate } from '../models/CheckpointAssignmentUpdate';
import type { RallyStaffAssignmentWithCheckpoint } from '../models/RallyStaffAssignmentWithCheckpoint';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class UserService {

    /**
     * Get Staff Assignments
     * Get all users with rally-staff role from NEI platform and their checkpoint assignments.
     * This shows all rally-staff users from the main NEI platform and their current checkpoint assignments.
     * @returns RallyStaffAssignmentWithCheckpoint Successful Response
     * @throws ApiError
     */
    public static getStaffAssignmentsApiRallyV1UserStaffAssignmentsGet(): CancelablePromise<Array<RallyStaffAssignmentWithCheckpoint>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/user/staff-assignments',
        });
    }

    /**
     * Get Me
     * Get current user information.
     * Returns the authenticated user from the NEI platform.
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getMeApiRallyV1UserMeGet(): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/user/me',
        });
    }

    /**
     * Update Checkpoint Assignment
     * Update a user's checkpoint assignment.
     * This creates/updates Rally-specific staff assignments.
     * @param userId
     * @param requestBody
     * @returns RallyStaffAssignmentWithCheckpoint Successful Response
     * @throws ApiError
     */
    public static updateCheckpointAssignmentApiRallyV1UserUserIdCheckpointAssignmentPut(
        userId: number,
        requestBody: CheckpointAssignmentUpdate,
    ): CancelablePromise<RallyStaffAssignmentWithCheckpoint> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/user/{user_id}/checkpoint-assignment',
            path: {
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
