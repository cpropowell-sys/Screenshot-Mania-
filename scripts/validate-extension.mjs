import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const requiredTopLevel = ['manifest_version', 'name', 'version', 'permissions', 'background', 'content_scripts', 'side_panel'];

for (const key of requiredTopLevel) {
  if (!(key in manifest)) throw new Error(`manifest.json is missing ${key}`);
}

if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');

const paths = [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  ...Object.values(manifest.icons || {})
];

for (const script of manifest.content_scripts || []) {
  paths.push(...(script.js || []), ...(script.css || []));
}

for (const path of paths) {
  await access(path, constants.R_OK);
}

const content = await readFile('src/content.js', 'utf8');
for (const token of ['SM_CAPTURE_VISIBLE_TAB', 'SM_OPEN_SIDE_PANEL', 'ClipboardItem', 'chrome.storage.local', 'findSmartRect', 'scoreElement']) {
  if (!content.includes(token)) throw new Error(`content.js is missing ${token}`);
}

console.log(`Validated Manifest V3 extension with ${paths.length} referenced files.`);
