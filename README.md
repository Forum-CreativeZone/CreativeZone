# Fórum Adrenaline — Community

Aplicação React/Vite baseada na estrutura extraída do projeto Figma.

## Desenvolvimento
npm install
npm run dev

## Build
npm run build

A pasta dist/ é o artefato de produção.

## Cloudflare Pages
Framework: Vite
Build command: npm run build
Output directory: dist
Node: 20+

Os assets extraídos do Figma ficam em assets/figma/ e não dependem de URLs temporárias em runtime.

Estado atual: navegação responsiva, busca, tópicos recentes/populares, atividade lateral, modal de novo tópico, editor básico, abertura de tópico e layout desktop/mobile.