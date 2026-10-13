export function authorized(request,key) {
  if(!key||key.length<16)return false;
  const value=request.headers.get('Authorization')||'';
  const expected='Bearer '+key;
  let different=value.length^expected.length;
  for(let i=0;i<expected.length;i++)different|=(value.charCodeAt(i)||0)^expected.charCodeAt(i);
  return different===0;
}
export function originAllowed(origin,url,extra='') {
  return !origin||origin===new URL(url).origin||extra.split(',').map(x=>x.trim()).filter(Boolean).includes(origin);
}
