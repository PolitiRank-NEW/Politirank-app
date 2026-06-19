# Mecânica Turk: Hierarquia e Métricas do WhatsApp no PolitiRank

Este documento detalha a implementação técnica do sistema de "Mechanical Turk" (Inserção Manual de Dados) voltado para a plataforma WhatsApp no ecossistema PolitiRank. O objetivo principal do módulo foi permitir que a equipe administrativa impute métricas espelhadas do mundo real (Grupos e Lideranças ativas) para alimentar algoritmos de engajamento.

---

## 1. Arquitetura de Banco de Dados (Schema)

A implementação exigiu a evolução do `schema.prisma` para suportar uma hierarquia de três níveis independentes, garantindo integridade relacional entre Candidatos, Líderes e Bases Comunitárias.

### Entidades Envolvidas:
1. **`CandidateProfile`**: O topo da árvore. Representa o candidato no dashboard.
2. **`WhatsappLideranca`**: Representa um "cabo eleitoral" ou gestor regional vinculado a um candidato.
3. **`WhatsappGroup`**: Representa os grupos reais sob o comando de uma Liderança.

### Campos Essenciais para o Motor Matemático:
Tanto em `WhatsappLideranca` quanto em `WhatsappGroup`, existem os campos base para cálculo:
- `currentMembers` (Int): Número absoluto e atual de indivíduos.
- `entryCount` (Int): Número de pessoas que entraram no período medido.
- `exitCount` (Int): Número de pessoas que saíram.
- `duplicateMembers` (Int): Identificação de contatos repetidos em múltiplos grupos sob o mesmo guarda-chuva.
- `isManual` (Boolean): **Flag crucial**. Define se os dados foram colhidos de forma automatizada por bots/API do Wpp (futuro) ou imputados por um humano via módulo Turk (*Mechanical Turk*). 

*Relacionamento:*
Um `CandidateProfile` tem 1:N `WhatsappLideranca`, e uma `WhatsappLideranca` tem 1:N `WhatsappGroup`.

---

## 2. Operações de CRUD e Rotas de API (Backend)

Todo o tráfego do módulo Turk é assegurado por APIs seguras localizadas sob `/api/admin/metrics/whatsapp/`, com acesso bloqueado para perfis que não sejam `ADMIN` ou `SUPER_ADMIN`.

### A) Criar / Atualizar Lideranças (`/api/admin/metrics/whatsapp/lideranca/route.ts`)
- **Método POST:** Recebe os dados brutos e os converte em Int.
- **Lógica Turbo:** Se o ID fornecido for a string `"NEW"`, a rota utiliza `prisma.whatsappLideranca.create()`, gerando o elo inicial no banco. Se for um UUID válido, utiliza `prisma.whatsappLideranca.update()`.

### B) Criar / Atualizar Grupos (`/api/admin/metrics/whatsapp/grupo/route.ts`)
- **Método POST:** Lida com a base da pirâmide. 
- **Resolução de Aninhamento Paralelo:** A rota foi estruturada para mitigar a Falta de Foreign Key (*Dangling Constraint*). Se o Client tentar inserir um Grupo vinculado a uma Liderança que também possui ID `"NEW"`, a própria tela (`ClientesManager.tsx`) engatilha uma Promise sequencial: cadastra a liderança primeiro, devolve o ID real persistido, e aí sim dispara a criação do Grupo na API usando o ID validado do Pai.

---

## 3. Visualizações e Inserção Manual (Frontend - Operacional)

A inserção dos dados mecânicos ocorre estritamente dentro do contexto Administrativo: `ClientesManager.tsx`.

1. **Modal de Configuração do Turk:** O Admin seleciona o Candidato-Alvo. O sistema identifica se deseja imputar dados globais (Instagram/Metas) ou focar na árvore do WhatsApp.
2. **Cascata de Selects Dinâmicos:** Ao escolher WhatsApp, abre-se uma escolha em cascata:
   - Cadastrar na raiz (Candidato geral)?
   - Cadastrar em uma Liderança específica? (Dropdown carrega as já existentes nativamente do BD, ou permite "Adicionar Nova").
   - Cadastrar em um Grupo específico? (A mesma lógica da Liderança. Depende do líder selecionado no campo acima).
3. **Integração Real-Time:** Após confirmar os inputs métricos e disparar para o banco, a tela atualiza as tabelas em tempo real usando `router.refresh()`.

---

## 4. Renderização Analítica no Dashboard (`WhatsAppTracker.tsx`)

O coração analítico da ferramenta fica na "view" do candidato. Para comportar cenários de alto volume (ex: um candidato com 50 lideranças e 400 grupos), foi montada uma interface componentizada e dinâmica.

### A. Somatórias Automáticas Sub-Hierárquicas (Bubbling up)
O sistema lê a hierarquia de baixo pra cima (*bottom-up*). Os números de um Grupo influenciam os números diretos de sua Liderança Pai. A soma das Lideranças e Lideranças órfãs influencia a estante de "Visão Geral do Candidato".

### B. View Modes (UX Escalável)
- **Modo Detalhado (Card Grid):** Cada grupo vira um card independente, rico graficamente. Bom para visões focadas em poucas entidades.
- **Modo Compacto (List View):** Lideranças transformam seus grupos em listas lineares contínuas com as principais métricas (`+Entrou -Saiu | Engajamento`), suportando janelas densas sem comprometer o layout vertical.

### C. Sistema de Controle de Acesso e Tags (RBAC)
- Uma tag visual âmbar (amarela) chamada `[DADOS MANUAIS]` brota no título da tabela *apenas* se a propriedade `userRole` reconhecer a sessão logada como `ADMIN` ou `SUPER_ADMIN`. O Candidato dono da conta nunca vai saber visualmente se o engajamento ali é derivado de IA ou do Turk.

---

## 5. Algoritmo de Engajamento e Temperatura de Cores

A inovação mais profunda do painel foi a introdução do "Engajamento Termométrico". 

### Fórmula Matemática (Atrito Orgânico / Turnover)
Engajamento = `(((Entradas + Saídas) / Membros Atuais) * 100)`

**Exemplo Prático (Exemplo do "Grupo Teste 2"):**
- Membros Atuais: **400**
- Tiveram: **300 Entradas** no mês.
- Tiveram: **100 Saídas** no mês.
- Total de Interações (Tráfego interno do funil): `300 + 100 = 400`.
- Conta: `(400 / 400) * 100` = **100% de Engajamento Máximo**. (Significa que o grupo inteiro rodou de mãos ou esteve altamente aquecido com novas adesões/abandonos, uma estagnação zero).
O limite computacional da fórmula tem um *Clamp* que nunca permite estourar 100%, parando redondo em `Math.min(100, valor)`.

### O Motor Térmico Visual (`getEngagementTheme`)
Foi aplicada uma função utilitária global para o Painel que analisa o `%` de engajamento resultando em cores dinâmicas, trazendo a leitura intuitiva sem uso de textos excessivos:
- **`rate < 15%`**: Frio/Baixo. **VERMELHO**. (Exige alerta de evasão massiva nula ou falta de ação).
- **`rate >= 15% && rate < 40%`**: Estável/Atenção. **ÂMBAR/AMARELO**. (Grupo morno, vivendo organicamente).
- **`rate >= 40%`**: Quente/Bombação. **VERDE ESMERALDA**. (Tração de campanha ativa, link de convite rodando forte nos bairros).

### Integração Global com Meta
Dentro do arquivo-pai (`page.tsx`), a matemática central capta os engajamentos dos *Grupos de WhatsApp* pondera com os engajamentos da API Meta do *Instagram*, traçando um paralelo global e refletindo essa numeração termométrica no Dashboard mestre global do usuário no topo da tela inicial.
