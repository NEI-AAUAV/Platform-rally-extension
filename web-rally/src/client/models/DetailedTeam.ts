/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

import type { ListingUser } from './ListingUser';

export type DetailedTeam = {
    id: number;
    name: string;
    total: number;
    classification: number;
    versus_group_id?: (number | null);
    times: Array<string>;
    score_per_checkpoint: Array<number>;
    members: Array<ListingUser>;
};

