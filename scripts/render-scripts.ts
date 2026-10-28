import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';

const m = migratePrintOSState(
  fs.readFileSync('D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v4.json', 'utf8')
);
const items = (m.state?.contentItems || [])
  .filter((i) => (i.scriptText || '').trim())
  .sort((a, b) => a.orderIndex - b.orderIndex);

const out: string[] = ['# 12 Naskah Pertama', '', `Total ${items.length} item. Semua sudah di stage Shot List.`, ''];
for (const [n, item] of items.entries()) {
  out.push(`## ${n + 1}. ${item.title}`);
  out.push('');
  out.push(`Tanggal tayang: ${item.targetPublishDate || '—'} · Durasi: ${item.brief.estimatedDurationSec} dtk · Stage: ${item.stage}`);
  out.push('');
  out.push('```');
  out.push(item.scriptText.trim());
  out.push('```');
  out.push('');
  out.push(`**Catatan shot:** ${item.voiceOverScriptOrNotes.trim()}`);
  out.push('');
}
fs.writeFileSync('D:/Project/hobi/Hermes/printos-creator/content-packs/NASKAH-12.md', out.join('\n'), 'utf8');
console.log('written', out.length, 'lines for', items.length, 'scripts');
