import emotions from './emotions.js';

/**
 * ALDA - Main AR Logic
 * Menggunakan MindAR.js dan Three.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // Dependencies global dari CDN
    const THREE = window.THREE;
    const MINDAR = window.MINDAR;
    const Howl = window.Howl;

    const loadingScreen = document.getElementById('loading-screen');
    const emotionLabel = document.getElementById('emotion-label');
    const scanningIndicator = document.getElementById('scanning-indicator');
    const container = document.querySelector("#container");

    // Ambil parameter emosi dari URL (jika ada)
    const urlParams = new URLSearchParams(window.location.search);
    const targetEmotionId = urlParams.get('emosi');

    let mindarThree = null;
    let audioInstances = {}; // Menyimpan instance Howl per emosi
    let mixers = []; // Menyimpan AnimationMixer untuk update frame
    let placeholders = []; // Menyimpan model placeholder untuk rotasi
    let clock = new THREE.Clock(); // Untuk delta time animasi
    let isMuted = false;
    let audioUnlocked = false; // Workaround autoplay browser

    /**
     * Inisialisasi Sistem AR
     */
    const initAR = async () => {
        try {
            // 0. Setup Audio Objects
            initAudio();

            // 1. Validasi Browser & Kamera
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Browser Anda tidak mendukung akses kamera atau Anda tidak menggunakan HTTPS.");
            }

            if (!MINDAR || !MINDAR.IMAGE) {
                throw new Error("Library MindAR gagal dimuat. Periksa koneksi internet Anda.");
            }

            if (!THREE.GLTFLoader) {
                console.warn("GLTFLoader tidak ditemukan di namespace THREE. Pastikan script loader sudah terpasang.");
            }

            // 2. Setup MindAR Three.js
            mindarThree = new MINDAR.IMAGE.MindARThree({
                container: container,
                imageTargetSrc: 'assets/markers/targets.mind',
                uiLoading: "no", // Kita gunakan UI loading buatan sendiri
                uiScanning: "yes",
            });

            const { renderer, scene, camera } = mindarThree;

            // Jika ada parameter emosi, sesuaikan teks panduan
            if (targetEmotionId && emotions[targetEmotionId]) {
                const indicatorText = scanningIndicator.querySelector('p');
                if (indicatorText) {
                    indicatorText.innerText = `Arahkan kamera ke kartu ${emotions[targetEmotionId].label}`;
                }
            }

            // Renderer setup (alpha true sudah default di MindARThree, tapi kita pastikan)
            renderer.setClearColor(new THREE.Color(), 0); 

            // 3. Pencahayaan
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
            scene.add(ambientLight);
            const directLight = new THREE.DirectionalLight(0xffffff, 0.5);
            directLight.position.set(0, 1, 1);
            scene.add(directLight);

            // 4. Setup Anchors & Model untuk setiap Emosi
            const activeModels = [];
            
            Object.values(emotions).forEach((config) => {
                const anchor = mindarThree.addAnchor(config.markerIndex);
                
                // 1. Coba load model GLTF (Asinkron)
                loadEmotionModel(config, anchor);

                // Event: Marker Ditemukan
                anchor.onTargetFound = () => {
                    console.log(`Terdeteksi: ${config.label}`);
                    
                    // Sembunyikan indikator scan
                    if (scanningIndicator) scanningIndicator.style.display = 'none';

                    // Tampilkan model (baik GLTF maupun placeholder)
                    anchor.group.children.forEach(child => child.visible = true);
                    
                    // Mainkan animasi jika ada mixer
                    playEmotionAnimation(config);

                    // Tampilkan UI Label dengan warna pastel
                    emotionLabel.innerText = config.label;
                    emotionLabel.style.backgroundColor = config.color + 'D9'; // Opacity 0.85 (D9 hex)
                    emotionLabel.classList.add('visible');
                    
                    // Play Audio
                    playEmotionAudio(config.id);
                };

                // Event: Marker Hilang
                anchor.onTargetLost = () => {
                    console.log(`Hilang: ${config.label}`);
                    
                    // Sembunyikan semua model di anchor ini
                    anchor.group.children.forEach(child => child.visible = false);
                    
                    // Berhenti dan reset animasi
                    stopEmotionAnimation(config);

                    // Sembunyikan Label
                    emotionLabel.classList.remove('visible');
                    
                    // Tampilkan kembali indikator scan jika tidak ada marker lain
                    // (Sederhananya kita tampilkan saja, MindAR akan mengurus jika ada marker lain)
                    if (scanningIndicator) scanningIndicator.style.display = 'flex';

                    // Stop Audio
                    stopAllAudio();
                };
            });

            // 5. Jalankan MindAR
            await mindarThree.start();
            
            // Sembunyikan loading screen saat siap
            loadingScreen.style.display = 'none';
            console.log("ALDA: AR Ready");

            // Loop Animasi
            renderer.setAnimationLoop(() => {
                const delta = clock.getDelta();
                
                // 1. Update semua AnimationMixer (untuk model GLTF)
                mixers.forEach(mixer => mixer.update(delta));

                // 2. Animasi rotasi halus untuk model placeholder (lebih efisien tanpa scene.traverse)
                placeholders.forEach(p => {
                    if (p.visible) {
                        p.rotation.y += 0.01;
                    }
                });

                renderer.render(scene, camera);
            });

        } catch (error) {
            handleInitError(error);
        }
    };

    /**
     * Inisialisasi objek audio Howl untuk setiap emosi
     */
    function initAudio() {
        Object.values(emotions).forEach(config => {
            try {
                audioInstances[config.id] = new Howl({
                    src: [config.audioPath, config.audioPath.replace('.mp3', '.ogg')],
                    volume: 0.8,
                    loop: false,
                    preload: true,
                    onloaderror: (id, error) => {
                        console.warn(`Gagal load audio ${config.id}:`, error);
                    }
                });
            } catch (e) {
                console.warn(`Error init Howl untuk ${config.id}:`, e);
            }
        });

        // Setup Mute Button
        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Mencegah interaksi dengan overlay jika ada
                isMuted = !isMuted;
                Howler.mute(isMuted);
                muteBtn.innerText = isMuted ? '🔇' : '🔊';
                muteBtn.classList.toggle('muted', isMuted);
                
                // Jika pertama kali klik, unlock audio
                if (!audioUnlocked) audioUnlocked = true;
            });
        }

        // Setup Restart Button
        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }

        // Interaction workaround untuk browser modern
        window.addEventListener('touchstart', unlockAudio, { once: true });
        window.addEventListener('click', unlockAudio, { once: true });
    }

    /**
     * Workaround untuk kebijakan autoplay browser
     */
    function unlockAudio() {
        if (audioUnlocked) return;
        
        // Buat buffer kosong dan play untuk memicu unlock
        const silent = new Howl({ src: ['data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='] });
        silent.play();
        
        audioUnlocked = true;
        console.log("Audio Unlocked");
    }

    /**
     * Memutar audio emosi tertentu dan menghentikan yang lain
     */
    function playEmotionAudio(emotionId) {
        if (isMuted || !audioUnlocked) return;

        try {
            // Stop semua audio lain agar tidak tumpang tindih
            stopAllAudio();

            const sound = audioInstances[emotionId];
            if (sound && sound.state() === 'loaded') {
                sound.play();
            } else {
                console.warn(`Audio untuk ${emotionId} belum siap atau tidak ditemukan.`);
            }
        } catch (e) {
            console.error(`Gagal memutar audio ${emotionId}:`, e);
        }
    }

    /**
     * Menghentikan semua audio yang sedang diputar
     */
    function stopAllAudio() {
        Object.values(audioInstances).forEach(sound => {
            if (sound) sound.stop();
        });
    }

    /**
     * Memuat model GLTF/GLB untuk emosi tertentu
     */
    function loadEmotionModel(emotion, anchor) {
        // Gunakan GLTFLoader dari THREE global
        const loader = window.THREE.GLTFLoader ? new window.THREE.GLTFLoader() : null;

        if (!loader) {
            console.warn(`GLTFLoader tidak tersedia, menggunakan placeholder untuk ${emotion.id}`);
            const placeholder = createPlaceholderFace(emotion.id);
            placeholder.name = "placeholder";
            placeholders.push(placeholder); // Registrasi untuk animasi
            anchor.group.add(placeholder);
            return;
        }

        loader.load(
            emotion.modelPath,
            (gltf) => {
                const model = gltf.scene;
                model.name = "gltf-model";
                
                // Atur Skala dan Posisi
                model.scale.set(0.4, 0.4, 0.4); // Sekitar 0.3-0.5 sesuai request
                model.position.set(0, 0.1, 0);   // Sedikit di atas kartu
                
                // Setup Animasi jika ada
                if (gltf.animations && gltf.animations.length > 0) {
                    const mixer = new THREE.AnimationMixer(model);
                    emotion.mixer = mixer;
                    emotion.animations = gltf.animations;
                    mixers.push(mixer);
                }

                model.visible = false;
                anchor.group.add(model);
                console.log(`Model ${emotion.id} berhasil dimuat.`);
            },
            undefined,
            (error) => {
                console.warn(`Gagal memuat model ${emotion.id}, menggunakan placeholder.`, error);
                const placeholder = createPlaceholderFace(emotion.id);
                placeholder.name = "placeholder";
                placeholders.push(placeholder); // Registrasi untuk animasi
                anchor.group.add(placeholder);
            }
        );
    }

    /**
     * Menjalankan animasi model
     */
    function playEmotionAnimation(emotion) {
        if (emotion.mixer && emotion.animations && emotion.animations.length > 0) {
            const action = emotion.mixer.clipAction(emotion.animations[0]);
            action.reset().play();
        }
    }

    /**
     * Menghentikan dan mereset animasi model
     */
    function stopEmotionAnimation(emotion) {
        if (emotion.mixer) {
            emotion.mixer.stopAllAction();
        }
    }

    /**
     * Error Handling saat Inisialisasi
     */
    function handleInitError(error) {
        console.error("AR Init Error:", error);
        loadingScreen.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #333;">
                <p>⚠️ <strong>Gagal Memulai AR</strong></p>
                <p>${error.message.includes('camera') || error.message.includes('permission') 
                    ? "Izinkan akses kamera untuk menggunakan media ini." 
                    : error.message}</p>
                <button onclick="window.location.reload()" style="margin-top: 15px; padding: 10px 20px; border-radius: 20px; border: none; background: #4a90e2; color: white;">Coba Lagi</button>
            </div>
        `;

        // Cek WebXR (Optional info)
        if (!window.isSecureContext) {
            loadingScreen.innerHTML += `<p style="font-size: 12px; margin-top: 10px;">Catatan: Web AR memerlukan koneksi HTTPS.</p>`;
        }
    }

    /**
     * Membuat wajah placeholder menggunakan Three.js primitives
     */
    function createPlaceholderFace(emotionId) {
        const config = emotions[emotionId];
        const group = new THREE.Group();

        try {
            // Kepala
            const headGeo = new THREE.SphereGeometry(0.5, 32, 32);
            const headMat = new THREE.MeshPhongMaterial({ color: config.color });
            const head = new THREE.Mesh(headGeo, headMat);
            group.add(head);

            // Mata
            const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const eyeMat = new THREE.MeshPhongMaterial({ color: 0x000000 });
            const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
            leftEye.position.set(-0.2, 0.1, 0.45);
            group.add(leftEye);
            const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
            rightEye.position.set(0.2, 0.1, 0.45);
            group.add(rightEye);

            // Mulut
            const mouthGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1);
            const mouth = new THREE.Mesh(mouthGeo, eyeMat);
            mouth.position.set(0, -0.2, 0.45);
            group.add(mouth);

            // Label Teks (Sprite)
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256; canvas.height = 64;
            context.font = 'Bold 40px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.fillText(config.label.toUpperCase(), 128, 45);
            const texture = new THREE.CanvasTexture(canvas);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
            sprite.position.set(0, 0.7, 0);
            sprite.scale.set(1, 0.25, 1);
            group.add(sprite);

        } catch (e) {
            console.warn("Gagal membuat placeholder geometry:", e);
        }

        return group;
    }

    // Jalankan
    initAR();
});
