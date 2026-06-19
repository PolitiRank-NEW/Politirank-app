# Mapeamento de Dados e Regras de Negócio

Este documento descreve como os dados JSON vindos da Apify são processados e salvos no banco de dados MongoDB (via Prisma) para gerar os rankings do PolitiRank.

## 1. Dados do Perfil (Candidate Profile)

O sistema busca campos de contagem de seguidores e posts globais para atualizar a saúde do perfil do candidato.

| Campo Apify | Modelo Prisma | Destino |
|:--- |:--- |:--- |
| `ownerFollowers` | `CandidateProfile` | `instagramFollowers` |
| `ownerPostsCount` | `CandidateProfile` | `instagramPosts` |
| `resultsCount` | (Informativo) | Log de processamento |

## 2. Postagens (MediaPost)

Cada item raiz do dataset da Apify é considerado um post.

| Campo Apify | Modelo Prisma | Observação |
|:--- |:--- |:--- |
| `id` / `shortCode` | `MediaPost.metaMediaId` | Chave única para evitar duplicados |
| `caption` | `MediaPost.caption` | Texto da legenda |
| `likesCount` | `MediaPost.likesCount` | Curtidas totais até o momento da extração |
| `commentsCount` | `MediaPost.commentsCount` | Comentários totais no Instagram |
| `timestamp` | `MediaPost.postedAt` | Data original da postagem |

## 3. Comentários e Lideranças (UserInteraction)

Esta é a parte central para o ranking de Lideranças. O sistema itera sobre o array `latestComments`.

### Lógica de Score
- O sistema busca por uma interação existente usando `username` + `candidateId`.
- Se não existir: Cria um registro com `interactionScore: 1`.
- Se existir: Faz um `update` adicionando +1 ao score (`$add` no MongoDB).

| Campo Apify | Modelo Prisma | Uso |
|:--- |:--- |:--- |
| `ownerUsername` | `UserInteraction.username` | Nome exibido no ranking de lideranças |
| `ownerId` | `UserInteraction.metaUserId` | Identificador interno para cruzamento |
| `text` | `Comment.text` | Conteúdo do comentário para análise |
| `timestamp` | `UserInteraction.lastInteractedAt` | Data da última interação válida |

## 4. Algoritmo de Prevenção de Dados Falsos

No arquivo `app/api/instagram/sync/process/route.ts`, implementamos as seguintes proteções:

1.  **Unique Meta IDs**: Cada comentário possui um ID único do Meta. Se o ID já existir, o sistema ignora a inserção para não inflar o ranking artificialmente.
2.  **Isolamento de Erros**: O processamento de um comentário ocorre dentro de um `try/catch`. Se os dados de um seguidor vierem corrompidos, o sistema pula para o próximo sem interromper a sincronização dos outros.
3.  **Filtragem de Atributos**: Somente campos validados (`id`, `username`, `text`) são aceitos. Se o scraper retornar dados privados ou truncados, o registro é descartado.

---
*Anterior: [Especificações da API](./api_specs.md) | [Home](./README.md)*
