# Monitoramento de Descargas Atmosféricas (Weather Dash)
### Projeto Integrador II — UNIVESP

Monitoramento e análise de incidência de raios em 15 capitais brasileiras, desenvolvido em parceria técnica com a Manhattan Eletronic (SPDA).

---

## Contexto e Continuidade (PI1 → PI2)

No **Projeto Integrador I**, construímos um primeiro protótipo funcional para mapear e consultar ocorrências de raios a partir de dados meteorológicos externos.

Nesta fase do **Projeto Integrador II**, reestruturamos o backend para transformar essa aplicação em um sistema analítico robusto, implementando:
- Armazenamento dos registros meteorológicos em banco de dados em nuvem;
- Ingestão automatizada de dados em tempo real e carga histórica de tempestades via APIs externas;
- Rotas analíticas por capitais, horários críticos e ranking de intensidade das descargas;
- Testes unitários automatizados para garantir a precisão dos cálculos e das faixas de risco.

---

## Tecnologias e Arquitetura (Backend)

* **Plataforma:** Node.js com TypeScript
* **Framework:** NestJS
* **Persistência / ORM:** TypeORM integrado ao TiDB Cloud
* **Testes:** Jest
* **Fontes de Dados:**
  * *OpenWeatherMap:* Monitoramento contínuo em tempo real via agendamento.
  * *Open-Meteo Archive:* Ingestão de séries meteorológicas históricas.

---