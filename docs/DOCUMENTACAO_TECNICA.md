# PolitiRank: Documentação de Fontes de Dados e Integração

Esta documentação detalha tecnicamente **quais dados** podemos extrair de cada plataforma, **como** obtê-los, os **desafios reais** (Dificuldade) e **como integrá-los** para gerar inteligência política.

---

## 1. Meta (Instagram & Facebook)
**Fonte Oficial:** Graph API v19.0.
**Nível de Dificuldade:** ⭐⭐⭐ (Médio - Burocrático)

### ⚠️ A Realidade da Implementação (Dificuldades)
Não é só apenas "chamar a API". O buraco é mais embaixo devido à privacidade pós-Cambridge Analytica.
1.  **App Review (Aprovação):** A Meta **vai bloquear** seu app se você pedir permissões avançadas (`manage_comments`, `public_content_access`) sem provar pra que serve.
    *   *Solução:* Gravar um vídeo (screencast) mostrando EXATAMENTE como o PolitiRank usa os dados. É chato e pode ser rejeitado 2x ou 3x.
2.  **Verificação de Empresa (Business Verification):** Para ter limites decentes de requisição, você precisa enviar Contrato Social da empresa dona do PolitiRank para a Meta. Sem empresa, sem API em escala.
3.  **Expiração de Tokens:** O token de 60 dias expira. Se o algoritmo de *refresh* falhar, o cliente perde a conexão e você perde dados.

### ✅ O Que Tenho Acesso (Dados Disponíveis)
Com as permissões corretas (`instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`), temos acesso a:
*   **Métricas do Perfil:** Total de seguidores, alcance diário da conta.
*   **Métricas de Conteúdo PROPRIO:** Likes, Comentários, Salvos, Compartilhamentos (agregado) de cada post do candidato.
*   **Autoria de Comentários:** Quem comentou (Username) e O Que comentou (Texto). *Necessário para o Ranking.*
*   **Insights Demográficos:** Cidade e Faixa Etária da audiência (Dados agregados e anonimizados).

### ❌ O Que NÃO Tenho Acesso (Limitações)
*   **Quem Compartilhou:** A API diz "100 shares", mas **não diz** quem foram as 100 pessoas. (Privacidade).
*   **Quem Visualizou:** Sabemos que "10k pessoas viram", mas não temos a lista de nomes.
*   **Posts de Concorrentes:** Não conseguimos monitorar o perfil do adversário oficialmeente (Bloqueio de `Public Content Access`).
*   **DMs (Direct Messages):** O PolitiRank não lerá DMs nesta versão (requer permissões de atendimento ao cliente complexas).

### Como Integrar (The Fix)
*   **App Review:** Focar apenas nas permissões `instagram_basic` e `instagram_manage_insights` inicialmente (mais fáceis de aprovar).
*   **Token:** Criar um *Worker* que roda a cada 15 dias só para renovar o token automaticamente.

---

## 2. TikTok
**Fonte Oficial:** TikTok Display API.
**Nível de Dificuldade:** ⭐⭐⭐⭐ (Alto - Restritivo)

### ⚠️ A Realidade da Implementação (Dificuldades)
O TikTok é novo no jogo de APIs e extremamente paranoico com dados de usuários (GDPR/EUA).
1.  **Aprovação Lenta:** O processo de *Application* para Developers pode levar semanas.
2.  **Dados Limitados:** Diferente do Insta, a API "Display" padrão **NÃO entrega quem comentou**. Ela diz "tem 50 comentários", mas não diz *quem* são.
    *   *Impacto:* Isso quebra o ranking de lideranças nessa plataforma.
    *   *Solução Oficial:* "Research API" (Só para acadêmicos) ou "Commercial Content API" (Caríssima/Restrita).
    *   *Solução Hacker:* Pedir para a liderança conectar o TikTok *dela* também, aí conseguimos ver o que ELA fez (caminho inverso), mas é complexo de UX.

### ✅ O Que Tenho Acesso (Via Login da Liderança)
Quando a Liderança conecta a conta dela no nosso app:
*   **Vídeos DELA:** Lista de todos os vídeos postados pelo usuário conectado.
*   **Performance dos Vídeos:** Views, Likes, Comments, Shares de cada vídeo.
*   **Perfil:** Total de seguidores e Likes totais da conta.

### ❌ O Que NÃO Tenho Acesso
*   **Quem Curtiu/Comentou:** O TikTok diz "500 likes", mas **não entrega a lista de usuários** que deram like. Não dá para saber se o "João" curtiu o vídeo da "Maria".
*   **Vídeos de Terceiros:** Não conseguimos ver vídeos de pessoas que não logaram no app.
*   **For You Page:** Não sabemos o que aparece na timeline do usuário.

### Como Integrar (Estratégia Confirmada: Conexão das Lideranças)
Já que você optou por **conectar o TikTok da Liderança**, usaremos a **Display API** padrão (a mesma do Login).

*   **Fluxo de Dados:**
    1.  O PolitiRank gera um link de convite para a Liderança: `politirank.com/conectar-tiktok`.
    2.  O Líder faz login e autoriza.
    3.  **Monitoramento Ativo:** O sistema varre diariamente os vídeos postados **pelo Líder**.
    4.  **Proof of Work:** Se o Líder postar um vídeo com a hashtag `#NomeDoCandidato` ou mencionar o `@Candidato` na legenda, ele ganha pontos de engajamento/produção de conteúdo.

> **Nota:** As APIs "Research" (Acadêmica) e "Commercial" (Analítica Pesada) são, respectivamente, para Universidades e grandes parceiros de mídia. Com a conexão direta do usuário (Liderança), não precisamos delas. Usamos a API padrão de Login.

---

## 3. WhatsApp
**Fonte Alternativa:** Evolution API (Gateway Não-Oficial).
**Nível de Dificuldade:** ⭐⭐⭐⭐⭐ (Crítico - Risco de Bloqueio)

### ⚠️ A Realidade da Implementação (Dificuldades)
Aqui estamos jogando no modo "Hard". O WhatsApp não quer que você faça isso.
1.  **Banimento de Número:** Se o número da campanha começar a enviar muita mensagem ou entrar em 500 grupos em 1 hora, ele **será banido**.
    *   *Mitigação:* Usar números "maduros" (antigos) e aquecidos. Nunca usar chip novo comprado na banca ontem.
2.  **Infraestrutura:** Você vira o "Dono do WhatsApp Web". A Evolution API consome muita RAM (sobe um Chrome Headless por sessão). Se tiver 50 candidatos, precisará de um servidor parrudo.
3.  **Quedas:** A conexão cai. O celular fica sem bateria, a sessão desconecta. O usuário precisa escanear o QR Code de novo com frequência.

### ✅ O Que Tenho Acesso (Nos Grupos Monitorados)
*   **Todas as Mensagens do Grupo:** Texto, Imagem, Áudio, Vídeo.
*   **Remetente:** O número de telefone de quem enviou cada mensagem.
*   **Metadados do Grupo:** Nome do grupo, lista de participantes (telefones), foto do grupo.

### ❌ O Que NÃO Tenho Acesso
*   **Status/Stories:** Não conseguimos ver os Status do WhatsApp dos participantes de forma confiável.
*   **Conversas Privadas (PV):** Não temos acesso ao que os membros falam uns com os outros fora do grupo.
*   **Grupos Não-Monitorados:** Se a liderança está em um grupo que nosso "Número Espião" não está, somos cegos.
*   **Status de Leitura:** Não rasteamos quem leu a mensagem (apenas quem enviou).

### Como Integrar (The Safe Way)
*   **Regra de Ouro:** **Apenas Leitura.** Não use o bot para mandar "Bom dia" em massa. Apenas escute (`messages.upsert`). Escutar não dá banimento (geralmente).
*   **Hardware:** Servidor VPS com pelo menos 8GB de RAM para segurar as instâncias Docker da Evolution API.

---

## Estratégia de Mitigação dos Riscos

| Risco | Solução PolitiRank |
| :--- | :--- |
| **Meta Review** | Submeter app logo na semana 1 de desenvolvimento. |
| **TikTok Privacy** | Focar dashboard do TikTok em "Visualizações" (sem dados pessoais). |
| **Whats Ban** | Implementar "Modo Silencioso" (Só recebe, nunca envia) e alertar o usuário. |
| **Custo Server** | Cobrar do cliente final o custo da infra (R$ por instância de WhatsApp). |

---

## Conclusão Atualizada
*   **Instagram:** É o **Coração** do sistema. Dados ricos, confiáveis, mas burocrático para aprovar.
*   **WhatsApp:** É o **Diferencial**. Arriscado, caro de manter, mas é onde a eleição se ganha. Exige cuidado técnico extremo.
*   **TikTok:** É o **Outdoor**. Serve para ver números grandes de visualização, mas é ruim para gerenciar militância individual.

**Recomendação:** Começar o desenvolvimento forte no **Instagram** (garantir o básico) e **WhatsApp** (o diferencial), deixando TikTok como um "extra" de visualização.
