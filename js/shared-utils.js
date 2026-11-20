/*
 * shared-utils.js — utilitários compartilhados entre todas as páginas
 * Incluir APÓS firebase-config.js
 */

/* Escapa HTML para evitar XSS em interpolações de innerHTML */
window.esc = function(s) {
  return String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
};

/* Navegação robusta — funciona em GitHub Pages e subdiretórios */
window.irPara = function(arquivo) {
  /* [v1.1] Modo embed (?embed=1, usado pelo Dashboard): voltar ao portal vira aviso ao Dashboard
     (postMessage) e os demais destinos mantêm o embed. Fora do embed o comportamento é o de sempre. */
  if (window.__EMBED) {
    if (/login\.html/.test(arquivo)) {
      try { window.parent.postMessage({ tipo: 'portal:voltar' }, window.location.origin); } catch (e) {}
      return;
    }
    arquivo += (arquivo.indexOf('?') >= 0 ? '&' : '?') + 'embed=1';
  }
  var href = window.location.href.split('?')[0].split('#')[0];
  var base = href.substring(0, href.lastIndexOf('/') + 1);
  window.location.replace(base + arquivo);
};

/* [v1.1] Modo embed: ?embed=1 esconde, só visualmente, o que duplicaria o Dashboard (logo/título do cabeçalho,
   botão "Portal", "Sair", usuário). Não remove nem altera nenhum elemento: ids, funções e demais botões
   (data, status, ações do módulo) continuam funcionando. Sem ?embed=1 nada disso é aplicado. */
(function() {
  try {
    if (window.self === window.top) return;
    if (new URLSearchParams(window.location.search).get('embed') !== '1') return;
    window.__EMBED = true;
    document.documentElement.classList.add('portal-embed');
    var st = document.createElement('style');
    st.id = 'portalEmbedCss';
    st.textContent =
      'html.portal-embed .s-logo,' +
      'html.portal-embed .back-btn[onclick*="login.html"],' +
      'html.portal-embed .back-btn-h[onclick*="login.html"],' +
      'html.portal-embed #btnPortal,' +
      'html.portal-embed a.btn-header[href$="login.html"],' +
      'html.portal-embed .back-portal,' +
      'html.portal-embed .topbar .icon-btn[onclick*="login.html"],' +
      'html.portal-embed .btn-sair,html.portal-embed #logoutBtn,html.portal-embed #btnSair,' +
      'html.portal-embed .s-header .user-pill{display:none !important;}' +
      'html.portal-embed .s-header{justify-content:flex-end !important;min-height:0 !important;}';
    (document.head || document.documentElement).appendChild(st);
    /* cabeçalho que ficou sem nada útil (só tinha logo + Portal) some por inteiro */
    var colapsar = function() {
      document.querySelectorAll('.s-header').forEach(function(h) {
        var util = Array.prototype.some.call(
          h.querySelectorAll('button,a,input,select,.date-badge,.status-lbl,.admin-badge'),
          function(el) { return el.offsetParent !== null; });
        if (!util) h.style.display = 'none';
      });
    };
    document.addEventListener('DOMContentLoaded', colapsar);
    window.addEventListener('load', colapsar);
  } catch (e) { console.warn('[shared-utils] embed:', e && e.message); }
})();

/* Máscara de moeda brasileira */
window.mascaraMoeda = function(el) {
  var v = el.value.replace(/\D/g,'');
  v = (parseInt(v || '0', 10) / 100).toFixed(2) + '';
  v = v.replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  el.value = v;
};

/* Máscara de CPF */
window.mascaraCPF = function(el) {
  var v = el.value.replace(/\D/g,'').slice(0,11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4');
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/,'$1.$2.$3');
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/,'$1.$2');
  el.value = v;
};

/* Formata número como moeda */
window.fmtMoeda = function(v) {
  return Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

/* Debounce — evita chamadas excessivas em eventos de input */
window.debounce = function(fn, delay) {
  var t;
  return function() {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function() { fn.apply(this, args); }, delay);
  };
};

/* Toast de notificação */
window.toast = function(msg, tipo) {
  tipo = tipo || 'info';
  var box = document.getElementById('toastBox');
  if (!box) return;
  var t = document.createElement('div');
  t.className = 'toast ' + tipo;
  var icons = { success:'fa-check-circle', error:'fa-exclamation-circle', info:'fa-info-circle' };
  t.innerHTML = '<i class="fas ' + (icons[tipo] || icons.info) + '"></i> ' + esc(msg);
  box.appendChild(t);
  setTimeout(function() { t.remove(); }, 3500);
};

/* Valida e-mail */
window.validarEmail = function(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/* Valida CPF */
window.validarCPF = function(cpf) {
  cpf = cpf.replace(/[^\d]/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  var s = 0;
  for (var i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  var r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(cpf[9])) return false;
  s = 0;
  for (var i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(cpf[10]);
};

/* Formata CPF: 00000000000 → 000.000.000-00 */
window.formatCPF = function(cpf) {
  return String(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
};

/* Registra as dependências do Firebase SDK para uso pelas funções utilitárias.
 * Chamado pelas páginas com: window.initFirebaseUtils(db, ref, get)
 * Deve ser invocado logo após a inicialização do db em cada página.
 */
window.initFirebaseUtils = function(db, refFn, getFn) {
  window.__fb = { db: db, ref: refFn, get: getFn };
};

/* Popula um <select> com atendentes buscados do Firebase via SDK.
 * Uso: populateAtendentesSelect('meuSelectId')
 * Requer que initFirebaseUtils tenha sido chamado antes na mesma página.
 */
window.populateAtendentesSelect = async function(selectId, selectedValue) {
  var el = document.getElementById(selectId);
  if (!el) return;
  try {
    var fu = window.__fb;
    if (!fu || !fu.db || !fu.ref || !fu.get) {
      console.warn('[populateAtendentesSelect] initFirebaseUtils não foi chamado antes desta função.');
      return;
    }
    var snap = await fu.get(fu.ref(fu.db, 'admin/atendentes'));
    var d = snap.exists() ? snap.val() : null;
    var lista = d ? Object.values(d).map(function(a) { return a.apelido || a.nome; }).sort() : [];
    var prev = el.options[0] ? el.options[0].textContent : 'Selecione...';
    el.innerHTML = '<option value="">' + prev + '</option>';
    lista.forEach(function(nome) {
      var opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      if (selectedValue && nome === selectedValue) opt.selected = true;
      el.appendChild(opt);
    });
  } catch(e) {
    console.warn('[populateAtendentesSelect] Erro ao buscar atendentes:', e.message);
  }
};

/* Carrega dados da clínica do Firebase e armazena em sessionStorage.
 * Usa sessionStorage como cache imediato; revalida do Firebase em segundo plano.
 * Requer que initFirebaseUtils tenha sido chamado antes na mesma página.
 */
window.carregarClinica = async function() {
  try {
    var fu = window.__fb;
    if (!fu || !fu.db || !fu.ref || !fu.get) return;
    var snap = await fu.get(fu.ref(fu.db, 'admin/clinica'));
    var d = snap.exists() ? snap.val() : null;
    if (d) {
      if (d.nome)      sessionStorage.setItem('clinicaNome',      d.nome);
      if (d.telefone)  sessionStorage.setItem('clinicaTelefone',  d.telefone);
      if (d.endereco)  sessionStorage.setItem('clinicaEndereco',  d.endereco);
      if (d.cnpj)      sessionStorage.setItem('clinicaCnpj',      d.cnpj);
    }
  } catch(e) {
    console.warn('[carregarClinica]:', e.message);
  }
};

/* Carrega logo do Firebase via SDK com cache em sessionStorage.
 * Exibe a versão em cache imediatamente e verifica se há atualização.
 * Requer que initFirebaseUtils tenha sido chamado antes na mesma página.
 */
window.carregarLogoGlobal = async function(seletores) {
  var alvos = seletores || ['.logo-icon img','#headerLogo','#logoPreviewAdmin'];
  try {
    var cached = sessionStorage.getItem('logoDataUrl');
    var cachedVer = sessionStorage.getItem('logoVersao');

    // Exibe a versão em cache imediatamente para evitar flash
    if (cached) {
      alvos.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(img) { img.src = cached; });
      });
    }

    // Busca do Firebase via SDK para verificar atualização
    var fu = window.__fb;
    if (!fu || !fu.db || !fu.ref || !fu.get) {
      console.warn('[carregarLogoGlobal] initFirebaseUtils não foi chamado antes desta função.');
      return;
    }
    var snap = await fu.get(fu.ref(fu.db, 'admin/logo'));
    var d = snap.exists() ? snap.val() : null;

    if (d && d.dataUrl) {
      var ver = d.versao || d.atualizadoEm || '';
      if (!cached || cachedVer !== ver) {
        sessionStorage.setItem('logoDataUrl', d.dataUrl);
        sessionStorage.setItem('logoVersao', ver);
        alvos.forEach(function(sel) {
          document.querySelectorAll(sel).forEach(function(img) { img.src = d.dataUrl; });
        });
      }
    }
  } catch(e) {
    console.warn('[carregarLogoGlobal]:', e.message);
  }
};
