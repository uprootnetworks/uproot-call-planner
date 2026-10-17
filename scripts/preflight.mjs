import { spawnSync } from 'node:child_process';
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22 || (major===22 && minor<19)){console.error('Setup needs Node.js 22.19 or newer. No settings were changed.');process.exit(1);}
for(const command of ['npm','codex']){const p=spawnSync(command,['--version'],{encoding:'utf8',shell:process.platform==='win32'});if(p.error||p.status!==0){console.error(`${command} is unavailable. No settings were changed. Use a local Codex environment with Node and npm available.`);process.exit(1);}}
console.log('Ready. No registration or network request was performed.');
