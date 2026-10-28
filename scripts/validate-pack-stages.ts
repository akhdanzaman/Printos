import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';

const path =
  process.argv[2] || 'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v2.json';
const raw = fs.readFileSync(path, 'utf8');
const result = migratePrintOSState(raw);

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  process.exit(1);
};

if (result.status !== 'ok' || !result.state) fail(result.errorMessage || 'migration failed');
const s = result.state as NonNullable<typeof result.state>;
const projectIds = new Set((s.contentProjects || []).map((p) => p.id));
const seriesIds = new Set((s.contentSeries || []).map((x) => x.id));
const itemIds = new Set((s.contentItems || []).map((i) => i.id));

const problems: string[] = [];
if (itemIds.size !== (s.contentItems || []).length) problems.push('duplicate item ids');

for (const item of s.contentItems || []) {
  if (!projectIds.has(item.projectId)) problems.push(`item ${item.title} -> missing project`);
  if (item.seriesId && !seriesIds.has(item.seriesId)) problems.push(`item ${item.title} -> missing series`);
  if (!item.brief?.hook) problems.push(`item ${item.title} -> empty hook`);

  const history = item.stageHistory || [];
  if (history.length) {
    if (history[0]?.stage !== 'Strategy' || history[1]?.stage !== 'Idea & Research Bank') {
      problems.push(`item ${item.title} -> log order wrong`);
    }
    for (const log of history) {
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} WIB$/.test(log.completedAtJakarta)) {
        problems.push(`item ${item.title} -> bad timestamp ${log.completedAtJakarta}`);
      }
      if (!['user', 'agent'].includes(log.actor)) problems.push(`item ${item.title} -> bad actor`);
      const output = log.output || {};
      if (Object.values(output).every((v) => !String(v).trim())) {
        problems.push(`item ${item.title} -> empty output for ${log.stage}`);
      }
    }
  }
}

for (const pub of s.contentPublications || []) {
  if (!itemIds.has(pub.contentItemId)) problems.push('publication -> missing item');
}
if (problems.length) fail(problems.slice(0, 10).join(' | '));

const withLogs = (s.contentItems || []).filter((i) => (i.stageHistory || []).length >= 2);
const objectives = withLogs.map((i) => i.stageHistory![0].output.objective || '');
const audiences = withLogs.map((i) => i.stageHistory![0].output.audience || '');
const sources = withLogs.map((i) => i.stageHistory![1].output.source || '');
const dupes = (arr: string[]) => arr.length - new Set(arr).size;

console.log(
  JSON.stringify(
    {
      pack: path.split('/').pop(),
      migration: result.status,
      items: s.contentItems?.length,
      itemsWithTwoLogs: withLogs.length,
      stages: (s.contentItems || []).reduce<Record<string, number>>((acc, i) => {
        acc[i.stage] = (acc[i.stage] || 0) + 1;
        return acc;
      }, {}),
      duplicateObjectives: dupes(objectives),
      duplicateAudiences: dupes(audiences),
      duplicateSources: dupes(sources),
      emptyObjective: objectives.filter((o) => o.trim().length < 15).length,
      emptySource: sources.filter((o) => o.trim().length < 8).length,
      sample: withLogs[0]
        ? {
            title: withLogs[0].title,
            strategy: withLogs[0].stageHistory![0].output,
            research: withLogs[0].stageHistory![1].output,
            at: withLogs[0].stageHistory![1].completedAtJakarta,
          }
        : null,
    },
    null,
    2
  )
);
