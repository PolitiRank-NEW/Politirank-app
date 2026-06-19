# Especificações Técnicas: Apify Integration

Este documento detalha os endpoints, payloads e formatos de dados utilizados na integração com a Apify.

## Detalhes do Robô (Actor)

- **Nome Comercial**: Instagram Post Scraper (Export Instagram Comments and Posts Tool)
- **ID Fixo**: `nH2AHrwxeTRJoN5hX`
- **Slug**: `apify/instagram-post-scraper`

## 1. Iniciando uma Execução (POST)

**Endpoint**: `https://api.apify.com/v2/acts/nH2AHrwxeTRJoN5hX/runs?token={{APIFY_API_TOKEN}}`

### Request Payload (JSON)
```json
{
  "username": ["virginia"],
  "resultsLimit": 5,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

### Response (201 Created)
```json
{
  "data": {
    "id": "Jk5mr9FUfNUWnGAcU",
    "status": "RUNNING",
    "defaultDatasetId": "VuHWdhGv09EO7Tq0i"
  }
}
```

## 2. Monitorando o Status (GET)

**Endpoint**: `https://api.apify.com/v2/acts/nH2AHrwxeTRJoN5hX/runs/{{runId}}?token={{APIFY_API_TOKEN}}`

### Respostas Possíveis
- `RUNNING`: Em processamento.
- `SUCCEEDED`: Extração concluída com sucesso.
- `FAILED`: Erro na extração ou bloqueio do Instagram.
- `TIMED-OUT`: O processo demorou mais que o permitido (limite default: 300s).

## 3. Obtendo os Dados (Dataset)

Após o status ser `SUCCEEDED`, os dados são lidos do Dataset:
**Endpoint**: `https://api.apify.com/v2/datasets/{{datasetId}}/items?token={{APIFY_API_TOKEN}}`

### Formato de Saída Simplificado (JSON)
```json
[
  {
    "id": "3868631935287612217",
    "ownerUsername": "virginia",
    "ownerFollowers": 49000000,
    "caption": "Família é o meu porto seguro...",
    "likesCount": 2724382,
    "commentsCount": 1500,
    "latestComments": [
      {
        "id": "18121728766621851",
        "text": "Família linda 😍😍😍",
        "ownerUsername": "jujunorremose",
        "ownerId": "1653824908",
        "timestamp": "2024-04-15T19:47:16.000Z"
      }
    ]
  }
]
```

---
*Anterior: [Visão Geral](./README.md) | Próximo: [Mapeamento de Dados](./data_mapping.md)*
