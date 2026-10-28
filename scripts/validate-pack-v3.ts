import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';
import { validateGate } from '../src/utils/contentStageGates';
import { serializeStateToSheetRows } from '../src/services/spreadsheetService';

const pack =
  process.argv[2] ||
  'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v3.json';
const migrated = migratePrintOSState(fs.readFileSync(pack, 'utf8'));
if (!migrated.state) throw new Error('migration failed');
const s = migrated.state;

const items = s.contentItems || [];
const problems: string[] = [];
const logCounts: Record<number, number> = {};
const ctas: string[] = [];
const gateFailures: string[] = [];

for (const item of items) {
  const history = item.stageHistory || [];
  logCounts[history.length] = (logCounts[history.length] || 0) + 1;

  const order = history.map((h) => h.stage);
  if (order.join(' > ') !== 'Strategy > Idea & Research Bank > Brief') {
    problems.push(`${item.title}: ${order.join(' > ')}`);
  }
  if (item.stage !== 'Script / Slides') problems.push(`${item.title}: stage ${item.stage}`);

  // Every completed stage must still pass its own gate.
  for (const log of history) {
    const found = validateGate(item, log.stage, log.output || {});
    if (found.length) gateFailures.push(`${item.title} / ${log.stage}: ${found.join(', ')}`);
  }

  const brief = history.find((h) => h.stage === 'Brief');
  if (brief) {
    ctas.push(brief.output.callToAction || '');
    if (!brief.output.duration) problems.push(`${item.title}: no duration`);
  }
}

const dupes = (arr: string[]) => arr.length - new Set(arr).size;
const { contentRows } = serializeStateToSheetRows(s);
const headerIndex = contentRows.findIndex((r) => r[0] === '=== STAGE PROGRESS LOG ===');

console.log(
  JSON.stringify(
    {
      pack: pack.split('/').pop(),
      items: items.length,
      logCounts,
      stages: items.reduce<Record<string, number>>((acc, i) => {
        acc[i.stage] = (acc[i.stage] || 0) + 1;
        return acc;
      }, {}),
      duplicateCTAs: dupes(ctas),
      emptyCTA: ctas.filter((c) => c.trim().length < 5).length,
      gateFailures: gateFailures.length,
      gateFailureSamples: gateFailures.slice(0, 5),
      integrityProblems: problems.slice(0, 5),
      sheetRows: contentRows.length,
      sheetStageLogRows: contentRows.slice(headerIndex + 1).length,
      sample: items[0]
        ? {
            title: items[0].title,
            brief: (items[0].stageHistory || []).find((h) => h.stage === 'Brief')?.output,
            at: (items[0].stageHistory || []).find((h) => h.stage === 'Brief')?.completedAtJakarta,
          }
        : null,
    },
    null,
    2
  )
);
