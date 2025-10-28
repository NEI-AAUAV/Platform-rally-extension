"""
Unit test simulating a complete rally game with different activity types
This test emulates a real game scenario with multiple teams competing and scoring
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from app.models.activity_factory import ActivityFactory


class TestGameSimulationScoring:
    """Simulate a complete rally game with scoring calculations"""
    
    def test_general_activity_scoring(self):
        """Test scoring for general activities (staff-assigned points)"""
        # Create general activity instance
        activity_config = {"max_points": 100, "min_points": 0, "default_points": 50}
        activity = ActivityFactory.create_activity("GeneralActivity", activity_config)
        
        # Team gets 70 points from staff
        result_data = {"assigned_points": 70}
        base_score = activity.calculate_score(result_data, team_size=3)
        
        assert base_score == 70
        print(f"General Activity: Base score = {base_score}")
        
        # Apply 2 extra shots (bonus)
        modifiers = {
            'extra_shots': 2,
            'penalties': {}
        }
        
        # Mock database for apply_modifiers
        mock_db = Mock()
        settings = Mock()
        settings.bonus_per_extra_shot = 2
        mock_db.query.return_value.first.return_value = settings
        
        final_score = activity.apply_modifiers(base_score, modifiers, mock_db)
        
        # 70 + (2 * 2) = 74
        assert final_score == 74
        print(f"General Activity with 2 extra shots: Final score = {final_score}")
    
    def test_time_based_activity_scoring(self):
        """Test scoring for time-based activities (relative ranking)"""
        # Create time-based activity instance
        activity_config = {"max_points": 100, "min_points": 10}
        activity = ActivityFactory.create_activity("TimeBasedActivity", activity_config)
        
        # Simulate 3 teams with different completion times
        all_times = [45, 35, 55]  # Team 2 fastest (35s), Team 3 slowest (55s)
        
        scores = []
        for i, time in enumerate(all_times):
            # Calculate relative ranking for each team's time
            ranked_score = activity.calculate_relative_ranking_score(all_times, time)
            scores.append(ranked_score)
            
            print(f"Team {i+1} ({time}s): {ranked_score} points")
        
        # Team 2 (35s - fastest) should have highest score
        assert scores[1] > scores[0]  # Team 2 > Team 1
        assert scores[1] > scores[2]  # Team 2 > Team 3
        
        # Team 3 (55s - slowest) should have lowest score
        assert scores[2] < scores[0]
        
        print(f"\nRanking: Fastest gets highest score ({scores[1]}), Slowest gets lowest ({scores[2]})")
    
    def test_boolean_activity_scoring(self):
        """Test scoring for boolean activities (pass/fail)"""
        # Create boolean activity instance
        activity_config = {"success_points": 100, "failure_points": 0}
        activity = ActivityFactory.create_activity("BooleanActivity", activity_config)
        
        # Team 1: Success
        result_data_success = {"success": True}
        score_success = activity.calculate_score(result_data_success, team_size=3)
        assert score_success == 100
        
        # Team 2: Failure
        result_data_fail = {"success": False}
        score_fail = activity.calculate_score(result_data_fail, team_size=3)
        assert score_fail == 0
        
        print(f"Boolean Activity - Success: {score_success}, Failure: {score_fail}")
    
    def test_score_based_activity_scoring(self):
        """Test scoring for score-based activities (proportional)"""
        # Create score-based activity instance
        activity_config = {"max_points": 100, "base_score": 50}
        activity = ActivityFactory.create_activity("ScoreBasedActivity", activity_config)
        
        # Team gets 80 out of 100 possible points
        result_data = {"achieved_points": 80}
        base_score = activity.calculate_score(result_data, team_size=3)
        
        # Proportional calculation: (80/100) * 50 = 40
        assert base_score == 40
        print(f"Score-based Activity: {base_score} points (80/100 of base 50)")
        
        # Apply penalty of 5 points
        modifiers = {
            'extra_shots': 0,
            'penalties': {"vomit": 5}
        }
        
        # Mock database for apply_modifiers
        mock_db = Mock()
        settings = Mock()
        settings.bonus_per_extra_shot = 2
        mock_db.query.return_value.first.return_value = settings
        
        final_score = activity.apply_modifiers(base_score, modifiers, mock_db)
        
        # 40 - 5 = 35
        assert final_score == 35
        print(f"Score-based Activity with penalty: {final_score} points")
    
    def test_complete_game_scenario(self):
        """Simulate a complete rally game with multiple activity types"""
        print("\n=== RALLY GAME SIMULATION ===\n")
        
        # Setup teams
        teams = {
            "Team 1": {"activities": []},
            "Team 2": {"activities": []},
            "Team 3": {"activities": []}
        }
        
        # PHASE 1: General Activity (Mimic Challenge)
        print("PHASE 1: Mimic Challenge (General Activity)")
        gen_config = {"max_points": 100, "min_points": 0, "default_points": 50}
        gen_activity = ActivityFactory.create_activity("GeneralActivity", gen_config)
        
        gen_scores = {"Team 1": 80, "Team 2": 65, "Team 3": 90}
        for team_name, score in gen_scores.items():
            result_data = {"assigned_points": score}
            base_score = gen_activity.calculate_score(result_data, team_size=3)
            
            # Apply extra shots (Team 1 gets bonus)
            modifiers = {
                'extra_shots': 3 if team_name == "Team 1" else 0,
                'penalties': {"vomit": 5} if team_name == "Team 2" else {}
            }
            
            mock_db = Mock()
            settings = Mock()
            settings.bonus_per_extra_shot = 2
            mock_db.query.return_value.first.return_value = settings
            
            final_score = gen_activity.apply_modifiers(base_score, modifiers, mock_db)
            teams[team_name]["activities"].append(final_score)
            
            print(f"  {team_name}: {final_score} points")
        
        # PHASE 2: Time-Based Activity (3-Legged Race)
        print("\nPHASE 2: 3-Legged Race (Time-Based)")
        time_config = {"max_points": 100, "min_points": 10}
        time_activity = ActivityFactory.create_activity("TimeBasedActivity", time_config)
        
        race_times = [45, 35, 55]  # Team 1: 45s, Team 2: 35s, Team 3: 55s
        all_times = race_times
        
        for i, team_name in enumerate(teams.keys()):
            time = race_times[i]
            # Calculate relative ranking for each team's time
            ranked_score = time_activity.calculate_relative_ranking_score(all_times, time)
            teams[team_name]["activities"].append(ranked_score)
            
            print(f"  {team_name}: {ranked_score} points (completed in {time}s)")
        
        # PHASE 3: Boolean Activity (Tongue Twister)
        print("\nPHASE 3: Tongue Twister (Boolean)")
        bool_config = {"success_points": 100, "failure_points": 0}
        bool_activity = ActivityFactory.create_activity("BooleanActivity", bool_config)
        
        bool_results = {"Team 1": True, "Team 2": False, "Team 3": True}
        for team_name, success in bool_results.items():
            result_data = {"success": success}
            score = bool_activity.calculate_score(result_data, team_size=3)
            teams[team_name]["activities"].append(score)
            
            print(f"  {team_name}: {score} points ({'Success' if success else 'Failure'})")
        
        # PHASE 4: Score-Based Activity (Darts Challenge)
        print("\nPHASE 4: Darts Challenge (Score-Based)")
        score_config = {"max_points": 100, "base_score": 50}
        score_activity = ActivityFactory.create_activity("ScoreBasedActivity", score_config)
        
        dart_scores = {"Team 1": 85, "Team 2": 70, "Team 3": 90}  # Points scored out of 100
        for team_name, achieved_points in dart_scores.items():
            result_data = {"achieved_points": achieved_points}
            base_score = score_activity.calculate_score(result_data, team_size=3)
            
            # Apply modifier (Team 1 gets extra shots bonus)
            modifiers = {
                'extra_shots': 2 if team_name == "Team 1" else 0,
                'penalties': {}
            }
            
            mock_db = Mock()
            settings = Mock()
            settings.bonus_per_extra_shot = 2
            mock_db.query.return_value.first.return_value = settings
            
            final_score = score_activity.apply_modifiers(base_score, modifiers, mock_db)
            teams[team_name]["activities"].append(final_score)
            
            print(f"  {team_name}: {final_score} points ({achieved_points}/100 target hits)")
        
        # PHASE 5: Another General Activity (Creative Challenge)
        print("\nPHASE 5: Creative Challenge (General Activity)")
        creative_config = {"max_points": 100, "min_points": 20, "default_points": 60}
        creative_activity = ActivityFactory.create_activity("GeneralActivity", creative_config)
        
        creative_scores = {"Team 1": 75, "Team 2": 80, "Team 3": 70}
        for team_name, score in creative_scores.items():
            result_data = {"assigned_points": score}
            base_score = creative_activity.calculate_score(result_data, team_size=3)
            
            # Apply penalties (Team 3 gets penalty)
            modifiers = {
                'extra_shots': 0,
                'penalties': {"vomit": 8} if team_name == "Team 3" else {}
            }
            
            mock_db = Mock()
            settings = Mock()
            settings.bonus_per_extra_shot = 2
            mock_db.query.return_value.first.return_value = settings
            
            final_score = creative_activity.apply_modifiers(base_score, modifiers, mock_db)
            teams[team_name]["activities"].append(final_score)
            
            print(f"  {team_name}: {final_score} points")
        
        # PHASE 6: Team Sprint (Time-Based)
        print("\nPHASE 6: Team Sprint (Time-Based)")
        sprint_config = {"max_points": 100, "min_points": 10}
        sprint_activity = ActivityFactory.create_activity("TimeBasedActivity", sprint_config)
        
        sprint_times = [52, 48, 55]  # Team 2 fastest, Team 3 slowest
        all_times_sprint = sprint_times
        
        for i, team_name in enumerate(teams.keys()):
            time = sprint_times[i]
            ranked_score = sprint_activity.calculate_relative_ranking_score(all_times_sprint, time)
            teams[team_name]["activities"].append(ranked_score)
            
            print(f"  {team_name}: {ranked_score} points (completed in {time}s)")
        
        # PHASE 7: Memory Game (Score-Based)
        print("\nPHASE 7: Memory Game (Score-Based)")
        memory_config = {"max_points": 120, "base_score": 60}
        memory_activity = ActivityFactory.create_activity("ScoreBasedActivity", memory_config)
        
        memory_scores = {"Team 1": 100, "Team 2": 110, "Team 3": 95}  # Out of 120
        for team_name, achieved_points in memory_scores.items():
            result_data = {"achieved_points": achieved_points}
            base_score = memory_activity.calculate_score(result_data, team_size=3)
            
            # Apply bonuses (Team 2 gets extra shots, Team 3 gets penalty)
            modifiers = {
                'extra_shots': 4 if team_name == "Team 2" else 0,
                'penalties': {"not_drinking": 3} if team_name == "Team 3" else {}
            }
            
            mock_db = Mock()
            settings = Mock()
            settings.bonus_per_extra_shot = 2
            mock_db.query.return_value.first.return_value = settings
            
            final_score = memory_activity.apply_modifiers(base_score, modifiers, mock_db)
            teams[team_name]["activities"].append(final_score)
            
            print(f"  {team_name}: {final_score} points ({achieved_points}/120 items)")
        
        # PHASE 8: Puzzle Challenge (Boolean)
        print("\nPHASE 8: Puzzle Challenge (Boolean)")
        puzzle_config = {"success_points": 100, "failure_points": 0}
        puzzle_activity = ActivityFactory.create_activity("BooleanActivity", puzzle_config)
        
        puzzle_results = {"Team 1": True, "Team 2": True, "Team 3": True}  # All succeed
        for team_name, success in puzzle_results.items():
            result_data = {"success": success}
            score = puzzle_activity.calculate_score(result_data, team_size=3)
            teams[team_name]["activities"].append(score)
            
            print(f"  {team_name}: {score} points ({'Success' if success else 'Failure'})")
        
        # Calculate totals
        print("\n=== FINAL STANDINGS ===")
        totals = {}
        for team_name, data in teams.items():
            total = sum(data["activities"])
            totals[team_name] = total
            print(f"{team_name}: {total} points")
        
        # Assertions
        assert totals["Team 1"] > 0
        assert totals["Team 2"] > 0
        assert totals["Team 3"] > 0
        
        # Rank teams
        ranked_teams = sorted(totals.items(), key=lambda x: x[1], reverse=True)
        print(f"\n🥇 1st Place: {ranked_teams[0][0]} with {ranked_teams[0][1]:.1f} points!")
        print(f"🥈 2nd Place: {ranked_teams[1][0]} with {ranked_teams[1][1]:.1f} points")
        print(f"🥉 3rd Place: {ranked_teams[2][0]} with {ranked_teams[2][1]:.1f} points")
        
        print("\n=== GAME SIMULATION COMPLETE ===\n")
    
    def test_penalties_and_bonuses(self):
        """Test that penalties and bonuses are correctly applied"""
        print("\n=== TESTING PENALTIES AND BONUSES ===\n")
        
        # Base score for an activity
        base_score = 50
        
        # Create general activity
        activity_config = {"max_points": 100, "min_points": 0, "default_points": 50}
        activity = ActivityFactory.create_activity("GeneralActivity", activity_config)
        
        # Test 1: Extra shots bonus
        mock_db = Mock()
        settings = Mock()
        settings.bonus_per_extra_shot = 2
        mock_db.query.return_value.first.return_value = settings
        
        modifiers_bonus = {'extra_shots': 3, 'penalties': {}}
        score_with_bonus = activity.apply_modifiers(base_score, modifiers_bonus, mock_db)
        
        assert score_with_bonus == 56  # 50 + (3 * 2)
        print(f"Base score: {base_score}")
        print(f"With 3 extra shots (+6): {score_with_bonus}")
        
        # Test 2: Penalty
        modifiers_penalty = {'extra_shots': 0, 'penalties': {"vomit": 5}}
        score_with_penalty = activity.apply_modifiers(base_score, modifiers_penalty, mock_db)
        
        assert score_with_penalty == 45  # 50 - 5
        print(f"With vomit penalty (-5): {score_with_penalty}")
        
        # Test 3: Both bonus and penalty
        modifiers_both = {'extra_shots': 2, 'penalties': {"vomit": 5}}
        score_with_both = activity.apply_modifiers(base_score, modifiers_both, mock_db)
        
        assert score_with_both == 49  # 50 + (2 * 2) - 5 = 49
        print(f"With 2 extra shots (+4) and penalty (-5): {score_with_both}")
        
        print("\n=== PENALTIES AND BONUSES WORKING CORRECTLY ===\n")
    
    def test_time_based_recalculation(self):
        """Test that time-based activity scores are recalculated when new teams finish"""
        print("\n=== TESTING RECALCULATION FOR TIME-BASED ACTIVITIES ===\n")
        
        # Create time-based activity
        activity_config = {"max_points": 100, "min_points": 10}
        activity = ActivityFactory.create_activity("TimeBasedActivity", activity_config)
        
        print("Initial Scenario: Only Team 1 and Team 2 have finished")
        initial_times = [45, 55]  # Team 1: 45s, Team 2: 55s
        team1_time = 45
        team2_time = 55
        
        # Calculate initial scores
        team1_initial = activity.calculate_relative_ranking_score(initial_times, team1_time)
        team2_initial = activity.calculate_relative_ranking_score(initial_times, team2_time)
        
        print(f"Team 1 (45s): {team1_initial} points (Rank 1/2)")
        print(f"Team 2 (55s): {team2_initial} points (Rank 2/2)")
        
        # Team 1 should have highest score (fastest)
        assert team1_initial > team2_initial
        assert team1_initial == 100  # Best time gets max points
        assert team2_initial == 10  # Worst time gets min points
        
        print("\nAfter Team 3 (35s) joins: Fastest time detected!")
        new_times = [45, 55, 35]  # Team 3 is now fastest
        
        # Recalculate all scores with the new competitor
        team1_recalc = activity.calculate_relative_ranking_score(new_times, team1_time)
        team2_recalc = activity.calculate_relative_ranking_score(new_times, team2_time)
        team3_recalc = activity.calculate_relative_ranking_score(new_times, 35)
        
        print(f"Team 1 (45s): {team1_recalc} points (Rank 2/3)")
        print(f"Team 2 (55s): {team2_recalc} points (Rank 3/3)")
        print(f"Team 3 (35s): {team3_recalc} points (Rank 1/3)")
        
        # Verify recalculation changed scores
        assert team1_recalc < team1_initial, "Team 1 score should decrease when a faster team joins"
        assert team3_recalc == 100, "Team 3 should get max points (fastest)"
        assert team2_recalc == 10, "Team 2 should get min points (slowest)"
        
        # Team 3 is now fastest
        assert team3_recalc > team1_recalc > team2_recalc
        
        print("\nAfter Team 4 (40s) joins: Another middle position")
        final_times = [45, 55, 35, 40]  # Now 4 teams
        
        # Recalculate again
        team1_final = activity.calculate_relative_ranking_score(final_times, team1_time)
        team2_final = activity.calculate_relative_ranking_score(final_times, team2_time)
        team3_final = activity.calculate_relative_ranking_score(final_times, 35)
        team4_final = activity.calculate_relative_ranking_score(final_times, 40)
        
        print(f"Team 1 (45s): {team1_final} points")
        print(f"Team 2 (55s): {team2_final} points")
        print(f"Team 3 (35s): {team3_final} points (Best!)")
        print(f"Team 4 (40s): {team4_final} points")
        
        # Verify final ranking order
        assert team3_final > team4_final > team1_final > team2_final
        
        print("\n✅ Recalculation working correctly: Scores update as teams finish!")
        print("This ensures fair relative ranking in time-based activities.\n")
    
    def test_time_based_ties_recalculation(self):
        """Test recalculation when multiple teams have identical times (ties)"""
        print("\n=== TESTING TIES IN TIME-BASED ACTIVITIES ===\n")
        
        activity_config = {"max_points": 100, "min_points": 10}
        activity = ActivityFactory.create_activity("TimeBasedActivity", activity_config)
        
        print("Scenario: Multiple teams finish with the same time")
        all_times = [45, 45, 45, 60]  # Teams 1-3 all finished in 45s
        
        team1_score = activity.calculate_relative_ranking_score(all_times, 45)
        team2_score = activity.calculate_relative_ranking_score(all_times, 45)
        team3_score = activity.calculate_relative_ranking_score(all_times, 45)
        team4_score = activity.calculate_relative_ranking_score(all_times, 60)
        
        print(f"Team 1 (45s): {team1_score} points")
        print(f"Team 2 (45s): {team2_score} points")
        print(f"Team 3 (45s): {team3_score} points")
        print(f"Team 4 (60s): {team4_score} points")
        
        # All teams with tied times should have the same score
        assert team1_score == team2_score == team3_score
        # Team 4 (slowest) should have lowest score
        assert team4_score < team1_score
        
        print("\n✅ Ties handled correctly: Teams with identical times share the rank!\n")
    
    def test_recalculation_on_evaluation_update(self):
        """Test that updating an evaluation triggers recalculation for time-based activities"""
        print("\n=== TESTING RECALCULATION ON UPDATE ===\n")
        
        activity_config = {"max_points": 100, "min_points": 10}
        activity = ActivityFactory.create_activity("TimeBasedActivity", activity_config)
        
        # Initial state: 3 teams have completed
        print("Initial: 3 teams finished")
        initial_times = [50, 60, 40]  # Team 3 fastest, Team 2 slowest
        
        team1_initial = activity.calculate_relative_ranking_score(initial_times, 50)
        team2_initial = activity.calculate_relative_ranking_score(initial_times, 60)
        team3_initial = activity.calculate_relative_ranking_score(initial_times, 40)
        
        print(f"Team 1 (50s): {team1_initial} points")
        print(f"Team 2 (60s): {team2_initial} points")
        print(f"Team 3 (40s): {team3_initial} points")
        
        # Team 3 is fastest
        assert team3_initial == 100
        assert team2_initial == 10
        
        # Simulate staff updating Team 2's time (they realize they made an error)
        print("\nStaff updates Team 2's time from 60s to 35s (mistake corrected)")
        
        # New times after update
        updated_times = [50, 35, 40]  # Team 2 is now fastest!
        
        # Recalculate all scores
        team1_updated = activity.calculate_relative_ranking_score(updated_times, 50)
        team2_updated = activity.calculate_relative_ranking_score(updated_times, 35)
        team3_updated = activity.calculate_relative_ranking_score(updated_times, 40)
        
        print(f"Team 1 (50s): {team1_updated} points")
        print(f"Team 2 (35s): {team2_updated} points (Updated from 60s)")
        print(f"Team 3 (40s): {team3_updated} points")
        
        # Verify recalculation
        assert team2_updated == 100, "Team 2 should now be fastest"
        assert team2_updated > team1_initial, "Team 2 score should increase after update"
        assert team1_updated < team1_initial, "Team 1 score should decrease (now middle)"
        
        # Verify new ranking: Team 2 > Team 3 > Team 1
        assert team2_updated > team3_updated > team1_updated
        
        print("\n✅ Recalculation on update working correctly!")
        print("All teams' scores update when one result is corrected.")
