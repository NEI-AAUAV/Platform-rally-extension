/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * Schema for activity result response
 */
export type ActivityResultResponse = {
    activity_id: number;
    team_id: number;
    result_data?: Record<string, any>;
    extra_shots?: number;
    penalties?: Record<string, number>;
    id: number;
    time_score?: (number | null);
    points_score?: (number | null);
    boolean_score?: (boolean | null);
    team_vs_result?: (string | null);
    final_score?: (number | null);
    is_completed?: boolean;
    completed_at?: (string | null);
    created_at: string;
    updated_at: string;
};

