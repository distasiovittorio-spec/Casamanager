'use strict';
/* CasaManager - gestione economica dei propri immobili.
   I dati restano nel browser di questo dispositivo (localStorage): nessun server, nessun account. */

/* =================== Dati =================== */

const CHIAVE = 'casamanager.dati.v1';
const TABELLE = ['immobili', 'affittuari', 'affitti', 'condomini', 'affittiVersati', 'condominiVersati', 'depositi', 'spese', 'rate', 'tasse', 'causali', 'riunioni', 'letture'];
const CAUSALI_BASE = ['Prima rata IMU', 'Seconda rata IMU', 'Saldo IMU', 'TARI', 'Imposta di registro', 'Cedolare secca'];
const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function vuoto() {
  const d = { versione: 1 };
  TABELLE.forEach(t => { d[t] = []; });
  d.causali = CAUSALI_BASE.map((testo, i) => ({ id: 'base' + i, testo }));
  return d;
}

function normalizza(grezzo) {
  const d = vuoto();
  TABELLE.forEach(t => { if (Array.isArray(grezzo && grezzo[t])) d[t] = grezzo[t]; });
  if (grezzo && /^\d{4}-\d{2}$/.test(grezzo.controlloDal || '')) d.controlloDal = grezzo.controlloDal;
  return d;
}

let db = (function carica() {
  try {
    const s = localStorage.getItem(CHIAVE);
    if (s) return normalizza(JSON.parse(s));
  } catch (e) { /* archivio non disponibile */ }
  return vuoto();
})();

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(db));
  } catch (e) {
    avviso('Impossibile salvare: il browser ha bloccato l\'archivio dei dati.');
  }
}

/* =================== Utilità =================== */

const $ = (s, r = document) => r.querySelector(s);

function h(tag, attrs, ...figli) {
  const el = document.createElement(tag);
  let valore;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') valore = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = true;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of figli.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f.nodeType ? f : document.createTextNode(String(f)));
  }
  if (valore !== undefined) el.value = valore;
  return el;
}

function svg(tag, attrs, ...figli) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  figli.flat().forEach(f => f && el.append(f.nodeType ? f : document.createTextNode(String(f))));
  return el;
}

let timerAvviso;
function avviso(testo) {
  const el = $('#avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => { el.hidden = true; }, 3500);
}

/* ----- Date (testo "AAAA-MM-GG", mese "AAAA-MM", data e ora "AAAA-MM-GGTHH:MM") ----- */

const pad = n => String(n).padStart(2, '0');
const isoGiorno = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const oggi = () => isoGiorno(new Date());
const leggiGiorno = s => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g); };

function aggiungiMesi(s, n) {
  const d = leggiGiorno(s);
  const giorno = d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(giorno, ultimo));
  return isoGiorno(t);
}

function aggiungiGiorni(s, n) {
  const d = leggiGiorno(s);
  d.setDate(d.getDate() + n);
  return isoGiorno(d);
}

const giorniTra = (a, b) => Math.round((leggiGiorno(b) - leggiGiorno(a)) / 864e5);

const maiuscola = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtGiorno = s => leggiGiorno(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtGiornoOra = s => new Date(s).toLocaleString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtMese = ym => { const [a, m] = ym.split('-').map(Number); return maiuscola(new Date(a, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })); };
const meseCorrente = () => oggi().slice(0, 7);

/* ----- Importi ----- */

const formatoEuro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const eur = n => formatoEuro.format(n);

// "1.250,50", "1250.5", "80" -> numero (null se non valido)
function leggiImporto(testo) {
  let s = String(testo || '').replace(/[€\s\u00a0]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  } else if (s.includes('.')) {
    const dopo = s.split('.')[1];
    if (dopo.length === 3 && s[0] !== '0') s = s.replace('.', '');
  }
  const v = Number(s);
  if (!isFinite(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}
const testoImporto = v => (v ? v.toFixed(2).replace('.', ',') : '');

const semplifica = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/* =================== Accesso ai dati =================== */

const immobile = id => db.immobili.find(x => x.id === id);
const nomeImmobile = id => (immobile(id) || {}).nome || '';
const speseRate = spesaId => db.rate.filter(r => r.spesaId === spesaId).sort((a, b) => a.numero - b.numero);

function eliminaImmobile(id) {
  db.immobili = db.immobili.filter(x => x.id !== id);
  ['affittuari', 'affitti', 'condomini', 'affittiVersati', 'condominiVersati', 'depositi', 'tasse', 'riunioni', 'letture'].forEach(t => {
    db[t] = db[t].filter(x => x.immobileId !== id);
  });
  const spese = db.spese.filter(s => s.immobileId === id).map(s => s.id);
  db.spese = db.spese.filter(s => s.immobileId !== id);
  db.rate = db.rate.filter(r => !spese.includes(r.spesaId));
  salva();
}

function eliminaSpesa(id) {
  db.spese = db.spese.filter(s => s.id !== id);
  db.rate = db.rate.filter(r => r.spesaId !== id);
  salva();
}

function eliminaAffittuario(id) {
  db.affittuari = db.affittuari.filter(a => a.id !== id);
  db.affitti.forEach(q => { if (q.affittuarioId === id) q.affittuarioId = ''; });
  db.depositi.forEach(q => { if (q.affittuarioId === id) q.affittuarioId = ''; });
  salva();
}

/* ----- Scadenziario ----- */

const PROMEMORIA = {
  Gas: { titolo: 'Lettura gas', icona: '🔥', fatto: 'Fatta' },
  Acqua: { titolo: 'Lettura acqua', icona: '💧', fatto: 'Fatta' },
  Affitto: { titolo: 'Pagare affitto', icona: '🏠', fatto: 'Pagato' }
};


function vociScadenze() {
  const voci = [];
  for (const r of db.rate) {
    if (r.pagata) continue;
    const s = db.spese.find(x => x.id === r.spesaId);
    if (!s) continue;
    const tot = db.rate.filter(x => x.spesaId === s.id).length;
    voci.push({ tipo: 'rata', id: r.id, spesaId: s.id, data: r.scadenza, icona: '🔨',
      titolo: tot > 1 ? `${s.descrizione} · rata ${r.numero}/${tot}` : s.descrizione,
      immobile: nomeImmobile(s.immobileId), importo: r.importo });
  }
  for (const t of db.tasse) {
    if (t.pagata) continue;
    voci.push({ tipo: 'tassa', id: t.id, data: t.scadenza, icona: '🏛️', titolo: t.descrizione,
      immobile: nomeImmobile(t.immobileId), importo: t.importo });
  }
  for (const l of db.letture) {
    const p = PROMEMORIA[l.contatore] || PROMEMORIA.Gas;
    voci.push({ tipo: 'lettura', id: l.id, data: l.prossima, icona: p.icona, fatto: p.fatto,
      titolo: p.titolo, immobile: nomeImmobile(l.immobileId), importo: null, ogniMesi: l.ogniMesi });
  }
  return voci.sort((a, b) => a.data.localeCompare(b.data));
}

function completa(v) {
  if (v.tipo === 'rata') {
    const r = db.rate.find(x => x.id === v.id);
    r.pagata = true; r.dataPagamento = oggi();
  } else if (v.tipo === 'tassa') {
    const t = db.tasse.find(x => x.id === v.id);
    t.pagata = true; t.dataPagamento = oggi();
  } else {
    const l = db.letture.find(x => x.id === v.id);
    const passo = Math.max(1, l.ogniMesi);
    let prossima = l.prossima;
    do { prossima = aggiungiMesi(prossima, passo); } while (prossima <= oggi());
    l.prossima = prossima;
  }
  salva();
  render();
}

/* ----- Registro ----- */

function statoDeposito(d) {
  if (!d.chiusura) return ['Aperto · non incluso nel bilancio', 'blu'];
  const c = d.chiusura, incassato = d.tipo === 'incassato';
  if (c.trattenuto > 0.004) return [`Chiuso: restituiti ${eur(c.restituito)}, ${eur(c.trattenuto)} ${incassato ? 'trattenuti' : 'non restituiti'}`, 'arancio'];
  return ['Chiuso: restituito per intero', 'verde'];
}

function vociRegistro() {
  const voci = [];
  for (const a of db.affitti) {
    const inq = db.affittuari.find(x => x.id === a.affittuarioId);
    voci.push({ k: 'affitto', id: a.id, gruppo: 'entrata', entrata: true, data: a.data, importo: a.importo, icona: '🏠', categoria: 'Affitto',
      titolo: `Affitto ${fmtMese(a.mese)}`, dettaglio: [nomeImmobile(a.immobileId), inq ? inq.nome : ''].filter(Boolean).join(' · ') });
  }
  for (const q of db.affittiVersati) {
    voci.push({ k: 'affittoVersato', id: q.id, gruppo: 'uscita', entrata: false, data: q.data, importo: q.importo, icona: '🏠', categoria: 'Affitto versato',
      titolo: `Affitto versato ${fmtMese(q.mese)}`, dettaglio: nomeImmobile(q.immobileId) });
  }
  for (const q of db.condomini) {
    voci.push({ k: 'condominio', id: q.id, gruppo: 'condominio', entrata: true, data: q.data, importo: q.importo, icona: '🏢', categoria: 'Condominio',
      titolo: `Condominio ricevuto ${fmtMese(q.mese)}`, dettaglio: nomeImmobile(q.immobileId), stato: ['Non incluso in entrate/uscite', 'blu'] });
  }
  for (const q of db.condominiVersati) {
    voci.push({ k: 'condominioVersato', id: q.id, gruppo: 'condominio', entrata: false, data: q.data, importo: q.importo, icona: '🏢', categoria: 'Condominio',
      titolo: `Condominio versato ${fmtMese(q.mese)}`, dettaglio: nomeImmobile(q.immobileId), stato: ['Non incluso in entrate/uscite', 'blu'] });
  }
  for (const d of db.depositi) {
    const inq = db.affittuari.find(x => x.id === d.affittuarioId);
    voci.push({ k: 'deposito', id: d.id, gruppo: 'deposito', data: d.data, importo: d.importo, icona: '🔑', categoria: 'Deposito cauzionale',
      titolo: d.tipo === 'versato' ? 'Deposito cauzionale versato' : 'Deposito cauzionale incassato',
      dettaglio: [nomeImmobile(d.immobileId), inq ? inq.nome : ''].filter(Boolean).join(' · '), stato: statoDeposito(d) });
  }
  for (const s of db.spese) {
    const rate = speseRate(s.id);
    const pagate = rate.filter(r => r.pagata).length;
    let stato;
    if (rate.length && pagate === rate.length) stato = ['Pagata', 'verde'];
    else if (rate.length > 1) stato = [`${pagate} di ${rate.length} rate pagate`, 'arancio'];
    else stato = ['Da pagare', 'arancio'];
    voci.push({ k: 'spesa', id: s.id, gruppo: 'uscita', entrata: false, data: s.data, importo: s.totale, icona: '🔨', categoria: 'Spesa straordinaria',
      titolo: s.descrizione, dettaglio: nomeImmobile(s.immobileId), stato });
  }
  for (const t of db.tasse) {
    voci.push({ k: 'tassa', id: t.id, gruppo: 'uscita', entrata: false, data: t.pagata ? (t.dataPagamento || t.scadenza) : t.scadenza,
      importo: t.importo, icona: '🏛️', categoria: 'Tassa', titolo: t.descrizione, dettaglio: nomeImmobile(t.immobileId),
      stato: t.pagata ? ['Pagata', 'verde'] : ['Da pagare', 'arancio'] });
  }
  return voci;
}

function testoRicerca(v) {
  return semplifica([v.titolo, v.dettaglio, v.categoria, v.gruppo === 'deposito' ? 'deposito cauzione cauzionale' : v.gruppo === 'condominio' ? 'condominio quota' : v.entrata ? 'entrata' : 'uscita',
    eur(v.importo), testoImporto(v.importo), v.importo.toFixed(0), fmtMese(v.data.slice(0, 7)), fmtGiorno(v.data)].join(' '));
}

/* ----- Bilancio ----- */

function movimentiEffettivi() {
  const m = [];
  db.affitti.forEach(a => m.push({ data: a.data, importo: a.importo, cat: 'affitti', immobileId: a.immobileId }));
  db.condomini.forEach(q => m.push({ data: q.data, importo: q.importo, cat: 'condominio', immobileId: q.immobileId }));
  db.affittiVersati.forEach(q => m.push({ data: q.data, importo: q.importo, cat: 'affittoVersato', immobileId: q.immobileId }));
  db.condominiVersati.forEach(q => m.push({ data: q.data, importo: q.importo, cat: 'condominioVersato', immobileId: q.immobileId }));
  // Depositi chiusi: conta solo la parte trattenuta (entrata se incassato, costo se versato), alla data di chiusura.
  db.depositi.filter(d => d.chiusura && d.chiusura.trattenuto > 0.004).forEach(d => m.push({ data: d.chiusura.data, importo: d.chiusura.trattenuto,
    cat: d.tipo === 'incassato' ? 'cauzioneTrattenuta' : 'cauzioneNonRestituita', immobileId: d.immobileId }));
  db.rate.filter(r => r.pagata).forEach(r => {
    const s = db.spese.find(x => x.id === r.spesaId);
    m.push({ data: r.dataPagamento || r.scadenza, importo: r.importo, cat: 'spese', immobileId: s ? s.immobileId : '' });
  });
  db.tasse.filter(t => t.pagata).forEach(t => m.push({ data: t.dataPagamento || t.scadenza, importo: t.importo, cat: 'tasse', immobileId: t.immobileId }));
  return m;
}

/* ----- Controllo ritardi -----
   Si guardano solo i mesi PRECEDENTI a quello in corso:
   - affitto o quota condominio non ricevuti, per gli affittuari con il controllo attivo (dal mese scelto, entro la durata del contratto);
   - quote condominio ricevute ma senza il relativo versamento (per le quote dal mese di attivazione del controllo in poi). */
const mesePrecedente = ym => aggiungiMesi(ym + '-01', -1).slice(0, 7);

function ritardi() {
  const corrente = meseCorrente();
  const ultimoControllabile = mesePrecedente(corrente);
  const elenco = [];
  for (const a of db.affittuari) {
    const imm = immobile(a.immobileId);
    if (!imm || !a.controlloDal) continue;
    const primo = [a.controlloDal, a.inizio.slice(0, 7)].sort().pop();
    const ultimo = [ultimoControllabile, a.fine.slice(0, 7)].sort()[0];
    for (let m = primo; m <= ultimo; m = aggiungiMesi(m + '-01', 1).slice(0, 7)) {
      if (a.controlloAffitto !== false && !db.affitti.some(x => x.mese === m && (x.affittuarioId === a.id || (!x.affittuarioId && x.immobileId === a.immobileId)))) {
        elenco.push({ tipo: 'affitto', mese: m, immobileId: a.immobileId, affittuarioId: a.id, titolo: `Affitto ${fmtMese(m)}`, dettaglio: `${a.nome} · ${imm.nome}` });
      }
      if (a.controlloCondominio !== false && !db.condomini.some(x => x.mese === m && x.immobileId === a.immobileId)) {
        elenco.push({ tipo: 'condominio', mese: m, immobileId: a.immobileId, titolo: `Condominio ${fmtMese(m)}`, dettaglio: `${a.nome} · ${imm.nome}` });
      }
    }
  }
  const dal = db.controlloDal || corrente;
  const viste = new Set();
  for (const q of db.condomini) {
    const chiave = q.immobileId + q.mese;
    if (q.mese >= corrente || q.mese < dal || viste.has(chiave) || !immobile(q.immobileId)) continue;
    viste.add(chiave);
    if (!db.condominiVersati.some(x => x.immobileId === q.immobileId && x.mese === q.mese)) {
      elenco.push({ tipo: 'nonVersata', mese: q.mese, immobileId: q.immobileId, quotaId: q.id, titolo: `Condominio ${fmtMese(q.mese)}`,
        dettaglio: `${nomeImmobile(q.immobileId)} · ${eur(q.importo)} ricevuti, non versati` });
    }
  }
  return elenco.sort((x, y) => x.mese.localeCompare(y.mese));
}

/* =================== Interfaccia: strumenti =================== */

const stato = { scheda: 'scadenze', filtro: 'tutti', ricerca: '', anno: new Date().getFullYear(), immBilancio: [], dettaglio: null };

function vuotoMsg(titolo, testo, azione) {
  return h('div', { class: 'vuoto' }, h('h3', {}, titolo), h('p', {}, testo),
    azione && h('button', { class: 'btn primario', onclick: azione[1] }, azione[0]));
}

function apriFoglio(titolo, corpo, { sinistra = 'Annulla', destra = null, alChiudere = null } = {}) {
  const velo = h('div', { class: 'velo' });
  const chiudi = () => { velo.remove(); document.body.style.overflow = ''; if (alChiudere) alChiudere(); render(); };
  const btnSx = h('button', { onclick: chiudi }, sinistra);
  const btnDx = destra ? h('button', { onclick: () => destra.azione(chiudi) }, destra.testo) : h('span');
  velo.append(h('div', { class: 'foglio', role: 'dialog', 'aria-label': titolo },
    h('div', { class: 'foglio-top' }, btnSx, h('h2', {}, titolo), btnDx),
    h('div', { class: 'foglio-corpo' }, corpo)));
  velo.addEventListener('click', e => { if (e.target === velo) chiudi(); });
  document.body.append(velo);
  document.body.style.overflow = 'hidden';
  return { chiudi, btnDx };
}

/* Modulo generico. Campi: { n, l, t, opts, show, ph, min, max, ... } */
function apriModulo(cfg) {
  const v = Object.assign({}, cfg.valori);
  const righe = [];
  const nota = h('div', { class: 'nota' });
  const corpoCampi = h('div', { class: 'campi' });

  const aggiorna = () => {
    for (const r of righe) {
      r.el.hidden = r.f.show ? !r.f.show(v) : false;
      if (r.aggiorna) r.aggiorna();
    }
    const info = cfg.info ? cfg.info(v) : '';
    nota.textContent = info || '';
    nota.className = 'nota' + (info && cfg.infoErrore && cfg.infoErrore(v) ? ' errore' : '');
    if (foglio) foglio.btnDx.disabled = !cfg.valido(v);
  };

  for (const f of cfg.campi) {
    const riga = h('div', { class: 'campo' + (f.t === 'testoLungo' ? ' colonna' : '') });
    const id = 'c_' + f.n;
    const etichetta = h('label', { for: id });
    const imposta = (valore) => { v[f.n] = valore; aggiorna(); };
    let controllo, aggiornaRiga = null;

    if (f.t === 'testo' || f.t === 'importo') {
      controllo = h('input', { id, type: 'text', value: v[f.n] || '', placeholder: f.ph || (f.t === 'importo' ? '0,00' : ''),
        inputmode: f.t === 'importo' ? 'decimal' : (f.inputmode || null), autocomplete: 'off', autocapitalize: f.t === 'testo' ? 'sentences' : null,
        oninput: e => imposta(e.target.value) });
    } else if (f.t === 'data' || f.t === 'mese' || f.t === 'dataora') {
      const tipo = { data: 'date', mese: 'month', dataora: 'datetime-local' }[f.t];
      controllo = h('input', { id, type: tipo, value: v[f.n] || '', oninput: e => imposta(e.target.value), onchange: e => imposta(e.target.value) });
    } else if (f.t === 'testoLungo') {
      controllo = h('textarea', { id, placeholder: f.ph || '', oninput: e => imposta(e.target.value) });
      controllo.value = v[f.n] || '';
    } else if (f.t === 'scelta') {
      controllo = h('select', { id, onchange: e => imposta(e.target.value) });
      aggiornaRiga = () => {
        const opzioni = typeof f.opts === 'function' ? f.opts(v) : f.opts;
        if (opzioni.length && opzioni.some(o => o.v === controllo.value) === false && controllo.options.length === 0) { /* prima volta */ }
        controllo.replaceChildren(...[{ v: '', l: f.vuoto || 'Seleziona…' }, ...opzioni].map(o => h('option', { value: o.v }, o.l)));
        if (!opzioni.some(o => o.v === v[f.n])) v[f.n] = '';
        controllo.value = v[f.n];
      };
    } else if (f.t === 'interruttore') {
      controllo = h('input', { id, type: 'checkbox', class: 'interruttore', role: 'switch', onchange: e => imposta(e.target.checked) });
      controllo.checked = !!v[f.n];
    } else if (f.t === 'contatore') {
      const uscita = h('output', {}, String(v[f.n]));
      const cambia = d => () => { v[f.n] = Math.min(f.max, Math.max(f.min, v[f.n] + d)); uscita.textContent = v[f.n]; aggiorna(); };
      controllo = h('div', { class: 'contatore' }, h('button', { type: 'button', onclick: cambia(-1), 'aria-label': 'Meno' }, '−'), uscita,
        h('button', { type: 'button', onclick: cambia(1), 'aria-label': 'Più' }, '+'));
    } else if (f.t === 'segmenti') {
      const bottoni = f.opts.map(o => h('button', { type: 'button', onclick: () => imposta(o), 'data-v': o }, (f.etichette && f.etichette[o]) || o));
      controllo = h('div', { class: 'segmenti', style: 'flex:1;max-width:300px' }, bottoni);
      aggiornaRiga = () => bottoni.forEach(b => b.classList.toggle('attivo', b.dataset.v === v[f.n]));
    }

    const testoEtichetta = () => { etichetta.textContent = typeof f.l === 'function' ? f.l(v) : f.l; };
    riga.append(etichetta, controllo, f.t === 'importo' ? h('span', { class: 'euro' }, '€') : null);
    corpoCampi.append(riga);
    righe.push({ f, el: riga, aggiorna: () => { testoEtichetta(); if (aggiornaRiga) aggiornaRiga(); } });
  }

  const corpo = [corpoCampi, nota];
  (cfg.extra || []).forEach(x => corpo.push(h('button', { class: 'btn secondario pieno', onclick: () => { foglio.chiudi(); x.azione(); } }, x.testo)));
  if (cfg.elimina) {
    corpo.push(h('button', { class: 'btn pericolo pieno', onclick: () => {
      if (confirm(cfg.conferma || 'Eliminare definitivamente?')) { cfg.elimina(); foglio.chiudi(); }
    } }, cfg.etichettaElimina || 'Elimina'));
  }

  let foglio = null;
  foglio = apriFoglio(cfg.titolo, corpo, { destra: { testo: 'Salva', azione: chiudi => { cfg.salva(v); salva(); chiudi(); } } });
  aggiorna();
  const primo = corpoCampi.querySelector('input[type=text]');
  if (primo && !cfg.valori._noFocus && !(cfg.valori.id)) setTimeout(() => primo.focus(), 250);
}

const opzImmobili = () => db.immobili.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map(i => ({ v: i.id, l: i.nome }));
const immobilePredefinito = () => (db.immobili.length === 1 ? db.immobili[0].id : '');

/* =================== Moduli =================== */

function moduloImmobile(esistente) {
  apriModulo({
    titolo: esistente ? 'Modifica immobile' : 'Nuovo immobile',
    valori: { nome: esistente ? esistente.nome : '', indirizzo: esistente ? esistente.indirizzo : '' },
    campi: [
      { n: 'nome', l: 'Nome', t: 'testo', ph: 'es. Appartamento Via Roma' },
      { n: 'indirizzo', l: 'Indirizzo', t: 'testo' }
    ],
    valido: v => v.nome.trim() !== '',
    salva: v => {
      if (esistente) { esistente.nome = v.nome.trim(); esistente.indirizzo = v.indirizzo.trim(); }
      else db.immobili.push({ id: nuovoId(), nome: v.nome.trim(), indirizzo: v.indirizzo.trim() });
    }
  });
}

function moduloAffittuario(imm, esistente) {
  const quattroAnni = aggiungiMesi(oggi(), 48);
  apriModulo({
    titolo: esistente ? 'Modifica affittuario' : 'Nuovo affittuario',
    valori: {
      nome: esistente ? esistente.nome : '', inizio: esistente ? esistente.inizio : oggi(), fine: esistente ? esistente.fine : quattroAnni, id: esistente && esistente.id,
      controlloAffitto: esistente ? esistente.controlloAffitto !== false : true,
      controlloCondominio: esistente ? esistente.controlloCondominio !== false : true,
      controlloDal: esistente && esistente.controlloDal ? esistente.controlloDal : meseCorrente()
    },
    campi: [
      { n: 'nome', l: 'Nome e cognome', t: 'testo' },
      { n: 'inizio', l: 'Inizio contratto', t: 'data' },
      { n: 'fine', l: 'Fine contratto', t: 'data' },
      { n: 'controlloAffitto', l: 'Avvisa se l\'affitto è in ritardo', t: 'interruttore' },
      { n: 'controlloCondominio', l: 'Avvisa se la quota condominio è in ritardo', t: 'interruttore' },
      { n: 'controlloDal', l: 'Controlla dal mese', t: 'mese', show: v => v.controlloAffitto || v.controlloCondominio }
    ],
    valido: v => v.nome.trim() !== '' && v.inizio && v.fine && v.fine >= v.inizio && ((!v.controlloAffitto && !v.controlloCondominio) || v.controlloDal),
    info: v => (v.inizio && v.fine && v.fine < v.inizio ? 'La data di fine deve essere successiva all\'inizio.' : ''),
    infoErrore: () => true,
    salva: v => {
      const dati = { nome: v.nome.trim(), inizio: v.inizio, fine: v.fine, controlloAffitto: v.controlloAffitto,
        controlloCondominio: v.controlloCondominio, controlloDal: v.controlloDal };
      if (esistente) Object.assign(esistente, dati);
      else db.affittuari.push(Object.assign({ id: nuovoId(), immobileId: imm.id }, dati));
    },
    elimina: esistente ? () => eliminaAffittuario(esistente.id) : null,
    conferma: 'Eliminare questo affittuario? Gli affitti già registrati restano nel registro.',
    etichettaElimina: 'Elimina affittuario'
  });
}

function moduloRiunione(imm, esistente) {
  const adesso = new Date();
  const ora = `${isoGiorno(adesso)}T${pad(adesso.getHours())}:${pad(adesso.getMinutes())}`;
  apriModulo({
    titolo: esistente ? 'Riunione di condominio' : 'Nuova riunione',
    valori: { data: esistente ? esistente.data : ora, note: esistente ? esistente.note : '', id: esistente && esistente.id },
    campi: [
      { n: 'data', l: 'Data e ora', t: 'dataora' },
      { n: 'note', l: 'Note', t: 'testoLungo', ph: 'Argomenti, decisioni, importi approvati…' }
    ],
    valido: v => !!v.data,
    salva: v => {
      if (esistente) Object.assign(esistente, { data: v.data, note: v.note });
      else db.riunioni.push({ id: nuovoId(), immobileId: imm.id, data: v.data, note: v.note });
    },
    elimina: esistente ? () => { db.riunioni = db.riunioni.filter(r => r.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questa riunione?',
    etichettaElimina: 'Elimina riunione'
  });
}

function ultimoImporto(tabella, filtro) {
  const l = db[tabella].filter(filtro).sort((a, b) => b.data.localeCompare(a.data))[0];
  return l ? testoImporto(l.importo) : '';
}

function moduloAffitto(esistente, pre) {
  pre = pre || {};
  apriModulo({
    titolo: esistente ? 'Modifica affitto' : 'Affitto ricevuto',
    valori: {
      immobileId: esistente ? esistente.immobileId : (pre.immobileId || immobilePredefinito()),
      affittuarioId: esistente ? esistente.affittuarioId : (pre.affittuarioId || ''),
      mese: esistente ? esistente.mese : (pre.mese || meseCorrente()),
      data: esistente ? esistente.data : oggi(),
      importo: esistente ? testoImporto(esistente.importo) : (pre.importo || ''), id: esistente && esistente.id
    },
    campi: [
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'affittuarioId', l: 'Affittuario', t: 'scelta', vuoto: 'Nessuno',
        opts: v => db.affittuari.filter(a => a.immobileId === v.immobileId).map(a => ({ v: a.id, l: a.nome })) },
      { n: 'mese', l: 'Mese di competenza', t: 'mese' },
      { n: 'data', l: 'Data incasso', t: 'data' },
      { n: 'importo', l: 'Importo', t: 'importo' }
    ],
    valido: v => v.immobileId && v.mese && v.data && (leggiImporto(v.importo) || 0) > 0,
    salva: v => {
      const dati = { immobileId: v.immobileId, affittuarioId: v.affittuarioId, mese: v.mese, data: v.data, importo: leggiImporto(v.importo) };
      if (esistente) Object.assign(esistente, dati); else db.affitti.push(Object.assign({ id: nuovoId() }, dati));
    },
    elimina: esistente ? () => { db.affitti = db.affitti.filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questo affitto dal registro?'
  });
}

function moduloVersamento(tipo, esistente, pre) {
  pre = pre || {};
  const affitto = tipo === 'affitto';
  const tabella = affitto ? 'affittiVersati' : 'condominiVersati';
  apriModulo({
    titolo: esistente ? (affitto ? 'Modifica affitto versato' : 'Modifica quota condominio versata') : (affitto ? 'Affitto versato' : 'Quota condominio versata'),
    valori: {
      immobileId: esistente ? esistente.immobileId : (pre.immobileId || immobilePredefinito()),
      mese: esistente ? esistente.mese : (pre.mese || meseCorrente()),
      data: esistente ? esistente.data : oggi(),
      importo: esistente ? testoImporto(esistente.importo) : (pre.importo || ''), id: esistente && esistente.id
    },
    campi: [
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'mese', l: 'Mese di competenza', t: 'mese' },
      { n: 'data', l: 'Data pagamento', t: 'data' },
      { n: 'importo', l: 'Importo', t: 'importo' }
    ],
    info: () => (affitto ? '' : 'Le quote condominio non sono conteggiate in entrate e uscite: compaiono nella sezione dedicata del bilancio.'),
    valido: v => v.immobileId && v.mese && v.data && (leggiImporto(v.importo) || 0) > 0,
    salva: v => {
      const dati = { immobileId: v.immobileId, mese: v.mese, data: v.data, importo: leggiImporto(v.importo) };
      if (esistente) Object.assign(esistente, dati); else db[tabella].push(Object.assign({ id: nuovoId() }, dati));
    },
    elimina: esistente ? () => { db[tabella] = db[tabella].filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questo pagamento dal registro?'
  });
}

function moduloDeposito(tipo, esistente) {
  const incassato = tipo === 'incassato';
  apriModulo({
    titolo: esistente ? 'Deposito cauzionale' : (incassato ? 'Deposito cauzionale incassato' : 'Deposito cauzionale versato'),
    valori: {
      immobileId: esistente ? esistente.immobileId : immobilePredefinito(), affittuarioId: esistente ? esistente.affittuarioId : '',
      data: esistente ? esistente.data : oggi(), importo: esistente ? testoImporto(esistente.importo) : '', id: esistente && esistente.id
    },
    campi: [
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'affittuarioId', l: 'Affittuario', t: 'scelta', vuoto: 'Nessuno', show: () => incassato,
        opts: v => db.affittuari.filter(a => a.immobileId === v.immobileId).map(a => ({ v: a.id, l: a.nome })) },
      { n: 'data', l: incassato ? 'Data incasso' : 'Data versamento', t: 'data' },
      { n: 'importo', l: 'Importo', t: 'importo' }
    ],
    info: () => {
      if (esistente && esistente.chiusura) return 'Depositi chiusi: ' + statoDeposito(esistente)[0] + ' il ' + fmtGiorno(esistente.chiusura.data) + '.';
      return 'Non è conteggiato in entrate, costi e saldo finché non lo chiudi a fine contratto.';
    },
    valido: v => v.immobileId && v.data && (leggiImporto(v.importo) || 0) > 0,
    salva: v => {
      const dati = { tipo: esistente ? esistente.tipo : tipo, immobileId: v.immobileId, affittuarioId: incassato ? v.affittuarioId : '', data: v.data, importo: leggiImporto(v.importo) };
      if (esistente) Object.assign(esistente, dati); else db.depositi.push(Object.assign({ id: nuovoId() }, dati));
    },
    extra: esistente ? [esistente.chiusura
      ? { testo: 'Riapri il deposito', azione: () => { if (confirm('Riaprire il deposito? La chiusura verrà annullata.')) { esistente.chiusura = null; salva(); render(); } } }
      : { testo: 'Chiudi il deposito (fine contratto)', azione: () => moduloChiusuraDeposito(esistente) }] : null,
    elimina: esistente ? () => { db.depositi = db.depositi.filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questo deposito dal registro?'
  });
}

function moduloChiusuraDeposito(d) {
  const incassato = d.tipo === 'incassato';
  const importo = leggiImporto;
  apriModulo({
    titolo: 'Chiudi deposito cauzionale',
    valori: { data: oggi(), restituito: testoImporto(d.importo), id: d.id },
    campi: [
      { n: 'data', l: 'Data di chiusura', t: 'data' },
      { n: 'restituito', l: incassato ? 'Importo restituito' : 'Importo riavuto', t: 'importo' }
    ],
    info: v => {
      const r = importo(v.restituito);
      if (r === null) return 'Scrivi l\'importo restituito (anche 0).';
      if (r > d.importo + 0.004) return `Non può superare il deposito di ${eur(d.importo)}.`;
      const t = Math.round((d.importo - r) * 100) / 100;
      if (t < 0.005) return 'Restituito per intero: nessun effetto sul bilancio.';
      return incassato
        ? `${eur(t)} trattenuti: contano come entrata nel bilancio alla data di chiusura.`
        : `${eur(t)} non restituiti: contano come costo nel bilancio alla data di chiusura.`;
    },
    infoErrore: v => importo(v.restituito) === null || importo(v.restituito) > d.importo + 0.004,
    valido: v => v.data && importo(v.restituito) !== null && importo(v.restituito) <= d.importo + 0.004,
    salva: v => {
      const r = importo(v.restituito);
      d.chiusura = { data: v.data, restituito: r, trattenuto: Math.round((d.importo - r) * 100) / 100 };
    }
  });
}

function moduloCondominio(esistente, pre) {
  pre = pre || {};
  apriModulo({
    titolo: esistente ? 'Modifica quota condominio' : 'Quota condominio ricevuta',
    valori: {
      immobileId: esistente ? esistente.immobileId : (pre.immobileId || immobilePredefinito()),
      mese: esistente ? esistente.mese : (pre.mese || meseCorrente()),
      data: esistente ? esistente.data : oggi(),
      importo: esistente ? testoImporto(esistente.importo) : (pre.importo || ''), id: esistente && esistente.id
    },
    campi: [
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'mese', l: 'Mese di competenza', t: 'mese' },
      { n: 'data', l: 'Data incasso', t: 'data' },
      { n: 'importo', l: 'Importo', t: 'importo' }
    ],
    info: () => 'Le quote condominio non sono conteggiate in entrate e uscite: compaiono nella sezione dedicata del bilancio.',
    valido: v => v.immobileId && v.mese && v.data && (leggiImporto(v.importo) || 0) > 0,
    salva: v => {
      const dati = { immobileId: v.immobileId, mese: v.mese, data: v.data, importo: leggiImporto(v.importo) };
      if (esistente) Object.assign(esistente, dati); else db.condomini.push(Object.assign({ id: nuovoId() }, dati));
    },
    elimina: esistente ? () => { db.condomini = db.condomini.filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questa quota dal registro?'
  });
}

/* Divide l'importo in rate mensili uguali; l'eventuale resto va sull'ultima. */
function pianoRate(importo, quante, primaScadenza) {
  const totale = Math.round(importo * 100);
  const base = Math.floor(totale / quante);
  const resto = totale - base * quante;
  return Array.from({ length: quante }, (_, i) => ({
    numero: i + 1,
    scadenza: aggiungiMesi(primaScadenza, i),
    importo: (base + (i === quante - 1 ? resto : 0)) / 100
  }));
}

function moduloSpesa() {
  apriModulo({
    titolo: 'Spesa straordinaria',
    valori: { descrizione: '', immobileId: immobilePredefinito(), importo: '', aRate: false, numeroRate: 2, data: oggi(), giaPagata: false },
    campi: [
      { n: 'descrizione', l: 'Descrizione', t: 'testo', ph: 'es. Rifacimento tetto' },
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'importo', l: 'Importo totale', t: 'importo' },
      { n: 'aRate', l: 'Pagamento a rate', t: 'interruttore' },
      { n: 'numeroRate', l: 'Numero di rate', t: 'contatore', min: 2, max: 120, show: v => v.aRate },
      { n: 'data', l: v => (v.aRate ? 'Scadenza prima rata' : 'Data'), t: 'data' },
      { n: 'giaPagata', l: 'Già pagata', t: 'interruttore', show: v => !v.aRate }
    ],
    valido: v => v.immobileId && v.descrizione.trim() !== '' && (leggiImporto(v.importo) || 0) > 0 && v.data,
    info: v => {
      const i = leggiImporto(v.importo);
      return v.aRate && i ? `${v.numeroRate} rate mensili da circa ${eur(i / v.numeroRate)}` : '';
    },
    salva: v => {
      const importo = leggiImporto(v.importo);
      const spesa = { id: nuovoId(), immobileId: v.immobileId, descrizione: v.descrizione.trim(), totale: importo, data: v.data };
      db.spese.push(spesa);
      pianoRate(importo, v.aRate ? v.numeroRate : 1, v.data).forEach(p => {
        db.rate.push({ id: nuovoId(), spesaId: spesa.id, numero: p.numero, scadenza: p.scadenza, importo: p.importo,
          pagata: !v.aRate && v.giaPagata, dataPagamento: !v.aRate && v.giaPagata ? v.data : '' });
      });
    }
  });
}

function dettaglioSpesa(id) {
  const s = db.spese.find(x => x.id === id);
  if (!s) return;
  const corpo = h('div', { class: 'vista' });
  const disegna = () => {
    const rate = speseRate(s.id);
    const pagato = rate.filter(r => r.pagata).reduce((t, r) => t + r.importo, 0);
    corpo.replaceChildren(
      h('div', { class: 'campi' },
        h('div', { class: 'campo' }, h('label', { for: 'ds' }, 'Descrizione'),
          h('input', { id: 'ds', type: 'text', value: s.descrizione, oninput: e => { s.descrizione = e.target.value; salva(); } })),
        h('div', { class: 'campo' }, h('span', {}, 'Immobile'), h('span', { class: 'grigio' }, nomeImmobile(s.immobileId) || '—')),
        h('div', { class: 'campo' }, h('span', {}, 'Importo totale'), h('strong', {}, eur(s.totale))),
        h('div', { class: 'campo' }, h('span', {}, 'Già pagato'), h('strong', {}, eur(pagato)))),
      h('div', { class: 'sezione' }, h('h2', {}, rate.length > 1 ? 'Rate' : 'Pagamento'),
        h('div', { class: 'gruppo' }, rate.map(r => h('div', { class: 'rata' },
          h('div', { class: 'rata-top' }, h('span', {}, rate.length > 1 ? `Rata ${r.numero}` : 'Importo'), h('span', {}, eur(r.importo))),
          h('div', { class: 'campo' }, h('label', {}, 'Scadenza'),
            h('input', { type: 'date', value: r.scadenza, onchange: e => { if (e.target.value) { r.scadenza = e.target.value; salva(); } } })),
          h('div', { class: 'campo' }, h('label', {}, 'Pagata'),
            h('input', { type: 'checkbox', class: 'interruttore', role: 'switch', checked: r.pagata, onchange: e => {
              r.pagata = e.target.checked; r.dataPagamento = r.pagata ? oggi() : ''; salva(); disegna(); } })),
          r.pagata && h('div', { class: 'campo' }, h('label', {}, 'Data pagamento'),
            h('input', { type: 'date', value: r.dataPagamento || oggi(), onchange: e => { if (e.target.value) { r.dataPagamento = e.target.value; salva(); } } })))))),
      h('button', { class: 'btn pericolo pieno', onclick: () => {
        if (confirm('Eliminare questa spesa e tutte le sue rate?')) { eliminaSpesa(s.id); fg.chiudi(); }
      } }, 'Elimina spesa'));
  };
  const fg = apriFoglio('Spesa straordinaria', corpo, { sinistra: 'Fine' });
  disegna();
}

const ALTRO = '__altro';
const causaliOrdinate = () => db.causali.slice().sort((a, b) => a.testo.localeCompare(b.testo, 'it'));

function moduloTassa(esistente) {
  let causale = '', altro = '', anno = String(new Date().getFullYear());
  if (esistente) {
    if (esistente.causale) { causale = esistente.causale; anno = esistente.anno || ''; }
    else { causale = ALTRO; altro = esistente.altro !== undefined ? esistente.altro : esistente.descrizione; anno = esistente.anno || ''; }
  }
  const base = v => (v.causale === ALTRO ? v.altro.trim() : v.causale);
  const annoValido = v => /^\d{4}$/.test(v.anno.trim());
  const descrizione = v => [base(v), v.anno.trim()].filter(Boolean).join(' ');
  apriModulo({
    titolo: esistente ? 'Modifica tassa' : 'Tassa',
    valori: {
      causale, altro, anno, immobileId: esistente ? esistente.immobileId : immobilePredefinito(),
      importo: esistente ? testoImporto(esistente.importo) : '', scadenza: esistente ? esistente.scadenza : oggi(),
      pagata: esistente ? esistente.pagata : false, dataPagamento: esistente && esistente.dataPagamento ? esistente.dataPagamento : oggi(),
      id: esistente && esistente.id
    },
    campi: [
      { n: 'causale', l: 'Causale', t: 'scelta', vuoto: 'Seleziona…', opts: () => {
        const elenco = causaliOrdinate().map(c => ({ v: c.testo, l: c.testo }));
        if (causale && causale !== ALTRO && !elenco.some(o => o.v === causale)) elenco.push({ v: causale, l: causale });
        return [...elenco, { v: ALTRO, l: 'Altra descrizione…' }];
      } },
      { n: 'altro', l: 'Descrizione', t: 'testo', ph: 'es. Tassa rifiuti', show: v => v.causale === ALTRO },
      { n: 'anno', l: 'Anno', t: 'testo', ph: String(new Date().getFullYear()), inputmode: 'numeric' },
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'importo', l: 'Importo', t: 'importo' },
      { n: 'scadenza', l: 'Scadenza', t: 'data' },
      { n: 'pagata', l: 'Già pagata', t: 'interruttore' },
      { n: 'dataPagamento', l: 'Data pagamento', t: 'data', show: v => v.pagata }
    ],
    info: v => (base(v) ? 'Nel promemoria e nel registro: ' + descrizione(v) : ''),
    valido: v => v.immobileId && base(v) && (v.causale === ALTRO ? (v.anno.trim() === '' || annoValido(v)) : annoValido(v))
      && (leggiImporto(v.importo) || 0) > 0 && v.scadenza && (!v.pagata || v.dataPagamento),
    salva: v => {
      const dati = { immobileId: v.immobileId, descrizione: descrizione(v), causale: v.causale === ALTRO ? '' : v.causale,
        altro: v.causale === ALTRO ? v.altro.trim() : '', anno: v.anno.trim(), importo: leggiImporto(v.importo), scadenza: v.scadenza,
        pagata: v.pagata, dataPagamento: v.pagata ? v.dataPagamento : '' };
      if (esistente) Object.assign(esistente, dati); else db.tasse.push(Object.assign({ id: nuovoId() }, dati));
    },
    elimina: esistente ? () => { db.tasse = db.tasse.filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questa tassa?'
  });
}

function moduloCausale(esistente) {
  apriModulo({
    titolo: esistente ? 'Modifica causale' : 'Nuova causale',
    valori: { testo: esistente ? esistente.testo : '', id: esistente && esistente.id },
    campi: [{ n: 'testo', l: 'Causale', t: 'testo', ph: 'es. Prima rata IMU' }],
    info: () => 'Scrivila senza l\'anno: lo aggiungi ogni volta che registri la tassa (es. Prima rata IMU 2026).',
    valido: v => v.testo.trim() !== '' && !db.causali.some(c => c.id !== v.id && c.testo.toLowerCase() === v.testo.trim().toLowerCase()),
    salva: v => {
      if (esistente) esistente.testo = v.testo.trim(); else db.causali.push({ id: nuovoId(), testo: v.testo.trim() });
    },
    elimina: esistente ? () => { db.causali = db.causali.filter(c => c.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questa causale? Le tasse già registrate non cambiano.',
    etichettaElimina: 'Elimina causale'
  });
}

function moduloLettura(esistente) {
  apriModulo({
    titolo: esistente ? 'Modifica promemoria' : 'Nuovo promemoria',
    valori: {
      contatore: esistente ? esistente.contatore : 'Gas', immobileId: esistente ? esistente.immobileId : immobilePredefinito(),
      prossima: esistente ? esistente.prossima : oggi(), ogniMesi: esistente ? esistente.ogniMesi : 1, id: esistente && esistente.id
    },
    campi: [
      { n: 'contatore', l: 'Promemoria', t: 'segmenti', opts: ['Gas', 'Acqua', 'Affitto'], etichette: { Gas: 'Lettura gas', Acqua: 'Lettura acqua', Affitto: 'Pagare affitto' } },
      { n: 'immobileId', l: 'Immobile', t: 'scelta', opts: opzImmobili },
      { n: 'prossima', l: v => (v.contatore === 'Affitto' ? 'Prossimo pagamento' : 'Prossima lettura'), t: 'data' },
      { n: 'ogniMesi', l: v => (v.ogniMesi === 1 ? 'Ripeti ogni mese' : `Ripeti ogni ${v.ogniMesi} mesi`), t: 'contatore', min: 1, max: 12 }
    ],
    valido: v => v.immobileId && v.prossima,
    salva: v => {
      const dati = { contatore: v.contatore, immobileId: v.immobileId, prossima: v.prossima, ogniMesi: v.ogniMesi };
      if (esistente) Object.assign(esistente, dati); else db.letture.push(Object.assign({ id: nuovoId() }, dati));
    },
    elimina: esistente ? () => { db.letture = db.letture.filter(x => x.id !== esistente.id); salva(); } : null,
    conferma: 'Eliminare questo promemoria?',
    etichettaElimina: 'Elimina promemoria'
  });
}

/* =================== Calendario (avvisi) e copia dei dati =================== */

async function condividiFile(nome, tipo, contenuto) {
  const file = new File([contenuto], nome, { type: tipo });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const a = h('a', { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const escIcs = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function piegaIcs(riga) {
  const c = Array.from(riga);
  if (c.length <= 60) return riga;
  const pezzi = [];
  for (let i = 0; i < c.length; i += 60) pezzi.push(c.slice(i, i + 60).join(''));
  return pezzi.join('\r\n ');
}

/* Un evento "tutto il giorno" per ogni scadenza, con avviso 3 giorni prima e il giorno stesso alle 9:00.
   Ogni evento ha un identificativo fisso: importando di nuovo il file, il Calendario aggiorna senza duplicare. */
function costruisciIcs() {
  const stampa = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const r = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CasaManager//IT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:CasaManager'];
  const allarme = (descr, trigger) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escIcs(descr), 'TRIGGER:' + trigger, 'END:VALARM'];
  for (const v of vociScadenze()) {
    const dettaglio = [v.immobile, v.importo != null ? eur(v.importo) : ''].filter(Boolean).join(' · ');
    r.push('BEGIN:VEVENT', `UID:${v.tipo}-${v.id}@casamanager`, `DTSTAMP:${stampa}`,
      `DTSTART;VALUE=DATE:${v.data.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${aggiungiGiorni(v.data, 1).replace(/-/g, '')}`,
      'SUMMARY:' + escIcs(v.titolo + (v.immobile ? ' - ' + v.immobile : '')));
    if (dettaglio) r.push('DESCRIPTION:' + escIcs(dettaglio));
    if (v.tipo === 'lettura') r.push(`RRULE:FREQ=MONTHLY;INTERVAL=${Math.max(1, v.ogniMesi)};COUNT=24`);
    r.push(...allarme(v.titolo + ' tra 3 giorni', '-P2DT15H'), ...allarme(v.titolo + ' oggi', 'PT9H'), 'END:VEVENT');
  }
  if (db.immobili.length) {
    const primo = aggiungiMesi(oggi().slice(0, 7) + '-01', 1);
    r.push('BEGIN:VEVENT', 'UID:controllo-mensile@casamanager', `DTSTAMP:${stampa}`, `DTSTART;VALUE=DATE:${primo.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${aggiungiGiorni(primo, 1).replace(/-/g, '')}`, 'RRULE:FREQ=MONTHLY;COUNT=24',
      'SUMMARY:CasaManager - controlla ritardi affitti e quote condominio',
      'DESCRIPTION:Apri CasaManager > Scadenze per vedere gli eventuali ritardi del mese precedente.',
      ...allarme('Controlla i ritardi su CasaManager', 'PT9H'), 'END:VEVENT');
  }
  r.push('END:VCALENDAR');
  return r.map(piegaIcs).join('\r\n') + '\r\n';
}

function esportaCalendario() {
  if (!vociScadenze().length && !db.immobili.length) { avviso('Non ci sono scadenze da aggiungere.'); return; }
  condividiFile('CasaManager-scadenze.ics', 'text/calendar', costruisciIcs());
}

function esportaCopia() {
  condividiFile(`CasaManager-copia-${oggi()}.json`, 'application/json', JSON.stringify(db, null, 1));
}

function importaCopia(file) {
  const lettore = new FileReader();
  lettore.onload = () => {
    try {
      const dati = JSON.parse(lettore.result);
      if (!dati || typeof dati !== 'object' || !TABELLE.some(t => Array.isArray(dati[t]))) throw new Error('formato');
      if (!confirm('Sostituire tutti i dati attuali con quelli della copia?')) return;
      db = normalizza(dati);
      migra();
      salva();
      render();
      avviso('Copia ripristinata.');
    } catch (e) {
      avviso('Il file non è una copia valida di CasaManager.');
    }
  };
  lettore.readAsText(file);
}

/* =================== Report =================== */

const TIPI_REPORT = [['affitti', 'Affitti ricevuti'], ['affittiVersati', 'Affitti versati'], ['condomini', 'Quote condominio ricevute'],
  ['condominiVersati', 'Quote condominio versate'], ['depositi', 'Depositi cauzionali'], ['spese', 'Spese straordinarie (rate)'], ['tasse', 'Tasse'],
  ['affittuari', 'Affittuari e contratti'], ['riunioni', 'Riunioni di condominio']];

const csvCella = x => { const t = String(x == null ? '' : x); return /[;"\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const giornoCsv = d => (d ? d.split('-').reverse().join('/') : '');
const numeroCsv = n => (n == null ? '' : n.toFixed(2).replace('.', ','));
const INTESTAZIONE_REPORT = ['Tipologia', 'Data', 'Mese di competenza', 'Immobile', 'Affittuario', 'Descrizione', 'Importo (€)', 'Stato', 'Note'];

function righeReport(tipi) {
  const R = [];
  const nomeAff = id => (db.affittuari.find(x => x.id === id) || {}).nome || '';
  const aggiungi = (ordine, tipologia, data, mese, immobileId, affittuario, descrizione, importo, statoRiga, note) =>
    R.push({ ordine, data: data || '', riga: [tipologia, giornoCsv(data), mese ? fmtMese(mese) : '', nomeImmobile(immobileId), affittuario || '', descrizione || '',
      numeroCsv(importo), statoRiga || '', note || ''] });
  if (tipi.includes('affitti')) db.affitti.forEach(a => aggiungi(0, 'Affitto ricevuto', a.data, a.mese, a.immobileId, nomeAff(a.affittuarioId), '', a.importo, 'Incassato'));
  if (tipi.includes('affittiVersati')) db.affittiVersati.forEach(a => aggiungi(1, 'Affitto versato', a.data, a.mese, a.immobileId, '', '', a.importo, 'Pagato'));
  if (tipi.includes('condomini')) db.condomini.forEach(a => aggiungi(2, 'Quota condominio ricevuta', a.data, a.mese, a.immobileId, '', '', a.importo, 'Incassata'));
  if (tipi.includes('condominiVersati')) db.condominiVersati.forEach(a => aggiungi(3, 'Quota condominio versata', a.data, a.mese, a.immobileId, '', '', a.importo, 'Pagata'));
  if (tipi.includes('depositi')) {
    db.depositi.forEach(d => {
      const c = d.chiusura;
      aggiungi(4, d.tipo === 'versato' ? 'Deposito cauzionale versato' : 'Deposito cauzionale incassato', d.data, '', d.immobileId, nomeAff(d.affittuarioId), '', d.importo,
        c ? 'Chiuso' : 'Aperto', c ? `Chiuso il ${giornoCsv(c.data)}: restituito ${numeroCsv(c.restituito)}, ${d.tipo === 'incassato' ? 'trattenuto' : 'non restituito'} ${numeroCsv(c.trattenuto)}` : '');
    });
  }
  if (tipi.includes('spese')) {
    db.spese.forEach(sp => {
      const rate = speseRate(sp.id);
      rate.forEach(r => aggiungi(5, 'Spesa straordinaria', r.scadenza, '', sp.immobileId, '', sp.descrizione + (rate.length > 1 ? ` - rata ${r.numero}/${rate.length}` : ''), r.importo,
        r.pagata ? 'Pagata' : 'Da pagare', r.pagata ? `Pagata il ${giornoCsv(r.dataPagamento)}` : ''));
    });
  }
  if (tipi.includes('tasse')) db.tasse.forEach(t => aggiungi(6, 'Tassa', t.scadenza, '', t.immobileId, '', t.descrizione, t.importo, t.pagata ? 'Pagata' : 'Da pagare', t.pagata ? `Pagata il ${giornoCsv(t.dataPagamento)}` : ''));
  if (tipi.includes('affittuari')) {
    db.affittuari.forEach(a => aggiungi(7, 'Affittuario', a.inizio, '', a.immobileId, a.nome, `Contratto dal ${giornoCsv(a.inizio)} al ${giornoCsv(a.fine)}`, null,
      a.inizio > oggi() ? 'Futuro' : a.fine < oggi() ? 'Terminato' : 'In corso'));
  }
  if (tipi.includes('riunioni')) db.riunioni.forEach(r => aggiungi(8, 'Riunione di condominio', r.data.slice(0, 10), '', r.immobileId, '', 'Ore ' + r.data.slice(11, 16), null, '', r.note));
  return R.sort((a, b) => a.ordine - b.ordine || a.data.localeCompare(b.data)).map(r => r.riga);
}

function costruisciCsv(tipi) {
  const righe = [INTESTAZIONE_REPORT, ...righeReport(tipi)];
  return '﻿' + righe.map(r => r.map(csvCella).join(';')).join('\r\n') + '\r\n';
}

function apriReport() {
  const scelti = new Set(TIPI_REPORT.map(t => t[0]));
  const corpo = h('div', { class: 'vista' });
  const disegna = () => {
    const n = righeReport([...scelti]).length;
    const tutti = scelti.size === TIPI_REPORT.length;
    corpo.replaceChildren(
      h('div', { class: 'gruppo' }, TIPI_REPORT.map(([k, t]) => h('label', { class: 'riga-sel' }, h('span', {}, t),
        h('input', { type: 'checkbox', class: 'interruttore', role: 'switch', checked: scelti.has(k), onchange: e => { if (e.target.checked) scelti.add(k); else scelti.delete(k); disegna(); } })))),
      h('button', { class: 'link', onclick: () => { if (tutti) scelti.clear(); else TIPI_REPORT.forEach(t => scelti.add(t[0])); disegna(); } }, tutti ? 'Deseleziona tutto' : 'Seleziona tutto'),
      h('p', { class: 'nota' }, n === 1 ? '1 riga nel report' : `${n} righe nel report`),
      h('button', { class: 'btn primario pieno', disabled: n === 0, onclick: () => condividiFile(`CasaManager-report-${oggi()}.csv`, 'text/csv', costruisciCsv([...scelti])) }, 'Crea il report (file CSV)'),
      h('p', { class: 'nota' }, 'Il file si apre con Numbers, Excel o Fogli Google, e contiene tutte le registrazioni delle tipologie scelte, in ordine di tipologia e di data.'));
  };
  apriFoglio('Report dei dati', corpo, { sinistra: 'Chiudi' });
  disegna();
}

/* =================== Viste =================== */

function rigaScadenza(v) {
  const g = giorniTra(oggi(), v.data);
  const ritardo = g < 0;
  const lettura = v.tipo === 'lettura';
  let rel;
  if (g === 0) rel = 'oggi';
  else if (g === 1) rel = 'domani';
  else if (g > 1) rel = `tra ${g} giorni`;
  else if (g === -1) rel = lettura ? 'in ritardo di 1 giorno' : 'scaduta ieri';
  else rel = lettura ? `in ritardo di ${-g} giorni` : `scaduta da ${-g} giorni`;
  const apri = () => {
    if (v.tipo === 'lettura') moduloLettura(db.letture.find(x => x.id === v.id));
    else if (v.tipo === 'tassa') moduloTassa(db.tasse.find(x => x.id === v.id));
    else dettaglioSpesa(v.spesaId);
  };
  return h('div', { class: 'riga' },
    h('button', { class: 'riga-main', onclick: apri },
      h('span', { class: 'ico' }, v.icona),
      h('div', { class: 'testi' }, h('div', { class: 't1' }, v.titolo), v.immobile && h('div', { class: 't2' }, v.immobile),
        h('div', { class: 't3' + (ritardo ? ' rosso' : '') }, `${fmtGiorno(v.data)} · ${rel}`)),
      v.importo != null && h('div', { class: 'importo' }, eur(v.importo))),
    h('button', { class: 'chip', onclick: () => completa(v) }, lettura ? v.fatto : 'Pagata'));
}

function registraRitardo(r) {
  if (r.tipo === 'affitto') moduloAffitto(null, { immobileId: r.immobileId, affittuarioId: r.affittuarioId, mese: r.mese,
    importo: ultimoImporto('affitti', x => x.affittuarioId === r.affittuarioId) });
  else if (r.tipo === 'condominio') moduloCondominio(null, { immobileId: r.immobileId, mese: r.mese,
    importo: ultimoImporto('condomini', x => x.immobileId === r.immobileId) });
  else {
    const q = db.condomini.find(x => x.id === r.quotaId);
    moduloVersamento('condominio', null, { immobileId: r.immobileId, mese: r.mese, importo: q ? testoImporto(q.importo) : '' });
  }
}

function apriRitardi() {
  const elenco = ritardi();
  const corpo = h('div', { class: 'vista' });
  let fg;
  [['affitto', 'Affitti non ricevuti'], ['condominio', 'Quote condominio non ricevute'], ['nonVersata', 'Quote condominio ricevute e non versate']].forEach(([k, titolo]) => {
    const e = elenco.filter(r => r.tipo === k);
    if (!e.length) return;
    corpo.append(h('div', { class: 'sezione' }, h('h2', {}, titolo), h('div', { class: 'gruppo' }, e.map(r =>
      h('div', { class: 'riga' },
        h('div', { class: 'riga-main' }, h('div', { class: 'testi' }, h('div', { class: 't1' }, r.titolo), h('div', { class: 't2' }, r.dettaglio))),
        h('button', { class: 'chip', onclick: () => { fg.chiudi(); registraRitardo(r); } }, 'Registra'))))));
  });
  if (!elenco.length) corpo.append(vuotoMsg('Nessun ritardo', 'Affitti e quote condominio dei mesi precedenti risultano regolari.'));
  corpo.append(h('p', { class: 'nota' }, 'Il controllo riguarda i mesi precedenti a quello in corso. Per ogni affittuario puoi attivarlo o disattivarlo e scegliere da quale mese partire (Immobili > immobile > affittuario).'));
  fg = apriFoglio('Controllo ritardi', corpo, { sinistra: 'Chiudi' });
}

/* A inizio mese (alla prima apertura di ogni mese) mostra i ritardi, se ce ne sono. */
function controlloMensile() {
  const mese = meseCorrente();
  let ultimo = null;
  try { ultimo = localStorage.getItem('casamanager.controllo'); } catch (e) { /* archivio non disponibile */ }
  if (ultimo === mese) return;
  try { localStorage.setItem('casamanager.controllo', mese); } catch (e) { /* ignora */ }
  if (db.immobili.length && ritardi().length) apriRitardi();
}

function vistaScadenze() {
  const nodo = h('div', { class: 'vista' });
  const azioni = db.immobili.length ? [h('button', { 'aria-label': 'Nuovo promemoria', onclick: () => moduloLettura() }, '＋')] : [];
  const voci = vociScadenze();
  if (!db.immobili.length) {
    nodo.append(vuotoMsg('Nessun immobile', 'Aggiungi il tuo primo immobile nella sezione Immobili.', ['Vai a Immobili', () => { stato.scheda = 'immobili'; render(); }]));
    return { titolo: 'Scadenze', azioni, nodo };
  }
  const n = ritardi().length;
  if (n) {
    nodo.append(h('button', { class: 'allerta', onclick: apriRitardi }, h('span', { class: 'ico' }, '⚠️'),
      h('div', { class: 'testi' }, h('div', { class: 't1' }, n === 1 ? '1 ritardo da controllare' : `${n} ritardi da controllare`),
        h('div', { class: 't2' }, 'Affitti e quote condominio dei mesi precedenti')), h('span', { class: 'grigio' }, '›')));
  }
  if (!voci.length) {
    nodo.append(vuotoMsg('Nessuna scadenza', 'Tocca ＋ per aggiungere un promemoria (lettura gas o acqua, pagamento affitto). Le scadenze di tasse e rate compaiono qui automaticamente.'));
  } else {
    const t = oggi(), limite = aggiungiGiorni(t, 30);
    [['Scadute', voci.filter(v => v.data < t)], ['Prossimi 30 giorni', voci.filter(v => v.data >= t && v.data <= limite)], ['Più avanti', voci.filter(v => v.data > limite)]]
      .forEach(([titolo, elenco]) => {
        if (elenco.length) nodo.append(h('div', { class: 'sezione' }, h('h2', {}, titolo), h('div', { class: 'gruppo' }, elenco.map(rigaScadenza))));
      });
  }
  nodo.append(h('button', { class: 'btn secondario pieno', onclick: esportaCalendario }, '📅 Aggiungi gli avvisi al Calendario'),
    h('p', { class: 'nota' }, 'Crea gli eventi nel Calendario dell\'iPhone, con avviso 3 giorni prima e il giorno stesso alle 9:00, e un promemoria il 1° di ogni mese per controllare i ritardi. Rifallo dopo aver aggiunto nuove scadenze: non si creano duplicati.'));
  return { titolo: 'Scadenze', azioni, nodo };
}

function apriVoceRegistro(v) {
  if (v.k === 'affitto') moduloAffitto(db.affitti.find(x => x.id === v.id));
  else if (v.k === 'condominio') moduloCondominio(db.condomini.find(x => x.id === v.id));
  else if (v.k === 'affittoVersato') moduloVersamento('affitto', db.affittiVersati.find(x => x.id === v.id));
  else if (v.k === 'condominioVersato') moduloVersamento('condominio', db.condominiVersati.find(x => x.id === v.id));
  else if (v.k === 'deposito') { const d = db.depositi.find(x => x.id === v.id); moduloDeposito(d.tipo, d); }
  else if (v.k === 'spesa') dettaglioSpesa(v.id);
  else moduloTassa(db.tasse.find(x => x.id === v.id));
}

function rigaRegistro(v) {
  return h('div', { class: 'riga' },
    h('button', { class: 'riga-main', onclick: () => apriVoceRegistro(v) },
      h('span', { class: 'ico' }, v.icona),
      h('div', { class: 'testi' }, h('div', { class: 't1' }, v.titolo), v.dettaglio && h('div', { class: 't2' }, v.dettaglio),
        v.stato && h('span', { class: 'etichetta ' + v.stato[1] }, v.stato[0])),
      h('div', { class: 'destra' }, h('div', { class: 'importo ' + ({ entrata: 'entrata', uscita: 'uscita' }[v.gruppo] || 'blu') }, (v.gruppo === 'deposito' ? '' : v.entrata ? '+ ' : '− ') + eur(v.importo)),
        h('div', { class: 't3' }, fmtGiorno(v.data)))));
}

function vistaRegistro() {
  const nodo = h('div', { class: 'vista' });
  const azioni = db.immobili.length ? [h('button', { 'aria-label': 'Aggiungi', onclick: menuRegistra }, '＋')] : [];
  if (!db.immobili.length) {
    nodo.append(vuotoMsg('Nessun immobile', 'Aggiungi il tuo primo immobile nella sezione Immobili.', ['Vai a Immobili', () => { stato.scheda = 'immobili'; render(); }]));
    return { titolo: 'Registro', azioni, nodo };
  }
  const tutte = vociRegistro();
  const lista = h('div', { class: 'vista' });
  const disegnaLista = () => {
    const parole = semplifica(stato.ricerca).split(/\s+/).filter(Boolean);
    const flusso = v => ({ entrata: 'entrate', uscita: 'uscite', condominio: 'condominio', deposito: 'depositi' }[v.gruppo]);
    const voci = tutte.filter(v => (stato.filtro === 'tutti' || stato.filtro === flusso(v))
      && (!parole.length || parole.every(p => testoRicerca(v).includes(p))));
    if (!tutte.length) { lista.replaceChildren(vuotoMsg('Registro vuoto', 'Tocca ＋ per registrare affitti, quote condominio, spese straordinarie o tasse.')); return; }
    if (!voci.length) { lista.replaceChildren(vuotoMsg('Nessun risultato', 'Prova con altre parole.')); return; }
    const perMese = {};
    voci.forEach(v => { (perMese[v.data.slice(0, 7)] = perMese[v.data.slice(0, 7)] || []).push(v); });
    lista.replaceChildren(...Object.keys(perMese).sort().reverse().map(m =>
      h('div', { class: 'sezione' }, h('h2', {}, fmtMese(m)),
        h('div', { class: 'gruppo' }, perMese[m].sort((a, b) => b.data.localeCompare(a.data)).map(rigaRegistro)))));
  };
  const filtri = h('div', { class: 'segmenti' }, [['tutti', 'Tutti'], ['entrate', 'Entrate'], ['uscite', 'Uscite'], ['condominio', 'Condominio'], ['depositi', 'Depositi']].map(([k, t]) =>
    h('button', { class: stato.filtro === k ? 'attivo' : '', onclick: e => {
      stato.filtro = k; filtri.querySelectorAll('button').forEach(b => b.classList.toggle('attivo', b === e.currentTarget)); disegnaLista();
    } }, t)));
  const cerca = h('input', { class: 'cerca', type: 'search', placeholder: 'Cerca spese ed entrate', value: stato.ricerca, autocomplete: 'off',
    oninput: e => { stato.ricerca = e.target.value; disegnaLista(); } });
  nodo.append(filtri, cerca, lista);
  disegnaLista();
  return { titolo: 'Registro', azioni, nodo };
}

function menuRegistra() {
  const scelte = [['🏠', 'Affitto ricevuto', () => moduloAffitto()], ['🏢', 'Quota condominio ricevuta', () => moduloCondominio()],
    ['🏠', 'Affitto versato', () => moduloVersamento('affitto')], ['🏢', 'Quota condominio versata', () => moduloVersamento('condominio')],
    ['🔑', 'Deposito cauzionale versato', () => moduloDeposito('versato')], ['🔑', 'Deposito cauzionale incassato', () => moduloDeposito('incassato')],
    ['🔨', 'Spesa straordinaria', moduloSpesa], ['🏛️', 'Tassa', () => moduloTassa()]];
  const corpo = h('div', { class: 'gruppo' }, scelte.map(([i, t, f]) =>
    h('button', { class: 'scelta-voce', onclick: () => { velo.chiudi(); f(); } }, h('span', {}, i), t)));
  const velo = apriFoglio('Registra', corpo, { sinistra: 'Chiudi' });
}

const CATEGORIE = { affitti: 'Affitti ricevuti', cauzioneTrattenuta: 'Cauzioni trattenute', affittoVersato: 'Affitto versato',
  cauzioneNonRestituita: 'Cauzioni non restituite', spese: 'Spese straordinarie', tasse: 'Tasse',
  condominio: 'Quote condominio ricevute', condominioVersato: 'Quote condominio versate' };
const CAT_ENTRATE = ['affitti', 'cauzioneTrattenuta'];
const CAT_USCITE = ['affittoVersato', 'cauzioneNonRestituita', 'spese', 'tasse'];

function grafico(punti) {
  const W = 360, H = 170, base = H - 6, alto = 14;
  const max = Math.max(1, ...punti.flatMap(p => [p.e, p.u]));
  const slot = W / 12, largh = slot * 0.34;
  const iniz = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];
  const barre = [];
  punti.forEach((p, i) => {
    const x = i * slot + slot * 0.14;
    [[p.e, 'var(--verde)', 0], [p.u, 'var(--rosso)', 1]].forEach(([val, col, k]) => {
      const alt = (val / max) * (base - alto);
      if (val > 0) barre.push(svg('rect', { x: x + k * (largh + 1), y: base - alt, width: largh, height: Math.max(alt, 1), rx: 2, fill: col },
        svg('title', {}, `${iniz[i]}: ${eur(val)}`)));
    });
    barre.push(svg('text', { x: i * slot + slot / 2, y: H + 12, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--sub)' }, iniz[i]));
  });
  return svg('svg', { viewBox: `0 0 ${W} ${H + 18}`, role: 'img', 'aria-label': 'Entrate e uscite per mese' },
    svg('line', { x1: 0, x2: W, y1: base, y2: base, stroke: 'var(--linea)' }),
    svg('text', { x: 0, y: 10, 'font-size': 10, fill: 'var(--sub)' }, eur(max)), ...barre);
}

/* Immobili scelti nel bilancio: elenco vuoto = tutti. */
function immobiliSelezionati() {
  const validi = stato.immBilancio.filter(id => immobile(id));
  return validi.length && validi.length < db.immobili.length ? validi : [];
}

function testoSelezione() {
  const sel = immobiliSelezionati();
  if (!sel.length) return 'Tutti gli immobili';
  return sel.length === 1 ? nomeImmobile(sel[0]) : `${sel.length} immobili selezionati`;
}

function apriSelezioneImmobili() {
  const corpo = h('div', { class: 'vista' });
  const disegna = () => {
    const sel = immobiliSelezionati();
    const tutti = sel.length === 0;
    corpo.replaceChildren(
      h('div', { class: 'gruppo' },
        h('button', { class: 'riga-sel tutti', onclick: () => { stato.immBilancio = []; disegna(); } },
          h('span', {}, 'Tutti gli immobili'), h('span', { class: 'spunta' }, tutti ? '✓' : '')),
        opzImmobili().map(o => h('label', { class: 'riga-sel' }, h('span', {}, o.l),
          h('input', { type: 'checkbox', class: 'interruttore', role: 'switch', checked: tutti || sel.includes(o.v), onchange: e => {
            const corrente = tutti ? opzImmobili().map(x => x.v) : sel.slice();
            const nuovo = e.target.checked ? [...new Set([...corrente, o.v])] : corrente.filter(x => x !== o.v);
            if (!nuovo.length) avviso('Seleziona almeno un immobile.');
            else stato.immBilancio = nuovo.length === db.immobili.length ? [] : nuovo;
            disegna();
          } })))),
      h('p', { class: 'nota' }, 'Puoi scegliere uno, più immobili o tutti: il bilancio mostra la somma di quelli selezionati.'));
  };
  apriFoglio('Immobili del bilancio', corpo, { sinistra: 'Fine' });
  disegna();
}

function vistaBilancio() {
  const sel = immobiliSelezionati();
  const inSel = id => !sel.length || sel.includes(id);
  const tutti = movimentiEffettivi();
  const anni = new Set([new Date().getFullYear(), stato.anno]);
  tutti.forEach(m => anni.add(Number(m.data.slice(0, 4))));
  const mov = tutti.filter(m => Number(m.data.slice(0, 4)) === stato.anno && inSel(m.immobileId));
  const somma = cat => mov.filter(m => m.cat === cat).reduce((t, m) => t + m.importo, 0);
  const entrate = CAT_ENTRATE.reduce((t, c) => t + somma(c), 0);
  const uscite = CAT_USCITE.reduce((t, c) => t + somma(c), 0);
  const saldo = entrate - uscite;
  const punti = Array.from({ length: 12 }, (_, i) => {
    const delMese = mov.filter(m => Number(m.data.slice(5, 7)) === i + 1);
    return { e: delMese.filter(m => CAT_ENTRATE.includes(m.cat)).reduce((t, m) => t + m.importo, 0),
      u: delMese.filter(m => CAT_USCITE.includes(m.cat)).reduce((t, m) => t + m.importo, 0) };
  });
  // Depositi cauzionali: tracciati a parte, non fanno parte di entrate, costi e saldo.
  const depositi = db.depositi.filter(d => !d.chiusura && inSel(d.immobileId));
  const condRicevute = somma('condominio'), condVersate = somma('condominioVersato');
  const haCondominio = mov.some(m => m.cat === 'condominio' || m.cat === 'condominioVersato');
  const sommaDep = tipo => depositi.filter(d => d.tipo === tipo).reduce((t, d) => t + d.importo, 0);

  const selAnno = h('select', { 'aria-label': 'Anno', onchange: e => { stato.anno = Number(e.target.value); render(); } },
    [...anni].sort((a, b) => b - a).map(a => h('option', { value: a }, a)));
  selAnno.value = stato.anno;
  const selettore = h('button', { class: 'selettore', 'aria-label': 'Immobili', onclick: apriSelezioneImmobili },
    h('span', {}, testoSelezione()), h('span', { class: 'grigio' }, '›'));

  const righe = cats => h('div', { class: 'gruppo' }, cats.map(c => h('div', { class: 'voce-tot' }, h('span', {}, CATEGORIE[c]), h('span', {}, eur(somma(c))))));

  const nodo = h('div', { class: 'vista' },
    h('div', { class: 'scelte' }, selAnno, selettore),
    h('div', { class: 'totali' },
      h('div', { class: 'totale' }, h('small', {}, 'Entrate ricevute'), h('strong', { class: 'entrata' }, eur(entrate))),
      h('div', { class: 'totale' }, h('small', {}, 'Costi sostenuti'), h('strong', { class: 'uscita' }, eur(uscite))),
      h('div', { class: 'totale saldo' }, h('small', {}, 'Saldo ' + stato.anno), h('strong', { class: saldo >= 0 ? 'entrata' : 'uscita' }, eur(saldo)))),
    mov.length ? h('div', { class: 'sezione' }, h('h2', {}, 'Andamento mensile'),
      h('div', { class: 'grafico' }, grafico(punti),
        h('div', { class: 'leg' }, h('span', {}, h('i', { style: 'background:var(--verde)' }), 'Entrate'), h('span', {}, h('i', { style: 'background:var(--rosso)' }), 'Uscite')))) : null,
    h('div', { class: 'sezione' }, h('h2', {}, 'Entrate per categoria'), righe(CAT_ENTRATE)),
    h('div', { class: 'sezione' }, h('h2', {}, 'Costi per categoria'), righe(CAT_USCITE)),
    haCondominio ? h('div', { class: 'sezione' }, h('h2', {}, 'Quote condominio (non incluse in entrate e costi)'),
      h('div', { class: 'gruppo' },
        h('div', { class: 'voce-tot' }, h('span', {}, 'Ricevute'), h('span', { class: 'blu' }, eur(condRicevute))),
        h('div', { class: 'voce-tot' }, h('span', {}, 'Versate'), h('span', { class: 'blu' }, eur(condVersate))),
        h('div', { class: 'voce-tot' }, h('strong', {}, 'Differenza (ricevute − versate)'), h('strong', { class: 'blu' }, eur(condRicevute - condVersate))))) : null,
    depositi.length ? h('div', { class: 'sezione' }, h('h2', {}, 'Depositi cauzionali aperti (non inclusi nei totali)'),
      h('div', { class: 'gruppo' },
        h('div', { class: 'voce-tot' }, h('span', {}, 'Versati (da riavere)'), h('span', { class: 'blu' }, eur(sommaDep('versato')))),
        h('div', { class: 'voce-tot' }, h('span', {}, 'Incassati (da restituire)'), h('span', { class: 'blu' }, eur(sommaDep('incassato'))))),
      h('p', { class: 'nota' }, 'Depositi non ancora chiusi, di qualsiasi anno. Non sono né entrate né costi: alla chiusura la parte trattenuta diventa entrata (incassato) o costo (versato).')) : null,
    h('p', { class: 'nota' }, 'Spese e tasse contano come costo solo quando sono segnate "Pagata" (rata per rata). Affitti contano alla data di incasso/pagamento. Le quote condominio e i depositi cauzionali sono sempre a parte.'));
  return { titolo: 'Bilancio', azioni: [h('button', { class: 'testo', onclick: apriReport }, 'Report')], nodo };
}

function vistaImmobili() {
  if (stato.dettaglio && immobile(stato.dettaglio)) return vistaDettaglioImmobile(immobile(stato.dettaglio));
  stato.dettaglio = null;
  const nodo = h('div', { class: 'vista' });
  if (!db.immobili.length) {
    nodo.append(vuotoMsg('Nessun immobile', 'Tocca ＋ per aggiungere il tuo primo immobile.'));
  } else {
    nodo.append(h('div', { class: 'gruppo' }, db.immobili.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'it')).map(i =>
      h('div', { class: 'riga' }, h('button', { class: 'riga-main', onclick: () => { stato.dettaglio = i.id; render(); } },
        h('span', { class: 'ico' }, '🏘️'),
        h('div', { class: 'testi' }, h('div', { class: 't1' }, i.nome), i.indirizzo && h('div', { class: 't2' }, i.indirizzo)))))));
  }
  nodo.append(h('div', { class: 'sezione' }, h('h2', {}, 'Causali delle tasse'),
    h('div', { class: 'gruppo' },
      causaliOrdinate().map(c => h('div', { class: 'riga' }, h('button', { class: 'riga-main', onclick: () => moduloCausale(c) },
        h('div', { class: 'testi' }, h('div', { class: 't1' }, c.testo))))),
      h('button', { class: 'link', onclick: () => moduloCausale() }, '＋ Aggiungi causale')),
    h('p', { class: 'nota' }, 'Nel modulo della tassa scegli la causale e aggiungi solo l\'anno: es. "Prima rata IMU" + 2026 = "Prima rata IMU 2026".')));
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: e => { if (e.target.files[0]) importaCopia(e.target.files[0]); e.target.value = ''; } });
  nodo.append(h('div', { class: 'sezione' }, h('h2', {}, 'Copia dei dati'),
    h('div', { class: 'gruppo' },
      h('button', { class: 'link', onclick: esportaCopia }, 'Salva una copia dei dati'),
      h('button', { class: 'link', onclick: () => file.click() }, 'Ripristina da una copia'))),
    h('p', { class: 'nota' }, 'I dati sono salvati solo su questo dispositivo. Salva una copia ogni tanto (es. nell\'app File o su iCloud Drive) per non perderli.'), file);
  return { titolo: 'Immobili', azioni: [h('button', { 'aria-label': 'Nuovo immobile', onclick: () => moduloImmobile() }, '＋')], nodo };
}

function vistaDettaglioImmobile(imm) {
  const oggiS = oggi();
  const affittuari = db.affittuari.filter(a => a.immobileId === imm.id).sort((a, b) => b.inizio.localeCompare(a.inizio));
  const riunioni = db.riunioni.filter(r => r.immobileId === imm.id).sort((a, b) => b.data.localeCompare(a.data));
  const nodo = h('div', { class: 'vista' },
    imm.indirizzo && h('div', { class: 'gruppo' }, h('div', { class: 'voce-tot' }, h('span', {}, '📍 ' + imm.indirizzo))),
    h('div', { class: 'sezione' }, h('h2', {}, 'Affittuari'), h('div', { class: 'gruppo' },
      affittuari.map(a => {
        const st = a.inizio > oggiS ? ['Futuro', 'blu'] : a.fine < oggiS ? ['Terminato', 'grigio'] : ['In corso', 'verde'];
        return h('div', { class: 'riga' }, h('button', { class: 'riga-main', onclick: () => moduloAffittuario(imm, a) },
          h('div', { class: 'testi' }, h('div', { class: 't1' }, a.nome), h('div', { class: 't2' }, `dal ${fmtGiorno(a.inizio)} al ${fmtGiorno(a.fine)}`)),
          h('span', { class: 'etichetta ' + st[1] }, st[0])));
      }),
      h('button', { class: 'link', onclick: () => moduloAffittuario(imm) }, '＋ Aggiungi affittuario'))),
    h('div', { class: 'sezione' }, h('h2', {}, 'Riunioni di condominio'), h('div', { class: 'gruppo' },
      riunioni.map(r => h('div', { class: 'riga' }, h('button', { class: 'riga-main', onclick: () => moduloRiunione(imm, r) },
        h('div', { class: 'testi' }, h('div', { class: 't1' }, fmtGiornoOra(r.data)),
          r.note && h('div', { class: 't2', style: 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, r.note))))),
      h('button', { class: 'link', onclick: () => moduloRiunione(imm) }, '＋ Aggiungi riunione'))),
    h('button', { class: 'btn pericolo pieno', onclick: () => {
      if (confirm(`Eliminare l'immobile "${imm.nome}" e tutti i dati collegati (affittuari, incassi, spese, tasse, riunioni, promemoria)?`)) {
        eliminaImmobile(imm.id); stato.dettaglio = null; render();
      }
    } }, 'Elimina immobile'));
  return { titolo: imm.nome, azioni: [h('button', { class: 'testo', onclick: () => moduloImmobile(imm) }, 'Modifica')], nodo, indietro: true };
}

/* =================== Struttura generale =================== */

const SCHEDE = [['scadenze', 'Scadenze', '🗓️'], ['registro', 'Registro', '📒'], ['bilancio', 'Bilancio', '📊'], ['immobili', 'Immobili', '🏘️']];

function render() {
  const app = $('#app');
  const vecchio = $('main', app);
  const scorri = vecchio ? vecchio.scrollTop : 0;
  const vista = { scadenze: vistaScadenze, registro: vistaRegistro, bilancio: vistaBilancio, immobili: vistaImmobili }[stato.scheda]();
  app.replaceChildren(
    h('header', { class: 'top' },
      vista.indietro && h('button', { class: 'testo', 'aria-label': 'Indietro', onclick: () => { stato.dettaglio = null; render(); } }, '‹ Immobili'),
      h('h1', {}, vista.indietro ? '' : vista.titolo), h('div', { class: 'azioni' }, vista.azioni)),
    h('main', {}, vista.nodo),
    h('nav', { class: 'schede' }, SCHEDE.map(([k, t, i]) =>
      h('button', { class: stato.scheda === k ? 'attivo' : '', 'aria-current': stato.scheda === k ? 'page' : null,
        onclick: () => { stato.scheda = k; if (k !== 'immobili') stato.dettaglio = null; render(); } }, h('span', {}, i), t))));
  if (vista.indietro) $('h1', app).textContent = vista.titolo;
  $('main', app).scrollTop = scorri;
}

/* Prima apertura con questa versione: il controllo ritardi parte dal mese corrente, senza segnalare gli arretrati. */
function migra() {
  let cambiato = false;
  if (!db.controlloDal) { db.controlloDal = meseCorrente(); cambiato = true; }
  db.affittuari.forEach(a => {
    if (!a.controlloDal) {
      a.controlloDal = [a.inizio.slice(0, 7), meseCorrente()].sort().pop();
      a.controlloAffitto = true; a.controlloCondominio = true; cambiato = true;
    }
  });
  if (cambiato) salva();
}

migra();
render();
controlloMensile();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* funziona comunque, ma non offline */ });
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
