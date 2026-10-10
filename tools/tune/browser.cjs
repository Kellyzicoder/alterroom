// Bundles harness.ts, serves this folder and opens it in headless Chromium.
const { chromium } = require('playwright')
const esbuild = require('esbuild')
const http = require('http')
const fs = require('fs')
const path = require('path')

module.exports = async function open(size, names) {
  await esbuild.build({ entryPoints: [path.join(__dirname, 'harness.ts')], bundle: true, outfile: path.join(__dirname, 'harness.js'), logLevel: 'error' })
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? '/index.html' : decodeURIComponent(req.url)
    fs.readFile(path.join(__dirname, file), (err, data) => {
      if (err) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'image/png' })
      res.end(data)
    })
  }).listen(0)
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('page error:', e.message))
  await page.goto(`http://localhost:${server.address().port}/`)
  const dims = await page.evaluate(([s, n]) => window.api.load(s, n), [size, names])
  const base = await page.evaluate(() => window.api.tuning())
  return {
    dims,
    base,
    run: (patch, adj, ref) => page.evaluate(([a, b, c]) => window.api.run(a, b, c), [patch, adj, ref]),
    close: async () => { await browser.close(); server.close() },
  }
}
