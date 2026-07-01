"""
Additional tests for staff_evaluation_utils to improve coverage
"""
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timezone
from fastapi import HTTPException

from app.api.api_v1.staff_evaluation_utils import (
    create_activity_result,
    check_and_advance_team,
    ensure_team_checkpoint_and_advance,
    checkin_team_to_checkpoint,
    advance_team_to_next_checkpoint,
    compute_checkpoint_progress,
    checkpoint_has_activities,
    is_checkpoint_completed,
    determine_current_order,
    build_team_for_staff,
)
from app.schemas.activity import ActivityResultEvaluation


class TestActivityResultCreation:
    """Test activity result creation functions"""
    
    async def test_create_activity_result_success(self):
        """Test successful activity result creation"""
        mock_db = AsyncMock()
        team_id = 1
        activity_id = 1
        
        result_in = ActivityResultEvaluation(
            result_data={"score": 100},
            extra_shots=2,
            penalties={"vomit": 1}
        )
        
        mock_result = Mock()
        mock_result.id = 1
        
        with patch('app.api.api_v1.staff_evaluation_utils.ScoringService') as mock_scoring:
            mock_scoring.return_value.create_result = AsyncMock(return_value=mock_result)
            result = await create_activity_result(mock_db, team_id, activity_id, result_in)
            assert result == mock_result


class TestTeamCheckpointProgression:
    """Test team checkpoint progression functions"""
    
    @staticmethod
    def _wire_advance_mocks(mock_db, *, final_score, team_times=None, checkpoint_order=1):
        """Common mock wiring for check_and_advance_team tests."""
        mock_activity = Mock()
        mock_activity.checkpoint_id = 1

        # The single activity at this checkpoint
        mock_checkpoint_activity = Mock()
        mock_checkpoint_activity.id = 10
        mock_checkpoint_activity.is_active = True

        # The team's result for that activity
        mock_result = Mock()
        mock_result.activity = Mock()
        mock_result.activity.checkpoint_id = 1
        mock_result.activity_id = 10
        mock_result.final_score = final_score

        mock_db.scalars = AsyncMock(
            return_value=Mock(unique=Mock(return_value=Mock(all=Mock(return_value=[mock_result]))))
        )

        patches = [
            patch(
                'app.crud.crud_checkpoint.checkpoint.get',
                AsyncMock(return_value=Mock(id=1, order=checkpoint_order)),
            ),
            patch(
                'app.api.api_v1.staff_evaluation_utils.team.get',
                AsyncMock(return_value=Mock(times=team_times if team_times is not None else [])),
            ),
            patch(
                'app.crud.crud_activity.activity.get_by_checkpoint',
                AsyncMock(return_value=[mock_checkpoint_activity]),
            ),
        ]
        return mock_activity, patches

    async def test_check_and_advance_team_with_scored_results(self):
        """Team advances once all checkpoint activities have scored results"""
        mock_db = AsyncMock()
        team_id = 1
        mock_activity, patches = self._wire_advance_mocks(
            mock_db, final_score=100, team_times=[datetime.now(timezone.utc)]
        )

        with patches[0], patches[1], patches[2], patch(
            'app.api.api_v1.staff_evaluation_utils.ensure_team_checkpoint_and_advance'
        ) as mock_advance:
            await check_and_advance_team(mock_db, team_id, mock_activity)
            mock_advance.assert_called_once_with(mock_db, team_id, 1)

    async def test_check_and_advance_team_no_scored_results(self):
        """Team does not advance when activities are unscored"""
        mock_db = AsyncMock()
        team_id = 1
        mock_activity, patches = self._wire_advance_mocks(mock_db, final_score=None)

        with patches[0], patches[1], patches[2], patch(
            'app.api.api_v1.staff_evaluation_utils.ensure_team_checkpoint_and_advance'
        ) as mock_advance:
            await check_and_advance_team(mock_db, team_id, mock_activity)
            mock_advance.assert_not_called()

    async def test_check_and_advance_team_idempotent_when_already_past(self):
        """Re-evaluating at a checkpoint the team already passed never advances again"""
        mock_db = AsyncMock()
        team_id = 1
        # Team already visited 2 checkpoints; activity's checkpoint has order 1.
        past_times = [datetime.now(timezone.utc), datetime.now(timezone.utc)]
        mock_activity, patches = self._wire_advance_mocks(
            mock_db, final_score=100, team_times=past_times, checkpoint_order=1
        )

        with patches[0], patches[1], patches[2], patch(
            'app.api.api_v1.staff_evaluation_utils.ensure_team_checkpoint_and_advance'
        ) as mock_advance:
            await check_and_advance_team(mock_db, team_id, mock_activity)
            mock_advance.assert_not_called()

    async def test_check_and_advance_team_global_activity_never_advances(self):
        """Global activities (checkpoint_id None) must not drive progression"""
        mock_db = AsyncMock()
        mock_activity = Mock()
        mock_activity.checkpoint_id = None

        with patch(
            'app.api.api_v1.staff_evaluation_utils.ensure_team_checkpoint_and_advance'
        ) as mock_advance:
            await check_and_advance_team(mock_db, 1, mock_activity)
            mock_advance.assert_not_called()
    
    async def test_ensure_team_checkpoint_and_advance_needs_checkin(self):
        """Test team is checked in before advancement"""
        mock_db = AsyncMock()
        team_id = 1
        checkpoint_id = 2
        
        # Team at checkpoint 0, needs to be checked into checkpoint 2
        mock_team = Mock()
        mock_team.times = []  # No checkpoints visited
        
        mock_checkpoint = Mock()
        mock_checkpoint.order = 2
        
        with patch('app.api.api_v1.staff_evaluation_utils.team.get', return_value=mock_team), \
             patch('app.crud.crud_checkpoint.checkpoint.get', return_value=mock_checkpoint), \
             patch('app.api.api_v1.staff_evaluation_utils.checkin_team_to_checkpoint') as mock_checkin, \
             patch('app.api.api_v1.staff_evaluation_utils.advance_team_to_next_checkpoint') as mock_advance:
            
            await ensure_team_checkpoint_and_advance(mock_db, team_id, checkpoint_id)
            mock_checkin.assert_called_once_with(mock_db, team_id, checkpoint_id)
            mock_advance.assert_called_once_with(mock_db, team_id)
    
    async def test_checkin_team_to_checkpoint_success(self):
        """Test successful team check-in"""
        mock_db = AsyncMock()
        team_id = 1
        checkpoint_id = 1
        
        with patch('app.crud.crud_team.team.add_checkpoint') as mock_add:
            await checkin_team_to_checkpoint(mock_db, team_id, checkpoint_id)
            mock_add.assert_called_once()
    
    async def test_checkin_team_to_checkpoint_failure(self):
        """Test team check-in failure propagates exception"""
        mock_db = AsyncMock()
        team_id = 1
        checkpoint_id = 1
        
        with patch('app.crud.crud_team.team.add_checkpoint', side_effect=Exception("DB error")):
            with pytest.raises(Exception, match="DB error"):
                await checkin_team_to_checkpoint(mock_db, team_id, checkpoint_id)
    
    async def test_advance_team_to_next_checkpoint_success(self):
        """Test successful team advancement"""
        mock_db = AsyncMock()
        team_id = 1
        
        mock_next_checkpoint = Mock()
        mock_next_checkpoint.id = 2
        
        with patch('app.crud.crud_checkpoint.checkpoint.get_next', return_value=mock_next_checkpoint), \
             patch('app.crud.crud_team.team.add_checkpoint') as mock_add:
            await advance_team_to_next_checkpoint(mock_db, team_id)
            mock_add.assert_called_once()
    
    async def test_advance_team_to_next_checkpoint_no_next(self):
        """Test advancement when no next checkpoint exists"""
        mock_db = AsyncMock()
        team_id = 1
        
        with patch('app.crud.crud_checkpoint.checkpoint.get_next', return_value=None), \
             patch('app.crud.crud_team.team.add_checkpoint') as mock_add:
            await advance_team_to_next_checkpoint(mock_db, team_id)
            mock_add.assert_not_called()
    
    async def test_advance_team_to_next_checkpoint_failure(self):
        """Test team advancement failure propagates exception"""
        mock_db = AsyncMock()
        team_id = 1
        
        mock_next_checkpoint = Mock()
        mock_next_checkpoint.id = 2
        
        with patch('app.crud.crud_checkpoint.checkpoint.get_next', return_value=mock_next_checkpoint), \
             patch('app.crud.crud_team.team.add_checkpoint', side_effect=Exception("DB error")):
            with pytest.raises(Exception, match="DB error"):
                await advance_team_to_next_checkpoint(mock_db, team_id)


class TestCheckpointProgressCalculation:
    """Test checkpoint progress calculation functions"""
    
    async def test_checkpoint_has_activities_true(self):
        """Test checkpoint has activities"""
        mock_db = AsyncMock()
        checkpoint_id = 1
        
        mock_activities = [Mock(), Mock()]
        
        with patch('app.crud.crud_activity.activity.get_by_checkpoint', return_value=mock_activities):
            result = await checkpoint_has_activities(mock_db, checkpoint_id)
            assert result is True
    
    async def test_checkpoint_has_activities_false(self):
        """Test checkpoint has no activities"""
        mock_db = AsyncMock()
        checkpoint_id = 1
        
        with patch('app.crud.crud_activity.activity.get_by_checkpoint', return_value=[]):
            result = await checkpoint_has_activities(mock_db, checkpoint_id)
            assert result is False
    
    async def test_is_checkpoint_completed_true(self):
        """Test checkpoint is completed"""
        mock_db = AsyncMock()
        checkpoint_id = 1
        
        mock_activity1 = Mock()
        mock_activity1.id = 1
        mock_activity2 = Mock()
        mock_activity2.id = 2
        
        completed_ids = {1, 2}
        
        with patch('app.crud.crud_activity.activity.get_by_checkpoint', return_value=[mock_activity1, mock_activity2]):
            result = await is_checkpoint_completed(mock_db, checkpoint_id, completed_ids)
            assert result is True
    
    async def test_is_checkpoint_completed_false(self):
        """Test checkpoint is not completed"""
        mock_db = AsyncMock()
        checkpoint_id = 1
        
        mock_activity1 = Mock()
        mock_activity1.id = 1
        mock_activity2 = Mock()
        mock_activity2.id = 2
        
        completed_ids = {1}  # Only one activity completed
        
        with patch('app.crud.crud_activity.activity.get_by_checkpoint', return_value=[mock_activity1, mock_activity2]):
            result = await is_checkpoint_completed(mock_db, checkpoint_id, completed_ids)
            assert result is False
    
    async def test_is_checkpoint_completed_no_activities(self):
        """Test checkpoint with no activities is not completed"""
        mock_db = AsyncMock()
        checkpoint_id = 1
        completed_ids = set()
        
        with patch('app.crud.crud_activity.activity.get_by_checkpoint', return_value=[]):
            result = await is_checkpoint_completed(mock_db, checkpoint_id, completed_ids)
            assert result is False
    
    async def test_determine_current_order_not_at_max(self):
        """Test current order when not at maximum"""
        mock_checkpoint = Mock()
        mock_checkpoint.order = 5
        checkpoints = [mock_checkpoint]
        last_completed = 2
        
        result = determine_current_order(checkpoints, last_completed)
        assert result == 3  # last_completed + 1
    
    async def test_determine_current_order_at_max(self):
        """Test current order when at maximum"""
        mock_checkpoint = Mock()
        mock_checkpoint.order = 5
        checkpoints = [mock_checkpoint]
        last_completed = 5
        
        result = determine_current_order(checkpoints, last_completed)
        assert result == 5  # stays at max
    
    async def test_determine_current_order_empty_checkpoints(self):
        """Test current order with no checkpoints"""
        checkpoints = []
        last_completed = 3
        
        result = determine_current_order(checkpoints, last_completed)
        assert result == 3  # returns last_completed
    
    async def test_compute_checkpoint_progress_all_completed(self):
        """Test progress calculation with all checkpoints completed"""
        mock_db = AsyncMock()
        mock_team = Mock()
        mock_team.id = 1
        
        # Mock checkpoints
        mock_cp1 = Mock()
        mock_cp1.id = 1
        mock_cp1.order = 1
        mock_cp2 = Mock()
        mock_cp2.id = 2
        mock_cp2.order = 2
        
        # Mock results
        mock_result1 = Mock()
        mock_result1.activity_id = 1
        mock_result1.is_completed = True
        mock_result2 = Mock()
        mock_result2.activity_id = 2
        mock_result2.is_completed = True
        
        with patch('app.crud.crud_checkpoint.checkpoint.get_all_ordered', return_value=[mock_cp1, mock_cp2]), \
             patch('app.crud.crud_activity.activity_result.get_by_team', return_value=[mock_result1, mock_result2]), \
             patch('app.api.api_v1.staff_evaluation_utils.checkpoint_has_activities', return_value=True), \
             patch('app.api.api_v1.staff_evaluation_utils.is_checkpoint_completed', return_value=True):
            
            last, current, completed = await compute_checkpoint_progress(mock_db, mock_team)
            assert last == 2
            assert current == 2
            assert completed == [1, 2]
    
    async def test_build_team_for_staff_complete(self):
        """Test building team data for staff with all fields"""
        mock_db = AsyncMock()
        mock_team = Mock()
        mock_team.id = 1
        mock_team.name = "Test Team"
        mock_team.total = 100
        mock_team.classification = "A"
        mock_team.versus_group_id = 1
        mock_team.members = [Mock(), Mock()]
        mock_team.times = [datetime(2024, 1, 1, tzinfo=timezone.utc)]
        mock_team.score_per_checkpoint = [50]
        
        with patch('app.api.api_v1.staff_evaluation_utils.compute_checkpoint_progress', return_value=(1, 2, [1])):
            result = await build_team_for_staff(mock_db, mock_team, staff_checkpoint_order=1)
            
            assert result["id"] == 1
            assert result["name"] == "Test Team"
            assert result["num_members"] == 2
            assert result["last_checkpoint_number"] == 1
            assert result["current_checkpoint_number"] == 2
            assert result["completed_checkpoint_numbers"] == [1]
            assert result["evaluated_at_current_checkpoint"] is True
