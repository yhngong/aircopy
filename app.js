/**
 * AirCopy — Offline Air-Gapped Text Transfer
 * Zero-dependency, client-only PWA application.
 */

(() => {
  'use strict';

  // --- State Variables ---
  let activeTab = 'send';
  let qrCodeInstance = null;
  let fullscreenQrInstance = null;
  let burstInterval = null;
  let burstFrames = [];
  let currentBurstIndex = 0;
  let burstSpeedMs = 350;

  // Scanner State
  let videoStream = null;
  let currentFacingMode = 'environment';
  let isScanning = false;
  let scanAnimationId = null;
  let isTorchOn = false;
  let videoTrack = null;
  let barcodeDetector = null;

  // Chunk Reception State
  // msgId -> { total, chunks: Map(index -> text), lastSeen: timestamp }
  const activeTransfers = new Map();
  let lastScannedPayload = null;
  let lastScannedTime = 0;

  // History State
  const STORAGE_KEY = 'aircopy_history_v1';
  let historyItems = [];

  // --- DOM Elements ---
  const tabButtons = document.querySelectorAll('.nav-tab');
  const tabPanels = {
    send: document.getElementById('tabSend'),
    receive: document.getElementById('tabReceive'),
    history: document.getElementById('tabHistory')
  };

  // Send Tab Elements
  const textInput = document.getElementById('textInput');
  const charCount = document.getElementById('charCount');
  const qrModeNotice = document.getElementById('qrModeNotice');
  const btnPaste = document.getElementById('btnPaste');
  const btnClearSend = document.getElementById('btnClearSend');
  const qrWrapper = document.getElementById('qrWrapper');
  const qrTarget = document.getElementById('qrcode');
  const qrPlaceholder = document.getElementById('qrPlaceholder');
  const qrToolbar = document.getElementById('qrToolbar');
  const btnFullscreenQR = document.getElementById('btnFullscreenQR');

  const burstControls = document.getElementById('burstControls');
  const burstChunkIndicator = document.getElementById('burstChunkIndicator');
  const burstSpeedSlider = document.getElementById('burstSpeedSlider');
  const burstSpeedLabel = document.getElementById('burstSpeedLabel');

  // Receive Tab Elements
  const scannerViewportWrapper = document.getElementById('scannerViewportWrapper');
  const scannerVideo = document.getElementById('scannerVideo');
  const scannerCanvas = document.getElementById('scannerCanvas');
  const scannerCanvasCtx = scannerCanvas.getContext('2d', { willReadFrequently: true });
  const viewfinderOverlay = document.getElementById('viewfinderOverlay');
  const scannerReticle = document.getElementById('scannerReticle');
  const scanSuccessOverlay = document.getElementById('scanSuccessOverlay');
  const scannerMessage = document.getElementById('scannerMessage');
  const scannerMessageText = document.getElementById('scannerMessageText');
  const btnStartCamera = document.getElementById('btnStartCamera');
  const btnFlipCamera = document.getElementById('btnFlipCamera');
  const btnToggleTorch = document.getElementById('btnToggleTorch');

  const chunkProgressModal = document.getElementById('chunkProgressModal');
  const chunkProgressBar = document.getElementById('chunkProgressBar');
  const chunkProgressText = document.getElementById('chunkProgressText');

  const scanResultCard = document.getElementById('scanResultCard');
  const scannedResultText = document.getElementById('scannedResultText');
  const resultMeta = document.getElementById('resultMeta');
  const resultTimestamp = document.getElementById('resultTimestamp');
  const btnScanAgain = document.getElementById('btnScanAgain');
  const btnCopyResult = document.getElementById('btnCopyResult');
  const btnShareResult = document.getElementById('btnShareResult');
  const btnOpenLink = document.getElementById('btnOpenLink');

  // History Tab Elements
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');
  const btnClearHistory = document.getElementById('btnClearHistory');

  // Modals & Misc
  const fullscreenModal = document.getElementById('fullscreenModal');
  const fullscreenQrTarget = document.getElementById('fullscreenQrTarget');
  const fullscreenBurstIndicator = document.getElementById('fullscreenBurstIndicator');
  const btnCloseFullscreen = document.getElementById('btnCloseFullscreen');

  const shareAppModal = document.getElementById('shareAppModal');
  const btnShareAppModal = document.getElementById('btnShareAppModal');
  const btnShareAppBanner = document.getElementById('btnShareAppBanner');
  const btnCloseShareApp = document.getElementById('btnCloseShareApp');
  const appUrlQrTarget = document.getElementById('appUrlQrTarget');
  const appUrlDisplay = document.getElementById('appUrlDisplay');
  const btnCopyAppUrl = document.getElementById('btnCopyAppUrl');
  let appShareQrInstance = null;

  const aboutModal = document.getElementById('aboutModal');
  const btnAboutModal = document.getElementById('btnAboutModal');
  const btnCloseAbout = document.getElementById('btnCloseAbout');
  const toast = document.getElementById('toast');
  const networkBadge = document.getElementById('networkBadge');

  // --- Constants ---
  const GITHUB_PAGES_URL = 'https://yhngong.github.io/aircopy/';
  const CHUNK_SIZE = 350; // chars per QR frame in burst mode
  const BURST_THRESHOLD = 500; // Switch to burst mode if text exceeds this

  // --- Initialization ---
  function init() {
    loadHistory();
    setupNavigation();
    setupSendTab();
    setupReceiveTab();
    setupModals();
    setupNetworkStatus();
    initBarcodeDetector();
    registerServiceWorker();
  }

  // --- Navigation & Tabs ---
  function setupNavigation() {
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });
  }

  function switchTab(tab) {
    if (activeTab === tab) return;

    tabButtons.forEach((btn) => {
      const isSelected = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-selected', isSelected);
    });

    Object.keys(tabPanels).forEach((key) => {
      tabPanels[key].classList.toggle('active', key === tab);
    });

    activeTab = tab;

    if (tab === 'receive') {
      startCamera();
    } else {
      stopCamera();
    }

    if (tab === 'history') {
      renderHistory();
    }
  }

  // --- Audio & Haptic Feedback ---
  function triggerFeedback() {
    // Sound chime via Web Audio API (zero network, pure synth)
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
        osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.1); // D6

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      // Audio context might be restricted before touch
    }

    // Haptic vibration
    if (navigator.vibrate) {
      navigator.vibrate([60, 40, 80]);
    }
  }

  function showToast(message, duration = 2200) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, duration);
  }

  // --- Sender Logic ---
  function setupSendTab() {
    let debounceTimer = null;
    textInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateSenderQR, 120);
    });

    btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          textInput.value = text;
          updateSenderQR();
          showToast('Pasted from clipboard');
        } else {
          showToast('Clipboard is empty');
        }
      } catch (err) {
        showToast('Paste not permitted. Tap & hold inside text area.');
      }
    });

    btnClearSend.addEventListener('click', () => {
      textInput.value = '';
      updateSenderQR();
    });

    burstSpeedSlider.addEventListener('input', (e) => {
      burstSpeedMs = parseInt(e.target.value, 10);
      burstSpeedLabel.textContent = `${burstSpeedMs}ms`;
      if (burstInterval && burstFrames.length > 1) {
        restartBurstLoop();
      }
    });

    btnFullscreenQR.addEventListener('click', openFullscreenQR);
  }

  function updateSenderQR() {
    const text = textInput.value.trim();
    const len = text.length;

    charCount.textContent = `${len} character${len === 1 ? '' : 's'}`;

    // Stop any running burst
    if (burstInterval) {
      clearInterval(burstInterval);
      burstInterval = null;
    }

    if (!text) {
      qrPlaceholder.classList.remove('hidden');
      qrToolbar.classList.add('hidden');
      burstControls.classList.add('hidden');
      qrModeNotice.textContent = 'Single QR';
      qrTarget.innerHTML = '';
      return;
    }

    qrPlaceholder.classList.add('hidden');
    qrToolbar.classList.remove('hidden');

    if (len <= BURST_THRESHOLD) {
      // Single QR Code Mode
      qrModeNotice.textContent = 'Single QR';
      burstControls.classList.add('hidden');
      burstFrames = [text];
      currentBurstIndex = 0;
      renderQRCode(qrTarget, text, 256);
    } else {
      // Animated Burst Mode for High Capacity
      const chunks = createChunks(text, CHUNK_SIZE);
      const transferId = Math.random().toString(36).substring(2, 6);
      burstFrames = chunks.map((chunk, i) => `AIRCPY:v1:${transferId}:${i + 1}:${chunks.length}:${chunk}`);
      
      qrModeNotice.textContent = `Burst Mode (${chunks.length} parts)`;
      burstControls.classList.remove('hidden');
      burstChunkIndicator.textContent = `Part 1/${burstFrames.length}`;

      currentBurstIndex = 0;
      renderQRCode(qrTarget, burstFrames[0], 256);
      restartBurstLoop();
    }
  }

  function createChunks(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }

  function renderQRCode(container, data, size = 256) {
    container.innerHTML = '';
    new QRCode(container, {
      text: data,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  function restartBurstLoop() {
    if (burstInterval) clearInterval(burstInterval);
    burstInterval = setInterval(() => {
      if (burstFrames.length <= 1) return;
      currentBurstIndex = (currentBurstIndex + 1) % burstFrames.length;
      const frameData = burstFrames[currentBurstIndex];
      const partText = `Part ${currentBurstIndex + 1}/${burstFrames.length}`;

      burstChunkIndicator.textContent = partText;
      renderQRCode(qrTarget, frameData, 256);

      // If fullscreen modal is active, update it too
      if (!fullscreenModal.classList.contains('hidden')) {
        fullscreenBurstIndicator.textContent = partText;
        renderQRCode(fullscreenQrTarget, frameData, Math.min(window.innerWidth * 0.8, 360));
      }
    }, burstSpeedMs);
  }

  // --- Fullscreen View ---
  function openFullscreenQR() {
    const text = textInput.value.trim();
    if (!text) return;

    fullscreenModal.classList.remove('hidden');
    const modalSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.5, 360);

    if (burstFrames.length > 1) {
      fullscreenBurstIndicator.classList.remove('hidden');
      fullscreenBurstIndicator.textContent = `Part ${currentBurstIndex + 1}/${burstFrames.length}`;
      renderQRCode(fullscreenQrTarget, burstFrames[currentBurstIndex], modalSize);
    } else {
      fullscreenBurstIndicator.classList.add('hidden');
      renderQRCode(fullscreenQrTarget, text, modalSize);
    }
  }

  function closeFullscreenQR() {
    fullscreenModal.classList.add('hidden');
  }

  // --- Scanner & Camera (Receiver) ---
  function setupReceiveTab() {
    btnStartCamera.addEventListener('click', startCamera);
    btnFlipCamera.addEventListener('click', flipCamera);
    btnToggleTorch.addEventListener('click', toggleTorch);
    btnScanAgain.addEventListener('click', resumeScanning);

    btnCopyResult.addEventListener('click', () => {
      const text = scannedResultText.textContent;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
      }).catch(() => {
        showToast('Clipboard access denied');
      });
    });

    btnShareResult.addEventListener('click', async () => {
      const text = scannedResultText.textContent;
      if (!text) return;
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'AirCopy Transfer',
            text: text
          });
        } catch (e) {
          // User dismissed share dialog
        }
      } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
      }
    });
  }

  async function initBarcodeDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.includes('qr_code')) {
          barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        }
      } catch (e) {
        barcodeDetector = null;
      }
    }
  }

  async function startCamera() {
    stopCamera();

    scannerMessage.classList.add('hidden');
    scanResultCard.classList.add('hidden');
    scanResultCard.classList.remove('card-reveal-animate');
    if (scanSuccessOverlay) scanSuccessOverlay.classList.add('hidden');
    if (scannerReticle) scannerReticle.classList.remove('reticle-locked');
    if (scannerViewportWrapper) scannerViewportWrapper.classList.remove('scanner-flash');
    viewfinderOverlay.classList.remove('hidden');

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      videoStream = await navigator.mediaDevices.getUserMedia(constraints);
      scannerVideo.srcObject = videoStream;
      await scannerVideo.play();

      videoTrack = videoStream.getVideoTracks()[0];
      checkTorchSupport();

      isScanning = true;
      requestAnimationFrame(scanLoop);
    } catch (err) {
      console.error('Camera error:', err);
      scannerMessage.classList.remove('hidden');
      scannerMessageText.textContent = 'Camera permission required or device camera unavailable.';
    }
  }

  function stopCamera() {
    isScanning = false;
    if (scanAnimationId) {
      cancelAnimationFrame(scanAnimationId);
      scanAnimationId = null;
    }
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = null;
      videoTrack = null;
    }
    btnToggleTorch.classList.add('hidden');
    isTorchOn = false;
  }

  function flipCamera() {
    currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
    startCamera();
  }

  function checkTorchSupport() {
    if (!videoTrack || !videoTrack.getCapabilities) {
      btnToggleTorch.classList.add('hidden');
      return;
    }
    const caps = videoTrack.getCapabilities();
    if (caps.torch) {
      btnToggleTorch.classList.remove('hidden');
    } else {
      btnToggleTorch.classList.add('hidden');
    }
  }

  async function toggleTorch() {
    if (!videoTrack) return;
    try {
      isTorchOn = !isTorchOn;
      await videoTrack.applyConstraints({
        advanced: [{ torch: isTorchOn }]
      });
      btnToggleTorch.classList.toggle('active', isTorchOn);
    } catch (e) {
      console.warn('Torch failed:', e);
    }
  }

  function resumeScanning() {
    scanResultCard.classList.add('hidden');
    scanResultCard.classList.remove('card-reveal-animate');
    if (scanSuccessOverlay) {
      scanSuccessOverlay.classList.add('hidden');
    }
    if (scannerReticle) {
      scannerReticle.classList.remove('reticle-locked');
    }
    if (scannerViewportWrapper) {
      scannerViewportWrapper.classList.remove('scanner-flash');
    }
    viewfinderOverlay.classList.remove('hidden');
    chunkProgressModal.classList.add('hidden');
    isScanning = true;
    requestAnimationFrame(scanLoop);
  }

  async function scanLoop() {
    if (!isScanning) return;

    if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA) {
      let decodedRaw = null;

      // 1. Try Hardware BarcodeDetector API if available
      if (barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(scannerVideo);
          if (barcodes && barcodes.length > 0) {
            decodedRaw = barcodes[0].rawValue;
          }
        } catch (e) {
          // Fallback to jsQR
        }
      }

      // 2. Fallback to vendored jsQR library
      if (!decodedRaw && typeof jsQR === 'function') {
        const vw = scannerVideo.videoWidth;
        const vh = scannerVideo.videoHeight;
        if (vw && vh) {
          scannerCanvas.width = vw;
          scannerCanvas.height = vh;
          scannerCanvasCtx.drawImage(scannerVideo, 0, 0, vw, vh);
          const imageData = scannerCanvasCtx.getImageData(0, 0, vw, vh);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
          });
          if (code && code.data) {
            decodedRaw = code.data;
          }
        }
      }

      if (decodedRaw) {
        handleScannedCode(decodedRaw);
        if (!isScanning) return; // Exit loop if completed transfer
      }
    }

    scanAnimationId = requestAnimationFrame(scanLoop);
  }

  function handleScannedCode(rawPayload) {
    const now = Date.now();

    // Prevent re-processing identical chunk within 180ms
    if (rawPayload === lastScannedPayload && now - lastScannedTime < 180) {
      return;
    }
    lastScannedPayload = rawPayload;
    lastScannedTime = now;

    // Check if chunked format: AIRCPY:v1:<msgId>:<index>:<total>:<payload>
    if (rawPayload.startsWith('AIRCPY:v1:')) {
      handleChunkPayload(rawPayload);
    } else {
      // Single QR Code scan
      completeTransfer(rawPayload);
    }
  }

  function handleChunkPayload(rawPayload) {
    const parts = rawPayload.split(':');
    if (parts.length < 6) return;

    const msgId = parts[2];
    const index = parseInt(parts[3], 10);
    const total = parseInt(parts[4], 10);
    const payload = parts.slice(5).join(':'); // Handle colons in user payload

    let transfer = activeTransfers.get(msgId);
    if (!transfer) {
      transfer = {
        total: total,
        chunks: new Map(),
        lastSeen: Date.now()
      };
      activeTransfers.set(msgId, transfer);
    }

    transfer.chunks.set(index, payload);
    transfer.lastSeen = Date.now();

    // Show progress UI
    const count = transfer.chunks.size;
    const percent = Math.round((count / total) * 100);

    chunkProgressModal.classList.remove('hidden');
    chunkProgressBar.style.width = `${percent}%`;
    chunkProgressText.textContent = `Captured ${count} of ${total} chunks (${percent}%)`;

    if (count === total) {
      // Assemble complete text in order
      const completeList = [];
      for (let i = 1; i <= total; i++) {
        completeList.push(transfer.chunks.get(i) || '');
      }
      const fullText = completeList.join('');
      activeTransfers.delete(msgId);
      chunkProgressModal.classList.add('hidden');
      completeTransfer(fullText);
    }
  }

  function completeTransfer(fullText) {
    isScanning = false;
    triggerFeedback();

    // 1. Receiver-side decode animation sequence
    if (scannerViewportWrapper) {
      scannerViewportWrapper.classList.remove('scanner-flash');
      void scannerViewportWrapper.offsetWidth; // force DOM reflow
      scannerViewportWrapper.classList.add('scanner-flash');
    }
    if (scannerReticle) {
      scannerReticle.classList.add('reticle-locked');
    }
    if (scanSuccessOverlay) {
      scanSuccessOverlay.classList.remove('hidden');
    }

    // 2. Prepare result text and actions
    scannedResultText.textContent = fullText;
    resultMeta.textContent = `${fullText.length} characters • ${fullText.split(/\s+/).filter(Boolean).length} words`;
    resultTimestamp.textContent = new Date().toLocaleTimeString();

    // Check if it's a URL
    if (/^https?:\/\//i.test(fullText.trim())) {
      btnOpenLink.href = fullText.trim();
      btnOpenLink.classList.remove('hidden');
    } else {
      btnOpenLink.classList.add('hidden');
    }

    saveHistoryItem(fullText);

    // 3. Smooth transition: let the success animation shine, then reveal result card
    setTimeout(() => {
      if (scanSuccessOverlay) {
        scanSuccessOverlay.classList.add('hidden');
      }
      if (scannerReticle) {
        scannerReticle.classList.remove('reticle-locked');
      }
      if (scannerViewportWrapper) {
        scannerViewportWrapper.classList.remove('scanner-flash');
      }
      viewfinderOverlay.classList.add('hidden');

      scanResultCard.classList.remove('hidden');
      scanResultCard.classList.remove('card-reveal-animate');
      void scanResultCard.offsetWidth; // force DOM reflow
      scanResultCard.classList.add('card-reveal-animate');
    }, 620);
  }

  // --- History Management ---
  function loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        historyItems = JSON.parse(stored);
      }
    } catch (e) {
      historyItems = [];
    }
  }

  function saveHistoryItem(text) {
    const item = {
      id: Date.now(),
      text: text,
      timestamp: new Date().toLocaleString()
    };
    // Keep max 30 items
    historyItems.unshift(item);
    if (historyItems.length > 30) historyItems.pop();

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(historyItems));
    } catch (e) {}
  }

  function renderHistory() {
    historyList.innerHTML = '';
    if (historyItems.length === 0) {
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyEmpty.classList.add('hidden');
    historyItems.forEach((item) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="history-item-header">
          <span>${item.timestamp}</span>
          <span>${item.text.length} chars</span>
        </div>
        <div class="history-item-content">${escapeHtml(item.text)}</div>
        <div class="history-item-actions">
          <button class="btn btn-secondary btn-sm btn-hist-copy" data-id="${item.id}">Copy</button>
          <button class="btn btn-secondary btn-sm btn-hist-del" data-id="${item.id}">Delete</button>
        </div>
      `;
      historyList.appendChild(el);
    });

    historyList.querySelectorAll('.btn-hist-copy').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        const item = historyItems.find((i) => i.id === id);
        if (item) {
          navigator.clipboard.writeText(item.text);
          showToast('Copied to clipboard');
        }
      });
    });

    historyList.querySelectorAll('.btn-hist-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        historyItems = historyItems.filter((i) => i.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(historyItems));
        renderHistory();
      });
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- App Share & Link QR ---
  function getAppShareUrl() {
    if (window.location.protocol.startsWith('http') &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1') {
      return window.location.origin + window.location.pathname;
    }
    return GITHUB_PAGES_URL;
  }

  function openShareAppModal() {
    const url = getAppShareUrl();
    appUrlDisplay.textContent = url;
    shareAppModal.classList.remove('hidden');

    if (!appShareQrInstance) {
      appShareQrInstance = new QRCode(appUrlQrTarget, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      appShareQrInstance.clear();
      appShareQrInstance.makeCode(url);
    }
  }

  function closeShareAppModal() {
    shareAppModal.classList.add('hidden');
  }

  // --- Modals Setup ---
  function setupModals() {
    // Share App Modal
    btnShareAppModal.addEventListener('click', openShareAppModal);
    if (btnShareAppBanner) {
      btnShareAppBanner.addEventListener('click', openShareAppModal);
    }
    btnCloseShareApp.addEventListener('click', closeShareAppModal);
    shareAppModal.addEventListener('click', (e) => {
      if (e.target === shareAppModal) closeShareAppModal();
    });
    btnCopyAppUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(getAppShareUrl()).then(() => {
        showToast('App link copied to clipboard!');
      }).catch(() => {
        showToast('Could not copy link');
      });
    });

    // About Modal
    btnAboutModal.addEventListener('click', () => aboutModal.classList.remove('hidden'));
    btnCloseAbout.addEventListener('click', () => aboutModal.classList.add('hidden'));
    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) aboutModal.classList.add('hidden');
    });

    // Fullscreen QR Modal
    btnCloseFullscreen.addEventListener('click', closeFullscreenQR);
    fullscreenModal.addEventListener('click', (e) => {
      if (e.target === fullscreenModal) closeFullscreenQR();
    });

    // Clear History
    btnClearHistory.addEventListener('click', () => {
      if (confirm('Clear all transfer history?')) {
        historyItems = [];
        localStorage.removeItem(STORAGE_KEY);
        renderHistory();
      }
    });
  }

  // --- Offline & Network Status ---
  function setupNetworkStatus() {
    function updateBadge() {
      if (!navigator.onLine) {
        networkBadge.innerHTML = '<span class="status-dot"></span> Air-Gapped (Offline)';
        networkBadge.style.color = '#38bdf8';
        networkBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      } else {
        networkBadge.innerHTML = '<span class="status-dot"></span> Offline Ready';
        networkBadge.style.color = '#34d399';
        networkBadge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      }
    }

    window.addEventListener('online', updateBadge);
    window.addEventListener('offline', updateBadge);
    updateBadge();
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then((reg) => {
          console.log('AirCopy ServiceWorker registered:', reg.scope);
        }).catch((err) => {
          console.log('AirCopy ServiceWorker registration failed:', err);
        });
      });
    }
  }

  // Run initial setup
  init();
})();
