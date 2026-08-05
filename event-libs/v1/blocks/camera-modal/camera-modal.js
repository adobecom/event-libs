import { createTag, getMetadata, getEventConfig } from '../../utils/utils.js';
import { createSmartDateRange } from '../../utils/date-time-helper.js';
import { loadLiteRt, loadAndCompile, Tensor } from 'https://cdn.jsdelivr.net/npm/@litertjs/core/+esm';

const MODEL_INPUT = 256;
const COLORS = [
  { label: 'Red', value: '#e03131' },
  { label: 'Green', value: '#2f9e44' },
  { label: 'Yellow', value: '#f08c00' },
];

let activeStream = null;
let model = null;
let backend = 'webgpu';
let running = false;
let bgColor = null;
let eventInfo = null;

const inputBuf = new Float32Array(3 * MODEL_INPUT * MODEL_INPUT);

const offscreen = document.createElement('canvas');
offscreen.width = MODEL_INPUT;
offscreen.height = MODEL_INPUT;
const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

const maskCanvas = document.createElement('canvas');
maskCanvas.width = MODEL_INPUT;
maskCanvas.height = MODEL_INPUT;
const maskCtx = maskCanvas.getContext('2d');

const maskFull = document.createElement('canvas');
const maskFullCtx = maskFull.getContext('2d');
const personLayer = document.createElement('canvas');
const personCtx = personLayer.getContext('2d');

function stopCamera() {
  running = false;
  bgColor = null;
  eventInfo = null;
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

function preprocess(video) {
  offCtx.drawImage(video, 0, 0, MODEL_INPUT, MODEL_INPUT);
  const { data } = offCtx.getImageData(0, 0, MODEL_INPUT, MODEL_INPUT);
  const size = MODEL_INPUT * MODEL_INPUT;
  for (let i = 0; i < size; i++) {
    inputBuf[i * 3] = data[i * 4] / 255;
    inputBuf[i * 3 + 1] = data[i * 4 + 1] / 255;
    inputBuf[i * 3 + 2] = data[i * 4 + 2] / 255;
  }
}

function maskCurve(v) {
  const lo = 0.35;
  const hi = 0.65;
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

function buildMask(maskData) {
  const img = maskCtx.createImageData(MODEL_INPUT, MODEL_INPUT);
  for (let i = 0; i < maskData.length; i++) {
    const a = (Math.max(0, Math.min(255, maskCurve(maskData[i]) * 255))) | 0;
    img.data[i * 4] = 255;
    img.data[i * 4 + 1] = 255;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = a;
  }
  maskCtx.putImageData(img, 0, 0);
}

function getMaskedPerson(video, w, h) {
  maskFull.width = w;
  maskFull.height = h;
  maskFullCtx.imageSmoothingEnabled = true;
  maskFullCtx.filter = 'blur(2px)';
  maskFullCtx.drawImage(maskCanvas, 0, 0, w, h);
  maskFullCtx.filter = 'none';

  personLayer.width = w;
  personLayer.height = h;
  personCtx.clearRect(0, 0, w, h);
  personCtx.drawImage(video, 0, 0, w, h);
  personCtx.globalCompositeOperation = 'destination-in';
  personCtx.drawImage(maskFull, 0, 0);
  personCtx.globalCompositeOperation = 'source-over';
  return personLayer;
}

function truncateToWidth(outCtx, text, maxWidth) {
  if (outCtx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && outCtx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function getFooterLayout(w) {
  const titleSize = Math.max(18, Math.round(w * 0.055));
  const lineSize = Math.max(13, Math.round(w * 0.032));
  const paddingX = Math.round(w * 0.045);
  const paddingY = Math.round(w * 0.035);
  const lineGap = Math.round(lineSize * 0.5);

  const lines = [{ text: eventInfo.title, size: titleSize, weight: 700 }];
  if (eventInfo.city) lines.push({ text: eventInfo.city, size: lineSize, weight: 600 });
  if (eventInfo.dateRange) lines.push({ text: eventInfo.dateRange, size: lineSize, weight: 600 });

  const height = paddingY * 2 + lines.reduce((sum, line, i) => (
    sum + Math.round(line.size * 1.15) + (i < lines.length - 1 ? lineGap : 0)
  ), 0);

  return { titleSize, lineSize, paddingX, paddingY, lineGap, lines, height };
}

function drawEventFooter(outCtx, w, h) {
  const { paddingX, paddingY, lineGap, lines, height } = getFooterLayout(w);

  outCtx.fillStyle = '#292929';
  outCtx.fillRect(0, h, w, height);

  outCtx.fillStyle = '#fff';
  outCtx.textBaseline = 'top';
  let y = h + paddingY;
  lines.forEach((line) => {
    outCtx.font = `${line.weight} ${line.size}px 'Adobe Clean', Arial, sans-serif`;
    const text = truncateToWidth(outCtx, line.text, w - paddingX * 2);
    outCtx.fillText(text, paddingX, y);
    y += Math.round(line.size * 1.15) + lineGap;
  });
}

function renderFrame(video, outCanvas, outCtx) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;

  const footerHeight = eventInfo ? getFooterLayout(w).height : 0;

  outCanvas.width = w;
  outCanvas.height = h + footerHeight;
  outCtx.clearRect(0, 0, outCanvas.width, outCanvas.height);

  outCtx.drawImage(video, 0, 0, w, h);
  if (bgColor) {
    const inset = Math.min(w, h) * 0.08;
    outCtx.fillStyle = bgColor;
    outCtx.beginPath();
    outCtx.rect(0, 0, w, h);
    outCtx.roundRect(inset, inset, w - inset * 2, h - inset * 2, 8);
    outCtx.fill('evenodd');

    // ponytail: clip person to border region only — center stays raw video, no segmentation artifacts
    outCtx.save();
    outCtx.beginPath();
    outCtx.rect(0, 0, w, h);
    outCtx.roundRect(inset, inset, w - inset * 2, h - inset * 2, 8);
    outCtx.clip('evenodd');
    outCtx.drawImage(getMaskedPerson(video, w, h), 0, 0);
    outCtx.restore();
  }

  if (eventInfo) drawEventFooter(outCtx, w, h);
}

async function segmentLoop(video, outCanvas, outCtx) {
  if (!running) return;

  preprocess(video);
  let tensor = new Tensor(inputBuf, [1, MODEL_INPUT, MODEL_INPUT, 3]);
  try {
    if (backend === 'webgpu') tensor = await tensor.moveTo('webgpu');
    const results = await model.run(tensor);
    const out = await results[0].data();
    buildMask(out);
    renderFrame(video, outCanvas, outCtx);
    results[0].delete();
  } catch (e) {
    window.lana?.log(`Segmentation error: ${e.message}`);
  }
  tensor.delete();
  if (running) requestAnimationFrame(() => segmentLoop(video, outCanvas, outCtx));
}

// ponytail: raw-feed fallback loop when no color selected — no model inference needed
function rawLoop(video, outCanvas, outCtx) {
  if (!running) return;
  renderFrame(video, outCanvas, outCtx);
  requestAnimationFrame(() => rawLoop(video, outCanvas, outCtx));
}

function startLoop(video, outCanvas, outCtx) {
  if (!running) return;
  if (bgColor && model) {
    segmentLoop(video, outCanvas, outCtx);
  } else {
    rawLoop(video, outCanvas, outCtx);
  }
}

async function initModel(modelUrl) {
  const wasmUrl = 'https://cdn.jsdelivr.net/npm/@litertjs/core/wasm/';
  await loadLiteRt(wasmUrl, { jspi: true });
  try {
    model = await loadAndCompile(modelUrl, { accelerator: 'webgpu' });
    backend = 'webgpu';
  } catch {
    model = await loadAndCompile(modelUrl, { accelerator: 'wasm' });
    backend = 'wasm';
  }
}

async function startCamera(videoEl, cameraPane) {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia unsupported');
    activeStream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoEl.srcObject = activeStream;
    await videoEl.play();
  } catch (e) {
    window.lana?.log(`Error while starting camera: ${JSON.stringify(e, null, 2)}`);
    cameraPane.append(createTag('p', { class: 'camera-modal-error' }, 'Unable to access the camera.'));
  }
}

function getLocaleString() {
  const locale = getMetadata('locale') || getEventConfig()?.miloConfig?.locale?.ietf || 'en-US';
  return locale === 'fr-FR' ? locale : 'en-US';
}

function getEventCity() {
  try {
    return JSON.parse(getMetadata('venue'))?.city;
  } catch (e) {
    return null;
  }
}

function getEventInfo() {
  const title = getMetadata('event-title');
  if (!title) return null;

  const city = getEventCity();

  const startMillis = getMetadata('local-start-time-millis');
  const endMillis = getMetadata('local-end-time-millis');
  const timezone = getMetadata('timezone');
  const dateRange = startMillis && endMillis
    ? createSmartDateRange(+startMillis, +endMillis, getLocaleString(), timezone)
    : null;

  return { title, city, dateRange };
}

function buildSwatches(actionsPane, video, outCanvas, outCtx) {
  const label = createTag('p', { class: 'camera-modal-bg-label' }, 'Backgrounds');
  const swatchWrap = createTag('div', { class: 'camera-modal-swatches' });

  const noneBtn = createTag('button', {
    class: 'camera-modal-swatch camera-modal-swatch-none active',
    type: 'button',
    'aria-label': 'No background',
  });

  const setActive = (btn) => {
    swatchWrap.querySelectorAll('.camera-modal-swatch').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  };

  noneBtn.addEventListener('click', () => {
    bgColor = null;
    setActive(noneBtn);
    startLoop(video, outCanvas, outCtx);
  });
  swatchWrap.append(noneBtn);

  COLORS.forEach(({ label: name, value }) => {
    const btn = createTag('button', {
      class: 'camera-modal-swatch',
      type: 'button',
      style: `background: ${value}`,
      'aria-label': `${name} background`,
    });
    btn.addEventListener('click', () => {
      bgColor = value;
      setActive(btn);
      startLoop(video, outCanvas, outCtx);
    });
    swatchWrap.append(btn);
  });

  actionsPane.prepend(swatchWrap);
  actionsPane.prepend(label);
}

export default async function init(el) {
  const video = createTag('video', { class: 'camera-modal-feed', autoplay: true, muted: true, playsinline: '' });
  const outCanvas = createTag('canvas', { class: 'camera-modal-output' });
  const outCtx = outCanvas.getContext('2d');
  const cameraPane = createTag('div', { class: 'camera-modal-camera' }, outCanvas);
  cameraPane.append(video);

  eventInfo = getEventInfo();

  const loadingEl = createTag('div', { class: 'camera-modal-loading' }, 'Loading AI model…');

  const downloadBtn = createTag('button', { class: 'con-button blue camera-modal-download', type: 'button' }, 'Download Photo');
  downloadBtn.addEventListener('click', () => {
    const link = createTag('a', { href: outCanvas.toDataURL('image/png'), download: 'photo.png' });
    link.click();
  });

  const closeBtn = createTag('button', { class: 'con-button outline camera-modal-close', type: 'button' }, 'Close');
  closeBtn.addEventListener('click', () => {
    el.dispatchEvent(new CustomEvent('camera-modal:close', { bubbles: true }));
  });
  const actionsPane = createTag('div', { class: 'camera-modal-actions' });
  actionsPane.append(downloadBtn, closeBtn);

  el.innerHTML = '';
  el.classList.add('camera-modal-content');
  el.append(cameraPane, actionsPane);

  const onModalClosed = () => {
    window.removeEventListener('milo:modal:closed', onModalClosed);
    stopCamera();
  };
  window.addEventListener('milo:modal:closed', onModalClosed);

  await startCamera(video, cameraPane);

  running = true;
  rawLoop(video, outCanvas, outCtx);

  if (model) {
    buildSwatches(actionsPane, video, outCanvas, outCtx);
  } else {
    cameraPane.append(loadingEl);
    const modelUrl = new URL('./selfie_segmentation.tflite', import.meta.url).href;
    try {
      await initModel(modelUrl);
      loadingEl.remove();
      buildSwatches(actionsPane, video, outCanvas, outCtx);
    } catch (e) {
      window.lana?.log(`Failed to load AI model: ${e.message}`);
      loadingEl.textContent = 'AI background removal unavailable';
    }
  }
}
