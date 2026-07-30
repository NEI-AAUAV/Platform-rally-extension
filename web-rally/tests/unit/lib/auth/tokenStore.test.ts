import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStaffToken,
  setStaffToken,
  removeStaffToken,
  getTeamToken,
  setTeamToken,
  removeTeamToken,
  hasTeamData,
  getTeamData,
  setTeamData,
  removeTeamData,
  clearTeamAuth,
  clearAllAuth,
} from '@/lib/auth/tokenStore';

describe('tokenStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('staff token', () => {
    it('returns null when no staff token is stored', () => {
      expect(getStaffToken()).toBeNull();
    });

    it('sets and retrieves staff token', () => {
      setStaffToken('staff-abc');
      expect(getStaffToken()).toBe('staff-abc');
    });

    it('removes staff token', () => {
      setStaffToken('staff-abc');
      removeStaffToken();
      expect(getStaffToken()).toBeNull();
    });
  });

  describe('team token', () => {
    it('returns null when no team token is stored', () => {
      expect(getTeamToken()).toBeNull();
    });

    it('sets and retrieves team token', () => {
      setTeamToken('team-xyz');
      expect(getTeamToken()).toBe('team-xyz');
    });

    it('removes team token', () => {
      setTeamToken('team-xyz');
      removeTeamToken();
      expect(getTeamToken()).toBeNull();
    });
  });

  describe('team data', () => {
    it('hasTeamData returns false when absent', () => {
      expect(hasTeamData()).toBe(false);
    });

    it('hasTeamData returns true once set, even if later unparseable via getTeamData', () => {
      setTeamData({ team_id: 1, team_name: 'Team A' });
      expect(hasTeamData()).toBe(true);
    });

    it('getTeamData returns null when absent', () => {
      expect(getTeamData()).toBeNull();
    });

    it('sets and retrieves team data', () => {
      setTeamData({ team_id: 7, team_name: 'Team B' });
      expect(getTeamData()).toEqual({ team_id: 7, team_name: 'Team B' });
    });

    it('getTeamData returns null when stored value is corrupt JSON', () => {
      localStorage.setItem('rally_team_data', '{not valid json');
      expect(getTeamData()).toBeNull();
    });

    it('removes team data', () => {
      setTeamData({ team_id: 7, team_name: 'Team B' });
      removeTeamData();
      expect(getTeamData()).toBeNull();
      expect(hasTeamData()).toBe(false);
    });
  });

  describe('composite clears', () => {
    it('clearTeamAuth removes team token and data but leaves staff token intact', () => {
      setStaffToken('staff-abc');
      setTeamToken('team-xyz');
      setTeamData({ team_id: 1, team_name: 'Team A' });

      clearTeamAuth();

      expect(getStaffToken()).toBe('staff-abc');
      expect(getTeamToken()).toBeNull();
      expect(getTeamData()).toBeNull();
    });

    it('clearAllAuth removes staff token, team token, and team data', () => {
      setStaffToken('staff-abc');
      setTeamToken('team-xyz');
      setTeamData({ team_id: 1, team_name: 'Team A' });

      clearAllAuth();

      expect(getStaffToken()).toBeNull();
      expect(getTeamToken()).toBeNull();
      expect(getTeamData()).toBeNull();
    });
  });
});
