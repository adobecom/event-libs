import { getEventServiceEnv } from './utils.js';

const PII_KEY_PATTERN = /email|name|phone|address|token|password|dob|birthdate/i;

function redactPii(key, value) {
  if (key && PII_KEY_PATTERN.test(key)) return '[REDACTED]';
  return value;
}

function serializeLogData(data) {
  if (typeof data === 'string') return data;
  if (data instanceof Error) return `${data.name}: ${data.message}`;
  if (typeof Response !== 'undefined' && data instanceof Response) {
    return `status=${data.status} ok=${data.ok} url=${data.url}`;
  }
  try {
    return JSON.stringify(data, redactPii);
  } catch (e) {
    return String(data);
  }
}

function getClientContext() {
  try {
    const { userAgent, language } = navigator;
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const { name: env } = getEventServiceEnv();
    return `ua=${userAgent},viewport=${viewport},lang=${language},env=${env}`;
  } catch {
    return '';
  }
}

function send(severity, scope, message, data) {
  const suffix = data === undefined ? '' : `: ${serializeLogData(data)}`;
  const context = ['warning', 'error', 'critical'].includes(severity)
    ? ` | ${getClientContext()}`
    : '';
  const options = { tags: scope, severity };
  if (severity === 'error' || severity === 'critical') options.sampleRate = 100;
  window.lana?.log(`[${scope}] ${message}${suffix}${context}`, options);
}

export function logDebug(scope, message, data) {
  send('debug', scope, message, data);
}

export function logInfo(scope, message, data) {
  send('info', scope, message, data);
}

export function logWarning(scope, message, data) {
  send('warning', scope, message, data);
}

export function logError(scope, message, data) {
  send('error', scope, message, data);
}

export function logCritical(scope, message, data) {
  send('critical', scope, message, data);
}
