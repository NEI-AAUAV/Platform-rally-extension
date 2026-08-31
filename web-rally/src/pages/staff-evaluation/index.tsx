import { Navigate } from "@tanstack/react-router";
import useUser from "@/hooks/useUser";
import { deriveRoleFlags } from "@/hooks/useNavAudience";
import { LoadingState } from "@/components/shared";
import StaffEvaluationPage from "./staff-only";
import ManagerEvaluationPage from "./manager-only";
import OfflineQueueBanner from "./components/OfflineQueueBanner";

export default function StaffEvaluation() {
  const { isLoading, isRallyAdmin, userStore } = useUser();

  if (isLoading) {
    return <LoadingState message="A carregar..." />;
  }

  // H6: this used to render for *any* authenticated identity — the backend
  // already scopes the data (a plain participant sees an empty checkpoint),
  // but the UI itself never checked, so someone with no staff/manager/admin
  // scope still landed on a page framed as a scoring tool. `deriveRoleFlags`
  // is the same check the nav uses to decide who even sees this link.
  const { isPrivileged } = deriveRoleFlags(userStore.scopes);
  if (!isPrivileged) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <OfflineQueueBanner />
      {isRallyAdmin ? <ManagerEvaluationPage /> : <StaffEvaluationPage />}
    </>
  );
}
