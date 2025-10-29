import { Users } from "lucide-react";
import { useThemedComponents } from "@/components/themes";

interface AssignmentFormProps {
  assignmentsError: Error | null;
  isSuccessUpdate: boolean;
  isErrorUpdate: boolean;
  updateError: Error | null;
  children: React.ReactNode;
  className?: string;
}

export default function AssignmentForm({ 
  assignmentsError, 
  isSuccessUpdate, 
  isErrorUpdate, 
  updateError, 
  children,
  className = "" 
}: AssignmentFormProps) {
  const { Card } = useThemedComponents();
  return (
    <Card variant="default" padding="lg" rounded="2xl" className={className}>
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5" />
        <h3 className="text-lg font-semibold">Staff Rally (rally-staff)</h3>
      </div>

      {assignmentsError ? (
        <div className="text-center text-red-500 py-8">
          <p className="font-semibold">Erro ao carregar atribuições</p>
          <p className="text-sm mt-2">{assignmentsError.message}</p>
          <p className="text-xs mt-2 text-[rgb(255,255,255,0.5)]">
            Contacte um administrador para resolver este problema.
          </p>
        </div>
      ) : (
        children
      )}

      {isSuccessUpdate && (
        <div className="text-center text-green-500 mt-4">
          Atribuição atualizada com sucesso!
        </div>
      )}
      {isErrorUpdate && (
        <div className="text-center text-red-500 mt-4">
          {updateError?.message || "Erro ao atualizar atribuição"}
        </div>
      )}
    </Card>
  );
}
