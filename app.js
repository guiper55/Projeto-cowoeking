/* =================================================================
   PERSONALIZAÇÃO DO CLIENTE — nome e logo
   nomeConsultorio: aparece como texto pequeno acima do nome do app
   nomeApp: nome principal exibido (login e barra lateral)
   logoUrl: opcional. Caminho/URL de uma imagem (ex: 'logo.png',
            enviada junto no repositório). Deixe '' para usar texto.
   ================================================================= */
const MARCA = {
  nomeConsultorio: 'Consultório',
  nomeApp: 'Agenda',
  logoUrl: ''
};
function aplicarMarca(){
  document.title = `${MARCA.nomeApp} — ${MARCA.nomeConsultorio}`;
  document.getElementById('login-eyebrow').textContent = `${MARCA.nomeConsultorio} · Reserva de Salas`;
  document.getElementById('brand-eyebrow').textContent = MARCA.nomeConsultorio;
  if(MARCA.logoUrl){
    document.getElementById('login-title').innerHTML = `<img src="${MARCA.logoUrl}" alt="${MARCA.nomeApp}" style="max-height:42px;max-width:220px;">`;
    document.getElementById('brand-title').innerHTML = `<img src="${MARCA.logoUrl}" alt="${MARCA.nomeApp}" style="max-height:26px;max-width:180px;filter:brightness(0) invert(1);">`;
  } else {
    document.getElementById('login-title').textContent = MARCA.nomeApp;
    document.getElementById('brand-title').textContent = MARCA.nomeApp;
  }
}

/* ===================== SEGURANÇA: escape de HTML ===================== */
/* Todo texto que vem do usuário/banco (nome, motivo, etc.) precisa passar
   por esc() antes de entrar em um template inserido via innerHTML — caso
   contrário, alguém poderia gravar algo como "<img src=x onerror=...>"
   num campo de texto e esse código rodaria na tela de outros usuários. */
function esc(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/* ===================== SUPABASE (cliente) ===================== */
const SUPABASE_URL = 'https://epyohojhhulsqelpucav.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVweW9ob2poaHVsc3FlbHB1Y2F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMzYxMDUsImV4cCI6MjEwMTcxMjEwNX0.mgyLy2Fgr2sgnzaKu1Y1vIWDkihd1xx3RlpfuwVqkFA';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== CONSTANTES ===================== */
const ROOMS = [ {id:'sala1', nome:'Sala 1', cls:'r1'}, {id:'sala2', nome:'Sala 2', cls:'r2'} ];
const HOURS = Array.from({length:14}, (_,i)=>7+i); // 07:00 .. 20:00

/* ===================== ESTADO GLOBAL ===================== */
let config = {valor_hora: 80};
let perfis = [];     // [{id,nome,papel}]
let reservas = [];   // [{id,psicologo_id,sala_id,data,hora,valor_hora}]
let bloqueios = [];  // [{id,sala_id,data,hora,motivo}]
let bloqueiosPeriodo = []; // [{id,sala_id,data_inicio,data_fim,motivo}]
let currentUser = null; // {id, nome, papel, email}
let loginMode = 'entrar';

let uiDate = todayISO();
let uiRoom = 'sala1';
let uiSelection = new Set();
let uiBloqRoom = 'sala1';
let uiBloqDate = todayISO();
let uiBloqTab = 'periodo';
let uiVisaoData = todayISO();
let uiSection = 'disponibilidade';
let uiReportMonth = todayISO().slice(0,7);
let uiAdminMonthFilter = todayISO().slice(0,7);
let uiAdminPsiFilter = 'todos';
let uiAdminRoomFilter = 'todas';
let uiAdminTipoFilter = 'todos';
let uiRelatorioPsiFilter = 'todos';

/* ===================== HELPERS ===================== */
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(iso, n){
  const d = new Date(iso+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().slice(0,10);
}
function fmtHour(h){ return String(h).padStart(2,'0')+':00'; }
function fmtMoney(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDateBR(iso){ const [y,m,d]=iso.split('-'); return d+'/'+m+'/'+y; }
function roomName(id){ return ROOMS.find(r=>r.id===id).nome; }
function roomCls(id){ return ROOMS.find(r=>r.id===id).cls; }
function nomeDoPsi(id){ const p = perfis.find(x=>x.id===id); return p ? p.nome : 'Ex-usuário'; }
const NOMES_DIAS = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
function nomeDiaSemana(dataISO){ return NOMES_DIAS[new Date(dataISO+'T00:00:00').getDay()]; }
function periodoQueBloqueiaSlot(sala, data, hora){
  return bloqueiosPeriodo.find(p=>{
    if(p.sala_id!==sala) return false;
    if(data < p.data_inicio) return false;
    if(p.data_fim && data > p.data_fim) return false;
    if(p.recorrencia==='semanal'){
      const diaInicio = new Date(p.data_inicio+'T00:00:00').getDay();
      const diaData = new Date(data+'T00:00:00').getDay();
      if(diaInicio !== diaData) return false;
    }
    if(p.hora_inicio!=null && p.hora_fim!=null){
      if(hora < p.hora_inicio || hora > p.hora_fim) return false;
    }
    return true;
  });
}
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>t.classList.remove('show'),3000);
}

/* ===================== DADOS (Supabase) ===================== */
async function loadAll(){
  const [{data:cfg}, {data:perf}, {data:res}, {data:bloq}, {data:bloqP}] = await Promise.all([
    sb.from('configuracoes').select('*').eq('chave','valor_hora').single(),
    sb.from('perfis').select('id,nome,papel'),
    sb.from('reservas').select('*'),
    sb.from('bloqueios').select('*'),
    sb.from('bloqueios_periodo').select('*')
  ]);
  if(cfg) config.valor_hora = Number(cfg.valor);
  perfis = perf || [];
  reservas = res || [];
  bloqueios = bloq || [];
  bloqueiosPeriodo = bloqP || [];
}
async function refreshReservas(){
  const [{data:res}, {data:bloq}, {data:bloqP}] = await Promise.all([
    sb.from('reservas').select('*'),
    sb.from('bloqueios').select('*'),
    sb.from('bloqueios_periodo').select('*')
  ]);
  reservas = res || [];
  bloqueios = bloq || [];
  bloqueiosPeriodo = bloqP || [];
}
async function refreshPerfis(){
  const {data} = await sb.from('perfis').select('id,nome,papel');
  perfis = data || [];
}

/* ===================== LOGIN / CADASTRO ===================== */
function toggleLoginMode(mode){
  loginMode = mode;
  document.getElementById('login-msg').innerHTML='';
  renderLoginBody();
}
function renderLoginBody(){
  const body = document.getElementById('login-body');
  const hint = document.getElementById('login-hint');
  if(loginMode==='entrar'){
    body.innerHTML = `
      <div class="field"><label>E-mail</label><input type="email" id="in-email" placeholder="voce@email.com"></div>
      <div class="field"><label>Senha</label><input type="password" id="in-senha" placeholder="••••••••"></div>
      <button class="btn-primary" style="width:100%" data-action="login">Entrar</button>
      <div class="login-switch">Ainda não tem cadastro? <a data-action="toggle-login-mode" data-mode="cadastrar">Cadastre-se</a></div>
    `;
    hint.textContent = 'Use o e-mail e a senha cadastrados por você.';
  } else {
    body.innerHTML = `
      <div class="field"><label>Nome completo</label><input type="text" id="in-nome" maxlength="80" placeholder="Seu nome"></div>
      <div class="field"><label>E-mail</label><input type="email" id="in-email-novo" placeholder="voce@email.com"></div>
      <div class="field"><label>Senha (mín. 6 caracteres)</label><input type="password" id="in-senha-nova" placeholder="••••••••"></div>
      <button class="btn-primary" style="width:100%" data-action="cadastro">Criar cadastro</button>
      <div class="login-switch">Já tem cadastro? <a data-action="toggle-login-mode" data-mode="entrar">Fazer login</a></div>
    `;
    hint.textContent = 'Seu cadastro começa como psicólogo(a). A promoção para administrador é feita pela equipe do consultório.';
  }
}
function loginMsg(text, type){
  document.getElementById('login-msg').innerHTML = `<div class="${type==='ok'?'login-ok':'login-error'}">${text}</div>`;
}
async function doLogin(){
  const email = document.getElementById('in-email').value.trim();
  const senha = document.getElementById('in-senha').value;
  if(!email || !senha){ loginMsg('Preencha e-mail e senha.'); return; }
  const {data, error} = await sb.auth.signInWithPassword({email, password:senha});
  if(error){ loginMsg('E-mail ou senha incorretos.'); return; }
  await afterAuth(data.user);
}
async function doCadastro(){
  const nome = document.getElementById('in-nome').value.trim();
  const email = document.getElementById('in-email-novo').value.trim();
  const senha = document.getElementById('in-senha-nova').value;
  if(nome.length<2){ loginMsg('Digite seu nome completo.'); return; }
  if(!email){ loginMsg('Digite um e-mail válido.'); return; }
  if(senha.length<6){ loginMsg('A senha deve ter ao menos 6 caracteres.'); return; }
  const {data, error} = await sb.auth.signUp({
    email, password: senha,
    options: { data: { nome, papel: 'psicologo' } }
  });
  if(error){ loginMsg(error.message.includes('registered') ? 'Este e-mail já está cadastrado.' : 'Não foi possível criar o cadastro.'); return; }
  if(data.session){
    await afterAuth(data.user);
  } else {
    loginMsg('Cadastro criado! Verifique seu e-mail para confirmar antes de entrar.', 'ok');
    toggleLoginMode('entrar');
  }
}
async function afterAuth(user){
  await loadAll();
  let perfil = perfis.find(p=>p.id===user.id);
  if(!perfil){
    // fallback caso o gatilho do banco ainda não tenha rodado
    await new Promise(r=>setTimeout(r,700));
    await refreshPerfis();
    perfil = perfis.find(p=>p.id===user.id);
  }
  currentUser = {
    id: user.id,
    email: user.email,
    nome: perfil ? perfil.nome : (user.user_metadata?.nome || user.email),
    papel: perfil ? perfil.papel : 'psicologo'
  };
  enterApp();
}
async function logout(){
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById('app-screen').style.display='none';
  document.getElementById('login-screen').style.display='flex';
  toggleLoginMode('entrar');
}

/* ===================== APP SHELL ===================== */
function enterApp(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app-screen').style.display='block';
  document.getElementById('who-name').textContent = currentUser.nome;
  document.getElementById('who-role').textContent = currentUser.papel==='admin' ? 'Administrador' : 'Psicólogo(a)';
  uiSection = currentUser.papel==='admin' ? 'visaogeral' : 'disponibilidade';
  renderNav();
  renderMain();
}
function renderNav(){
  const nav = document.getElementById('nav');
  const items = currentUser.papel==='psicologo'
    ? [['disponibilidade','Disponibilidade'],['minhas','Minhas reservas'],['relatorio','Relatório mensal']]
    : [['visaogeral','Visão geral'],['bloqueios','Bloqueios'],['config','Configurações'],['relatoriogeral','Relatório geral']];
  nav.innerHTML = items.map(([key,label])=>
    `<div class="nav-item ${uiSection===key?'active':''}" data-action="go-section" data-section="${key}">${label}</div>`
  ).join('');
}
function goSection(key){ uiSection = key; uiSelection = new Set(); renderNav(); renderMain(); }

async function renderMain(){
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loading">Carregando...</div>';
  await refreshReservas();
  if(currentUser.papel==='psicologo'){
    if(uiSection==='disponibilidade') main.innerHTML = viewDisponibilidade();
    else if(uiSection==='minhas') main.innerHTML = viewMinhasReservas();
    else main.innerHTML = viewRelatorioMensal();
  } else {
    await refreshPerfis();
    if(uiSection==='visaogeral') main.innerHTML = viewVisaoGeral();
    else if(uiSection==='bloqueios') main.innerHTML = viewBloqueios();
    else if(uiSection==='config') main.innerHTML = viewConfig();
    else main.innerHTML = viewRelatorioGeral();
  }
  if(uiSection==='disponibilidade') bindDisponibilidadeEvents();
  if(uiSection==='bloqueios') bindBloqueiosEvents();
  if(uiSection==='visaogeral') bindVisaoGeralEvents();
}

/* ===================== DISPONIBILIDADE (psicólogo) ===================== */
function slotStatus(sala, data, hora){
  const now = new Date();
  const isToday = data===todayISO();
  if(isToday && hora <= now.getHours()) return 'past';
  if(periodoQueBloqueiaSlot(sala, data, hora)) return 'blocked';
  const b = bloqueios.find(x=>x.sala_id===sala && x.data===data && x.hora===hora);
  if(b) return 'blocked';
  const r = reservas.find(x=>x.sala_id===sala && x.data===data && x.hora===hora);
  if(r) return r.psicologo_id===currentUser.id ? 'mine' : 'taken';
  return uiSelection.has(hora) ? 'selected' : 'free';
}
function viewDisponibilidade(){
  const room = ROOMS.find(r=>r.id===uiRoom);
  const slotsHtml = HOURS.map(h=>{
    const status = slotStatus(uiRoom, uiDate, h);
    const r = reservas.find(x=>x.sala_id===uiRoom && x.data===uiDate && x.hora===h);
    const periodo = periodoQueBloqueiaSlot(uiRoom, uiDate, h);
    const b = bloqueios.find(x=>x.sala_id===uiRoom && x.data===uiDate && x.hora===h);
    let sub = 'livre';
    if(status==='mine') sub='você';
    else if(status==='taken') sub = nomeDoPsi(r.psicologo_id).split(' ')[0];
    else if(status==='blocked') sub = periodo ? (periodo.motivo ? periodo.motivo.split(' ')[0] : 'bloqueado') : (b && b.motivo ? b.motivo.split(' ')[0] : 'bloqueado');
    else if(status==='past') sub='—';
    else if(status==='selected') sub='selecionado';
    return `<div class="slot ${status}" data-hour="${h}"><div class="t">${fmtHour(h)}</div><div class="s">${esc(sub)}</div></div>`;
  }).join('');

  const n = uiSelection.size;
  const valor = n * config.valor_hora;
  const confirmBar = n>0 ? `
    <div class="row" style="margin-top:16px;">
      <div class="field" style="margin:0;">
        <label>Tipo de reserva</label>
        <select id="tipo-reserva">
          <option value="unica">Única</option>
          <option value="semanal">Recorrente (semanal)</option>
        </select>
      </div>
      <div class="field" id="recorrencia-ate-wrap" style="margin:0;display:none;">
        <label>Repetir até</label>
        <input type="date" id="recorrencia-ate" min="${uiDate}">
      </div>
    </div>
    <div class="confirm-bar">
      <div class="txt">${n} horário${n>1?'s':''} selecionado${n>1?'s':''} em <strong>${room.nome}</strong>, ${fmtDateBR(uiDate)} — <span class="val">${fmtMoney(valor)}</span> <span class="mono" style="color:var(--ink-soft);">por ocorrência</span></div>
      <div style="display:flex;gap:8px;">
        <button class="btn-ghost" data-action="clear-selection">Limpar</button>
        <button class="btn-primary" data-action="confirm-reserva">Confirmar reserva</button>
      </div>
    </div>` : '';

  return `
    <div class="page-head">
      <div><h2>Disponibilidade das salas</h2><div class="page-sub">Escolha a sala, a data e clique nos horários livres para reservar.</div></div>
      <input type="date" id="date-input" value="${uiDate}" min="${todayISO()}">
    </div>
    <div class="card">
      <div class="room-tabs">${ROOMS.map(r=>`<div class="room-tab ${r.cls} ${uiRoom===r.id?'active':''}" data-action="set-room" data-room="${r.id}">${r.nome}</div>`).join('')}</div>
      <div class="ledger" id="ledger">${slotsHtml}</div>
      ${confirmBar}
    </div>
    <div class="login-hint" style="padding:0 4px;">Valor atual da hora/reserva: <strong class="mono">${fmtMoney(config.valor_hora)}</strong>. Uma reserva recorrente repete o(s) mesmo(s) horário(s) toda semana, no mesmo dia da semana, até a data escolhida.</div>
  `;
}
function bindDisponibilidadeEvents(){
  const dateInput = document.getElementById('date-input');
  if(dateInput) dateInput.onchange = e=>{ uiDate = e.target.value; uiSelection = new Set(); renderMain(); };
  document.querySelectorAll('#ledger .slot').forEach(el=>{
    el.addEventListener('click', ()=>{
      const h = parseInt(el.dataset.hour,10);
      const status = slotStatus(uiRoom, uiDate, h);
      if(status==='free' || status==='selected'){
        if(uiSelection.has(h)) uiSelection.delete(h); else uiSelection.add(h);
        renderMain();
      }
    });
  });
  const tipoSel = document.getElementById('tipo-reserva');
  if(tipoSel) tipoSel.onchange = ()=>{
    document.getElementById('recorrencia-ate-wrap').style.display = tipoSel.value==='semanal' ? 'block' : 'none';
  };
}
function setRoom(id){ uiRoom=id; uiSelection=new Set(); renderMain(); }
function clearSelection(){ uiSelection=new Set(); renderMain(); }
async function confirmReserva(){
  await refreshReservas();

  // conflitos na data original (bloqueio ou reserva de outra pessoa)
  const conflitos = [...uiSelection].filter(h=>
    reservas.some(x=>x.sala_id===uiRoom && x.data===uiDate && x.hora===h) ||
    bloqueios.some(b=>b.sala_id===uiRoom && b.data===uiDate && b.hora===h)
  );
  if(conflitos.length>0){
    showToast('Algum horário selecionado não está mais disponível. Atualizando...');
    uiSelection = new Set([...uiSelection].filter(h=>!conflitos.includes(h)));
    renderMain();
    return;
  }

  const tipo = document.getElementById('tipo-reserva')?.value || 'unica';
  const ate = document.getElementById('recorrencia-ate')?.value || '';
  if(tipo==='semanal' && !ate){ showToast('Escolha até quando a reserva deve se repetir.'); return; }

  // monta a lista de datas: a original + repetições semanais até "ate"
  let datas = [uiDate];
  if(tipo==='semanal'){
    let cursor = new Date(uiDate+'T00:00:00');
    const fim = new Date(ate+'T00:00:00');
    while(true){
      cursor = new Date(cursor.getTime() + 7*24*60*60*1000);
      if(cursor > fim) break;
      datas.push(cursor.toISOString().slice(0,10));
    }
  }

  const candidatos = [];
  const bloqueadas = [];
  datas.forEach(d=>{
    [...uiSelection].forEach(h=>{
      const bloqueadaHora = bloqueios.some(b=>b.sala_id===uiRoom && b.data===d && b.hora===h) || !!periodoQueBloqueiaSlot(uiRoom, d, h);
      if(bloqueadaHora){ bloqueadas.push(`${fmtDateBR(d)} ${fmtHour(h)}`); return; }
      candidatos.push({psicologo_id: currentUser.id, sala_id: uiRoom, data: d, hora: h, valor_hora: config.valor_hora});
    });
  });

  let sucesso = 0, puladas = bloqueadas.slice();
  for(const c of candidatos){
    const {error} = await sb.from('reservas').insert(c);
    if(error) puladas.push(`${fmtDateBR(c.data)} ${fmtHour(c.hora)}`);
    else sucesso++;
  }

  uiSelection = new Set();
  if(puladas.length===0){
    showToast(sucesso>1 ? `${sucesso} reservas confirmadas.` : 'Reserva confirmada.');
  } else {
    showToast(`${sucesso} reserva(s) confirmada(s). ${puladas.length} horário(s) já estavam ocupados e foram pulados.`);
  }
  renderMain();
}

/* ===================== MINHAS RESERVAS (psicólogo) ===================== */
function viewMinhasReservas(){
  const minhas = reservas.filter(r=>r.psicologo_id===currentUser.id).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const nowKey = todayISO();
  const futuras = minhas.filter(r=> r.data>nowKey || (r.data===nowKey && r.hora>new Date().getHours()));
  const passadas = minhas.filter(r=> !(r.data>nowKey || (r.data===nowKey && r.hora>new Date().getHours())));

  const rowsHtml = (list, canCancelSection)=> list.length===0 ? '<div class="empty">Nenhuma reserva aqui.</div>' :
    `<table><thead><tr><th>Data</th><th>Sala</th><th>Horário</th><th>Valor</th>${canCancelSection?'<th></th>':''}</tr></thead><tbody>
    ${list.map(r=>{
      const podeCancelar = horasAte(r) >= 24;
      return `<tr>
      <td class="mono">${fmtDateBR(r.data)}</td>
      <td><span class="tag ${roomCls(r.sala_id)}">${roomName(r.sala_id)}</span></td>
      <td class="mono">${fmtHour(r.hora)}–${fmtHour(r.hora+1)}</td>
      <td class="mono">${fmtMoney(r.valor_hora)}</td>
      ${canCancelSection ? (podeCancelar
        ? `<td><button class="btn-danger" data-action="cancelar-reserva" data-id="${r.id}">Cancelar</button></td>`
        : `<td><span class="login-hint" style="margin:0;">Efetivada</span></td>`) : ''}
    </tr>`;}).join('')}
    </tbody></table>`;

  return `
    <div class="page-head"><div><h2>Minhas reservas</h2><div class="page-sub">Suas reservas de sala, futuras e passadas.</div></div></div>
    <div class="card"><div class="card-title">Próximas</div>${rowsHtml(futuras, true)}
      <div class="login-hint">Cancelamentos só são permitidos com mais de 24 horas de antecedência. Depois disso, a reserva é considerada efetivada.</div>
    </div>
    <div class="card"><div class="card-title">Histórico</div>${rowsHtml(passadas, false)}</div>
  `;
}
function horasAte(r){
  const inicio = new Date(`${r.data}T${String(r.hora).padStart(2,'0')}:00:00`);
  return (inicio - new Date()) / 3600000;
}
async function cancelarReserva(id){
  const r = reservas.find(x=>x.id===id);
  if(r && currentUser.papel!=='admin' && horasAte(r) < 24){
    showToast('Esta reserva já está efetivada: cancelamentos só são permitidos com mais de 24h de antecedência.');
    return;
  }
  const {error} = await sb.from('reservas').delete().eq('id', id);
  if(error){ showToast('Não foi possível cancelar.'); return; }
  showToast('Reserva cancelada.');
  renderMain();
}

/* ===================== RELATÓRIO MENSAL (psicólogo) ===================== */
function viewRelatorioMensal(){
  const minhas = reservas.filter(r=>r.psicologo_id===currentUser.id && r.data.slice(0,7)===uiReportMonth)
                          .sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const total = minhas.reduce((s,r)=>s+Number(r.valor_hora),0);
  return `
    <div class="page-head">
      <div><h2>Relatório mensal</h2><div class="page-sub">Reservas discriminadas e valor a pagar no período.</div></div>
      <input type="month" id="month-input" value="${uiReportMonth}">
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:18px;">
        <div class="cell-stat"><div class="num">${minhas.length}</div><div class="lbl">reservas no mês</div></div>
        <div class="cell-stat"><div class="num">${fmtMoney(total)}</div><div class="lbl">valor total</div></div>
      </div>
      ${minhas.length===0 ? '<div class="empty">Nenhuma reserva neste mês.</div>' : `
      <table><thead><tr><th>Data</th><th>Sala</th><th>Horário</th><th>Valor</th></tr></thead><tbody>
      ${minhas.map(r=>`<tr>
        <td class="mono">${fmtDateBR(r.data)}</td>
        <td><span class="tag ${roomCls(r.sala_id)}">${roomName(r.sala_id)}</span></td>
        <td class="mono">${fmtHour(r.hora)}–${fmtHour(r.hora+1)}</td>
        <td class="mono">${fmtMoney(r.valor_hora)}</td>
      </tr>`).join('')}
      </tbody></table>`}
      <div style="margin-top:18px;"><button class="btn-primary" data-action="baixar-pdf-psicologo" ${minhas.length===0?'disabled':''}>Baixar PDF do mês</button></div>
    </div>
  `;
}
function baixarPdfPsicologo(){
  const minhas = reservas.filter(r=>r.psicologo_id===currentUser.id && r.data.slice(0,7)===uiReportMonth)
                          .sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const total = minhas.reduce((s,r)=>s+Number(r.valor_hora),0);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text('Relatório mensal de reservas', 14, 18);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Psicólogo(a): ${currentUser.nome}`, 14, 27);
  doc.text(`Mês de referência: ${uiReportMonth}`, 14, 33);
  doc.autoTable({
    startY: 40, head: [['Data','Sala','Horário','Valor']],
    body: minhas.map(r=>[fmtDateBR(r.data), roomName(r.sala_id), `${fmtHour(r.hora)}–${fmtHour(r.hora+1)}`, fmtMoney(r.valor_hora)]),
    styles:{fontSize:10}, headStyles:{fillColor:[30,51,50]}
  });
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text(`Total do mês: ${fmtMoney(total)}`, 14, finalY);
  doc.save(`relatorio-${currentUser.nome.replace(/\s+/g,'_')}-${uiReportMonth}.pdf`);
}

/* ===================== VISÃO GERAL (admin) ===================== */
function viewVisaoGeral(){
  const filtered = uiAdminTipoFilter==='bloqueios' ? [] : reservas.filter(r=>
    r.data.slice(0,7)===uiAdminMonthFilter &&
    (uiAdminPsiFilter==='todos' || r.psicologo_id===uiAdminPsiFilter) &&
    (uiAdminRoomFilter==='todas' || r.sala_id===uiAdminRoomFilter)
  ).sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora));
  const total = filtered.reduce((s,r)=>s+Number(r.valor_hora),0);
  const psiOpts = perfis.filter(p=>p.papel==='psicologo').map(p=>`<option value="${p.id}" ${uiAdminPsiFilter===p.id?'selected':''}>${esc(p.nome)}</option>`).join('');

  // Bloqueios não pertencem a um psicólogo, então só entram na lista quando o filtro de psicólogo está em "Todos"
  const bloqueiosFiltrados = (uiAdminTipoFilter==='reservas' || uiAdminPsiFilter!=='todos') ? [] : bloqueiosDoMes(uiAdminMonthFilter, uiAdminRoomFilter);

  const linhas = [
    ...filtered.map(r=>({tipo:'reserva', data:r.data, sala_id:r.sala_id, hora:r.hora, id:r.id, quem:nomeDoPsi(r.psicologo_id), valor:r.valor_hora})),
    ...bloqueiosFiltrados.map(b=>({tipo:'bloqueio', data:b.data, sala_id:b.sala_id, hora:b.hora, id:b.id, quem:b.motivo || 'Sem motivo informado', valor:null, origem:b.origem, especifico:b.especifico}))
  ].sort((a,b)=>(a.data+String(a.hora).padStart(2,'0')+a.sala_id).localeCompare(b.data+String(b.hora).padStart(2,'0')+b.sala_id));

  const visaoSnap = ROOMS.map(room=>{
    const cells = HOURS.map(h=>{
      const r = reservas.find(x=>x.sala_id===room.id && x.data===uiVisaoData && x.hora===h);
      const periodo = periodoQueBloqueiaSlot(room.id, uiVisaoData, h);
      const b = bloqueios.find(x=>x.sala_id===room.id && x.data===uiVisaoData && x.hora===h);
      let st='free', sub='livre';
      if(r){ st='taken'; sub = nomeDoPsi(r.psicologo_id).split(' ')[0]; }
      else if(periodo){ st='blocked'; sub = periodo.motivo ? periodo.motivo.split(' ')[0] : 'período'; }
      else if(b){ st='blocked'; sub = b.motivo ? b.motivo.split(' ')[0] : 'bloqueado'; }
      return `<div class="slot ${st}" style="cursor:default;"><div class="t">${fmtHour(h)}</div><div class="s">${esc(sub)}</div></div>`;
    }).join('');
    return `<div style="margin-bottom:14px;"><span class="tag ${room.cls}">${room.nome}</span><div class="ledger" style="margin-top:8px;">${cells}</div></div>`;
  }).join('');
  const ehHoje = uiVisaoData===todayISO();

  return `
    <div class="page-head"><div><h2>Visão geral</h2><div class="page-sub">Reservas e bloqueios de todos os psicólogos, com filtros por período, profissional, sala e tipo.</div></div></div>
    <div class="card">
      <div class="page-head" style="margin-bottom:16px;">
        <div class="card-title" style="margin:0;">Ocupação de ${fmtDateBR(uiVisaoData)}${ehHoje ? ' (hoje)' : ''}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn-ghost" id="visao-dia-anterior">← Anterior</button>
          <input type="date" id="visao-data-input" value="${uiVisaoData}">
          <button class="btn-ghost" id="visao-dia-hoje" ${ehHoje?'disabled':''}>Hoje</button>
          <button class="btn-ghost" id="visao-dia-seguinte">Seguinte →</button>
        </div>
      </div>
      ${visaoSnap}
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:18px;">
        <div class="field" style="min-width:150px;margin:0;"><label>Mês</label><input type="month" id="admin-month" value="${uiAdminMonthFilter}"></div>
        <div class="field" style="min-width:180px;margin:0;"><label>Psicólogo(a)</label><select id="admin-psi"><option value="todos">Todos</option>${psiOpts}</select></div>
        <div class="field" style="min-width:140px;margin:0;"><label>Sala</label><select id="admin-room"><option value="todas" ${uiAdminRoomFilter==='todas'?'selected':''}>Todas</option>${ROOMS.map(r=>`<option value="${r.id}" ${uiAdminRoomFilter===r.id?'selected':''}>${r.nome}</option>`).join('')}</select></div>
        <div class="field" style="min-width:140px;margin:0;"><label>Tipo</label><select id="admin-tipo">
          <option value="todos" ${uiAdminTipoFilter==='todos'?'selected':''}>Todos</option>
          <option value="reservas" ${uiAdminTipoFilter==='reservas'?'selected':''}>Reservas</option>
          <option value="bloqueios" ${uiAdminTipoFilter==='bloqueios'?'selected':''}>Bloqueios</option>
        </select></div>
      </div>
      <div class="row" style="margin-bottom:18px;">
        <div class="cell-stat"><div class="num">${filtered.length}</div><div class="lbl">reservas no período</div></div>
        <div class="cell-stat"><div class="num">${bloqueiosFiltrados.length}</div><div class="lbl">horários bloqueados no período</div></div>
        <div class="cell-stat"><div class="num">${fmtMoney(total)}</div><div class="lbl">valor total no período</div></div>
      </div>
      ${uiAdminPsiFilter!=='todos' && uiAdminTipoFilter!=='reservas' ? '<div class="login-hint" style="margin-bottom:12px;">Bloqueios não pertencem a um psicólogo específico, então não aparecem quando o filtro de psicólogo está ativo.</div>' : ''}
      ${linhas.length===0 ? '<div class="empty">Nada encontrado com esses filtros.</div>' : `
      <table><thead><tr><th>Tipo</th><th>Psicólogo(a) / Motivo</th><th>Data</th><th>Sala</th><th>Horário</th><th>Valor</th><th></th></tr></thead><tbody>
      ${linhas.map(l=>{
        let acao;
        if(l.tipo==='reserva'){
          acao = `<button class="btn-danger" data-action="cancelar-reserva" data-id="${l.id}">Cancelar</button>`;
        } else if(l.origem==='pontual'){
          acao = `<button class="btn-danger" data-action="liberar-bloqueio-pontual" data-id="${l.id}">Liberar</button>`;
        } else if(l.especifico){
          acao = `<button class="btn-danger" data-action="remover-periodo" data-id="${l.id}">Liberar</button>`;
        } else {
          acao = `<span class="login-hint" style="margin:0;">Gerenciar na aba Bloqueios</span>`;
        }
        return `<tr>
        <td><span class="tag ${l.tipo==='reserva'?'tipo-reserva':'tipo-bloqueio'}">${l.tipo==='reserva'?'Reserva':'Bloqueio'}</span></td>
        <td>${esc(l.quem)}</td>
        <td class="mono">${fmtDateBR(l.data)}</td>
        <td><span class="tag ${roomCls(l.sala_id)}">${roomName(l.sala_id)}</span></td>
        <td class="mono">${fmtHour(l.hora)}–${fmtHour(l.hora+1)}</td>
        <td class="mono">${l.valor!=null ? fmtMoney(l.valor) : '—'}</td>
        <td>${acao}</td>
      </tr>`;}).join('')}
      </tbody></table>`}
      <div class="login-hint">Como administrador(a), você pode cancelar qualquer reserva, mesmo com menos de 24h de antecedência — útil para abrir espaço para um bloqueio de última hora.</div>
    </div>
    <div class="card">
      <div class="card-title">Exportar Agenda Operacional (PDF)</div>
      <div class="row" style="align-items: flex-end;">
        <div class="field" style="margin:0;">
          <label>A partir da data</label>
          <input type="date" id="agenda-data" value="${todayISO()}">
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn-primary" data-action="gerar-pdf-agenda" data-tipo="semana">Agenda da Semana (7 dias)</button>
          <button class="btn-primary" data-action="gerar-pdf-agenda" data-tipo="mes">Agenda do Mês</button>
        </div>
      </div>
      <div class="login-hint">O relatório "Agenda do Mês" usará o Mês selecionado no filtro lá no topo desta página. O PDF gerado listará apenas a data, sala, horário e o nome de quem reservou (sem valores financeiros).</div>
    </div>
  `;
}

/* ===================== BLOQUEIOS (admin) ===================== */
function viewBloqueios(){
  const periodosOrdenados = [...bloqueiosPeriodo].sort((a,b)=>a.data_inicio.localeCompare(b.data_inicio));
  const periodosHtml = periodosOrdenados.length===0 ? '<div class="empty">Nenhum período bloqueado no momento.</div>' :
    `<table><thead><tr><th>Sala</th><th>Início</th><th>Término</th><th>Repetição</th><th>Horário</th><th>Motivo</th><th></th></tr></thead><tbody>
    ${periodosOrdenados.map(p=>{
      const repete = p.recorrencia==='semanal' ? `Toda ${nomeDiaSemana(p.data_inicio)}` : 'Todos os dias';
      const horario = (p.hora_inicio!=null && p.hora_fim!=null) ? `${fmtHour(p.hora_inicio)}–${fmtHour(p.hora_fim+1)}` : 'Dia inteiro';
      return `<tr>
      <td><span class="tag ${roomCls(p.sala_id)}">${roomName(p.sala_id)}</span></td>
      <td class="mono">${fmtDateBR(p.data_inicio)}</td>
      <td class="mono">${p.data_fim ? fmtDateBR(p.data_fim) : 'Até ser desbloqueado'}</td>
      <td>${repete}</td>
      <td class="mono">${horario}</td>
      <td>${esc(p.motivo || '—')}</td>
      <td><button class="btn-danger" data-action="remover-periodo" data-id="${p.id}">Desbloquear</button></td>
    </tr>`;}).join('')}
    </tbody></table>`;

  const slotsHtml = HOURS.map(h=>{
    const bloqueado = bloqueios.find(b=>b.sala_id===uiBloqRoom && b.data===uiBloqDate && b.hora===h);
    const reservado = reservas.find(x=>x.sala_id===uiBloqRoom && x.data===uiBloqDate && x.hora===h);
    const periodo = periodoQueBloqueiaSlot(uiBloqRoom, uiBloqDate, h);
    let status = 'free', sub = 'livre';
    if(reservado){ status='taken'; sub = nomeDoPsi(reservado.psicologo_id).split(' ')[0]; }
    else if(periodo){ status='blocked'; sub = periodo.motivo ? periodo.motivo.split(' ')[0] : 'período'; }
    else if(bloqueado){ status='blocked'; sub = bloqueado.motivo ? bloqueado.motivo.split(' ')[0] : 'bloqueado'; }
    const periodoHorario = periodo && periodo.hora_inicio!=null ? 'especifico' : 'inteiro';
    return `<div class="slot ${status}" data-hour="${h}" data-bloqueado="${bloqueado?bloqueado.id:''}" data-reservado="${reservado?'1':''}" data-periodo="${periodo?periodo.id:''}" data-periodo-horario="${periodoHorario}">
      <div class="t">${fmtHour(h)}</div><div class="s">${esc(sub)}</div></div>`;
  }).join('');

  return `
    <div class="page-head"><div><h2>Bloqueios de horário</h2><div class="page-sub">Bloqueie uma sala por um período, num dia da semana específico ou de forma pontual — útil para manutenção, feriados ou eventos.</div></div></div>

    <div class="subtabs">
      <div class="subtab ${uiBloqTab==='periodo'?'active':''}" data-action="set-bloq-tab" data-tab="periodo">Bloqueio por Período</div>
      <div class="subtab ${uiBloqTab==='hora'?'active':''}" data-action="set-bloq-tab" data-tab="hora">Bloqueio por Horário</div>
    </div>

    ${uiBloqTab==='periodo' ? `
    <div class="card">
      <div class="card-title">Bloquear um período</div>
      <div class="row">
        <div class="field" style="margin:0;"><label>Sala</label>
          <select id="periodo-sala">${ROOMS.map(r=>`<option value="${r.id}">${r.nome}</option>`).join('')}</select>
        </div>
        <div class="field" style="margin:0;"><label>A partir de</label><input type="date" id="periodo-inicio" value="${todayISO()}" min="${todayISO()}"></div>
        <div class="field" style="margin:0;"><label>Duração</label>
          <select id="periodo-duracao">
            <option value="1dia">1 dia</option>
            <option value="1semana">1 semana</option>
            <option value="1mes">1 mês</option>
            <option value="1ano">1 ano</option>
            <option value="personalizado">Personalizado</option>
            <option value="indeterminado" selected>Até ser desbloqueado</option>
          </select>
        </div>
        <div class="field" id="periodo-fim-wrap" style="margin:0;display:none;"><label>Data final</label><input type="date" id="periodo-fim" min="${todayISO()}"></div>
      </div>
      <div class="row" style="margin-top:14px;">
        <div class="field" style="margin:0;">
          <label>Repetição</label>
          <select id="periodo-recorrencia">
            <option value="semanal" selected>Somente este dia da semana, toda semana</option>
            <option value="diario">Todos os dias do período</option>
          </select>
        </div>
        <div class="field" style="margin:0;">
          <label>Horário</label>
          <select id="periodo-horario-tipo">
            <option value="inteiro">Dia inteiro</option>
            <option value="especifico">Horário específico</option>
          </select>
        </div>
        <div class="field" id="periodo-hora-inicio-wrap" style="margin:0;display:none;"><label>Das</label>
          <select id="periodo-hora-inicio">${HOURS.map(h=>`<option value="${h}">${fmtHour(h)}</option>`).join('')}</select>
        </div>
        <div class="field" id="periodo-hora-fim-wrap" style="margin:0;display:none;"><label>Até</label>
          <select id="periodo-hora-fim">${HOURS.map(h=>`<option value="${h}">${fmtHour(h+1)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="login-hint" id="periodo-semanal-hint" style="margin:10px 0 0;"></div>
      <div class="field" style="margin-top:10px;"><label>Motivo (opcional)</label><input type="text" id="periodo-motivo" maxlength="80" placeholder="Ex: reforma, férias coletivas, evento" style="width:100%;"></div>
      <button class="btn-primary" style="margin-top:10px;" data-action="bloquear-periodo">Bloquear</button>
    </div>
    ` : `
    <div class="card">
      <div class="card-title">Bloquear um horário pontual</div>
      <div class="row" style="margin-bottom:16px;">
        <div class="field" style="margin:0;"><label>Data</label><input type="date" id="bloq-date-input" value="${uiBloqDate}" min="${todayISO()}"></div>
      </div>
      <div class="room-tabs">${ROOMS.map(r=>`<div class="room-tab ${r.cls} ${uiBloqRoom===r.id?'active':''}" data-action="set-bloq-room" data-room="${r.id}">${r.nome}</div>`).join('')}</div>
      <div class="row" style="margin-bottom:16px;">
        <div class="field" style="margin:0;">
          <label>Repetição</label>
          <select id="bloq-recorrencia">
            <option value="unica">Única (somente esta data)</option>
            <option value="semanal">Recorrente (toda semana, neste dia da semana)</option>
          </select>
        </div>
        <div class="field" id="bloq-recorrencia-tipo-wrap" style="margin:0;display:none;">
          <label>Repetir até</label>
          <select id="bloq-recorrencia-tipo">
            <option value="indeterminado">Até ser desbloqueado</option>
            <option value="data">Uma data específica</option>
          </select>
        </div>
        <div class="field" id="bloq-recorrencia-ate-wrap" style="margin:0;display:none;">
          <label>Data final</label>
          <input type="date" id="bloq-recorrencia-ate" min="${uiBloqDate}">
        </div>
        <div class="field" style="flex:1;min-width:220px;margin:0;"><label>Motivo (opcional, usado no próximo bloqueio)</label><input type="text" id="bloq-motivo" maxlength="80" placeholder="Ex: manutenção pontual"></div>
      </div>
      <div class="login-hint" id="bloq-recorrencia-hint" style="margin:0 0 14px;"></div>
      <div class="ledger" id="bloq-ledger">${slotsHtml}</div>
      <div class="login-hint" style="padding:0 4px;margin-top:14px;">Clique num horário livre para bloqueá-lo conforme as opções acima, ou num horário já bloqueado (hachurado) para liberá-lo.</div>
    </div>
    `}

    <div class="card">
      <div class="card-title">Períodos e recorrências bloqueados atualmente</div>
      ${periodosHtml}
    </div>
  `;
}
function bindBloqueiosEvents(){
  const dateInput = document.getElementById('bloq-date-input');
  if(dateInput) dateInput.onchange = e=>{ uiBloqDate = e.target.value; renderMain(); };

  const duracaoSel = document.getElementById('periodo-duracao');
  if(duracaoSel) duracaoSel.onchange = ()=>{
    document.getElementById('periodo-fim-wrap').style.display = duracaoSel.value==='personalizado' ? 'block' : 'none';
  };

  const horarioTipoSel = document.getElementById('periodo-horario-tipo');
  if(horarioTipoSel) horarioTipoSel.onchange = ()=>{
    const show = horarioTipoSel.value==='especifico';
    document.getElementById('periodo-hora-inicio-wrap').style.display = show ? 'block' : 'none';
    document.getElementById('periodo-hora-fim-wrap').style.display = show ? 'block' : 'none';
  };

  const inicioInput = document.getElementById('periodo-inicio');
  const recorrenciaSel = document.getElementById('periodo-recorrencia');
  function atualizarHintSemanal(){
    const hint = document.getElementById('periodo-semanal-hint');
    if(!hint) return;
    if(recorrenciaSel.value==='semanal'){
      hint.textContent = `Isso bloqueará somente as ${nomeDiaSemana(inicioInput.value)}s, a partir de ${fmtDateBR(inicioInput.value)}.`;
    } else {
      hint.textContent = `Isso bloqueará todos os dias do período, a partir de ${fmtDateBR(inicioInput.value)}.`;
    }
  }
  if(inicioInput) inicioInput.onchange = atualizarHintSemanal;
  if(recorrenciaSel) recorrenciaSel.onchange = atualizarHintSemanal;
  if(recorrenciaSel) atualizarHintSemanal();

  const recorrenciaSel2 = document.getElementById('bloq-recorrencia');
  const tipoSel2 = document.getElementById('bloq-recorrencia-tipo');
  function atualizarBloqRecorrencia(){
    const semanal = recorrenciaSel2.value==='semanal';
    document.getElementById('bloq-recorrencia-tipo-wrap').style.display = semanal ? 'block' : 'none';
    const dataEspecifica = semanal && tipoSel2.value==='data';
    document.getElementById('bloq-recorrencia-ate-wrap').style.display = dataEspecifica ? 'block' : 'none';
    const hint = document.getElementById('bloq-recorrencia-hint');
    hint.textContent = semanal ? `Bloqueará toda ${nomeDiaSemana(uiBloqDate)}, neste horário, a partir de ${fmtDateBR(uiBloqDate)}.` : '';
  }
  if(recorrenciaSel2) recorrenciaSel2.onchange = atualizarBloqRecorrencia;
  if(tipoSel2) tipoSel2.onchange = atualizarBloqRecorrencia;
  if(recorrenciaSel2) atualizarBloqRecorrencia();

  document.querySelectorAll('#bloq-ledger .slot').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const h = parseInt(el.dataset.hour,10);
      if(el.dataset.reservado==='1'){
        showToast('Este horário já está reservado. Cancele a reserva antes de bloquear.');
        return;
      }
      if(el.dataset.periodo){
        if(el.dataset.periodoHorario==='especifico'){
          const {error} = await sb.from('bloqueios_periodo').delete().eq('id', el.dataset.periodo);
          if(error){ showToast('Não foi possível remover o bloqueio.'); return; }
          showToast('Bloqueio removido.');
          renderMain();
        } else {
          showToast('Este horário faz parte de um bloqueio de período maior. Remova-o na lista "Períodos bloqueados atualmente".');
        }
        return;
      }
      if(el.dataset.bloqueado){
        const {error} = await sb.from('bloqueios').delete().eq('id', el.dataset.bloqueado);
        if(error){ showToast('Não foi possível liberar o horário.'); return; }
        showToast('Horário liberado.');
        renderMain();
        return;
      }
      const motivo = document.getElementById('bloq-motivo').value.trim();
      const recorrencia = document.getElementById('bloq-recorrencia').value;
      if(recorrencia==='semanal'){
        const tipo = document.getElementById('bloq-recorrencia-tipo').value;
        const ate = tipo==='data' ? document.getElementById('bloq-recorrencia-ate').value : null;
        if(tipo==='data' && !ate){ showToast('Escolha a data final da recorrência.'); return; }
        const {error} = await sb.from('bloqueios_periodo').insert({
          sala_id: uiBloqRoom, data_inicio: uiBloqDate, data_fim: ate,
          recorrencia: 'semanal', hora_inicio: h, hora_fim: h,
          motivo: motivo || null, criado_por: currentUser.id
        });
        if(error){ showToast('Não foi possível criar o bloqueio recorrente.'); return; }
        showToast('Bloqueio recorrente criado.');
      } else {
        const {error} = await sb.from('bloqueios').insert({sala_id:uiBloqRoom, data:uiBloqDate, hora:h, motivo: motivo || null, criado_por: currentUser.id});
        if(error){ showToast('Não foi possível bloquear o horário.'); return; }
        showToast('Horário bloqueado.');
      }
      renderMain();
    });
  });
}
function bloqueiosDoMes(mes, salaFiltro){
  const [anoStr, mesStr] = mes.split('-');
  const diasNoMes = new Date(parseInt(anoStr), parseInt(mesStr), 0).getDate();
  const salas = salaFiltro==='todas' ? ROOMS.map(r=>r.id) : [salaFiltro];
  const linhas = [];
  for(let i=1;i<=diasNoMes;i++){
    const d = `${mes}-${String(i).padStart(2,'0')}`;
    salas.forEach(salaId=>{
      HOURS.forEach(h=>{
        const pontual = bloqueios.find(x=>x.sala_id===salaId && x.data===d && x.hora===h);
        if(pontual){ linhas.push({data:d, sala_id:salaId, hora:h, motivo:pontual.motivo, id:pontual.id, origem:'pontual', especifico:true}); return; }
        const periodo = periodoQueBloqueiaSlot(salaId, d, h);
        if(periodo){ linhas.push({data:d, sala_id:salaId, hora:h, motivo:periodo.motivo, id:periodo.id, origem:'periodo', especifico: periodo.hora_inicio!=null}); }
      });
    });
  }
  return linhas;
}
async function liberarBloqueioPontual(id){
  const {error} = await sb.from('bloqueios').delete().eq('id', id);
  if(error){ showToast('Não foi possível liberar o horário.'); return; }
  showToast('Horário liberado.');
  renderMain();
}
function setBloqRoom(id){ uiBloqRoom=id; renderMain(); }
function setBloqTab(tab){ uiBloqTab=tab; renderMain(); }
function bindVisaoGeralEvents(){
  const dataInput = document.getElementById('visao-data-input');
  if(dataInput) dataInput.onchange = e=>{ uiVisaoData = e.target.value; renderMain(); };
  const btnAnterior = document.getElementById('visao-dia-anterior');
  if(btnAnterior) btnAnterior.onclick = ()=>{ uiVisaoData = addDays(uiVisaoData, -1); renderMain(); };
  const btnHoje = document.getElementById('visao-dia-hoje');
  if(btnHoje) btnHoje.onclick = ()=>{ uiVisaoData = todayISO(); renderMain(); };
  const btnSeguinte = document.getElementById('visao-dia-seguinte');
  if(btnSeguinte) btnSeguinte.onclick = ()=>{ uiVisaoData = addDays(uiVisaoData, 1); renderMain(); };
}
function computeFimPeriodo(inicioISO, tipo, personalizado){
  const d = new Date(inicioISO+'T00:00:00');
  if(tipo==='1dia') return inicioISO;
  if(tipo==='1semana'){ d.setDate(d.getDate()+6); return d.toISOString().slice(0,10); }
  if(tipo==='1mes'){ d.setMonth(d.getMonth()+1); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
  if(tipo==='1ano'){ d.setFullYear(d.getFullYear()+1); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); }
  if(tipo==='indeterminado') return null;
  if(tipo==='personalizado') return personalizado || null;
  return inicioISO;
}
async function bloquearPeriodo(){
  const sala = document.getElementById('periodo-sala').value;
  const inicio = document.getElementById('periodo-inicio').value;
  const duracao = document.getElementById('periodo-duracao').value;
  const personalizado = document.getElementById('periodo-fim').value;
  const motivo = document.getElementById('periodo-motivo').value.trim();
  const recorrencia = document.getElementById('periodo-recorrencia').value;
  const horarioTipo = document.getElementById('periodo-horario-tipo').value;
  if(!inicio){ showToast('Escolha a data de início.'); return; }
  if(duracao==='personalizado' && !personalizado){ showToast('Escolha a data final do bloqueio.'); return; }
  const fim = computeFimPeriodo(inicio, duracao, personalizado);
  if(fim && fim < inicio){ showToast('A data final não pode ser antes do início.'); return; }
  let horaInicio = null, horaFim = null;
  if(horarioTipo==='especifico'){
    horaInicio = parseInt(document.getElementById('periodo-hora-inicio').value,10);
    horaFim = parseInt(document.getElementById('periodo-hora-fim').value,10);
    if(horaFim < horaInicio){ showToast('O horário final não pode ser antes do inicial.'); return; }
  }
  const {error} = await sb.from('bloqueios_periodo').insert({
    sala_id:sala, data_inicio:inicio, data_fim:fim, motivo: motivo || null,
    recorrencia, hora_inicio: horaInicio, hora_fim: horaFim, criado_por: currentUser.id
  });
  if(error){ showToast('Não foi possível bloquear o período.'); return; }
  showToast('Bloqueio criado com sucesso.');
  renderMain();
}
async function removerPeriodo(id){
  const {error} = await sb.from('bloqueios_periodo').delete().eq('id', id);
  if(error){ showToast('Não foi possível remover o bloqueio.'); return; }
  showToast('Período desbloqueado.');
  renderMain();
}

/* ===================== CONFIGURAÇÕES (admin) ===================== */
function viewConfig(){
  return `
    <div class="page-head"><div><h2>Configurações</h2><div class="page-sub">Defina o valor da hora/reserva e gerencie os psicólogos cadastrados.</div></div></div>
    <div class="card">
      <div class="card-title">Valor da hora/reserva</div>
      <div class="row">
        <div class="field" style="margin:0;"><label>Valor em R$</label><input type="number" id="valor-hora" min="0" step="5" value="${config.valor_hora}" style="width:140px;"></div>
        <button class="btn-primary" data-action="salvar-valor-hora">Salvar</button>
      </div>
      <div class="login-hint">Reservas já feitas mantêm o valor vigente no momento em que foram criadas; a alteração vale para novas reservas.</div>
    </div>
    <div class="card">
      <div class="card-title">Pessoas cadastradas (${perfis.length})</div>
      <table><thead><tr><th>Nome</th><th>Papel</th><th></th></tr></thead><tbody>
      ${perfis.map(p=>`<tr>
        <td>${esc(p.nome)}</td>
        <td>${p.papel==='admin' ? '<span class="tag admin">Administrador</span>' : '<span class="tag r1">Psicólogo(a)</span>'}</td>
        <td>${p.id!==currentUser.id ? `<button class="btn-small" data-action="alternar-papel" data-id="${p.id}" data-papel="${p.papel}">${p.papel==='admin' ? 'Tornar psicólogo(a)' : 'Tornar administrador'}</button>` : '<span class="login-hint" style="margin:0;">você</span>'}</td>
      </tr>`).join('')}
      </tbody></table>
    </div>
  `;
}
async function salvarValorHora(){
  const v = parseFloat(document.getElementById('valor-hora').value);
  if(isNaN(v) || v<0){ showToast('Informe um valor válido.'); return; }
  const {error} = await sb.from('configuracoes').update({valor:v}).eq('chave','valor_hora');
  if(error){ showToast('Não foi possível salvar.'); return; }
  config.valor_hora = v;
  showToast('Valor da hora atualizado.');
  renderMain();
}
async function alternarPapel(id, papelAtual){
  const novoPapel = papelAtual==='admin' ? 'psicologo' : 'admin';
  const {error} = await sb.from('perfis').update({papel:novoPapel}).eq('id', id);
  if(error){ showToast('Não foi possível alterar o papel.'); return; }
  showToast('Papel atualizado.');
  renderMain();
}

/* ===================== RELATÓRIO GERAL (admin) ===================== */
function viewRelatorioGeral(){
  const doMes = reservas.filter(r=>r.data.slice(0,7)===uiReportMonth && (uiRelatorioPsiFilter==='todos' || r.psicologo_id===uiRelatorioPsiFilter));
  const porPsi = {};
  doMes.forEach(r=>{
    if(!porPsi[r.psicologo_id]) porPsi[r.psicologo_id] = {nome:nomeDoPsi(r.psicologo_id), itens:[], total:0};
    porPsi[r.psicologo_id].itens.push(r);
    porPsi[r.psicologo_id].total += Number(r.valor_hora);
  });
  const grupos = Object.values(porPsi).sort((a,b)=>a.nome.localeCompare(b.nome));
  const grandTotal = doMes.reduce((s,r)=>s+Number(r.valor_hora),0);
  const psiOptsRelatorio = perfis.filter(p=>p.papel==='psicologo').sort((a,b)=>a.nome.localeCompare(b.nome)).map(p=>`<option value="${p.id}" ${uiRelatorioPsiFilter===p.id?'selected':''}>${esc(p.nome)}</option>`).join('');

  const gruposHtml = grupos.length===0 ? '<div class="empty">Nenhuma reserva encontrada com esses filtros.</div>' : grupos.map(g=>`
    <div class="subhead">${esc(g.nome)} <span class="mono" style="color:var(--ink-soft);font-weight:400;">(${g.itens.length} reservas · ${fmtMoney(g.total)})</span></div>
    <table><thead><tr><th>Data</th><th>Sala</th><th>Horário</th><th>Valor</th></tr></thead><tbody>
    ${g.itens.sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora)).map(r=>`<tr>
      <td class="mono">${fmtDateBR(r.data)}</td>
      <td><span class="tag ${roomCls(r.sala_id)}">${roomName(r.sala_id)}</span></td>
      <td class="mono">${fmtHour(r.hora)}–${fmtHour(r.hora+1)}</td>
      <td class="mono">${fmtMoney(r.valor_hora)}</td>
    </tr>`).join('')}
    </tbody></table>
  `).join('');

  return `
    <div class="page-head">
      <div><h2>Relatório geral</h2><div class="page-sub">Reservas do mês, por psicólogo, com total consolidado.</div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div class="field" style="margin:0;"><label>Mês</label><input type="month" id="month-input-admin" value="${uiReportMonth}"></div>
        <div class="field" style="margin:0;min-width:180px;"><label>Psicólogo(a)</label>
          <select id="relatorio-psi"><option value="todos">Todos</option>${psiOptsRelatorio}</select>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:18px;">
        <div class="cell-stat"><div class="num">${doMes.length}</div><div class="lbl">reservas no mês</div></div>
        <div class="cell-stat"><div class="num">${grupos.length}</div><div class="lbl">psicólogo(s) com reservas</div></div>
        <div class="cell-stat"><div class="num">${fmtMoney(grandTotal)}</div><div class="lbl">valor total consolidado</div></div>
      </div>
      ${gruposHtml}
      <div style="margin-top:18px;"><button class="btn-primary" data-action="baixar-pdf-admin" ${doMes.length===0?'disabled':''}>Baixar PDF ${uiRelatorioPsiFilter==='todos' ? 'geral do mês' : 'deste psicólogo'}</button></div>
    </div>
  `;
}
function baixarPdfAdmin(){
  const doMes = reservas.filter(r=>r.data.slice(0,7)===uiReportMonth && (uiRelatorioPsiFilter==='todos' || r.psicologo_id===uiRelatorioPsiFilter));
  const porPsi = {};
  doMes.forEach(r=>{
    if(!porPsi[r.psicologo_id]) porPsi[r.psicologo_id] = {nome:nomeDoPsi(r.psicologo_id), itens:[], total:0};
    porPsi[r.psicologo_id].itens.push(r);
    porPsi[r.psicologo_id].total += Number(r.valor_hora);
  });
  const grupos = Object.values(porPsi).sort((a,b)=>a.nome.localeCompare(b.nome));
  const grandTotal = doMes.reduce((s,r)=>s+Number(r.valor_hora),0);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text(uiRelatorioPsiFilter==='todos' ? 'Relatório geral de reservas' : `Relatório de reservas — ${nomeDoPsi(uiRelatorioPsiFilter)}`, 14, 18);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(`Mês de referência: ${uiReportMonth}`, 14, 27);
  let y = 36;
  grupos.forEach(g=>{
    if(y > 260){ doc.addPage(); y = 18; }
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text(`${g.nome}  —  ${fmtMoney(g.total)}`, 14, y);
    y += 4;
    doc.autoTable({
      startY: y, head: [['Data','Sala','Horário','Valor']],
      body: g.itens.sort((a,b)=>(a.data+a.hora).localeCompare(b.data+b.hora)).map(r=>[fmtDateBR(r.data), roomName(r.sala_id), `${fmtHour(r.hora)}–${fmtHour(r.hora+1)}`, fmtMoney(r.valor_hora)]),
      styles:{fontSize:9}, headStyles:{fillColor:[30,51,50]}, margin:{left:14,right:14}
    });
    y = doc.lastAutoTable.finalY + 10;
  });
  if(y > 265){ doc.addPage(); y = 18; }
  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.text(`Total consolidado do mês: ${fmtMoney(grandTotal)}`, 14, y);
  doc.save(uiRelatorioPsiFilter==='todos' ? `relatorio-geral-${uiReportMonth}.pdf` : `relatorio-${nomeDoPsi(uiRelatorioPsiFilter).replace(/\s+/g,'_')}-${uiReportMonth}.pdf`);
}

/* ===================== EXPORTAR AGENDA OPERACIONAL (admin) ===================== */
function gerarPdfAgenda(tipo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  let datasNoPeriodo = [];
  let titulo = "";
  let subtitulo = "";

  // 1. Define quais dias farão parte do relatório
  if (tipo === 'semana') {
     const dataBase = document.getElementById('agenda-data').value || todayISO();
     const inicio = new Date(dataBase + 'T00:00:00');
     for(let i = 0; i < 7; i++) {
        const tempDate = new Date(inicio.getTime() + i * 24*60*60*1000);
        datasNoPeriodo.push(tempDate.toISOString().slice(0,10));
     }
     titulo = "Agenda Operacional da Semana";
     subtitulo = `Período: ${fmtDateBR(datasNoPeriodo[0])} a ${fmtDateBR(datasNoPeriodo[6])}`;
  } else {
     const mes = document.getElementById('admin-month').value;
     const [anoStr, mesStr] = mes.split('-');
     const diasNoMes = new Date(parseInt(anoStr), parseInt(mesStr), 0).getDate();
     for(let i = 1; i <= diasNoMes; i++) {
         const d = String(i).padStart(2, '0');
         datasNoPeriodo.push(`${mes}-${d}`);
     }
     titulo = "Agenda Operacional do Mês";
     subtitulo = `Mês de referência: ${mesStr}/${anoStr}`;
  }

  const itensAgenda = [];

  // 2. Varre todos os dias, salas e horários procurando ocupações
  datasNoPeriodo.forEach(d => {
     ROOMS.forEach(room => {
         HOURS.forEach(h => {
             // Checa se há reserva
             const reservado = reservas.find(x => x.sala_id === room.id && x.data === d && x.hora === h);
             if (reservado) {
                 itensAgenda.push({
                     data: d, sala_id: room.id, hora: h,
                     descricao: nomeDoPsi(reservado.psicologo_id)
                 });
                 return; // Pula para a próxima hora
             }

             // Checa se há bloqueio de período (recorrente ou longo)
             const periodo = periodoQueBloqueiaSlot(room.id, d, h);
             if (periodo) {
                 itensAgenda.push({
                     data: d, sala_id: room.id, hora: h,
                     descricao: 'Bloqueado: ' + (periodo.motivo || 'Período')
                 });
                 return; // Pula para a próxima hora
             }

             // Checa se há bloqueio pontual (1 horinha só)
             const bloqueado = bloqueios.find(x => x.sala_id === room.id && x.data === d && x.hora === h);
             if (bloqueado) {
                 itensAgenda.push({
                     data: d, sala_id: room.id, hora: h,
                     descricao: 'Bloqueado: ' + (bloqueado.motivo || 'Pontual')
                 });
             }
         });
     });
  });

  // 3. Ordena os resultados cronologicamente (Data -> Hora -> Sala)
  itensAgenda.sort((a,b) => (a.data + String(a.hora).padStart(2,'0') + a.sala_id).localeCompare(b.data + String(b.hora).padStart(2,'0') + b.sala_id));

  // 4. Monta o PDF
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text(titulo, 14, 18);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  doc.text(subtitulo, 14, 26);
  doc.text(`Gerado em: ${fmtDateBR(todayISO())}`, 14, 32);

  const tableData = itensAgenda.map(item => [
      fmtDateBR(item.data),
      roomName(item.sala_id),
      `${fmtHour(item.hora)}–${fmtHour(item.hora+1)}`,
      item.descricao
  ]);

  if (tableData.length === 0) {
      doc.text("Nenhuma ocupação (reserva ou bloqueio) encontrada neste período.", 14, 42);
  } else {
      doc.autoTable({
        startY: 38,
        head: [['Data', 'Sala', 'Horário', 'Status / Profissional']],
        body: tableData,
        styles: {fontSize: 10},
        headStyles: {fillColor: [30, 51, 50]}
      });
  }

  doc.save(`agenda-${tipo}.pdf`);
}

/* ===================== GLOBAL DELEGATED EVENTS ===================== */
document.addEventListener('change', (e)=>{
  if(e.target.id==='month-input'){ uiReportMonth = e.target.value; renderMain(); }
  if(e.target.id==='month-input-admin'){ uiReportMonth = e.target.value; renderMain(); }
  if(e.target.id==='admin-month'){ uiAdminMonthFilter = e.target.value; renderMain(); }
  if(e.target.id==='admin-psi'){ uiAdminPsiFilter = e.target.value; renderMain(); }
  if(e.target.id==='admin-room'){ uiAdminRoomFilter = e.target.value; renderMain(); }
  if(e.target.id==='admin-tipo'){ uiAdminTipoFilter = e.target.value; renderMain(); }
  if(e.target.id==='relatorio-psi'){ uiRelatorioPsiFilter = e.target.value; renderMain(); }
});

const ACTIONS = {
  'logout': ()=>logout(),
  'login': ()=>doLogin(),
  'cadastro': ()=>doCadastro(),
  'toggle-login-mode': el=>toggleLoginMode(el.dataset.mode),
  'go-section': el=>goSection(el.dataset.section),
  'clear-selection': ()=>clearSelection(),
  'confirm-reserva': ()=>confirmReserva(),
  'set-room': el=>setRoom(el.dataset.room),
  'cancelar-reserva': el=>cancelarReserva(el.dataset.id),
  'baixar-pdf-psicologo': ()=>baixarPdfPsicologo(),
  'liberar-bloqueio-pontual': el=>liberarBloqueioPontual(el.dataset.id),
  'remover-periodo': el=>removerPeriodo(el.dataset.id),
  'gerar-pdf-agenda': el=>gerarPdfAgenda(el.dataset.tipo),
  'set-bloq-tab': el=>setBloqTab(el.dataset.tab),
  'bloquear-periodo': ()=>bloquearPeriodo(),
  'set-bloq-room': el=>setBloqRoom(el.dataset.room),
  'salvar-valor-hora': ()=>salvarValorHora(),
  'alternar-papel': el=>alternarPapel(el.dataset.id, el.dataset.papel),
  'baixar-pdf-admin': ()=>baixarPdfAdmin()
};
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-action]');
  if(!el) return;
  const handler = ACTIONS[el.dataset.action];
  if(handler) handler(el);
});

/* ===================== INIT ===================== */
(async function init(){
  aplicarMarca();
  toggleLoginMode('entrar');
  const { data: { session } } = await sb.auth.getSession();
  if(session){ await afterAuth(session.user); }
})();
