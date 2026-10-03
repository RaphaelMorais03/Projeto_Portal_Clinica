# Protocolo Técnico

## Firebase SDK

Este projeto usa SDK MODULAR v11.6.0.

Import correto:
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getDatabase, ref, get, set, onValue, remove } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

Leitura:
const snap = await get(ref(db, 'path'));
const dados = snap.val();

Escrita:
await set(ref(db, 'path'), { dados: 'valor' });

NUNCA usar (é v8, não é o padrão):
firebase.database().ref(...)
firebase.firestore().collection(...)

## Checagem de perms (padrão do projeto)

const snapUser = await get(ref(_db, 'admin/usuarios/' + user.uid));
const perms = (snapUser.val() || {}).perms || {};
if (!perms.admin && !perms.caixa) { irPara('../login.html'); return; }

## Paths do RTDB

- admin/usuarios/{uid}/perms/{chave}   → perms (true/false)
- admin/usuarios/{uid}/departamento    → texto
- relatorios/{uid}/{data}              → fechamentos
- operacao/{uid}/nf_dia/{data}         → rascunho NF
- nf_dia_relatorios/{data}/{uid}       → NF consolidada
- nfl_sinaxys_lotes/{data}_{ts}        → lotes Sinaxys
- fechamento/registros/{id}            → repasse
- nps/relatorios/{id}                  → NPS
- contratos/{id}                       → contratos
- admin_logs/{timestamp}               → logs

Chaves de perms: admin, caixa, fechamento, financeiro, nps,
exames, cronograma, contratos, orcamento
