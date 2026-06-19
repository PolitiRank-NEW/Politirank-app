# Instagram Scraper & Apify Integration (Phase 1)

Esta pasta contém a documentação técnica sobre como o PolitiRank extrai dados orgânicos do Instagram para alimentar o ranking de Lideranças e métricas de engajamento profundas.

## Visão Geral

Devido às restrições da API Oficial do Instagram (Meta Graph API) para perfis que não possuem login ou não são contas comerciais verificadas, o PolitiRank utiliza a plataforma **Apify** como um motor de extração secundário (Scraper).

### Casos de Uso
1.  **Monitoramento Orgânico**: Extração de comentários e interações de perfis públicos sem necessidade de token do Instagram.
2.  **Ranking de Lideranças**: Identificação de usuários reais que comentam e interagem nos posts dos candidatos.
3.  **Métricas de Comparação**: Obtenção de contagem de seguidores e posts de concorrentes.

## Arquitetura do Processo (Assíncrono)

Para garantir que o servidor não trave durante a extração (que pode levar de 30 a 90 segundos), a implementação segue um fluxo de **Polling**:

1.  **Início (`sync/route.ts`)**: O frontend solicita uma sincronização. Se o perfil for manual/scraper, chamamos o `apifyService.startScrapeRun`. Recebemos um `runId` e retornamos ao cliente com status `RUNNING`.
2.  **Monitoramento (`sync/status/route.ts`)**: O frontend pergunta periodicamente (a cada 5s) o status do `runId`.
3.  **Processamento (`sync/process/route.ts`)**: Quando o status é `SUCCEEDED`, o frontend chama a rota de processamento final, que lê o Dataset da Apify e salva no banco de dados.

## Segurança e Resiliência
-   **Proxies Residenciais**: Configuramos a Apify para usar proxies para evitar bloqueios do Instagram ("IP Blocked").
-   **IDs Fixos**: Utilizamos IDs de atores globais (ex: `nH2AHrwxeTRJoN5hX`) para evitar problemas com URLs dinâmicas.

---
*Próximos Passos: [Especificações da API](./api_specs.md) | [Mapeamento de Dados](./data_mapping.md)*
