# Instagram Analytics Phase 2: Inteligência e Performance

A Fase 2 foca em transformar dados brutos em inteligência estratégica, adicionando camadas de análise qualitativa (sentimento) e métricas de influência, mantendo o sistema leve e escalável.

## Melhorias de Performance (Scraper)

Para buscar o "máximo de dados significativos" com o melhor tempo de resposta:

1.  **Expansão do Raio de Busca**: Aumentamos de 5 para **15 posts** recentes por sincronização. Isso permite capturar tendências de engajamento de longo prazo.
2.  **Densidade de Comentários**: O sistema agora captura até **50 comentários por post** (via `resultsLimit` e `latestComments`), focando nos dados que já acompanham o objeto do post para evitar latência de rede.
3.  **Proxy Residencial**: Utilizado como padrão para garantir que o volume triplicado de dados não resulte em bloqueios do Instagram.

## Motor de Inteligência: Análise de Sentimento (Rule-Based)

Implementamos um motor de análise léxica em `services/sentimentUtils.ts` que classifica comentários instantaneamente.

### Mapeamento de Pontuação (DB Schema)
O banco de dados utiliza um campo `Float` para o sentimento, permitindo precisão matemática:
- **Positivo (`1.0`)**: Detectado através de palavras-chave como "linda", "parabéns", "voto", "melhor", e emojis como 🔥, ❤️, 🚀.
- **Neutro (`0.0`)**: Comentários sem palavras-chave específicas ou apenas emojis genéricos.
- **Negativo (`-1.0`)**: Detectado por termos como "lixo", "mentira", "vergonha", "pessimo".

> [!NOTE]
> Optamos por um dicionário local em vez de IA externa para garantir **zero custo adicional** e **performance de milissegundos**, permitindo processar milhares de comentários sem "pesar" a API.

## Algoritmo de Ranking Ponderado (Lideranças)

O ranking não conta apenas "número de comentários", mas sim o **Engajamento Qualitativo**.

### 1. Multiplicador de Sentimento
- **Comentários Positivos**: Multiplicador **2.0x**. (Dobram a velocidade de subida no ranking).
- **Comentários Negativos**: Multiplicador **0.5x**. (Penalização, mantendo a pessoa no ranking, mas no fim da lista).

### 2. Multiplicador de Influência (Proxy de Curtidas)
Como o Scraper de posts não traz o seguidor de cada autor, usamos as **curtidas no comentário** como proxy de influência.
- **Lógica**: `Multiplier = 1 + log10(comment_likes + 1)`
- **Por que**: Comentários de perfis influentes ou que ressoam com a comunidade recebem muitas curtidas do público, subindo organicamente no algoritmo do Instagram e no nosso ranking.

## Exemplo de JSON de Processamento (Logs)

Durante a sincronização, você verá o seguinte detalhamento no console:
```text
[SYNC] Comment Analysis (@rissosfonseca): Sentimento: 0.0, Peso: 1.0, Influência: 2.1, Score Final: +2
[SYNC] Comment Analysis (@forevervirginiaf): Sentimento: 1.0, Peso: 2.0, Influência: 3.2, Score Final: +6
```

---
*Anterior: [Mapeamento de Dados](./data_mapping.md) | [Home](./README.md)*
