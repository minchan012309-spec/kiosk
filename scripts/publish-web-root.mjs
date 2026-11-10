// Keep the legacy Pages publishing root usable alongside Actions deployment.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist/web/index.html', 'utf8');
const asset = html.match(/assets\/[^"\s]+\.js/)?.[0];
if (!asset || !html.includes('id="root"')) throw Error('Build the React web app first.');
if (existsSync('index.html') && !readFileSync('index.html','utf8').includes('pcclub-published-web'))
  throw Error('Refusing to replace an unmanaged root index.html.');
rmSync('pcclub-web', {recursive:true,force:true});
mkdirSync('pcclub-web',{recursive:true});
cpSync('dist/web/assets','pcclub-web/assets',{recursive:true});
cpSync('dist/web/fonts','pcclub-web/fonts',{recursive:true});
writeFileSync('index.html', html.replace('<head>','<head>\n    <meta name="pcclub-published-web" content="true" />').replaceAll('./assets/','./pcclub-web/assets/'));
writeFileSync('.nojekyll','');
writeFileSync('pcclub-build.txt',asset);
console.log('Published React web assets to the repository root:',asset);
