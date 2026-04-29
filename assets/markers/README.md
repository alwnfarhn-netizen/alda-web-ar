# assets/markers/

Folder ini menyimpan file marker untuk aplikasi AR ALDA.

## File Saat Ini (Mode Testing)

| File | Keterangan |
|------|-----------|
| `targets.mind` | Sample marker dari MindAR (band-example, 4 target) |
| `bear-color.png` | Referensi kartu marker 0 → **Senang** |
| `raccoon-color.png` | Referensi kartu marker 1 → **Sedih** |
| `bear.png` | Referensi kartu marker 2 → **Marah** |
| `raccoon.png` | Referensi kartu marker 3 → **Takut** |
| `sample-marker.png` | Tambahan referensi (raccoon single) |

Lihat `scan-test.html` untuk tampilan kartu yang dapat dipindai.

## Untuk Produksi

1. Siapkan 5 gambar kartu emosi (senang, sedih, marah, takut, terkejut) — format PNG/JPG, resolusi 500×500px
2. Buka https://hiukim.github.io/mind-ar-js-doc/tools/compile/
3. Upload semua gambar sekaligus → klik **Start**
4. Download hasil `targets.mind` → ganti file ini
5. Aktifkan kembali emosi `terkejut` di `js/emotions.js`
