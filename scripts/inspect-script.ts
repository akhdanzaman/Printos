import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';
const m = migratePrintOSState(fs.readFileSync('D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v4.json','utf8'));
const items = m.state?.contentItems || [];
for (const i of items) {
  if (i.stage === 'Script / Slides' && (i.scriptText || '').trim()) {
    console.log(i.orderIndex, JSON.stringify(i.scriptText.slice(0, 90)), '| hook:', JSON.stringify(i.brief.hook.slice(0,40)));
  }
}
