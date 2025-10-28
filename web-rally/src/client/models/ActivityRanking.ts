/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { TeamRanking } from './TeamRanking';

/**
 * Schema for activity-specific ranking
 */
export type ActivityRanking = {
    activity_id: number;
    activity_name: string;
    rankings: Array<TeamRanking>;
};

