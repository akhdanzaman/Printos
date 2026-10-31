# Hermes Bridge — PrintOS

Menghubungkan aplikasi PrintOS yang sudah di-deploy dengan Hermes, supaya Hermes bisa **membaca** workspace dan **menambahkan** task/konten/publikasi atas perintahmu.

Bukan realtime sync. Ini **snapshot store** dengan token: kamu (atau Hermes, saat kamu menyuruh) mengirim/menarik satu snapshot JSON.

## Model izin

| Aksi | Siapa | Syarat |
|---|---|---|
| Baca workspace | Hermes | `GET` + bearer token |
| Tambah task / konten / publikasi | Hermes | perintah eksplisit + `--yes` di CLI |
| Terapkan perubahan ke aplikasi | Kamu | tombol **Tarik dari Hermes**, lalu **Terapkan** |
| Kirim state terbaru ke bridge | Kamu | tombol **Kirim ke Hermes** |

Hermes tidak punya akses ke localStorage browser-mu. Ia hanya melihat apa yang terakhir kamu kirim ke bridge. Setiap penambahan Hermes masuk sebagai draft dan baru muncul di aplikasi setelah kamu menariknya.

## 1. Token

Sudah dibuat dan terpasang sebagai `PRINTOS_API_TOKEN` (Production, Preview, Development).
Salinan lokal ada di `.env.bridge.local` (gitignored) — pakai nilai yang sama di panel aplikasi dan di CLI Hermes.

Kalau perlu merotasi: buat nilai baru dengan `openssl rand -hex 32`, ganti env di Vercel, lalu tempel ulang di panel.

## 2. Penyimpanan (sudah terpasang: Vercel Blob)

Project `printos` sudah memakai **Vercel Blob privat** (`printos-bridge`, region `sin1`):
`BLOB_STORE_ID` + `BLOB_READ_WRITE_TOKEN` sudah ada di environment, dan endpoint memakai OIDC saat berjalan di Vercel.
Tidak ada langkah tambahan yang diperlukan. Dua opsi di bawah hanya relevan kalau kamu ingin pindah penyimpanan.



### Opsi A — Upstash Redis (alternatif)

1. Buat database Redis di https://console.upstash.com (region Singapore bila tersedia).
2. Salin **UPSTASH_REDIS_REST_URL** dan **UPSTASH_REDIS_REST_TOKEN**.
3. Tidak perlu membuat key; bridge menulis `printos:workspace:v1` sendiri.

### Opsi B — GitHub repo sebagai penyimpanan

1. Buat fine-grained PAT dengan akses **Contents: Read and write** hanya ke repo Printos.
2. Set:
   - `PRINTOS_GITHUB_TOKEN`
   - `PRINTOS_GITHUB_REPO` → `akhdanzaman/Printos`
   - `PRINTOS_GITHUB_PATH` (opsional, default `hermes/printos-workspace.json`)

Bridge akan membuat/menimpa satu file JSON. Riwayat commit menjadi audit trail perubahan Hermes.

## 3. Environment di Vercel (sudah dilakukan)

Tambahkan di **Settings → Environment Variables** (Production + Preview):

```
PRINTOS_API_TOKEN=<token dari langkah 1>
UPSTASH_REDIS_REST_URL=https://…upstash.io
UPSTASH_REDIS_REST_TOKEN=…
# atau
PRINTOS_GITHUB_TOKEN=…
PRINTOS_GITHUB_REPO=akhdanzaman/Printos
```

Opsional, kalau CLI memanggil dari origin lain (bukan browser): `PRINTOS_ALLOWED_ORIGIN`.

Redeploy setelah menambah env.

## 4. Hubungkan aplikasi

1. Buka PrintOS → sidebar bawah → **Hermes Bridge**.
2. URL sudah terisi otomatis (`https://<domain>/api/workspace`).
3. Tempel token → **Simpan di perangkat ini** → **Uji koneksi**.
4. Klik **Kirim ke Hermes** untuk membuat snapshot pertama. Tanpa langkah ini Hermes belum punya data.
5. Setelah Hermes menambah sesuatu, klik **Tarik dari Hermes** → periksa ringkasan → **Terapkan**.
   Penggabungan bersifat menambah; data lokal yang tidak ada di remote tetap aman, dan state sebelum penggabungan dibackup ke `localStorage`.

## 5. Dipakai dari Hermes (CLI)

```bash
export PRINTOS_BRIDGE_URL="https://<domain>/api/workspace"
export PRINTOS_API_TOKEN="<token>"

node tools/printos-hermes.mjs status
node tools/printos-hermes.mjs read --out /tmp/printos.json
node tools/printos-hermes.mjs add-task --title "Riset taman Jakarta Timur" --due 2026-11-01 --yes
node tools/printos-hermes.mjs add-content --title "Ide: MRT tanpa tujuan" --format short_video --pillar personal --yes
node tools/printos-hermes.mjs add-publication --content-id cnt-… --channel TikTok --date 2026-11-02 --time 19:30 --yes
node tools/printos-hermes.mjs stage --content-id cnt-… --stage QC --yes
node tools/printos-hermes.mjs log-stage --content-id cnt-… --stage Brief \
  --output '{"keyMessage":"Tempat gratis itu ada","callToAction":"Simpan daftar","duration":"24"}' \
  --advance --yes
```

Semua perintah tulis menolak jalan tanpa `--yes`. Itu lapisan izin kedua, selain kamu yang memang harus menyuruh Hermes.

### Aksi bertipe (Phase 2)

Tiga aksi kecil yang hanya menyentuh satu koleksi, jadi agent tidak perlu mengirim ulang seluruh
workspace:

| Aksi | Payload inti | Koleksi |
|---|---|---|
| `add-research` | `title`, `sourcePlatform`, `researchType`, `pillar`, `coreFinding` | `contentResearchNotes` |
| `update-research` | `researchId` + field yang berubah (`decision`, `testOutcome`, `timesUsed`, …) | `contentResearchNotes` |
| `update-metric` | `contentItemId`, `publicationId`, `channel`, `window`, angka metrik | `metricSnapshots` |

Kirim `requestId` (string apa pun yang unik per percobaan) dan pengulangan request yang sama tidak
akan menduplikasi data: server menyimpan ledger `bridgeRequests` (maksimal 200 entri) dan
mengembalikan record yang sudah ada dengan `deduped: true`.

```bash
node tools/printos-hermes.mjs add-research --title "Komentar minta rute malam" \
  --platform TikTok --type Audience --pillar personal --finding "Penonton menanyakan rute malam" \
  --request-id req-2026-10-31-01 --yes
```

Angka metrik boleh `null` (belum diketahui) dan tidak diubah menjadi 0.

### Stage log (gembok per tahap)

Setiap stage punya output wajib, dan `log-stage` mencatatnya:

| Field | Isi |
|---|---|
| `stage` | salah satu dari 11 stage (`Strategy` … `Review & Repurpose`) |
| `output` | objek field stage, mis. `keyMessage`, `script`, `shotPlan`, `finalFileName`, `lesson` |
| `advance` | `true` → item pindah ke stage berikutnya setelah log ditulis |
| `actor` | `agent` (default dari CLI) atau `user` |
| `overrideReason` | wajib kalau `output` kosong; tercatat di log sebagai override |

Log ditulis dengan timestamp `YYYY-MM-DD HH:mm WIB`, tidak menimpa log stage lain, dan tampil di tab **0. Progress & Log** pada kartu konten. Bridge tidak memvalidasi aturan field yang detail (itu tugas UI), tapi menolak stage tak dikenal dan output kosong tanpa alasan.

## 6. Batasan yang disengaja

- Tidak ada auto-publish: `Published` hanya lewat konfirmasi manual di aplikasi.
- Tidak ada sinkronisasi realtime antar perangkat; tetap satu snapshot per revisi.
- Bridge menyimpan workspace yang kamu kirim, termasuk data printing. Jangan aktifkan bridge di deployment publik tanpa token.
- Ukuran snapshot dibatasi 4 MB (gambar produk berupa data URL ikut terhitung). Kalau melewati batas, kecilkan gambar sebelum push.
- Token hanya di localStorage perangkat; tidak ikut JSON export, Google Sheets, atau log CLI.

## 7. Kalau bermasalah

| Gejala | Penyebab umum |
|---|---|
| 401 Token tidak valid | Token CLI ≠ `PRINTOS_API_TOKEN` di Vercel, atau env belum di-redeploy |
| 503 Bridge belum dikonfigurasi | `PRINTOS_API_TOKEN` belum diset |
| 503 Penyimpanan bridge belum diset | Upstash/GitHub env kosong, dan berjalan di Vercel (bukan lokal) |
| 404 Snapshot belum ada | Belum pernah klik **Kirim ke Hermes** |
| 409 Snapshot kosong | Sama seperti di atas |
| 400 koleksi wajib hilang | Payload PUT bukan workspace PrintOS yang sah |
