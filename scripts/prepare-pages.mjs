import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const server=process.argv[2];
if(server){const u=new URL(server);if(u.protocol!=='https:')throw Error('Cloud backend must use HTTPS');fs.writeFileSync(path.join(root,'public','config.js'),`export const DEFAULT_BACKEND = ${JSON.stringify(u.origin)};\n`);}
fs.cpSync(path.join(root,'public'),path.join(root,'docs'),{recursive:true});
console.log('GitHub Pages files prepared; no private files included');
