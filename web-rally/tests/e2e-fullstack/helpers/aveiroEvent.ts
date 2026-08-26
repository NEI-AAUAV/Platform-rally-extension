/**
 * The route of a real NEI peddy paper in Aveiro, as its organizers planned it.
 *
 * Taken from the actual planning sheet for a past edition, which laid each
 * post out in three columns — what whoever is stationed there should talk
 * about, the clue that gets a team to the post, and the challenge once they
 * arrive. Those are exactly the three fields a checkpoint carries
 * (`staff_script`, `clue`, `challenge_brief`), which is the point of using
 * the real thing: a route invented for a test tends to fill only the fields
 * the test author remembered.
 *
 * Two things about the real plan drive the whole scenario:
 *
 *  - It is in two blocks. The university posts are walked in order; the ones
 *    outside are a set the teams work through more loosely. That is a
 *    `RouteStage` each, with different `order_matters`/`required_count`.
 *  - One post was still undecided when the sheet was written ("CF DECIDE").
 *    A post with a provisional name that teams must not see yet is a draft
 *    with `is_placeholder` — and the flag cannot be cleared once teams have
 *    started, so deciding it is part of setup, not of the day.
 */

export interface AveiroPost {
  /** Short handle used in test assertions; the real name is built per run. */
  readonly key: string;
  readonly name: string;
  /** The riddle the team is given instead of the location. */
  readonly clue: string;
  /** What the person stationed here talks about between challenges. */
  readonly staffScript: string;
  /** The challenge itself, as briefed to staff. */
  readonly challengeBrief: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Provisional name / undecided venue when the plan was written. */
  readonly undecided?: boolean;
  readonly activity: AveiroActivity;
}

export interface AveiroActivity {
  readonly name: string;
  /** Label as it appears in the admin activity form's type dropdown. */
  readonly typeLabel: string;
  readonly apiType: string;
  /**
   * The type-specific number inputs the admin activity form shows for this
   * type, keyed by the input's own id (see `CONFIG_KEY_BY_FIELD_ID` in
   * `peddy-paper-aveiro.spec.ts`). The spec fills them from here and later
   * asserts the scores against the same numbers, so the sheet's values and the
   * expectations cannot drift apart.
   */
  readonly configFields: Readonly<Record<string, number>>;
  /**
   * Extra counters for challenges that punish a failed attempt.
   *
   * `points` is a magnitude, not a negative number: the admin form's input has
   * `min={0}` and the evaluation form multiplies by `Math.abs(...)`, so a
   * counter is always a deduction and the sign is never typed in.
   */
  readonly penaltyCounters?: readonly { readonly label: string; readonly points: number }[];
}

/** Real coordinates, so the geofences sit where the posts actually are. */
const AVEIRO = {
  aristides: { latitude: 40.6301, longitude: -8.6578 },
  cantina: { latitude: 40.6296, longitude: -8.6567 },
  faina: { latitude: 40.6418, longitude: -8.6533 },
  museu: { latitude: 40.6423, longitude: -8.6559 },
  ponte: { latitude: 40.6412, longitude: -8.6547 },
  praca: { latitude: 40.6405, longitude: -8.6538 },
} as const;

export const UNIVERSIDADE_POSTS: readonly AveiroPost[] = [
  {
    key: "aristides",
    name: "Complexo Aristides Hall",
    // The real clue here was a physical object — a ball handed out at the
    // convívio before the start — so the app only carries the instruction.
    clue: "A pista é uma bola, entregue no convívio antes de começar o peddy paper.",
    staffScript:
      "Falar dos diferentes desportos em que se podem inscrever, incentivar a fazer claque e " +
      "perguntar-lhes se praticam algo.",
    challengeBrief:
      "Um dos elementos gira 5x e acerta com a bola numa baliza improvisada para receber a " +
      "próxima pista. Se falhar vai outro elemento. Encher o copo a cada um, cada falha tem de beber.",
    ...AVEIRO.aristides,
    activity: {
      name: "Bola na baliza",
      typeLabel: "Sim/Não",
      apiType: "BooleanActivity",
      configFields: { "config-bool-success": 100, "config-bool-failure": 0 },
      // "cada falha tem de beber" — the challenge counts misses, so the
      // evaluation form needs a counter for them.
      penaltyCounters: [{ label: "Falha na baliza", points: 5 }],
    },
  },
  {
    key: "cantina",
    name: "Cantina de Santiago",
    clue:
      "Depois de tanta corrida e tanto exercício, até os gym bros precisam de repor energias… " +
      "Não é na barra de proteína nem no shake pós-treino que vais encontrar o próximo desafio. " +
      "Segue o cheiro da comida, porque é lá que todos os atletas (e não só) acabam por se encontrar.",
    staffScript:
      "Relembrar que existem inúmeras cantinas para se ir comer, mostrar ao redor a lojinha para " +
      "comprar a sweat do curso, farmácia, a CUA e a biblioteca (possibilidade de ir para salas privadas).",
    challengeBrief:
      "Juntar os participantes da equipa dois a dois. Perguntas básicas para descobrir o quanto " +
      'sabem uns sobre os outros, como "Qual é a música favorita do teu colega?". Se falharem é um penálti.',
    ...AVEIRO.cantina,
    activity: {
      name: "Quanto sabes do teu colega",
      typeLabel: "Baseada em Pontuação",
      apiType: "ScoreBasedActivity",
      configFields: { "config-sb-max-points": 80, "config-sb-base-score": 40 },
      penaltyCounters: [{ label: "Penálti", points: 3 }],
    },
  },
];

export const FORA_DA_UNI_POSTS: readonly AveiroPost[] = [
  {
    key: "faina",
    // Undecided when the sheet was written: the plan was to send teams to the
    // Refúgio dos Drinks and walk them to the Parque da Faina from there.
    name: "Parque da Faina",
    clue:
      "Estás a precisar de energia? Não, não é em código nem em livros que vais encontrar um " +
      "refúgio… mas talvez alguns drinks para beber te ajudem.",
    staffScript:
      "Ninguém tem ideia de onde decorre a faina — é mais fácil irem ter ao Refúgio dos Drinks e " +
      "daí serem guiados até ao parque.",
    challengeBrief:
      "Fazer uma pirâmide humana. Após a pirâmide: fazer uma fila de shots, sendo 2 shots por " +
      "pessoa (metade água, metade vodka). Eles têm que tomar tudo sem reação em menos de 3 min.",
    ...AVEIRO.faina,
    undecided: true,
    activity: {
      // "em menos de 3 min" — the challenge is against the clock.
      name: "Pirâmide e fila de shots",
      typeLabel: "Baseada em Tempo",
      apiType: "TimeBasedActivity",
      configFields: { "config-tb-max-points": 120, "config-tb-min-points": 20 },
    },
  },
  {
    key: "museu",
    name: "Museu de Santa Joana",
    clue:
      "A princesa que deu nome a esta cidade descansa onde a arte guarda a sua história. " +
      "Procura-a onde o convento virou museu.",
    staffScript:
      "Falar do Museu de Santa Joana e vários outros benefícios que eles como estudantes e jovens " +
      "têm acesso de graça.",
    challengeBrief:
      "Falar de arte no geral e desafiar a equipa a recriar uma obra do museu com os corpos.",
    ...AVEIRO.museu,
    activity: {
      name: "Recriar uma obra",
      typeLabel: "Geral",
      apiType: "GeneralActivity",
      configFields: {
        "config-gen-min-points": 0,
        "config-gen-max-points": 60,
        "config-gen-default-points": 30,
      },
    },
  },
  {
    key: "ponte",
    name: "Ponte dos Laços de Amizade",
    clue:
      "Acompanhado de uma fita. Que Aveiro vos faça sentir em casa e que este lugar vos ajude a " +
      "lembrar para sempre das amizades que aqui construíram. Sigam até onde os laços unem pessoas e histórias.",
    staffScript:
      "Falar um pouco sobre as amizades e experiências novas que todos vão ter e relembrá-los que " +
      "não faz mal se sentirem sozinhos.",
    challengeBrief:
      "Escrever o nome da equipa na fita e metê-la na ponte e fazer um brinde à equipa. Um dos " +
      "participantes da equipa deve fazer um discurso. Mais criativo recebe uma salva de palmas!",
    ...AVEIRO.ponte,
    activity: {
      // "mais criativo" is a judgement nobody at the post can make alone —
      // it is only decidable once every team's attempt is in.
      name: "Discurso do brinde",
      typeLabel: "Avaliação Posterior (Fotos)",
      apiType: "DeferredJudgedActivity",
      configFields: { "config-dj-min-points": 10, "config-dj-max-points": 90 },
    },
  },
  {
    key: "praca",
    name: "Praça General Humberto Delgado",
    clue:
      'QR code com a música do Spotify "Barco de Aveiro", 1min16s: "Ir como um moliceiro pela ria até ao mar".',
    staffScript:
      "A música da pista é da tuna. Falar das diferentes tunas e relembrar que podem experimentar.",
    challengeBrief:
      "Recriar uma cena do Titanic escolhida por eles. Se não decidirem, ter fotos no telemóvel e " +
      "eles que escolham.",
    ...AVEIRO.praca,
    activity: {
      name: "Cena do Titanic",
      typeLabel: "Avaliação Posterior (Fotos)",
      apiType: "DeferredJudgedActivity",
      configFields: { "config-dj-min-points": 5, "config-dj-max-points": 70 },
    },
  },
];

export const AVEIRO_POSTS: readonly AveiroPost[] = [...UNIVERSIDADE_POSTS, ...FORA_DA_UNI_POSTS];

/** The two blocks of the real route, with the rule each ran under. */
export const AVEIRO_STAGES = [
  { name: "Universidade", orderMatters: true, requiredCount: null },
  // Outside the university the order stops mattering — the guides steered
  // teams to whatever was free. Every post is still required: the sheet lists
  // four and the teams did four, and a partial count would strand the last
  // one, since a satisfied stage with nothing after it ends the route.
  { name: "Fora da Uni", orderMatters: false, requiredCount: null },
] as const;
