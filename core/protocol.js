export const PROTOCOL='yius-tab',PROTOCOL_VERSION=2;
export const OPERATIONS=Object.freeze(['yiu-theme','yiu-icons-changed','yiu-sync-check','yiu-sync-now','yiu-sync-resolve','yiu-sync-recover','yiu-sync-confirm-delete','yiu-sync-test']);
export function requestMessage(type,payload={}){
 if(!OPERATIONS.includes(type))throw new Error('protocolUnknownOperation');
 return {protocol:PROTOCOL,version:PROTOCOL_VERSION,id:crypto.randomUUID(),type,payload};
}
export function parseMessage(message){
 if(!message||!OPERATIONS.includes(message.type))return null;
 if(message.protocol!==PROTOCOL||message.version!==PROTOCOL_VERSION||typeof message.id!=='string'||message.id.length>100||!message.payload||typeof message.payload!=='object'||Array.isArray(message.payload))throw new Error('protocolInvalid');
 const payload=message.payload;
 if(message.type==='yiu-theme'&&typeof payload.dark!=='boolean')throw new Error('protocolInvalid');
 if(payload.foreground!==undefined&&typeof payload.foreground!=='boolean')throw new Error('protocolInvalid');
 if(message.type==='yiu-sync-resolve'&&!['local','remote'].includes(payload.resolution))throw new Error('protocolInvalid');
 if(message.type==='yiu-sync-confirm-delete'&&payload.approvalId!==undefined&&(typeof payload.approvalId!=='string'||!payload.approvalId))throw new Error('protocolInvalid');
 return {type:message.type,payload,id:message.id};
}
export async function sendRequest(api,type,payload={}){
 const request=requestMessage(type,payload),reply=await api.runtime.sendMessage(request);
 if(reply?.protocol!==PROTOCOL)throw new Error('protocolMismatch');
 if(reply.version!==PROTOCOL_VERSION||reply.id!==request.id)throw new Error('protocolMismatch');
 if(!reply.ok)throw Object.assign(new Error(reply.error?.code||'protocolFailed'),{code:reply.error?.code});
 return reply.data;
}
export function createMessageRouter({api,handlers}){
 const pending=new Map();
 return (message,sender,sendResponse)=>{
  if(sender.id!==api.runtime.id||!Object.hasOwn(handlers,message?.type))return;
  let parsed;try{parsed=parseMessage(message);}catch(error){sendResponse({protocol:PROTOCOL,version:PROTOCOL_VERSION,id:message?.id,ok:false,error:{code:error.message}});return false;}
  if(!parsed)return;
  const key=parsed.type+':'+parsed.id;
  let work=key&&pending.get(key);
  if(!work){work=Promise.resolve().then(()=>handlers[parsed.type](parsed.payload));if(key){pending.set(key,work);work.finally(()=>pending.delete(key)).catch(()=>{});}}
  work.then(data=>sendResponse({protocol:PROTOCOL,version:PROTOCOL_VERSION,id:parsed.id,ok:true,data})).catch(error=>sendResponse({protocol:PROTOCOL,version:PROTOCOL_VERSION,id:parsed.id,ok:false,error:{code:error.uiKey||error.code||'protocolFailed'}}));
  return true;
 };
}
