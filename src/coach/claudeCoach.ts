import type { AnalysisResult, CoachNote, FaultId, SwingRecord } from '../types';
import { DRILLS, DRILL_BY_ID } from './drills';
import { FAULT_DEFS } from '../analysis/faults';

export interface ClaudeSettings {
  apiKey: string;
  model: string;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const FAULT_IDS = new Set<string>(FAULT_DEFS.map((f) => f.id));

const SYSTEM_PROMPT = `You are a golf swing coach writing feedback for one golfer from measurements produced by a pose-tracking app.

Rules:
- Use only the numbers and facts in the JSON the user sends. Never invent measurements or claim to have seen the video.
- Quote the relevant measured values in your explanation.
- Name exactly one priority fault, chosen from the faults list, and explain in plain English what it does to ball flight and how it feels.
- Recommend at most three drills, chosen only from drill_library by id.
- If confidence is low, a metric is marked experimental, or the camera view limits what can be concluded, say so briefly in caveats.
- Mention progress only if recent_history supports it.
- Do not give medical advice. If a drill could strain the body, remind the golfer to stay within comfort.
- Keep it concise and encouraging, without flattery.

Reply with a single JSON object and nothing else, in this shape:
{"headline": string, "priority": {"faultId": string, "explanation": string} | null, "drillIds": string[], "positives": string[], "caveats": string[]}`;

/** The only data sent to the API: derived numbers and labels, never video or landmarks. */
export function buildCoachPayload(result: AnalysisResult, history: SwingRecord[]) {
  return {
    camera_view: result.settings.view,
    handedness: result.settings.handedness,
    quality: result.quality,
    durations_seconds: {
      backswing: Number(result.durations.backswing.toFixed(2)),
      downswing: Number(result.durations.downswing.toFixed(2)),
    },
    metrics: result.metrics.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.display,
      status: m.status,
      confidence: Number(m.confidence.toFixed(2)),
      target: m.target,
      experimental: Boolean(m.experimental),
    })),
    faults: result.faults.map((f) => ({
      id: f.id,
      label: f.label,
      severity: Number(f.severity.toFixed(2)),
      confidence: Number(f.confidence.toFixed(2)),
      summary: f.summary,
    })),
    recent_history: history.slice(0, 5).map((r) => ({
      date: new Date(r.createdAt).toISOString().slice(0, 10),
      view: r.analysis.settings.view,
      faults: r.analysis.faults.map((f) => f.id),
    })),
    drill_library: DRILLS.map((d) => ({ id: d.id, name: d.name, fixes: d.faultIds, summary: d.summary })),
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The coach reply did not contain JSON.');
  return JSON.parse(text.slice(start, end + 1));
}

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, max) : [];

/** Validates a model reply, dropping anything that does not match the app's fault and drill ids. */
export function parseCoachReply(raw: unknown): CoachNote {
  if (typeof raw !== 'object' || raw === null) throw new Error('The coach reply was not an object.');
  const o = raw as Record<string, unknown>;
  if (typeof o.headline !== 'string' || !o.headline.trim()) throw new Error('The coach reply had no headline.');

  let priority: CoachNote['priority'];
  const p = o.priority as Record<string, unknown> | null | undefined;
  if (p && typeof p.faultId === 'string' && FAULT_IDS.has(p.faultId) && typeof p.explanation === 'string') {
    priority = { faultId: p.faultId as FaultId, explanation: p.explanation };
  }
  const drillIds = strings(o.drillIds, 3).filter((id) => DRILL_BY_ID[id]);
  return {
    source: 'claude',
    headline: o.headline,
    priority,
    drillIds,
    positives: strings(o.positives, 3),
    caveats: strings(o.caveats, 4),
  };
}

/** Asks Claude to write the coaching note from the metrics summary. Called straight from the browser with the user's own key. */
export async function claudeCoach(
  result: AnalysisResult,
  history: SwingRecord[],
  settings: ClaudeSettings,
  signal?: AbortSignal,
): Promise<CoachNote> {
  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(buildCoachPayload(result, history)) }],
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`The Claude API returned ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
  return parseCoachReply(extractJson(text));
}
