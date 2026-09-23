// Optional page-local tools use the same reset action as the visible R button.
export function registerGameTools(context,{read,restart}){
 if(!context?.registerTool)return ()=>{};
 const life=new AbortController(),schema={type:'object',properties:{},additionalProperties:false};
 const validate=x=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length)throw Error('Expected an empty object');};
 const tools=[{name:'read_flight',description:'Read the current 2D flight, score and remaining boosts.',annotations:{readOnlyHint:true,untrustedContentHint:false},execute(x){validate(x);return read();}},
 {name:'restart_flight',description:'Discard the current private flight and return to the launch deck. Does not publish any score.',annotations:{readOnlyHint:false,untrustedContentHint:false},execute(x){validate(x);restart();return read();}}];
 for(const tool of tools)try{Promise.resolve(context.registerTool({...tool,inputSchema:schema},{signal:life.signal})).catch(()=>{});}catch{}
 return ()=>life.abort();
}
