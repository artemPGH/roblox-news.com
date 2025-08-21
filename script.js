/* ===== ТЕМА (с сохранением) ===== */
(function initTheme(){
  const btn = document.getElementById('themeToggle');
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (prefersDark ? 'dark' : 'light');
  document.body.setAttribute('data-theme', initial);
  btn.textContent = initial === 'dark' ? '☀ Светлая тема' : '🌙 Темная тема';
  btn.addEventListener('click', () => {
    const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.textContent = next === 'dark' ? '☀ Светлая тема' : '🌙 Темная тема';
  });
})();

/* ===== Активный пункт меню при скролле ===== */
(function navActive(){
  const links = [...document.querySelectorAll('.nav-link')];
  const ids = links.map(a => a.getAttribute('href')).filter(h => h.startsWith('#')).map(h => h.slice(1));
  const sections = ids.map(id => document.getElementById(id)).filter(Boolean);
  if (!sections.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
  sections.forEach(s => io.observe(s));
})();

/* ===== Кнопка "Вверх" ===== */
(function toTop(){
  const btn = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 600) btn.classList.add('show'); else btn.classList.remove('show');
  });
  btn.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
})();

/* ===== База для абсолютных путей (важно для GitHub Pages) ===== */
function withBase(path) {
  // Превращаем "images/..." в абсолютный URL сайта, чтобы не сломалось в подкаталоге.
  const base = location.origin + (location.pathname.split('/').slice(0, -1).join('/') + '/');
  try { return new URL(path, base).href; } catch { return path; }
}

/* ===== Авто-обложки по категориям + дефолт ===== */
function getCover(p) {
  const map = {
    updates: 'images/cover-updates.png',
    'Обновления': 'images/cover-updates.png',
    events: 'images/cover-events.png',
    'События': 'images/cover-events.png',
    guides: 'images/cover-guides.png',
    'Гайды': 'images/cover-guides.png',
    news: 'images/cover-news.png',
    'Новости': 'images/cover-news.png'
  };
  const defaultImg = 'images/news-image1.png';
  const img = (p.image || '').trim();

  // Если в JSON стоит именно наша заглушка news-image1.* — считаем, что картинки нет
  const looksLikePlaceholder = /news-image1\.(png|jpg|jpeg|webp)$/i.test(img);
  const effective = (!img || looksLikePlaceholder) ? '' : img;

  const chosen = effective || map[p.category] || defaultImg;
  return withBase(chosen);
}


/* ===== ДАННЫЕ ===== */
const PAGE_SIZE = 6;
let ALL_POSTS = [];
let CURRENT_CATEGORY = 'all';
let CURRENT_QUERY = '';
let CURRENT_PAGE = 1;

start();

async function start(){
  document.getElementById('year').textContent = new Date().getFullYear();
  showLoading();
  await loadPosts();
  wireSearchFromURL();
}

function showLoading(){
  const list = document.getElementById('newsList');
  if (list) list.innerHTML = '<p class="meta">Загружаем новости…</p>';
}

/* универсальная загрузка: пробуем data/posts.json, затем posts.json */
async function loadPosts(){
  const list = document.getElementById('newsList');
  const paths = ['data/posts.json', 'posts.json'];
  let posts = null, lastError = null;

  for (const p of paths){
    try{
      const res = await fetch(p + '?_=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      posts = await res.json();
      break;
    }catch(e){
      lastError = e;
    }
  }

  if (!posts){
    console.error('Не удалось загрузить posts.json', lastError);
    if (list) list.innerHTML = `
      <div class="card">
        <h3>Новости недоступны</h3>
        <p>Файл <code>data/posts.json</code> или <code>posts.json</code> не найден или повреждён.</p>
      </div>`;
    return;
  }

  try{ posts.sort((a,b) => new Date(b.date) - new Date(a.date)); }catch(_){}
  ALL_POSTS = posts;

  // "Последнее обновление"
  const last = posts[0]?.date;
  if (last) document.getElementById('updateDate').textContent =
    new Date(last).toLocaleDateString('ru-RU');

  buildFilters(posts);
  render();
  renderUpdatesSpot(posts);
  handleHashOpen(posts);
}

/* Фильтры категорий + поиск */
function buildFilters(posts){
  const filters = document.getElementById('filters');
  const cats = Array.from(new Set(posts.map(p => p.category))).filter(Boolean).sort();
  const all = document.createElement('button');
  all.className = 'chip active';
  all.textContent = 'Все';
  all.dataset.cat = 'all';
  filters.innerHTML = '';
  filters.appendChild(all);

  cats.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = prettyCat(c);
    b.dataset.cat = c;
    filters.appendChild(b);
  });

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    CURRENT_CATEGORY = btn.dataset.cat; CURRENT_PAGE = 1;
    [...filters.querySelectorAll('.chip')].forEach(el => el.classList.toggle('active', el===btn));
    render();
  });

  const input = document.getElementById('searchInput');
  input.addEventListener('input', () => {
    CURRENT_QUERY = input.value.trim(); CURRENT_PAGE = 1;
    render();
    const hashQ = CURRENT_QUERY ? `#q=${encodeURIComponent(CURRENT_QUERY)}` : '';
    history.replaceState(null, '', location.pathname + location.search + hashQ);
  });
}

/* Рендер списка + пагинация */
function render(){
  const list = document.getElementById('newsList');
  const pag  = document.getElementById('pagination');

  let data = ALL_POSTS.slice();
  if (CURRENT_CATEGORY !== 'all') data = data.filter(p => p.category === CURRENT_CATEGORY);
  if (CURRENT_QUERY){
    const q = CURRENT_QUERY.toLowerCase();
    data = data.filter(p =>
      String(p.title).toLowerCase().includes(q) ||
      String(p.excerpt).toLowerCase().includes(q) ||
      (p.tags||[]).join(' ').toLowerCase().includes(q)
    );
  }

  if (!data.length){
    list.innerHTML = '<p class="meta">Пока новостей нет — попробуй другой фильтр или строку поиска.</p>';
    pag.innerHTML = '';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  CURRENT_PAGE = Math.min(CURRENT_PAGE, totalPages);
  const start = (CURRENT_PAGE - 1) * PAGE_SIZE;
  const items = data.slice(start, start + PAGE_SIZE);

  list.innerHTML = items.map(cardTemplate).join('');
  pag.innerHTML = paginationTemplate(totalPages, CURRENT_PAGE);

  list.querySelectorAll('.js-read').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.dataset.id;
      openPost(ALL_POSTS.find(p => p.id === id));
    });
  });

  pag.querySelectorAll('.js-page').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      CURRENT_PAGE = Number(a.dataset.page);
      render();
      document.getElementById('news').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

function cardTemplate(p){
  const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : '';
  const src = getCover(p);
  const fallback = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='240'><rect width='100%' height='100%' fill='%23ddd'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='20' fill='%23666'>no image</text></svg>";
  return `
  <article class="card">
    <img src="${src}" alt="${escapeHtml(p.title)}" loading="lazy"
         onerror="console.error('image 404:', this.src); this.onerror=null; this.src='${fallback}';">
    <div class="card-body">
      <h3>${escapeHtml(p.title)}</h3>
      <div class="meta">${[d, p.category && prettyCat(p.category)].filter(Boolean).join(' • ')}</div>
      <p>${escapeHtml(p.excerpt || '')}</p>
      <a href="#post/${encodeURIComponent(p.id)}" class="btn js-read" data-id="${p.id}">Читать дальше</a>
    </div>
  </article>`;
}

function paginationTemplate(total, current){
  if (total <= 1) return '';
  let html = '';
  for (let i=1;i<=total;i++){
    html += `<a href="#" class="page js-page ${i===current?'active':''}" data-page="${i}">${i}</a>`;
  }
  return html;
}

/* Спот обновлений */
function renderUpdatesSpot(posts){
  const box = document.getElementById('updatesSpot');
  if (!box) return;
  const upd = posts.find(p => ['updates','Обновления'].includes(String(p.category)));
  if (!upd){ box.innerHTML = '<p>Пока нет обновлений.</p>'; return; }
  const d = new Date(upd.date).toLocaleDateString('ru-RU');
  box.innerHTML = `
    <div class="card">
      <strong>${escapeHtml(upd.title)}</strong> <span class="meta">• ${d}</span>
      <p>${escapeHtml(upd.excerpt || '')}</p>
      <a href="#post/${encodeURIComponent(upd.id)}" class="btn js-open-update" data-id="${upd.id}">Читать дальше</a>
    </div>`;
  box.querySelector('.js-open-update').addEventListener('click', (e)=>{
    e.preventDefault();
    openPost(upd);
  });
}

/* ===== МОДАЛКА ===== */
function ensureModal(){
  const modal = document.getElementById('postModal');
  const close = modal.querySelector('.modal__close');
  const backdrop = modal.querySelector('.modal__backdrop');

  const hide = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden','true');
    if (location.hash.startsWith('#post/')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };
  close.onclick = hide;
  backdrop.onclick = hide;
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hide(); });

  return modal;
}

function openPost(p){
  if (!p) return;
  const modal = ensureModal();
  const d = p.date ? new Date(p.date).toLocaleDateString('ru-RU') : '';
  const src = getCover(p);
  const html = `
    <img src="${src}" alt="${escapeHtml(p.title)}"
         onerror="console.error('image 404:', this.src); this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22450%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%23ddd%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2230%22 fill=%22%23666%22>no image</text></svg>';">
    <h3>${escapeHtml(p.title)}</h3>
    <div class="meta">${[d, p.category && prettyCat(p.category)].filter(Boolean).join(' • ')}</div>
    <div class="content">${p.content || ''}</div>
    <p class="meta">Теги: ${(p.tags||[]).map(escapeHtml).join(', ') || '—'}</p>
  `;
  modal.querySelector('.modal__body').innerHTML = html;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');

  if (!location.hash.startsWith('#post/')){
    location.hash = '#post/' + encodeURIComponent(p.id);
  }
}

function handleHashOpen(posts){
  function check(){
    if (location.hash.startsWith('#post/')){
      const id = decodeURIComponent(location.hash.replace('#post/',''));
      const p = posts.find(x => x.id === id);
      if (p) openPost(p);
    }
  }
  window.addEventListener('hashchange', check);
  check();
}

function wireSearchFromURL(){
  if (location.hash.startsWith('#q=')){
    const q = decodeURIComponent(location.hash.replace('#q=',''));
    const input = document.getElementById('searchInput');
    input.value = q;
    CURRENT_QUERY = q;
    render();
  }
}

/* ===== УТИЛИТЫ ===== */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function prettyCat(c){
  const map = { updates:'Обновления', events:'События', guides:'Гайды', news:'Новости',
    Studio:'Studio','Безопасность':'Безопасность','Маркетплейс':'Маркетплейс',
    'Платформа':'Платформа','Реклама':'Реклама','Сообщества':'Сообщества','Локализация':'Локализация',
    'Обновления':'Обновления','События':'События' };
  return map[c] || c;
}

/* ===== POPULAR GAMES (dynamic) ===== */

const GAME_PAGE_SIZE = 12;
let ALL_GAMES = [];
let GAME_QUERY = '';
let GAME_GENRE = 'Все';
let GAME_SORT = 'alpha';
let GAME_PAGE = 1;

(async function initGames(){
  try {
    const res = await fetch('data/games.json?_=' + Date.now());
    ALL_GAMES = await res.json();
  } catch (e) {
    console.error('games.json load error', e);
    ALL_GAMES = [];
  }
  buildGameFilters(); // чипы жанров
  bindGamesControls(); // поиск/сорт
  renderGames();       // первый рендер
})();

function bindGamesControls(){
  const s = document.getElementById('gameSearch');
  const sort = document.getElementById('gameSort');
  s.addEventListener('input', () => { GAME_QUERY = s.value.trim(); GAME_PAGE = 1; renderGames(); });
  sort.addEventListener('change', () => { GAME_SORT = sort.value; GAME_PAGE = 1; renderGames(); });
}

function buildGameFilters(){
  const wrap = document.getElementById('gameFilters');
  const genres = ['Все', ...Array.from(new Set(ALL_GAMES.map(g => g.genre).filter(Boolean))).sort()];
  wrap.innerHTML = '';
  genres.forEach(g => {
    const b = document.createElement('button');
    b.className = 'chip' + (g === 'Все' ? ' active' : '');
    b.textContent = g;
    b.addEventListener('click', () => {
      GAME_GENRE = g; GAME_PAGE = 1;
      [...wrap.children].forEach(c => c.classList.remove('active')); b.classList.add('active');
      renderGames();
    });
    wrap.appendChild(b);
  });
}

function renderGames(){
  let arr = ALL_GAMES.slice();

  // фильтр по жанру
  if (GAME_GENRE !== 'Все') arr = arr.filter(g => g.genre === GAME_GENRE);

  // поиск
  if (GAME_QUERY){
    const q = GAME_QUERY.toLowerCase();
    arr = arr.filter(g =>
      g.title.toLowerCase().includes(q) ||
      (g.tags || []).join(' ').toLowerCase().includes(q)
    );
  }

  // сортировка
  if (GAME_SORT === 'alpha') arr.sort((a,b)=> a.title.localeCompare(b.title));
  else arr.sort((a,b)=> (b.players_estimate||0)-(a.players_estimate||0));

  // пагинация
  const totalPages = Math.max(1, Math.ceil(arr.length / GAME_PAGE_SIZE));
  GAME_PAGE = Math.min(GAME_PAGE, totalPages);
  const start = (GAME_PAGE - 1) * GAME_PAGE_SIZE;
  const pageItems = arr.slice(start, start + GAME_PAGE_SIZE);

  // отрисовка карточек
  const grid = document.getElementById('gameGrid');
  grid.innerHTML = pageItems.map(gameCardTpl).join('');

  // кнопки
  const pager = document.getElementById('gamePager');
  pager.innerHTML = (totalPages > 1)
    ? Array.from({length: totalPages}, (_,i)=>i+1).map(n =>
        `<a href="#" data-p="${n}" class="${n===GAME_PAGE?'active':''}">${n}</a>`).join('')
    : '';

  pager.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click',(e)=>{ e.preventDefault(); GAME_PAGE = parseInt(a.dataset.p,10); renderGames(); window.scrollTo({top: pager.offsetTop - 140, behavior:'smooth'}); });
  });
}

function gameCardTpl(g){
  const fallback = "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' width='800' height='450'>
      <defs><linearGradient id='g' x1='0' x2='1'><stop stop-color='#ff4d4d'/><stop offset='1' stop-color='#ff8a00'/></linearGradient></defs>
      <rect width='100%' height='100%' fill='url(#g)'/>
      <text x='50%' y='50%' fill='white' font-family='Arial,Helvetica,sans-serif' font-size='42' text-anchor='middle' dominant-baseline='middle'>RBX GAME</text>
    </svg>
  `);
  const img = (g.image && g.image.trim()) || '';
  const imgUrl = img ? img : fallback;
  const pe = g.players_estimate ? ` · ~${formatPlayers(g.players_estimate)} онл.` : '';
  return `
    <article class="game-card">
      <img src="${imgUrl}" alt="${escapeHtml(g.title)}" loading="lazy"
           onerror="this.onerror=null; this.src='${fallback}';">
      <div class="body">
        <h3>${escapeHtml(g.title)}</h3>
        <div class="game-meta">${escapeHtml(g.genre || 'Игра')}${pe}</div>
        <div class="tag-row">${(g.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="game-actions">
          <a class="btn-play" href="${g.link}" target="_blank" rel="noopener">Играть</a>
          <button class="btn-more" onclick="location.href='#news'">Новости</button>
        </div>
      </div>
    </article>`;
}

function formatPlayers(n){
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1_000) return (n/1_000).toFixed(1).replace('.0','') + 'K';
  return String(n);
}


