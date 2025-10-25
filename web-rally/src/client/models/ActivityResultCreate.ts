/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Schema for creating an activity result
 */
export type ActivityResultCreate = {
    activity_id: number;
    team_id: number;
    result_data?: Record<string, any>;
    extra_shots?: number;
    penalties?: Record<string, number>;
};

