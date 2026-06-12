// Job Search Breakdown Report
// Synthesizes the existing ProInsights data into ONE artifact: a single named
// bottleneck + a funnel + a 7-day action plan. No new data plumbing — this is a
// thin synthesis layer over generateProInsights().

import { ApplicationRecord, isAppliedStatus } from '../types/pro';
import { generateProInsights } from './proAnalytics';

// The funnel stages a job search can break at, in order.
export type Bottleneck =
  | 'targeting'   // applying to the wrong roles / too few applications
  | 'ats'         // filtered by software before a human sees you
  | 'recruiter'   // pass ATS, fail the recruiter screen
  | 'interview'   // reach interviews, don't convert
  | 'ghost'       // applications vanish with no response
  | 'none';       // not enough signal / things are working

export type Confidence = 'low' | 'medium' | 'high';

export interface FunnelMetric {
  label: string;
  /** 0-100 */
  value: number;
  /** true if a higher number is better (e.g. interview conversion) */
  higherIsBetter: boolean;
  /** denominator behind the rate, for honesty about sample size */
  sample: number;
}

export interface ActionItem {
  day: number;      // 1-7
  title: string;
  detail: string;
}

// How forcefully we're allowed to tell the user to STOP doing something.
// A diagnosis subtracts — but only when the data earns it.
//   stop  → high confidence: "STOP DOING X"
//   pause → medium confidence: "PAUSE X until more data"
//   none  → low confidence: no stop recommendation at all
export type DiagnosisMode = 'stop' | 'pause' | 'none';

export interface Diagnosis {
  /** big two-word leak name, e.g. "ATS Filtering" */
  leakName: string;
  /** the one emotional sentence, e.g. "68% of your applications end before recruiter review." */
  oneLiner: string;
  /** the single positive action */
  focus: string;
  /** the activity to stop/pause (null when we won't recommend stopping) */
  stopActivity: string | null;
  /** why this is the right call right now — the trust-builder */
  whyNow: string;
  /** Waste Meter: the activity currently being wasted */
  wasteActivity: string;
  /** Waste Meter: why it's low-impact right now */
  wasteReason: string;
  /** Waste Meter: rough hours/week reclaimed by stopping it */
  hoursSaved: string;
}

export interface BreakdownReport {
  generatedFor: string;            // header line, e.g. "12 applications · 5 rejections decoded"
  totalApplications: number;
  resolvedApplications: number;    // applications that have an outcome beyond "applied"
  bottleneck: Bottleneck;
  bottleneckTitle: string;         // the report headline
  bottleneckExplanation: string;
  confidence: Confidence;
  confidenceNote: string;          // honest caveat shown under the headline
  /** "BIGGEST LEAK" | "LIKELY BIGGEST LEAK" | "EARLY SIGNAL" — scales with confidence */
  headlineLabel: string;
  /** whether we may issue a STOP / PAUSE / nothing, gated on confidence */
  diagnosisMode: DiagnosisMode;
  /** the doctor's diagnosis: one leak, one focus, one stop, one reason */
  diagnosis: Diagnosis;
  funnel: FunnelMetric[];
  actionPlan: ActionItem[];
  /** true when there isn't enough data to claim a bottleneck with any confidence */
  isThin: boolean;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function confidenceFromSample(resolved: number): Confidence {
  if (resolved >= 15) return 'high';
  if (resolved >= 6) return 'medium';
  return 'low';
}

const BOTTLENECK_TITLES: Record<Bottleneck, string> = {
  targeting: 'Your bottleneck is targeting',
  ats: 'Your bottleneck is ATS filtering',
  recruiter: 'Your bottleneck is the recruiter screen',
  interview: 'Your bottleneck is interview conversion',
  ghost: 'Your bottleneck is getting ghosted',
  none: 'No single bottleneck yet',
};

// Inputs the diagnosis copy needs to be specific (real numbers, not adjectives).
interface DiagnosisInput {
  atsFilterRate: number;
  ghostRate: number;
  recruiterRejectRate: number;
  interviewConversion: number;
  reachedInterview: number;
  total: number;
}

// The doctor's-diagnosis content per bottleneck. Each returns the leak name, the
// one emotional sentence, the focus action, the activity to subtract, and the
// Waste Meter. Built as functions so the numbers come from the user's real data.
const DIAGNOSIS_TEMPLATES: Record<Bottleneck, (d: DiagnosisInput) => Diagnosis> = {
  ats: (d) => ({
    leakName: 'ATS Filtering',
    oneLiner: `${d.atsFilterRate}% of your applications end before a recruiter ever sees your CV.`,
    focus: 'ATS optimisation — keyword match, clean formatting, and referrals to skip the filter.',
    stopActivity: 'Interview preparation',
    whyNow: 'You need more recruiters seeing your CV before interview skills become the bottleneck.',
    wasteActivity: 'Interview prep',
    wasteReason: 'Software is rejecting you before a human looks. Polishing interview answers fixes a stage you rarely reach.',
    hoursSaved: '3–5 hours/week',
  }),
  recruiter: (d) => ({
    leakName: 'Recruiter Screen',
    oneLiner: `You pass the ATS, but ${d.recruiterRejectRate}% of human-reviewed applications stall at the recruiter screen.`,
    focus: 'Your 30-second pitch and target level — the recruiter call is where you lose them.',
    stopActivity: 'Mass-applying to more roles',
    whyNow: 'Your CV already opens doors. Sending more of the same just adds more recruiter rejections.',
    wasteActivity: 'Application volume',
    wasteReason: 'More applications won’t help when the leak is the conversation after the application. Fix the pitch first.',
    hoursSaved: '2–4 hours/week',
  }),
  interview: (d) => ({
    leakName: 'Interview Conversion',
    oneLiner: `You reach interviews — ${d.reachedInterview} of them — but aren’t converting to offers yet.`,
    focus: 'Interview prep — story bank, the one core competency they test, and timed mocks.',
    stopActivity: 'Tweaking your CV and applying more',
    whyNow: 'Your CV clearly works — it gets you in the room. The leak is now what happens in the room.',
    wasteActivity: 'CV edits & new applications',
    wasteReason: 'You’re already reaching interviews. More applications dilute focus from the stage that actually decides offers.',
    hoursSaved: '2–3 hours/week',
  }),
  ghost: (d) => ({
    leakName: 'Getting Ghosted',
    oneLiner: `${d.ghostRate}% of your applications vanish with no response at all.`,
    focus: 'Where you apply — referrals, company sites, and named contacts over mass job boards.',
    stopActivity: 'Mass-applying on job boards',
    whyNow: 'Ghosting is mostly a channel problem. High-volume board applications disappear into the void.',
    wasteActivity: 'Job-board volume',
    wasteReason: 'Applications into a black hole aren’t progress. Warm channels rarely ghost you.',
    hoursSaved: '3–6 hours/week',
  }),
  targeting: (d) => ({
    leakName: 'Targeting & Volume',
    oneLiner: `With ${d.total} tracked application${d.total === 1 ? '' : 's'}, there isn’t enough signal to see where you break yet.`,
    focus: 'Volume and fit — apply to more well-matched roles and decode every rejection.',
    stopActivity: null,
    whyNow: 'A diagnosis needs data. The first job is enough tracked applications and outcomes to find the pattern.',
    wasteActivity: 'Over-optimising one application',
    wasteReason: 'Perfecting a single CV before you have outcome data is guessing. Get the data first.',
    hoursSaved: '1–2 hours/week',
  }),
  none: () => ({
    leakName: 'No Single Leak',
    oneLiner: 'No single stage is clearly leaking — your funnel is holding up.',
    focus: 'Keeping volume steady and decoding new rejections so the picture stays sharp.',
    stopActivity: null,
    whyNow: 'When nothing is clearly broken, the move is to keep the data fresh and double down on what works.',
    wasteActivity: 'Chasing every piece of advice',
    wasteReason: 'Without a clear leak, scattered fixes waste energy. Maintain what’s working.',
    hoursSaved: '1–2 hours/week',
  }),
};

// ── 7-day action plans, one per bottleneck ──────────────────────────────────
// Keyed to the diagnosed stage so the plan is specific, not generic advice.

const ACTION_PLANS: Record<Bottleneck, ActionItem[]> = {
  ats: [
    { day: 1, title: 'Audit one rejected application', detail: 'Compare your CV against the job description. Highlight every required keyword the posting uses that your CV does not.' },
    { day: 2, title: 'Rewrite your CV top third', detail: 'Mirror the exact title and 5–8 core skills from your target roles. The ATS matches strings, not synonyms.' },
    { day: 3, title: 'Strip ATS-breaking formatting', detail: 'Remove tables, columns, headers/footers, and images. Export as a plain .docx and a .pdf and test both.' },
    { day: 4, title: 'Find 3 referral paths', detail: 'For 3 target companies, find one 2nd-degree LinkedIn connection each. A referral skips the ATS entirely.' },
    { day: 5, title: 'Send 3 referral asks', detail: 'Short, specific message: the role, why you fit in one line, and a request to be referred — not "can we chat".' },
    { day: 6, title: 'Apply via company site, not aggregators', detail: 'Re-apply to 3 roles directly on the company ATS. Aggregator re-posts often lose your data before parsing.' },
    { day: 7, title: 'Re-decode and re-measure', detail: 'Decode your next rejection. If template/ATS rejections drop below half, the new CV is working.' },
  ],
  recruiter: [
    { day: 1, title: 'Map where you stall', detail: 'List recruiter-stage rejections. Note the level — you may be applying one band above where you convert.' },
    { day: 2, title: 'Tighten your 30-second pitch', detail: 'Write the answer to "tell me about yourself" in 4 sentences: who, proof, fit, ask. Recruiters screen on this.' },
    { day: 3, title: 'Pre-empt the salary/visa/notice questions', detail: 'These three kill recruiter screens silently. Decide your answers so you never fumble them live.' },
    { day: 4, title: 'Adjust target level', detail: 'Apply to 5 roles one band below your current targets. Convert there, then move back up with momentum.' },
    { day: 5, title: 'Rewrite your CV summary as outcomes', detail: 'Replace responsibilities with 3 quantified results. Recruiters skim for impact, not duties.' },
    { day: 6, title: 'Do one mock screen', detail: 'Have someone run the standard recruiter questions for 15 minutes. The goal is fluency, not perfection.' },
    { day: 7, title: 'Apply with the new pitch', detail: 'Send 5 fresh applications. Track which recruiter screens you now pass.' },
  ],
  interview: [
    { day: 1, title: 'Post-mortem your last interview', detail: 'Write the exact questions that tripped you up while they are fresh. Patterns hide in the specifics.' },
    { day: 2, title: 'Build a STAR story bank', detail: 'Draft 5 stories (conflict, failure, leadership, impact, ambiguity) you can adapt to most behavioural questions.' },
    { day: 3, title: 'Drill the core technical/role question', detail: 'Identify the one competency your target roles always test, and practice it for 45 focused minutes.' },
    { day: 4, title: 'Run a timed mock', detail: 'Full-length mock with a friend or a recording. Watch it back — filler words and rambling lose interviews.' },
    { day: 5, title: 'Prepare sharp questions to ask', detail: 'Three questions that show you understand the role’s real problems. Weak questions read as low interest.' },
    { day: 6, title: 'Fix your environment', detail: 'Test camera, audio, and lighting for remote rounds. Avoidable friction costs you in close calls.' },
    { day: 7, title: 'Send a follow-up that adds value', detail: 'For any live process, send a short note referencing one specific thing discussed — not a generic thank-you.' },
  ],
  ghost: [
    { day: 1, title: 'Separate fresh from dead', detail: 'Mark applications older than 21 days with no reply as ghosted. They are not pending — stop waiting on them.' },
    { day: 2, title: 'Shift channel mix', detail: 'Ghost rates are highest on mass job boards. Move new applications to company sites, referrals, and recruiter intros.' },
    { day: 3, title: 'Send 3 polite nudges', detail: 'For applications in the 7–14 day window, send one short follow-up to the recruiter or hiring contact.' },
    { day: 4, title: 'Find a human for each role', detail: 'Identify the actual recruiter or hiring manager on LinkedIn before applying. Apply, then connect.' },
    { day: 5, title: 'Cut the dead weight', detail: 'Drop the 2 lowest-signal channels entirely. Volume into a black hole is not progress.' },
    { day: 6, title: 'Apply where you have a warm path', detail: 'Five new applications, each with a referral or a named contact. Warm applications rarely get ghosted.' },
    { day: 7, title: 'Re-measure ghost rate', detail: 'Compare this week’s response rate to last week’s. Channel changes move this number fast.' },
  ],
  targeting: [
    { day: 1, title: 'Tighten your target', detail: 'Write down the exact title, level, and 2–3 industries you are aiming at. Scattered targeting dilutes every signal.' },
    { day: 2, title: 'Build a 10-company shortlist', detail: 'Pick 10 companies that fit your target. Quality of fit beats volume of applications at this stage.' },
    { day: 3, title: 'Run a fit check on 5 roles', detail: 'Use the role-fit checker before applying. Apply only where the verdict is good-fit or above.' },
    { day: 4, title: 'Raise application volume deliberately', detail: 'If you have fewer than ~10 tracked applications, the data can’t see a pattern yet. Apply to 5 well-fit roles.' },
    { day: 5, title: 'Decode every rejection you get', detail: 'Paste each rejection into the decoder. The bottleneck only sharpens once outcomes have stage data.' },
    { day: 6, title: 'Log outcomes honestly', detail: 'Update each application’s stage as you hear back. The report is only as good as the outcomes you record.' },
    { day: 7, title: 'Regenerate this report', detail: 'With more applications and decoded rejections, the bottleneck and confidence will sharpen.' },
  ],
  none: [
    { day: 1, title: 'Keep your tracker current', detail: 'Update outcomes as they land. Your funnel is the engine behind every insight here.' },
    { day: 2, title: 'Decode new rejections', detail: 'Each decoded rejection adds stage and category signal that strengthens future reports.' },
    { day: 3, title: 'Double down on what works', detail: 'Note which channel and level produced your best responses, and send more there.' },
    { day: 4, title: 'Maintain volume', detail: 'Keep a steady application rate so month-over-month comparisons stay meaningful.' },
    { day: 5, title: 'Ask for one referral', detail: 'Even when things work, referrals raise your hit rate. Send one ask this week.' },
    { day: 6, title: 'Review company patterns', detail: 'Check which companies ghost or stall you, and reweight your effort accordingly.' },
    { day: 7, title: 'Regenerate this report', detail: 'Re-run it weekly. The value is in watching the bottleneck move.' },
  ],
};

/**
 * Diagnose the single biggest bottleneck by walking the funnel and finding the
 * stage with the worst leakage that has enough sample size to trust.
 */
export function generateBreakdownReport(applications: ApplicationRecord[]): BreakdownReport {
  const insights = generateProInsights(applications);

  const applied = applications.filter(a => isAppliedStatus(a.outcome));
  const total = applied.length;
  const resolved = applied.filter(a => a.outcome !== 'applied');
  const resolvedCount = resolved.length;

  // Stage counts across all applied records.
  const count = (o: string) => applied.filter(a => a.outcome === o).length;
  const rejectedAts = count('rejected_ats');
  const rejectedRecruiter = count('rejected_recruiter');
  const rejectedHm = count('rejected_hm');
  const rejectedFinal = count('rejected_final');
  const ghosted = count('ghosted');
  const offers = count('offer');
  const interviewing = count('interviewing');

  // "Reached a human" = anything past the ATS.
  const reachedHuman = rejectedRecruiter + rejectedHm + rejectedFinal + offers + interviewing;
  const reachedInterview = rejectedHm + rejectedFinal + offers + interviewing;

  // ── Funnel metrics (the four the report promises) ──
  const atsFilterRate = pct(rejectedAts, resolvedCount);
  const recruiterRejectRate = pct(rejectedRecruiter, reachedHuman);
  const ghostRate = pct(ghosted, resolvedCount);
  const interviewConversion = pct(reachedInterview, reachedHuman);

  const funnel: FunnelMetric[] = [
    { label: 'ATS filter rate', value: atsFilterRate, higherIsBetter: false, sample: resolvedCount },
    { label: 'Recruiter rejection rate', value: recruiterRejectRate, higherIsBetter: false, sample: reachedHuman },
    { label: 'Ghost rate', value: ghostRate, higherIsBetter: false, sample: resolvedCount },
    { label: 'Interview conversion', value: interviewConversion, higherIsBetter: true, sample: reachedHuman },
  ];

  const confidence = confidenceFromSample(resolvedCount);
  const isThin = total < 5 || resolvedCount < 3;

  // ── Bottleneck diagnosis (ordered funnel walk) ──
  // Each branch needs both a high leakage rate AND a minimum sample to fire,
  // so we never name a bottleneck off one or two data points.
  let bottleneck: Bottleneck = 'none';

  if (total < 5) {
    bottleneck = 'targeting';
  } else if (atsFilterRate >= 50 && rejectedAts >= 3) {
    bottleneck = 'ats';
  } else if (ghostRate >= 50 && ghosted >= 3) {
    bottleneck = 'ghost';
  } else if (reachedHuman >= 3 && recruiterRejectRate >= 50 && rejectedRecruiter >= 2) {
    bottleneck = 'recruiter';
  } else if (reachedInterview >= 2 && offers === 0 && (rejectedHm + rejectedFinal) >= 2) {
    bottleneck = 'interview';
  } else if (offers > 0) {
    bottleneck = 'none';
  } else if (atsFilterRate >= ghostRate && atsFilterRate >= recruiterRejectRate && rejectedAts >= 2) {
    // fall back to the worst leak we can see, even if below the strong threshold
    bottleneck = 'ats';
  } else if (ghostRate >= recruiterRejectRate && ghosted >= 2) {
    bottleneck = 'ghost';
  } else if (rejectedRecruiter >= 2) {
    bottleneck = 'recruiter';
  } else {
    bottleneck = 'none';
  }

  // ── Headline explanation, grounded in the numbers ──
  let explanation: string;
  switch (bottleneck) {
    case 'targeting':
      explanation = `You have ${total} tracked application${total === 1 ? '' : 's'}. That's too few to see where your search breaks. The first job is volume and fit — apply to more well-matched roles and decode the rejections.`;
      break;
    case 'ats':
      explanation = `${atsFilterRate}% of your resolved applications were filtered by software before a human saw them (${rejectedAts} of ${resolvedCount}). Your resume isn't the problem in the room — it's not getting into the room.`;
      break;
    case 'recruiter':
      explanation = `You're getting past the ATS, but ${recruiterRejectRate}% of the applications that reached a human stall at the recruiter screen (${rejectedRecruiter} of ${reachedHuman}). Your CV opens doors; the pitch or level fit closes them.`;
      break;
    case 'interview':
      explanation = `You're reaching interviews — ${reachedInterview} of them — but not converting to offers yet. You're competitive. This is the highest-leverage stage to fix.`;
      break;
    case 'ghost':
      explanation = `${ghostRate}% of your resolved applications were ghosted (${ghosted} of ${resolvedCount}). The issue is mostly channel and follow-up, not your CV. Where you apply matters more than what you send.`;
      break;
    default:
      explanation = offers > 0
        ? `You have ${offers} offer${offers === 1 ? '' : 's'} in your tracked data — the funnel is working. Keep doing what works and decode new rejections to stay sharp.`
        : `No single stage is clearly leaking yet. Keep tracking outcomes and decoding rejections, and a pattern will surface.`;
  }

  let confidenceNote: string;
  if (bottleneck === 'targeting' || isThin) {
    confidenceNote = `Based on ${total} application${total === 1 ? '' : 's'} (${resolvedCount} resolved). This is an early signal, not a rule — track 6+ more outcomes to confirm.`;
  } else if (confidence === 'medium') {
    confidenceNote = `Based on ${resolvedCount} resolved applications. A solid read, but more data will sharpen it.`;
  } else {
    confidenceNote = `Based on ${resolvedCount} resolved applications. Enough data to trust this diagnosis.`;
  }

  const decoded = insights.rejectionPatterns.totalDecoded;
  const generatedFor = `${total} application${total === 1 ? '' : 's'} · ${decoded} rejection${decoded === 1 ? '' : 's'} decoded`;

  // ── Diagnosis: one leak, one focus, one stop — confidence-gated ──
  const diagnosis = DIAGNOSIS_TEMPLATES[bottleneck]({
    atsFilterRate,
    ghostRate,
    recruiterRejectRate,
    interviewConversion,
    reachedInterview,
    total,
  });

  // The strength of the headline scales with how sure we are.
  const headlineLabel =
    confidence === 'high' ? 'BIGGEST LEAK'
    : confidence === 'medium' ? 'LIKELY BIGGEST LEAK'
    : 'EARLY SIGNAL';

  // We only tell people to STOP something when the data earns it. A stop
  // recommendation off thin data is malpractice — so:
  //   high confidence + a real stop activity → 'stop'
  //   medium confidence + a real stop activity → 'pause' (softer)
  //   otherwise → 'none' (no subtraction advice)
  let diagnosisMode: DiagnosisMode = 'none';
  if (diagnosis.stopActivity && !isThin) {
    if (confidence === 'high') diagnosisMode = 'stop';
    else if (confidence === 'medium') diagnosisMode = 'pause';
  }

  return {
    generatedFor,
    totalApplications: total,
    resolvedApplications: resolvedCount,
    bottleneck,
    bottleneckTitle: BOTTLENECK_TITLES[bottleneck],
    bottleneckExplanation: explanation,
    confidence,
    confidenceNote,
    headlineLabel,
    diagnosisMode,
    diagnosis,
    funnel,
    actionPlan: ACTION_PLANS[bottleneck],
    isThin,
  };
}
