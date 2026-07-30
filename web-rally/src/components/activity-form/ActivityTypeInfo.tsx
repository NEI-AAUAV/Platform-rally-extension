import { useState } from "react";
import { Info, X, ChevronDown, ChevronUp } from "lucide-react";

export default function ActivityTypeInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<number | null>(null);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-blue-400 transition-colors hover:text-blue-300"
      >
        <Info className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-blue-400 transition-colors hover:text-blue-300"
      >
        <Info className="h-4 w-4" />
      </button>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Fechar"
          className="fixed inset-0 cursor-default bg-black/70"
          onClick={() => setIsOpen(false)}
        />
        <div className="relative z-10 max-h-[80vh] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-gray-900 p-6 text-foreground">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Tipos de Atividades - Sistema de Pontuação</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-2">
            {[
              {
                id: 1,
                icon: "🕐",
                name: "Baseada em Tempo",
                examples: "Corridas, desafios de tempo",
                calculation: "Ranking relativo entre todas as equipas",
                details:
                  "• 1º lugar: 100 pontos\n• Último lugar: 10 pontos\n• Outros: distribuição proporcional entre 100 e 10",
                fields:
                  "Pontos Máximos: Pontos para 1º lugar (geralmente 100)\nPontos Mínimos: Pontos para último lugar (geralmente 10)\n\nNota: A pontuação é baseada no ranking entre equipas, não no tempo absoluto",
              },
              {
                id: 2,
                icon: "🎯",
                name: "Baseada em Pontuação",
                examples: "Mímica, Tiro ao alvo",
                calculation: "Pontuação proporcional",
                details: "• (pontos_conseguidos / pontos_máximos) × pontuação_base",
                fields:
                  "Pontuação Máxima: Valor máximo possível na atividade\nPontuação Base: Valor base usado no cálculo proporcional",
              },
              {
                id: 3,
                icon: "✅",
                name: "Sim/Não",
                examples: "Trava-línguas, puzzles",
                calculation: "Pontuação binária",
                details: "• Sucesso: 100 pontos\n• Falha: 0 pontos",
                fields:
                  "Pontos por Sucesso: Pontos atribuídos quando completado com sucesso\nPontos por Falha: Pontos atribuídos quando falha (geralmente 0)",
              },
              {
                id: 4,
                icon: "⚔️",
                name: "Equipa vs Equipa",
                examples: "Jogo da corda",
                calculation: "Baseado no resultado",
                details: "• Vitória: 100 pontos\n• Empate: 50 pontos\n• Derrota: 0 pontos",
                fields:
                  "Pontos por Vitória: Pontos para a equipa vencedora\nPontos por Empate: Pontos para ambas as equipas (empate)\nPontos por Derrota: Pontos para a equipa derrotada",
              },
              {
                id: 5,
                icon: "🎲",
                name: "Geral",
                examples: "Desafios criativos, avaliações artísticas",
                calculation: "Pontos atribuídos pelo staff",
                details:
                  "• Os pontos são atribuídos diretamente pelo staff avaliador\n• Devem estar entre o mínimo e máximo configurados",
                fields:
                  "Pontos Mínimos: Pontos mínimos permitidos (geralmente 0)\nPontos Máximos: Pontos máximos permitidos (geralmente 100)\nPontos Padrão: Sugestão de pontos para o staff",
              },
            ].map((type) => {
              const isExpanded = expandedType === type.id;

              return (
                <div
                  key={type.id}
                  className="overflow-hidden rounded-lg border border-border bg-muted"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedType(isExpanded ? null : type.id)}
                    className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{type.icon}</span>
                      <div className="text-left">
                        <h4 className="font-semibold text-foreground">{type.name}</h4>
                        {!isExpanded && (
                          <p className="mt-1 text-xs text-muted-foreground">{type.examples}</p>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
                      <div className="flex items-start gap-2">
                        <span className="min-w-[80px] text-xs font-medium text-muted-foreground">
                          Exemplos:
                        </span>
                        <span className="text-sm text-muted-foreground">{type.examples}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="min-w-[80px] text-xs font-medium text-muted-foreground">
                          Cálculo:
                        </span>
                        <span className="text-sm text-foreground">{type.calculation}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="min-w-[80px] text-xs font-medium text-muted-foreground">
                          Exemplo:
                        </span>
                        <div className="whitespace-pre-line text-xs text-muted-foreground">
                          {type.details}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="min-w-[80px] text-xs font-medium text-muted-foreground">
                          Campos:
                        </span>
                        <div className="whitespace-pre-line text-xs text-muted-foreground">
                          {type.fields}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-xs text-yellow-200">
              <strong>Todos os tipos podem receber:</strong> Bonus por shots extra e penalizações
              que afetam a pontuação final.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
