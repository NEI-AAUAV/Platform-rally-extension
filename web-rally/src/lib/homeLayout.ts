export const HOME_SECTION_KEYS = [
  "home_hero",
  "rally_marquee",
  "event_stats",
  "live_top5",
  "how_it_works",
  "postos_preview",
  "home_bottom_banner",
] as const;

export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export interface HomeSection {
  key: HomeSectionKey;
  visible: boolean;
}

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  home_hero: "Cabeçalho principal",
  rally_marquee: "Faixa de destaques (ticker)",
  event_stats: "Estatísticas do evento",
  live_top5: "Top 5 ao vivo",
  how_it_works: "Como funciona",
  postos_preview: "Pré-visualização dos postos",
  home_bottom_banner: "Banner final",
};

export const DEFAULT_HOME_LAYOUT: HomeSection[] = HOME_SECTION_KEYS.map((key) => ({
  key,
  visible: true,
}));

export const DEFAULT_TICKER_ITEMS = [
  "RALLY TASCAS 2026",
  "NEI",
  "EQUIPAS",
  "POSTOS",
  "PONTUAÇÃO AO VIVO",
];

export const MAX_TICKER_ITEMS = 20;
export const MAX_TICKER_ITEM_LENGTH = 40;
