# Relatório Técnico de Implementação - PolitiRank

## 1. Visão Geral
Este documento detalha as alterações técnicas, arquiteturais e de interface realizadas no projeto PolitiRank. O foco das atualizações foi a migração para um Design System robusto (Shadcn UI), correção de dívidas técnicas em renderização (Server Components vs Client Components) e implementação de fluxos de gerenciamento de candidatos.

## 2. Alterações de Banco de Dados (Prisma ORM)
Atualização do schema `schema.prisma` para suportar o perfil estendido de candidatos.
- **Entidade `CandidateProfile`**: Criada para armazenar métricas específicas (votos, intenção, rejeição) e vincular-se à tabela `User` (relação 1:1).
- **Entidade `SocialProfile`**: Criada para normalizar o armazenamento de redes sociais (Instagram, Facebook, TikTok), permitindo escalabilidade para novas plataformas sem alteração de colunas na tabela pai.
- **Enum `Role`**: Expansão dos papéis de usuário (`SUPER_ADMIN`, `ADMIN`, `DIRIGENTE`, `LIDER_CHAPA`, `CANDIDATO`) para controle de acesso granular (RBAC).

## 3. Arquitetura de Interface (Front-end)
A interface foi refatorada para eliminar componentes legados e adotar o ecossistema **Shadcn UI** (baseado em Radix UI e Tailwind CSS), garantindo acessibilidade e consistência visual.

### 3.1. Dashboard (`app/dashboard/page.tsx`)
- **Problema Anterior**: Uso incorreto de imports dinâmicos (`await import`) dentro do fluxo de renderização JSX, causando erros de sintaxe e falhas de compilação ("Expression expected").
- **Solução**: Refatoração para imports estáticos (ES Modules) no topo do arquivo, seguindo as melhores práticas do Next.js.
- **Funcionalidade**: Implementação de renderização condicional baseada em roles (`userRole`). Usuários administrativos são redirecionados, enquanto candidatos visualizam um dashboard de métricas (Cards com ícones Lucide).

### 3.2. Listagem de Candidatos (`CandidateList.tsx`)
- **Componentes**: Migração de tabelas HTML nativas para o componente `Table` do Shadcn, garantindo responsividade e estilos padronizados.
- **Interatividade**:
    - **Busca**: Adição de barra de busca com filtragem em tempo real (client-side) por nome e email.
    - **Tooltips**: Implementação de `Tooltip` (Radix UI) nos botões de ação para melhorar a usabilidade e fornecer contexto sem poluir a interface visual.
- **Estilização**:
    - **Ícones Sociais**: Ícones (Lucide React) com lógica condicional de cor: coloridos quando o perfil existe, cinza/inativos quando ausente.
    - **Feedback Visual**: Cursor pointer explícito em elementos interativos (`cursor-pointer`) via Tailwind.

### 3.3. Modais de Gerenciamento (`AddCandidateModal` e `EditCandidateModal`)
- **Mudança Estrutural**: Substituição de componentes modais customizados genéricos pelo primitivo `Dialog` do Radix UI.
- **Correção de Estilo**: Aplicação forçada de classes `bg-white` e `text-gray-900` nos inputs e containers do modal. O tema padrão estava herdando estilos escuros do sistema/navegador ou conflitando com variáveis CSS globais, tornando os campos ilegíveis (fundo preto).
- **Gerenciamento de Estado**: Utilização do hook `useFormState` (React DOM) para gerenciamento de estado de Server Actions, permitindo feedback de erro/sucesso assíncrono.

### 3.4. Layout Global (`layout.tsx`)
- **Navegação**: Implementação de `DropdownMenu` no perfil do usuário no cabeçalho.
- **Funcionalidade**: Agrupamento das ações de contexto (Visualizar Perfil, Logout) em um menu acessível, substituindo botões dispersos e melhorando a densidade de informação do header.

## 4. Dependências Adicionadas
- **UI Primitives**: `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-popover`.
- **Ícones**: `lucide-react` para iconografia consistente e vetorial (SVG).
- **Utilitários**: `clsx` e `tailwind-merge` (via `lib/utils.ts`) para gestão segura de classes CSS condicionais e resolução de conflitos de especificidade.
