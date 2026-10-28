# Tech Peças IA — alterações iniciadas

Esta versão transforma o antigo protótipo genérico em uma base mais próxima da proposta final do TCC.

## O que mudou

- Identidade visual e textos alterados para **Tech Peças IA**.
- Nova tela principal de busca com dois caminhos:
  1. **Meu carro está com problema** — marca, modelo, ano, versão e descrição do sintoma.
  2. **Já sei qual peça quero** — busca direta no catálogo, com filtro opcional por veículo.
- Novo endpoint `POST /api/diagnostico/analisar` usando Gemini para triagem educativa do problema.
- A IA agora retorna componentes possivelmente relacionados, motivo e termos para busca, sem afirmar diagnóstico definitivo.
- Novo endpoint `POST /api/pecas/pesquisar` para consultar peças reais cadastradas no banco.
- Novo endpoint `GET /api/pecas/:id/ofertas` para comparar ofertas cadastradas de fornecedores/parceiros.
- Estrutura SQL reorganizada com usuários, veículos, peças, compatibilidades, fornecedores, ofertas, histórico, consultas de IA e pedidos.
- O botão antigo de “adicionar ao carrinho” que não possuía carrinho real foi removido do fluxo principal.
- Histórico passou a diferenciar busca de peça e análise de problema.

## Antes de executar

1. Crie um arquivo `.env` baseado em `.env.example`.
2. Configure o MySQL e a chave `GOOGLE_API_KEY`.
3. Importe `iaautope#U00e7as.sql` no MySQL. Ele recria a estrutura do banco `techpecas`.
4. Rode `npm install` e depois `npm start`.
5. Abra `http://localhost:3000`.

## Importante

Os três produtos inseridos no final do SQL são **dados fictícios de demonstração do protótipo**, não preços de mercado. Eles servem apenas para testar a tela de catálogo e o filtro de compatibilidade. Devem ser substituídos por catálogo real posteriormente.

## Próximos marcos sugeridos

- Hash de senha e autenticação por sessão/token.
- Garagem do usuário com veículos salvos na interface.
- Carrinho e pedidos reais.
- Painel administrativo para cadastrar peças, compatibilidades e ofertas.
- Integrações reais com fornecedores/parceiros para preço e disponibilidade.
- Regra de desconto para compra dentro do Tech Peças IA.

## Melhoria de estabilidade da IA — V3

- Modelo principal padrão: `gemini-3.8-flash`.
- Modelo reserva padrão: `gemini-3.6-flash`.
- Retry automático para erros temporários como 408, 429 e 5xx (incluindo 503).
- Backoff exponencial com pequeno jitter entre as tentativas.
- Fallback automático para o modelo reserva quando o modelo principal continua indisponível.
- Erros permanentes, como chave de API inválida, não são escondidos por novas tentativas.
- Parâmetros de retry e modelos podem ser alterados pelo `.env`.
- Removida a opção `keepAliveInitialDelayMs` que gerava warning no MySQL2.

Configuração sugerida no `.env`:

```env
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.6-flash
GEMINI_RETRIES=2
GEMINI_RETRY_BASE_MS=1000
```
