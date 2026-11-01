export function focusMenuItem(item){
 if(!item)return;
 item.focus({preventScroll:true});
 const menu=item.closest('[role=menu],[role=listbox]');if(!menu)return;
 const row=item.getBoundingClientRect(),bounds=menu.getBoundingClientRect(),top=bounds.top+menu.clientTop,bottom=top+menu.clientHeight;
 if(row.bottom>bottom)menu.scrollTop+=row.bottom-bottom;
 else if(row.top<top)menu.scrollTop-=top-row.top;
}
