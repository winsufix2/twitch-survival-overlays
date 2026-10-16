// Safari/iOS requests the first two bytes before playing MP4 video. The static
// asset binding can ignore Range, so provide an explicit byte-range response.
export function byteRange(value,size){
  const match=/^bytes=(\d*)-(\d*)$/.exec(value||'');
  if(!match||(!match[1]&&!match[2])||!size)return null;
  const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
  const end=match[1]?(match[2]?Math.min(size-1,Number(match[2])):size-1):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return null;
  return {start,end};
}
export async function videoResponse(request,assets){
  const assetHeaders=new Headers(request.headers);
  for(const name of ['Range','If-Range','If-None-Match','If-Modified-Since'])assetHeaders.delete(name);
  const asset=await assets.fetch(new Request(request.url,{method:'GET',headers:assetHeaders}));
  if(!asset.ok)return asset;
  const headers=new Headers(asset.headers);headers.set('Accept-Ranges','bytes');
  const range=request.headers.get('Range'),ifRange=request.headers.get('If-Range');
  if(request.method==='HEAD'){await asset.body?.cancel();return new Response(null,{headers});}
  if(!range||(ifRange&&ifRange!==headers.get('ETag')))return new Response(asset.body,{headers});
  const buffer=await asset.arrayBuffer(),size=buffer.byteLength,part=byteRange(range,size);
  headers.delete('Content-Encoding');
  if(!part){headers.set('Content-Range',`bytes */${size}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
  headers.set('Content-Range',`bytes ${part.start}-${part.end}/${size}`);
  headers.set('Content-Length',String(part.end-part.start+1));
  return new Response(buffer.slice(part.start,part.end+1),{status:206,headers});
}
