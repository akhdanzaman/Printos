import fs from 'node:fs';
import { migratePrintOSState } from '../src/utils/contentStudio';
import { serializeStateToSheetRows } from '../src/services/spreadsheetService';

const raw = fs.readFileSync(
  'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v2.json',
  'utf8'
);
const migrated = migratePrintOSState(raw);
if (!migrated.state) throw new Error('migration failed');

const { contentRows } = serializeStateToSheetRows(migrated.state);
const headerIndex = contentRows.findIndex((r) => r[0] === '=== STAGE PROGRESS LOG ===');
const logRows = contentRows.slice(headerIndex + 1);

console.log(
  JSON.stringify(
    {
      totalContentRows: contentRows.length,
      fitsInClearRange: contentRows.length < 5000,
      stageHeaderAt: headerIndex,
      stageLogRows: logRows.length,
      distinctContentIdsInLog: new Set(logRows.map((r) => r[0])).size,
      firstLogRow: logRows[0],
      lastLogRow: logRows[logRows.length - 1],
    },
    null,
    2
  )
);
