# Evolution API em produção — Contabo 8 GB

Stack: **Evolution + Redis + Postgres** (Docker) na Contabo.  
App PoliticRank continua na **Vercel**. MongoDB Atlas não muda.

Plano sugerido: Contabo **Cloud VPS 4** (~8 GB RAM). Se precisar de mais candidatos, escala o plano depois.

---

## Quem faz o quê

| Você | Repo (já preparado) |
|------|---------------------|
| Contratar Contabo, DNS, SSH, secrets reais, Vercel env | `docker-compose.prod.yml`, `.env.production.example`, este guia |

---

## 1. Contabo

1. Crie conta em [contabo.com](https://contabo.com) e contrate **Cloud VPS 4** (8 GB).
2. Imagem: **Ubuntu 24.04** (ou 22.04).
3. Anote o **IP** e a senha/SSH key.
4. No painel Contabo / firewall: liberar **22**, **80**, **443**.

---

## 2. DNS

1. No seu domínio, crie registro **A**:
   - Nome: `evolution` (ou o subdomínio que preferir)
   - Valor: IP da Contabo
2. Espere propagar (pode levar alguns minutos).

URL final exemplo: `https://evolution.seudominio.com`

---

## 3. SSH + Docker na VPS

```bash
ssh root@SEU_IP_CONTABO

apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version
```

---

## 4. Subir a Evolution

Na sua máquina (ou clone na VPS):

```bash
# Na VPS, por exemplo:
mkdir -p /opt/politirank-evolution && cd /opt/politirank-evolution
# Copie da pasta docker/evolution do repo:
#   docker-compose.prod.yml
#   .env.production.example

cp .env.production.example .env.production
nano .env.production
```

Preencha no mínimo:

- `AUTHENTICATION_API_KEY` — chave longa aleatória (mesma no Vercel)
- `SERVER_URL=https://evolution.seudominio.com`
- `POSTGRES_PASSWORD` — senha forte (e **igual** na `DATABASE_CONNECTION_URI`)
- `WEBHOOK_GLOBAL_URL=https://SEU-APP.vercel.app/api/webhooks/whatsapp/evolution`

Subir:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f evolution-api
```

A API escuta só em `127.0.0.1:8080` (não exposta na internet sem HTTPS).

---

## 5. HTTPS com Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
evolution.seudominio.com {
    reverse_proxy 127.0.0.1:8080
}
```

```bash
systemctl reload caddy
```

Teste no browser: `https://evolution.seudominio.com` (Manager/API da Evolution).

---

## 6. Vercel (PoliticRank)

No projeto Vercel → Settings → Environment Variables:

| Variável | Valor |
|----------|--------|
| `EVOLUTION_API_URL` | `https://evolution.seudominio.com` |
| `EVOLUTION_API_KEY` | a mesma `AUTHENTICATION_API_KEY` |
| `EVOLUTION_WEBHOOK_URL` | `https://SEU-APP.vercel.app/api/webhooks/whatsapp/evolution` (opcional se o app já monta isso) |

Redeploy o app após salvar.

---

## 7. Teste ponta a ponta

1. Abra o PoliticRank em produção (view do candidato).
2. Conecte WhatsApp (QR) via Evolution.
3. Envie mensagem / Scanner Source e confira logs do webhook na Vercel.
4. Reinicie a VPS (`reboot`) e confirme que os containers voltam (`docker ps`).

---

## Comandos úteis

```bash
cd /opt/politirank-evolution
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f evolution-api
docker compose -f docker-compose.prod.yml --env-file .env.production restart evolution-api
docker compose -f docker-compose.prod.yml --env-file .env.production down
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Local (dev) continua com:

```bash
npm run evolution:up
```

---

## Escalar depois

Se vários candidatos com muitos grupos e a VPS ficar sem RAM:

1. No Contabo, faça upgrade (ex. plano com 16–24 GB).
2. Ou suba uma 2ª VPS e separe instâncias (mais avançado).

Scrapers IG/FB (Apify) **não** usam esta VPS — continuam na Vercel/Apify.

---

## Segurança (checklist)

- [ ] `.env.production` **não** vai para o Git
- [ ] Postgres **sem** porta pública (já no compose)
- [ ] Evolution só via HTTPS (Caddy)
- [ ] Chave API forte e igual na Vercel
- [ ] Firewall: 22/80/443 apenas (ou SSH só da sua IP)
