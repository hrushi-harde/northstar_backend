/**
 * NorthStar AI Engine — Google Gemini integration
 *
 * Primary:  Gemini 1.5 Flash (free tier, 1500 req/day)
 * Fallback: deterministic regex rules (when API key missing or call fails)
 *
 * Public API:
 *   analyseUpdate(userMessage, project, conversationHistory, userName)
 *     → { response, signals, metrics, projectMutations, insight, usedLLM }
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Gemini client (lazy init, reset on model change) ──────────────────────
let _geminiModel = null;
let _geminiModelName = null;

function getGeminiModel() {
  const key       = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash-8b';

  if (!key || key === 'your_gemini_api_key_here') return null;

  // Re-init if model name changed (e.g. env reload)
  if (_geminiModel && _geminiModelName === modelName) return _geminiModel;

  const genAI = new GoogleGenerativeAI(key);
  _geminiModel     = genAI.getGenerativeModel({ model: modelName });
  _geminiModelName = modelName;
  return _geminiModel;
}

// ── Blocker resolution detection ───────────────────────────────────────────
const RESOLUTION_PATTERNS = [
  /\b(fixed|resolved|cleared|unblocked|sorted|done|closed|solved|addressed)\b/i,
  /\b(no longer|not\s+blocked|blocker\s+(is\s+)?(gone|fixed|resolved|cleared|done))\b/i,
  /\b(got\s+(it\s+)?(working|fixed|resolved|unblocked))\b/i,
  /\b(back\s+on\s+track|moving\s+again|unblocked\s+now)\b/i,
  /\b(the\s+(issue|problem|blocker|bug)\s+(is\s+)?(fixed|resolved|gone|cleared))\b/i,
];

/**
 * Returns true if the message indicates a blocker has been resolved.
 */
function detectsBlockerResolution(text) {
  return RESOLUTION_PATTERNS.some(p => p.test(text));
}

// ── System prompt ──────────────────────────────────────────────────────────
function buildPrompt(userMessage, project, conversationHistory) {
  const history = conversationHistory.length
    ? conversationHistory
        .map(m => `${m.role === 'ai' ? 'NorthStar AI' : 'Employee'}: ${m.content}`)
        .join('\n')
    : 'No prior messages in this session.';

  return `You are NorthStar, an AI operational intelligence assistant inside a project management platform.
Your job: analyse employee status updates, extract structured data, and respond conversationally.

PROJECT CONTEXT:
- Name: ${project.name}
- Department: ${project.department}
- Health: ${project.health}
- Progress: ${project.progress}%
- Risk: ${project.risk}
- Active blockers: ${project.blockers}
- Team morale: ${project.morale}/100
- Deadline: ${project.deadline || 'not set'}

CONVERSATION HISTORY:
${history}

EMPLOYEE'S LATEST MESSAGE:
"${userMessage}"

INSTRUCTIONS:
1. Write a warm, concise conversational reply (2-4 sentences). Ask at most ONE follow-up question — never repeat a question already asked above.
2. After your reply, output a JSON block wrapped in <analysis></analysis> tags.

JSON schema (omit any field you cannot confidently determine):
{
  "signals": ["blocker", "risk", "morale", "progress"],
  "blockerResolved": true,
  "metrics": {
    "progressPercent": <0-100>,
    "prsReviewed": <number>,
    "daysBlocked": <number>,
    "hoursBlocked": <number>,
    "peopleAffected": <number>,
    "ticketCount": <number>,
    "moraleSignal": "low" | "medium" | "high",
    "riskLevel": "low" | "medium" | "high" | "critical",
    "blockerTitle": "<max 100 chars — short title of the blocker>"
  },
  "projectMutations": {
    "progress": <0-100>,
    "morale": <0-100>,
    "risk": "low" | "medium" | "high" | "critical",
    "health": "healthy" | "at-risk" | "blocked"
  },
  "insight": {
    "severity": "info" | "medium" | "high" | "critical",
    "message": "<one-sentence insight for the executive dashboard>",
    "icon": "🟢" | "🟡" | "🟠" | "🔴"
  }
}

Rules:
- Only include signals that are genuinely present in the message.
- CRITICAL: If the employee says "no blockers", "there is no blocker", "not blocked", or any negation of a signal, do NOT include that signal. Negations must be respected.
- Set "blockerResolved": true ONLY when the employee explicitly says a blocker has been fixed/resolved/cleared (e.g. "the API issue is fixed", "we're unblocked now"). Omit this field otherwise.
- Only include projectMutations fields that should actually change from current values.
- Only include insight if something noteworthy happened (blocker, risk, morale drop, near-completion).
- Never invent data not present in the message.
- If the message is positive/clear (e.g. "on track", "no issues"), return an empty signals array and no blockerTitle.
- SESSION CLOSING: If the conversation history shows 2 or more AI turns already, and the employee is giving short/negative answers with no new signals, end the session with a warm closing message like "That's everything I need for today's update. All logged and visible on the dashboard. Have a great day! 👋" — do NOT ask more questions.`;
}

// ── Parse Gemini output ────────────────────────────────────────────────────
function parseGeminiOutput(raw) {
  const analysisMatch = raw.match(/<analysis>([\s\S]*?)<\/analysis>/i);
  const conversationalReply = raw.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();

  let analysis = { signals: [], metrics: {}, projectMutations: {}, insight: null };

  if (analysisMatch) {
    try {
      const jsonStr = analysisMatch[1].replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      analysis = {
        signals:          Array.isArray(parsed.signals) ? parsed.signals : [],
        blockerResolved:  parsed.blockerResolved === true,
        metrics:          typeof parsed.metrics === 'object' ? parsed.metrics : {},
        projectMutations: typeof parsed.projectMutations === 'object' ? parsed.projectMutations : {},
        insight:          parsed.insight || null,
      };
    } catch {
      // JSON parse failed — keep empty defaults
    }
  }

  return { conversationalReply, ...analysis };
}

// ── Gemini call ────────────────────────────────────────────────────────────
async function callGemini(userMessage, project, conversationHistory) {
  const model = getGeminiModel();
  if (!model) return null;

  try {
    const result = await model.generateContent(buildPrompt(userMessage, project, conversationHistory));
    const raw = result.response.text();
    return parseGeminiOutput(raw);
  } catch (err) {
    const is429 = err?.message?.includes('429') || err?.message?.includes('quota') || err?.message?.includes('Too Many Requests');
    if (is429) {
      // Rate limit hit — silently fall back to regex engine, no scary log
      return null;
    }
    console.error('[Gemini] API error:', err.message);
    return null;
  }
}

// ── Sanitise LLM mutations ─────────────────────────────────────────────────
function sanitiseMutations(project, raw) {
  const out = {};
  if (raw.progress !== undefined) {
    const v = parseInt(raw.progress);
    if (!isNaN(v) && v >= 0 && v <= 100 && v >= project.progress) out.progress = v;
  }
  if (raw.morale !== undefined) {
    const v = parseInt(raw.morale);
    if (!isNaN(v) && v >= 0 && v <= 100) out.morale = v;
  }
  const validRisk   = ['low', 'medium', 'high', 'critical'];
  const validHealth = ['healthy', 'at-risk', 'blocked'];
  if (raw.risk   && validRisk.includes(raw.risk))     out.risk   = raw.risk;
  if (raw.health && validHealth.includes(raw.health)) out.health = raw.health;
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// FALLBACK — deterministic regex engine
// ══════════════════════════════════════════════════════════════════════════

const SIGNAL_PATTERNS = {
  blocker: [
    /block(ed|ing|er)/i, /stuck/i,
    /can'?t\s+(proceed|continue|deploy|merge|push|build|run|access)/i,
    /waiting\s+on/i, /dependency\s+(issue|problem|missing)/i,
    /environment\s+(down|broken|issue|not\s+working)/i,
    /timeout/i, /failing/i, /broken/i, /halted/i, /not\s+working/i,
    /pipeline\s+(down|broken|failing)/i, /merge\s+conflict/i,
  ],
  risk: [
    /delay(ed|ing)?/i, /behind\s+schedule/i, /at\s+risk/i, /deadline/i,
    /slip(ping)?/i, /overdue/i, /concern(ed|ing)?/i, /might\s+miss/i,
    /won'?t\s+(make|hit|finish)/i, /running\s+out\s+of\s+time/i,
    /tight\s+(timeline|deadline|schedule)/i, /scope\s+creep/i,
  ],
  morale: [
    /frustrated?/i, /overwhelm(ed|ing)/i, /stress(ed|ful)?/i, /burnout/i,
    /tired/i, /exhausted/i, /demotivated/i, /not\s+great/i, /struggling/i,
    /drained/i, /burnt\s+out/i, /low\s+energy/i,
    /feeling\s+(bad|down|rough|off)/i,
  ],
  progress: [
    /complet(ed|ing)?/i, /done/i, /finish(ed|ing)?/i, /shipped/i,
    /deployed/i, /merged/i, /reviewed/i, /progress/i,
    /\d+\s*(PR|pull\s*request)/i, /on\s+track/i, /ahead/i,
    /\d+\s*%/, /milestone/i, /released/i, /launched/i,
  ],
};

// ── Negation helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the text contains a negated form of the keyword.
 * Covers: "no blocker", "no blockers", "there is no blocker",
 *         "not blocked", "aren't blocked", "without blockers", etc.
 */
function isNegated(text, keyword) {
  const negationPattern = new RegExp(
    `\\b(no|not|without|zero|none|isn'?t|aren'?t|wasn'?t|weren'?t|haven'?t|don'?t|doesn'?t|didn'?t|never|clear of)\\b[^.!?]{0,40}\\b${keyword}\\b`,
    'i'
  );
  const postNegation = new RegExp(
    `\\b${keyword}\\b[^.!?]{0,20}\\b(none|zero|nothing|cleared|resolved|all clear)\\b`,
    'i'
  );
  return negationPattern.test(text) || postNegation.test(text);
}

function detectSignalsFallback(text) {
  const signals = new Set();
  for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    if (patterns.some(p => p.test(text))) {
      // Skip if the signal keyword is negated in context
      if (signal === 'blocker' && isNegated(text, 'block(?:er|ers|ed|ing)?')) continue;
      if (signal === 'risk'    && isNegated(text, 'risk'))   continue;
      if (signal === 'morale'  && isNegated(text, 'morale')) continue;
      signals.add(signal);
    }
  }
  return [...signals];
}

function extractMetricsFallback(text) {
  const metrics = {};
  const prMatch = text.match(/(\d+)\s*(PR|pull\s*request)/i);
  if (prMatch) metrics.prsReviewed = parseInt(prMatch[1]);

  const dayBlock = text.match(/(\d+)\s*day[s]?\s*(blocked|stuck|on\s+this)/i);
  if (dayBlock) metrics.daysBlocked = parseInt(dayBlock[1]);

  const hrBlock = text.match(/(\d+)\s*hour[s]?\s*(blocked|stuck|down|waiting)/i);
  if (hrBlock) metrics.hoursBlocked = parseInt(hrBlock[1]);

  const pct = text.match(/(\d{1,3})\s*%\s*(complete|done|finished|progress|through)?/i);
  if (pct) { const v = parseInt(pct[1]); if (v >= 0 && v <= 100) metrics.progressPercent = v; }

  const lower = text.toLowerCase();
  const hi  = ['great', 'excellent', 'amazing', 'fantastic', 'energized', 'motivated', 'excited'];
  const lo  = ['frustrated', 'stressed', 'overwhelmed', 'tired', 'exhausted', 'burnout', 'burnt out', 'drained', 'struggling', 'demotivated'];
  const mid = ['okay', 'fine', 'alright', 'decent', 'good'];
  if (hi.some(w => lower.includes(w)))       metrics.moraleSignal = 'high';
  else if (lo.some(w => lower.includes(w)))  metrics.moraleSignal = 'low';
  else if (mid.some(w => lower.includes(w))) metrics.moraleSignal = 'medium';

  const blockerSentences = text.split(/[.!?\n]/).filter(s =>
    /block|stuck|failing|broken|timeout|halted|not\s+working/i.test(s) &&
    // Exclude sentences that are clearly negations
    !/\b(no|not|without|zero|none|isn'?t|aren'?t|never|clear)\b[^.!?]{0,30}\bblock/i.test(s) &&
    !/\bno\s+block/i.test(s)
  );
  if (blockerSentences.length) metrics.blockerTitle = blockerSentences[0].trim().substring(0, 100);

  if (/critical|emergency|urgent|immediately|asap/i.test(text)) metrics.riskLevel = 'critical';
  else if (/high\s+risk|very\s+risky|serious/i.test(text))      metrics.riskLevel = 'high';
  else if (/medium\s+risk|moderate/i.test(text))                metrics.riskLevel = 'medium';
  else if (/low\s+risk|minor/i.test(text))                      metrics.riskLevel = 'low';

  const ticket = text.match(/(\d+)\s*(ticket|issue|bug|task)[s]?/i);
  if (ticket) metrics.ticketCount = parseInt(ticket[1]);

  const people = text.match(/(\d+)\s*(engineer|developer|person|people|team\s*member)[s]?\s*(affected|blocked|impacted)/i);
  if (people) metrics.peopleAffected = parseInt(people[1]);

  return metrics;
}

function computeMutationsFallback(project, signals, metrics) {
  const mutations = {};

  if (metrics.progressPercent !== undefined && metrics.progressPercent > project.progress) {
    mutations.progress = metrics.progressPercent;
  } else if (signals.includes('progress') && !signals.includes('blocker')) {
    const nudge = Math.min(project.progress + 3, 100);
    if (nudge > project.progress) mutations.progress = nudge;
  }

  if (metrics.moraleSignal === 'low')         mutations.morale = Math.max(project.morale - 8, 10);
  else if (metrics.moraleSignal === 'high')   mutations.morale = Math.min(project.morale + 5, 100);

  const riskOrder = ['low', 'medium', 'high', 'critical'];
  if (metrics.riskLevel) {
    const ci = riskOrder.indexOf(project.risk);
    const ni = riskOrder.indexOf(metrics.riskLevel);
    if (ni > ci) mutations.risk = metrics.riskLevel;
  } else if (signals.includes('blocker') && signals.includes('risk')) {
    if (riskOrder.indexOf(project.risk) < 2) mutations.risk = 'high';
  } else if (signals.includes('risk') && project.risk === 'low') {
    mutations.risk = 'medium';
  }

  if (signals.includes('blocker')) {
    if (project.health === 'healthy') mutations.health = 'at-risk';
    if (project.health === 'at-risk' && signals.includes('risk')) mutations.health = 'blocked';
  }

  return mutations;
}

const FOLLOW_UPS = {
  blocker:  [
    'How long has this blocker been active?',
    'Is anyone else on the team affected by this?',
    'Have you escalated this to your manager yet?',
    'Do you have a workaround in place while this is being resolved?',
    "What's the estimated time to resolve this blocker?",
  ],
  risk: [
    "What's your confidence level on the current deadline?",
    'Are there any dependencies blocking your progress?',
    'What would it take to get back on track?',
    'Is there anything the team can do to help mitigate this risk?',
  ],
  morale: [
    'Is there anything specific causing this feeling?',
    'Are you getting enough support from the team?',
    'What would make your work situation better right now?',
    'Is this a temporary spike or has it been building for a while?',
  ],
  progress: [
    'Any blockers coming up that might slow things down?',
    "What's your plan for the next 24 hours?",
    'Are you on track for the project deadline?',
    "What's the next milestone you're targeting?",
  ],
  default: [
    'Are there any blockers or risks I should flag for the team?',
    "How are you feeling about the project timeline?",
    "What's your top priority for the rest of the day?",
    'Any dependencies you are waiting on right now?',
    'Is the team well-supported on this project?',
  ],
};

// Acknowledgment phrases for when the employee answers a direct question
const ACKNOWLEDGMENTS = {
  no_blocker: [
    "Got it — all clear on blockers. I've logged your update.",
    "Understood, no blockers. Update logged to the timeline.",
    "Good to hear — no blockers noted. Keep it up!",
    "Noted — no blockers today. Your update has been recorded.",
  ],
  no_risk: [
    "Great, no delivery risks flagged. Update logged.",
    "Understood — timeline looks solid. Logged.",
    "Good to know — no risks noted. Update recorded.",
  ],
  general_ack: [
    "Got it, thanks for the update. I've logged this.",
    "Understood. Update recorded.",
    "Noted. I've logged this.",
    "Thanks for clarifying. Update logged.",
  ],
};

// Closing messages — used when the session has covered enough ground
const CLOSINGS = [
  "That's everything I need for today's update. All logged and visible on the dashboard. Have a great day! 👋",
  "Perfect — your update is complete and logged. The team has full visibility. See you tomorrow! ✅",
  "All done! Your operational update has been recorded. Dashboard is up to date. 🎯",
  "Great, that wraps up today's check-in. Everything is logged and the team is informed. 👍",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a follow-up question from the bank that hasn't been asked yet.
 * Falls back to null if all questions in the bank have been asked.
 */
function pickUnaskedQuestion(bank, conversationHistory) {
  const askedText = conversationHistory
    .filter(m => m.role === 'ai')
    .map(m => m.content.toLowerCase());

  const unasked = bank.filter(q =>
    !askedText.some(asked => asked.includes(q.toLowerCase().replace('?', '').trim().substring(0, 30)))
  );

  return unasked.length > 0 ? unasked[0] : null;
}

/**
 * Detect if the employee's message is a short direct answer to a yes/no question
 * (e.g. "No", "Nope", "No blockers today", "Yes", "All good").
 */
function isShortAnswer(text) {
  return text.trim().split(/\s+/).length <= 8;
}

/**
 * Detect if the employee is saying "no" to something.
 */
function isNegativeAnswer(text) {
  return /^\s*(no|nope|nah|none|nothing|not really|all (good|clear|fine)|clear|nothing to flag|no issues?|no blockers?|no risks?)\b/i.test(text.trim());
}

function buildFallbackResponse(signals, metrics, mutations, conversationHistory = []) {
  // Build the logged summary lines
  const lines = [];
  if (metrics.progressPercent !== undefined) lines.push(`📊 Progress updated to ${metrics.progressPercent}%`);
  if (metrics.prsReviewed)    lines.push(`✅ ${metrics.prsReviewed} PR(s) reviewed logged`);
  if (metrics.daysBlocked)    lines.push(`⏱️ Blocked for ${metrics.daysBlocked} day(s)`);
  if (metrics.hoursBlocked)   lines.push(`⏱️ Blocked for ${metrics.hoursBlocked} hour(s)`);
  if (metrics.peopleAffected) lines.push(`👥 ${metrics.peopleAffected} team member(s) affected`);
  if (mutations.health)       lines.push(`🏥 Project health → ${mutations.health}`);
  if (mutations.risk)         lines.push(`⚠️ Risk level → ${mutations.risk}`);
  const summary = lines.length ? `\n\nLogged:\n${lines.join('\n')}` : '';

  const aiTurns     = conversationHistory.filter(m => m.role === 'ai').length;
  const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user');
  const lastAiMsg   = [...conversationHistory].reverse().find(m => m.role === 'ai');
  const lastAiText  = lastAiMsg?.content?.toLowerCase() || '';
  const isNeg       = isNegativeAnswer(lastUserMsg?.content || '');
  const isShort     = isShortAnswer(lastUserMsg?.content || '');

  // ── Session-end: close when enough turns done or all questions exhausted ──
  const noMoreDefaults = pickUnaskedQuestion(FOLLOW_UPS.default, conversationHistory) === null;
  const shouldClose    = noMoreDefaults || (isNeg && aiTurns >= 2) || aiTurns >= 4;

  if (signals.length === 0 && shouldClose) {
    return `${pickRandom(CLOSINGS)}${summary}`;
  }

  // ── Short / negative answer — acknowledge then either ask one more or close
  if (signals.length === 0 && isShort) {
    const ack = isNeg && lastAiText.includes('blocker') ? pickRandom(ACKNOWLEDGMENTS.no_blocker)
      : isNeg && lastAiText.includes('risk')            ? pickRandom(ACKNOWLEDGMENTS.no_risk)
      : pickRandom(ACKNOWLEDGMENTS.general_ack);

    const nextQ = pickUnaskedQuestion(FOLLOW_UPS.default, conversationHistory);
    if (nextQ && aiTurns < 2) return `${ack} ${nextQ}${summary}`;

    // No more questions or already asked enough — close the session
    return `${ack}\n\n${pickRandom(CLOSINGS)}${summary}`;
  }

  // ── Signal-based responses ───────────────────────────────────────────────
  if (signals.includes('blocker')) {
    const q = pickUnaskedQuestion(FOLLOW_UPS.blocker, conversationHistory);
    const intro = `I've detected a blocker in your update.`;
    return q ? `${intro} ${q}${summary}` : `${intro} I've flagged this on the project dashboard.${summary}`;
  }

  if (signals.includes('risk')) {
    const q = pickUnaskedQuestion(FOLLOW_UPS.risk, conversationHistory);
    const intro = `I'm picking up a delivery risk signal.`;
    return q ? `${intro} ${q}${summary}` : `${intro} I've noted this risk on the project.${summary}`;
  }

  if (signals.includes('morale')) {
    const q = pickUnaskedQuestion(FOLLOW_UPS.morale, conversationHistory);
    const intro = `I noticed some stress signals — that's important to flag.`;
    return q ? `${intro} ${q}${summary}` : `${intro} I've noted this for your manager's awareness.${summary}`;
  }

  if (signals.includes('progress')) {
    const q = pickUnaskedQuestion(FOLLOW_UPS.progress, conversationHistory);
    const intro = `Great progress update!`;
    return q ? `${intro} ${q}${summary}` : `${intro} Keep it up — update logged.${summary}`;
  }

  // ── Default — one unasked question, then close ────────────────────────────
  const q = pickUnaskedQuestion(FOLLOW_UPS.default, conversationHistory);
  if (q && aiTurns < 2) return `Thanks for the update. ${q}${summary}`;

  return `${pickRandom(CLOSINGS)}${summary}`;
}

function buildInsightFallback(project, signals, metrics, userName) {
  if (signals.includes('blocker') && metrics.blockerTitle) {
    return {
      severity: signals.includes('risk') ? 'high' : 'medium',
      message: `${userName} reported a blocker on ${project.name}: "${metrics.blockerTitle}"`,
      icon: signals.includes('risk') ? '🟠' : '🔴',
    };
  }
  if (signals.includes('morale') && metrics.moraleSignal === 'low') {
    return { severity: 'medium', message: `Low morale signal from ${userName} on ${project.name}. Consider a 1:1.`, icon: '🟡' };
  }
  if (signals.includes('risk') && !signals.includes('blocker')) {
    return { severity: 'medium', message: `Delivery risk flagged by ${userName} on ${project.name}.`, icon: '🟠' };
  }
  if (metrics.progressPercent >= 90) {
    return { severity: 'info', message: `${project.name} is ${metrics.progressPercent}% complete — nearing delivery.`, icon: '🟢' };
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════════════════

/**
 * Analyse an employee update message.
 * Tries Gemini first; falls back to regex engine on failure.
 *
 * @param {string} userMessage
 * @param {object} project       - full project row from DB
 * @param {Array}  conversationHistory - [{role, content}]
 * @param {string} userName      - display name of the employee
 * @returns {Promise<{response, signals, metrics, projectMutations, insight, usedLLM}>}
 */
async function analyseUpdate(userMessage, project, conversationHistory = [], userName = 'Team member') {
  // ── Try Gemini ──
  const llm = await callGemini(userMessage, project, conversationHistory);

  if (llm) {
    const mutations = sanitiseMutations(project, llm.projectMutations || {});
    // If Gemini didn't produce an insight, try the fallback insight generator
    const insight = llm.insight || buildInsightFallback(project, llm.signals || [], llm.metrics || {}, userName);
    // Also check with regex if Gemini missed a resolution signal
    const blockerResolved = llm.blockerResolved || detectsBlockerResolution(userMessage);
    return {
      response:         llm.conversationalReply || 'Update logged.',
      signals:          llm.signals          || [],
      blockerResolved,
      metrics:          llm.metrics          || {},
      projectMutations: mutations,
      insight,
      usedLLM: true,
    };
  }

  // ── Fallback ──
  const signals   = detectSignalsFallback(userMessage);
  const metrics   = extractMetricsFallback(userMessage);
  const mutations = computeMutationsFallback(project, signals, metrics);
  const response  = buildFallbackResponse(signals, metrics, mutations, conversationHistory);
  const insight   = buildInsightFallback(project, signals, metrics, userName);
  const blockerResolved = detectsBlockerResolution(userMessage);

  return { response, signals, blockerResolved, metrics, projectMutations: mutations, insight, usedLLM: false };
}

// ── Legacy sync exports (used by analytics route) ─────────────────────────
function detectSignals(text)  { return detectSignalsFallback(text); }
function extractMetrics(text) { return extractMetricsFallback(text); }

function computeOrgHealthScore(projects) {
  if (!projects.length) return 0;
  const w = { healthy: 100, 'at-risk': 55, blocked: 10 };
  return Math.round(projects.reduce((s, p) => s + (w[p.health] || 50), 0) / projects.length);
}

function computeProjectRiskScore(project) {
  return { low: 20, medium: 50, high: 75, critical: 95 }[project.risk] || 50;
}

function generateRecommendations(projects) {
  const recs = [];
  projects.filter(p => p.risk === 'critical' || p.health === 'blocked').forEach(p => {
    recs.push({ priority: 'Critical', color: '#ef4444', title: `Resolve blockers in ${p.name}`, description: `${p.blockers} blocker(s). Health: ${p.health}. Immediate escalation recommended.` });
  });
  projects.filter(p => p.morale < 50).forEach(p => {
    recs.push({ priority: 'High', color: '#f97316', title: `${p.name} morale intervention needed`, description: `Morale at ${p.morale}. Schedule 1:1s and consider workload redistribution.` });
  });
  projects.filter(p => p.risk === 'high' && p.health !== 'blocked').forEach(p => {
    recs.push({ priority: 'Medium', color: '#fbbf24', title: `Monitor delivery risk in ${p.name}`, description: `High risk with ${p.progress}% progress. Review timeline.` });
  });
  return recs.slice(0, 5);
}

module.exports = {
  analyseUpdate,
  detectSignals,
  extractMetrics,
  computeOrgHealthScore,
  computeProjectRiskScore,
  generateRecommendations,
};
