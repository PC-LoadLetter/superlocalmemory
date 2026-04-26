'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runtime = require('../../scripts/python_runtime.js');

function mkTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents, { encoding: 'utf8', mode: 0o755 });
}

test('runtime metadata read/write roundtrip', () => {
  const slmHome = mkTmpDir('slm-runtime-meta-');
  const metadata = {
    mode: 'managed_venv',
    python_executable: '/tmp/fake-python',
    python_args: [],
    venv_dir: '/tmp/slm-venv',
    slm_version: '3.4.36',
  };
  const metadataPath = runtime.writeRuntimeMetadata(metadata, slmHome);
  assert.ok(fs.existsSync(metadataPath));

  const loaded = runtime.readRuntimeMetadata(slmHome);
  assert.equal(loaded.mode, metadata.mode);
  assert.equal(loaded.python_executable, metadata.python_executable);
  assert.deepEqual(loaded.python_args, metadata.python_args);
  assert.equal(loaded.venv_dir, metadata.venv_dir);
});

test('resolvePinnedPython returns pinned executable parts', () => {
  const slmHome = mkTmpDir('slm-runtime-pinned-');
  const fakePython = path.join(slmHome, 'fake-python');
  writeExecutable(
    fakePython,
    '#!/usr/bin/env bash\n' +
      'if [ "${1:-}" = "--version" ]; then\n' +
      '  echo "Python 3.12.1"\n' +
      '  exit 0\n' +
      'fi\n' +
      'echo "PINNED:$*"\n' +
      'exit 0\n'
  );

  runtime.writeRuntimeMetadata(
    {
      mode: 'managed_venv',
      python_executable: fakePython,
      python_args: [],
    },
    slmHome
  );

  const resolved = runtime.resolvePinnedPython(slmHome);
  assert.ok(resolved);
  assert.deepEqual(resolved.parts, [fakePython]);
});

test('ensureManagedVenv honors explicit system mode', () => {
  const selection = runtime.ensureManagedVenv(['/usr/bin/python3'], {
    slmHome: mkTmpDir('slm-runtime-system-'),
    mode: 'system_python',
  });
  assert.equal(selection.mode, 'system_python');
  assert.deepEqual(selection.pythonParts, ['/usr/bin/python3']);
  assert.equal(selection.reason, 'system_opt_in');
});

