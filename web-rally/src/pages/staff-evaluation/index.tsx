import useUser from "@/hooks/useUser";
import { LoadingState } from "@/components/shared";
import StaffEvaluationPage from "./staff-only";
import ManagerEvaluationPage from "./manager-only";

export default function StaffEvaluation() {
  const { isLoading, isRallyAdmin } = useUser();

  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  if (isRallyAdmin) {
    return <ManagerEvaluationPage />;
  } else {
    return <StaffEvaluationPage />;
  }
}