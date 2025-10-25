/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ActivityType } from './ActivityType';

/**
 * Schema for activity response
 */
export type ActivityResponse = {
    name: string;
    description?: (string | null);
    /**
     * Activity type enum
     */
    activity_type: ActivityType;
    checkpoint_id: number;
    config?: Record<string, any>;
    is_active?: boolean;
    /**
     * Order of activity within checkpoint (0 = no specific order)
     */
    order?: (number | null);
    id: number;
    created_at: string;
    updated_at: string;
};

