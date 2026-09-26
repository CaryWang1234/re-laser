import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.checks', { recursive:true });
const task = process.argv[2] || 'audit';
await build({entryPoints:[`scripts/${task}.ts`], bundle:true, platform:'node', format:'esm', outfile:`.checks/${task}.mjs`});
await import(`../.checks/${task}.mjs?${Date.now()}`);
