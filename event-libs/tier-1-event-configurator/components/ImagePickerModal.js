import {
  useState, useCallback, useEffect, useRef, html,
} from '../../v1/deps/htm-preact.js';
import Modal from './Modal.js';
import LoadingInline from './LoadingInline.js';
import { useDA } from '../context/DAContext.js';
import { listFolder, uploadAndPublishMedia } from '../scripts/da-controller.js';
import { getDefaultMediaFolder, buildMediaFileName } from '../utils.js';

async function fetchFolders(org, repo, path) {
  const result = await listFolder(org, repo, path);
  if (!result.ok) {
    if (result.status === 401) throw new Error('Unauthorized — sign in at da.live first.');
    if (result.status === 0) throw new Error('Unable to reach DA — sign in at da.live first, or check your connection.');
    throw new Error(`Failed to load (${result.status})`);
  }
  return (result.data || []).filter((item) => !item.ext);
}

function getItemName(fullPath) {
  return fullPath.split('/').pop();
}

function stripOrgRepo(fullPath, org, repo) {
  return fullPath.replace(`/${org}/${repo}`, '');
}

// `accept` on the file input is only a picker hint, not enforcement — the browser still lets
// a user drag/select a non-JPEG file (or one just misnamed .jpg), so isJpeg re-checks the
// actual file. Falls back to the extension when `type` is blank, since some OS file pickers
// don't always set a MIME type.
function isJpeg(file) {
  if (file.type) return file.type === 'image/jpeg';
  return /\.jpe?g$/i.test(file.name || '');
}

const PHASES = { FOLDER: 'folder', UPLOAD: 'upload' };

const SAFE_FOLDER_NAME_RE = /^[A-Za-z0-9._-]+$/;

// Two-phase modal: pick (or name) a DA folder, then pick a JPG file and upload it there. DA
// has no folder-creation endpoint — "Add folder" below is purely client-side navigation into
// a not-yet-fetched, empty path; that path only becomes a real DA folder once the upload's
// POST lands the first file in it. The upload itself goes through uploadAndPublishMedia
// (upload, then preview, then publish), so the field ends up with a real, live aem.live URL.
export default function ImagePickerModal({
  isOpen, onClose, onUploaded, eventId,
}) {
  const { org, repo } = useDA();

  const [phase, setPhase] = useState(PHASES.FOLDER);
  const [columnPaths, setColumnPaths] = useState([]);
  const [columnItems, setColumnItems] = useState([]);
  const [loadingColIndex, setLoadingColIndex] = useState(null);
  const [browseError, setBrowseError] = useState(null);
  const [activeFolderPaths, setActiveFolderPaths] = useState([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState('/');
  const [newFolderName, setNewFolderName] = useState('');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const columnsRef = useRef(null);

  useEffect(() => {
    if (columnsRef.current) columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
  }, [columnItems.length]);

  const loadColumn = useCallback(async (colIndex, path) => {
    setLoadingColIndex(colIndex);
    setBrowseError(null);
    try {
      const items = await fetchFolders(org, repo, path);
      setColumnItems((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = items; return next; });
      setColumnPaths((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = path; return next; });
    } catch (err) {
      setBrowseError(err.message);
    } finally {
      setLoadingColIndex(null);
    }
  }, [org, repo]);

  // Fresh repo-root browse every time the modal opens. selectedFolderPath still defaults to
  // this event's own conventional folder (unseen until the author actually browses/creates
  // elsewhere), so doing nothing but hitting Next still lands in an organized location.
  useEffect(() => {
    if (!isOpen || !org || !repo) return;
    setPhase(PHASES.FOLDER);
    setColumnItems([]);
    setColumnPaths([]);
    setActiveFolderPaths([]);
    setSelectedFolderPath(getDefaultMediaFolder(eventId));
    setNewFolderName('');
    setFile(null);
    setUploadError(null);
    setBrowseError(null);
    loadColumn(0, '/');
  }, [isOpen, org, repo, eventId]);

  const resetToRoot = () => {
    setActiveFolderPaths([]);
    setSelectedFolderPath('/');
    setNewFolderName('');
    setColumnItems((prev) => prev.slice(0, 1));
    setColumnPaths((prev) => prev.slice(0, 1));
  };

  const handleFolderClick = (colIndex, item) => {
    const path = stripOrgRepo(item.path, org, repo);
    setActiveFolderPaths((prev) => { const next = prev.slice(0, colIndex + 1); next[colIndex] = path; return next; });
    setSelectedFolderPath(path);
    setNewFolderName('');
    loadColumn(colIndex + 1, path);
  };

  const handleAddFolder = () => {
    const name = newFolderName.trim();
    if (!SAFE_FOLDER_NAME_RE.test(name)) return;
    // colIndex is the currently deepest loaded column (columnItems.length - 1) — the new
    // virtual folder is appended as the *next* column, one level below it, not overwritten
    // into it (that would wipe out the folder list currently on screen at this depth).
    const colIndex = activeFolderPaths.length;
    const parentPath = activeFolderPaths[colIndex - 1] || '/';
    const path = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    setActiveFolderPaths((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = path; return next; });
    setColumnItems((prev) => { const next = prev.slice(0, colIndex + 1); next[colIndex + 1] = []; return next; });
    setColumnPaths((prev) => { const next = prev.slice(0, colIndex + 1); next[colIndex + 1] = path; return next; });
    setSelectedFolderPath(path);
    setNewFolderName('');
  };

  const buildBreadcrumb = () => {
    const parts = [{ label: repo, path: null }];
    const deepest = activeFolderPaths[activeFolderPaths.length - 1];
    if (deepest) {
      const segments = deepest.split('/').filter(Boolean);
      segments.forEach((seg, i) => {
        parts.push({ label: seg, path: `/${segments.slice(0, i + 1).join('/')}` });
      });
    }
    return parts;
  };

  const handleBreadcrumbClick = (path) => {
    if (!path) {
      resetToRoot();
      loadColumn(0, '/');
      return;
    }
    const colIndex = columnPaths.indexOf(path);
    if (colIndex !== -1) {
      setColumnItems((prev) => prev.slice(0, colIndex + 1));
      setColumnPaths((prev) => prev.slice(0, colIndex + 1));
      setActiveFolderPaths((prev) => prev.slice(0, colIndex));
      setSelectedFolderPath(activeFolderPaths[colIndex - 1] || '/');
    }
  };

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
      const fileName = buildMediaFileName(file.name);
      const path = selectedFolderPath === '/' ? `/${fileName}` : `${selectedFolderPath}/${fileName}`;
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

  const breadcrumb = buildBreadcrumb();
  const deepestColIndex = columnItems.length - 1;

  return html`
    <${Modal} isOpen=${isOpen} onClose=${handleClose} title="Add image" size="large" showActions=${false}>
      ${phase === PHASES.FOLDER && html`
        <div class="tec-fb-wrapper">
          <p class="tec-editor__section-hint">Choose a DA folder to upload the image into, or type a new folder name below.</p>
          ${browseError && html`<div class="tec-fb-error">${browseError}</div>`}
          <div class="tec-fb-columns" ref=${columnsRef}>
            <div class="tec-fb-column">
              <div
                class="tec-fb-item ${selectedFolderPath === '/' ? 'tec-fb-item--active' : ''}"
                onClick=${resetToRoot}
                role="button"
                tabIndex="0"
                onKeyDown=${(e) => e.key === 'Enter' && resetToRoot()}
              >
                <span class="tec-fb-item-name">/ (repo root)</span>
                <span class="tec-fb-item-chevron">›</span>
              </div>
            </div>
            ${columnItems.map((items, i) => html`
              <div class="tec-fb-column" key=${i}>
                ${items.map((item) => {
                  const path = stripOrgRepo(item.path, org, repo);
                  const isActive = activeFolderPaths[i] === path;
                  return html`
                    <div
                      key=${item.path}
                      class="tec-fb-item ${isActive ? 'tec-fb-item--active' : ''}"
                      onClick=${() => handleFolderClick(i, item)}
                      role="button"
                      tabIndex="0"
                      onKeyDown=${(e) => e.key === 'Enter' && handleFolderClick(i, item)}
                    >
                      <span class="tec-fb-item-name">${getItemName(item.path)}</span>
                      <span class="tec-fb-item-chevron">›</span>
                    </div>
                  `;
                })}
              </div>
            `)}
            ${loadingColIndex !== null && html`
              <div class="tec-fb-column tec-fb-column--loading">
                <${LoadingInline} label="Loading…" />
              </div>
            `}
          </div>
          <nav class="tec-fb-breadcrumbs" aria-label="Path breadcrumb">
            ${breadcrumb.map((crumb, i) => html`
              ${i > 0 && html`<span class="tec-fb-breadcrumb-sep">›</span>`}
              <button
                type="button"
                class="tec-fb-breadcrumb-btn ${i === breadcrumb.length - 1 ? 'tec-fb-breadcrumb-btn--current' : ''}"
                onClick=${() => handleBreadcrumbClick(crumb.path)}
                disabled=${i === breadcrumb.length - 1}
              >${crumb.label}</button>
            `)}
          </nav>
          <div class="tec-fb-add-folder">
            <input
              type="text"
              class="tec-field tec-field--s"
              placeholder="New folder name"
              value=${newFolderName}
              onInput=${(e) => setNewFolderName(e.target.value)}
              aria-label="New folder name"
            />
            <button
              type="button"
              class="tec-btn tec-btn--outline tec-btn--s"
              onClick=${handleAddFolder}
              disabled=${!SAFE_FOLDER_NAME_RE.test(newFolderName.trim()) || loadingColIndex === deepestColIndex}
            >Add folder</button>
          </div>
          <p class="tec-editor__section-hint">Letters, numbers, dots, dashes, and underscores only. New folders appear in DA once you upload the first image into them.</p>
          <div class="tec-fb-selected-path">
            <span class="tec-fb-selected-label">Selected:</span>
            <code class="tec-fb-selected-value">${selectedFolderPath}</code>
          </div>
          <div class="tec-fb-actions">
            <button type="button" class="tec-btn tec-btn--outline tec-btn--l" onClick=${handleClose}>Cancel</button>
            <button type="button" class="tec-btn tec-btn--primary tec-btn--l" onClick=${() => setPhase(PHASES.UPLOAD)}>Next</button>
          </div>
        </div>
      `}

      ${phase === PHASES.UPLOAD && html`
        <div class="tec-fb-wrapper">
          <p class="tec-editor__section-hint">
            Uploading into <code class="tec-fb-selected-value">${selectedFolderPath}</code>.
            <button type="button" class="tec-btn tec-btn--quiet tec-btn--s" onClick=${() => setPhase(PHASES.FOLDER)}>← Change folder</button>
          </p>
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
      `}
    </${Modal}>
  `;
}
