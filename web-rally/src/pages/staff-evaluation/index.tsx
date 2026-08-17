import useUser from "@/hooks/useUser";
import { LoadingState } from "@/components/shared";
import StaffEvaluationPage from "./staff-only";
import ManagerEvaluationPage from "./manager-only";
import OfflineQueueBanner from "./components/OfflineQueueBanner";

export default function StaffEvaluation() {
  const { isLoading, isRallyAdmin } = useUser();

  if (isLoading) {
    return <LoadingState message="A carregar..." />;
  }

  return (
    <>
      <OfflineQueueBanner />
      {isRallyAdmin ? <ManagerEvaluationPage /> : <StaffEvaluationPage />}
    </>
  );
}
