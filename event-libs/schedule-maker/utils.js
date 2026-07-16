import { DA_ORIGIN } from './constants.js';

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

function assignIdToBlocks(schedule) {
  schedule.blocks.forEach((block) => {
    block.id = `block-${crypto.randomUUID()}`;
  });
}

function prepareScheduleForServer(schedule) {
  if (!schedule) return null;
  const deepCopy = JSON.parse(JSON.stringify(schedule));
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

class ScheduleURLUtility {
  static createScheduleURL(scheduleObject, org, repo) {
    try {
      const serverSchedule = prepareScheduleForServer(scheduleObject);
      const jsonString = JSON.stringify(serverSchedule);
      const base64JsonString = btoa(unescape(encodeURIComponent(jsonString)));
      const url = new URL(`${DA_ORIGIN}/app/${org}/${repo}/schedule-maker`);
      url.searchParams.set('schedule', base64JsonString);
      url.hash = `scheduleId=${scheduleObject.scheduleId}`;
      return url.toString();
    } catch (error) {
      window.lana?.log(`Error creating schedule URL: ${error}`);
      throw new Error('Failed to create schedule URL');
    }
  }

  static async extractScheduleFromURL(urlString) {
    try {
      const url = new URL(urlString);
      const encodedBase64JsonString = url.searchParams.get('schedule');
      if (!encodedBase64JsonString) {
        throw new Error('No schedule parameter found in URL');
      }
      const decodedJsonString = atob(decodeURIComponent(encodedBase64JsonString));
      return JSON.parse(decodedJsonString);
    } catch (error) {
      window.lana?.log(`Error extracting schedule from URL: ${error}`);
      throw new Error('Failed to extract schedule from URL');
    }
  }

  static async copyScheduleToClipboard(scheduleObject, org, repo) {
    try {
      const scheduleURL = this.createScheduleURL(scheduleObject, org, repo);
      const { title, modificationTime } = scheduleObject;
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
        return true;
      }
      const textArea = document.createElement('textarea');
      textArea.value = scheduleURL;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (error) {
      window.lana?.log(`Error copying schedule to clipboard: ${error}`);
      return false;
    }
  }
}

export {
  isBlockComplete,
  isScheduleComplete,
  sortBlocks,
  processSchedules,
  prepareScheduleForClient,
  assignIdToBlocks,
  prepareScheduleForServer,
  ScheduleURLUtility,
  validateSchedule,
};
