import fs from 'node:fs';

const packPath = 'D:/Project/hobi/Hermes/printos-creator/content-packs/printos-content-pack-v2.json';
const outPath = 'D:/Project/hobi/Hermes/printos-creator/content-packs/RENCANA-KONTEN-v2.md';
const s = JSON.parse(fs.readFileSync(packPath, 'utf8'));

const projectById = new Map(s.contentProjects.map((p: any) => [p.id, p]));
const seriesById = new Map(s.contentSeries.map((x: any) => [x.id, x]));
const items = [...s.contentItems].sort((a: any, b: any) => a.orderIndex - b.orderIndex);
const pubs = s.contentPublications;

const lines: string[] = [];
const push = (line = '') => lines.push(line);

push('# Rencana Konten PrintOS — v1');
push('');
push(`Dibuat ${new Date().toISOString().slice(0, 10)} · ${items.length} ide · ${s.contentSeries.length} series · ${s.contentProjects.length} project · ${pubs.length} publikasi · ${s.productionSessions.length} sesi produksi.`);
push('');
push('Semua ide di bawah ini **bahan mentah**. Tugasmu: tandai yang dipakai, hapus sisanya. ');
push('Tidak ada kewajiban memproduksi 150 ide — pack ini ada supaya kamu tidak pernah kehabisan bahan.');
push('');
push('## Cara pakai');
push('');
push('1. Di PrintOS: **Backup JSON** dulu (siapa tahu ada data lama).');
push('2. **Import JSON** → pilih `printos-content-pack-v1.json` → periksa ringkasan → terapkan.');
push('3. Import ini **mengosongkan** produk/task/filament/order/finance dan menggantinya dengan rencana konten.');
push('4. Buka Content Studio → filter per series → hapus/arsipkan yang tidak perlu.');
push('5. Untuk 12 ide pertama, pakai **Generate tasks** supaya muncul di Tasks & Schedule.');
push('');
push('## Aturan operasi');
push('');
push('| Aturan | Nilai |');
push('| --- | --- |');
push('| Kapasitas | Senin–Jumat 19.00–22.00, akhir pekan 10 jam |');
push('| Target tayang | 3 per minggu (Senin, Rabu, Jumat 19.30–20.00 WIB) |');
push('| Produksi | 1 outing Sabtu pagi → 3 short + 1 carousel |');
push('| Libur | Kamis tidak produksi |');
push('| Publikasi | Manual; status Published hanya setelah URL diisi |');
push('| Metrik | Snapshot 24 jam dan 7 hari, tidak dijumlahkan |');
push('');

for (const project of s.contentProjects) {
  push(`## ${project.name}`);
  push('');
  push(`**Audiens:** ${project.targetAudience}`);
  push('');
  push(`**Angle:** ${project.coreAngle}`);
  push('');
  const seriesList = s.contentSeries.filter((x: any) => x.projectId === project.id);
  for (const series of seriesList) {
    const rows = items.filter((i: any) => i.seriesId === series.id);
    if (!rows.length) continue;
    push(`### ${series.name} — ${rows.length} ide`);
    push('');
    push(`*${series.description}* · ${series.cadenceLabel} · ${series.defaultChannels.join(', ')}`);
    push('');
    push('| # | Judul | Format | Hook | Tayang |');
    push('| --- | --- | --- | --- | --- |');
    rows.forEach((item: any, idx: number) => {
      const fmt = item.format === 'short_video' ? 'Short' : item.format === 'carousel' ? 'Carousel' : item.format === 'cerpen' ? 'Cerpen' : 'Vlog';
      const date = item.targetPublishDate || '—';
      push(`| ${idx + 1} | ${item.title.replace(/\|/g, '/')} | ${fmt} | ${item.brief.hook.replace(/\|/g, '/')} | ${date} |`);
    });
    push('');
  }
}

push('## Catatan progress');push('');push('Semua 150 item sudah punya isi untuk stage Strategy dan Idea & Research Bank (actor: agent). Stage saat ini: Brief — langkah berikutnya menulis brief per item.');push('');push('## 12 ide pertama yang sudah masuk kalender');
push('');
push('| Tanggal | Judul | Series |');
push('| --- | --- | --- |');
items
  .filter((i: any) => i.targetPublishDate)
  .sort((a: any, b: any) => a.targetPublishDate.localeCompare(b.targetPublishDate))
  .slice(0, 12)
  .forEach((item: any) => {
    push(`| ${item.targetPublishDate} | ${item.title.replace(/\|/g, '/')} | ${(seriesById.get(item.seriesId) as any)?.name || '—'} |`);
  });
push('');
push('## Yang belum ada di pack ini');
push('');
push('- Angka harga/jam buka: setiap item punya catatan "verifikasi sebelum tayang". Itu sengaja.');
push('- Aset (klip/VO): kolom aset kosong; diisi setelah kamu benar-benar merekam.');
push('- Metrik: kosong sampai ada publikasi nyata.');
push('- Kontrak/rate card: belum relevan sebelum ada penawaran.');
push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(JSON.stringify({ outPath, bytes: fs.statSync(outPath).size, lines: lines.length }, null, 2));
