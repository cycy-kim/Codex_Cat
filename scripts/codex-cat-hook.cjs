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
  fs.mkdirSync(eventDirectory, { recursive: true, mode: 0o700 });

  if (process.platform !== 'win32') {
    fs.chmodSync(eventDirectory, 0o700);
  }

  const fileDescriptor = fs.openSync(eventFile, 'a', 0o600);

  try {
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

void main();
