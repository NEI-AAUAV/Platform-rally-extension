import { useState, useEffect, useRef } from "react";
import { BloodyButton } from "@/components/themes/bloody";
import { getPenaltyValues, getExtraShotsConfig } from "@/config/rallyDefaults";
import useRallySettings from "@/hooks/useRallySettings";
import { VersusService, TeamService } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import type { BaseActivityFormProps } from "@/types/forms";
import { getTeamSize } from "@/types/forms";
import type { ListingTeam } from "@/client";

export default function TeamVsForm({ existingResult, team, onSubmit, isSubmitting }: BaseActivityFormProps) {
  const [result, setResult] = useState<string>("win");
  const [opponentTeamId, setOpponentTeamId] = useState<number | undefined>();
  const [opponentTeamName, setOpponentTeamName] = useState<string>("");
  const [isOpponentPreselected, setIsOpponentPreselected] = useState(false);
  const [extraShots, setExtraShots] = useState<number>(0);
  const [penalties, setPenalties] = useState<{[key: string]: number}>({});
  const [notes, setNotes] = useState<string>("");
  const [teams, setTeams] = useState<ListingTeam[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const teamsFetchedRef = useRef(false);
  const toast = useAppToast();

  // Get Rally settings for dynamic configuration
  const { settings } = useRallySettings();

  // Calculate max extra shots based on team size
  const teamSize = getTeamSize(team);
  const extraShotsConfig = getExtraShotsConfig(settings);
  const maxExtraShotsPerMember = extraShotsConfig.perMember;
  const maxExtraShots = teamSize * maxExtraShotsPerMember;
  
  // Use penalty values from API settings or fallback to defaults
  const penaltyValues = getPenaltyValues(settings);

  // Fetch opponent when team is available, then fetch teams if needed
  useEffect(() => {
    const initializeOpponent = async () => {
      if (!team?.id) return;

      // First, try to fetch opponent from versus pair (if not in existingResult)
      if (!existingResult?.result_data?.opponent_team_id) {
        try {
          const opponent = await VersusService.getTeamOpponentApiRallyV1VersusTeamTeamIdOpponentGet(team.id);
          if (opponent?.opponent_id) {
            setOpponentTeamId(opponent.opponent_id);
            setOpponentTeamName(opponent.opponent_name || "");
            setIsOpponentPreselected(true); // Mark as automatically preselected
            return; // Opponent is preselected, don't fetch teams
          }
        } catch (error) {
          // Silently fail - opponent is optional
        }
      }

      // If opponent is not preselected, fetch teams list (only once)
      if (!teamsFetchedRef.current && !isLoadingTeams) {
        teamsFetchedRef.current = true;
        setIsLoadingTeams(true);
        try {
          const teamsList = await TeamService.getTeamsApiRallyV1TeamGet();
          // Exclude current team from the list
          const filteredTeams = teamsList.filter((t: ListingTeam) => t.id !== team.id);
          setTeams(filteredTeams);
          
          // If we have an opponent ID from existingResult but no name, try to find it now
          const currentOpponentId = opponentTeamId || existingResult?.result_data?.opponent_team_id;
          if (currentOpponentId) {
            const foundTeam = filteredTeams.find((t: ListingTeam) => t.id === currentOpponentId);
            if (foundTeam && !opponentTeamName) {
              setOpponentTeamName(foundTeam.name);
            }
          }
        } catch (error) {
          toast.error("Failed to load teams list");
          teamsFetchedRef.current = false; // Allow retry on error
        } finally {
          setIsLoadingTeams(false);
        }
      }
    };

    initializeOpponent();
    // Note: Intentionally omitting opponentTeamId, opponentTeamName, and teams from dependencies
    // to avoid infinite loops. These are state variables set by this effect itself.
    // The effect only needs to run when team.id or existingResult changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, existingResult?.result_data?.opponent_team_id]);

  useEffect(() => {
    if (existingResult?.result_data) {
      setResult(existingResult.result_data.result || "win");
      const existingOpponentId = existingResult.result_data.opponent_team_id;
      // Only set opponent if not already set to avoid infinite loops
      if (existingOpponentId && opponentTeamId === undefined) {
        setOpponentTeamId(existingOpponentId);
        // Try to find team name from teams list if available
        if (teams.length > 0) {
          const existingTeam = teams.find((t) => t.id === existingOpponentId);
          if (existingTeam && opponentTeamName === "") {
            setOpponentTeamName(existingTeam.name);
          }
        }
        // Don't mark as preselected when loading from existingResult - allow editing
        setIsOpponentPreselected(false);
      }
      setNotes(existingResult.result_data.notes || "");
    }
    if (existingResult) {
      setExtraShots(existingResult.extra_shots || 0);
      setPenalties(existingResult.penalties || {});
    }
    // Only depend on existingResult and teams - not on opponentTeamId/opponentTeamName
    // to avoid infinite loops when these values are set inside the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingResult, teams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate extra shots limit
    if (extraShots > maxExtraShots) {
      toast.error(`Extra shots cannot exceed ${maxExtraShots} (${maxExtraShotsPerMember} per team member)`);
      return;
    }
    
    onSubmit({
      result_data: {
        result: result,
        opponent_team_id: opponentTeamId,
        notes: notes,
      },
      extra_shots: extraShots,
      penalties: penalties,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Match Result
        </label>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
        >
          <option value="win" className="bg-gray-800">Win</option>
          <option value="lose" className="bg-gray-800">Lose</option>
          <option value="draw" className="bg-gray-800">Draw</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Opponent {opponentTeamName && `(${opponentTeamName})`}
        </label>
        {isOpponentPreselected && opponentTeamId && opponentTeamName ? (
          // Show read-only display when opponent is automatically preselected
          <div>
            <input
              type="text"
              value={opponentTeamName}
              disabled
              className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white opacity-50 cursor-not-allowed"
            />
            <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
              ✓ Opponent automatically set from versus pair
            </p>
          </div>
        ) : (
          // Show select dropdown when opponent is not preselected or manually selected
          <select
            value={opponentTeamId || ""}
            onChange={(e) => {
              const selectedId = e.target.value ? Number(e.target.value) : undefined;
              setOpponentTeamId(selectedId);
              const selectedTeam = teams.find((t) => t.id === selectedId);
              setOpponentTeamName(selectedTeam?.name || "");
              setIsOpponentPreselected(false); // Mark as manually selected
            }}
            disabled={isLoadingTeams || isSubmitting}
            className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            required
          >
            <option value="" className="bg-gray-800">
              {isLoadingTeams ? "Loading teams..." : "Select opponent team"}
            </option>
            {teams.map((teamOption) => (
              <option key={teamOption.id} value={teamOption.id} className="bg-gray-800">
                {teamOption.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Extra Shots
        </label>
        <input
          type="number"
          min="0"
          max={maxExtraShots}
          value={extraShots}
          onChange={(e) => setExtraShots(parseInt(e.target.value, 10) || 0)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Extra shots taken"
        />
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          Bonus shots taken (adds points to final score). Max: {maxExtraShots} shots ({maxExtraShotsPerMember} per team member)
        </p>
        {extraShots > maxExtraShots && (
          <p className="text-red-400 text-sm mt-1">
            ⚠️ Exceeds maximum allowed extra shots ({maxExtraShots})
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Penalties
        </label>
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min="0"
              value={penalties.vomit || 0}
              onChange={(e) => setPenalties({...penalties, vomit: parseInt(e.target.value, 10) || 0})}
              className="w-20 p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <span className="text-[rgb(255,255,255,0.8)] text-sm">
              Vomit penalty ({penaltyValues.vomit} pts each)
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <input
              type="number"
              min="0"
              value={penalties.not_drinking || 0}
              onChange={(e) => setPenalties({...penalties, not_drinking: parseInt(e.target.value, 10) || 0})}
              className="w-20 p-2 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="0"
            />
            <span className="text-[rgb(255,255,255,0.8)] text-sm">
              Not drinking penalty ({penaltyValues.not_drinking} pts each)
            </span>
          </div>
        </div>
        <p className="text-[rgb(255,255,255,0.6)] text-sm mt-1">
          Penalties reduce the final score. Total penalty: {((penalties.vomit || 0) * penaltyValues.vomit + (penalties.not_drinking || 0) * penaltyValues.not_drinking)} points
        </p>
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-2 text-white">
          Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full p-3 bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] rounded text-white placeholder-[rgb(255,255,255,0.5)] focus:border-red-500 focus:ring-1 focus:ring-red-500"
          placeholder="Add any additional notes..."
          rows={3}
        />
      </div>

      <div className="flex gap-3 mt-6">
        <BloodyButton
          type="submit"
          disabled={isSubmitting}
          variant="primary"
          blood={true}
          className="flex-1 px-6 py-3"
        >
          {isSubmitting ? "Saving..." : existingResult ? "Update Evaluation" : "Submit Evaluation"}
        </BloodyButton>
      </div>
    </form>
  );
}
