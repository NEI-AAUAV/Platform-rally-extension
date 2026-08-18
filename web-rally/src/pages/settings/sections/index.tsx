/**
 * The five groups the settings page is navigated by.
 *
 * Thirty-odd settings laid out as eight cards on one page was a wall nobody
 * could scan. Splitting them here — and rendering only the active one — keeps
 * the page short, and makes this list the single place that decides where a
 * setting lives: the nav and the content both derive from it.
 */
import { Eye, HelpCircle, LayoutTemplate, MapPinned, Route, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  TeamSettings,
  RallyTimingSettings,
  ScoringSettings,
  PeddyPaperSettings,
  SearchAidsSettings,
  RouteRulesSettings,
  DisplaySettings,
  HomeLayoutSettings,
  RulesSettings,
} from "../components";

export type SettingsSectionId =
  | "jogo"
  | "rota"
  | "pontuacao"
  | "equipas"
  | "visualizacao"
  | "inicio"
  | "regras";

/** Props every section body receives from the page shell. */
export type SectionProps = Readonly<{ eventType?: string | null }>;

export interface SettingsSection {
  readonly id: SettingsSectionId;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly description: string;
  readonly Component: (props: SectionProps) => React.ReactElement;
}

function GameSection() {
  return <PeddyPaperSettings />;
}

function RouteSection() {
  return (
    <div className="space-y-8">
      <RouteRulesSettings />
      <SearchAidsSettings />
    </div>
  );
}

function ScoringSection({ eventType }: SectionProps) {
  return <ScoringSettings eventType={eventType} />;
}

function TeamsSection() {
  return (
    <div className="space-y-8">
      <TeamSettings />
      <RallyTimingSettings />
    </div>
  );
}

function DisplaySection() {
  return <DisplaySettings />;
}

function HomeSection() {
  return <HomeLayoutSettings />;
}

function RulesSection() {
  return <RulesSettings />;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "jogo",
    label: "Jogo",
    icon: MapPinned,
    description: "O que a equipa vê, como prova a chegada, e as saídas para quem encalha",
    Component: GameSection,
  },
  {
    id: "rota",
    label: "Rota",
    icon: Route,
    description: "Ordem, horários, tempo de percurso e ajudas de busca",
    Component: RouteSection,
  },
  {
    id: "pontuacao",
    label: "Pontuação",
    icon: Target,
    description: "Penalizações e bónus aplicados às equipas",
    Component: ScoringSection,
  },
  {
    id: "equipas",
    label: "Equipas",
    icon: Users,
    description: "Limites de equipas e membros, e horários do evento",
    Component: TeamsSection,
  },
  {
    id: "visualizacao",
    label: "Visualização",
    icon: Eye,
    description: "O que os participantes e o público conseguem ver",
    Component: DisplaySection,
  },
  {
    id: "inicio",
    label: "Página inicial",
    icon: LayoutTemplate,
    description: "Secções, ordem e faixa de destaques da Início",
    Component: HomeSection,
  },
  {
    id: "regras",
    label: "Regras",
    icon: HelpCircle,
    description: "Texto das secções e regulamento oficial em PDF da página /regras",
    Component: RulesSection,
  },
] as const;

export const DEFAULT_SECTION_ID: SettingsSectionId = "jogo";
