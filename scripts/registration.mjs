import { fileURLToPath } from 'node:url';
const quote=v=>process.platform==='win32'?"'"+v.replaceAll("'","''")+"'":"'"+v.replaceAll("'", "'\\''")+"'";
const launcher=fileURLToPath(new URL('../connector/src/server.js',import.meta.url));
console.log((process.platform==='win32'?'& ':'')+'codex mcp add uproot-mcp -- '+quote(process.execPath)+' '+quote(launcher));
