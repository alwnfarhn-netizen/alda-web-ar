# ALDA - Augmented Reality Learning for Students with Autism

ALDA adalah media visual support berbasis Augmented Reality (AR) yang dirancang untuk membantu siswa autis sekolah dasar mengenali dan memahami ekspresi wajah emosi melalui interaksi kartu fisik.

🚀 **[Lihat Demo Live di GitHub Pages](https://USERNAME.github.io/ALDA/)**
*(Ganti USERNAME dengan username GitHub Anda)*

## 📱 Cara Penggunaan
1. Buka URL demo di browser smartphone Anda.
2. Klik tombol **"Izinkan"** saat browser meminta akses kamera.
3. Arahkan kamera ponsel ke kartu emosi ALDA.
4. Lihat animasi wajah 3D muncul dan dengarkan suara emosi yang sesuai.

## 🛠️ Tech Stack
- **MindAR.js**: Library AR untuk web (Image Tracking).
- **Three.js**: Engine 3D untuk merender model dan animasi.
- **Howler.js**: Manajemen audio lintas browser.
- **GitHub Actions**: Deployment otomatis ke GitHub Pages.

## 🌐 Browser yang Didukung
- **Android**: Google Chrome (Sangat Direkomendasikan)
- **iOS**: Safari (Versi terbaru)
- **Umum**: Browser apapun yang mendukung WebGL dan WebRTC (Kamera API) melalui HTTPS.

## 📁 Struktur Proyek
- `/index.html`: Halaman utama aplikasi.
- `/assets/`: Berisi model 3D (`.glb`), audio (`.mp3`), dan marker (`.mind`).
- `/js/`: Logika AR (`main.js`) dan konfigurasi emosi (`emotions.js`).
- `/css/`: Stylesheet khusus yang ramah autisme.

## 📝 Lisensi
Proyek ini dikembangkan untuk tujuan edukasi inklusif.
