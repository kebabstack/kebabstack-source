// Local databases only: no visitor address is sent to a lookup service.
export function networkLookup({geo,network}={}) {
 return ip=>{const g=geo?.get(ip),n=network?.get(ip);return {country:g?.country?.iso_code??'',region:g?.subdivisions?.[0]?.names?.en??'',city:g?.city?.names?.en??'',isHostingProvider:n?.is_hosting_provider===true};};
}
export async function loadNetworkLookup({geoPath,networkPath}={}) {
 if(!geoPath&&!networkPath)return networkLookup();
 const {open}=await import('maxmind');
 const geo=geoPath?await open(geoPath):undefined,network=networkPath?await open(networkPath):undefined;
 if(network&&!/^GeoIP(?:2)?-Anonymous(?:-IP|-Plus)?$/.test(network.metadata.databaseType))throw new Error('CRUMBS_NETWORK_DB must be a GeoIP Anonymous IP or Anonymous Plus database');
 return networkLookup({geo,network});
}
