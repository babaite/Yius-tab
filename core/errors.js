export const failure=(key,code)=>Object.assign(new Error(key),{code,uiKey:key});
export const clone=value=>structuredClone(value);
export const iconError=(key,params={})=>Object.assign(new Error(key),{uiKey:key,uiParams:params});
