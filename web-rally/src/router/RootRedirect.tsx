import { Navigate } from "react-router-dom";
import useTeamAuth from "@/hooks/useTeamAuth";

/** Redirects team users to /team-progress, everyone else to /scoreboard */
export default function RootRedirect() {
  const { isAuthenticated } = useTeamAuth();
  return <Navigate to={isAuthenticated ? "/team-progress" : "/scoreboard"} replace />;
}
