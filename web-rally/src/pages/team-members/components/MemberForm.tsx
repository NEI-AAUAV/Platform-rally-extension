import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, AlertCircle } from "lucide-react";
import { addTeamMember, type TeamMemberAdd } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/utils/errorHandling";

const addMemberSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  is_captain: z.boolean().default(false),
});

type AddMemberForm = z.infer<typeof addMemberSchema>;

type MemberFormProps = Readonly<{
  selectedTeam: string;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}>;

export default function MemberForm({ selectedTeam, onSuccess, className = "" }: MemberFormProps) {
  const toast = useAppToast();

  // Form setup
  const form = useForm<AddMemberForm>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      name: "",
      email: "",
      is_captain: false,
    },
  });

  // Add member mutation
  const {
    mutate: addMember,
    isPending: isAddingMember,
    error: addError,
  } = useMutation({
    mutationFn: async (memberData: AddMemberForm) => {
      const requestBody: TeamMemberAdd = {
        name: memberData.name,
        email: memberData.email || null,
        is_captain: memberData.is_captain,
      };
      return await addTeamMember({
        path: { team_id: Number(selectedTeam) },
        body: requestBody,
      });
    },
    onSuccess: () => {
      onSuccess();
      form.reset();
      toast.success("Membro adicionado com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao adicionar membro"));
    },
  });

  const handleAddMember = (data: AddMemberForm) => {
    if (!selectedTeam) return;
    addMember(data);
  };

  return (
    <div className={`rally-surface rounded-2xl ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Adicionar Membro
        </CardTitle>
        <CardDescription>Adicionar um novo membro à equipa selecionada</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleAddMember)} className="space-y-4">
          {addError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {addError instanceof Error ? addError.message : "Erro desconhecido"}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...form.register("name")} placeholder="Nome do membro" />
              {form.formState.errors.name && (
                <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email (opcional)</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="email@exemplo.com"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-400">{form.formState.errors.email.message}</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card/60 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_captain" className="text-base">
                  Capitão da Equipa
                </Label>
                <p className="text-sm text-muted-foreground">
                  Marcar este membro como capitão da equipa
                </p>
              </div>
              <Switch
                checked={form.watch("is_captain")}
                onCheckedChange={(checked) => form.setValue("is_captain", checked)}
              />
            </div>
          </div>

          <div className="flex justify-center">
            <Button type="submit" disabled={isAddingMember} className="min-w-[200px]">
              {isAddingMember ? "A Adicionar..." : "Adicionar Membro"}
            </Button>
          </div>
        </form>
      </CardContent>
    </div>
  );
}
