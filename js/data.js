/**
 * Reference data for teacher pay in France.
 *
 * Every figure carries a `confidence` flag:
 *   "verified"  checked against a primary source (Legifrance, service-public, impots.gouv)
 *   "to-check"  plausible and widely published, but not confirmed against a primary source
 *
 * All amounts are gross euros. `annual` values are yearly; the model divides by 12.
 * Scripts are plain (non-module) so the page also works when opened with file://
 */

var REFERENCE = {
  // Frozen since 2023-07-01, still frozen in 2026 (third consecutive year).
  indexPointValue: 4.92278,

  contributions: {
    pension: 0.111, // on traitement + pensionable index points only
    rafp: 0.05, // on indemnities, capped below
    rafpCapRatio: 0.2, // cap = 20% of the pensionable base
    csg: 0.092 * 0.9825,
    crds: 0.005 * 0.9825,
    csgDeductible: 0.068 * 0.9825
  },

  // Loi de finances n° 2026-103 du 19 février 2026, on 2025 income.
  incomeTax: {
    year: 2026,
    standardDeduction: 0.1,
    brackets: [
      { upTo: 11600, rate: 0 },
      { upTo: 29579, rate: 0.11 },
      { upTo: 84577, rate: 0.3 },
      { upTo: 181917, rate: 0.41 },
      { upTo: Infinity, rate: 0.45 }
    ],
    decote: {
      single: { amount: 897, ceiling: 1982 },
      couple: { amount: 1483, ceiling: 3277 },
      rate: 0.4525
    },
    // Cap on the tax advantage of each additional half-share, art. 197 CGI.
    halfShareCap: 1807,
    // A parent isolé gets a whole part for the first child, capped on its own.
    isolatedParentCap: 4262
  },

  // Mandatory collective health cover, effective 2026-05-01, précomptée on the payslip.
  healthInsurance: {
    monthlyTotal: 75.4,
    monthlyEmployeeShare: 37.7,
    effectiveFrom: "1er mai 2026"
  },

  // Still fixed in this version, displayed in the UI.
  assumptions: {
    workRatio: 1
  }
};

/**
 * Fiscal households, with the ceiling that applies to their additional shares.
 * `cap` is stated per row rather than derived: the first child of a parent isolé
 * gives a whole part capped on its own (4 262 €), the others give half-parts
 * capped at 1 807 € each, and a generic loop would get that wrong.
 * `couple` drives the décote only, never the share count: a parent isolé has two
 * shares but stays a single person for the décote.
 */
var HOUSEHOLDS = [
  { id: "single", label: "Personne seule", shares: 1, baseShares: 1, couple: false, cap: 0 },
  { id: "isolated1", label: "Parent isolé, 1 enfant", shares: 2, baseShares: 1, couple: false, cap: 4262 },
  { id: "isolated2", label: "Parent isolé, 2 enfants", shares: 2.5, baseShares: 1, couple: false, cap: 6069 },
  { id: "couple0", label: "Couple, sans enfant", shares: 2, baseShares: 2, couple: true, cap: 0 },
  { id: "couple1", label: "Couple, 1 enfant", shares: 2.5, baseShares: 2, couple: true, cap: 1807 },
  { id: "couple2", label: "Couple, 2 enfants", shares: 3, baseShares: 2, couple: true, cap: 3614 },
  { id: "couple3", label: "Couple, 3 enfants", shares: 4, baseShares: 2, couple: true, cap: 7228 }
];

var CAREER = {
  id: "pe",
  label: "Professeur des écoles",
  grades: [
    {
      id: "cn",
      label: "Classe normale",
      note: "Grade d'entrée, celui de toute la carrière ou presque. On y avance d'échelon " +
        "automatiquement à l'ancienneté, sur environ 26 ans, avec deux accélérations d'un an " +
        "possibles aux 6e et 8e échelons, attribuées à 30 % des agents après rendez-vous de carrière.",
      steps: [
        { step: 1, im: 395, years: 1 },
        { step: 2, im: 446, years: 1 },
        { step: 3, im: 453, years: 2 },
        { step: 4, im: 466, years: 2 },
        { step: 5, im: 481, years: 2.5 },
        { step: 6, im: 497, years: 3 },
        { step: 7, im: 524, years: 3 },
        { step: 8, im: 562, years: 3.5 },
        { step: 9, im: 595, years: 4 },
        { step: 10, im: 634, years: 4 },
        { step: 11, im: 678, years: null }
      ]
    },
    {
      id: "hc",
      label: "Hors classe",
      note: "Grade d'avancement, pas un choix. Il faut deux ans d'ancienneté au 9e échelon de la " +
        "classe normale, soit une vingtaine d'années de carrière, ou être au 10e ou 11e échelon. " +
        "La promotion passe par un tableau d'avancement, sans candidature à déposer. Un professeur " +
        "promu depuis le 9e échelon entre directement au 2e échelon de la hors classe, le 1er échelon " +
        "n'est donc en pratique jamais occupé. La prime d'attractivité disparaît à ce grade.",
      steps: [
        { step: 1, im: 595, years: 2 },
        { step: 2, im: 629, years: 2 },
        { step: 3, im: 673, years: 2.5 },
        { step: 4, im: 720, years: 2.5 },
        { step: 5, im: 768, years: 3 },
        { step: 6, im: 811, years: 3 },
        { step: 7, im: 826, years: null }
      ]
    }
  ]
};

/**
 * Chart series. Several pay items can share one series: the stack stays readable
 * while the tooltip and the table keep the item-level detail.
 * Order is the stacking order, bottom to top.
 */
var INCOME_SERIES = [
  {
    id: "base",
    label: "Traitement indiciaire",
    note: "Le salaire de base, égal à l'indice majoré de l'échelon multiplié par la valeur du " +
      "point, 4,92278 € brut par mois. C'est la seule part qui compte pour la pension civile, et " +
      "elle pèse de 83 % du brut au 1er échelon à 94 % au 11e, parce que les primes s'éteignent " +
      "quand elle monte."
  },
  {
    id: "socle",
    label: "Indemnités de socle",
    note: "Les deux primes versées à tout professeur des écoles devant élèves, sans condition " +
      "d'affectation ni de mission. L'ISAE, 2 550 € par an, et la prime d'équipement " +
      "informatique, 176 € par an, mensualisée ici pour la comparaison."
  },
  {
    id: "attractiveness",
    label: "Prime d'attractivité",
    note: "Créée en 2021 pour soutenir les débuts de carrière, réservée aux échelons 1 à 9 de la " +
      "classe normale. Elle culmine à 3 370 € par an au 3e échelon puis s'effondre, ce qui annule " +
      "presque exactement la progression du traitement pendant dix ans. Elle disparaît en hors classe."
  },
  {
    id: "priority",
    label: "Éducation prioritaire",
    note: "Les indemnités REP et REP+ et la part modulable. Elles dépendent uniquement de l'école " +
      "d'affectation, donc s'obtiennent par mutation, sans examen ni qualification."
  },
  {
    id: "missions",
    label: "Missions et fonctions",
    note: "Les primes qui demandent un engagement ou une qualification, par opposition à une " +
      "simple affectation. Aujourd'hui le Pacte et l'enseignement spécialisé. C'est aussi là que " +
      "viendront la direction d'école, le conseiller pédagogique et le PEMF."
  }
];

var DEDUCTION_SERIES = [
  {
    id: "pension",
    label: "Retenue pension civile",
    note: "La cotisation retraite du fonctionnaire, 11,10 %, prélevée sur le traitement indiciaire " +
      "seul. Les primes n'y sont pas soumises, et c'est la raison pour laquelle la pension d'un " +
      "enseignant représente une part plus faible de son dernier salaire qu'il n'y paraît."
  },
  {
    id: "rafp",
    label: "RAFP",
    note: "Retraite additionnelle de la fonction publique, le régime complémentaire par points qui " +
      "récupère ce que la pension civile ignore. 5 % à la charge de l'agent, autant pour " +
      "l'employeur, calculés sur les primes dans la limite de 20 % du traitement. Aux quatre " +
      "premiers échelons les primes dépassent ce plafond, donc une partie échappe à la cotisation."
  },
  {
    id: "csgCrds",
    label: "CSG et CRDS",
    note: "Les contributions sociales, 9,20 % et 0,50 %, prélevées sur 98,25 % du brut total, " +
      "primes comprises. Une partie de la CSG, 6,80 %, se déduit du revenu imposable, le reste non."
  },
  {
    id: "incomeTax",
    label: "Impôt sur le revenu",
    note: "Prélevé à la source. Calculé ici pour une part fiscale et une personne seule, avec " +
      "l'abattement de 10 % et la décote, sur le barème 2026 applicable aux revenus 2025."
  },
  {
    id: "health",
    label: "Complémentaire santé",
    note: "Le contrat collectif obligatoire entré en vigueur le 1er mai 2026, précompté sur le " +
      "bulletin de paie. 37,70 € à la charge de l'agent, autant payé par l'employeur. Ce n'est " +
      "pas une dépense à reporter dans un budget, elle est déjà retirée du net affiché ici."
  }
];

/** The net line is not a series, but it needs the same explanation. */
var NET_SERIES = {
  id: "net",
  label: "Net disponible",
  note: "Ce qui reste une fois retirés les cotisations, l'impôt et la complémentaire santé. " +
    "C'est le montant réellement viré sur le compte, à ne pas confondre avec le net avant impôt " +
    "qui figure sur le bulletin de paie."
};

/**
 * Pay items.
 *
 * An item may do three things, and the model supports all three so that the
 * functions still to be verified (direction, CPC, PEMF) plug in without a rewrite:
 *   annual / annualByStep  adds an indemnity
 *   indexPoints            adds pensionable index points (NBI, BI) to the base
 *   overrides              changes the amount of another item (PEMF halves the ISAE)
 *
 * control:  "always"  always on, no UI control
 *           "choice"  one of an exclusive group (radio)
 *           "toggle"  independent checkbox
 *           "count"   0..max units (Pacte briques)
 */
var PAY_ITEMS = [
  {
    id: "isae",
    label: "ISAE",
    fullLabel: "Indemnité de suivi et d'accompagnement des élèves",
    series: "socle",
    control: "always",
    annual: 2550,
    confidence: "verified",
    note: "Versée à tout professeur des écoles devant élèves. Doublée en septembre 2023."
  },
  {
    id: "computerAllowance",
    label: "Prime d'équipement informatique",
    series: "socle",
    control: "always",
    annual: 176,
    confidence: "verified",
    note: "Versée en une fois entre janvier et mars, mensualisée ici pour la comparaison."
  },
  {
    id: "attractiveness",
    label: "Prime d'attractivité",
    series: "attractiveness",
    control: "always",
    annualByStep: { 1: 2130, 2: 2980, 3: 3370, 4: 3180, 5: 2880, 6: 2500, 7: 1500, 8: 400, 9: 400 },
    isEligible: function (ctx) {
      return ctx.gradeId === "cn" && ctx.step <= 9;
    },
    confidence: "verified",
    note: "Classe normale, échelons 1 à 9 uniquement. Culmine au 3e échelon puis s'effondre."
  },
  {
    id: "rep",
    label: "REP",
    series: "priority",
    control: "choice",
    exclusiveGroup: "priorityEducation",
    annual: 1734,
    confidence: "verified",
    note: "Dépend uniquement de l'école d'affectation, donc s'obtient par mutation. Aucun examen " +
      "ni qualification requis. Proratisée à temps partiel."
  },
  {
    id: "repPlus",
    label: "REP+",
    series: "priority",
    control: "choice",
    exclusiveGroup: "priorityEducation",
    annual: 5114,
    confidence: "verified",
    note: "Part fixe de l'indemnité des réseaux d'éducation prioritaire renforcés. Dépend de " +
      "l'école d'affectation, donc s'obtient par mutation, sans examen ni qualification. C'est le " +
      "meilleur rapport entre gain et effort de toute la liste."
  },
  {
    id: "repPlusVariable",
    label: "Part modulable REP+",
    series: "priority",
    control: "toggle",
    requires: "repPlus",
    annual: 702,
    confidence: "verified",
    note: "Récompense l'engagement collectif d'une école entière, pas un agent en particulier. " +
      "Trois montants possibles et contingentés par académie, 702 € pour au plus 25 % des agents, " +
      "421 € pour la moitié, 234 € pour au moins 25 %. Le meilleur cas est retenu ici. " +
      "Versée en fin d'année scolaire."
  },
  {
    id: "pacte",
    label: "Pacte enseignant",
    series: "missions",
    control: "count",
    maxCount: 3,
    unitLabel: "brique",
    annual: 1250,
    confidence: "to-check",
    note: "Missions supplémentaires sur la base du volontariat, avec lettre de mission. Dans le " +
      "premier degré, ce sont surtout des remplacements de courte durée et du soutien, répartis par " +
      "l'inspection de circonscription. Montant de la brique confirmé pour l'enseignement agricole " +
      "seulement. Enveloppe en baisse pour 2026-2027, versement après service fait."
  },
  {
    id: "cappei",
    label: "Enseignement spécialisé",
    series: "missions",
    control: "toggle",
    annual: 1765,
    confidence: "to-check",
    note: "Indemnité pour l'enseignement adapté et spécialisé, versée aux professeurs des écoles " +
      "titulaires du CAPPEI exerçant en ULIS école, ULIS collège, SEGPA, EREA ou établissement " +
      "médico-social, pour au moins un demi-service. Majorée de 20 %, soit 2 118 €, en cas de " +
      "coordination pédagogique en SEGPA. En SEGPA, le sort de l'ISAE a changé avec le décret du " +
      "8 septembre 2025 et le total affiché ici n'en tient pas compte."
  }
];

/**
 * Items whose amounts could not be confirmed on a primary source, and which
 * change the socle rather than adding to it. Kept out of the UI on purpose: the
 * model already supports them, the figures do not yet deserve to be shown.
 */
var PENDING_PAY_ITEMS = [
  {
    id: "schoolDirection",
    label: "Direction d'école",
    series: "missions",
    control: "choice",
    exclusiveGroup: "function",
    annual: 1970.62,
    indexPoints: 8,
    confidence: "unverified",
    note: "Part fixe seule. Part variable de 1 000 à 1 800 € et BI de 8 à 40 points selon la taille de l'école."
  },
  {
    id: "pedagogicalAdvisor",
    label: "Conseiller pédagogique",
    series: "missions",
    control: "choice",
    exclusiveGroup: "function",
    annual: 3850,
    indexPoints: 27,
    overrides: [{ targetId: "isae", annual: 0 }],
    confidence: "unverified",
    note: "Perd l'ISAE, remplacée par l'indemnité de fonction. La NBI de 27 points est cotisée pour la pension."
  },
  {
    id: "trainerPemf",
    label: "PEMF",
    series: "missions",
    control: "choice",
    exclusiveGroup: "function",
    annual: 2550,
    overrides: [{ targetId: "isae", annual: 1700 }],
    confidence: "unverified",
    note: "Divergence de sources sur le montant. ISAE ramenée à 1 700 €. Allègement d'un tiers du service."
  }
];

/** Labels for the exclusive groups referenced by PAY_ITEMS.exclusiveGroup. */
var EXCLUSIVE_GROUPS = {
  priorityEducation: { noneLabel: "Aucune" },
  function: { noneLabel: "Enseignement en classe" }
};
