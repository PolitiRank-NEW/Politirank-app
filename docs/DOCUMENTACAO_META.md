# Documentação de Integração Meta (Instagram & Facebook)

Este documento detalha o processo de integração com a API da Meta (Facebook e Instagram), as permissões necessárias e a estrutura das rotas da API desenvolvidas.

## 1. Visão Geral da Autenticação

A integração utiliza o protocolo OAuth 2.0 para autenticar usuários e obter acesso às suas Páginas do Facebook e Contas Comerciais do Instagram vinculadas.

### Fluxo de Autenticação:
1.  O usuário clica em "Conectar com Instagram".
2.  É redirecionado para a URL de Autorização do Facebook.
3.  O usuário aprova as permissões solicitadas.
4.  O Facebook redireciona de volta para `/api/auth/facebook/callback` com um código de autorização (`code`).
5.  O backend troca esse código por um Token de Acesso de Curta Duração (valido por 1 hora).
6.  O backend trocar imediatamente esse token por um Token de Longa Duração (valido por 60 dias).
7.  O sistema busca a Página do Facebook e a Conta do Instagram associada.
8.  As credenciais (`access_token`, `instagram_business_id`) são salvas no banco de dados.

## 2. Permissões (Scopes) Necessárias

As seguintes permissões são solicitadas ao usuário durante o login. Todas são obrigatórias para o funcionamento do painel.

*   `business_management`: Permissão genérica para gerenciar ativos de negócios.
*   `pages_show_list`: Necessário para listar as Páginas do Facebook que o usuário administra.
*   `pages_read_engagement`: Necessário para ler dados de engajamento da Página e metadados.
*   `instagram_basic`: Permite ler informações básicas de contas do Instagram Business (perfil, mídia).
*   `instagram_manage_insights`: Permite acessar as métricas e insights (alcance, impressões, seguidores) do Instagram.

## 3. Endpoints da API Meta Utilizados

O serviço `MetaService` consome os seguintes endpoints da Graph API (v19.0):

### Autenticação
*   `GET /oauth/access_token`: Troca o código por token e obtém token de longa duração.

### Descoberta de Contas
*   `GET /me/accounts`: Lista as páginas do usuário.
    *   Campos: `name`, `instagram_business_account{id,username}`.
    *   Lógica: O sistema filtra a primeira página que possui uma conta do Instagram Business vinculada.

### Dados do Perfil
*   `GET /{instagram_business_id}`: Obtém detalhes públicos do perfil.
    *   Campos: `biography`, `id`, `username`, `website`, `profile_picture_url`, `followers_count`, `follows_count`, `media_count`, `name`.

### Insights (Métricas)
*   `GET /{instagram_business_id}/insights`: Obtém estatísticas de desempenho.
    *   Métricas Diárias (últimos 28 dias): `impressions`, `reach`, `profile_views`.
    *   Demografia (tempo total): `audience_city`, `audience_country`, `audience_gender_age`.
    *   Histórico (Série Temporal): Solicita `impressions` e `reach` com parâmetros `since` e `until` para construir o gráfico de evolução.

### Mídia (Posts)
*   `GET /{instagram_business_id}/media`: Obtém os posts mais recentes.
    *   Campos: `caption`, `media_type`, `media_url`, `thumbnail_url`, `permalink`, `timestamp`, `like_count`, `comments_count`.

## 4. Rotas da API Interna

O Frontend consome os dados através da seguinte rota interna:

### `GET /api/instagram/insights`

Retorna um objeto JSON consolidado com todos os dados necessários para o dashboard.

**Estrutura da Resposta:**

```json
{
  "profile": {
    "username": "usuario",
    "name": "Nome Completo",
    "biography": "Bio do perfil...",
    "profile_picture_url": "https://...",
    "followers": 1000,
    "following": 500,
    "postsCount": 50
  },
  "insights": {
    "reach": 1500, // Alcance total (28 dias)
    "impressions": 3000, // Impressões totais (28 dias)
    "profileViews": 200 // Visitas ao perfil (28 dias)
  },
  "engagement": {
    "totalLikes": 500, // Soma das curtidas dos últimos posts
    "totalComments": 50, // Soma dos comentários dos últimos posts
    "avgLikes": 50, // Média de curtidas por post
    "engagementRate": 5.5 // Taxa calculada: (Interações / Seguidores) * 100
  },
  "media": [
    {
      "id": "123...",
      "caption": "Legenda do post...",
      "media_type": "IMAGE", // ou VIDEO, CAROUSEL_ALBUM
      "media_url": "https://...",
      "permalink": "https://instagram.com/p/...",
      "like_count": 100,
      "comments_count": 10,
      "timestamp": "2024-02-10T..."
    }
    // ... lista dos últimos posts
  ],
  "audience": {
    "city": { "São Paulo": 500, "Rio de Janeiro": 200 },
    "country": { "BR": 1000 },
    "gender_age": { "F.25-34": 300, "M.25-34": 200 }
  },
  "history": [
    {
      "date": "01/02",
      "reach": 120,
      "impressions": 250
    },
    // ... lista diária dos últimos 30 dias se disponível
  ]
}
```

### Tratamento de Falhas

*   Caso o token expire ou não seja encontrado, a API retorna erro 401 ou 404, instruindo o usuário a reconectar.
*   Caso o histórico não esteja disponível (limitação da Meta para novas conexões), o campo `history` pode retornar um array vazio. O frontend deve tratar isso exibindo uma mensagem de "Dados insuficientes".

## 5. Como Configurar (Desenvolvimento)

1.  Criar um App no [Meta for Developers](https://developers.facebook.com/).
2.  Configurar o produto "Instagram Graph API".
3.  Adicionar as permissões listadas acima no "App Review" (ou usar usuários de teste/admin para desenvolvimento).
4.  Obter `App ID` e `App Secret`.
5.  Adicionar no `.env`:
    ```
    APP_ID_META=seu_app_id
    APP_SECRET_META=seu_app_secret
    ```
6.  Adicionar a URL de callback nas configurações do App Meta: `http://localhost:3000/api/auth/facebook/callback`.
