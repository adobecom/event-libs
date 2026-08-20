import {
  useState, useCallback, useEffect, useRef, html,
} from '../../v1/deps/htm-preact.js';
import Modal from './Modal.js';
import LoadingInline from './LoadingInline.js';
import { useDA } from '../context/DAContext.js';
import {
  listFolder, getAemLiveUrl, uploadAndPublishMedia,
} from '../scripts/da-controller.js';

const IMAGE_EXT_PATTERN = /^(jpe?g|png|gif|webp|svg)$/i;

async function fetchFolderContents(org, repo, path) {
  const result = await listFolder(org, repo, path);
  if (!result.ok) {
    if (result.status === 401) throw new Error('Unauthorized — sign in at da.live first.');
    if (result.status === 0) throw new Error('Unable to reach DA — sign in at da.live first, or check your connection.');
    throw new Error(`Failed to load (${result.status})`);
  }
  return result.data || [];
}

function fetchFolders(org, repo, path) {
  return fetchFolderContents(org, repo, path).then((items) => items.filter((item) => !item.ext));
}

function fetchImages(org, repo, path) {
  return fetchFolderContents(org, repo, path).then(
    (items) => items.filter((item) => IMAGE_EXT_PATTERN.test(item.ext || '')),
  );
}

function getItemName(fullPath) {
  return fullPath.split('/').pop();
}

function stripOrgRepo(fullPath, org, repo) {
  return fullPath.replace(`/${org}/${repo}`, '');
}

const PHASES = { FOLDER: 'folder', UPLOAD: 'upload' };

export default function ImagePickerModal({ isOpen, onClose, onUploaded }) {
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
  const [existingImages, setExistingImages] = useState([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imagesError, setImagesError] = useState(null);

  const columnsRef = useRef(null);
  const requestSeqRef = useRef(0);
  const imagesSeqRef = useRef(0);

  useEffect(() => {
    if (columnsRef.current) columnsRef.current.scrollLeft = columnsRef.current.scrollWidth;
  }, [columnItems.length]);

  const loadColumn = useCallback(async (colIndex, path) => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    setLoadingColIndex(colIndex);
    setBrowseError(null);
    try {
      const items = await fetchFolders(org, repo, path);
      if (requestSeqRef.current !== seq) return;
      setColumnItems((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = items; return next; });
      setColumnPaths((prev) => { const next = prev.slice(0, colIndex); next[colIndex] = path; return next; });
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setBrowseError(err.message);
      setColumnItems((prev) => prev.slice(0, colIndex));
      setColumnPaths((prev) => prev.slice(0, colIndex));
    } finally {
      if (requestSeqRef.current === seq) setLoadingColIndex(null);
    }
  }, [org, repo]);

  useEffect(() => {
    if (!isOpen || !org || !repo) return;
    setPhase(PHASES.FOLDER);
    setColumnItems([]);
    setColumnPaths([]);
    setActiveFolderPaths([]);
    setSelectedFolderPath('/');
    setNewFolderName('');
    setFile(null);
    setUploadError(null);
    setBrowseError(null);
    loadColumn(0, '/');
  }, [isOpen, org, repo]);

  useEffect(() => {
    if (!isOpen || !org || !repo || phase !== PHASES.FOLDER) return;
    const seq = imagesSeqRef.current + 1;
    imagesSeqRef.current = seq;
    setIsLoadingImages(true);
    setImagesError(null);
    fetchImages(org, repo, selectedFolderPath)
      .then((items) => {
        if (imagesSeqRef.current !== seq) return;
        setExistingImages(items);
      })
      .catch((err) => {
        if (imagesSeqRef.current !== seq) return;
        setImagesError(err.message);
        setExistingImages([]);
      })
      .finally(() => {
        if (imagesSeqRef.current === seq) setIsLoadingImages(false);
      });
  }, [isOpen, org, repo, phase, selectedFolderPath]);

  const handleSelectExisting = (item) => {
    onUploaded(getAemLiveUrl(org, repo, item.path));
  };

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
    if (!name || name.includes('/') || name === '.' || name === '..') return;
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
    setFile(e.target.files?.[0] || null);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const result = await uploadAndPublishMedia(org, repo, selectedFolderPath, file);
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

  const handleClose = () => {
    if (isUploading) return;
    onClose();
  };

  if (!isOpen) return null;

  const breadcrumb = buildBreadcrumb();

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
              disabled=${!newFolderName.trim() || newFolderName.includes('/') || newFolderName.trim() === '.' || newFolderName.trim() === '..' || loadingColIndex !== null}
            >Add folder</button>
          </div>
          <p class="tec-editor__section-hint">New folders appear in DA once you upload the first image into them.</p>
          <div class="tec-fb-selected-path">
            <span class="tec-fb-selected-label">Selected:</span>
            <code class="tec-fb-selected-value">${selectedFolderPath}</code>
          </div>

          <p class="tec-editor__section-hint">Or pick an image already in this folder:</p>
          ${imagesError && html`<div class="tec-fb-error">${imagesError}</div>`}
          ${isLoadingImages && html`<${LoadingInline} label="Loading images…" />`}
          ${!isLoadingImages && existingImages.length === 0 && !imagesError && html`
            <p class="tec-editor__section-hint">No images in this folder yet.</p>
          `}
          ${existingImages.length > 0 && html`
            <div class="tec-fb-image-grid">
              ${existingImages.map((item) => html`
                <button
                  type="button"
                  key=${item.path}
                  class="tec-fb-image-thumb"
                  title=${getItemName(item.path)}
                  onClick=${() => handleSelectExisting(item)}
                >
                  <img src=${getAemLiveUrl(org, repo, item.path)} alt=${getItemName(item.path)} loading="lazy" />
                  <span class="tec-fb-image-thumb-name">${getItemName(item.path)}</span>
                </button>
              `)}
            </div>
          `}

          <div class="tec-fb-actions">
            <button type="button" class="tec-btn tec-btn--outline tec-btn--l" onClick=${handleClose}>Cancel</button>
            <button type="button" class="tec-btn tec-btn--primary tec-btn--l" onClick=${() => setPhase(PHASES.UPLOAD)}>Upload new…</button>
          </div>
        </div>
      `}

      ${phase === PHASES.UPLOAD && html`
        <div class="tec-fb-wrapper">
          <p class="tec-editor__section-hint">
            Uploading into <code class="tec-fb-selected-value">${selectedFolderPath}</code>.
            <button type="button" class="tec-btn tec-btn--quiet tec-btn--s" onClick=${() => setPhase(PHASES.FOLDER)}>← Change folder</button>
          </p>
          <input type="file" accept="image/*" onChange=${handleFileChange} aria-label="Choose image file" />
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
