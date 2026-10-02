'use strict';
const icons={
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  chat:'<path d="M21 11a9 9 0 0 1-13 8l-5 2 2-5A9 9 0 1 1 21 11Z"/><path d="M8 10h8M8 14h5"/>',
  monitor:'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  book:'<path d="M12 5v16M12 5C8 2 3 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-4-2-7-1-10 1Z"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13M12 8C4 8 5 1 9 3l3 5Zm0 0c8 0 7-7 3-5l-3 5Z"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  spark:'<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  print:'<path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6Z"/>',
  left:'<path d="m15 5-7 7 7 7"/>',
  right:'<path d="m9 5 7 7-7 7"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.book}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const $=id=>document.getElementById(id);
const escapeHtml=str=>String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories=window.ATUALIZA_CONTENT.categories;
const maps=categories.flatMap(cat=>cat.titles.map((title,i)=>({id:`${cat.id}-${String(i+1).padStart(3,'0')}`,title,category:cat.id,name:cat.name,color:cat.color,number:i+1,path:`mapas/${cat.id}/${cat.id}-${String(i+1).padStart(3,'0')}.webp`})));
let saved={};try{saved=JSON.parse(localStorage.getItem('atualiza40-br-v1')||'{}')||{}}catch{}
const validIds=new Set(maps.map(m=>m.id));
const state={favorites:new Set((Array.isArray(saved.favorites)?saved.favorites:[]).filter(id=>validIds.has(id))),completed:new Set((Array.isArray(saved.completed)?saved.completed:[]).filter(id=>validIds.has(id))),last:validIds.has(saved.last)?saved.last:null,large:saved.large===true,theme:saved.theme||'dark'};
let view='all',category=null,limit=12,active=null,readerList=[],zoom=1,toastTimer;
function save(){try{localStorage.setItem('atualiza40-br-v1',JSON.stringify({...state,favorites:[...state.favorites],completed:[...state.completed]}))}catch{notify('Não foi possível salvar neste navegador.')}}
function applyTheme(t){
  state.theme=t;
  document.documentElement.setAttribute('data-theme',t);
  const btn=$('themeToggle');
  if(btn){
    const iconEl=$('themeIcon');
    const labelEl=$('themeLabel');
    if(iconEl) iconEl.innerHTML=icon(t==='dark'?'sun':'moon');
    if(labelEl) labelEl.textContent=t==='dark'?'Modo Claro':'Modo Escuro';
    btn.setAttribute('title',t==='dark'?'Mudar para Modo Claro':'Mudar para Modo Escuro');
  }
  save();
}
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200)}
function updateProgress(){
  const hasMaps = Boolean(window.EntitlementsModule && window.EntitlementsModule.has('maps_150'));
  const done=state.completed.size;
  $('doneCount').textContent=done;
  $('progressFill').style.width=`${done/maps.length*100}%`;
  $('progressText').textContent=done===150?'Você concluiu todos os mapas. Parabéns!':done?`${Math.round(done/150*100)}% concluído. Continue no seu ritmo.`:'Seu primeiro passo começa aqui.';
  const last=maps.find(m=>m.id===state.last);
  $('continue').textContent=hasMaps ? (last?'Continuar de onde parei':'Começar pelo primeiro mapa') : 'Biblioteca bloqueada no seu plano';
}
function renderCategories(){$('categories').innerHTML=categories.map((cat,index)=>`<button class="category" style="--category:${cat.color}" data-category="${cat.id}" aria-pressed="${category===cat.id}"><span class="category-cover"><span class="cover-index">0${index+1}</span><span class="category-icon">${icon(cat.icon)}</span><span class="cover-label">ATUALIZA 40+</span></span><span class="category-count">${cat.titles.length} mapas</span><strong>${cat.name}</strong><p>${cat.subtitle}</p></button>`).join('')}
const normalize=str=>str.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function filteredMaps(){const words=normalize($('search').value.trim()).split(/\s+/).filter(Boolean);return maps.filter(m=>(!category||category===m.category)&&(view!=='favorites'||state.favorites.has(m.id))&&(view!=='completed'||state.completed.has(m.id))&&words.every(word=>normalize(`${m.title} ${m.name} mapa ${m.number}`).includes(word)))}

function render(){
  updateProgress();
  renderCategories();
  document.querySelectorAll('[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
  const extra=window.ATUALIZA_CONTENT.extras[view];
  $('search').closest('label').hidden=!!extra;
  $('categoryTitle').closest('section').hidden=!!extra;
  const labels={all:'Todos os mapas visuais',favorites:'Meus mapas favoritos',completed:'Mapas concluídos',bonus:'Bônus',orderBump:'Materiais extras',upsell:'Conteúdo complementar'};
  $('libraryTitle').textContent=category?categories.find(c=>c.id===category).name:labels[view];
  $('libraryEyebrow').textContent=extra?'SEUS CONTEÚDOS':'SUA BIBLIOTECA';
  $('clearFilter').hidden=!category&&!$('search').value;
  const list=extra?[]:filteredMaps();
  $('resultCount').textContent=extra?'':`${list.length} ${list.length===1?'mapa encontrado':'mapas encontrados'}`;

  const hasMaps = Boolean(window.EntitlementsModule && window.EntitlementsModule.has('maps_150'));

  if (extra) {
    if (extra.length > 0) {
      $('mapGrid').innerHTML = extra.map(m => {
        const isUnlocked = Boolean(window.EntitlementsModule && window.EntitlementsModule.has(m.productCode));
        return `
          <article class="extra-card ${isUnlocked ? 'is-unlocked' : 'is-locked'}" style="--category:${m.color}">
            <div class="extra-cover"><span class="cover-index">${String(m.id).includes('bonus') ? 'BÔNUS' : 'EXTRA'}</span><span class="category-icon">${icon(m.icon || 'gift')}</span><span class="cover-label">ATUALIZA 40+</span></div>
            <div class="card-body">
              <div class="extra-card-header">
                <span class="extra-tag">${isUnlocked ? 'Incluído no seu plano' : escapeHtml(m.badge || 'Adicional')}</span>
              </div>
              <h3>${escapeHtml(m.title)}</h3>
              <p>${escapeHtml(m.subtitle || '')}</p>
              <div class="extra-card-footer">
                <div class="extra-card-status">
                  ${isUnlocked ? `${icon('unlock')} <span>Material disponível · Arquivo protegido em preparação</span>` : `${icon('lock')} <span>${escapeHtml(m.badgeRequired || 'Material bloqueado')}</span>`}
                </div>
                <button type="button" class="btn-lock-state ${isUnlocked ? 'unlocked' : 'locked'}" disabled>
                  ${isUnlocked ? `${icon('unlock')} Disponível no seu plano` : `${icon('lock')} Bloqueado`}
                </button>
              </div>
            </div>
          </article>
        `;
      }).join('');
    } else {
      $('mapGrid').innerHTML = '';
    }
  } else {
    $('mapGrid').innerHTML = list.slice(0,limit).map(m => {
      if (hasMaps) {
        return `<article class="map-card" style="--category:${m.color}"><button class="card-open" data-open="${m.id}" aria-label="Abrir mapa: ${escapeHtml(m.title)}"><div class="map-preview"><img src="${m.path}" alt="" loading="lazy" width="1055" height="1491"></div><div class="card-body"><div class="card-meta">${m.name}<span>·</span>Mapa ${String(m.number).padStart(2,'0')}</div><h3>${escapeHtml(m.title)}</h3><div class="card-bottom"><span>Abrir mapa visual</span>${state.completed.has(m.id)?`<span class="done-badge">${icon('check')}Concluído</span>`:''}</div></div></button><button class="favorite-button" data-favorite="${m.id}" aria-pressed="${state.favorites.has(m.id)}" aria-label="${state.favorites.has(m.id)?'Remover dos favoritos':'Favoritar'}: ${escapeHtml(m.title)}">${icon('star')}</button></article>`;
      } else {
        return `<article class="map-card is-locked" style="--category:${m.color}"><div class="card-lock-badge">${icon('lock')} Bloqueado</div><button class="card-open" data-open="${m.id}" aria-label="Mapa bloqueado: ${escapeHtml(m.title)}"><div class="map-preview"><img src="${m.path}" alt="" loading="lazy" width="1055" height="1491"></div><div class="card-body"><div class="card-meta">${m.name}<span>·</span>Mapa ${String(m.number).padStart(2,'0')}</div><h3>${escapeHtml(m.title)}</h3><div class="card-bottom"><span>${icon('lock')} Bloqueado no seu acesso</span></div></div></button></article>`;
      }
    }).join('');
  }

  $('empty').hidden=extra?extra.length>0:list.length>0;
  if(!list.length){
    const text=extra?{
      bonus:['Seus bônus aparecerão aqui','Os materiais desta seção ainda não foram adicionados.'],
      orderBump:['Seus materiais extras aparecerão aqui','Os materiais desta seção ainda não foram adicionados.'],
      upsell:['Seu conteúdo complementar aparecerá aqui','Os materiais desta seção ainda não foram adicionados.']
    }[view]:view==='favorites'?['Guarde seus mapas preferidos','Toque na estrela de um mapa para encontrá-lo aqui.']:view==='completed'?['Cada passo conta','Ao terminar um mapa, marque como concluído. Ele aparecerá aqui.']:['Nenhum mapa encontrado','Tente buscar por uma palavra mais simples, como foto, internet ou mensagem.'];
    if(text)$('empty').innerHTML=`${icon(extra?'gift':view==='favorites'?'star':'book')}<h3>${text[0]}</h3><p>${text[1]}</p>`;
  }
  $('loadMore').hidden=!!extra||list.length<=limit;
}

function favorite(id){
  const hasMaps = Boolean(window.EntitlementsModule && window.EntitlementsModule.has('maps_150'));
  if (!hasMaps) {
    notify('Biblioteca não disponível no seu acesso atual.');
    return;
  }
  if(state.favorites.has(id)){
    state.favorites.delete(id);
    notify('Mapa removido dos favoritos.');
  }else{
    state.favorites.add(id);
    notify('Mapa salvo nos favoritos.');
  }
  save();
  render();
  if(active)updateReaderButtons();
}

function updateReaderButtons(){
  const done=state.completed.has(active.id);
  $('complete').innerHTML=`${icon('check')}${done?'Concluído · desfazer':'Marcar como concluído'}`;
  $('complete').setAttribute('aria-pressed',done);
  const fav=state.favorites.has(active.id);
  $('readerFavorite').innerHTML=`${icon('star')}${fav?'Favoritado':'Favoritar'}`;
  $('readerFavorite').setAttribute('aria-pressed',fav);
  const i=readerList.findIndex(m=>m.id===active.id);
  $('previous').disabled=i<=0;
  $('next').disabled=i>=readerList.length-1;
}

function setZoom(value){
  zoom=Math.max(1,Math.min(3,value));
  $('mapImage').style.width=`${zoom*100}%`;
  $('zoomValue').textContent=`${Math.round(zoom*100)}%`;
  $('zoomOut').disabled=zoom<=1;
  $('zoomIn').disabled=zoom>=3;
}

function loadMap(map){
  active=map;
  state.last=map.id;
  save();
  updateProgress();
  $('readerCategory').textContent=`${map.name} · Mapa ${String(map.number).padStart(2,'0')}`;
  $('readerTitle').textContent=map.title;
  $('readerProgressLabel').textContent=`Guia ${maps.findIndex(item=>item.id===map.id)+1} de ${maps.length}`;
  $('mapImage').hidden=false;
  $('imageError').hidden=true;
  $('mapImage').alt=`Mapa visual: ${map.title}`;
  $('mapImage').src=map.path;
  $('download').href=map.path;
  $('download').download=`Atualiza40-${map.id}.webp`;
  setZoom(1);
  $('imageStage').scrollTo(0,0);
  updateReaderButtons();
}

function openMap(id,fromContinue=false){
  if (!window.EntitlementsModule || !window.EntitlementsModule.has('maps_150')) {
    notify('Biblioteca não disponível no seu acesso atual.');
    return;
  }
  const map=maps.find(m=>m.id===id);
  if(!map)return;
  readerList=fromContinue?maps:filteredMaps();
  if(!readerList.some(m=>m.id===id))readerList=maps;
  loadMap(map);
  $('reader').showModal();
  document.body.style.overflow='hidden';
}

function closeReader(){
  $('reader').close();
  document.body.style.overflow='';
  active=null;
  render();
}

document.addEventListener('click',event=>{
  const open=event.target.closest('[data-open]');
  if(open)openMap(open.dataset.open);
  const fav=event.target.closest('[data-favorite]');
  if(fav)favorite(fav.dataset.favorite);
  const cat=event.target.closest('[data-category]');
  if(cat){
    view='all';
    category=category===cat.dataset.category?null:cat.dataset.category;
    limit=12;
    render();
  }
  const nav=event.target.closest('[data-view]');
  if(nav){
    view=nav.dataset.view;
    category=null;
    limit=12;
    $('search').value='';
    document.body.classList.remove('menu-open');
    $('menu').setAttribute('aria-expanded','false');
    render();
    $('libraryTitle').scrollIntoView({behavior:'smooth',block:'start'});
  }
});

document.querySelector('.brand').addEventListener('click',()=>{
  view='all';
  category=null;
  $('search').value='';
  limit=12;
  document.body.classList.remove('menu-open');
  $('menu').setAttribute('aria-expanded','false');
  render();
});

let searchTimer;
$('search').addEventListener('input',()=>{
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{
    limit=12;
    render();
  },120);
});

$('loadMore').onclick=()=>{limit+=12;render();};
$('clearFilter').onclick=()=>{category=null;$('search').value='';limit=12;render();};
$('continue').onclick=()=>openMap(state.last||maps[0].id,true);
$('menu').onclick=()=>{const open=document.body.classList.toggle('menu-open');$('menu').setAttribute('aria-expanded',open);};
$('textSize').onclick=()=>{state.large=!state.large;document.documentElement.classList.toggle('large-text',state.large);$('textSize').setAttribute('aria-pressed',state.large);save();};
$('closeReader').onclick=closeReader;
$('reader').addEventListener('cancel',event=>{event.preventDefault();closeReader();});
$('reader').addEventListener('click',event=>{if(event.target===$('reader'))closeReader();});
$('previous').onclick=()=>{const i=readerList.findIndex(m=>m.id===active.id);if(i>0)loadMap(readerList[i-1]);};
$('next').onclick=()=>{const i=readerList.findIndex(m=>m.id===active.id);if(i<readerList.length-1)loadMap(readerList[i+1]);};
$('zoomIn').onclick=()=>setZoom(zoom+.25);
$('zoomOut').onclick=()=>setZoom(zoom-.25);
$('zoomReset').onclick=()=>setZoom(1);
$('readerFavorite').onclick=()=>favorite(active.id);
$('complete').onclick=()=>{
  const hasMaps = Boolean(window.EntitlementsModule && window.EntitlementsModule.has('maps_150'));
  if (!hasMaps) {
    notify('Biblioteca não disponível no seu acesso atual.');
    return;
  }
  const id=active.id;
  if(state.completed.has(id)){
    state.completed.delete(id);
    notify('Conclusão desfeita.');
  }else{
    state.completed.add(id);
    notify('Mais um passo concluído!');
  }
  save();
  updateProgress();
  updateReaderButtons();
};
$('print').onclick=()=>{document.body.classList.add('printing');window.print();};
window.addEventListener('afterprint',()=>document.body.classList.remove('printing'));
$('mapImage').onerror=()=>{$('mapImage').hidden=true;$('imageError').hidden=false;};
$('help').onclick=()=>{$('helpDialog').showModal();document.body.classList.remove('menu-open');$('menu').setAttribute('aria-expanded','false');};
$('closeHelp').onclick=$('startHelp').onclick=()=>$('helpDialog').close();
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('menu-open')){
    document.body.classList.remove('menu-open');
    $('menu').setAttribute('aria-expanded','false');
  }
  if(!$('reader').open||/INPUT|TEXTAREA/.test(event.target.tagName))return;
  if(event.key==='ArrowLeft'&&!$('previous').disabled)$('previous').click();
  if(event.key==='ArrowRight'&&!$('next').disabled)$('next').click();
});
document.documentElement.classList.toggle('large-text',state.large);
$('textSize').setAttribute('aria-pressed',state.large);
if($('themeToggle')) $('themeToggle').onclick=()=>applyTheme(state.theme==='dark'?'light':'dark');
applyTheme(state.theme);

function showLoginOverlay(alertMsg, alertType) {
  const overlay = $('loginOverlay');
  if (overlay) overlay.hidden = false;
  const alertBox = $('loginAlert');
  if (alertBox) {
    if (alertMsg) {
      $('loginAlertMessage').textContent = alertMsg;
      alertBox.className = 'auth-alert auth-alert-' + (alertType || 'error');
      alertBox.hidden = false;
    } else {
      alertBox.hidden = true;
    }
  }
}

function hideLoginOverlay() {
  const overlay = $('loginOverlay');
  if (overlay) overlay.hidden = true;
}

function setLoginLoading(loading) {
  const btn = $('loginSubmitBtn');
  const text = $('loginBtnText');
  const spinner = $('loginBtnSpinner');
  if (!btn) return;
  btn.disabled = loading;
  if (text) text.hidden = loading;
  if (spinner) spinner.hidden = !loading;
}

async function checkAuthStatus() {
  if (!window.AuthModule || !window.AuthModule.isConfigured()) {
    showLoginOverlay(
      'Supabase ainda não configurado. Por favor, adicione suas credenciais públicas em dist/supabase-config.js',
      'warning'
    );
    return;
  }

  const session = await window.AuthModule.getSession();
  if (session && session.user) {
    hideLoginOverlay();
    if ($('userEmailLabel')) $('userEmailLabel').textContent = session.user.email;
    if (window.EntitlementsModule) {
      await window.EntitlementsModule.load();
    }
    render();
  } else {
    if (window.EntitlementsModule) {
      window.EntitlementsModule.clear();
    }
    showLoginOverlay();
    render();
  }
}

const loginForm = $('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;

    if (!email || !password) {
      showLoginOverlay('Por favor, preencha o e-mail e a senha.');
      return;
    }

    setLoginLoading(true);
    if ($('loginAlert')) $('loginAlert').hidden = true;

    try {
      const data = await window.AuthModule.signIn(email, password);
      setLoginLoading(false);
      if (data && (data.session || data.user)) {
        hideLoginOverlay();
        const u = data.user || (data.session && data.session.user);
        if ($('userEmailLabel') && u) $('userEmailLabel').textContent = u.email;
        if (window.EntitlementsModule) {
          await window.EntitlementsModule.load();
        }
        notify('Bem-vindo(a) de volta!');
        render();
      }
    } catch (err) {
      setLoginLoading(false);
      let msg = 'E-mail ou senha incorretos. Por favor, verifique suas credenciais e tente novamente.';
      if (err.message && err.message.indexOf('Supabase não configurado') !== -1) {
        msg = err.message;
      } else if (err.message && err.message.toLowerCase().indexOf('rate limit') !== -1) {
        msg = 'Muitas tentativas. Por favor, aguarde alguns instantes e tente novamente.';
      }
      showLoginOverlay(msg, 'error');
    }
  });
}

const logoutBtn = $('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async function () {
    if (window.AuthModule && window.AuthModule.isConfigured()) {
      await window.AuthModule.signOut();
    }
    if (window.EntitlementsModule) {
      window.EntitlementsModule.clear();
    }
    if ($('reader') && $('reader').open) {
      closeReader();
    }
    if ($('userEmailLabel')) $('userEmailLabel').textContent = 'Meu espaço';
    showLoginOverlay('Você saiu da sua conta.', 'warning');
    render();
  });
}

if (window.AuthModule && window.AuthModule.isConfigured()) {
  window.AuthModule.onAuthStateChange(async function (event, session) {
    if (event === 'SIGNED_IN' && session) {
      hideLoginOverlay();
      if ($('userEmailLabel')) $('userEmailLabel').textContent = session.user.email;
      if (window.EntitlementsModule) {
        await window.EntitlementsModule.load();
      }
      render();
    } else if (event === 'SIGNED_OUT') {
      if (window.EntitlementsModule) {
        window.EntitlementsModule.clear();
      }
      if ($('reader') && $('reader').open) {
        closeReader();
      }
      showLoginOverlay();
      render();
    }
  });
}

checkAuthStatus();


