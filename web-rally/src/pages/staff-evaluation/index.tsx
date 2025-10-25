import React from "react";
import { useUserStore } from "@/stores/useUserStore";
import StaffEvaluationPage from "./staff-only";
import ManagerEvaluationPage from "./manager-only";

export default function StaffEvaluation() {
  const userStore = useUserStore();

  // Check if user is admin or manager
  const isRallyAdmin = 
    !!userStore.scopes?.includes("admin") ||
    !!userStore.scopes?.includes("manager-rally");

  if (userStore.sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-900 via-red-800 to-red-900 p-6">
        <p className="text-white text-lg">Loading user session...</p>
      </div>
    );
  }

  if (isRallyAdmin) {
    return <ManagerEvaluationPage />;
  } else {
    return <StaffEvaluationPage />;
  }
}