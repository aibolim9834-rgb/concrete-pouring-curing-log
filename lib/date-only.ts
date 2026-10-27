function parts(value: string): number[] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d]=value.split('-').map(Number), leap=y%4===0 && (y%100!==0 || y%400===0);
  return y>=1 && m>=1 && m<=12 && d>=1 && d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1] ? [y,m,d] : null;
}
function ordinal(value: string) {
  let [y,m,d]=parts(value)!; y-=Number(m<=2); const era=Math.floor(y/400),yo=y-era*400;
  return era*146097+yo*365+Math.floor(yo/4)-Math.floor(yo/100)+Math.floor((153*(m+(m>2?-3:9))+2)/5)+d-1;
}
export function difference(from: string,to: string): number | null {
  if (!parts(from) || !parts(to)) return null;
  const T=(globalThis as unknown as {Temporal?: {PlainDate:{from(s:string):{until(other:unknown,options:{largestUnit:string}):{days:number}}}}}).Temporal;
  return T?.PlainDate ? T.PlainDate.from(from).until(T.PlainDate.from(to),{largestUnit:'day'}).days : ordinal(to)-ordinal(from);
}
export const days=(n:number|null)=>n===null?'미입력':`${n}일${n<0?' · 날짜 확인':''}`;
export const gap=(n:number|null)=>n===null?'미입력':n===0?'동일':n>0?`${n}일 늦음`:`${-n}일 빠름`;

// Two-digit years are explicitly 2000-2099; stored dates remain YYYY-MM-DD.
export function normalizeShortDate(raw:string):string|null {
  const value=raw.trim(); if(!value)return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return parts(value)?value:null;
  const match=value.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/) || value.match(/^(\d{2})(\d{2})(\d{2})$/);
  if(!match)return null;
  const iso=`20${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return parts(iso)?iso:null;
}
export function shortDate(value:string,separator='-'):string {
  return parts(value)?value.slice(2).replaceAll('-',separator):value;
}
