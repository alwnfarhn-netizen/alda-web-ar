import { MindARThree } from 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.2/dist/mindar-image-three.prod.js';
import emotions from './emotions.js';

/**
 * ALDA - Main AR Logic
 * Menggunakan MindAR.js dan Three.js
 *
 * Versi ini menerapkan seluruh perbaikan dari Audit Report:
 * E1, E2, E3, E4  — crash fixes
 * W1, W2, W3, W4  — edge-case fixes
 * P1, P2, P3      — performance fixes
 * A1, A3, A5      — accessibility fixes
 */

// [E1 Fix] Tunggu semua resource global siap sebelum init, bukan langsung saat DOMContentLoaded.
// THREE & Howler diload via <script> di <head>; module dieksekusi SETELAH script sync selesai,
// sehingga window.THREE dan window.Howl sudah pasti tersedia saat module berjalan.
const THREE  = window.THREE;
const Howler = window.Howler;

// Validasi awal — berikan error yang jelas jika dependency CDN gagal load
if (!THREE)   console.error('[ALDA] Three.js gagal dimuat dari CDN.');
if (!Howler)  console.error('[ALDA] Howler.js gagal dimuat dari CDN.');

// ─── Runtime state (terpisah dari konfigurasi di emotions.js) ─────────────────
// [W6 Fix] State runtime TIDAK disimpan ke objek emotions (config module) untuk
// menghindari pencampuran konfigurasi dengan state dan kebocoran antar sesi.
const runtimeState = {}; // key: emotionId → { mixer, animations }

// Cache texture placeholder agar tidak dibuat ulang setiap kali [P2 Fix]
const placeholderTextureCache = {};

document.addEventListener('DOMContentLoaded', () => {
    const loadingScreen     = document.getElementById('loading-screen');
    const loadingMsg        = document.getElementById('loading-msg');
    const emotionLabel      = document.getElementById('emotion-label');
    const scanningIndicator = document.getElementById('scanning-indicator');
    const container         = document.querySelector('#container');

    const urlParams       = new URLSearchParams(window.location.search);
    const targetEmotionId = urlParams.get('emosi');

    let mindarThree   = null;
    let audioInstances = {};
    let mixers         = [];
    let placeholders   = [];
    let clock          = new THREE.Clock();
    let isMuted        = false;
    let audioUnlocked  = false;

    // Hitung jumlah marker yang sedang aktif (untuk W2 Fix)
    let activeMarkerCount = 0;

    // ─── Helper: Update teks loading screen ─────────────────────────────────────
    function setLoadingMsg(text) {
        if (loadingMsg) loadingMsg.textContent = text;
    }

    // ─── Inisialisasi Sistem AR ──────────────────────────────────────────────────
    const initAR = async () => {
        try {
            setLoadingMsg('Menyiapkan audio...');
            initAudio();

            setLoadingMsg('Memeriksa kamera...');
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Browser Anda tidak mendukung akses kamera atau Anda tidak menggunakan HTTPS.');
            }

            if (!MindARThree) {
                throw new Error('Library MindAR gagal dimuat. Periksa koneksi internet Anda.');
            }

            // [E2/E3 Fix] GLTFLoader diinjeksi ke THREE.GLTFLoader oleh script CDN di head.
            // Pengecekan yang benar: typeof THREE.GLTFLoader === 'function'
            const gltfLoaderAvailable = typeof THREE?.GLTFLoader === 'function';
            if (!gltfLoaderAvailable) {
                console.warn('[ALDA] GLTFLoader tidak tersedia. Semua model akan diganti placeholder.');
            }

            setLoadingMsg('Memulai AR...');
            mindarThree = new MindARThree({
                container:        container,
                imageTargetSrc:   'assets/markers/targets.mind',
                uiLoading:        'no',
                uiScanning:       'no',
            });

            const { renderer, scene, camera } = mindarThree;

            // Sesuaikan teks panduan jika ada parameter emosi di URL
            if (targetEmotionId && emotions[targetEmotionId]) {
                const indicatorText = scanningIndicator?.querySelector('p');
                if (indicatorText) {
                    indicatorText.innerText = `Arahkan kamera ke kartu ${emotions[targetEmotionId].label}`;
                }
            }

            renderer.setClearColor(new THREE.Color(), 0);

            // Pencahayaan
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            scene.add(ambientLight);
            const directLight = new THREE.DirectionalLight(0xffffff, 0.5);
            directLight.position.set(0, 1, 1);
            scene.add(directLight);

            // Setup Anchors & Model
            Object.values(emotions).forEach((config) => {
                const anchor = mindarThree.addAnchor(config.markerIndex);

                // [P3 Fix] Model di-load di background; audio di-preload HANYA saat marker found (lazy)
                loadEmotionModel(config, anchor, gltfLoaderAvailable);

                anchor.onTargetFound = () => {
                    activeMarkerCount++;
                    console.log(`[ALDA] Terdeteksi: ${config.label} (aktif: ${activeMarkerCount})`);

                    if (scanningIndicator) scanningIndicator.style.display = 'none';

                    anchor.group.children.forEach(child => { child.visible = true; });
                    playEmotionAnimation(config.id);

                    emotionLabel.textContent = config.label;
                    emotionLabel.style.backgroundColor = config.color + 'D9';
                    emotionLabel.classList.add('visible');

                    // [W1 Fix] Coba unlock audio sekarang + langsung play jika sudah unlock
                    ensureAudioUnlocked(() => {
                        playEmotionAudio(config.id);
                    });
                };

                anchor.onTargetLost = () => {
                    activeMarkerCount = Math.max(0, activeMarkerCount - 1);
                    console.log(`[ALDA] Hilang: ${config.label} (aktif: ${activeMarkerCount})`);

                    anchor.group.children.forEach(child => { child.visible = false; });
                    stopEmotionAnimation(config.id);
                    emotionLabel.classList.remove('visible');
                    stopAllAudio();

                    // [W2 Fix] Tampilkan indikator HANYA jika tidak ada marker lain yang aktif
                    if (activeMarkerCount === 0 && scanningIndicator) {
                        scanningIndicator.style.display = 'flex';
                    }
                };
            });

            setLoadingMsg('Menghubungkan kamera...');
            await mindarThree.start();

            // [E4 Fix] Null-check sebelum manipulasi loadingScreen
            if (loadingScreen) loadingScreen.style.display = 'none';
            console.log('[ALDA] AR Ready');

            renderer.setAnimationLoop(() => {
                const delta = clock.getDelta();
                mixers.forEach(mixer => mixer.update(delta));
                placeholders.forEach(p => {
                    if (p.visible) p.rotation.y += 0.01;
                });
                renderer.render(scene, camera);
            });

        } catch (error) {
            handleInitError(error);
        }
    };

    // ─── Audio Init ──────────────────────────────────────────────────────────────
    // [E1 Fix] window.Howl diambil dari scope luar (setelah module eval), bukan dari DOMContentLoaded.
    function initAudio() {
        const Howl = window.Howl;
        if (!Howl) {
            console.error('[ALDA] Howl tidak tersedia — audio dinonaktifkan.');
            return;
        }

        // [P3 Fix] preload: false — audio hanya akan dimuat saat pertama kali diputar (lazy loading)
        // [W3 Fix] Fallback OGG dibuat hanya jika path berekstensi .mp3
        Object.values(emotions).forEach(config => {
            const src = [config.audioPath];
            if (config.audioPath.endsWith('.mp3')) {
                src.push(config.audioPath.slice(0, -4) + '.ogg');
            }

            try {
                audioInstances[config.id] = new Howl({
                    src,
                    volume:   0.8,
                    loop:     false,
                    preload:  false, // [P3 Fix] lazy load
                    onloaderror: (_id, error) => {
                        console.warn(`[ALDA] Gagal load audio ${config.id}:`, error);
                    }
                });
            } catch (e) {
                console.warn(`[ALDA] Error init Howl untuk ${config.id}:`, e);
            }
        });

        // Mute Button — update ikon + label teks terpisah [A1 Fix]
        const muteBtn   = document.getElementById('mute-btn');
        const muteIcon  = document.getElementById('mute-icon');
        const muteLabel = document.getElementById('mute-label');

        if (muteBtn) {
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                isMuted = !isMuted;
                Howler.mute(isMuted);

                if (muteIcon)  muteIcon.textContent  = isMuted ? '🔇' : '🔊';
                if (muteLabel) muteLabel.textContent  = isMuted ? 'Aktifkan Suara' : 'Matikan Suara';
                muteBtn.setAttribute('aria-label', isMuted ? 'Aktifkan suara' : 'Matikan suara');
                muteBtn.classList.toggle('muted', isMuted);

                if (!audioUnlocked) unlockAudioContext();
            });
        }

        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => window.location.reload());
        }
    }

    // ─── Audio Unlock ────────────────────────────────────────────────────────────
    // [W1 Fix] ensureAudioUnlocked: dipanggil saat marker pertama kali found,
    // lalu callback dipanggil setelah unlock berhasil (atau langsung jika sudah unlock).
    function ensureAudioUnlocked(callback) {
        if (audioUnlocked) {
            callback();
            return;
        }
        unlockAudioContext(callback);
    }

    function unlockAudioContext(callback) {
        if (audioUnlocked) {
            if (callback) callback();
            return;
        }

        const Howl = window.Howl;
        if (!Howl) return;

        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume();
        }

        // [W4 Fix] Silent buffer — listener dihapus setelah unlock BAIK via onplay MAUPUN onerror
        const cleanup = () => {
            audioUnlocked = true;
            console.log('[ALDA] Audio unlocked');
            if (callback) callback();
        };

        try {
            const silent = new Howl({
                src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='],
                volume: 0,
                onplay:  cleanup,
                onloaderror: (_id, _err) => cleanup(), // [W4 Fix] Pastikan unlock walau data URI gagal
                onplayerror: (_id, _err) => cleanup(),
            });
            silent.play();
        } catch (e) {
            // Jika Howl sendiri throw, tetap set unlocked agar tidak block selamanya
            cleanup();
        }
    }

    // ─── Audio Playback ──────────────────────────────────────────────────────────
    function playEmotionAudio(emotionId) {
        if (isMuted) return;

        try {
            stopAllAudio();
            const sound = audioInstances[emotionId];
            if (!sound) return;

            // Jika belum loaded, Howler akan load otomatis karena preload:false
            sound.play();
        } catch (e) {
            console.error(`[ALDA] Gagal memutar audio ${emotionId}:`, e);
        }
    }

    function stopAllAudio() {
        Object.values(audioInstances).forEach(sound => {
            if (sound) sound.stop();
        });
    }

    // ─── Model Loading ───────────────────────────────────────────────────────────
    function loadEmotionModel(emotion, anchor, gltfAvailable) {
        // [E2/E3 Fix] Cek yang benar menggunakan typeof === 'function'
        if (!gltfAvailable) {
            const placeholder = createPlaceholderFace(emotion.id);
            placeholder.name = 'placeholder';
            placeholders.push(placeholder);
            anchor.group.add(placeholder);
            return;
        }

        const loader = new THREE.GLTFLoader();

        loader.load(
            emotion.modelPath,
            (gltf) => {
                const model = gltf.scene;
                model.name = 'gltf-model';
                model.scale.set(0.4, 0.4, 0.4);
                model.position.set(0, 0.1, 0);

                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    // [W6 Fix] Simpan state runtime ke runtimeState, bukan ke objek emotion config
                    runtimeState[emotion.id] = { mixer, animations: gltf.animations };
                    mixers.push(mixer);
                }

                model.visible = false;
                anchor.group.add(model);
                console.log(`[ALDA] Model ${emotion.id} dimuat.`);
            },
            undefined,
            (error) => {
                console.warn(`[ALDA] Gagal memuat model ${emotion.id}, pakai placeholder.`, error);
                const placeholder = createPlaceholderFace(emotion.id);
                placeholder.name = 'placeholder';
                placeholders.push(placeholder);
                anchor.group.add(placeholder);
            }
        );
    }

    // ─── Animasi ─────────────────────────────────────────────────────────────────
    function playEmotionAnimation(emotionId) {
        const state = runtimeState[emotionId];
        if (state?.mixer && state?.animations?.length > 0) {
            state.mixer.clipAction(state.animations[0]).reset().play();
        }
    }

    function stopEmotionAnimation(emotionId) {
        const state = runtimeState[emotionId];
        if (state?.mixer) {
            state.mixer.stopAllAction();
        }
    }

    // ─── Error Handling ───────────────────────────────────────────────────────────
    function handleInitError(error) {
        console.error('[ALDA] AR Init Error:', error);

        // [E4 Fix] Null-check sebelum manipulasi elemen
        if (!loadingScreen) return;

        const isPermissionError = error.message.includes('camera')
            || error.message.includes('permission')
            || error.message.includes('kamera');

        const userMessage = isPermissionError
            ? 'Izinkan akses kamera untuk menggunakan media ini.'
            : (error.message || 'Terjadi kesalahan tidak dikenal.');

        // [A5 Fix] Tombol error memiliki aria-label kontekstual yang jelas
        loadingScreen.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #333; max-width: 320px; margin: auto;">
                <p style="font-size: 2rem; margin: 0 0 0.5rem;">⚠️</p>
                <p><strong>Gagal Memulai AR</strong></p>
                <p style="font-size: 0.9rem; color: #555;">${userMessage}</p>
                <button
                    onclick="window.location.reload()"
                    aria-label="Coba lagi memuat aplikasi AR"
                    style="margin-top: 15px; padding: 10px 20px; border-radius: 20px;
                           border: none; background: #4a90e2; color: white;
                           font-size: 1rem; cursor: pointer;">
                    Coba Lagi
                </button>
                ${!window.isSecureContext
                    ? '<p style="font-size: 0.75rem; margin-top: 12px; color: #888;">Catatan: Web AR memerlukan koneksi HTTPS.</p>'
                    : ''}
            </div>
        `;
        loadingScreen.style.display = 'flex';
    }

    // ─── Placeholder Face (3D Primitives) ────────────────────────────────────────
    // [P1 Fix] Kurangi segmen sphere dari 32×32 → 16×16 (1/4 jumlah segitiga)
    // [P2 Fix] Cache CanvasTexture per emosi, tidak dibuat ulang setiap panggilan
    function createPlaceholderFace(emotionId) {
        const config = emotions[emotionId];
        const group  = new THREE.Group();

        try {
            // Kepala — [P1 Fix] 16,16 sudah cukup untuk placeholder
            const headGeo = new THREE.SphereGeometry(0.5, 16, 16);
            const headMat = new THREE.MeshPhongMaterial({ color: config.color });
            group.add(new THREE.Mesh(headGeo, headMat));

            // Mata
            const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const eyeMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
            const leftEye  = new THREE.Mesh(eyeGeo, eyeMat);
            leftEye.position.set(-0.2, 0.1, 0.45);
            const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
            rightEye.position.set(0.2, 0.1, 0.45);
            group.add(leftEye, rightEye);

            // Mulut
            const mouthGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1);
            const mouth = new THREE.Mesh(mouthGeo, eyeMat);
            mouth.position.set(0, -0.2, 0.45);
            group.add(mouth);

            // Label Teks — [P2 Fix] gunakan cache agar tidak buat canvas/texture baru tiap kali
            if (!placeholderTextureCache[emotionId]) {
                const canvas  = document.createElement('canvas');
                const ctx     = canvas.getContext('2d');
                canvas.width  = 256;
                canvas.height = 64;
                ctx.font      = 'Bold 40px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.fillText(config.label.toUpperCase(), 128, 45);
                placeholderTextureCache[emotionId] = new THREE.CanvasTexture(canvas);
            }

            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({ map: placeholderTextureCache[emotionId] })
            );
            sprite.position.set(0, 0.7, 0);
            sprite.scale.set(1, 0.25, 1);
            group.add(sprite);

        } catch (e) {
            console.warn('[ALDA] Gagal membuat placeholder geometry:', e);
        }

        return group;
    }

    // ─── Kick Off ─────────────────────────────────────────────────────────────────
    initAR();
});
