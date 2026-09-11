import fs from 'node:fs';
import assert from 'node:assert/strict';
import {runTests} from '../packages/test/dist/index.js';
const c=JSON.parse(fs.readFileSync('examples/catalog/latch.config.json'));
c.browser.native=false;c.tests=c.tests.filter(t=>t.mode==='native');
const r=await runTests(c);assert.equal(r.passed,0);assert.equal(r.failed,0);assert.equal(r.blocked,1);
fs.writeFileSync('reports/native-unavailable.json',JSON.stringify(r,null,2)+'\n');console.log('Required native case correctly reported blocked in unflagged Chrome');
