import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';
import { validateGate } from '../src/utils/contentStageGates';

const pack =
  process.argv[2] ||
  'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v4.json';
const migrated = migratePrintOSState(fs.readFileSync(pack, 'utf8'));
if (!migrated.state) throw new Error('migration failed');
const items = migrated.state.contentItems || [];

let pass = 0;
let blocked = 0;
const failures: string[] = [];
const samples: unknown[] = [];

for (const item of items) {
  const history = item.stageHistory || [];
  // every completed stage must still pass
  for (const log of history) {
    const problems = validateGate(item, log.stage, log.output || {});
    if (problems.length) failures.push(`${item.title} / ${log.stage}: ${problems.join(', ')}`);
  }
  if (item.stage === 'Script / Slides') {
    const draft = { script: item.scriptText, beatNotes: item.voiceOverScriptOrNotes };
    const problems = validateGate(item, 'Script / Slides', draft);
    if (problems.length) blocked += 1;
    else pass += 1;
  }
  if (samples.length < 2 && item.stage === 'Shot List') {
    samples.push({ title: item.title, script: item.scriptText, beats: item.voiceOverScriptOrNotes });
  }
}

const byStage = items.reduce<Record<string, number>>((acc, i) => {
  acc[i.stage] = (acc[i.stage] || 0) + 1;
  return acc;
}, {});

console.log(
  JSON.stringify(
    {
      pack: pack.split('/').pop(),
      items: items.length,
      byStage,
      completedStageGateFailures: failures.length,
      failureSamples: failures.slice(0, 3),
      scriptStagePass: pass,
      scriptStageBlocked: blocked,
      emptyScripts: items.filter((i) => !(i.scriptText || '').trim()).length,
      echoScripts: items.filter(
        (i) =>
          (i.scriptText || '').replace(/\s+/g, ' ').trim() ===
          `${i.brief.hook} ${i.brief.keyMessage}`.replace(/\s+/g, ' ').trim()
      ).length,
      sample: samples[0],
    },
    null,
    2
  )
);
