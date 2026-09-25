import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const root = resolve('dist')
const prefix = '/trading-cards-print-shop/'
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }

createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return }
  const relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html'
  const file = resolve(root, relative)
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(404).end(); return }
  try {
    const entry = await stat(file)
    if (!entry.isFile()) { response.writeHead(404).end(); return }
    const extension = file.slice(file.lastIndexOf('.'))
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream' })
    response.end(await readFile(file))
  } catch { response.writeHead(404).end() }
}).listen(4174, '127.0.0.1')
