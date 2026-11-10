import {build} from 'esbuild';import{build as viteBuild}from'vite';import{resolve}from'node:path';import{mkdirSync}from'node:fs';
mkdirSync('dist',{recursive:true});
await viteBuild({root:resolve('apps/web'),base:'./',build:{outDir:resolve('dist/web'),emptyOutDir:true}});
await build({entryPoints:['apps/server/src/index.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'dist/server/index.js'});
for (const role of ['server','station']) await build({entryPoints:['apps/launcher/src/main.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],define:{__APP_ROLE__:JSON.stringify(role)},outfile:`dist/desktop/${role}.cjs`});
await build({entryPoints:['apps/launcher/src/preload.ts'],bundle:true,platform:'node',format:'cjs',external:['electron'],outfile:'dist/desktop/preload.cjs'});
