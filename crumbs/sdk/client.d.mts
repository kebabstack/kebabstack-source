export type Integer = string;
export interface Filter { dimension: string; values: string[]; exclude: boolean }
export interface Query {site:string;from:number;until:number;dimension?:string;filters?:Filter[];limit?:number}
export interface Metrics {visitors:Integer;visits:Integer;pageviews:Integer;events:Integer;bounces:Integer;durationSeconds:Integer;engagementMs:Integer;scrollDepthSum:Integer;scrollSamples:Integer;revenue:[string,Integer][]}
export interface Report {totals:Metrics;rows:{value:string;metrics:Metrics}[];scanned:Integer;truncated:boolean}
export interface Site {id:string;name:string;domain:string;timezone?:string;retentionDays?:number;enabled?:boolean;allowedProperties?:string[];excludedPaths?:string[];viewers?:string[]}
export interface AccessPerson {id:string;email:string;displayName:string;active:boolean;eligible:boolean;automatic:boolean}
export interface SiteAccess {site:string;revision:Integer;readers:AccessPerson[];managers:AccessPerson[];legacyAllReaders:boolean;updatedBy:string;updatedAt:Integer}
export interface Event {id:string;site:string;url:string;referrer?:string;kind:'pageview'|'event'|'engagement';name?:string;props?:Record<string,string|number|boolean>;interactive?:boolean;revenueMinor?:number;currency?:string;engagementMs?:number;scrollDepth?:number}
export interface Goal {id:string;site:string;name:string;kind:'page'|'event'|'scroll';value:string;scrollDepth?:number|string|null}
export interface Key {id:string;owner:string;site:string;name:string;scope:'read'|'manage'|'share';expiresAt:Integer}
export interface Annotation {id:string;site:string;at:Integer;text:string}
export interface ImportRow {id:string;site:string;day:number;dimension:string;value:string;metrics:Metrics}
export class CrumbsError extends Error {status:number;code:string}
export class Crumbs {
 constructor(options:{baseUrl:string;token?:string;fetch?:typeof fetch});
 request(path:string,options?:{method?:string;body?:unknown}):Promise<unknown>;
 sites():Promise<(Omit<Site,"retentionDays">&{retentionDays:Integer;accessRole:'read'|'manage'|'admin'})[]>;saveSite(site:Site):Promise<Omit<Site,"retentionDays">&{retentionDays:Integer}>;query(request:Query):Promise<Report>;
 siteAccess(site:string):Promise<SiteAccess>;saveSiteAccess(site:string,policy:{revision:Integer;readers:string[];managers:string[]}):Promise<SiteAccess>;accessPeople(site:string,search?:string):Promise<{people:AccessPerson[];truncated:boolean}>;
 deleteSite(id:string):Promise<null>;deleteGoal(site:string,id:string):Promise<null>;
 keys():Promise<Key[]>;createKey(input:{site:string;name:string;scope:'read'|'manage'|'share';days:number}):Promise<{token:string;key:Key}>;revokeKey(id:string):Promise<null>;
 annotations(site:string):Promise<Annotation[]>;saveAnnotation(item:Omit<Annotation,'at'>&{at:number}):Promise<null>;
 importAggregates(rows:ImportRow[]):Promise<Integer>;imported(site:string,from:number,until:number):Promise<(Omit<ImportRow,'day'>&{day:Integer})[]>;
 health():Promise<{accepted:Integer;duplicates:Integer;rejected:Integer;storedEvents:Integer;storageChargeBytes:Integer;collectors:string[];directoryAt:Integer}>;
 collectorHealth():Promise<{pending:number;rejected:number;oldestPendingAt:number|null;lastSuccess:number;lastError:string}>;
 events(events:Event|Event[]):Promise<{queued:number;ignored:number;durability:'collector';delivery:'asynchronous'}|{accepted:number;duplicates:number;ignored:number;durability:'canister';delivery:'committed'}>;
 funnels(request:Query&{steps:{kind:'page'|'event';value:string}[]}):Promise<Integer[]>;
 journeys(request:Query):Promise<[string,string,Integer][]>;
 goalReport(request:Query&{id:string}):Promise<{visitors:Integer;completions:Integer;revenue:[string,Integer][]}>;
 goals(site:string):Promise<Goal[]>;saveGoal(goal:Goal):Promise<unknown>;
 exportEvents(site:string,options?:{limit?:number}):AsyncGenerator<Record<string,unknown>>;
}
