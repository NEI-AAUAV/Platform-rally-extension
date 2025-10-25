import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserPlus, AlertCircle } from "lucide-react";

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

export default function MemberForm({ selectedTeam, userToken, onSuccess, className = "" }: MemberFormProps) {
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
      const response = await fetch(`/api/rally/v1/team/${selectedTeam}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          ...memberData,
          email: memberData.email || null,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to add member";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      const result = await response.json();
      return result;
    },
    onSuccess: () => {
      onSuccess();
      form.reset();
    },
    onError: (error: unknown) => {
      // Error adding member
    },
  });

  const handleAddMember = (data: AddMemberForm) => {
    if (!selectedTeam) return;
    addMember(data);
  };

  return (
    <Card className={className}>
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
                {addError.message}
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
          
          <div className="flex items-center justify-between rounded-lg border border-[rgb(255,255,255,0.15)] bg-[rgb(255,255,255,0.02)] p-4">
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



