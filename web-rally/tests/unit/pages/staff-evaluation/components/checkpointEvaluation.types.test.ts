import { describe, it, expect } from 'vitest';
import { toEvaluationSummary } from '@/pages/staff-evaluation/components/checkpointEvaluation.types';

describe('toEvaluationSummary', () => {
  it('returns full defaults when given null', () => {
    expect(toEvaluationSummary(null)).toEqual({
      total_activities: 0,
      completed_activities: 0,
      pending_activities: 0,
      completion_rate: 0,
      has_incomplete: false,
      missing_activities: [],
      checkpoint_mismatch: undefined,
      team_checkpoint: null,
      current_checkpoint: null,
    });
  });

  it('returns defaults when given undefined', () => {
    expect(toEvaluationSummary()).toEqual({
      total_activities: 0,
      completed_activities: 0,
      pending_activities: 0,
      completion_rate: 0,
      has_incomplete: false,
      missing_activities: [],
      checkpoint_mismatch: undefined,
      team_checkpoint: null,
      current_checkpoint: null,
    });
  });

  it('preserves provided values', () => {
    const result = toEvaluationSummary({
      total_activities: 5,
      completed_activities: 3,
      pending_activities: 2,
      completion_rate: 60,
      has_incomplete: true,
      missing_activities: ['A'],
      checkpoint_mismatch: true,
      team_checkpoint: 1,
      current_checkpoint: 2,
    });
    expect(result.total_activities).toBe(5);
    expect(result.missing_activities).toEqual(['A']);
    expect(result.checkpoint_mismatch).toBe(true);
  });
});
