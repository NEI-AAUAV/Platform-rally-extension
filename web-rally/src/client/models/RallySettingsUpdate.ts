/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type RallySettingsUpdate = {
    max_teams: number;
    max_members_per_team: number;
    enable_versus: boolean;
    rally_start_time?: (string | null);
    rally_end_time?: (string | null);
    penalty_per_puke: number;
    penalty_per_not_drinking: number;
    bonus_per_extra_shot: number;
    max_extra_shots_per_member: number;
    checkpoint_order_matters: boolean;
    enable_staff_scoring: boolean;
    show_live_leaderboard: boolean;
    show_team_details: boolean;
    show_checkpoint_map: boolean;
    rally_theme: string;
    public_access_enabled: boolean;
};

