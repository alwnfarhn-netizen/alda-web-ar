/**
 * Konfigurasi Emosi ALDA
 *
 * CATATAN TESTING:
 * targets.mind saat ini menggunakan sample dari MindAR (band-example, 4 target).
 * markerIndex 0–3 sesuai dengan gambar di halaman scan-test.html.
 *
 * Untuk produksi: kompilasi kartu emosi asli di
 * https://hiukim.github.io/mind-ar-js-doc/tools/compile/
 * dan tambahkan kembali markerIndex 4 untuk "terkejut".
 */
const emotions = {
  senang: {
    id: "senang",
    label: "Senang",
    modelPath: "assets/models/senang.glb",
    audioPath: "assets/audio/senang.mp3",
    markerIndex: 0,
    color: "#FFD166"
  },
  sedih: {
    id: "sedih",
    label: "Sedih",
    modelPath: "assets/models/sedih.glb",
    audioPath: "assets/audio/sedih.mp3",
    markerIndex: 1,
    color: "#74B9FF"
  },
  marah: {
    id: "marah",
    label: "Marah",
    modelPath: "assets/models/marah.glb",
    audioPath: "assets/audio/marah.mp3",
    markerIndex: 2,
    color: "#FF7675"
  },
  takut: {
    id: "takut",
    label: "Takut",
    modelPath: "assets/models/takut.glb",
    audioPath: "assets/audio/takut.mp3",
    markerIndex: 3,
    color: "#A29BFE"
  },
  terkejut: {
    id: "terkejut",
    label: "Terkejut",
    modelPath: "assets/models/terkejut.glb",
    audioPath: "assets/audio/terkejut.mp3",
    markerIndex: 4,
    color: "#00b894"
  }
};

export default emotions;
