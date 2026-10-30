# Atmos 2.0 — Dashboard de descargas elétricas

Frontend React 18 + TypeScript + Vite + Recharts + React Leaflet, integrado ao contrato do backend NestJS fornecido.

## Instalação

Requisitos: Node.js 20+ e backend NestJS com MySQL configurado.

```bash
npm install
cp .env.example .env
npm run dev
```

No Windows: `copy .env.example .env`. Acesse http://localhost:5173.

Configure `VITE_API_URL=http://localhost:3000` (ou o endereço da sua API). Reinicie o Vite após alterar o `.env`. Também é possível alterar a URL na tela Configurações, armazenada no navegador.

## Rotas utilizadas

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET | `/lightning` | Até 1.000 eventos, com filtros opcionais de data e coordenadas |
| GET | `/lightning/analytics/summary` | Total, médias, extremos e distribuição de risco |
| GET | `/lightning/analytics/ranking?limit=15` | Ranking de cidades |
| GET | `/lightning/analytics/peak-hours` | Contagem por hora |
| POST | `/lightning/fetch` | Coleta manual |
| POST | `/lightning/backfill` | Importação com `{startDate:"YYYY-MM-DD",endDate:"YYYY-MM-DD"}` |

O frontend interpreta a entidade `LightningStrike`: `id`, `latitude`, `longitude`, `occurrenceDate`, `weatherCode`, `intensity`, `source`, `description`, `createdAt`. `latitude`, `longitude` e `intensity` são normalizados para número (MySQL DECIMAL pode chegar como string).

## Recursos

- Painel responsivo com indicadores reais da API, mapa Leaflet/OpenStreetMap/CARTO, gráfico por hora e tabela de eventos.
- Página de histórico com busca, filtros de risco/fonte, período e limites geográficos, paginação local e exportação CSV.
- Análises com distribuição de risco e ranking de cidades.
- Página de alertas históricos de intensidade alta; **não é alerta de segurança em tempo real**.
- Configurações da URL da API, tema claro/escuro, atualização automática a cada 60 segundos, coleta manual e backfill.
- Estados explícitos de carregamento/erro; **sem dados simulados**.

## Notas importantes sobre o backend enviado

1. `main.ts` já usa `app.enableCors()`; em produção, restrinja a origem autorizada.
2. Os endpoints POST de coleta e backfill não têm autenticação no controller fornecido. **Proteja-os antes de publicar a aplicação na internet**.
3. A API retorna até 1.000 eventos na listagem. O mapa e a tabela mostram apenas os eventos carregados, enquanto o resumo e as análises cobrem o histórico completo.
4. A classificação original do backend trata intensidade nula como BAIXO. A tabela exibe **Sem medição** para não apresentar uma medição inexistente; os totais analíticos mantêm o valor retornado pelo backend.
5. O backend usa códigos meteorológicos e intensidade estimada a partir de condições meteorológicas, não medições diretas de descargas individuais. Não use como sistema certificado de proteção contra raios.
6. O gráfico de horários representa agregação por hora do dia de **todo o histórico**, não das últimas 24 horas.
7. O filtro de datas só é aplicado pelo backend quando início e fim são informados. Coordenadas só são aplicadas quando os quatro limites são fornecidos.
8. A coleta automática no backend ocorre a cada 10 minutos. A atualização de 60 segundos do frontend só consulta a API; não inicia coleta.
9. A importação histórica pode demorar; o frontend permite até 15 minutos para o backfill (18 s para as demais solicitações). Ajuste em `src/api.ts` conforme sua infraestrutura. A resposta do serviço conta registros tentados, que podem incluir duplicados ignorados por `INSERT IGNORE`.

## Build de produção

```bash
npm run build
npm run preview
```

Publique a pasta `dist/` em um servidor estático, configurando `VITE_API_URL` antes do build. O mapa requer internet para carregar os tiles.
