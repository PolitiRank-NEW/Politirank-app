# PolitiRank 🗳️

Plataforma de inteligência de dados para campanhas políticas, focada em métricas de redes sociais e engajamento.

## 🚀 Visão do Produto

O PolitiRank resolve a dificuldade de centralizar dados de múltiplas redes sociais (Instagram, Facebook, Whatsapp) para candidatos políticos. Ele oferece uma hierarquia de acesso rigorosa, permitindo que partidos e chapas gerenciem seus candidatos, enquanto cada candidato tem uma visão focada de seu próprio desempenho.

## 🏗️ Arquitetura Técnica

### Stack
- **Frontend**: Next.js 14+ (App Router), React, TailwindCSS.
- **Backend**: Next.js API Routes.
- **Database**: MongoDB Atlas via Prisma ORM.
- **Auth**: NextAuth.js (v5) com Role-Based Access Control (RBAC).

### Design Pattern (Frontend)
Utilizamos **Atomic Design** para organização de componentes:
- **Atoms**: Componentes indivisíveis (Botões, Inputs, Labels).
- **Molecules**: Agrupamentos simples (Campos de formulário, Linhas de tabela).
- **Organisms**: Seções complexas da interface (Tabelas, Formulários, Headers).
- **Templates/Pages**: Layouts e Páginas finais.

A lógica é separada da view através de **Custom Hooks** e a comunicação com o backend é centralizada via **Axios Services**.

## 👥 Perfis de Acesso

1.  **SUPER_ADMIN (Equipe PolitiRank)**: Acesso total ao sistema.
2.  **ADMIN (Secretária)**: Gestão operacional, sem deletar dados críticos.
3.  **DIRIGENTE (Líder Partidário)**: Vê e gerencia todos os candidatos do seu Partido.
4.  **LIDER_CHAPA**: Vê e gerencia candidatos da sua Chapa específica.
5.  **CANDIDATO**: Acesso restrito apenas aos seus próprios dados.

## 🛠️ Como Rodar

1.  **Instalar dependências:**
    ```bash
    npm install
    ```
2.  **Configurar Banco:**
    - Crie um arquivo `.env` com `MONGO_URI` e `AUTH_SECRET`.
    - Gere o cliente Prisma: `npx prisma generate`.
    - Popule o banco: `npx tsx prisma/seed.ts`.
3.  **Rodar Projeto:**
    ```bash
    npm run dev
    ```
