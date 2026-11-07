/* ============================================================
   [v1.0] Pesquisa de Satisfação do Usuário (modal de estrelas)
   Arquivo novo: js/pesquisa-satisfacao.js
   Prefixo de tudo: ps*  (IDs, funções, chaves) — sem colisão.
   Não usa Firebase RTDB/Firestore (nenhum path novo, nenhuma Rule nova).
   Salva na planilha via Apps Script (webhook).
   [v1.1] Convertido p/ módulo ES (SDK modular v11.6.0).
   ============================================================ */
// [v1.1] Módulo ES: usa o SDK modular v11.6.0 (padrão do projeto, ver protocolo.md).
// Carregar com <script type="module" src="../js/pesquisa-satisfacao.js"></script> DEPOIS do módulo da própria página.
import { getApp }                          from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged }     from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

(function () {
  'use strict';

  // ===================== CONFIGURAÇÃO (edite aqui) =====================
  var PS_CONFIG = {
    ativo: true,                     // false = desliga a pesquisa em todo o portal
    dataInicio: '2026-11-09',        // [v1.0] 1ª pesquisa: segunda-feira (AAAA-MM-DD)
    intervaloDias: 30,               // repetir a cada X dias após responder (0 = só uma vez)
    webhookUrl: 'https://script.google.com/macros/s/AKfycbwS7WE7BpSf4BWwoWcplozfMrrJqXvwhM0UMyg6r1Xjw51q17zakif5WiXffKY5n5aG/exec', // [v1.0] // URL do "Implantar > App da Web"
    chaveStorage: 'psPesquisaV1',    // mude para "psPesquisaV2" para forçar uma nova rodada p/ todos
    atrasoMs: 1500                   // espera após carregar a página antes de abrir o modal
  };

  var PS_ROTULOS = {
    1: 'Muito ruim',
    2: 'Ruim',
    3: 'Regular',
    4: 'Bom',
    5: 'Excelente'
  };

  // ===================== Utilitários internos =====================
  function psHoje() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var dia = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + dia; // data local (fuso do navegador)
  }

  function psSomaDias(iso, dias) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + dias);
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var dia = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + dia;
  }

  function psLerEstado(uid) {
    try {
      var raw = localStorage.getItem(PS_CONFIG.chaveStorage + ':' + uid);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function psGravarEstado(uid, obj) {
    try { localStorage.setItem(PS_CONFIG.chaveStorage + ':' + uid, JSON.stringify(obj)); } catch (e) {}
  }

  function psDeveAparecer(uid) {
    if (!PS_CONFIG.ativo) return false;
    var hoje = psHoje();
    if (hoje < PS_CONFIG.dataInicio) return false;
    var st = psLerEstado(uid);
    if (st.proximaEm && hoje < st.proximaEm) return false;      // já respondeu e ainda não venceu
    if (st.adiadoAte && hoje < st.adiadoAte) return false;      // clicou "Agora não" hoje
    return true;
  }

  function psNotificar(msg, tipo) {
    if (typeof window.toast === 'function') window.toast(msg, tipo);
  }

  // ===================== CSS do modal =====================
  function psInjetarCSS() {
    if (document.getElementById('psStyle')) return;
    var css = document.createElement('style');
    css.id = 'psStyle';
    css.textContent =
      '#psOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;}' +
      '#psModal{background:#fff;border-radius:14px;max-width:440px;width:100%;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-family:inherit;}' +
      '#psModal h3{margin:0 0 6px;font-size:1.2rem;color:#222;}' +
      '#psModal p.psSub{margin:0 0 16px;color:#666;font-size:.9rem;}' +
      '#psEstrelas{display:flex;justify-content:center;gap:6px;margin:8px 0 4px;}' +
      '.psEstrela{background:none;border:none;font-size:2.4rem;line-height:1;cursor:pointer;color:#ccc;padding:2px;transition:transform .1s,color .1s;}' +
      '.psEstrela:hover{transform:scale(1.15);}' +
      '.psEstrela.psAtiva{color:#f5b301;}' +
      '#psRotulo{text-align:center;min-height:1.4em;font-weight:600;color:#444;margin-bottom:12px;}' +
      '#psSugestao{width:100%;box-sizing:border-box;min-height:80px;border:1px solid #ccc;border-radius:8px;padding:10px;font-family:inherit;font-size:.9rem;resize:vertical;}' +
      '#psAcoes{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}' +
      '#psAcoes button{border:none;border-radius:8px;padding:10px 18px;font-size:.9rem;cursor:pointer;}' +
      '#psAgoraNao{background:#eee;color:#444;}' +
      '#psEnviar{background:#1a7f5a;color:#fff;}' +
      '#psEnviar:disabled{opacity:.5;cursor:not-allowed;}';
    document.head.appendChild(css);
  }

  // ===================== Modal =====================
  function psAbrirModal(usuario) {
    if (document.getElementById('psOverlay')) return;
    psInjetarCSS();

    var nota = 0;
    var overlay = document.createElement('div');
    overlay.id = 'psOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div id="psModal">' +
        '<h3>Como está sua experiência com o portal?</h3>' +
        '<p class="psSub">Sua opinião ajuda a melhorar o sistema. Leva menos de 1 minuto.</p>' +
        '<div id="psEstrelas"></div>' +
        '<div id="psRotulo">Toque em uma estrela</div>' +
        '<textarea id="psSugestao" maxlength="500" placeholder="Sugestão ou comentário (opcional)"></textarea>' +
        '<div id="psAcoes">' +
          '<button type="button" id="psAgoraNao">Agora não</button>' +
          '<button type="button" id="psEnviar" disabled>Enviar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var boxEstrelas = document.getElementById('psEstrelas');
    var rotulo = document.getElementById('psRotulo');
    var btnEnviar = document.getElementById('psEnviar');

    function pintar(ate) {
      var btns = boxEstrelas.querySelectorAll('.psEstrela');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('psAtiva', (i + 1) <= ate);
      }
    }

    for (var n = 1; n <= 5; n++) {
      (function (n) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'psEstrela';
        b.textContent = '\u2605';
        b.setAttribute('aria-label', n + ' - ' + PS_ROTULOS[n]);
        b.addEventListener('mouseenter', function () { pintar(n); rotulo.textContent = n + ' - ' + PS_ROTULOS[n]; });
        b.addEventListener('mouseleave', function () {
          pintar(nota);
          rotulo.textContent = nota ? (nota + ' - ' + PS_ROTULOS[nota]) : 'Toque em uma estrela';
        });
        b.addEventListener('click', function () {
          nota = n; pintar(n);
          rotulo.textContent = n + ' - ' + PS_ROTULOS[n];
          btnEnviar.disabled = false;
        });
        boxEstrelas.appendChild(b);
      })(n);
    }

    function fechar() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }

    document.getElementById('psAgoraNao').addEventListener('click', function () {
      var st = psLerEstado(usuario.uid);
      st.adiadoAte = psSomaDias(psHoje(), 1); // volta amanhã
      psGravarEstado(usuario.uid, st);
      fechar();
    });

    btnEnviar.addEventListener('click', function () {
      if (!nota) return;
      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando...';
      var sugestao = document.getElementById('psSugestao').value.trim();
      psEnviar(usuario, nota, sugestao).then(function () {
        var st = {};
        st.respondidoEm = psHoje();
        st.proximaEm = PS_CONFIG.intervaloDias > 0 ? psSomaDias(psHoje(), PS_CONFIG.intervaloDias) : '9999-12-31';
        psGravarEstado(usuario.uid, st);
        psNotificar('Obrigado pela sua avaliação!', 'success');
        fechar();
      }).catch(function () {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar';
        psNotificar('Não foi possível enviar. Tente novamente.', 'error');
      });
    });
  }

  // ===================== Envio para a planilha =====================
  function psEnviar(usuario, nota, sugestao) {
    if (!PS_CONFIG.webhookUrl || PS_CONFIG.webhookUrl.indexOf('COLE_AQUI') === 0) {
      return Promise.reject(new Error('webhook nao configurado'));
    }
    var payload = {
      acao: 'pesquisaSatisfacao',
      dia: psHoje(),
      nome: usuario.nome,
      estrelas: nota,
      descricao: PS_ROTULOS[nota],
      sugestao: sugestao
    };
    // text/plain + no-cors: evita preflight CORS no Apps Script (resposta é opaca, mas o POST chega)
    return fetch(PS_CONFIG.webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  }

  // ===================== Inicialização =====================
  // [v1.1] Usa onAuthStateChanged no app default (o mesmo que a página inicializou).
  var psUsuarioAtual = null;

  function psIniciar() {
    var tentativas = 0;
    var t = setInterval(function () {
      tentativas++;
      var auth = null;
      try { auth = getAuth(getApp()); } catch (e) { auth = null; } // app ainda não inicializado -> tenta de novo
      if (auth) {
        clearInterval(t);
        onAuthStateChanged(auth, function (user) {
          if (!user) return;
          psUsuarioAtual = { uid: user.uid, nome: user.displayName || user.email || user.uid };
          if (psDeveAparecer(user.uid)) setTimeout(function () { psAbrirModal(psUsuarioAtual); }, PS_CONFIG.atrasoMs);
        });
      } else if (tentativas > 20) {
        clearInterval(t);
      }
    }, 500);
  }

  // Exposto globalmente (útil p/ testar: psAbrirPesquisaTeste() no console)
  window.psAbrirPesquisaTeste = function () {
    var u = psUsuarioAtual || { uid: 'teste', nome: 'Teste' };
    psAbrirModal(u);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', psIniciar);
  else psIniciar();
})();
