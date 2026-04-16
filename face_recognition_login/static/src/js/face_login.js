/**
 * face_login.js
 * Handles face recognition on the /web/login page.
 * Loaded via web.assets_frontend_minimal.
 *
 */

(function () {
    'use strict';

    // ── Configuration ────────────────────────────────────────────────────────
    const LOCAL_MODELS_URL = '/face_recognition_login/static/src/models';
    const REMOTE_MODELS_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
    const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    const SCAN_INTERVAL_MS = 1200;  // how often to auto-scan while panel is open
    const SAMPLE_DELAY_MS = 180;
    const LOGIN_SAMPLE_COUNT = 4;
    const LOGIN_MIN_SAMPLES = 2;

    // ── State ────────────────────────────────────────────────────────────────
    let stream = null;
    let scanTimer = null;
    let modelsLoaded = false;
    let modelsLoadPromise = null;
    let faceApiLoadPromise = null;
    let activeModelsUrl = LOCAL_MODELS_URL;
    let scanInProgress = false;

    // ── DOM refs (resolved after DOMContentLoaded) ───────────────────────────
    let videoEl, canvasEl, statusEl, panelEl, toggleBtn, scanBtn, cancelBtn;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function setStatus(msg, type = 'info') {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'face-status-overlay face-status-' + type;
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

    function ensureFaceApiLoaded() {
        if (typeof faceapi !== 'undefined') {
            return Promise.resolve();
        }
        if (faceApiLoadPromise) {
            return faceApiLoadPromise;
        }

        setStatus('Loading face recognition library…');
        faceApiLoadPromise = new Promise((resolve, reject) => {
            const existingScript = document.querySelector('script[data-face-api-login="1"]');
            if (existingScript) {
                existingScript.addEventListener('load', resolve, { once: true });
                existingScript.addEventListener('error', () => reject(new Error('Failed to load face-api.js.')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = FACE_API_CDN;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.dataset.faceApiLogin = '1';
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
        setStatus('Loading face models…');

        modelsLoadPromise = (async () => {
            try {
                await ensureFaceApiLoaded();
                await loadModelsFrom(activeModelsUrl);
                modelsLoaded = true;
                setStatus('Models ready. Look at the camera.');
                return true;
            } catch (localErr) {
                console.warn('[FaceLogin] Local model load failed:', localErr);
                try {
                    setStatus('Trying fallback model source…');
                    await loadModelsFrom(REMOTE_MODELS_URL);
                    activeModelsUrl = REMOTE_MODELS_URL;
                    modelsLoaded = true;
                    setStatus('Models ready. Look at the camera.');
                    return true;
                } catch (remoteErr) {
                    console.error('[FaceLogin] Model load error:', remoteErr);
                    setStatus('Failed to load face models. Add files to static/src/models or allow CDN access.', 'error');
                    modelsLoadPromise = null;
                    return false;
                }
            }
        })();

        return modelsLoadPromise;
    }

    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false,
            });
            videoEl.srcObject = stream;
            await new Promise(r => (videoEl.onloadedmetadata = r));
            canvasEl.width = videoEl.videoWidth;
            canvasEl.height = videoEl.videoHeight;
        } catch (err) {
            console.error('[FaceLogin] Camera error:', err);
            setStatus('Camera access denied. Please allow camera.', 'error');
        }
    }

    function stopCamera() {
        clearInterval(scanTimer);
        scanInProgress = false;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
        if (videoEl) videoEl.srcObject = null;
    }

    async function getDescriptor() {
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const result = await faceapi
            .detectSingleFace(videoEl, options)
            .withFaceLandmarks(true)
            .withFaceDescriptor();
        return result ? Array.from(result.descriptor) : null;
    }

    async function collectDescriptorSamples() {
        const samples = [];

        for (let attempt = 0; attempt < LOGIN_SAMPLE_COUNT; attempt += 1) {
            setStatus(`Hold still... capturing sample ${attempt + 1}/${LOGIN_SAMPLE_COUNT}`);
            const descriptor = await getDescriptor();
            if (descriptor) {
                samples.push(descriptor);
            }
            if (attempt < LOGIN_SAMPLE_COUNT - 1) {
                await wait(SAMPLE_DELAY_MS);
            }
        }

        if (samples.length < LOGIN_MIN_SAMPLES) {
            return null;
        }
        return averageDescriptors(samples);
    }

    async function doScan() {
        if (!modelsLoaded || !stream || scanInProgress) return;
        scanInProgress = true;
        try {
            setStatus('Scanning…');

            const descriptor = await collectDescriptorSamples();
            if (!descriptor) {
                setStatus('We could not capture enough clear face samples. Hold still and try again.', 'warn');
                return;
            }

            setStatus('Face detected. Verifying…');
            const resp = await fetch('/face_login/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { descriptor } }),
            });
            const data = await resp.json();
            const result = data.result;

            if (result && result.success) {
                setStatus('✓ Face recognized! Logging in…', 'success');
                stopCamera();
                clearInterval(scanTimer);
                setTimeout(() => {
                    window.location.href = result.redirect || '/odoo';
                }, 800);
            } else {
                const msg = (result && result.error) || 'Not recognized. Try again.';
                setStatus(msg, 'error');
            }
        } catch (err) {
            console.error('[FaceLogin] Verify error:', err);
            setStatus('Server error. Please try again.', 'error');
        } finally {
            scanInProgress = false;
        }
    }

    // ── Initialization ───────────────────────────────────────────────────────

    async function openFacePanel() {
        panelEl.style.display = 'block';
        toggleBtn.style.display = 'none';
        const ready = await loadModels();
        if (!ready) {
            panelEl.style.display = 'none';
            toggleBtn.style.display = '';
            return;
        }
        await startCamera();
        if (modelsLoaded && stream) {
            setStatus('Ready — click "Scan Face" or wait for auto-scan.');
            // Auto-scan every SCAN_INTERVAL_MS
            scanTimer = setInterval(doScan, SCAN_INTERVAL_MS);
        }
    }

    function closeFacePanel() {
        stopCamera();
        panelEl.style.display = 'none';
        toggleBtn.style.display = '';
        setStatus('Initializing camera…');
    }

    function initFaceLogin() {
        panelEl = document.getElementById('face_login_panel');
        videoEl = document.getElementById('face_video');
        canvasEl = document.getElementById('face_canvas');
        statusEl = document.getElementById('face_status_text');
        toggleBtn = document.getElementById('btn_toggle_face_login');
        scanBtn = document.getElementById('btn_face_scan');
        cancelBtn = document.getElementById('btn_face_cancel');

        if (!panelEl || !toggleBtn) return; // Not on login page

        toggleBtn.addEventListener('click', openFacePanel);
        cancelBtn.addEventListener('click', closeFacePanel);
        scanBtn.addEventListener('click', doScan);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFaceLogin);
    } else {
        initFaceLogin();
    }
})();
