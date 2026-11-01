import {t} from './i18n.js';

export function createColorPicker({input,trigger,panel,onChange}) {
  let h=0,s=0,v=1,a=1,format='HSL',lastValue='',closeTimer=0,dragging=false,editing=null,numericDrag=null,pendingCaret=null,consumeBlurClick=false;
  panel.innerHTML=`<div class="color-sv" role="slider" tabindex="0" aria-label="${t('svLabel')}"><span class="color-point"></span></div>
    <div class="color-tools"><button type="button" class="eyedropper" aria-label="${t('eyedropper')}" title="${t('eyedropper')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l3-3a2.8 2.8 0 0 1 4 4l-3 3M12 5l7 7M13 7 5 15l-1 4 4-1 8-8"/></svg></button><div class="color-tracks"><input class="hue-range" aria-label="${t('hue')}" type="range" min="0" max="360" step="1"><div class="alpha-track"><input class="alpha-range" aria-label="${t('opacity')}" type="range" min="0" max="100" step="1"></div></div></div>
    <div class="color-fields"><div class="color-format"><button type="button" class="format-trigger" aria-haspopup="listbox" aria-expanded="false">HSL <span>⌄</span></button><div class="format-menu" role="listbox" aria-label="${t('colorFormat')}" hidden><button type="button" role="option" data-format="HSL">HSL</button><button type="button" role="option" data-format="RGB">RGB</button><button type="button" role="option" data-format="HEX">HEX</button></div></div><div class="color-numbers"></div></div>`;
  const sv=panel.querySelector('.color-sv'),point=panel.querySelector('.color-point'),hue=panel.querySelector('.hue-range'),alpha=panel.querySelector('.alpha-range'),fields=panel.querySelector('.color-numbers'),formatButton=panel.querySelector('.format-trigger'),formatMenu=panel.querySelector('.format-menu');
  const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
  function rgb(){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const seg=Math.floor((h%360)/60),base=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][seg];return base.map(n=>Math.round((n+m)*255));}
  function fromRGB(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;v=max;s=max?d/max:0;if(d)h=((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60)%360;}
  function hsl(){const l=v*(1-s/2);return [Math.round(h),Math.round((l===0||l===1?0:(v-l)/Math.min(l,1-l))*100),Math.round(l*100)];}
  function fromHSL(hue,sat,light){h=((hue%360)+360)%360;const l=clamp(light/100),c=clamp(sat/100);v=l+c*Math.min(l,1-l);s=v?2*(1-l/v):0;}
  function hex(){const channels=rgb();if(a<.999)channels.push(Math.round(a*255));return '#'+channels.map(n=>n.toString(16).padStart(2,'0')).join('');}
  function position(){if(panel.hidden)return;const r=trigger.getBoundingClientRect(),d=trigger.closest('dialog')?.getBoundingClientRect(),width=panel.offsetWidth,height=panel.offsetHeight;let left=clamp(r.right-width,12,Math.max(12,innerWidth-width-12)),top=r.bottom+10;if(top+height>innerHeight-14)top=Math.max(14,r.top-height-10);if(d&&width<d.width)left=clamp(left,d.left+12,d.right-width-12);panel.style.left=left+'px';panel.style.top=top+'px';}
  function values(){return format==='HEX'?[hex().toUpperCase()]:[...(format==='HSL'?hsl():rgb()),Math.round(a*100)];}
  function applyFields(){
    const nodes=[...fields.querySelectorAll('input')];
    if(format==='HEX'){if(!/^#[\da-f]{6}([\da-f]{2})?$/i.test(nodes[0]?.value||''))return false;parse(nodes[0].value);}
    else {
      if(nodes.some(el=>!/^[-+]?\d+(\.\d+)?$/.test(el.value.trim())))return false;
      const nums=nodes.map((el,i)=>clamp(Number(el.value),0,i===3?100:format==='HSL'?(i===0?360:100):255));
      a=nums[3]/100;if(format==='HSL')fromHSL(...nums.slice(0,3));else fromRGB(...nums.slice(0,3));
    }
    render(false);emit();return true;
  }
  function finishEditing(){
    const field=editing;if(!field)return;applyFields();editing=null;pendingCaret=null;
    field.readOnly=true;field.classList.remove('is-editing');field.blur();drawFields();
  }
  function startEditing(field,selectAll=false){
    if(editing&&editing!==field)finishEditing();editing=field;field.readOnly=false;field.classList.add('is-editing');field.focus({preventScroll:true});
    if(selectAll)field.select();else field.setSelectionRange(field.value.length,field.value.length);
  }
  function stopScrubbing(){numericDrag=null;document.documentElement.classList.remove('color-scrubbing');}
  function drawFields(){
    const current=values();

    if(fields.dataset.format===format&&fields.children.length===current.length){
      [...fields.children].forEach((field,i)=>{if(field!==editing)field.value=current[i];});return;
    }
    fields.dataset.format=format;fields.replaceChildren();
    const names=(format==='HEX'?['hexColor']:format==='HSL'?['hslHue','hslSaturation','hslLightness','colorOpacity']:['red','green','blue','colorOpacity']).map(key=>t(key));
    current.forEach((value,i)=>{
      const field=document.createElement('input');field.type='text';field.inputMode=format==='HEX'?'text':'numeric';field.value=value;field.readOnly=true;field.setAttribute('aria-label',names[i]);field.spellcheck=false;
      if(format==='HEX')field.classList.add('hex-value');
      field.oninput=()=>{if(editing===field)applyFields();};
      field.onfocus=()=>{if(editing!==field&&!numericDrag)startEditing(field);};
      field.onpointerdown=e=>{
        if(e.button!==0||editing===field)return;e.preventDefault();
        if(format==='HEX'){startEditing(field);pendingCaret=field;return;}
        numericDrag={field,id:e.pointerId,startX:e.clientX,startValue:Number(field.value),max:i===3?100:format==='HSL'?(i===0?360:100):255,moved:false};field.setPointerCapture(e.pointerId);
      };
      field.onpointermove=e=>{
        const drag=numericDrag;if(!drag||drag.field!==field||drag.id!==e.pointerId)return;
        const dx=e.clientX-drag.startX;if(!drag.moved&&Math.abs(dx)<3)return;drag.moved=true;document.documentElement.classList.add('color-scrubbing');
        field.value=Math.round(clamp(drag.startValue+dx*(e.shiftKey ? 0.1 : 1),0,drag.max));applyFields();
      };
      field.onpointerup=e=>{
        const drag=numericDrag;if(!drag||drag.field!==field||drag.id!==e.pointerId)return;
        if(field.hasPointerCapture(e.pointerId))field.releasePointerCapture(e.pointerId);stopScrubbing();
        if(!drag.moved){startEditing(field);pendingCaret=field;}else drawFields();
      };
      field.onpointercancel=()=>stopScrubbing();field.onlostpointercapture=()=>{if(numericDrag?.field===field)stopScrubbing();};
      field.onclick=e=>{if(pendingCaret===field){e.preventDefault();field.setSelectionRange(field.value.length,field.value.length);pendingCaret=null;}else if(editing!==field)e.preventDefault();};
      field.ondblclick=e=>{e.preventDefault();stopScrubbing();startEditing(field,true);};
      field.onkeydown=e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();finishEditing();}else if(e.key==='Tab')finishEditing();};
      fields.append(field);
    });
    fields.classList.toggle('hex-fields',format==='HEX');
  }
  function render(updateFields=true){const color=hex(),opaque='rgb('+rgb().join(',')+')';panel.style.setProperty('--picker-hue',`hsl(${h} 100% 50%)`);panel.style.setProperty('--picker-color',opaque);point.style.left=(s*100)+'%';point.style.top=((1-v)*100)+'%';point.style.background=opaque;hue.value=Math.round(h);alpha.value=Math.round(a*100);trigger.style.setProperty('--swatch-color',color);trigger.style.setProperty('--swatch-opaque',opaque);trigger.classList.toggle('has-alpha',a<.999);sv.setAttribute('aria-valuetext',t('svValue',{s:Math.round(s*100),v:Math.round(v*100)}));if(updateFields)drawFields();}
  function emit(){lastValue=hex();input.value=lastValue;trigger.setAttribute('aria-label',t('currentColor',{color:lastValue}));onChange(lastValue);}
  function parse(value){

    const match=/^#([\da-f]{6})([\da-f]{2})?$/i.exec(value);
    if(match){fromRGB(...[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)));a=match[2]?parseInt(match[2],16)/255:1;return;}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const c=ctx.getImageData(0,0,1,1).data;fromRGB(...c);a=c[3]/255;}
  function setValue(value){if(value===lastValue)return;parse(value);lastValue=value;input.value=value;render();}
  function close(immediate=false){finishEditing();stopScrubbing();clearTimeout(closeTimer);formatMenu.hidden=true;formatButton.setAttribute('aria-expanded','false');trigger.setAttribute('aria-expanded','false');if(immediate){panel.hidden=true;return;}panel.classList.add('is-closing');closeTimer=setTimeout(()=>{panel.hidden=true;panel.classList.remove('is-closing');},140);}
  function open(){clearTimeout(closeTimer);panel.classList.remove('is-closing');panel.hidden=false;trigger.setAttribute('aria-expanded','true');render();position();}
  trigger.onclick=e=>{e.stopPropagation();panel.hidden?open():close();};
  document.addEventListener('pointerdown',e=>{
    if(panel.hidden)return;
    if(editing&&e.target!==editing){
      const nextField=e.target.closest('.color-numbers input');
      const colorControl=panel.contains(e.target)&&e.target.closest('.color-sv,.color-tracks,.color-format,.eyedropper');
      finishEditing();
      if(!nextField&&!colorControl){consumeBlurClick=true;e.preventDefault();e.stopImmediatePropagation();return;}
    }
    if(!panel.contains(e.target)&&!trigger.contains(e.target))close();
  },true);
  document.addEventListener('click',e=>{if(consumeBlurClick){consumeBlurClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopImmediatePropagation();if(editing){finishEditing();return;}close();trigger.focus({preventScroll:true});}},true);
  function setSV(e){const r=sv.getBoundingClientRect();s=clamp((e.clientX-r.left)/r.width);v=1-clamp((e.clientY-r.top)/r.height);render();emit();}
  sv.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();dragging=true;sv.setPointerCapture(e.pointerId);setSV(e);};sv.onpointermove=e=>{if(dragging)setSV(e);};sv.onpointerup=sv.onpointercancel=()=>dragging=false;
  sv.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')s=clamp(s-.01);if(e.key==='ArrowRight')s=clamp(s+.01);if(e.key==='ArrowUp')v=clamp(v+.01);if(e.key==='ArrowDown')v=clamp(v-.01);render();emit();};
  hue.oninput=()=>{h=Number(hue.value)%360;render();emit();};alpha.oninput=()=>{a=Number(alpha.value)/100;render();emit();};
  formatButton.onclick=()=>{formatMenu.hidden=!formatMenu.hidden;formatButton.setAttribute('aria-expanded',String(!formatMenu.hidden));};
  for(const option of formatMenu.querySelectorAll('button'))option.onclick=()=>{finishEditing();format=option.dataset.format;formatButton.firstChild.textContent=format+' ';formatMenu.hidden=true;formatButton.setAttribute('aria-expanded','false');drawFields();};
  const eye=panel.querySelector('.eyedropper');eye.disabled=!('EyeDropper' in window);eye.onclick=async()=>{try{const result=await new EyeDropper().open();const opacity=a;parse(result.sRGBHex);a=opacity;render();emit();}catch{}};
  addEventListener('resize',position,{passive:true});trigger.closest('dialog')?.addEventListener('scroll',position,{passive:true});
  function refreshLocale(){
    finishEditing();sv.setAttribute('aria-label',t('svLabel'));eye.setAttribute('aria-label',t('eyedropper'));eye.title=t('eyedropper');hue.setAttribute('aria-label',t('hue'));alpha.setAttribute('aria-label',t('opacity'));formatMenu.setAttribute('aria-label',t('colorFormat'));trigger.setAttribute('aria-label',t('chooseColor'));fields.dataset.format='';drawFields();render(false);
  }
  return {setValue,close,refreshLocale,isOpen:()=>!panel.hidden};
}
