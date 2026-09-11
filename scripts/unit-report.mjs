import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const files=fs.readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{encoding:'utf8'});
fs.mkdirSync('reports',{recursive:true});
const output=r.stdout+r.stderr;
const report={formatVersion:1,node:process.version,platform:process.platform,exitCode:r.status,tests:Number(output.match(/# tests (\d+)/)?.[1]??0),passed:Number(output.match(/# pass (\d+)/)?.[1]??0),failed:Number(output.match(/# fail (\d+)/)?.[1]??0)};
fs.writeFileSync('reports/unit-tests.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('reports/unit-tests.txt',output);console.log(output);if(r.status!==0)process.exitCode=1;
