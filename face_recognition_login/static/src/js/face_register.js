/**
 * face_register.js
 * Handles face capture & registration from the backend user profile popup.
 * Loaded via web.assets_backend.
 */

(function () {
    'use strict';

    const LOCAL_MODELS_URL = '/face_recognition_login/static/src/models';
    const REMOTE_MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    const SAMPLE_DELAY_MS = 180;
    const REGISTRATION_SAMPLE_COUNT = 5;
    const REGISTRATION_MIN_SAMPLES = 3;
    let stream = null;
    let modelsLoaded = false;
    let modelsLoadPromise = null;
    let faceApiLoadPromise = null;
    let activeModelsUrl = LOCAL_MODELS_URL;

    function ensureFaceApiLoaded() {
        if (typeof faceapi !== 'undefined') {
            return Promise.resolve();
        }
        if (faceApiLoadPromise) {
            return faceApiLoadPromise;
        }

        faceApiLoadPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-face-api-register="1"]');
            if (existingScript) {
                existingScript.addEventListener('load', resolve, { once: true });
                existingScript.addEventListener('error', () => reject(new Error('Failed to load face-api.js.')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = FACE_API_CDN;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.dataset.faceApiRegister = '1';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load face-api.js.'));
            document.head.appendChild(script);
        });

        return faceApiLoadPromise;
    }

    async function loadModelsFrom(baseUrl) {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(baseUrl),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri(baseUrl),
            faceapi.nets.faceRecognitionNet.loadFromUri(baseUrl),
        ]);
    }

    async function loadModels() {
        if (modelsLoaded) return true;
        if (modelsLoadPromise) return modelsLoadPromise;

        modelsLoadPromise = (async () => {
            setRegStatus('Loading face models…');
            try {
                await ensureFaceApiLoaded();
                await loadModelsFrom(activeModelsUrl);
                modelsLoaded = true;
                return true;
            } catch (localErr) {
                console.warn('[FaceRegister] Local model load failed:', localErr);
                try {
                    setRegStatus('Trying fallback model source…');
                    await loadModelsFrom(REMOTE_MODELS_URL);
                    activeModelsUrl = REMOTE_MODELS_URL;
                    modelsLoaded = true;
                    return true;
                } catch (remoteErr) {
                    console.error('[FaceRegister] Model load failed:', remoteErr);
                    setRegStatus(
                        'Failed to load face models. Add files to static/src/models or allow CDN access.',
                        'error'
                    );
                    modelsLoadPromise = null;
                    return false;
                }
            }
        })();

        return modelsLoadPromise;
    }

    function setRegStatus(msg, type = 'info') {
        const el = document.getElementById('reg_face_status');
        if (!el) return;
        el.textContent = msg;
        el.className = 'alert alert-' + (type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info');
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    function averageDescriptors(descriptors) {
        const totals = new Array(descriptors[0].length).fill(0);
        descriptors.forEach((descriptor) => {
            descriptor.forEach((value, index) => {
                totals[index] += value;
            });
        });
        return totals.map((total) => total / descriptors.length);
    }

    async function collectDescriptorSamples(video) {
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const samples = [];

        for (let attempt = 0; attempt < REGISTRATION_SAMPLE_COUNT; attempt += 1) {
            setRegStatus(`Capturing sample ${attempt + 1}/${REGISTRATION_SAMPLE_COUNT}…`);
            const result = await faceapi
                .detectSingleFace(video, options)
                .withFaceLandmarks(true)
                .withFaceDescriptor();
            if (result) {
                samples.push(Array.from(result.descriptor));
            }
            if (attempt < REGISTRATION_SAMPLE_COUNT - 1) {
                await wait(SAMPLE_DELAY_MS);
            }
        }

        if (samples.length < REGISTRATION_MIN_SAMPLES) {
            return null;
        }
        return averageDescriptors(samples);
    }

    function getTargetUserId(buttonEl) {
        const popupRoot = buttonEl && buttonEl.closest('form');
        const idField = popupRoot && popupRoot.querySelector('.o_face_target_user_id');
        if (!idField) {
            return null;
        }
        const inputEl = idField.querySelector('input');
        const rawValue = inputEl ? inputEl.value : idField.textContent;
        const userId = Number.parseInt((rawValue || '').trim(), 10);
        return Number.isInteger(userId) && userId > 0 ? userId : null;
    }

    async function startRegCamera() {
        const video = document.getElementById('reg_face_video');
        if (!video) return;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false,
            });
            video.srcObject = stream;
            const canvas = document.getElementById('reg_face_canvas');
            await new Promise(r => (video.onloadedmetadata = r));
            if (canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }
        } catch (err) {
            setRegStatus('Camera access denied. Please allow camera.', 'error');
        }
    }

    window.faceRegisterCleanup = function () {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
    };

    async function captureAndSave() {
        const video = document.getElementById('reg_face_video');
        const btn = document.getElementById('btn_capture_face');
        if (!video || !stream) {
            setRegStatus('Camera not ready.', 'error');
            return;
        }

        const targetUserId = getTargetUserId(btn);

        btn.disabled = true;
        setRegStatus('Detecting face…');

        const ready = await loadModels();
        if (!ready) {
            btn.disabled = false;
            return;
        }

        const descriptor = await collectDescriptorSamples(video);
        if (!descriptor) {
            setRegStatus('We could not capture enough clear face samples. Please face the camera and try again.', 'error');
            btn.disabled = false;
            return;
        }

        // Capture snapshot as base64 PNG
        const snap = document.createElement('canvas');
        snap.width = video.videoWidth;
        snap.height = video.videoHeight;
        snap.getContext('2d').drawImage(video, 0, 0);
        const imageB64 = snap.toDataURL('image/png').split(',')[1];

        setRegStatus('Saving face data…');

        try {
            const resp = await fetch('/face_login/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'call',
                    params: {
                        descriptor,
                        face_image: imageB64,
                        ...(targetUserId ? { user_id: targetUserId } : {}),
                    },
                }),
            });
            const data = await resp.json();
            if (data.result && data.result.success) {
                setRegStatus('✓ Face registered successfully!', 'success');
                window.faceRegisterCleanup();
                // Close dialog after short delay and reload form
                setTimeout(() => {
                    const closeBtn = document.querySelector(
                        '.o_dialog .o_form_button_cancel, .modal .btn-close'
                    );
                    if (closeBtn) closeBtn.click();
                    // Reload the page to reflect new status
                    window.location.reload();
                }, 1500);
            } else {
                const err = (data.result && data.result.error) || 'Registration failed.';
                setRegStatus(err, 'error');
                btn.disabled = false;
            }
        } catch (err) {
            setRegStatus('Server error: ' + err.message, 'error');
            btn.disabled = false;
        }
    }

    // Poll for the popup DOM since it's rendered dynamically by Odoo
    function waitForRegDialog() {
        const observer = new MutationObserver(() => {
            const captureBtn = document.getElementById('btn_capture_face');
            const video = document.getElementById('reg_face_video');
            if (captureBtn && video && !captureBtn._faceInitialized) {
                captureBtn._faceInitialized = true;
                captureBtn.addEventListener('click', captureAndSave);

                ensureFaceApiLoaded()
                    .then(() => startRegCamera())
                    .then(() => loadModels())
                    .then((ready) => {
                        if (ready) {
                            setRegStatus('Camera ready. Click "Capture & Save".');
                        }
                    })
                    .catch((err) => {
                        console.error('[FaceRegister] Initialization error:', err);
                        setRegStatus('Failed to initialize face recognition.', 'error');
                    });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('DOMContentLoaded', waitForRegDialog);
})();
