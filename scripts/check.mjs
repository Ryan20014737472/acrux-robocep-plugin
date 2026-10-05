import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import YAML from 'yaml';

const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = await json('plugin.json');
const mcp = await json('mcp.json');
const render = YAML.parse(await readFile(new URL('../render.yaml', import.meta.url), 'utf8'));
for (const [name, value, file] of [
  ['plugin.json', manifest, 'plugin'], ['mcp.json', mcp, 'mcp'], ['render.yaml', render, 'render'],
]) {
  const validator = new Ajv2020({ strict: false, validateFormats: false });
  const validate = validator.compile(await json(`schemas/${file}.schema.json`));
  assert.ok(validate(value), `${name}: ${JSON.stringify(validate.errors)}`);
}
assert.equal(manifest.name, (await json('package.json')).name);
assert.equal(manifest.version, (await json('package.json')).version);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.extensions['com.openai'].interface.displayName, 'ACRUX ROBOCEP');
assert.ok(manifest.extensions['com.openai'].interface.shortDescription.length <= 30);
assert.equal(manifest.extensions['com.openai'].interface.defaultPrompt.length, 3);
assert.equal(mcp.mcpServers['acrux-robocep'].type, 'streamable-http');
assert.equal(render.services[0].plan, 'free');
assert.equal(render.services[0].autoDeployTrigger, 'off');
assert.equal(render.services[0].branch, 'feat/mcp-v1');
assert.equal(render.services[0].healthCheckPath, '/health');
for (const group of ['dependencies', 'devDependencies']) for (const version of Object.values((await json('package.json'))[group])) {
  assert.match(version, /^\d+\.\d+\.\d+$/);
}
// Scan versioned source/config/docs/tests, never runtime env files or dependencies.
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'schemas'].includes(entry.name) || entry.name.startsWith('.env')) continue;
    const path = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) await scan(path);
    else {
      const source = await readFile(path, 'utf8');
      assert.ok(!/sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(source), `Credencial literal proibida: ${entry.name}`);
    }
  }
}
await scan(new URL('../', import.meta.url));
console.log('TypeScript, manifests, Blueprint e ausência de credenciais literais: OK.');
