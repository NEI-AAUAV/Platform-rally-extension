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
        className="text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Info className="w-4 h-4" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-blue-400 hover:text-blue-300 transition-colors"
      >
        <Info className="w-4 h-4" />
      </button>
      
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setIsOpen(false)}>
        <div 
          className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border border-border rounded-2xl p-6 text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Tipos de Atividades - Sistema de Pontuação</h3>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
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
                details: "• 1º lugar: 100 pontos\n• Último lugar: 10 pontos\n• Outros: distribuição proporcional entre 100 e 10",
                fields: "Pontos Máximos: Pontos para 1º lugar (geralmente 100)\nPontos Mínimos: Pontos para último lugar (geralmente 10)\n\nNota: A pontuação é baseada no ranking entre equipas, não no tempo absoluto"
              },
              {
                id: 2,
                icon: "🎯",
                name: "Baseada em Pontuação",
                examples: "Mímica, Tiro ao alvo",
                calculation: "Pontuação proporcional",
                details: "• (pontos_conseguidos / pontos_máximos) × pontuação_base",
                fields: "Pontuação Máxima: Valor máximo possível na atividade\nPontuação Base: Valor base usado no cálculo proporcional"
              },
              {
                id: 3,
                icon: "✅",
                name: "Sim/Não",
                examples: "Trava-línguas, puzzles",
                calculation: "Pontuação binária",
                details: "• Sucesso: 100 pontos\n• Falha: 0 pontos",
                fields: "Pontos por Sucesso: Pontos atribuídos quando completado com sucesso\nPontos por Falha: Pontos atribuídos quando falha (geralmente 0)"
              },
              {
                id: 4,
                icon: "⚔️",
                name: "Equipa vs Equipa",
                examples: "Jogo da corda",
                calculation: "Baseado no resultado",
                details: "• Vitória: 100 pontos\n• Empate: 50 pontos\n• Derrota: 0 pontos",
                fields: "Pontos por Vitória: Pontos para a equipa vencedora\nPontos por Empate: Pontos para ambas as equipas (empate)\nPontos por Derrota: Pontos para a equipa derrotada"
              },
              {
                id: 5,
                icon: "🎲",
                name: "Geral",
                examples: "Desafios criativos, avaliações artísticas",
                calculation: "Pontos atribuídos pelo staff",
                details: "• Os pontos são atribuídos diretamente pelo staff avaliador\n• Devem estar entre o mínimo e máximo configurados",
                fields: "Pontos Mínimos: Pontos mínimos permitidos (geralmente 0)\nPontos Máximos: Pontos máximos permitidos (geralmente 100)\nPontos Padrão: Sugestão de pontos para o staff"
              }
            ].map((type) => {
              const isExpanded = expandedType === type.id;
              
              return (
                <div key={type.id} className="border border-border rounded-lg overflow-hidden bg-muted">
                  <button
                    type="button"
                    onClick={() => setExpandedType(isExpanded ? null : type.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{type.icon}</span>
                      <div className="text-left">
                        <h4 className="font-semibold text-foreground">{type.name}</h4>
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground mt-1">{type.examples}</p>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground min-w-[80px]">Exemplos:</span>
                        <span className="text-sm text-muted-foreground">{type.examples}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground min-w-[80px]">Cálculo:</span>
                        <span className="text-sm text-foreground">{type.calculation}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground min-w-[80px]">Exemplo:</span>
                        <div className="text-xs text-muted-foreground whitespace-pre-line">
                          {type.details}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-muted-foreground min-w-[80px]">Campos:</span>
                        <div className="text-xs text-muted-foreground whitespace-pre-line">
                          {type.fields}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-200 mt-4">
              <strong>Todos os tipos podem receber:</strong> Bonus por shots extra e penalizações que afetam a pontuação final.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

