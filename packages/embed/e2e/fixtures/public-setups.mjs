// Sanitized reproductions of public integration patterns observed 2026-09-26.
// No customer credentials, visitors, remote assets, or production API calls.
const setups = {
  trunkrs: `
    initOpenScript({token:'fixture-bot',language:'nl',
      initialMessages:['Hoi! Hoe kan ik je helpen?'],
      theme:{primaryColor:'#220c4a'},bot:{name:'Fred AI',avatar:'/avatar.svg'},
      textContent:{welcomeScreen:{title:'👋 Hey, welkom bij Trunkrs!',description:'Stel je vraag aan Fred'}},
      collectUserData:true,extraDataCollectionFields:['Trunkrs-nummer (beginnend met 41)','Post code']});
  `,
  deonlinedrogist: `
    const options={token:'fixture-bot',language:'nl',collectUserData:false,
      initialMessages:['Waarmee kan ik u van dienst zijn?'],
      textContent:{welcomeScreen:{title:'Welkom',description:'Chat met onze drogisten'}},
      assets:{organizationLogo:'/avatar.svg'},bot:{name:'DeOnlineDrogist support',avatar:'/avatar.svg'},
      extraDataCollectionFields:['Ordernummer'],
      accessibility:{widgetTriggerButton:{label:'Chat met onze drogisten'}},
      context:{category:{id:0,name:'Homepagina'}}};
    let loaded=false;
    function start(){
      const f=document.querySelector('#opencx-root iframe');
      const btn=f?.contentDocument?.querySelector('[data-component="trigger/btn"]');
      if(btn){btn.click();return true}return false;
    }
    function openChat(){
      if(loaded)return start();loaded=true;
      const script=document.createElement('script');script.src='/script.js';
      script.onload=()=>{
        initOpenScript(options);
        const observer=new MutationObserver(()=>{
          if(!document.querySelector('#opencx-root iframe'))return;
          observer.disconnect();document.querySelector('#opencx-start').remove();
          let elapsed=0;function retry(){if(start())return;elapsed+=50;if(elapsed<1000)setTimeout(retry,50)}retry();
        });observer.observe(document.body,{childList:true,subtree:true});
      };document.head.appendChild(script);
    }
    document.querySelectorAll('.j-chat-link,#opencx-start').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();openChat()}));
  `,
  qoyod: `
    const tokens={SA:'fixture-sa',JO:'fixture-jo'};
    initOpenScript({token:tokens[document.documentElement.dataset.qyCountry],language:'ar',
      initialMessages:['حياك الله عميلنا العزيز في قيود، كيف نقدر نخدمك؟'],
      theme:{primaryColor:'#021544'},thisWasHelpfulOrNot:{enabled:false},bot:{name:'يوسف',avatar:'/avatar.svg'}});
    function frames(){return document.querySelectorAll('#opencx-root iframe')}
    function trigger(){return [...frames()].find(f=>/Trigger/i.test(f.title))}
    function panel(){return [...frames()].find(f=>/OpenCX/i.test(f.title)&&!/Trigger/i.test(f.title))}
    function opened(){return document.querySelector('#opencx-root [data-state]')?.getAttribute('data-state')==='open'}
    function visible(){const r=panel()?.getBoundingClientRect();return r&&r.width>80&&r.height>80}
    function nudge(){const w=panel()?.parentElement;if(w){w.style.display='block';w.style.opacity='1';w.style.transform='none'}}
    document.addEventListener('click',e=>{
      const el=e.target.closest('[data-qy-open-chat]');if(!el)return;
      e.preventDefault();e.stopImmediatePropagation();let tries=0;
      function poll(){const btn=trigger()?.contentDocument?.querySelector('button');
        if(btn){if(!opened())btn.click();setTimeout(()=>{nudge();setTimeout(()=>{if(!visible())location.href=el.href},250)},300);return}
        if(++tries>75){location.href=el.href;return}setTimeout(poll,200)}poll();
    },true);
    let closedSince=0;
    setInterval(()=>{
      for(const f of frames()){const d=f.contentDocument;if(d?.head&&!d.getElementById('qy-cx-nobrand')){
        const s=d.createElement('style');s.id='qy-cx-nobrand';s.textContent='a[href*="open.cx"],div:has(> a[href*="open.cx"]){display:none!important}';d.head.appendChild(s)}}
      const w=panel()?.parentElement;if(!w)return;
      if(opened()){closedSince=0;return}if(!closedSince)closedSince=Date.now();
      if(Date.now()-closedSince>500&&getComputedStyle(w).display!=='none'){
        w.style.display='none';w.style.opacity='0';w.style.transform='translateY(8px)'}
    },250);
  `,
};

export function fixtureHtml(name, country = 'SA') {
  if (!(name in setups)) throw new Error('Unknown fixture');
  return `<!doctype html><html lang="${name === 'qoyod' ? 'ar' : 'nl'}" dir="${name === 'qoyod' ? 'rtl' : 'ltr'}" data-qy-country="${country}">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{font:16px system-ui}#opencx-start{position:fixed;right:20px;bottom:20px}
    ${name === 'deonlinedrogist' ? '#opencx-root>button{width:60px!important;height:60px!important}#opencx-root>button,#opencx-start,iframe[title="OpenCX Live Chat Trigger"]{z-index:52!important}' : ''}</style></head>
    <body><a href="/contact-us/" class="j-chat-link" data-qy-open-chat>Open support</a>
    ${name === 'deonlinedrogist' ? '<button id="opencx-start">Chat</button>' : '<script src="/script.js"></script>'}
    <script>addEventListener('DOMContentLoaded',()=>{${setups[name]}})</script></body></html>`;
}
