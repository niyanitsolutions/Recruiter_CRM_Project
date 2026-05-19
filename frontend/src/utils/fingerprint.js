let _cached = null

function _djb2(str) {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    hash = hash >>> 0
  }
  return hash.toString(36)
}

export function generateDeviceFingerprint() {
  const components = [
    navigator.userAgent        || '',
    navigator.language         || '',
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    screen.width               || 0,
    screen.height              || 0,
    screen.colorDepth          || 0,
    navigator.hardwareConcurrency || 0,
    navigator.deviceMemory     || 0,
    navigator.platform         || '',
  ]
  return _djb2(components.join('|||'))
}

export function getDeviceFingerprint() {
  if (!_cached) _cached = generateDeviceFingerprint()
  return _cached
}
