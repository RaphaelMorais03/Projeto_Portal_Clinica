/*
 * conciliacao-engine.js — lógica pura da Conciliação Diária (sem DOM, sem Firebase).
 * [v1.0] Usado por pages/conciliacao.html. Testável em Node (module.exports).
 *
 * Regras de projeto:
 *  - Todo valor é inteiro em CENTAVOS (nunca float).
 *  - Nenhum nome de paciente sai deste módulo em estruturas destinadas ao Firebase
 *    (ver registroParaSalvar). Nomes só existem em memória, para a tela.
 *  - Taxas NÃO justificam diferença: toda diferença é "possível erro" (decisão do Raphael).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CONC = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ───────────── helpers numéricos / texto ───────────── */

  /* Converte "R$ -11539,72", "1.234,56", "26848.90", "-17.860,84" em centavos (inteiro). null se inválido. */
  function toCents(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) : null;
    var s = String(v == null ? '' : v).replace(/R\$/g, '').replace(/\s/g, '');
    if (!s) return 0;
    var neg = false;
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    else if (s.charAt(0) === '+') { s = s.slice(1); }
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    var m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    var c = parseInt(m[1], 10) * 100 + parseInt(((m[2] || '') + '00').slice(0, 2), 10);
    return neg ? -c : c;
  }

  function fmt(c, semRS) {
    c = c || 0;
    var neg = c < 0; if (neg) c = -c;
    var s = String(c % 100); if (s.length < 2) s = '0' + s;
    var i = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + (semRS ? '' : 'R$ ') + i + ',' + s;
  }

  function deacc(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function norm(s) { return deacc(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  function hash(s) {
    var h = 5381; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function sum(arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += f ? f(arr[i]) : arr[i]; return t; }

  var STOP = { de:1, da:1, do:1, dos:1, das:1, ltda:1, me:1, epp:1, dr:1, dra:1, odontologia:1, odontologica:1, clinica:1,
               medica:1, pagamento:1, pag:1, ref:1, valor:1, repasse:1, sim:1, integrada:1, servicos:1, saude:1, e:1, a:1, o:1 };
  function tokens(s) {
    var out = {}, t = norm(s).split(' ');
    for (var i = 0; i < t.length; i++) if (t[i].length >= 3 && !STOP[t[i]]) out[t[i]] = 1;
    return out;
  }
  function overlap(a, b) { var n = 0; for (var k in a) if (b[k]) n++; return n; }

  /* ───────────── Webdental: Consolidado do Dia (.xls que na verdade é HTML) ───────────── */

  function tipoWD(tipo) {
    var n = norm(tipo);
    if (/pix/.test(n)) return 'pix';
    if (/cartao/.test(n) && /credito/.test(n)) return 'credito';
    if (/debito/.test(n)) return 'debito';
    if (/^dinheiro/.test(n)) return 'dinheiro';
    if (/emprestimo/.test(n)) return 'emprestimo';
    if (/transacao bancaria/.test(n)) return 'bancaria';
    if (/transacao online/.test(n)) return 'online';
    return 'outro';
  }

  function cellsOf(tr) {
    var tds = tr.querySelectorAll('td,th'), out = [];
    for (var i = 0; i < tds.length; i++) out.push(tds[i].textContent.replace(/\s+/g, ' ').trim());
    return out;
  }

  /* doc = Document HTML já parseado (DOMParser no navegador; jsdom nos testes). */
  function parseConsolidado(doc) {
    var tables = doc.querySelectorAll('table');
    var out = { entradas: [], anteriores: [], saidas: [], invalidas: 0, periodo: null, unidade: '' };
    var pend = [];
    function ingest(p, kind) {
      var c = p.col;
      function g(r, n) { var i = c[n]; return i === undefined ? '' : (r[i] || ''); }
      if (c['dt caixa'] === undefined) return;
      p.rows.forEach(function (r) {
        var dt = g(r, 'dt caixa');
        if (!/^\d{4}-\d\d-\d\d$/.test(dt)) return;
        var v = toCents(g(r, 'valor caixa r'));
        if (v === null) { out.invalidas++; return; }
        var tipo = g(r, 'tipo pagamento');
        var rec = { t: tipoWD(tipo), tipo: tipo, dt: dt, v: v, paciente: g(r, 'paciente'), hist: g(r, 'historico'),
                    anexo: g(r, 'anexo'), tef: g(r, 'transacao tef'), dataTef: g(r, 'data tef'), dtAprov: g(r, 'dt aprovacao') };
        if (kind === 'dia') out.entradas.push(rec);
        else if (kind === 'anterior') out.anteriores.push(rec);
        else if (kind === 'despesa') out.saidas.push(rec);
      });
    }
    for (var ti = 0; ti < tables.length; ti++) {
      var trs = tables[ti].querySelectorAll('tr');
      if (!trs.length) continue;
      var hdr = -1, r;
      for (r = 0; r < Math.min(trs.length, 3); r++) {
        if (cellsOf(trs[r]).map(norm).indexOf('tipo pagamento') >= 0) { hdr = r; break; }
      }
      if (hdr >= 0) {
        var col = {};
        cellsOf(trs[hdr]).map(norm).forEach(function (n, i) { if (n && col[n] === undefined) col[n] = i; });
        var rows = [];
        for (r = hdr + 1; r < trs.length; r++) rows.push(cellsOf(trs[r]));
        pend.push({ col: col, rows: rows });
        continue;
      }
      var txt = cellsOf(trs[0]).join(' ');
      var n2 = norm(txt);
      if (ti === 0 || /filtros aplicados/.test(n2)) {
        var m = /Per[ií]odo:\s*(\d\d)\/(\d\d)\/(\d{4})\s*[àa]\s*(\d\d)\/(\d\d)\/(\d{4})/.exec(txt);
        if (m) out.periodo = [m[3] + '-' + m[2] + '-' + m[1], m[6] + '-' + m[5] + '-' + m[4]];
        var u = /Unidade:\s*(.*?)\s*Detalhar/.exec(txt); if (u) out.unidade = u[1];
        continue;
      }
      var kind = null;
      if (/^total recebimentos do dia/.test(n2)) kind = 'dia';
      else if (/^total recebimento anterior/.test(n2)) kind = 'anterior';
      else if (/^total despesa/.test(n2)) kind = 'despesa';
      else if (/^total recebimento futuro/.test(n2)) kind = 'futuro';
      if (kind) {
        pend.forEach(function (p) { ingest(p, kind); });
        pend = [];
      }
    }
    return out;
  }

  /* ───────────── Mais Todos: extrato CSV (;) ───────────── */

  function parseMaisTodos(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var out = { linhas: [], invalidas: 0 };
    if (!lines.length) return out;
    var delim = lines[0].indexOf(';') >= 0 ? ';' : ',';
    for (var i = 1; i < lines.length; i++) {
      var c = lines[i].split(delim);
      if (c.length < 5) { out.invalidas++; continue; }
      var dm = /(\d\d)\/(\d\d)\/(\d{4})(?:\s+às\s+(\d\d:\d\d(?::\d\d)?))?/.exec(c[0]);
      var v = toCents(c[c.length - 1]);
      if (!dm || v === null) { out.invalidas++; continue; }
      var tipo = c[1].trim(), desc = c.slice(2, c.length - 2).join(delim).trim(), id = c[c.length - 2].trim();
      var cls, cartao = null;
      if (/Domic[ií]lio/i.test(tipo)) {
        cls = 'cartao';
        var cm = /Bandeira:\s*([^|]+)\|\s*(Cr[eé]dito|D[eé]bito)/i.exec(desc);
        cartao = { bandeira: cm ? cm[1].trim() : '?', mod: cm ? (/^cr/i.test(cm[2]) ? 'credito' : 'debito') : '?' };
      } else if (/Devolu/i.test(tipo)) cls = v > 0 ? 'devolucao_in' : 'devolucao_out';
      else cls = v >= 0 ? 'entrada' : 'saida';
      out.linhas.push({ id: id, dia: dm[3] + '-' + dm[2] + '-' + dm[1], hora: dm[4] || '', tipo: tipo, desc: desc, v: v, cls: cls,
                        cartao: cartao, admin: /ADMINISTRADORA\s+CARTAO/i.test(desc), tarifa: /^Tarifa/i.test(desc) });
    }
    return out;
  }

  /* ───────────── combinatória exata ───────────── */

  /* Acha 2..maxK itens de pool cuja soma é exatamente target. Retorna array ou null. */
  function findSubset(target, pool, minK, maxK) {
    var arr = pool.filter(function (p) { return p.v > 0 && p.v <= target; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 60);
    var res = null;
    (function rec(start, k, s, picked) {
      if (res) return;
      if (s === target && k >= minK) { res = picked.slice(); return; }
      if (k >= maxK || s >= target) return;
      for (var i = start; i < arr.length; i++) {
        if (s + arr[i].v > target) continue;
        picked.push(arr[i]); rec(i + 1, k + 1, s + arr[i].v, picked); picked.pop();
        if (res) return;
      }
    })(0, 0, 0, []);
    return res;
  }

  /* Pareia A e B por valor exato: 1:1, depois 1:N e N:1. Itens: {v,...}. Muta cópias; devolve pares e sobras. */
  function parearExato(A, B) {
    var a = A.slice(), b = B.slice(), pares = [];
    function remove(arr, it) { var i = arr.indexOf(it); if (i >= 0) arr.splice(i, 1); }
    // 1:1
    a.slice().forEach(function (x) {
      var m = null;
      for (var i = 0; i < b.length; i++) if (b[i].v === x.v) { m = b[i]; break; }
      if (m) { pares.push({ a: [x], b: [m] }); remove(a, x); remove(b, m); }
    });
    // 1:N (um de A = soma de vários de B) e N:1
    a.slice().sort(function (p, q) { return q.v - p.v; }).forEach(function (x) {
      var s = findSubset(x.v, b, 2, 4);
      if (s) { pares.push({ a: [x], b: s }); remove(a, x); s.forEach(function (i) { remove(b, i); }); }
    });
    b.slice().sort(function (p, q) { return q.v - p.v; }).forEach(function (x) {
      var s = findSubset(x.v, a, 2, 4);
      if (s) { pares.push({ a: s, b: [x] }); remove(b, x); s.forEach(function (i) { remove(a, i); }); }
    });
    return { pares: pares, sobraA: a, sobraB: b };
  }

  /* ───────────── conciliação do período ───────────── */

  function inPeriodo(d, prevDia, dia) { return prevDia ? (d > prevDia && d <= dia) : d === dia; }

  /*
   * in = {
   *   dia, prevDia|null,
   *   wd: resultado de parseConsolidado,
   *   banco: linhas de parseMaisTodos (todas as datas),
   *   excluidos: { idLinhaBanco: true }   // PIX/TED marcados "não é de paciente"
   *   valores: { dinheiro, santander, wdSaldo, maisTodosApp|null }   // centavos
   *   prev:    { dinheiro, maisTodos, santander, wdSaldo }           // fechamento anterior (centavos)
   * }
   */
  function conciliar(inp) {
    var dia = inp.dia, prevDia = inp.prevDia || null, wd = inp.wd, V = inp.valores, P = inp.prev, EX = inp.excluidos || {};
    var per = function (r) { return inPeriodo(r.dt, prevDia, dia); };
    var ent = wd.entradas.concat(wd.anteriores).filter(per);
    var sai = wd.saidas.filter(per);
    var linhas = (inp.banco || []).filter(function (l) { return inPeriodo(l.dia, prevDia, dia); });

    var por = {};
    ['credito', 'debito', 'dinheiro', 'pix', 'bancaria', 'online', 'emprestimo', 'outro'].forEach(function (t) { por[t] = 0; });
    ent.forEach(function (r) { por[r.t] += r.v; });
    var wdEnt = sum(ent, function (r) { return r.v; });
    var wdSai = sum(sai, function (r) { return r.v; });
    var wdDinSai = sum(sai.filter(function (r) { return r.t === 'dinheiro'; }), function (r) { return r.v; });
    var saiBancoWD = sai.filter(function (r) { return r.t !== 'dinheiro'; });
    var wdBancoSai = sum(saiBancoWD, function (r) { return r.v; });
    var wdNaoCartao = por.pix + por.bancaria + por.online + por.emprestimo + por.outro;

    /* devoluções cancelam a saída/entrada original de mesmo valor */
    var banco = linhas.map(function (l) { return Object.assign({}, l); }), canceladas = [];  /* cópias: nunca muta a entrada */
    function cancelar(clsDev, clsOrig) {
      banco.filter(function (l) { return l.cls === clsDev; }).forEach(function (d) {
        var o = banco.filter(function (l) { return l.cls === clsOrig && l.v === -d.v; })[0];
        if (o) { canceladas.push({ devolucao: d, original: o }); banco.splice(banco.indexOf(d), 1); banco.splice(banco.indexOf(o), 1); }
      });
    }
    cancelar('devolucao_in', 'saida');
    cancelar('devolucao_out', 'entrada');
    banco.forEach(function (l) { if (l.cls === 'devolucao_in') l.cls = 'entrada'; if (l.cls === 'devolucao_out') l.cls = 'saida'; });

    var mtLiquido = sum(linhas, function (l) { return l.v; });
    var cartoes = banco.filter(function (l) { return l.cls === 'cartao'; });
    var entradasB = banco.filter(function (l) { return l.cls === 'entrada'; });
    var saidasB = banco.filter(function (l) { return l.cls === 'saida'; });
    var cred = sum(cartoes.filter(function (l) { return l.cartao.mod === 'credito'; }), function (l) { return l.v; });
    var deb = sum(cartoes.filter(function (l) { return l.cartao.mod === 'debito'; }), function (l) { return l.v; });
    var cartaoOutros = sum(cartoes, function (l) { return l.v; }) - cred - deb;
    var entIncl = entradasB.filter(function (l) { return !EX[l.id]; });
    var entExcl = entradasB.filter(function (l) { return EX[l.id]; });
    var saiNet = -sum(saidasB, function (l) { return l.v; });

    /* saldos */
    var mtSaldo = P.maisTodos + mtLiquido;
    var real = V.dinheiro + mtSaldo + V.santander;
    var diff = real - V.wdSaldo;
    var prevDiff = P.dinheiro + P.maisTodos + P.santander - P.wdSaldo;
    var dDiff = diff - prevDiff;
    var retro = (V.wdSaldo - P.wdSaldo) - (wdEnt - wdSai);

    /* componentes da variação da diferença (identidade exata) */
    var comp = {
      dinheiro: (V.dinheiro - P.dinheiro) - (por.dinheiro - wdDinSai),
      pix: sum(entIncl, function (l) { return l.v; }) - wdNaoCartao,
      pixExcluidos: sum(entExcl, function (l) { return l.v; }),
      credito: cred + cartaoOutros - por.credito,
      debito: deb - por.debito,
      saidas: wdBancoSai - saiNet,
      santander: V.santander - P.santander,
      retroativo: -retro
    };
    var somaComp = 0; for (var k in comp) somaComp += comp[k];
    var residuo = dDiff - somaComp;

    var out = {
      dia: dia, prevDia: prevDia, periodoDias: null,
      saldos: { dinheiro: V.dinheiro, maisTodos: mtSaldo, santander: V.santander, real: real, wdSaldo: V.wdSaldo, diff: diff, prevDiff: prevDiff, dDiff: dDiff },
      comp: comp, residuo: residuo,
      wd: { entradas: wdEnt, saidas: wdSai, porTipo: por, retro: retro },
      banco: { liquido: mtLiquido, credito: cred, debito: deb, saidasLiquidas: saiNet, devolucoesCanceladas: canceladas.length },
      alertas: []
    };

    /* conferência opcional do saldo Mais Todos informado direto do app */
    if (V.maisTodosApp != null && V.maisTodosApp !== mtSaldo) {
      out.alertas.push({ nivel: 'erro', texto: 'Saldo Mais Todos do app (' + fmt(V.maisTodosApp) + ') difere do calculado pelo extrato (' + fmt(mtSaldo) +
        ', diferença ' + fmt(V.maisTodosApp - mtSaldo) + '). Falta importar linhas do extrato ou o fechamento anterior está errado.' });
    }
    if (cartaoOutros) out.alertas.push({ nivel: 'aviso', texto: 'Há ' + fmt(cartaoOutros) + ' de cartão no banco sem modalidade (crédito/débito) reconhecida.' });
    if (por.outro) out.alertas.push({ nivel: 'aviso', texto: 'Há ' + fmt(por.outro) + ' em tipos de pagamento do Webdental não reconhecidos (contados com PIX/transferências).' });
    if (residuo) out.alertas.push({ nivel: 'erro', texto: 'A decomposição não fechou: sobram ' + fmt(residuo) + '. Avise o desenvolvedor.' });

    /* ── M2: PIX / transferências ── */
    var wdPix = ent.filter(function (r) { return r.t !== 'credito' && r.t !== 'debito' && r.t !== 'dinheiro'; })
                   .map(function (r) { return { v: r.v, ref: r }; });
    var bPix = entIncl.map(function (l) { return { v: l.v, ref: l }; });
    var pp = parearExato(bPix, wdPix);
    var dicas = [];
    var sb = pp.sobraB.slice(), sa = pp.sobraA.slice();
    sa.slice().forEach(function (x) { // banco sem par: procura WD "próximo" (até R$ 10,00)
      var best = null;
      sb.forEach(function (y) { var d = Math.abs(x.v - y.v); if (d <= 1000 && (!best || d < best.d)) best = { y: y, d: d }; });
      if (best) { dicas.push({ banco: x, wd: best.y, dif: best.y.v - x.v }); sa.splice(sa.indexOf(x), 1); sb.splice(sb.indexOf(best.y), 1); }
    });
    out.m2 = { bancoTotal: sum(bPix, function (x) { return x.v; }), wdTotal: sum(wdPix, function (x) { return x.v; }),
               pares: pp.pares.length, bancoSemPar: sa, wdSemPar: sb, dicasDigitacao: dicas, excluidos: entExcl, linhas: entradasB };

    /* ── M3: cartões ── */
    var cartoesWD = ent.filter(function (r) { return r.t === 'credito' || r.t === 'debito'; });
    out.m3 = { credito: { banco: cred, wd: por.credito, dif: cred + cartaoOutros - por.credito },
               debito: { banco: deb, wd: por.debito, dif: deb - por.debito }, linhasWD: cartoesWD, linhasBanco: cartoes };

    /* ── M5: saídas ── */
    var bS = saidasB.map(function (l) { return { v: -l.v, ref: l }; });
    var wS = saiBancoWD.map(function (r) { return { v: r.v, ref: r }; });
    var ps = parearExato(bS, wS);
    var sobraB = ps.sobraA.slice(), sobraW = ps.sobraB.slice(), sugestoes = [];
    sobraB.filter(function (x) { return !x.ref.tarifa; }).forEach(function (x) {
      var tb = tokens(x.ref.desc), grupo = [];
      sobraW.forEach(function (w) { if (overlap(tb, tokens(w.ref.hist)) >= 2) grupo.push(w); });
      if (grupo.length) {
        grupo.forEach(function (w) { sobraW.splice(sobraW.indexOf(w), 1); });
        sobraB.splice(sobraB.indexOf(x), 1);
        sugestoes.push({ banco: x, wd: grupo, wdSoma: sum(grupo, function (w) { return w.v; }), dif: sum(grupo, function (w) { return w.v; }) - x.v });
      }
    });
    out.m5 = { bancoTotal: saiNet, wdTotal: wdBancoSai, pares: ps.pares.length, bancoSemPar: sobraB, wdSemPar: sobraW, sugestoes: sugestoes, canceladas: canceladas };

    /* ── M1: dinheiro ── */
    out.m1 = { wdEntradas: por.dinheiro, wdSaidas: wdDinSai, wdLiquido: por.dinheiro - wdDinSai, variacaoPlanilha: V.dinheiro - P.dinheiro, dif: comp.dinheiro };

    out.itens = montarItens(out, dia);
    out.log = out.itens.slice().sort(function (a, b) { return a.prio - b.prio; });
    return out;
  }

  /* Itens (log de ações). Textos NUNCA contêm nome de paciente. */
  function montarItens(r, dia) {
    var it = [];
    function add(prio, mod, tipo, valor, texto, refs) {
      it.push({ chave: hash(mod + '|' + tipo + '|' + valor + '|' + (refs || '')), prio: prio, modulo: mod, tipo: tipo, valor: valor, texto: texto, dia: dia });
    }
    r.m5.sugestoes.forEach(function (s) {
      add(1, 'M5', 'saida_valor_diferente', s.dif,
        'Diferença em saída detectada: ' + s.banco.ref.desc + ' pago ' + fmt(s.banco.v) + ' no banco, lançado ' + fmt(s.wdSoma) +
        ' no Webdental (' + (s.dif > 0 ? '+' : '') + fmt(s.dif) + '). Estornar lançamento no Webdental e corrigir o valor.', s.banco.ref.id);
    });
    r.m5.bancoSemPar.forEach(function (x) {
      add(2, 'M5', x.ref.tarifa ? 'tarifa_sem_lancamento' : 'saida_sem_lancamento', x.v,
        x.ref.tarifa ? 'Lançar no Webdental a tarifa bancária de ' + fmt(x.v) + ' (' + x.ref.desc + ').'
                     : 'Saída de ' + fmt(x.v) + ' no banco (' + x.ref.desc + ') sem lançamento no Webdental: lançar a saída.', x.ref.id);
    });
    r.m5.wdSemPar.forEach(function (x) {
      add(2, 'M5', 'saida_sem_debito', x.v, 'Saída de ' + fmt(x.v) + ' lançada no Webdental sem débito correspondente no banco: conferir se foi paga ou estornar.',
        x.ref.dt + '|' + x.ref.hist.slice(0, 30));
    });
    r.m2.dicasDigitacao.forEach(function (d) {
      add(3, 'M2', 'pix_valor_proximo', d.dif, 'PIX de ' + fmt(d.banco.v) + ' no banco e ' + fmt(d.wd.v) + ' no Webdental (' + (d.dif > 0 ? '+' : '') + fmt(d.dif) +
        '): provável erro de digitação. Corrigir o valor no Webdental.', d.banco.ref.id);
    });
    r.m2.bancoSemPar.forEach(function (x) {
      add(3, 'M2', 'pix_sem_lancamento', x.v, 'Entrada de ' + fmt(x.v) + ' no banco sem lançamento no Webdental: localizar o paciente e lançar (ou marcar como "não é de paciente").', x.ref.id);
    });
    r.m2.wdSemPar.forEach(function (x) {
      add(3, 'M2', 'pix_sem_entrada', x.v, 'PIX/transferência de ' + fmt(x.v) + ' lançado no Webdental sem entrada no banco: conferir com o paciente.', x.ref.dt + '|' + x.ref.paciente.length);
    });
    if (r.m3.credito.dif) add(4, 'M3', 'credito_diferenca', r.m3.credito.dif, 'Cartão de crédito: banco ' + fmt(r.m3.credito.banco) + ' contra Webdental ' + fmt(r.m3.credito.wd) +
      ' (' + fmt(r.m3.credito.dif) + '). Possível erro: auditar por NSU.', dia);
    if (r.m3.debito.dif) add(4, 'M3', 'debito_diferenca', r.m3.debito.dif, 'Cartão de débito: banco ' + fmt(r.m3.debito.banco) + ' contra Webdental ' + fmt(r.m3.debito.wd) +
      ' (' + fmt(r.m3.debito.dif) + '). Possível erro: auditar por NSU.', dia);
    if (r.m1.dif) add(5, 'M1', 'dinheiro_diferenca', r.m1.dif, 'Dinheiro: a planilha variou ' + fmt(r.m1.variacaoPlanilha) + ' e o Webdental ' + fmt(r.m1.wdLiquido) + ' (' + fmt(r.m1.dif) + '). Conferir o caixa físico.', dia);
    if (r.comp.pixExcluidos) add(6, 'M2', 'excluidos_sem_webdental', r.comp.pixExcluidos, 'Entradas no banco marcadas "não é de paciente" somam ' + fmt(r.comp.pixExcluidos) + ' e não existem no saldo do Webdental (entram na diferença).', dia);
    if (r.comp.santander) add(6, 'SA', 'santander_variacao', r.comp.santander, 'Santander variou ' + fmt(r.comp.santander) + ' sem contrapartida no Webdental: conferir o extrato do Santander.', dia);
    if (r.comp.retroativo) add(6, 'WD', 'retroativo', r.comp.retroativo, 'O saldo do Webdental variou ' + fmt(-r.comp.retroativo) + ' além do movimento do período: lançamento retroativo/ajuste no Webdental. Conferir.', dia);
    return it;
  }

  /* Registro sanitizado para o Firebase: valores, final do cartão e NSU. SEM nomes de paciente. */
  function registroParaSalvar(r, extra) {
    function final4(anexo) { var m = /(\d{4})\s*$/.exec(anexo || ''); return m ? m[1] : ''; }
    function limpa(o) { return JSON.parse(JSON.stringify(o)); }
    var reg = {
      dia: r.dia, prevDia: r.prevDia || '',
      saldos: r.saldos, variacao: r.comp, residuo: r.residuo,
      wd: { entradas: r.wd.entradas, saidas: r.wd.saidas, porTipo: r.wd.porTipo, retroativo: r.wd.retro },
      banco: r.banco,
      cartoesWD: r.m3.linhasWD.map(function (x) { return { nsu: x.tef, final: final4(x.anexo), v: x.v, t: x.t, band: (x.anexo || '').split(' - ')[0], dt: x.dt }; }),
      cartoesBanco: r.m3.linhasBanco.map(function (l) { return { id: l.id, v: l.v, mod: l.cartao.mod, band: l.cartao.bandeira }; }),
      entradasBanco: r.m2.bancoSemPar.concat(r.m2.excluidos.map(function (l) { return { v: l.v, ref: l }; })).map(function (x) { return { id: x.ref.id, v: x.v }; }),
      excluidos: r.m2.excluidos.map(function (l) { return l.id; }),
      itens: r.itens.map(function (i) { return { chave: i.chave, prio: i.prio, modulo: i.modulo, tipo: i.tipo, valor: i.valor, texto: i.texto }; })
    };
    if (extra) for (var k in extra) reg[k] = extra[k];
    return limpa(reg);
  }

  /* Matriz de dias (spec): Data, Saldo Anterior, Entradas, Saídas, Saldo do Dia, Diferença, Extrato Banco, Saldo Atual */
  function montarMatriz(registros) {
    var ds = registros.slice().sort(function (a, b) { return a.dia < b.dia ? -1 : 1; });
    return ds.map(function (g) {
      var antes = g.saldos.wdSaldo - ((g.wd.entradas - g.wd.saidas) + (g.wd.retroativo || 0));
      return { dia: g.dia, saldoAnterior: antes, entradas: g.wd.entradas, saidas: g.wd.saidas, saldoDoDia: g.wd.entradas - g.wd.saidas,
               retroativo: g.wd.retroativo || 0, diferenca: g.saldos.diff, dDiff: g.saldos.dDiff,
               bancoReal: g.saldos.maisTodos + g.saldos.santander, dinheiro: g.saldos.dinheiro, saldoAtual: g.saldos.wdSaldo };
    });
  }

  /* ───────────── Importação de planilhas (Google Sheets exportado) ───────────── */
  /* Funciona sobre linhas (array de arrays de texto). Posições são relativas aos rótulos/datas, então
     colunas extras (número da linha do Google) não atrapalham. */
  var RX_DATA = /^(\d\d)\/(\d\d)\/(\d{4})$/;
  function proximaNaoVazia(cells, j) {
    for (var x = j + 1; x < cells.length; x++) if (String(cells[x]).replace(/\s/g, '') !== '') return cells[x];
    return '';
  }
  function rowsFromDoc(doc) {
    var t = doc.querySelector('table'); if (!t) return [];
    return Array.prototype.map.call(t.querySelectorAll('tr'), cellsOf);
  }
  /* Aba de fechamento diário: "DATA DO CAIXA | 19/10/2026", "DINHEIRO | ...", "BANCO", "SALDO TOTAL", "SALDO WEB DENTAL", "DIFERENÇA". */
  function extrairFechamentoRows(rows) {
    var mapa = { 'DINHEIRO': 'dinheiro', 'BANCO': 'banco', 'SALDO TOTAL': 'saldoTotal', 'SALDO WEB DENTAL': 'wdSaldo', 'DIFERENCA': 'diferenca' };
    var out = {}, dia = null;
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < rows[i].length; j++) {
        var n = deacc(rows[i][j]).replace(/\s+/g, ' ').trim().toUpperCase();
        if (n === 'DATA DO CAIXA' && !dia) {
          var m = RX_DATA.exec(String(proximaNaoVazia(rows[i], j)).trim());
          if (m) dia = m[3] + '-' + m[2] + '-' + m[1];
        } else if (mapa[n] && out[mapa[n]] === undefined) {
          var c = toCents(proximaNaoVazia(rows[i], j));
          if (c !== null && String(proximaNaoVazia(rows[i], j)).trim() !== '') out[mapa[n]] = c;
        }
      }
    }
    if (!dia) return null;
    out.dia = dia;
    return out;
  }
  /* Aba mensal da Caixa Geral: cabeçalho DATA | ENTRADAS | SAÍDAS | SALDO; linhas por dia. */
  function extrairCaixaGeralRows(rows) {
    var temCab = rows.some(function (r) {
      var n = r.map(function (c) { return deacc(c).trim().toUpperCase(); });
      return n.indexOf('ENTRADAS') >= 0 && n.indexOf('SAIDAS') >= 0;
    });
    if (!temCab) return null;
    var dias = [], saldoInicial = null;
    rows.forEach(function (r) {
      for (var j = 0; j < r.length; j++) {
        if (/^SALDO INICIAL/.test(deacc(r[j]).trim().toUpperCase())) { var c = toCents(proximaNaoVazia(r, j)); if (c !== null) saldoInicial = c; }
        var m = RX_DATA.exec(String(r[j]).trim());
        if (m) {
          var saldo = toCents(r[j + 3]), ent = toCents(r[j + 1]), sai = toCents(r[j + 2]);
          if (String(r[j + 3] == null ? '' : r[j + 3]).trim() !== '' && saldo !== null) {
            dias.push({ dia: m[3] + '-' + m[2] + '-' + m[1], entradas: ent || 0, saidas: sai || 0, saldo: saldo });
          }
          break;
        }
      }
    });
    return { dias: dias, saldoInicial: saldoInicial };
  }

  /* ───────────── Módulo 4: NSU (Webdental TEF x Soluções) ───────────── */
  function nsuKey(s) { return String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, ''); }

  /* sol = [{nsu, v, dt?, final?}] */
  function auditarNSU(linhasWD, sol) {
    var wdL = linhasWD.map(function (x) { return { nsu: nsuKey(x.tef), v: x.v, ref: x }; });
    var sl = sol.map(function (x) { return { nsu: nsuKey(x.nsu), v: x.v, ref: x }; });
    var porNsu = {}; sl.forEach(function (s) { if (s.nsu) (porNsu[s.nsu] = porNsu[s.nsu] || []).push(s); });
    var casados = 0, semMatch = [], valorDif = [];
    wdL.forEach(function (w) {
      var m = w.nsu && porNsu[w.nsu] && porNsu[w.nsu].shift();
      if (!m) { semMatch.push(w); return; }
      casados++;
      if (m.v !== w.v) valorDif.push({ wd: w, sol: m, dif: w.v - m.v });
    });
    var usados = {}; wdL.forEach(function (w) { if (w.nsu) usados[w.nsu] = 1; });
    var solSem = sl.filter(function (s) { return !s.nsu || !usados[s.nsu]; });
    return { casados: casados, wdSemMatch: semMatch, solSemMatch: solSem, valorDiferente: valorDif };
  }

  /* [v1.4] Extrato do Mais Todos em PDF → texto no formato do CSV (o PDF não traz ID nem hora).
     lines = linhas de texto da página, de cima para baixo. ID sintético = data+tipo+descrição+valor+nº da ocorrência no dia,
     estável se o mesmo PDF (ou um PDF que repita o dia inteiro) for carregado de novo. */
  function pdfMaisTodosParaCsv(lines) {
    var rx = /^(\d\d\/\d\d\/\d{4})\s+(.*?)\s*([+-])\s*R\$\s*([\d.]+,\d\d)\s*$/;
    var L = lines.map(function (l) { return String(l == null ? '' : l).replace(/\s+/g, ' ').trim(); }).filter(function (l) { return l; });
    var rows = [], saldos = {}, cont = {};
    for (var i = 0; i < L.length; i++) {
      var sd = /^(\d\d)\/(\d\d)\/(\d{4}) Saldo do dia R\$ ?(-?[\d.]+,\d\d)$/.exec(L[i]);
      if (sd) { saldos[sd[3] + '-' + sd[2] + '-' + sd[1]] = toCents(sd[4]); continue; }
      var m = rx.exec(L[i]); if (!m || i === 0) continue;
      var tipo = L[i - 1], desc = (L[i + 1] || ''), mid = m[2];
      if (/^Adquirente:/i.test(mid)) {
        desc = mid.replace(/\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d\d\s*$/, '') + ' ' + desc;
      }
      desc = desc.replace(/;/g, ',');
      var v = (m[3] === '-' ? '-' : '') + m[4].replace(/\./g, '');
      var key = [m[1], tipo, desc, v].join('|'); cont[key] = (cont[key] || 0) + 1;
      rows.push(m[1] + ' às 00:00:00;' + tipo + ';' + desc + ';pdf-' + hash(key + '#' + cont[key]) + ';R$ ' + v);
    }
    return { csv: 'Data de transferência;Tipo de transferência;Descrição;ID da transação;Valor da transferência\n' + rows.join('\n') + '\n', saldos: saldos, n: rows.length };
  }

  /* [v1.2] Webstats (texto colado do Painel Caixa): linha = data + 7 valores
     Saldo Anterior | Entrada | Saída | Saldo do Dia | Diferença | Extrato Banco | Saldo Atual */
  function parseWebstats(texto) {
    var out = {}, n = 0;
    String(texto || '').split(/\r?\n/).forEach(function (ln) {
      var m = /^\s*(\d\d)\/(\d\d)\/(\d{4})\b(.*)$/.exec(ln); if (!m) return;
      var resto = m[4].replace(/-\s+(?=\d)/g, '-');
      var nums = resto.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
      if (nums.length < 7) return;
      var v = nums.slice(0, 7).map(toCents);
      if (v.some(function (x) { return x === null; })) return;
      out[m[3] + '-' + m[2] + '-' + m[1]] = { saldoAnterior: v[0], entradas: v[1], saidas: Math.abs(v[2]), saldoDoDia: v[3], diferenca: v[4], extratoBanco: v[5], saldoAtual: v[6] };
      n++;
    });
    return n ? out : null;
  }

  return { toCents: toCents, fmt: fmt, norm: norm, hash: hash, tipoWD: tipoWD, parseConsolidado: parseConsolidado, parseMaisTodos: parseMaisTodos,
           parearExato: parearExato, findSubset: findSubset, conciliar: conciliar, registroParaSalvar: registroParaSalvar,
           montarMatriz: montarMatriz, auditarNSU: auditarNSU, rowsFromDoc: rowsFromDoc,
           extrairFechamentoRows: extrairFechamentoRows, extrairCaixaGeralRows: extrairCaixaGeralRows, parseWebstats: parseWebstats, pdfMaisTodosParaCsv: pdfMaisTodosParaCsv };
}));
