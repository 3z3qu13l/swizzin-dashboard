// Builds dist/swizdash.tar.gz and its checksum: what `box install swizdash` downloads.
// The server runs straight from its TypeScript sources (Node strips the types), so no build step.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const dist = join(root, 'dist')
const stage = join(dist, 'swizdash')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (!existsSync(join(dist, 'public', 'index.html'))) {
  console.error('dist/public is missing: run npm run build first')
  process.exit(1)
}

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })
cpSync(join(dist, 'public'), join(stage, 'public'), { recursive: true })
cpSync(join(root, 'server', 'src'), join(stage, 'server'), { recursive: true })
cpSync(join(root, 'catalog'), join(stage, 'catalog'), { recursive: true })
cpSync(join(root, 'helper'), join(stage, 'helper'), { recursive: true })
for (const f of ['LICENSE', 'README.md']) if (existsSync(join(root, f))) cpSync(join(root, f), join(stage, f))
writeFileSync(join(stage, 'package.json'), `${JSON.stringify({ name: pkg.name, version: pkg.version, type: 'module', private: true }, null, 2)}\n`)

execFileSync('tar', ['-czf', 'swizdash.tar.gz', '--owner=0', '--group=0', 'swizdash'], { cwd: dist, stdio: 'inherit' })
// `sha256sum -c` format, checked by box before it installs anything
const sum = createHash('sha256').update(readFileSync(join(dist, 'swizdash.tar.gz'))).digest('hex')
writeFileSync(join(dist, 'swizdash.tar.gz.sha256'), `${sum}  swizdash.tar.gz\n`)
console.log(`dist/swizdash.tar.gz, version ${pkg.version}`)
