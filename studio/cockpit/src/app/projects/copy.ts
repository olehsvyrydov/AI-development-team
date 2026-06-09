/**
 * Ratified product copy for the Projects Home.
 *
 * The privacy/security and positioning strings below are APPROVED CLAIM STRINGS — they are
 * technical claims reviewed against the product's real behaviour and must ship VERBATIM. Editing
 * one to strengthen an assurance (dropping a caveat, removing the DART scoping, turning a
 * gate-pass into a code-security guarantee) is a regression that re-opens the security review.
 * They live here, named, so they are quoted once and never paraphrased at a call site.
 */

/** The anchor one-liner under the product name on first run. */
export const ANCHOR_LINE =
  "A full AI dev team — and a process it can't skip — for the code already on your machine.";

/** The plain-language "what it is" lead, shown muted under the anchor. */
export const WHAT_IT_IS =
  'Point DART at a project folder. It reads the code, stands up a team of specialist agents, ' +
  'and runs them through a workflow with gates that can refuse to proceed — all on your machine, ' +
  'on the AI coding tool you already use.';

/** The 3-step "how it works", each a label + one line. */
export interface HowStep {
  readonly label: string;
  readonly line: string;
}
export const HOW_STEPS: readonly HowStep[] = [
  { label: 'Connect a folder', line: 'Choose any project on this machine. Nothing is uploaded.' },
  { label: 'DART reads it', line: 'It analyses the code and docs, and remembers the rules your agents must follow.' },
  {
    label: 'The team gets to work',
    line: 'Specialist agents move tasks through an enforced workflow — you watch the process, not babysit it.',
  },
];

/** Helper under the primary CTA. */
export const CTA_HELPER = 'No account, no API key to paste. Takes about a minute.';

/** Populated-state title and the one-liner that frames the roster (not a bare "Your projects"). */
export const HOME_TITLE = 'Your projects';
export const HOME_SUBHEAD = 'Your AI dev team, across every project on this machine.';

/** Body copy for the "Add a project" cell in the populated grid — the returning-user door. */
export const ADD_PROJECT_BODY = 'Point DART at another folder on this machine — it analyses it right here.';

/** Trust-strip chips — each a literal, checkable fact, not a slogan. */
export const TRUST_CHIPS: readonly string[] = [
  'Local-first',
  'No account needed',
  'Open-source (MIT)',
  'Works with Claude Code / Cursor',
];

/** The honesty-anchored tooltip for the security-reviewed governance badge. */
export const SECURITY_REVIEWED_TOOLTIP =
  "This project's security gate ran and approved its latest gated change. " +
  "Gates here can refuse to proceed — they're not advisory.";

/** Folder-picker dialog subtitle and persistent footer — ratified reassurance, ship verbatim. */
export const PICKER_SUBTITLE =
  'DART reads this folder on your machine to understand the project. Nothing is uploaded.';
export const PICKER_FOOTER = 'Read-only analysis. DART never writes outside this folder.';

/** Shown when the selected folder already contains DART artefacts (adopt, not init). */
export const PICKER_ADOPT_HINT =
  "This folder already has DART files — we'll pick those up instead of starting over.";
