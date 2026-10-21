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

## ☁️ Sincronização partilhada com palavra-passe

O mesmo endereço serve os dois utilizadores. A sessão é guardada em cada
navegador pelo Firebase Authentication; ambos usam a mesma palavra-passe e têm
as mesmas permissões para editar viagens, despesas e roteiro. Não é preciso
introduzir emails no ecrã de entrada. O identificador técnico da conta fica em
`shared-access.js`; a palavra-passe nunca deve constar do código ou de backups.

### Configuração administrativa, antes de publicar

1. No projeto Firebase correto, ativa **Authentication → Email/Password**.
2. Cria uma única conta partilhada com o identificador técnico de
   `shared-access.js` e uma palavra-passe forte (pelo menos 12 caracteres).
   O domínio `.invalid` é apenas um identificador: não tem caixa de correio,
   por isso a recuperação por email não estará disponível. Guarda as credenciais
   em privado; a recuperação deve ser administrada no projeto Firebase.
3. Copia o UID exato dessa conta para `shared-access.js` e `firestore.rules`.
   Os ficheiros são modelos que recusam a ligação enquanto o UID não estiver
   configurado. Nunca uses regras `allow read, write: if true`.
4. Autoriza o domínio do site no Firebase Authentication, quando necessário.
5. Antes de permitir escritas, obtém e guarda uma cópia dos dados que já existem
   na nuvem usando o acesso administrativo. Não apagues as coleções anteriores.
6. Publica os ficheiros da aplicação corrigida e as regras restritas à conta
   partilhada. A aplicação exige autenticação, leitura do estado remoto e uma
   cópia local de proteção antes de começar a enviar alterações.

### Primeira ligação, preservando os dados do computador

- Mantém o JSON original fora do repositório e não limpes o armazenamento do PC.
- Atualiza primeiro a aplicação no PC e entra com a palavra-passe partilhada.
  A migração conserva os identificadores locais, mantém os registos remotos
  adicionais e arquiva versões anteriores antes de as substituir. Não uses a
  função **Importar** para esta migração: essa função serve para um restauro
  explícito e pode remover registos posteriores ao backup.
- Confirma a leitura de volta de todas as viagens, despesas e atividades. Para o
  backup de referência deste caso, espera-se no mínimo 4 viagens, 14 despesas
  e 1 atividade; os campos e identificadores também devem corresponder. Não
  coloques os dados privados desse backup no código público.
- Abre depois o mesmo link no telemóvel e entra com a mesma palavra-passe.
  Confirma os mesmos registos antes de realizar alterações reais.
- Testa uma alteração em cada sentido e guarda outro backup após a validação.

Se a autenticação, rede ou permissões falharem, as alterações locais continuam
na fila. **Continuar só neste dispositivo** permite consultar e editar os dados
locais sem iniciar ligação à nuvem. **Guardar cópia dos dados locais** continua
disponível no ecrã de entrada. Terminar sessão preserva os dados deste navegador;
a palavra-passe protege o acesso remoto e não cifra o armazenamento local.

A alteração da palavra-passe partilhada exige a palavra-passe atual e usa o
Firebase Authentication. Não é permitida a remoção da proteção da nuvem pela
aplicação. Os antigos hashes em `config/app` não são reutilizados como controlo
de acesso e ficam inacessíveis pelas novas regras.

## Preservação de dados e recuperação

- As alterações e eliminações ficam numa fila persistente no dispositivo antes de
  serem enviadas. Snapshots de cache não substituem os dados locais pendentes.
- Ao atualizar ou eliminar um registo remoto, a versão anterior é arquivada na
  coleção Firestore `recoveries`, na mesma transação. Em conflitos, a alteração
  local pendente prevalece e a versão remota fica recuperável nessa coleção.
- A primeira atualização de dados antigos e as substituições por snapshots
  criam também cópias locais, sem apagar automaticamente as anteriores.
- A importação valida o ficheiro e aceita backups antigos sem `plans`.
  Guarda uma cópia local antes do restauro; com Firebase ativo, arquiva os
  registos remotos anteriores e faz a substituição numa única transação.
  Se a proteção prévia ou a transação falhar, não aplica o restauro.
- O restauro remoto aceita até **200 registos distintos**, contando viagens,
  despesas e atividades presentes na nuvem ou no backup. Acima desse limite,
  recusa a operação inteira. Não divide um restauro em partes que possam ficar
  incompletas. Registos novos criados noutros dispositivos durante o restauro
  são preservados; podem, por isso, aparecer depois da importação.
- Se a nuvem estiver configurada mas indisponível, é preciso restabelecer a
  ligação antes de restaurar. Sem configuração de nuvem, o restauro é local.

Em **Viagens → Dados → Exportar recuperação**, descarrega
`ferias_recuperacao.json`. `local[].data` contém estados completos que podem ser
guardados como um ficheiro JSON e importados pela aplicação. `remote[]` contém
versões anteriores de registos: `collection` indica a lista de destino,
`recordId` o identificador e `data` o registo completo. Os arquivos de um mesmo
restauro partilham o `runId`; podem ser usados para reconstruir as listas
`trips`, `expenses` e `plans` de um backup. Não importes o pacote de recuperação
inteiro como se fosse um backup normal.

Se não houver ligação ao Firestore, a exportação de recuperação inclui as cópias
locais e assinala `remoteUnavailable: true`; repete com ligação para obter as
cópias remotas. As regras do Firestore precisam de permitir leitura e escrita de
`recoveries`; se não permitirem arquivar, a substituição do registo é recusada.
Não é necessário tornar as regras mais permissivas do que as da aplicação.

As cópias ocupam espaço. Se o armazenamento local ficar cheio, a aplicação avisa
e bloqueia substituições que não consiga proteger. Exporta os dados e as cópias
antes de limpar armazenamento do navegador. Nenhum código consegue recuperar
dados já perdidos antes desta atualização, nem substituir um backup externo.

### Verificar as correções

Com Node.js instalado, executa `node --test`. Os testes não contactam o Firebase
real; usam armazenamento e a fronteira do Firestore simulados para verificar
reconexão, conflitos, falhas de restauro, backups antigos e falta de espaço.

## 🔒 Privacidade

- **Sem Firebase:** os dados ficam apenas no teu dispositivo; nada sai para a internet.
  Usa a **cópia de segurança (JSON)** para os transferir entre dispositivos.
- **Com Firebase:** os dados ficam na tua base de dados Firestore e sincronizam
  entre todos os dispositivos que abrem a app.
