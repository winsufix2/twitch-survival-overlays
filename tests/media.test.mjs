import {test} from 'node:test';
import assert from 'node:assert/strict';
import {byteRange,videoResponse} from '../cloud/media.mjs';
const assets={fetch:async()=>new Response(Uint8Array.from([0,1,2,3,4]),{headers:{'Content-Type':'video/mp4','Content-Length':'5',ETag:'"banner"'}})};
const request=headers=>new Request('https://stream.test/assets/stream-banner.mp4',{headers});
test('iOS two-byte MP4 probe returns a genuine 206 response',async()=>{
  const r=await videoResponse(request({Range:'bytes=0-1'}),assets);
  assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),'bytes 0-1/5');
  assert.equal(r.headers.get('Content-Length'),'2');assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[0,1]);
});
test('Suffix, open-ended and unsatisfiable ranges are handled without corrupt video responses',async()=>{
  assert.deepEqual(byteRange('bytes=-2',5),{start:3,end:4});
  assert.deepEqual(byteRange('bytes=2-',5),{start:2,end:4});
  for(const range of ['bytes=10-12','bytes=2-1','bytes=-0','bytes=0-1,3-4']){
    const r=await videoResponse(request({Range:range}),assets);assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),'bytes */5');
  }
  const r=await videoResponse(request({Range:'bytes=0-1','If-Range':'"old-version"'}),assets);
  assert.equal(r.status,200);assert.equal((await r.arrayBuffer()).byteLength,5);
});
