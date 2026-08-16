<div align="center">

  <img src="assets/favicon.png" alt="RCliniHub" width="80" />

  # Portal Amor Saúde — Sistema de Gestão Clínica

  Sistema web para gestão interna de clínicas: caixa, comissões, exames, NPS e orçamentos.

  [![Live Demo](https://img.shields.io/badge/🌐%20Demo-Ao%20Vivo-2ea44f?style=for-the-badge)](https://raphaelmorais03.github.io/Projeto_Portal_Clinica/)
  [![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/pt-BR/docs/Web/HTML)
  [![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/pt-BR/docs/Web/CSS)
  [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript)
  [![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
  [![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=for-the-badge&logo=github&logoColor=white)](https://pages.github.com/)

</div>

---

## Sobre o projeto

O **Portal Amor Saúde** é um sistema de gestão interna desenvolvido para clínicas de saúde. Consolida em uma única plataforma o controle financeiro, agendamento, avaliação de pacientes e gestão de equipe — substituindo planilhas e processos manuais.

> Sistema em produção, utilizado diariamente pela equipe da clínica.

---

## Módulos

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | Visão geral de produção, metas e métricas do período |
| **Caixa** | Controle de entradas, saídas e fechamento diário |
| **Financeiro** | Relatórios financeiros e repasses por profissional |
| **Exames** | Gestão de exames solicitados e laudos |
| **Orçamentos** | Criação e acompanhamento de orçamentos de pacientes |
| **Contratos** | Controle de contratos mensais e repasses |
| **Cronograma** | Agenda e programação interna da clínica |
| **NPS** | Coleta e análise de satisfação de pacientes |
| **Admin** | Painel administrativo e controle de acesso por perfil |

---

## Stack

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Banco de dados:** Firebase Realtime Database
- **Autenticação:** Firebase Authentication
- **Hospedagem:** GitHub Pages
- **Ícones:** Font Awesome 6 / Google Fonts (Inter)

---

## Estrutura do projeto

```
Projeto_Portal_Clinica/
├── assets/                  # Imagens e ícones
│   └── favicon.png
├── css/
│   └── styles.css           # Estilos globais
├── js/
│   ├── firebase-config.js   # Configuração do Firebase (SDK client)
│   └── shared-utils.js      # Utilitários compartilhados entre páginas
├── pages/                   # Páginas internas do sistema
│   ├── dashboard.html
│   ├── caixa.html
│   ├── financeiro.html
│   ├── exames.html
│   ├── orcamentos.html
│   ├── contratos.html
│   ├── cronograma.html
│   ├── nps.html
│   ├── admin.html
│   ├── fechamento.html
│   └── 404.html
├── data/
│   └── exams-seed.json      # Dados iniciais de exames
├── index.html               # Entrada (redireciona para login)
├── login.html               # Autenticação e portal de acesso
└── database.rules.json      # Firebase Security Rules
```

---

## Como rodar localmente

1. Clone o repositório:
```bash
git clone https://github.com/RaphaelMorais03/Projeto_Portal_Clinica.git
cd Projeto_Portal_Clinica
```

2. Abra com um servidor local — recomendado: extensão **Live Server** no VS Code

3. Acesse `http://localhost:5500`

> **Atenção:** Abrir diretamente via `file://` causa erros de CORS com o Firebase. Use sempre um servidor local.

---

## Segurança

A chave pública do Firebase em `js/firebase-config.js` é intencional — o SDK client-side exige exposição da configuração. A proteção real é feita via:

- **Firebase Security Rules** — leitura/escrita exige autenticação
- **Firebase App Check** — bloqueia requisições de origens não autorizadas

---

## Licença

MIT © [Raphael Morais](https://github.com/RaphaelMorais03)
