/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ActivityResponse } from './ActivityResponse';

/**
 * Schema for activity list response
 */
export type ActivityListResponse = {
    activities: Array<ActivityResponse>;
    total: number;
    page: number;
    size: number;
};

