// Every accepted delivery ends in a committed source, known duplicate, or visible recovery.
export async function receiveEmail(message, env, deps) {
  const allowed=String(env.ALLOWED_RECIPIENTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  const to=String(message.to||'').toLowerCase();
  if(!allowed.length || !allowed.includes(to)){message.setReject('Contracts relay recipient is not configured');return;}
  if(message.headers?.get('X-Kebab-Relay-Failed')){message.setReject('Contracts recovery forwarding loop');return;}
  let stage='read';
  try {
    if(message.rawSize>16000000)throw new Error('Message exceeds 16 MB');
    const raw=await deps.read(message.raw);
    if(raw.length>16000000)throw new Error('Message exceeds 16 MB');
    stage='parse';const parsed=await deps.parse(raw);
    stage='prepare';const intake=await deps.prepare(parsed,{to,from:message.from,raw},{mailbox:env.MAILBOX_ADDRESS||to});
    if(intake.incomplete)throw new Error('Attachments exceed intake limits');
    stage='commit';const result=await deps.deliver(intake);
    if(!result.ok&&!result.duplicate)throw new Error('Canister refused delivery');
    deps.log(`relay: ${result.duplicate?'duplicate':'committed'} source=${result.sourceId}`);
  } catch (_) {
    deps.log(`relay: delivery failed at ${stage}; recovering original`);
    const fallback=String(env.FALLBACK_ADDRESS||'').trim().toLowerCase();
    if(fallback&&!allowed.includes(fallback)&&fallback!==String(env.MAILBOX_ADDRESS||'').toLowerCase()){
      try {const h=new Headers({'X-Kebab-Relay-Failed':stage});await message.forward(fallback,h);deps.log('relay: original sent to recovery mailbox');return;}
      catch(_){deps.log('relay: recovery mailbox delivery failed');}
    }
    // SMTP rejection is not a durable retry queue. Retain the Google copy independently.
    message.setReject('Contracts intake failed. Original was not confirmed; contact your contracts administrator.');
  }
}
