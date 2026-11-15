/*
 * Aule libere UdA — bookmarklet per unich.prod.up.cineca.it (University Planner Cineca)
 * Legge gli impegni pubblici dell'Ateneo e mostra quali aule di un edificio sono libere
 * in un dato momento e fino a quando.
 *
 * Uso: apri una qualsiasi pagina di https://unich.prod.up.cineca.it (es. l'orario del tuo corso)
 * e clicca il segnalibro. Funziona solo lì perché l'API non accetta richieste da altri siti.
 */
(async () => {
  const HOST = 'unich.prod.up.cineca.it';
  const CLIENTE = '5a65a9ebd9fe4f6d0ccf9df6';
  const BASE = 'https://unich.prod.up.cineca.it';
  const API = BASE + '/api/Impegni/getImpegniPublic';
  const SOGLIA_SPLIT = 150;     // limite massimo di risultati per richiesta imposto dal server
  const LINK_DEFAULT = '5e71ea91e897450019127e0b'; // un calendario pubblico qualsiasi, serve solo come chiave d'accesso
  const LS_KEY = 'auleLibereUdA.v3';
  // Aule preferite (con prese per il PC): compaiono per prime, con un'etichetta. Modifica qui per cambiarle.
  const PREFERITE = new Set([
    'PE_PIN_28DIS', 'PE_PIN_34DIS', 'PE_PIN_38DIS', 'PE_PIN_39DIS',            // viale Pindaro: aule Disegno
    'PE_MIC_1', 'PE_MIC_2', 'PE_MIC_3', 'PE_MIC_4', 'PE_MIC_5', 'PE_MIC_6',  // Polo Micara: M1–M6
    'PE_MIC_A', 'PE_MIC_B', 'PE_MIC_C', 'PE_MIC_D'                           // Polo Micara: Lab. A–D
  ]);
  const preferita = a => PREFERITE.has(a.codice);
  const COMBO = 'PE_PIN+PE_MIC';

  document.getElementById('aule-libere-panel')?.remove();

  // ---------- utilità ----------
  const pad = n => String(n).padStart(2, '0');
  const hhmm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const durata = ms => { const m = Math.round(ms / 60000); return m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + pad(m % 60) : '') : m + ' min'; };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { } }
  };

  function slim(i) {
    const dd = i.evento && i.evento.dettagliDidattici && i.evento.dettagliDidattici[0];
    return {
      id: i.id,
      s: new Date(i.dataInizio).getTime(),
      e: new Date(i.dataFine).getTime(),
      nome: (dd && dd.nome) || (i.evento && (i.evento.nome || i.evento.descrizione)) ||
            (i.indisponibilita ? 'Aula non disponibile' : 'Impegno'),
      aule: (i.aule || []).map(a => ({
        id: a.id, codice: a.codice, desc: a.descrizione,
        edId: a.edificioId || (a.edificio && a.edificio.id),
        edCod: a.edificio && a.edificio.codice, edDesc: a.edificio && a.edificio.descrizione
      }))
    };
  }

  async function finestra(a, b, depth = 0) {
    const q = new URLSearchParams({ clienteId: CLIENTE, dataInizio: new Date(a).toISOString(), dataFine: new Date(b).toISOString() });
    const r = await fetch(API + '?' + q, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('Il server ha risposto ' + r.status);
    const d = await r.json();
    if (!Array.isArray(d)) throw new Error('Risposta inattesa dal server');
    if (d.length >= SOGLIA_SPLIT && b - a > 15 * 60e3 && depth < 7) {
      const m = Math.round((a + b) / 2);
      const [x, y] = await Promise.all([finestra(a, m, depth + 1), finestra(m, b, depth + 1)]);
      return x.concat(y);
    }
    return d.map(slim);
  }

  // Il server restituisce al massimo 150 impegni per richiesta: interrogo un'ora alla volta
  // (in parallelo, 5 per volta) e divido ancora solo le fasce che toccano il limite.
  async function giorno(d) {
    const base = dayStart(d).getTime();
    const fasce = [];
    for (let h = 7; h < 21; h++) fasce.push([base + h * 3600e3, base + (h + 1) * 3600e3]);
    const visti = new Map();
    for (let i = 0; i < fasce.length; i += 5) {
      const blocchi = await Promise.all(fasce.slice(i, i + 5).map(([a, b]) => finestra(a, b)));
      for (const x of blocchi.flat()) visti.set(x.id, x);
    }
    return [...visti.values()];
  }

  // ---------- UI ----------
  const panel = document.createElement('div');
  panel.id = 'aule-libere-panel';
  panel.innerHTML = `
  <style>
    #aule-libere-panel{position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);max-width:640px;margin:0 auto;
      background:var(--bg);color:var(--tx);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      display:flex;flex-direction:column;overflow:hidden;text-align:left}
    #al-now{color:var(--ac);font-weight:700;font-size:18px!important;width:36px!important;height:36px!important;background:var(--free)!important}
    #aule-libere-panel{--bg:#fff4e6;--sf:#fffaf3;--tx:#1d1d1f;--mu:#7a6a5c;--ac:#e8590c;--on:#fff;--bd:#f0c9a3;--line:#f5dcc2;
      --free:#ffe3c7;--occ:#f6ebdf;--track:#fbd3ad;--busy:#b8551a;color-scheme:light}
    @media (prefers-color-scheme:dark){#aule-libere-panel{--bg:#17120e;--sf:#231b15;--tx:#f7ede3;--mu:#b8a696;--ac:#ff8f45;--on:#1d1d1f;--bd:#4a3829;--line:#33271d;
      --free:#3b2513;--occ:#221a14;--track:#57381f;--busy:#ffb37d;color-scheme:dark}}
    #aule-libere-panel *{box-sizing:border-box}
    #al-head{padding:14px 16px 10px;border-bottom:1px solid var(--line)}
    #al-head h2{margin:0 0 8px;font-size:17px;display:flex;justify-content:space-between;align-items:center}
    #al-head button.x{border:0;background:var(--occ);border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:16px}
    #al-ctrl{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    #al-ctrl label{font-size:12px;color:var(--mu);display:flex;flex-direction:column;gap:3px}
    #al-ctrl select,#al-ctrl input{font:16px/1.3 system-ui,-apple-system,sans-serif;padding:9px 10px;-webkit-appearance:none;appearance:none;min-height:42px;border:1px solid var(--bd);border-radius:10px;background:var(--sf);color:var(--tx)}
    #al-ctrl select:focus,#al-ctrl input:focus{outline:2px solid var(--ac);outline-offset:1px}
    #al-ctrl .full{grid-column:1/-1}
    #al-body{overflow:auto;padding:10px 16px 16px;flex:1}
    #al-status{font-size:12px;color:var(--mu);margin:6px 0}
    .al-sec{margin:14px 0 6px;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ac)}
    .al-room{padding:10px 12px;border-radius:12px;margin:8px 0;background:var(--occ)}
    .al-room.free{background:var(--free);box-shadow:inset 4px 0 0 var(--ac)}
    .al-room .t{display:flex;justify-content:space-between;gap:8px;font-weight:600}
    .al-room .t>span:last-child{white-space:nowrap;flex-shrink:0;font-size:14px}
    .al-room .s{font-size:12px;color:var(--mu)}
    .al-room small.i{font-weight:400;color:var(--mu)}
    .al-room small.p{font-weight:600;color:var(--on);background:var(--ac);border-radius:6px;padding:1px 6px;white-space:nowrap}
    .al-bar{position:relative;height:8px;background:var(--track);border-radius:4px;margin-top:6px;overflow:hidden}
    .al-bar i{position:absolute;top:0;bottom:0;background:var(--busy)}
    .al-bar b{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--tx)}
    .al-closed{text-align:center;padding:36px 20px;margin:12px 0;border-radius:14px;background:var(--free)}
    .al-closed .ic{font-size:40px;line-height:1}
    .al-closed h3{margin:10px 0 6px;font-size:22px;color:var(--tx)}
    .al-closed p{margin:4px 0;color:var(--tx)}
    .al-closed .n{font-size:13px;color:var(--mu);margin-top:10px}
    .al-ticks{display:flex;justify-content:space-between;font-size:10px;color:var(--mu);margin-top:2px}
  </style>
  <div id="al-head">
    <h2>Aule libere — UdA <button class="x" title="Aggiorna" id="al-now">↻</button></h2>
    <div id="al-ctrl">
      <label class="full">Edificio<select id="al-ed"><option>caricamento…</option></select></label>
      <label>Giorno<input type="date" id="al-day"></label>
      <label>Ora<input type="time" id="al-time" step="900"></label>
      <label class="full">Libera per almeno
        <select id="al-min"><option value="0">qualsiasi durata</option><option value="30">30 min</option>
        <option value="60" selected>1 ora</option><option value="120">2 ore</option><option value="180">3 ore</option></select></label>
    </div>
  </div>
  <div id="al-body"><div id="al-status">Avvio…</div><div id="al-out"></div></div>`;
  document.body.appendChild(panel);
  const $ = s => panel.querySelector(s);
  $('#al-now').onclick = () => { const n = new Date(); $('#al-day').value = isoDay(n); $('#al-time').value = hhmm(n); run(); };
  const status = t => { $('#al-status').textContent = t; };

  const now = new Date();
  $('#al-day').value = isoDay(now);
  $('#al-time').value = hhmm(now);

  // ---------- dati ----------
  const cache = new Map(); // isoDay -> impegni
  async function getGiorno(d) {
    const k = isoDay(d);
    if (!cache.has(k)) cache.set(k, giorno(d));
    return cache.get(k);
  }

  // Elenco completo delle aule dell'Ateneo (anagrafica di University Planner), salvato per 7 giorni.
  // Le aule che non hanno lezioni nel giorno scelto risultano quindi libere tutto il giorno.
  const ESCLUDI_EDIFICI = /PAR|TRIB|ONLINE/i;
  const ESCLUDI_AULE = /parcheggio|studio docent|\(stanza\)/i;
  async function elencoAule() {
    const st = store.get();
    if (st.elenco && Date.now() - st.elencoData < 7 * 86400e3) return st.elenco;
    status('Scarico l\'elenco delle aule…');
    const linkPagina = (location.href.match(/linkCalendarioId=([0-9a-f]{24})/) || [])[1];
    for (const link of [...new Set([linkPagina, LINK_DEFAULT].filter(Boolean))]) {
      try {
        const r = await fetch(BASE + '/api/Aule/getAulePerCalendarioPubblico', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkCalendarioId: link, clienteId: CLIENTE, limit: 5000 })
        });
        if (!r.ok) continue;
        const d = await r.json();
        if (!Array.isArray(d) || !d.length) continue;
        const nomiEd = new Map();   // l'elenco aule riporta solo il codice dell'edificio: i nomi li prendo a parte
        try {
          const re = await fetch(BASE + '/api/Edifici/getEdificiPerCalendarioPubblico', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linkCalendarioId: link, clienteId: CLIENTE })
          });
          if (re.ok) for (const e of await re.json()) nomiEd.set(e.id, (e.descrizione || '').trim());
        } catch { }
        const elenco = d.filter(a => a.abilitato !== false && a.edificio &&
            !ESCLUDI_EDIFICI.test(a.edificio.codice || '') && !ESCLUDI_AULE.test(a.descrizione || ''))
          .map(a => {
            const edId = a.edificioId || a.edificio.id;
            return { id: a.id, codice: a.codice, desc: a.descrizione, cap: a.capienza || null,
              edId, edCod: a.edificio.codice, edDesc: nomiEd.get(edId) || a.edificio.descrizione || a.edificio.codice };
          });
        store.set({ ...store.get(), elenco, elencoData: Date.now() });
        return elenco;
      } catch { }
    }
    return st.elenco || [];   // se il server non risponde uso l'ultimo elenco salvato (o solo le aule viste negli orari)
  }

  function popolaEdifici(aule) {
    const ed = new Map();
    for (const a of aule) {
      const e = ed.get(a.edId) || { id: a.edId, cod: a.edCod || '', desc: a.edDesc || a.edCod || a.edId, n: 0 };
      e.n++; ed.set(a.edId, e);
    }
    const lista = [...ed.values()].sort((x, y) => (y.cod.startsWith('PE') - x.cod.startsWith('PE')) || x.desc.localeCompare(y.desc));
    // Scelta combinata (predefinita): viale Pindaro + Polo Micara, edifici adiacenti
    const combo = lista.filter(e => /^PE_(PIN|MIC)$/.test(e.cod));
    if (combo.length) lista.unshift({ id: COMBO, cod: 'PE', desc: 'Viale Pindaro + Polo Micara', n: combo.reduce((s, e) => s + e.n, 0) });
    const scelto = store.get().edificioScelto;
    const def = lista.find(e => e.id === scelto) || lista[0];
    $('#al-ed').innerHTML = lista.map(e =>
      `<option value="${esc(e.id)}" ${e === def ? 'selected' : ''}>${esc(e.desc)} — ${e.cod.startsWith('PE') ? 'Pescara' : e.cod.startsWith('CH') ? 'Chieti' : esc(e.cod)} (${e.n} aule)</option>`).join('');
  }

  async function calcola() {
    const edId = $('#al-ed').value;
    store.set({ ...store.get(), edificioScelto: edId });
    const [y, mo, da] = $('#al-day').value.split('-').map(Number);
    const [h, mi] = ($('#al-time').value || '08:00').split(':').map(Number);
    const giornoSel = new Date(y, mo - 1, da);
    const t = new Date(y, mo - 1, da, h, mi).getTime();
    const minMs = Number($('#al-min').value) * 60e3;
    const ap = dayStart(giornoSel).getTime() + 8 * 3600e3, ch = dayStart(giornoSel).getTime() + 20 * 3600e3;

    status('Scarico gli orari del giorno…');
    const imp = await getGiorno(giornoSel);
    const elenco = await elencoAule();
    const edIds = new Set(edId === COMBO ? elenco.filter(a => /^PE_(PIN|MIC)$/.test(a.edCod || '')).map(a => a.edId) : [edId]);
    const auleEd = elenco.filter(a => edIds.has(a.edId));

    const perAula = new Map(auleEd.map(a => [a.id, { a, imp: [] }]));
    for (const i of imp) for (const a of i.aule) {
      if (!edIds.has(a.edId)) continue;
      if (!perAula.has(a.id)) perAula.set(a.id, { a, imp: [] });
      perAula.get(a.id).imp.push(i);
    }

    const libere = [], occupate = [];
    for (const { a, imp: lst } of perAula.values()) {
      if (ESCLUDI_AULE.test(a.desc || '')) continue;   // uffici, parcheggi, stanzette
      lst.sort((x, y) => x.s - y.s);
      const ora = lst.find(i => i.s <= t && i.e > t);
      if (ora) {
        let fine = ora.e; // finché ci sono impegni attaccati, l'aula resta occupata
        for (const i of lst) if (i.s <= fine && i.e > fine) fine = i.e;
        occupate.push({ a, lst, ora, liberaDa: fine });
      } else {
        const prox = lst.find(i => i.s > t);
        const fino = prox ? prox.s : null;
        if (fino === null || fino - t >= minMs) libere.push({ a, lst, fino, prox });
      }
    }
    const nomeAula = a => (a.desc || a.codice);
    const sede = a => edId !== COMBO ? '' : /^PE_MIC/.test(a.edCod || '') ? 'Micara' : 'Pindaro';
    const info = a => [sede(a), a.cap ? a.cap + ' posti' : ''].filter(Boolean).join(' · ');
    const titolo = a => esc(nomeAula(a)) + (info(a) ? ` <small class="i">· ${info(a)}</small>` : '') +
      (preferita(a) ? ' <small class="p">prese PC</small>' : '');
    const ord = (x, y) => nomeAula(x.a).localeCompare(nomeAula(y.a), 'it', { numeric: true });
    const pref = x => preferita(x.a) ? 0 : 1;
    libere.sort((x, y) => (pref(x) - pref(y)) || ((y.fino ?? Infinity) - (x.fino ?? Infinity)) || ord(x, y));
    occupate.sort((x, y) => (pref(x) - pref(y)) || (x.liberaDa - y.liberaDa) || ord(x, y));

    const barra = lst => {
      const span = ch - ap, pos = v => Math.max(0, Math.min(100, (v - ap) / span * 100));
      return `<div class="al-bar">${lst.map(i => `<i style="left:${pos(i.s)}%;width:${pos(i.e) - pos(i.s)}%" title="${esc(hhmm(new Date(i.s)))}–${esc(hhmm(new Date(i.e)))} ${esc(i.nome)}"></i>`).join('')}
        <b style="left:${(t - ap) / span * 100}%"></b></div>`;
    };
    const ticks = `<div class="al-ticks"><span>8</span><span>11</span><span>14</span><span>17</span><span>20</span></div>`;

    // Università chiusa: nessuna lezione in questi edifici quel giorno, oppure l'ora scelta è
    // prima della prima lezione o dopo la fine dell'ultima (quindi nessuna aula è occupata).
    const impEd = [...new Map([...perAula.values()].filter(x => !ESCLUDI_AULE.test(x.a.desc || ''))
      .flatMap(x => x.imp).map(i => [i.id, i])).values()];
    const primo = impEd.length ? Math.min(...impEd.map(i => i.s)) : null;
    const ultimo = impEd.length ? Math.max(...impEd.map(i => i.e)) : null;
    const chiusa = !occupate.length && (!impEd.length || t < primo || t >= ultimo);
    if (chiusa) {
      const quando = giornoSel.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
      const motivo = !impEd.length
        ? `Nessuna lezione in programma ${esc(quando)} in questi edifici.`
        : t < primo ? `Le lezioni di ${esc(quando)} iniziano alle ${hhmm(new Date(primo))}.`
        : `Le lezioni di ${esc(quando)} sono finite alle ${hhmm(new Date(ultimo))}.`;
      $('#al-out').innerHTML = `<div class="al-closed"><div class="ic">🔒</div><h3>Università chiusa</h3><p>${motivo}</p>
        <p class="n">Prova a cambiare giorno o ora.</p></div>`;
      status(`Nessuna aula occupata alle ${hhmm(new Date(t))}.`);
      return;
    }

    $('#al-out').innerHTML =
      `<div class="al-sec">Libere alle ${hhmm(new Date(t))} (${libere.length})</div>` +
      (libere.length ? libere.map(x => `<div class="al-room free"><div class="t"><span>${titolo(x.a)}</span>
        <span>${x.fino ? 'fino alle ' + hhmm(new Date(x.fino)) : 'tutto il giorno'}</span></div>
        <div class="s">${x.fino ? 'Libera per ' + durata(x.fino - t) + ' · poi: ' + esc(x.prox.nome) : (x.lst.length ? 'Nessuna lezione in programma dopo quest\'ora' : 'Nessuna lezione in programma oggi')}</div>
        ${barra(x.lst)}${ticks}</div>`).join('') : '<div class="s">Nessuna aula libera con questi criteri.</div>') +
      `<div class="al-sec">Occupate (${occupate.length})</div>` +
      occupate.map(x => `<div class="al-room"><div class="t"><span>${titolo(x.a)}</span><span>libera dalle ${hhmm(new Date(x.liberaDa))}</span></div>
        <div class="s">${esc(x.ora.nome)} (${hhmm(new Date(x.ora.s))}–${hhmm(new Date(x.ora.e))})</div>${barra(x.lst)}</div>`).join('');

    status(`${libere.length + occupate.length} aule · ${imp.length} impegni in Ateneo quel giorno. ` +
      `"Libera" = nessun impegno pubblicato su University Planner: un'aula senza lezioni potrebbe comunque essere chiusa o riservata.`);
  }

  const run = () => calcola().catch(err => status('Errore: ' + err.message));
  try {
    status('Scarico gli orari…');
    let elenco = await elencoAule();
    if (!elenco.length) {   // ripiego: aule ricavate dagli orari di oggi
      const viste = new Map();
      for (const i of await getGiorno(new Date())) for (const a of i.aule) if (a.id && a.edId) viste.set(a.id, a);
      elenco = [...viste.values()];
      store.set({ ...store.get(), elenco, elencoData: 0 });
    }
    popolaEdifici(elenco.filter(a => !ESCLUDI_AULE.test(a.desc || '')));
    ['#al-ed', '#al-day', '#al-time', '#al-min'].forEach(s => $(s).addEventListener('change', run));
    await run();
  } catch (err) {
    status('Errore: ' + err.message);
  }
})();
