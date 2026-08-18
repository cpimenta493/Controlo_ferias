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

## 🔒 Privacidade

Todos os dados ficam **apenas no teu dispositivo**. Nada é enviado para a internet.
Usa a **cópia de segurança (JSON)** para transferir os dados entre dispositivos.
