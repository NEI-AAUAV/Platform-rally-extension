# Sistema de Pontuação das Atividades - Rally

## 📋 Visão Geral

O sistema de pontuação do Rally é baseado em diferentes tipos de atividades, cada uma com sua própria lógica de cálculo. Todas as atividades podem receber modificadores (bonus e penalizações) que afetam a pontuação final.

## 🎯 Tipos de Atividades

### 1. 🕐 TimeBasedActivity - Atividades Baseadas em Tempo

**Descrição:** Atividades onde o tempo de conclusão determina a pontuação.

#### Configuração Padrão:
```json
{
  "max_time_seconds": 300,    // Tempo máximo permitido
  "time_limit_seconds": 300, // Limite para pontuação completa
  "max_points": 100,         // Pontos máximos (1º lugar)
  "min_points": 10           // Pontos mínimos (último lugar)
}
```

#### Cálculo de Pontuação:
**Sistema de Ranking Relativo:**

1. **Coleta todos os tempos** das equipas para a mesma atividade
2. **Ordena por tempo** (menor tempo = melhor posição)
3. **Calcula pontuação baseada no ranking:**

```python
# Fórmula de ranking relativo
if rank == 1:
    score = max_points  # 1º lugar
elif rank == total_teams:
    score = min_points  # Último lugar
else:
    # Distribuição linear proporcional
    score_range = max_points - min_points
    position_ratio = (rank - 1) / (total_teams - 1)
    score = max_points - (score_range * position_ratio)
```

#### Exemplo Prático:
**(5 equipas):**
- Config: `max_points=100`, `min_points=10`
- Tempos: [25.5s, 28.7s, 32.1s, 38.9s, 45.2s]

**Resultado:**
- 1º lugar (25.5s): 100 pontos
- 2º lugar (28.7s): 77.5 pontos
- 3º lugar (32.1s): 55.0 pontos
- 4º lugar (38.9s): 32.5 pontos
- 5º lugar (45.2s): 10 pontos

---

### 2. 🎯 ScoreBasedActivity - Atividades Baseadas em Pontuação

**Descrição:** Atividades onde a pontuação é baseada em um número alcançado.

#### Configuração Padrão:
```json
{
  "max_points": 100,  // Pontuação máxima possível
  "base_score": 50    // Pontuação base para cálculo
}
```

#### Cálculo de Pontuação:
**Sistema Proporcional:**

```python
# Fórmula de pontuação proporcional
percentage = min(achieved_points / max_points, 1.0)
score = base_score * percentage
```

#### Exemplo Prático:
**Mímica (20 palavras máximo):**
- Config: `max_points=20`, `base_score=100`
- Resultados: [15, 8, 20, 12, 18] palavras

**Cálculo:**
- 15/20 palavras: (15/20) × 100 = 75 pontos
- 8/20 palavras: (8/20) × 100 = 40 pontos
- 20/20 palavras: (20/20) × 100 = 100 pontos
- 12/20 palavras: (12/20) × 100 = 60 pontos
- 18/20 palavras: (18/20) × 100 = 90 pontos

---

### 3. ✅ BooleanActivity - Atividades Sucesso/Falha

**Descrição:** Atividades com resultado binário (sucesso ou falha).

#### Configuração Padrão:
```json
{
  "success_points": 100,  // Pontos por sucesso
  "failure_points": 0     // Pontos por falha
}
```

#### Cálculo de Pontuação:
**Sistema Binário:**

```python
# Fórmula binária
if success:
    score = success_points
else:
    score = failure_points
```

#### Exemplo Prático:
**Trava línguas:**
- Config: `success_points=100`, `failure_points=0`
- Resultados: [True, False, True, False, True]

**Pontuação:**
- Sucesso: 100 pontos
- Falha: 0 pontos
- Sucesso: 100 pontos
- Falha: 0 pontos
- Sucesso: 100 pontos

---

### 4. ⚔️ TeamVsActivity - Competições Entre Equipas

**Descrição:** Atividades de confronto direto entre duas equipas.

#### Configuração Padrão:
```json
{
  "win_points": 100,   // Pontos por vitória
  "draw_points": 50,   // Pontos por empate
  "lose_points": 0     // Pontos por derrota
}
```

#### Cálculo de Pontuação:
**Sistema de Resultado:**

```python
# Fórmula de resultado
if result == "win":
    score = win_points
elif result == "draw":
    score = draw_points
elif result == "lose":
    score = lose_points
```

#### Exemplo Prático:
**Puxar corda:**
- Config: `win_points=100`, `draw_points=50`, `lose_points=0`
- Resultados: ['win', 'lose', 'draw', 'win', 'lose']

**Pontuação:**
- Vitória: 100 pontos
- Derrota: 0 pontos
- Empate: 50 pontos
- Vitória: 100 pontos
- Derrota: 0 pontos

---

### 5. 🎨 GeneralActivity - Atividades com Pontuação Flexível

**Descrição:** Atividades onde o staff atribui pontos dentro de um range configurável.

#### Configuração Padrão:
```json
{
  "min_points": 0,        // Pontuação mínima permitida
  "max_points": 100,      // Pontuação máxima permitida
  "default_points": 50    // Pontuação padrão sugerida
}
```

#### Cálculo de Pontuação:
**Sistema de Atribuição:**

```python
# Fórmula de atribuição
assigned_points = result_data.get("assigned_points", 0)

# Validação de range
if assigned_points < min_points:
    assigned_points = min_points
elif assigned_points > max_points:
    assigned_points = max_points

score = float(assigned_points)
```

#### Exemplo Prático:
**Avaliação de disfarce:**
- Config: `min_points=0`, `max_points=50`, `default_points=25`
- Pontuações atribuídas: [45, 30, 50, 15, 35]

**Pontuação:**
- 45 pontos atribuídos → 45 pontos
- 30 pontos atribuídos → 30 pontos
- 50 pontos atribuídos → 50 pontos
- 15 pontos atribuídos → 15 pontos
- 35 pontos atribuídos → 35 pontos

---

## 🔧 Modificadores Aplicados a Todas as Atividades

Após o cálculo da pontuação base, os seguintes modificadores são aplicados:

### 1. 🍻 Extra Shots Bonus
**Descrição:** Bonus por shots extras consumidos pela equipa.

**Configuração:** `bonus_per_extra_shot` (padrão: 1 ponto por shot)

**Fórmula:**
```python
extra_shots = modifiers.get("extra_shots", 0)
if extra_shots > 0:
    bonus = extra_shots * bonus_per_extra_shot
    final_score += bonus
```

**Limite:** `max_extra_shots_per_member` × número de membros da equipa

### 2. 🤮 Vómito Penalty
**Descrição:** Penalização por vómito durante a atividade.

**Configuração:** `penalty_per_puke` (padrão: -5 pontos)

**Fórmula:**
```python
if "vomit" in penalties:
    final_score -= abs(penalty_per_puke)
```

### 3. 🚫 Não Beber Penalty
**Descrição:** Penalização por membros que não beberam.

**Configuração:** `penalty_per_not_drinking` (padrão: -2 pontos por pessoa)

**Fórmula:**
```python
if "not_drinking" in penalties:
    penalty_value = participants_not_drinking * abs(penalty_per_not_drinking)
    final_score -= penalty_value
```

### 4. ⚠️ Outras Penalizações
**Descrição:** Penalizações customizadas por tipo de infração.

**Fórmula:**
```python
for penalty_type, penalty_value in penalties.items():
    final_score -= penalty_value
```

---

## 📊 Exemplo Completo de Cálculo

**Atividade:** (TimeBasedActivity)
**Equipa:** Equipa A
**Tempo:** 45 segundos
**Ranking:** 3º lugar de 5 equipas

### 1. Pontuação Base:
- Config: `max_points=100`, `min_points=10`
- Ranking: 3º lugar
- Cálculo: `100 - (2/4) × 90 = 55 pontos`

### 2. Modificadores:
- **Extra shots:** 2 shots × 1 ponto = +2 pontos
- **Vómito:** 1 vómito × 5 pontos = -5 pontos
- **Não beber:** 1 pessoa × 2 pontos = -2 pontos

### 3. Pontuação Final:
```
Pontuação base: 55 pontos
+ Extra shots: +2 pontos
- Vómito: -5 pontos
- Não beber: -2 pontos
= Total: 50 pontos
```

---

## 🎯 Resumo das Fórmulas

| Tipo de Atividade | Fórmula Principal |
|-------------------|-------------------|
| **TimeBased** | Ranking relativo entre equipas |
| **ScoreBased** | `(achieved/max) × base_score` |
| **Boolean** | `success_points` ou `failure_points` |
| **TeamVs** | `win_points`, `draw_points`, ou `lose_points` |
| **General** | Pontos atribuídos pelo staff (dentro do range) |

**Todas as atividades:** `pontuação_base + modificadores`

---

## 🔧 Configuração Dinâmica

Todas as configurações podem ser ajustadas por atividade através do campo `config` no banco de dados, permitindo:

- **Diferentes dificuldades** para a mesma atividade
- **Ajustes em tempo real** durante o evento
- **Personalização** por contexto específico
- **Flexibilidade total** sem alterar código

---

## 📝 Notas Importantes

1. **Ranking Relativo:** TimeBasedActivity usa ranking entre equipas, não tempo absoluto
2. **Validação:** Todas as pontuações são validadas antes do cálculo
3. **Modificadores:** Aplicados após o cálculo da pontuação base
4. **Configuração:** Cada atividade pode ter configuração única
5. **Persistência:** Configurações são salvas como JSON no banco de dados
