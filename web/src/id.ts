let fallbackCounter = 0

/** A browser-safe UUID for copy IDs and idempotency keys. */
export function uniqueId(source: Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>> | undefined = globalThis.crypto) {
  if (typeof source?.randomUUID === 'function') return source.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof source?.getRandomValues === 'function') source.getRandomValues(bytes)
  else {
    // These IDs identify local copies or retries; they are not auth tokens.
    const sequence = ++fallbackCounter
    const time = Date.now()
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256)
    for (let index = 0; index < 6; index++) bytes[index] ^= Math.floor(time / 2 ** (8 * index)) & 255
    for (let index = 0; index < 4; index++) bytes[8 + index] ^= Math.floor(sequence / 2 ** (8 * index)) & 255
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
