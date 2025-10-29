/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ActivityType } from './ActivityType';

/**
 * Schema for creating an activity
 */
export type ActivityCreate = {
    name: string;
    description?: (string | null);
    /**
     * Activity type enum
     */
    activity_type: ActivityType;
    checkpoint_id: number;
    config?: Record<string, any>;
    is_active?: boolean;
};

