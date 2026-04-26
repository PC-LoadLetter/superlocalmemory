'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MIN_PYTHON_MAJOR = 3;
const MIN_PYTHON_MINOR = 11;

function withPreferredPath(env) {
    return {
        ...env,
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:' + (env.PATH || ''),
    };
}

function parsePythonVersion(result) {
    const raw = `${(result.stdout || '').toString()} ${(result.stderr || '').toString()}`.trim();
    const match = raw.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
    if (!match) return null;
    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
    };
}

function isSupportedVersion(version, minMajor = MIN_PYTHON_MAJOR, minMinor = MIN_PYTHON_MINOR) {
    if (!version) return false;
    if (version.major > minMajor) return true;
    if (version.major < minMajor) return false;
    return version.minor >= minMinor;
}

function runVersionCheck(parts) {
    if (!Array.isArray(parts) || parts.length === 0) return null;
    try {
        return spawnSync(parts[0], [...parts.slice(1), '--version'], {
            stdio: 'pipe',
            timeout: 5000,
            env: withPreferredPath(process.env),
        });
    } catch (_err) {
        return null;
    }
}

function isUsablePython(parts, minMajor = MIN_PYTHON_MAJOR, minMinor = MIN_PYTHON_MINOR) {
    const result = runVersionCheck(parts);
    if (!result || result.status !== 0) return false;
    return isSupportedVersion(parsePythonVersion(result), minMajor, minMinor);
}

function findPythonCommand({
    platform = os.platform(),
    minMajor = MIN_PYTHON_MAJOR,
    minMinor = MIN_PYTHON_MINOR,
} = {}) {
    const candidates = [
        'python3',
        'python',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/usr/bin/python3',
    ];
    if (platform === 'win32') {
        candidates.push('py -3');
        candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'));
        candidates.push(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'));
    }

    for (const candidate of candidates) {
        const parts = candidate.split(' ');
        if (isUsablePython(parts, minMajor, minMinor)) return parts;
    }
    return null;
}

function getSlmHome() {
    return process.env.SL_MEMORY_PATH || path.join(os.homedir(), '.superlocalmemory');
}

function getRuntimeMetadataPath(slmHome = getSlmHome()) {
    return path.join(slmHome, 'python-runtime.json');
}

function readRuntimeMetadata(slmHome = getSlmHome()) {
    const metadataPath = getRuntimeMetadataPath(slmHome);
    if (!fs.existsSync(metadataPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (_err) {
        return null;
    }
}

function writeRuntimeMetadata(metadata, slmHome = getSlmHome()) {
    const metadataPath = getRuntimeMetadataPath(slmHome);
    fs.mkdirSync(slmHome, { recursive: true });
    const tempPath = `${metadataPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(metadata, null, 2), 'utf8');
    fs.renameSync(tempPath, metadataPath);
    return metadataPath;
}

function resolvePinnedPython(slmHome = getSlmHome()) {
    const metadata = readRuntimeMetadata(slmHome);
    if (!metadata || typeof metadata !== 'object') return null;
    if (!metadata.python_executable || typeof metadata.python_executable !== 'string') return null;

    const pythonArgs = Array.isArray(metadata.python_args) ? metadata.python_args : [];
    const parts = [metadata.python_executable, ...pythonArgs];

    if (path.isAbsolute(metadata.python_executable) && !fs.existsSync(metadata.python_executable)) {
        return null;
    }

    if (!isUsablePython(parts)) return null;
    return { parts, metadata };
}

function getManagedVenvDir(slmHome = getSlmHome()) {
    return path.join(slmHome, 'venv');
}

function getManagedVenvPythonPath(slmHome = getSlmHome(), platform = os.platform()) {
    const venvDir = getManagedVenvDir(slmHome);
    if (platform === 'win32') {
        return path.join(venvDir, 'Scripts', 'python.exe');
    }
    return path.join(venvDir, 'bin', 'python');
}

function runProcess(parts, args, { timeout = 300000 } = {}) {
    return spawnSync(parts[0], [...parts.slice(1), ...args], {
        stdio: 'pipe',
        timeout,
        env: withPreferredPath(process.env),
    });
}

function ensureManagedVenv(basePythonParts, {
    slmHome = getSlmHome(),
    mode = process.env.SLM_PYTHON_MODE || 'managed_venv',
} = {}) {
    if (!basePythonParts || basePythonParts.length === 0) {
        return { mode: 'system_python', pythonParts: null, venvDir: null, reason: 'missing_base_python' };
    }

    if (mode === 'system' || mode === 'system_python') {
        return { mode: 'system_python', pythonParts: basePythonParts, venvDir: null, reason: 'system_opt_in' };
    }

    const venvImport = runProcess(basePythonParts, ['-c', 'import venv'], { timeout: 15000 });
    if (venvImport.status !== 0) {
        return { mode: 'system_python', pythonParts: basePythonParts, venvDir: null, reason: 'venv_unavailable' };
    }

    const venvDir = getManagedVenvDir(slmHome);
    const venvPython = getManagedVenvPythonPath(slmHome);

    if (!fs.existsSync(venvPython)) {
        const createResult = runProcess(basePythonParts, ['-m', 'venv', venvDir], { timeout: 120000 });
        if (createResult.status !== 0 || !fs.existsSync(venvPython)) {
            return { mode: 'system_python', pythonParts: basePythonParts, venvDir: null, reason: 'venv_create_failed' };
        }
    }

    if (!isUsablePython([venvPython])) {
        return { mode: 'system_python', pythonParts: basePythonParts, venvDir: null, reason: 'venv_python_invalid' };
    }

    return { mode: 'managed_venv', pythonParts: [venvPython], venvDir, reason: 'managed_venv_ready' };
}

module.exports = {
    MIN_PYTHON_MAJOR,
    MIN_PYTHON_MINOR,
    parsePythonVersion,
    isSupportedVersion,
    isUsablePython,
    findPythonCommand,
    getSlmHome,
    getRuntimeMetadataPath,
    readRuntimeMetadata,
    writeRuntimeMetadata,
    resolvePinnedPython,
    getManagedVenvDir,
    getManagedVenvPythonPath,
    ensureManagedVenv,
};
