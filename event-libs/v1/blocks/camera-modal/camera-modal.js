import { createTag } from '../../utils/utils.js';

let activeStream = null;

function stopCamera() {
  activeStream?.getTracks().forEach((track) => track.stop());
  activeStream = null;
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

export default async function init(el) {
  const video = createTag('video', { class: 'camera-modal-feed', autoplay: true, muted: true, playsinline: '' });
  const cameraPane = createTag('div', { class: 'camera-modal-camera' }, video);

  const closeBtn = createTag('button', { class: 'con-button outline camera-modal-close', type: 'button' }, 'Close');
  closeBtn.addEventListener('click', () => {
    el.dispatchEvent(new CustomEvent('camera-modal:close', { bubbles: true }));
  });
  const actionsPane = createTag('div', { class: 'camera-modal-actions' }, closeBtn);

  el.innerHTML = '';
  el.classList.add('camera-modal-content');
  el.append(actionsPane, cameraPane);

  const onModalClosed = () => {
    window.removeEventListener('milo:modal:closed', onModalClosed);
    stopCamera();
  };
  window.addEventListener('milo:modal:closed', onModalClosed);

  await startCamera(video, cameraPane);
}
