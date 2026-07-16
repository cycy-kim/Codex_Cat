'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const eventDirectory = path.join(os.homedir(), '.codex-cat');
const eventFile = path.join(eventDirectory, 'events.jsonl');
const MAX_EVENT_FILE_BYTES = 1024 * 1024;

async function readStdin() {
  let input = '';

  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input;
}

async function main() {
  try {
    const rawInput = await readStdin();
    const hookInput = JSON.parse(rawInput);
    const eventName = hookInput.hook_event_name;

    if (eventName === 'UserPromptSubmit' || eventName === 'Stop') {
      const event = {
        type: eventName,
        sessionId: hookInput.session_id,
        turnId: hookInput.turn_id,
        timestamp: Date.now()
      };

      appendEvent(event);
    }
  } catch {
    // Hook failures must never interrupt the Codex turn.
  } finally {
    // Stop hooks require valid JSON on stdout when they exit successfully.
    process.stdout.write('{}');
  }
}

function appendEvent(event) {
  ensurePrivateEventDirectory();
  const existingEventFile = lstatIfPresent(eventFile);

  if (
    existingEventFile &&
    (existingEventFile.isSymbolicLink() || !existingEventFile.isFile())
  ) {
    throw new Error('Codex Cat event path is not a regular file');
  }

  const fileDescriptor = fs.openSync(
    eventFile,
    fs.constants.O_APPEND |
      fs.constants.O_CREAT |
      fs.constants.O_WRONLY |
      noFollowFlag(),
    0o600
  );

  try {
    if (!fs.fstatSync(fileDescriptor).isFile()) {
      throw new Error('Codex Cat event path is not a regular file');
    }

    if (process.platform !== 'win32') {
      fs.fchmodSync(fileDescriptor, 0o600);
    }

    if (fs.fstatSync(fileDescriptor).size >= MAX_EVENT_FILE_BYTES) {
      fs.ftruncateSync(fileDescriptor, 0);
    }

    fs.writeFileSync(fileDescriptor, `${JSON.stringify(event)}\n`, 'utf8');
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function ensurePrivateEventDirectory() {
  let stats = lstatIfPresent(eventDirectory);

  if (!stats) {
    fs.mkdirSync(eventDirectory, { mode: 0o700 });
    stats = fs.lstatSync(eventDirectory);
  }

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('Codex Cat data path is not a real directory');
  }

  if (process.platform !== 'win32') {
    const directoryDescriptor = fs.openSync(
      eventDirectory,
      fs.constants.O_RDONLY |
        (fs.constants.O_DIRECTORY ?? 0) |
        noFollowFlag()
    );

    try {
      if (!fs.fstatSync(directoryDescriptor).isDirectory()) {
        throw new Error('Codex Cat data path is not a real directory');
      }

      fs.fchmodSync(directoryDescriptor, 0o700);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  }
}

function noFollowFlag() {
  return process.platform === 'win32'
    ? 0
    : (fs.constants.O_NOFOLLOW ?? 0);
}

function lstatIfPresent(filePath) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

void main();
