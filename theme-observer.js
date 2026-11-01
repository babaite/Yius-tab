import {sendRequest} from './core/protocol.js';
const scheme=matchMedia('(prefers-color-scheme: dark)');
function notify(){sendRequest(chrome,'yiu-theme',{dark:scheme.matches}).catch(()=>{});}
scheme.addEventListener('change',notify);notify();
