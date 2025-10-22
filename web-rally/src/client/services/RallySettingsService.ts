/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */


import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export interface RallySettingsResponse {
    max_teams: number;
    max_members_per_team: number;
    enable_versus: boolean;
    rally_start_time?: string | null;
    rally_end_time?: string | null;
    penalty_per_puke: number;
    checkpoint_order_matters: boolean;
    enable_staff_scoring: boolean;
    show_live_leaderboard: boolean;
    show_team_details: boolean;
    show_checkpoint_map: boolean;
    rally_theme: string;
    public_access_enabled: boolean;
}

export interface RallySettingsUpdate {
    max_teams: number;
    max_members_per_team: number;
    enable_versus: boolean;
    rally_start_time?: string | null;
    rally_end_time?: string | null;
    penalty_per_puke: number;
    checkpoint_order_matters: boolean;
    enable_staff_scoring: boolean;
    show_live_leaderboard: boolean;
    show_team_details: boolean;
    show_checkpoint_map: boolean;
    rally_theme: string;
    public_access_enabled: boolean;
}

export class RallySettingsService {
    /**
     * Get Rally Settings
     * @returns RallySettingsResponse Successful Response
     * @throws ApiError
     */
    public static getRallySettings(): CancelablePromise<RallySettingsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/rally/settings',
        });
    }

    /**
     * Update Rally Settings
     * @param requestBody 
     * @returns RallySettingsResponse Successful Response
     * @throws ApiError
     */
    public static updateRallySettings(
        requestBody: RallySettingsUpdate,
    ): CancelablePromise<RallySettingsResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/rally/settings',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
}

