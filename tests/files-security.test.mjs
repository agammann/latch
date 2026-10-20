import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {read} from '../packages/cli/dist/files.js';

test('project source read stays on its opened regular file and 1 MiB cap',()=>{
  const base=path.resolve('work/tests');
  fs.mkdirSync(base,{recursive:true});
  const root=fs.mkdtempSync(path.join(base,'file-boundary-'));
  try{
    fs.writeFileSync(path.join(root,'valid.ts'),'const value = 1;\n');
    fs.writeFileSync(path.join(root,'large.ts'),'x'.repeat(1024*1024+1));
    assert.equal(read(root,'valid.ts'),'const value = 1;\n');
    assert.throws(()=>read(root,'large.ts'),/exceeds 1 MiB/);
    const outside=path.join(root,'outside-sentinel');
    fs.writeFileSync(outside,'private sentinel');
    const selected=path.join(root,'selected.ts');
    fs.writeFileSync(selected,'safe');
    const originalOpen=fs.openSync;
    let linked=true;
    fs.openSync=(name,...args)=>{
      if(name===selected){
        fs.rmSync(selected);
        try{fs.symlinkSync(outside,selected,'file');}
        catch(error){if(process.platform!=='win32'||error.code!=='EPERM')throw error;linked=false;fs.writeFileSync(selected,'safe');}
      }
      return originalOpen(name,...args);
    };
    let result,error;
    try{result=read(root,'selected.ts');}catch(cause){error=cause;}
    finally{fs.openSync=originalOpen;}
    if(linked)assert.ok(error,'a swapped symlink must be rejected');
    else{assert.equal(error,undefined);assert.equal(result,'safe');}
  }finally{
    if(!root.startsWith(base+path.sep))throw Error('Unexpected fixture');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
