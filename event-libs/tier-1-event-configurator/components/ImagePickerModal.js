import { useState, useEffect, html } from '../../v1/deps/htm-preact.js';
import Modal from './Modal.js';
import { useDA } from '../context/DAContext.js';
import { uploadAndPublishMedia } from '../scripts/da-controller.js';
import { buildMediaAssetPath } from '../utils.js';

// `accept` on the file input is only a picker hint, not enforcement — the browser still lets
// a user drag/select a non-JPEG file (or one just misnamed .jpg), so isJpeg re-checks the
// actual file. Falls back to the extension when `type` is blank, since some OS file pickers
// don't always set a MIME type.
function isJpeg(file) {
  if (file.type) return file.type === 'image/jpeg';
  return /\.jpe?g$/i.test(file.name || '');
}

// Uploads a local image straight into the app's own fixed DA folder — authors never pick or
// see a destination — then previews and publishes it so the field ends up with a real, live
// aem.live URL instead of a raw content.da.live storage link.
export default function ImagePickerModal({
  isOpen, onClose, onUploaded, eventId,
}) {
  const { org, repo } = useDA();

  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setUploadError(null);
  }, [isOpen]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    if (selected && !isJpeg(selected)) {
      setFile(null);
      setUploadError('Only JPG images are supported.');
      e.target.value = '';
      return;
    }
    setFile(selected);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const path = buildMediaAssetPath(eventId, file.name);
      const result = await uploadAndPublishMedia(org, repo, path, file);
      if (!result.ok) {
        if (result.status === 401) setUploadError('Unauthorized — sign in at da.live first.');
        else if (result.status === 0) setUploadError('Unable to reach DA — sign in at da.live first, or check your connection.');
        else setUploadError(result.error || `Upload failed (${result.status})`);
        return;
      }
      onUploaded(result.url);
    } finally {
      setIsUploading(false);
    }
  };

  // Every close path (header ×, Escape, backdrop, Cancel) routes through this rather than the
  // raw onClose prop — closing mid-upload would leave the upload running against a modal a
  // caller may reopen for a different row before it settles, and its completion callback would
  // then wrongly close *that* row's picker.
  const handleClose = () => {
    if (isUploading) return;
    onClose();
  };

  if (!isOpen) return null;

  return html`
    <${Modal} isOpen=${isOpen} onClose=${handleClose} title="Add image" size="small" showActions=${false}>
      <div class="tec-fb-wrapper">
        <p class="tec-editor__section-hint">Choose a JPG image to upload. It's stored, previewed, and published automatically.</p>
        <input type="file" accept="image/jpeg" onChange=${handleFileChange} aria-label="Choose JPG image file" />
        ${file && html`<p class="tec-editor__section-hint">Selected: ${file.name} (${Math.round(file.size / 1024)} KB)</p>`}
        ${uploadError && html`<p class="tec-editor__error">${uploadError}</p>`}
        <div class="tec-fb-actions">
          <button type="button" class="tec-btn tec-btn--outline tec-btn--l" onClick=${handleClose} disabled=${isUploading}>Cancel</button>
          <button type="button" class="tec-btn tec-btn--primary tec-btn--l" onClick=${handleUpload} disabled=${!file || isUploading}>
            ${isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </${Modal}>
  `;
}
