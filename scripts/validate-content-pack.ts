import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';

const path = 'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v1.json';
const raw = fs.readFileSync(path, 'utf8');
const result = migratePrintOSState(raw);

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  process.exit(1);
};

if (result.status !== 'ok' || !result.state) fail(result.errorMessage || 'migration failed');
const s = result.state as NonNullable<typeof result.state>;
const ids = (rows: any[]) => new Set(rows.map((r) => r.id));
const projectIds = ids(s.contentProjects || []);
const seriesIds = ids(s.contentSeries || []);
const itemIds = ids(s.contentItems || []);
const channelIds = new Set<string>();

let problems: string[] = [];
for (const id of itemIds) if (!id) problems.push('empty item id');
if (ids(s.contentItems || []).size !== (s.contentItems || []).length) problems.push('duplicate item ids');

for (const item of s.contentItems || []) {
  if (!projectIds.has(item.projectId)) problems.push(`item ${item.title} -> missing project`);
  if (item.seriesId && !seriesIds.has(item.seriesId)) problems.push(`item ${item.title} -> missing series`);
  if (!item.brief?.hook) problems.push(`item ${item.title} -> empty hook`);
  if (!item.scriptText) problems.push(`item ${item.title} -> empty script`);
  if (!Array.isArray(item.shots) || item.shots.length === 0) problems.push(`item ${item.title} -> no shots`);
}
for (const pub of s.contentPublications || []) {
  if (!itemIds.has(pub.contentItemId)) problems.push(`publication -> missing item`);
  if (!pub.scheduledDateJakarta) problems.push('publication -> missing date');
}
for (const sess of s.productionSessions || []) {
  if (!Array.isArray(sess.contentItemIds)) problems.push('session -> missing items');
}

if (problems.length) fail(problems.slice(0, 10).join(' | '));

console.log(
  JSON.stringify(
    {
      migration: result.status,
      migratedFrom: result.migratedFromVersion,
      products: s.products.length,
      tasks: s.tasks.length,
      projects: s.contentProjects?.length,
      series: s.contentSeries?.length,
      items: s.contentItems?.length,
      publications: s.contentPublications?.length,
      sessions: s.productionSessions?.length,
      scheduled: s.contentItems?.filter((i) => i.targetPublishDate).length,
      formats: (s.contentItems || []).reduce<Record<string, number>>((acc, i) => {
        acc[i.format] = (acc[i.format] || 0) + 1;
        return acc;
      }, {}),
      stages: (s.contentItems || []).reduce<Record<string, number>>((acc, i) => {
        acc[i.stage] = (acc[i.stage] || 0) + 1;
        return acc;
      }, {}),
      capacity: s.creatorCapacity?.targetPostsPerWeek,
    },
    null,
    2
  )
);
