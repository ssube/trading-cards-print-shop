function legacyCopy(value: string) {
  const field = document.createElement('textarea')
  field.value = value
  field.readOnly = true
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0'
  document.body.appendChild(field)
  field.focus()
  field.select()
  try { return document.execCommand('copy') }
  catch { return false }
  finally { field.remove() }
}

export function copyText(value: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(legacyCopy(value))
  return navigator.clipboard.writeText(value).then(() => true).catch(() => legacyCopy(value))
}
