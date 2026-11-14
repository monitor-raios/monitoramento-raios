export type Risk='BAIXO'|'MEDIO'|'ALTO';
export type Strike={id:number;latitude:number;longitude:number;occurrenceDate:string;weatherCode:number;intensity:number|null;source:string|null;description:string|null;createdAt:string};
export type Summary={totalEvents:number;averageIntensityKa:number;maxIntensityKa:number;minIntensityKa:number;riskDistribution:Record<Risk,number>};
export type Ranking={city:string;latitude:number;longitude:number;count:number;avgIntensityKa:number};
export type Peak={hour:number;formattedHour:string;count:number};
export type Filters={startDate?:string;endDate?:string;minLat?:number;maxLat?:number;minLon?:number;maxLon?:number};
export const DEFAULT_API=(import.meta.env.VITE_API_URL||'http://localhost:3000').replace(/\/$/,'');
export function riskOf(n:number|null):Risk|null {if(n===null||!Number.isFinite(n))return null;return n<20?'BAIXO':n<=40?'MEDIO':'ALTO'}
export function cityOf(s:Strike){return (s.description||'').split(':')[0].trim()||'Local não identificado'}
export function number(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0}
export function normalizeStrike(s:Strike):Strike{return {...s,id:number(s.id),latitude:number(s.latitude),longitude:number(s.longitude),intensity:s.intensity==null?null:number(s.intensity)}}
export async function request<T>(base:string,path:string,options?:RequestInit):Promise<T>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),path.includes("/backfill")?900000:18000);try{const res=await fetch(`${base.replace(/\/$/,'')}${path}`,{...options,signal:controller.signal,headers:{...(options?.body?{'Content-Type':'application/json'}:{}),...options?.headers}});if(!res.ok){const body=await res.text().catch(()=> '');throw new Error(`HTTP ${res.status}${body?` — ${body.slice(0,160)}`:''}`)}return await res.json() as T}finally{clearTimeout(timer)}}
export function queryString(filters:Filters){const p=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v!==undefined&&v!==''&&v!==null)p.set(k,String(v))});return p.size?'?'+p.toString():''}
