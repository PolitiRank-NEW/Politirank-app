# Guia de Implementação: Integração Meta (Instagram & Facebook)

Este guia é para o desenvolvedor que vai sentar agora e codar a conexão.

---

## ⚠️ Pré-requisitos
1.  **Conta de Desenvolvedor Facebook:** [developers.facebook.com](https://developers.facebook.com/)
2.  **Ngrok:** Para testar localhost com HTTPS (Obrigatório para o Facebook não bloquear o callback).
3.  **App JavaScript/Node.js:** Vamos usar exemplos em Node.js.

---

## Passo 1: Criar o App no Painel
1.  Vá em **My Apps** > **Create App**.
2.  Tipo: **Business** (Negócios).
3.  Detalhes: Nome "PolitiRank Dev", Email.
4.  No painel do App, adicione o produto: **Facebook Login for Business**.

**Configurações Importantes (Settings > Basic):**
*   **App ID e App Secret:** Copie isso para seu `.env`.
*   **App Domain:** `localhost` (para dev).
*   **Privacy Policy URL:** Coloque qualquer URL válida (ex: `https://politirank.com/privacy`) para passar na validação.

**Configurações do Login (Facebook Login > Settings):**
*   **Valid OAuth Redirect URIs:**
    *   `https://seu-ngrok.ngrok-free.app/auth/facebook/callback`
    *   `http://localhost:3000/auth/facebook/callback` (Só funciona se o App estiver em modo "Development").

---

## Passo 2: O Código de Autenticação (Backend)
Você precisa de duas rotas: uma para mandar o user para o Facebook e outra para receber o código.

### Rota 1: Redirecionar para Login
```javascript
const APP_ID = process.env.FB_APP_ID;
const REDIRECT_URI = 'https://seu-ngrok.ngrok-free.app/auth/facebook/callback';
const SCOPE = 'pages_show_list,instagram_basic,instagram_manage_insights,pages_read_engagement';

// Quando o user clica em "Conectar Instagram"
router.get('/auth/facebook', (req, res) => {
    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPE}&response_type=code`;
    res.redirect(url);
});
```

### Rota 2: Callback (Trocar Code por Token)
```javascript
const axios = require('axios');

router.get('/auth/facebook/callback', async (req, res) => {
    const { code } = req.query;

    try {
        // 1. Troca CODE por SHORT-LIVED TOKEN
        const tokenParams = {
            client_id: process.env.FB_APP_ID,
            client_secret: process.env.FB_APP_SECRET,
            redirect_uri: REDIRECT_URI,
            code: code
        };
        const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', { params: tokenParams });
        const shortToken = tokenRes.data.access_token;

        // 2. Troca por LONG-LIVED TOKEN (60 dias)
        // Isso é CRUCIAL para não deslogar o candidato todo dia.
        const longTokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FB_APP_ID,
                client_secret: process.env.FB_APP_SECRET,
                fb_exchange_token: shortToken
            }
        });
        const longToken = longTokenRes.data.access_token;

        // SALVE ESTE TOKEN NO BANCO DE DADOS JUNTO COM O ID DO CANDIDATO!
        await saveTokenToDatabase(req.user.id, longToken);

        res.send('Conectado com sucesso! Token guardado.');

    } catch (error) {
        console.error('Erro no login:', error.response.data);
        res.status(500).send('Erro ao conectar.');
    }
});
```

---

## Passo 3: Buscas os IDs Necessários
Com o Token salvo, o primeiro passo é descobrir QUEM é o usuário no Instagram.

```javascript
async function getInstagramId(accessToken) {
    // Busca as páginas que o user administra e vê se tem Insta conectado
    const res = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
        params: {
            access_token: accessToken,
            fields: 'name,instagram_business_account{id,username}'
        }
    });

    const page = res.data.data.find(p => p.instagram_business_account);
    if (!page) throw new Error('Nenhuma conta Instagram Business vinculada!');

    return page.instagram_business_account.id; // ESSE É O ID QUE PRECISAMOS PARA TUDO!
}
```

---

## Passo 4: Coleta de Dados (O Worker)
Agora você pode criar uma função que roda todo dia às 00:00.

```javascript
async function collectDailyMetrics(igUserId, accessToken) {
    // 1. Pega dados do Perfil
    const profileRes = await axios.get(`https://graph.facebook.com/v19.0/${igUserId}`, {
        params: {
            access_token: accessToken,
            fields: 'followers_count,media_count'
        }
    });

    // 2. Pega Posts Recentes
    const feedRes = await axios.get(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        params: {
            access_token: accessToken,
            fields: 'like_count,comments_count,timestamp,media_type'
        }
    });

    // Processa e Salva
    console.log(`Coletados ${feedRes.data.data.length} posts.`);
    // TODO: Salvar no Postgres na tabela 'daily_metrics'
}
```

---

## Dica de Ouro: Erros Comuns
1.  **"Application does not have permission..."**: Você esqueceu de adicionar o seu usuário como "Developer" ou "Tester" no painel da Meta, ou o App ainda está em modo "Development" e você tentou logar com um user de fora.
2.  **"URL Blocked"**: A URL de callback no código não bate EXATAMENTE com a cadastrada no painel da Meta. `http` vs `https` faz diferença.
