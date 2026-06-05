/**
 * Portable runtime for USB / relocatable PingHermesAgent installs.
 * Must run before main.cjs resolves HERMES_HOME or userData.
 */
const fs = require('node:fs')
const path = require('node:path')

const PORTABLE_MARKER = '.pinghermesagent-portable'
const PACKAGED_MARKER = 'portable.marker'

/** @type {{ enabled: boolean, root: string, hermesHome: string, desktopUserData: string, portableHome: string } | null} */
let cached = null

function isTruthyEnv(value) {
  return value === '1' || String(value || '').toLowerCase() === 'true'
}

function hasPortableMarker(dir) {
  return fs.existsSync(path.join(dir, PORTABLE_MARKER))
}

function detectPortableRoot(execPath, resourcesPath) {
  const explicitRoot = process.env.PINGHERMESAGENT_PORTABLE_ROOT?.trim()
  if (explicitRoot && (hasPortableMarker(explicitRoot) || isTruthyEnv(process.env.PINGHERMESAGENT_PORTABLE))) {
    return path.resolve(explicitRoot)
  }

  if (process.platform === 'darwin') {
    const macosDir = path.dirname(execPath)
    if (macosDir.endsWith(`${path.sep}Contents${path.sep}MacOS`)) {
      const appBundle = path.dirname(path.dirname(macosDir))
      const portableRoot = path.dirname(appBundle)
      if (hasPortableMarker(portableRoot)) {
        return portableRoot
      }
    }
  }

  const execDir = path.dirname(execPath)
  if (hasPortableMarker(execDir)) {
    return execDir
  }

  if (resourcesPath && fs.existsSync(path.join(resourcesPath, PACKAGED_MARKER))) {
    if (explicitRoot) {
      return path.resolve(explicitRoot)
    }
    if (process.platform === 'darwin') {
      const macosDir = path.dirname(execPath)
      if (macosDir.endsWith(`${path.sep}Contents${path.sep}MacOS`)) {
        const appBundle = path.dirname(path.dirname(macosDir))
        return path.dirname(appBundle)
      }
    }
    return execDir
  }

  // Legacy: marker next to .app (resources/../../..)
  if (resourcesPath) {
    const legacyRoot = path.resolve(resourcesPath, '..', '..', '..')
    if (hasPortableMarker(legacyRoot)) {
      return legacyRoot
    }
  }

  return null
}

function shouldEnablePortableMode(root) {
  if (root) {
    return true
  }
  return (
    isTruthyEnv(process.env.PINGHERMESAGENT_PORTABLE)
    || Boolean(process.env.PINGHERMESAGENT_PORTABLE_ROOT?.trim())
    || (Boolean(process.env.HERMES_HOME?.trim()) && Boolean(process.env.HERMES_DESKTOP_USER_DATA_DIR?.trim()))
  )
}

function bootstrapPortableRuntime(options = {}) {
  if (cached) {
    return cached
  }

  const execPath = options.execPath ?? process.execPath
  const resourcesPath = options.resourcesPath ?? process.resourcesPath
  const detectedRoot = detectPortableRoot(execPath, resourcesPath)
  const enabled = shouldEnablePortableMode(detectedRoot)

  if (!enabled) {
    cached = {
      enabled: false,
      root: '',
      hermesHome: '',
      desktopUserData: '',
      portableHome: ''
    }
    return cached
  }

  const root =
    detectedRoot || path.resolve(process.env.PINGHERMESAGENT_PORTABLE_ROOT?.trim() || path.dirname(execPath))

  const hermesHome = process.env.HERMES_HOME?.trim()
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(root, 'data', 'hermes')
  const desktopUserData = process.env.HERMES_DESKTOP_USER_DATA_DIR?.trim()
    ? path.resolve(process.env.HERMES_DESKTOP_USER_DATA_DIR)
    : path.join(root, 'data', 'desktop')
  const portableHome = path.join(hermesHome, 'home')

  fs.mkdirSync(hermesHome, { recursive: true })
  fs.mkdirSync(desktopUserData, { recursive: true })
  fs.mkdirSync(portableHome, { recursive: true })

  process.env.PINGHERMESAGENT_PORTABLE = '1'
  process.env.PINGHERMESAGENT_PORTABLE_ROOT = root
  if (!process.env.PINGHERMESAGENT_OFFLINE) {
    process.env.PINGHERMESAGENT_OFFLINE = '1'
  }
  process.env.HERMES_HOME = hermesHome
  process.env.HERMES_DESKTOP_USER_DATA_DIR = desktopUserData
  process.env.HOME = portableHome
  process.env.USERPROFILE = portableHome
  process.env.XDG_CONFIG_HOME = path.join(portableHome, '.config')
  process.env.XDG_CACHE_HOME = path.join(portableHome, '.cache')
  process.env.XDG_DATA_HOME = path.join(portableHome, '.local', 'share')
  if (!process.env.UV_CACHE_DIR?.trim()) {
    process.env.UV_CACHE_DIR = path.join(hermesHome, 'cache', 'uv')
  }

  cached = {
    enabled: true,
    root,
    hermesHome,
    desktopUserData,
    portableHome
  }
  return cached
}

function isPortableMode() {
  if (cached?.enabled) {
    return true
  }
  return isTruthyEnv(process.env.PINGHERMESAGENT_PORTABLE)
}

function getPortableRuntime() {
  return cached?.enabled ? cached : null
}

module.exports = {
  bootstrapPortableRuntime,
  getPortableRuntime,
  isPortableMode,
  PORTABLE_MARKER,
  PACKAGED_MARKER
}
