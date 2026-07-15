import type { LanguageId } from './types'

export const languageOptions: Array<{ id: LanguageId; label: string; runnable: boolean }> = [
  { id: 'javascript', label: 'JavaScript', runnable: true },
  { id: 'python', label: 'Python', runnable: true },
  { id: 'typescript', label: 'TypeScript', runnable: false },
  { id: 'html', label: 'HTML', runnable: false },
  { id: 'css', label: 'CSS', runnable: false },
  { id: 'json', label: 'JSON', runnable: false },
]

export const fileNames: Record<LanguageId, string> = {
  javascript: 'challenge.js',
  python: 'challenge.py',
  typescript: 'challenge.ts',
  html: 'index.html',
  css: 'styles.css',
  json: 'data.json',
}

export const starterCode: Record<LanguageId, string> = {
  javascript: `function summarizeEvents(events) {
  // Return a summary grouped by event type.
  return events.reduce((summary, event) => {
    const current = summary[event.type] ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += event.value;
    summary[event.type] = current;
    return summary;
  }, {});
}

const sample = [
  { type: "click", value: 12 },
  { type: "view", value: 4 },
  { type: "click", value: 8 },
];

console.log(JSON.stringify(summarizeEvents(sample), null, 2));`,
  python: `def summarize_events(events):
    """Return a summary grouped by event type."""
    summary = {}

    for event in events:
        current = summary.setdefault(event["type"], {"count": 0, "total": 0})
        current["count"] += 1
        current["total"] += event["value"]

    return summary


sample = [
    {"type": "click", "value": 12},
    {"type": "view", "value": 4},
    {"type": "click", "value": 8},
]

print(summarize_events(sample))`,
  typescript: `type Event = { type: string; value: number };
type Summary = Record<string, { count: number; total: number }>;

function summarizeEvents(events: Event[]): Summary {
  return events.reduce<Summary>((summary, event) => {
    const current = summary[event.type] ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += event.value;
    summary[event.type] = current;
    return summary;
  }, {});
}`,
  html: `<main class="event-summary">
  <h1>Event summary</h1>
  <p>Build a compact summary of incoming product events.</p>
</main>`,
  css: `.event-summary {
  max-width: 42rem;
  margin: 4rem auto;
  padding: 2rem;
  color: #17212b;
  background: #ffffff;
  border-radius: 1rem;
}`,
  json: `[
  { "type": "click", "value": 12 },
  { "type": "view", "value": 4 },
  { "type": "click", "value": 8 }
]`,
}
