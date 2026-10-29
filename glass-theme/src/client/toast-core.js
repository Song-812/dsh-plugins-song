/* 可独立加载；同一窗口所有设置插件共用队列。 */
(function () {
  if (window.__dshSettingsToastV1) return;
  const queue = [], canceled = new WeakSet();
  let current = null, node = null, timer = null, keyListener = null, priorFocus = null;
  function close(result) {
    const item = current; current = null;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (keyListener) { document.removeEventListener('keydown', keyListener, true); keyListener = null; }
    if (node) { node.remove(); node = null; }
    if (priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function') priorFocus.focus();
    priorFocus = null;
    if (item && item.resolve) item.resolve(result === true);
    render();
  }
  function render() {
    if (current || queue.length === 0 || !document.body) return;
    const item = queue.shift();
    if (canceled.has(item.owner)) { if (item.resolve) item.resolve(false); render(); return; }
    current = item;
    node = document.createElement('div');
    node.dataset.dshSettingsToast = '';
    node.setAttribute('role', item.kind === 'confirm' ? 'alertdialog' : 'alert');
    node.setAttribute('aria-label', item.text);
    node.style.cssText = 'position:fixed;top:40px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:10px;pointer-events:none;max-width:min(640px,calc(100vw - 48px));padding:12px 16px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-toast-bg,#303134);color:var(--dsw-alias-toast-label,#fff);font:14px/22px var(--dsw-font-family, sans-serif);box-shadow:0 6px 22px #0003;overflow-wrap:anywhere;';
    const icon = document.createElement('span'); icon.setAttribute('aria-hidden','true');
    if (item.kind === 'success') {
      icon.style.cssText = 'display:grid;place-items:center;flex:none;color:var(--dsw-alias-state-success-primary,#00d765)';
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      for (const [name,value] of [['width','16'],['height','16'],['viewBox','0 0 16 16'],['fill','none'],['stroke-width','1']]) svg.setAttribute(name,value);
      for (const d of ["M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z","M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z"]) { const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',d); path.setAttribute('fill','currentColor'); svg.append(path); }
      icon.append(svg);
    } else {
      icon.textContent = '!';
      icon.style.cssText = 'display:grid;place-items:center;flex:none;width:16px;height:16px;border:1.5px solid currentColor;border-radius:50%;font-size:11px;line-height:1;color:' + (item.kind === 'error' ? '#ff9587' : '#ffca7a');
    }
    const text = document.createElement('span'); text.textContent = item.text; text.style.cssText='min-width:0;max-height:50vh;overflow:auto;'; node.append(icon,text);
    if (item.kind === 'confirm') {
      for (const [label, answer] of [[(item.labels && item.labels[0]) || '确认','yes'],[(item.labels && item.labels[1]) || '取消','no']]) {
        const btn = document.createElement('button'); btn.type='button'; btn.dataset.answer=answer; btn.textContent=label;
        btn.style.cssText='pointer-events:auto;flex:none;border:0;background:none;padding:2px 3px;font:inherit;cursor:pointer;color:var(--glass-accent,var(--dsw-alias-brand-primary,#f077af))';
        btn.addEventListener('click',()=>close(answer==='yes')); node.append(btn);
      }
      priorFocus = document.activeElement;
      keyListener = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); return; }
        if (e.key !== 'Tab') return;
        const buttons = Array.from(node.querySelectorAll('button'));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement);
        const next = index < 0 ? (e.shiftKey ? buttons.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault(); buttons[next].focus();
      };
      document.addEventListener('keydown', keyListener, true);
    } else timer=setTimeout(()=>close(false),item.kind==='error'?8000:4000);
    document.body.append(node); if(item.kind==='confirm') node.querySelector('[data-answer="no"]')?.focus();
  }
  window.__dshSettingsToastV1 = {
    activate(owner){canceled.delete(owner);},
    show(owner,kind,text){
      text=String(text);
      if(canceled.has(owner)) return;
      if((current && current.owner===owner && current.kind===kind && current.text===text) || queue.some(item=>item.owner===owner && item.kind===kind && item.text===text)) return;
      queue.push({owner,kind,text}); render();
    },
    confirm(owner,text,labels){return new Promise(resolve=>{if(canceled.has(owner) || (current && current.owner===owner && current.kind==='confirm') || queue.some(item=>item.owner===owner && item.kind==='confirm')){resolve(false);return;}queue.push({owner,kind:'confirm',text:String(text),labels,resolve});render();});},
    cancel(owner){canceled.add(owner);for(let i=queue.length-1;i>=0;i--)if(queue[i].owner===owner){const item=queue.splice(i,1)[0];if(item.resolve)item.resolve(false);}if(current && current.owner===owner)close(false);}
  };
})();
