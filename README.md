# 🧳 Controlo de Gastos nas Férias

Aplicação web para registares e controlares os teus gastos durante as férias.
Funciona em **qualquer telemóvel ou computador** através do browser, **offline**,
e pode ser **instalada como app** no ecrã inicial.

Não precisa de servidor, base de dados nem conta — os dados ficam guardados no
próprio dispositivo (`localStorage`).

## ✨ Funcionalidades

- **Painel visual** com anel de progresso do orçamento, estatísticas e gráficos.
- **Gráfico de categorias** (donut) e **gráfico de gastos por dia** (barras),
  desenhados sem bibliotecas externas.
- **Registo rápido de despesas** com seletor de categorias por emoji
  (comida, alojamento, transporte, atividades, compras, bebidas, saúde, outros).
- **Orçamento por viagem** com alertas visuais quando estás perto ou acima do limite.
- **Várias viagens** — cria e alterna entre diferentes férias, cada uma com a sua moeda.
- **Multi-moeda** (€, $, £, R$, CHF, ¥).
- **Divisão de despesas em grupo** — adiciona pessoas, marca quem pagou e entre
  quem se divide, e a app calcula automaticamente o **acerto de contas**
  (quem deve a quem, com o mínimo de transferências).
- **Procura e filtros** por descrição e categoria.
- **Tema claro / escuro**.
- **Exportar CSV** (para Excel/Sheets) e **cópia de segurança / importação** em JSON.
- **PWA offline** — instalável e funcional sem internet.

## 🚀 Como usar

### Opção 1 — abrir diretamente
Basta abrir o ficheiro `index.html` num browser.

### Opção 2 — servir localmente (recomendado, ativa o modo offline/PWA)
```bash
# Python
python3 -m http.server 8000
# depois abre http://localhost:8000
```

### Opção 3 — publicar online (grátis)
Faz deploy da pasta em **GitHub Pages**, Netlify ou Vercel e acede pelo link
em qualquer dispositivo. No telemóvel, usa **"Adicionar ao ecrã principal"**
para instalar como app.

Para ativar o GitHub Pages: *Settings → Pages → Branch* e escolhe a branch com
estes ficheiros na raiz.

## 📁 Estrutura

| Ficheiro | Descrição |
|----------|-----------|
| `index.html` | Estrutura da aplicação |
| `styles.css` | Estilos, tema claro/escuro e responsividade |
| `app.js` | Lógica: dados, gráficos, cálculos e interações |
| `manifest.json` | Configuração PWA (instalação) |
| `sw.js` | Service worker (funcionamento offline) |
| `icon.svg` | Ícone da aplicação |

## ☁️ Sincronização entre dispositivos (opcional)

Por omissão, os dados ficam guardados **só no dispositivo**. Se quiseres que os
gastos fiquem **partilhados e sincronizados em tempo real** (todos veem os dados
anteriores e podem adicionar/editar, no telemóvel e no computador), liga a app a
um projeto **Firebase** gratuito:

1. Vai a **https://console.firebase.google.com** e clica **"Adicionar projeto"**.
   Dá-lhe um nome (ex: `ferias`) e avança (podes desativar o Google Analytics).
2. No menu à esquerda, abre **Build → Firestore Database → Criar base de dados**.
   Escolhe **"Iniciar em modo de teste"** e uma localização (ex: `eur3` Europa).
3. Volta a **⚙ Definições do projeto**. Em **"As tuas apps"**, clica no ícone
   **Web `</>`**, regista a app (nome à escolha) e copia o objeto `firebaseConfig`.
4. Cola esses valores no ficheiro **`firebase-config.js`** deste projeto
   (substitui os `COLA_AQUI...`). Faz commit/push.
5. Abre a app: no topo deve aparecer **"☁ sincronizado"**. Os dados que já tinhas
   são enviados automaticamente para a nuvem na primeira vez.

### Tornar a partilha permanente (regras)
O "modo de teste" expira ao fim de ~30 dias. Para manter o acesso, vai a
**Firestore → Regras** e coloca:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if true; }
  }
}
```

> ⚠️ Com estas regras, **qualquer pessoa com o link da app consegue ver e editar**
> os gastos. Para uma app de férias em família costuma ser o pretendido. Se mais
> tarde quiseres proteger com palavra-passe/login, dá para acrescentar.

## 🔒 Privacidade

- **Sem Firebase:** os dados ficam apenas no teu dispositivo; nada sai para a internet.
  Usa a **cópia de segurança (JSON)** para os transferir entre dispositivos.
- **Com Firebase:** os dados ficam na tua base de dados Firestore e sincronizam
  entre todos os dispositivos que abrem a app.
