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
import { TeamMembersService, type TeamMemberAdd } from "@/client";
import { useAppToast } from "@/hooks/use-toast";
import { useThemedComponents } from "@/components/themes";
import { getErrorMessage } from "@/utils/errorHandling";

const addMemberSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  is_captain: z.boolean().default(false),
});

type AddMemberForm = z.infer<typeof addMemberSchema>;

interface MemberFormProps {
  selectedTeam: string;
  userToken: string;
  onSuccess: () => void;
  className?: string;
}

export default function MemberForm({ selectedTeam, onSuccess, className = "" }: MemberFormProps) {
  const { Card } = useThemedComponents();
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
      return TeamMembersService.addTeamMemberApiRallyV1TeamTeamIdMembersPost(Number(selectedTeam), requestBody);
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
    <Card variant="default" padding="none" rounded="2xl" className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Adicionar Membro
        </CardTitle>
        <CardDescription>
          Adicionar um novo membro à equipa selecionada
        </CardDescription>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="Nome do membro"
              />
              {form.formState.errors.name && (
                <p className="text-red-400 text-sm">{form.formState.errors.name.message}</p>
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
                <p className="text-red-400 text-sm">{form.formState.errors.email.message}</p>
              )}
            </div>
          </div>
          
          <Card variant="subtle" padding="md" rounded="lg">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_captain" className="text-base">
                  Capitão da Equipa
                </Label>
                <p className="text-sm text-[rgb(255,255,255,0.7)]">
                  Marcar este membro como capitão da equipa
                </p>
              </div>
              <Switch
                checked={form.watch("is_captain")}
                onCheckedChange={(checked) => form.setValue("is_captain", checked)}
              />
            </div>
          </Card>
          
          <div className="flex justify-center">
            <Button
              type="submit"
              disabled={isAddingMember}
              className="min-w-[200px]"
            >
              {isAddingMember ? "A Adicionar..." : "Adicionar Membro"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}



