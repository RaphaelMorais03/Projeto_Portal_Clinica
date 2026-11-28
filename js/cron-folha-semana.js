/* [v1.1] Texto escrito na sala (origem "avulso" sem medicoId): sai inteiro e depois do médico.
   [v1.0] Folha semanal impressa do cronograma (A4 paisagem) — modelo único.
   Usada por pages/cronograma.html (Dashboard e aba Semana) e por login.html (tela inicial).
   Mudou o desenho aqui, muda nos dois lugares. Não lê nem grava no banco. Depende de window.esc (shared-utils.js). */
(function () {
  'use strict';
  var NOMES_DIA = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
  var MES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var TITULO = /^(dr|dra|drs|prof|profa)\.?\s+/i;
  var PREP = { de: 1, da: 1, do: 1, dos: 1, das: 1, e: 1 };

  function pad(n) { return ('0' + n).slice(-2); }
  function dataDe(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function brData(s) { var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function brCurta(s) { var p = s.split('-'); return p[2] + '/' + p[1]; }
  function diaCurto(s) { var p = s.split('-'); return p[2] + '/' + MES_ABR[+p[1] - 1]; }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function limpaNome(s) { return norm(String(s || '').replace(TITULO, '')); }
  function avulso(x) { return x.origem === 'avulso' && !x.medicoId; }   // [v1.1]

  /* Nome e especialidade de cada agenda para quem não tem as funções do módulo (tela inicial).
     Mesma regra de rotuloNome() e espDe() do pages/cronograma.html.
     medicos = conteúdo de crono/medicos (só admin lê); vazio = usa o texto da própria agenda. */
  window.cronFolhaNomes = function (medicos) {
    var meds = medicos || {}, idx = {};
    Object.keys(meds).forEach(function (id) {
      var m = meds[id] || {};
      [limpaNome(m.nome), limpaNome((m.nome || '') + ' ' + (m.sobrenome || ''))].forEach(function (k) {
        if (!k) return; idx[k] = (idx[k] && idx[k] !== id) ? '?' : id;
      });
    });
    function medDe(x) {
      if (avulso(x)) return null;   // [v1.1]
      var id = (x.medicoId && meds[x.medicoId]) ? x.medicoId : idx[limpaNome(x.doc)];
      return (id && id !== '?' && meds[id]) ? meds[id] : null;
    }
    function inicialSobrenome(s) {
      var p = String(s || '').trim().split(/\s+/);
      for (var i = 0; i < p.length; i++) { if (p[i] && !PREP[norm(p[i])]) return p[i].charAt(0).toUpperCase() + '.'; }
      return '';
    }
    return {
      nome: function (x) {
        if (avulso(x)) return String(x.doc || '');   // [v1.1]
        var m = medDe(x);
        if (m) { var n = String(m.nome || '').trim(), s = inicialSobrenome(m.sobrenome); return s ? n + ' ' + s : n; }
        var p = String(x.doc || '').replace(TITULO, '').trim().split(/\s+/);
        if (p.length >= 2 && !/\.$/.test(p[p.length - 1])) return p[0] + ' ' + p[p.length - 1].charAt(0).toUpperCase() + '.';
        return p.join(' ');
      },
      especialidade: function (x) { var m = medDe(x); return x.rotulo || (m && m.especialidade) || x.role || ''; }
    };
  };

  /* Monta a página de impressão.
     o.dias          6 datas 'AAAA-MM-DD' (segunda a sábado)
     o.listas        agendas de cada dia, na mesma ordem, sem cancelado/remarcado ({ sala, periodo, ... })
     o.salas         ordem das linhas
     o.especiais     salas escritas sem a especialidade (US, acolhimento, fisioterapia)
     o.rotulo(sala)  texto no começo da linha ('1.', 'ULTRASSOM:')
     o.nome(x)       nome do profissional
     o.especialidade(x)
     o.agendados(dia)  número de agendados do dia, ou outro valor quando não informado
     o.logo          imagem em data URL ('' = texto no lugar)
     o.semSala       true = acrescenta a linha "SEM SALA:" no período que tiver agenda sem sala */
  window.cronFolhaSemanaHtml = function (o) {
    var esc = window.esc, dias = o.dias, listas = o.listas;
    var total = 0; dias.forEach(function (d) { var n = o.agendados(d); if (typeof n === 'number') total += n; });
    var logoH = o.logo ? '<img src="' + o.logo + '" alt="Logo">' : '<span class="lt">AMEI</span>';
    function linha(per, sl, rot, esp) {
      var cheias = 0;
      var tds = dias.map(function (d, i) {
        if (per === 'Tarde' && dataDe(d).getDay() === 6) return '<td></td>';   // sábado à tarde não tem agenda: fica em branco
        var is = listas[i].filter(function (x) { return x.periodo === per && x.sala === sl; })
          .sort(function (a, b) { return (avulso(a) ? 1 : 0) - (avulso(b) ? 1 : 0); });   // [v1.1]
        if (!is.length && !sl) return '<td></td>';
        if (is.length) cheias++;
        var t = is.map(function (x) { var e = o.especialidade(x); return esc(o.nome(x).toUpperCase()) + (esp || !e ? '' : ' <i>(' + esc(e.toUpperCase()) + ')</i>'); }).join(' / ');
        return '<td><b>' + esc(rot) + '</b> ' + t + '</td>';
      }).join('');
      return { html: tds, cheias: cheias };
    }
    function bloco(per) {
      var h = o.salas.map(function (sl) {
        var l = linha(per, sl, o.rotulo(sl), !!o.especiais[sl]);
        var vazio = !listas.some(function (lista) { return lista.some(function (x) { return x.periodo === per && x.sala === sl; }); });
        return '<tr class="' + (vazio ? 'v' : '') + '">' + l.html + '</tr>';
      }).join('');
      if (o.semSala) { var s = linha(per, '', 'SEM SALA:', false); if (s.cheias) h += '<tr class="">' + s.html + '</tr>'; }
      return h;
    }
    var g = new Date();
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cronograma semanal ' + esc(brData(dias[0])) + '</title><style>' +
      '@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}' +
      '.top{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0A1F44;padding-bottom:2.2mm;margin-bottom:2.5mm}.lg{display:flex;align-items:center;gap:3.5mm}' +
      '.logo{width:13mm;height:13mm;display:flex;align-items:center;justify-content:center;flex-shrink:0}.logo img{max-width:100%;max-height:100%;object-fit:contain}.lt{font-size:9pt;font-weight:800;color:#0A1F44}' +
      '.top h1{font-size:15pt;letter-spacing:.5px;color:#0A1F44}.top small{font-size:8pt;color:#374151;display:block;margin-top:.6mm;font-weight:700;letter-spacing:.6px}' +
      '.per{font-size:10pt;font-weight:700;color:#0A1F44;text-align:right}.per small{display:block;font-weight:800;font-size:8.5pt;margin-top:.8mm;color:#0A1F44;letter-spacing:.3px}' +
      'table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#0A1F44;color:#fff;font-size:7.5pt;padding:1.6mm 1mm;border:1px solid #0A1F44;line-height:1.15}th small{font-weight:500;font-size:7pt}' +
      'td{border:1px solid #d1d5db;padding:.55mm 1.3mm;font-size:7.5pt;font-weight:600;line-height:1.16;vertical-align:top;height:4.75mm;overflow:hidden}td b{color:#0A1F44;font-weight:800}td i{font-style:normal;font-weight:500;color:#4b5563}' +
      'tr.v td{height:3.7mm}tr.band td{background:#e5e7eb;text-align:center;font-weight:800;font-size:6.8pt;letter-spacing:1px;padding:.6mm;height:auto;color:#0A1F44}' +
      'tr.ag td{text-align:center;font-weight:700;background:#f3f4f6;font-size:7pt;padding:1mm;height:auto}' +
      '.foot{font-size:7pt;color:#374151;font-weight:700;margin-top:1.8mm;letter-spacing:.2px}' +
      '</style></head><body>' +
      '<div class="top"><div class="lg"><div class="logo">' + logoH + '</div><div><h1>CRONOGRAMA SEMANAL</h1><small>AMOR SAÚDE SP PIRITUBA</small></div></div>' +
      '<div class="per">' + esc(brCurta(dias[0]) + ' a ' + brData(dias[5])) + '<small>TOTAL AGENDADOS: ' + total + '</small></div></div>' +
      '<table><thead><tr>' + dias.map(function (d) { return '<th>' + NOMES_DIA[dataDe(d).getDay()] + '<br><small>' + diaCurto(d) + '</small></th>'; }).join('') + '</tr></thead><tbody>' +
      '<tr class="band">' + dias.map(function () { return '<td>MANHÃ</td>'; }).join('') + '</tr>' + bloco('Manhã') +
      '<tr class="band">' + dias.map(function (d) { return dataDe(d).getDay() === 6 ? '<td></td>' : '<td>TARDE</td>'; }).join('') + '</tr>' + bloco('Tarde') +
      '<tr class="ag">' + dias.map(function (d) { var n = o.agendados(d); return '<td>Agendados: ' + (typeof n === 'number' ? n : '—') + '</td>'; }).join('') + '</tr></tbody></table>' +
      '<div class="foot">CONFERIDO EM: ' + pad(g.getDate()) + '/' + pad(g.getMonth() + 1) + '/' + g.getFullYear() + ' ' + pad(g.getHours()) + ':' + pad(g.getMinutes()) + '</div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script></body></html>';
  };
})();
