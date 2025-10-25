/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

/**
 * The schema returned when listing multiple teams
 */
export type ListingTeam = {
    id: number;
    name: string;
    total: number;
    classification: number;
    versus_group_id?: (number | null);
    num_members: number;
    times?: Array<string>;
    last_checkpoint_time: (string | null);
    last_checkpoint_score?: (number | null);
    last_checkpoint_number?: (number | null);
};

