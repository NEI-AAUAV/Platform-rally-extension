import { Users } from "lucide-react";
import React from "react";

type AssignmentFormProps = Readonly<{
  assignmentsError: Error | null;
  isSuccessUpdate: boolean;
  isErrorUpdate: boolean;
  updateError: Error | null;
  children: React.ReactNode;
  className?: string;
    title?: string;
}>;

export default function AssignmentForm({
  assignmentsError,
  isSuccessUpdate,
  isErrorUpdate,
  updateError,
  children,
  className = "",
  title = "Staff Rally (rally-staff)",
}: AssignmentFormProps) {
  return (
    <div className={`rally-surface rounded-2xl p-6 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      {assignmentsError ? (
        <div className="py-8 text-center text-red-500">
          <p className="font-semibold">Erro ao carregar atribuições</p>
          <p className="mt-2 text-sm">{assignmentsError.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Contacte um administrador para resolver este problema.
          </p>
        </div>
      ) : (
        children
      )}

      {isSuccessUpdate && (
        <div className="mt-4 text-center text-green-500">Atribuição atualizada com sucesso!</div>
      )}
      {isErrorUpdate && (
        <div className="mt-4 text-center text-red-500">
          {updateError?.message || "Erro ao atualizar atribuição"}
        </div>
      )}
    </div>
  );
}
