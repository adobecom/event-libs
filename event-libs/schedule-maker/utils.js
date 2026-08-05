import { DA_ORIGIN, DA_APP_PATH } from './constants.js';

function isBlockComplete(block) {
  if (block.includeLiveStream && !block.liveStream?.streamId) {
    return false;
  }
  return Boolean(block.fragmentPath && block.startDateTime && block.title);
}

function isScheduleComplete(schedule) {
  if (schedule.blocks.length === 0) return false;
  return schedule.blocks?.every((block) => isBlockComplete(block));
}

function isValidUrl(url) {
  if (!url || url.trim() === '') return true;
  if (url.startsWith('/')) {
    // Relative path sanity check — allow slugs plus %-encoding, query strings,
    // and hashes; still rejects whitespace/quotes and other broken pastes.
    return /^\/[\w\-./%?=&#~]*$/.test(url);
  }
  try {
    const urlObject = new URL(url);
    return Boolean(urlObject);
  } catch {
    return false;
  }
}

function validateBlock(block, blockIndex) {
  const errors = [];
  if (!block.title || block.title.trim() === '') {
    errors.push(`Block ${blockIndex + 1}: Title is required`);
  }
  if (block.fragmentPath && !isValidUrl(block.fragmentPath)) {
    errors.push(`Block ${blockIndex + 1} ("${block.title || 'Untitled'}"): Fragment path must be a valid relative or absolute URL`);
  }
  return errors;
}

function validateSchedule(schedule) {
  const errors = [];
  if (!schedule.title || schedule.title.trim() === '') {
    errors.push('Schedule title is required');
  }
  if (schedule.blocks && schedule.blocks.length > 0) {
    schedule.blocks.forEach((block, index) => {
      errors.push(...validateBlock(block, index));
    });
  }
  return errors;
}

function sortBlocks(blocks) {
  return blocks ? [...blocks].sort((a, b) => a.startDateTime - b.startDateTime) : blocks;
}

// True if sorting blocks by startDateTime would change their order. Used to tell
// authors their manual (or incidental) ordering is being auto-corrected on export,
// since the timing worker that drives chrono-box assumes ascending startDateTime
// and silently picks the wrong "current" block otherwise.
function blocksNeedSorting(blocks) {
  if (!blocks || blocks.length < 2) return false;
  const sorted = sortBlocks(blocks);
  return blocks.some((block, index) => block !== sorted[index]);
}

function assignIdToBlocks(schedule) {
  schedule.blocks.forEach((block) => {
    block.id = `block-${crypto.randomUUID()}`;
  });
}

function prepareScheduleForServer(schedule) {
  if (!schedule) return null;
  const deepCopy = JSON.parse(JSON.stringify(schedule));
  deepCopy.modificationTime = new Date().toISOString();
  deepCopy.blocks = sortBlocks(deepCopy.blocks);
  deepCopy.blocks.forEach((block) => {
    delete block.id;
    delete block.isEditingBlockTitle;
    delete block.isComplete;
    if (!block.includeLiveStream) {
      delete block.liveStream;
    }
    if (!block.fragmentPath) {
      delete block.fragmentPath;
    }
  });
  delete deepCopy.isComplete;
  return deepCopy;
}

function prepareScheduleForClient(schedule) {
  if (!schedule) return null;
  const s = JSON.parse(JSON.stringify(schedule));
  if (!s.scheduleId) s.scheduleId = crypto.randomUUID();
  if (!s.createdTime) s.createdTime = new Date().toISOString();
  s.blocks.forEach((block) => {
    block.id = `block-${crypto.randomUUID()}`;
    block.isEditingBlockTitle = false;
    if (!block.liveStream) {
      block.liveStream = { provider: 'MobileRider', streamId: '' };
    }
    block.isComplete = isBlockComplete(block);
  });
  s.blocks = sortBlocks(s.blocks);
  s.isComplete = isScheduleComplete(s);
  return s;
}

function processSchedules(schedules) {
  const sorted = schedules ? [...schedules].sort((a, b) => new Date(b.modificationTime) - new Date(a.modificationTime)) : [];
  return sorted.map((schedule) => prepareScheduleForClient(schedule));
}

function setScheduleTitle(schedule, title) {
  if (!schedule) return schedule;
  const updated = { ...schedule, title };
  return { ...updated, isComplete: isScheduleComplete(updated) };
}

function addBlockToSchedule(schedule, block) {
  if (!schedule) return schedule;
  const updatedBlocks = [...schedule.blocks, block];
  return { ...schedule, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...schedule, blocks: updatedBlocks }) };
}

function updateBlockInSchedule(schedule, blockId, updates) {
  if (!schedule) return schedule;
  const blockToUpdate = schedule.blocks.find((b) => b.id === blockId);
  if (!blockToUpdate) return schedule;
  const updatedBlock = { ...blockToUpdate, ...updates };
  updatedBlock.isComplete = isBlockComplete(updatedBlock);
  const updatedBlocks = schedule.blocks.map((b) => (b.id === blockId ? updatedBlock : b));
  return { ...schedule, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...schedule, blocks: updatedBlocks }) };
}

function deleteBlockFromSchedule(schedule, blockId) {
  if (!schedule) return schedule;
  const updatedBlocks = schedule.blocks.filter((b) => b.id !== blockId);
  return { ...schedule, blocks: updatedBlocks, isComplete: isScheduleComplete({ ...schedule, blocks: updatedBlocks }) };
}

// Moves draggedBlockId to sit just before targetBlockId. This is a preview-only
// reorder within the current editing session: prepareScheduleForServer (Copy
// Link) always re-sorts blocks by startDateTime, so a drag that lands on a
// non-chronological order will not survive into the exported link.
function reorderBlocksInSchedule(schedule, draggedBlockId, targetBlockId) {
  if (!schedule || draggedBlockId === targetBlockId) return schedule;
  const blocks = [...schedule.blocks];
  const fromIndex = blocks.findIndex((b) => b.id === draggedBlockId);
  const toIndex = blocks.findIndex((b) => b.id === targetBlockId);
  if (fromIndex === -1 || toIndex === -1) return schedule;
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex, 0, moved);
  return { ...schedule, blocks };
}

// Converts raw sheet rows (a header row followed by data rows) into schedule
// blocks using a property→column-name mapping. Pure counterpart to the sheet
// importer UI so the transform can be unit-tested independently of the DOM.
function convertSheetRowsToBlocks(sheetData, columnMapping) {
  if (sheetData.length < 2) return [];
  const headers = sheetData[0];
  const colIndexMap = {};
  Object.values(columnMapping).forEach((col) => { if (col) colIndexMap[col] = headers.indexOf(col); });
  const rows = sheetData.slice(1);
  return rows.map((row) => {
    const block = {};
    Object.entries(columnMapping).forEach(([property, columnName]) => {
      if (columnName && colIndexMap[columnName] >= 0) {
        const value = row[colIndexMap[columnName]] || '';
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
}

class ScheduleURLUtility {
  static createScheduleURL(scheduleObject, org, repo) {
    try {
      const serverSchedule = prepareScheduleForServer(scheduleObject);
      const jsonString = JSON.stringify(serverSchedule);
      const base64JsonString = btoa(unescape(encodeURIComponent(jsonString)));
      const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
      url.hash = `schedule=${base64JsonString}`;
      return url.toString();
    } catch (error) {
      window.lana?.log(`Error creating schedule URL: ${error}`);
      throw new Error('Failed to create schedule URL');
    }
  }

  static async extractScheduleFromURL(urlString) {
    try {
      const url = new URL(urlString);
      // Try query param first (old ECC/SM format), then hash fragment (new SM format).
      const encodedParam = url.searchParams.get('schedule')
        || (() => { const m = url.hash.match(/[#&]schedule=([A-Za-z0-9+/=%-]{20,})/); return m?.[1]; })();
      if (!encodedParam) {
        throw new Error('No schedule parameter found in URL');
      }
      const decodedJsonString = atob(decodeURIComponent(encodedParam));
      return JSON.parse(decodedJsonString);
    } catch (error) {
      window.lana?.log(`Error extracting schedule from URL: ${error}`);
      throw new Error('Failed to extract schedule from URL');
    }
  }

  static async copyScheduleToClipboard(scheduleObject, org, repo) {
    const wasReordered = blocksNeedSorting(scheduleObject?.blocks);
    try {
      const serverSchedule = prepareScheduleForServer(scheduleObject);
      const jsonString = JSON.stringify(serverSchedule);
      const base64JsonString = btoa(unescape(encodeURIComponent(jsonString)));
      const urlObj = new URL(`${DA_ORIGIN}/app/${org}/${repo}/${DA_APP_PATH}`);
      urlObj.hash = `schedule=${base64JsonString}`;
      const scheduleURL = urlObj.toString();
      const { title, modificationTime } = serverSchedule;
      const formattedDate = modificationTime
        ? new Date(modificationTime).toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
        : '';
      const linkText = formattedDate ? `Schedule: ${title} – ${formattedDate}` : `Schedule: ${title}`;
      const linkElement = document.createElement('a');
      linkElement.href = scheduleURL;
      linkElement.textContent = linkText;
      const blob = new Blob([linkElement.outerHTML], { type: 'text/html' });
      // eslint-disable-next-line no-undef
      const data = [new ClipboardItem({ [blob.type]: blob })];
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write(data);
        return { copied: true, wasReordered };
      }
      const textArea = document.createElement('textarea');
      textArea.value = scheduleURL;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return { copied: successful, wasReordered };
    } catch (error) {
      window.lana?.log(`Error copying schedule to clipboard: ${error}`);
      return { copied: false, wasReordered: false };
    }
  }
}

export {
  isBlockComplete,
  isScheduleComplete,
  sortBlocks,
  blocksNeedSorting,
  processSchedules,
  prepareScheduleForClient,
  assignIdToBlocks,
  prepareScheduleForServer,
  ScheduleURLUtility,
  validateSchedule,
  setScheduleTitle,
  addBlockToSchedule,
  updateBlockInSchedule,
  deleteBlockFromSchedule,
  reorderBlocksInSchedule,
  convertSheetRowsToBlocks,
};
