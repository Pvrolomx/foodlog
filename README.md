# FoodLog 🍽️

Memoria gastronómica compartida de Rolo & Claudia.

## Stack
- **Next.js 14** (Pages Router)
- **Supabase** — Postgres + Storage
- **Vercel** — deploy + serverless API
- **Claude Haiku** — identifica platillos por foto

## Setup local

```bash
npm install
cp .env.local .env.local   # llenar variables
npm run dev
```

## Variables de entorno (Vercel)

| Variable | Dónde la encuentras |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Project Settings > API |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API Keys |

## Deploy

1. Push a GitHub (`pvrolomx/foodlog`)
2. Importar en Vercel
3. Agregar las 3 variables de entorno
4. Dominio custom: `foodlog.expatadvisormx.com`

## Namecheap DNS (ya configurado)
```
Host: foodlog
Type: CNAME
Value: cname.vercel-dns.com
```
