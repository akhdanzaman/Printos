import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';
const m = migratePrintOSState(fs.readFileSync('D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v4.json','utf8'));
const items = (m.state?.contentItems || []).filter((i) => (i.scriptText || '').trim());
console.log('items with scriptText:', items.length);
for (const i of items) {
  const log = (i.stageHistory || []).find((l) => l.stage === 'Script / Slides');
  console.log([i.orderIndex, i.stage, i.title, (i.scriptText || '').length + ' chars', log ? log.completedAtJakarta : 'NO LOG'].join(' | '));
}
const first = items[0];
console.log('\n--- FULL SCRIPT ---\n' + first.scriptText);
console.log('\n--- BEATS ---\n' + first.voiceOverScriptOrNotes);
