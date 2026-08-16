/*
 * firebase-config.js — configuração centralizada do Firebase
 *
 * SEGURANÇA:
 *  - Esta chave é pública por design (Firebase Client SDK).
 *  - A proteção real vem das Firebase Security Rules e do App Check.
 *  - Configure App Check no console Firebase para bloquear origens não autorizadas.
 *  - Configure as Security Rules para exigir autenticação em todos os nós.
 */
if (typeof window.FIREBASE_CONFIG === 'undefined') {
  window.FIREBASE_CONFIG = {
    apiKey:            "AIzaSyAJwgap1ZVgRsjEW5G9idhuiG0SHowPUUg",
    authDomain:        "clinica-pirituba.firebaseapp.com",
    databaseURL:       "https://clinica-pirituba-default-rtdb.firebaseio.com",
    projectId:         "clinica-pirituba",
    storageBucket:     "clinica-pirituba.firebasestorage.app",
    messagingSenderId: "873516334703",
    appId:             "1:873516334703:web:1e20dc20b1c68e388a179a"
  };
}
