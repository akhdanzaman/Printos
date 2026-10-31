# PrintOS × Hermes — Rencana Side-by-Side

Tujuan: PrintOS, Hermes, dan kamu bekerja di **satu papan yang sama**, tanpa ritual Save/Fetch manual, tanpa data hilang, dan tanpa saya menimpa pekerjaanmu.

Prinsip yang tidak berubah:
1. Satu sumber kebenaran: snapshot di bridge (Vercel Blob), bukan localStorage, bukan Google Sheets.
2. Setiap tulisan punya aktor + waktu. Override wajib beralasan.
3. Tidak ada publish otomatis. Status `Published` hanya setelah URL diisi manusia.
4. Google Sheets = arsip yang bisa dibaca, bukan jalur sinkronisasi.

---

## Fase 1 — Auto-sync + revision guard (fondasi)

**Masalah:** sekarang aplikasi memegang state di localStorage, Hermes memegang snapshot di server, dan keduanya hanya bertemu saat kamu menekan tombol. Setiap menit di antaranya adalah peluang data hilang.

**Yang dibangun:**
- `api/workspace.js`: `PUT` menerima `expectedRevision`. Kalau tidak cocok → `409 REVISION_CONFLICT` beserta `currentRevision`, tanpa menulis apa pun.
- `src/utils/syncEngine.ts` (baru, murni, bisa dites): pull, push dengan guard, debounce 2,5 detik, deteksi konflik, status (`idle/syncing/synced/offline/conflict/unauthorized`), `resolveConflict('take-remote' | 'keep-local')`.
- `src/App.tsx`: pull saat mount + saat tab kembali fokus (throttle 30 detik), push otomatis saat state berubah, konflik tidak pernah menimpa diam-diam.
- `src/components/SyncStatusBar.tsx`: indikator revision terakhir, waktu sync, tombol jeda/aktifkan, dan dua tombol penyelesaian konflik.
- Tes: `src/utils/syncEngine.test.ts` dengan transport palsu.

**Kriteria terima:**
- Dua klien mengubah state bersamaan → yang kedua dapat 409, UI menampilkan pilihan, tidak ada tulisan yang hilang tanpa keputusan.
- Perubahan beruntun dalam 2,5 detik hanya menghasilkan satu PUT.
- Token salah → status `unauthorized`, tidak retry berlebihan.
- Tanpa token → engine diam, aplikasi tetap jalan seperti sekarang.
- Save/Fetch Google Sheets tetap berfungsi; tidak ada perubahan skema data.
- `npm run lint`, `npm test`, `npm run build` lulus.

**Non-goal fase ini:** aksi bertipe, cron brief, quick capture.

---

## Fase 2 — Aksi agent bertipe

Ganti "kirim seluruh workspace" dengan operasi kecil: `add-task`, `add-content`, `log-stage`, `add-research`, `update-metric`. Masing-masing satu record, satu audit entry, satu respons. Ini yang membuat saya bisa bekerja tanpa risiko menimpa.

**Kriteria terima:** setiap aksi punya tes, idempoten bila diulang dengan `requestId` sama, dan tidak pernah menulis koleksi lain.

## Fase 3 — Brief harian (06.30 WIB)

Cron Hermes membaca PrintOS lewat API, menyusun 5 baris: task hari ini, konten jatuh tempo, riset kedaluwarsa, satu ide dari catatan terakhir, satu pertanyaan yang belum terjawab. Dikirim ke chat/Telegram. Tanpa ini, PrintOS hanya hidup kalau kamu ingat membukanya.

**Kriteria terima:** brief terkirim < 60 detik, isinya bisa dilacak ke record asli, dan diam kalau tidak ada yang perlu dikerjakan.

## Fase 4 — Quick capture

Satu tombol di HP: tulis dua kalimat atau rekam voice note → Hermes merapikan jadi research note atau ide konten, lengkap dengan sumber dan tanggal. Target: < 20 detik dari buka sampai tersimpan.

## Fase 5 — Review mingguan otomatis

Minggu sore: Hermes menyusun draft review dari metrik + stage log + riset yang dipakai. Kamu hanya mengedit dan memutuskan lanjut/ubah/hentikan.

---

## Urutan kerja & alasan

| Fase | Dampak | Risiko | Urutan |
|---|---|---|---|
| 1 Auto-sync | besar | sedang (menyentuh penyimpanan) | pertama |
| 2 Aksi bertipe | besar | rendah | kedua |
| 3 Brief harian | sedang | rendah | ketiga |
| 4 Quick capture | sedang | rendah | keempat |
| 5 Review otomatis | kecil | rendah | terakhir |

Fase 1 dan 2 adalah syarat teknis: tanpa keduanya, fase 3–5 hanya menambah pekerjaan menyalin.

## Ukuran berhasil

- Waktu mengurus sistem per hari: < 15 menit.
- Data bentrok yang tidak terselesaikan: 0 per bulan.
- Konten tayang: 3 per minggu.

Kalau menambah fitur membuat dua angka pertama memburuk, fiturnya salah.
