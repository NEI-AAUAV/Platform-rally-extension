/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { RallySettingsResponse } from '../models/RallySettingsResponse';
import type { RallySettingsUpdate } from '../models/RallySettingsUpdate';

import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';

export class SettingsService {

    /**
     * View Rally Settings
     * View rally settings
     * @returns RallySettingsResponse Successful Response
     * @throws ApiError
     */
    public static viewRallySettingsApiRallyV1RallySettingsGet(): CancelablePromise<RallySettingsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/rally/settings',
        });
    }

    /**
     * Update Rally Settings
     * Update global rally configuration (admin only).
     * Args:
     * settings_in: New settings values
     *
     * Returns:
     * Updated rally settings
     *
     * Raises:
     * 403: If user is not authorized
     * 400: If validation fails
     * @param requestBody
     * @returns RallySettingsResponse Successful Response
     * @throws ApiError
     */
    public static updateRallySettingsApiRallyV1RallySettingsPut(
        requestBody: RallySettingsUpdate,
    ): CancelablePromise<RallySettingsResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/rally/v1/rally/settings',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }

    /**
     * View Rally Settings Public
     * View rally settings (public access - no authentication required)
     * @returns RallySettingsResponse Successful Response
     * @throws ApiError
     */
    public static viewRallySettingsPublicApiRallyV1RallySettingsPublicGet(): CancelablePromise<RallySettingsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/rally/v1/rally/settings/public',
        });
    }

}
