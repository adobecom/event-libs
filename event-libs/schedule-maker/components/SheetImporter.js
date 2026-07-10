import { html } from '../htm-wrapper.js';
import { useState, useEffect } from '../../v1/deps/htm-preact.js';
import { useSchedulesOperations, useSchedulesData } from '../context/SchedulesContext.js';
import { useNavigation } from '../context/NavigationContext.js';

export default function SheetImporter() {
  const { importSheetScheduleName } = useNavigation();
  const { createAndAddSchedule } = useSchedulesOperations();
  const { setActiveSchedule } = useSchedulesData();
  const { goToEditSchedule, clearImportSheetScheduleName } = useNavigation();
  const [xlsx, setXlsx] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [sheetData, setSheetData] = useState([]);
  const [columnMapping, setColumnMapping] = useState({
    startDateTime: '',
    title: '',
    streamId: '',
    fragmentPath: '',
  });

  const propertyLabels = {
    startDateTime: 'Timestamp / Servertime',
    title: 'Block title',
    streamId: 'Mobile Rider Stream ID',
    fragmentPath: 'Fragment path',
  };

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const { default: XLSX } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
        setXlsx(XLSX);
      } catch (err) {
        window.lana?.log(`Failed to load xlsx library: ${err}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchLibrary();
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const parsedWorkbook = xlsx.read(data, { type: 'array' });
        setWorkbook(parsedWorkbook);
        setSelectedSheet('');
        setSheetData([]);
        setColumnMapping({ startDateTime: '', title: '', streamId: '', fragmentPath: '' });
      } catch (error) {
        window.lana?.log(`Error reading file: ${error}`);
        // eslint-disable-next-line no-alert
        alert('Error reading file. Please make sure it\'s a valid Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetSelection = (sheetName) => {
    setSelectedSheet(sheetName);
    if (workbook && workbook.Sheets[sheetName]) {
      const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      setSheetData(jsonData);
    }
  };

  const getAvailableColumns = () => (sheetData.length === 0 ? [] : sheetData[0] || []);

  const renderPreviewRows = () => {
    const rows = sheetData.slice(1, 4);
    const mappedColumns = Object.entries(columnMapping).filter(([, col]) => col);
    return rows.map((row) => {
      const cells = mappedColumns.map(([, col]) => {
        const colIndex = getAvailableColumns().indexOf(col);
        return html`<td>${row[colIndex] || ''}</td>`;
      });
      return html`<tr>${cells}</tr>`;
    });
  };

  const handleColumnMappingChange = (property, columnName) => {
    setColumnMapping((prev) => ({ ...prev, [property]: columnName }));
  };

  const convertToBlocks = () => {
    if (sheetData.length < 2) return [];
    const headers = sheetData[0];
    const rows = sheetData.slice(1);
    return rows.map((row) => {
      const block = {};
      Object.entries(columnMapping).forEach(([property, columnName]) => {
        if (columnName && headers.includes(columnName)) {
          const value = row[headers.indexOf(columnName)] || '';
          if (property === 'streamId') {
            block.liveStream = { provider: 'MobileRider', streamId: value };
            block.includeLiveStream = Boolean(value);
          } else {
            block[property] = value;
          }
        }
      });
      block.id = `block-${crypto.randomUUID()}`;
      if (!block.liveStream) {
        block.liveStream = { provider: 'MobileRider', streamId: '' };
        block.includeLiveStream = false;
      }
      block.startDateTime = new Date(block.startDateTime).getTime() || 0;
      block.isComplete = false;
      block.isEditingBlockTitle = false;
      return block;
    }).filter((block) => block.title && block.startDateTime);
  };

  const handleAddSchedule = async () => {
    const blocks = convertToBlocks();
    if (blocks.length === 0) {
      // eslint-disable-next-line no-alert
      alert('No valid blocks found. Please check your column mapping.');
      return;
    }
    const newSchedule = await createAndAddSchedule({ title: importSheetScheduleName, blocks });
    if (newSchedule.error) return;
    setUploadedFile(null);
    setWorkbook(null);
    setSelectedSheet('');
    setSheetData([]);
    setColumnMapping({ startDateTime: '', title: '', streamId: '', fragmentPath: '' });
    setActiveSchedule(newSchedule);
    clearImportSheetScheduleName();
    goToEditSchedule();
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setWorkbook(null);
    setSelectedSheet('');
    setSheetData([]);
  };

  if (isLoading) return html`<div class="sheet-importer"><p>Loading...</p></div>`;

  return html`
    <div class="sheet-importer">
      <h2>Import sheet</h2>

      ${!uploadedFile ? html`
        <label for="file-upload" class="sheet-importer__file-label" aria-label="Choose a file">
          <span>Choose a file</span>
        </label>
        <input \
          id="file-upload" \
          type="file" \
          accept=".xlsx,.xls" \
          onChange=${handleFileUpload} \
          style="display: none;" \
        />
      ` : html`
        <button class="sheet-importer__file-remove" onClick=${handleRemoveFile} aria-label="Remove file">
          ${uploadedFile.name}
          <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 18 18" width="18">
            <path fill="currentColor" fill-rule="evenodd" d="M13.243,3.343,9,7.586,4.757,3.343a.5.5,0,0,0-.707,0l-.707.707a.5.5,0,0,0,0,.707L7.586,9,3.343,13.243a.5.5,0,0,0,0,.707l.707.707a.5.5,0,0,0,.707,0L9,10.414l4.243,4.243a.5.5,0,0,0,.707,0l.707-.707a.5.5,0,0,0,0-.707L10.414,9l4.243-4.243a.5.5,0,0,0,0-.707l-.707-.707A.5.5,0,0,0,13.243,3.343Z"/>
          </svg>
        </button>
      `}

      ${workbook ? html`
        <div class="sheet-importer__sheet-selection">
          <sp-field-label for="sheet-select" size="l">Select a sheet</sp-field-label>
          <sp-picker id="sheet-select" class="sheet-importer__sheet-select" size="l" value=${selectedSheet} onChange=${(e) => handleSheetSelection(e.target.value)}>
            <span slot="label">Choose a sheet...</span>
            ${workbook.SheetNames.map((sheetName) => html`
              <sp-menu-item value=${sheetName}>${sheetName}</sp-menu-item>
            `)}
          </sp-picker>
        </div>
      ` : ''}

      ${selectedSheet && sheetData.length > 0 ? html`
        <div class="sheet-importer__mapping">
          <h3>Map fields to columns</h3>
          <div class="sheet-importer__mapping-items">
            ${Object.entries(columnMapping).map(([property, selectedColumn]) => html`
              <div class="sheet-importer__mapping-item">
                <sp-field-label for=${`mapping-${property}`} size="l">${propertyLabels[property]}:</sp-field-label>
                <sp-picker id=${`mapping-${property}`} class="sheet-importer__mapping-picker" size="l" value=${selectedColumn} onChange=${(e) => handleColumnMappingChange(property, e.target.value)}>
                  <span slot="label">Select column...</span>
                  ${getAvailableColumns().map((column) => html`
                    <sp-menu-item value=${column}>${column}</sp-menu-item>
                  `)}
                </sp-picker>
              </div>
            `)}
          </div>
        </div>
      ` : ''}

      ${selectedSheet && sheetData.length > 0 && Object.values(columnMapping).some((v) => v) ? html`
        <div class="sheet-importer__preview">
          <h3>Preview (First 3 rows)</h3>
          <div class="sheet-importer__preview-table">
            <table>
              <thead>
                <tr>
                  ${Object.entries(columnMapping).filter(([, col]) => col).map(([prop]) => html`<th>${propertyLabels[prop]}</th>`)}
                </tr>
              </thead>
              <tbody>${renderPreviewRows()}</tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${selectedSheet && sheetData.length > 0 ? html`
        <div class="sheet-importer__actions">
          <sp-button class="sheet-importer__add-button" size="l" static-color="black" onClick=${handleAddSchedule} disabled=${!Object.values(columnMapping).some((v) => v)}>
            Add schedule
          </sp-button>
        </div>
      ` : ''}
    </div>
  `;
}
