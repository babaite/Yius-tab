export function observeGridReflow(grid,isDragging) {
  let previous=null,frame=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function measure(){
    const style=getComputedStyle(grid),count=grid.children.length,padL=parseFloat(style.paddingLeft),padR=parseFloat(style.paddingRight),gap=parseFloat(style.columnGap),rowGap=parseFloat(style.rowGap);
    const available=grid.clientWidth-padL-padR,columns=Math.max(1,Math.min(count||1,Math.floor((available+gap)/(144+gap))));
    return {count,columns,x:grid.offsetLeft+padL+(available-columns*144-(columns-1)*gap)/2,y:grid.offsetTop+parseFloat(style.paddingTop),stepX:144+gap,stepY:104+rowGap};
  }
  function update(){frame=0;const next=measure(),old=previous;previous=next;
    if(!old||old.count!==next.count||old.columns===next.columns||isDragging()||reduced.matches)return;
    const tiles=[...grid.children],moves=[];
    for(let i=0;i<tiles.length;i++){
      const oldX=old.x+(i%old.columns)*old.stepX,oldY=old.y+Math.floor(i/old.columns)*old.stepY;
      const x=next.x+(i%next.columns)*next.stepX,y=next.y+Math.floor(i/next.columns)*next.stepY;
      if(Math.min(oldY,y)-scrollY>innerHeight+140||Math.max(oldY,y)-scrollY< -140)continue;
      const tile=tiles[i],running=tile.getAnimations();

      const matrix=running.length?new DOMMatrixReadOnly(getComputedStyle(tile).transform):null;
      moves.push({tile,running,dx:oldX-x+(matrix?.m41||0),dy:oldY-y+(matrix?.m42||0)});
    }
    for(const {running} of moves)for(const animation of running)animation.cancel();
    for(const {tile,dx,dy} of moves)if(Math.abs(dx)+Math.abs(dy)>.5)tile.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:250,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  const observer=new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(update);});observer.observe(grid);
  return ()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);};
}

export function observeGridScroll(grid){
 let frame=0;
 function update(){frame=0;const last=grid.lastElementChild;const bottom=last?last.offsetTop+last.offsetHeight:0;const fits=bottom<=document.documentElement.clientHeight;
  document.documentElement.classList.toggle('grid-fits',fits);
  if(fits&&scrollY)scrollTo({top:0,behavior:'instant'});
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
 const resize=new ResizeObserver(schedule);resize.observe(grid);
 const mutation=new MutationObserver(schedule);mutation.observe(grid,{childList:true});
 addEventListener('resize',schedule);schedule();
 return()=>{resize.disconnect();mutation.disconnect();removeEventListener('resize',schedule);cancelAnimationFrame(frame);};
}
