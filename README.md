# JSONDiff

Compara dois arquivos JSON, destaca as diferenças **campo a campo** e permite levar as mudanças de um arquivo para o outro — aceitando, rejeitando ou ajustando cada uma antes de salvar o arquivo final.

Roda 100% no navegador: **nenhum dado é enviado para servidores**. Publicado via GitHub Pages.

## Como usar

1. Abra (ou arraste) os dois arquivos — é possível selecionar os dois de uma vez. Também dá para colar o texto.
2. Escolha a **direção**: `B → A` (as mudanças de B são aplicadas sobre A) ou `A → B`.
   - **Destino**: arquivo que será modificado (o resultado salvo é uma versão dele).
   - **Origem**: arquivo de onde vêm as mudanças.
3. Clique em **Comparar**. Cada diferença aparece na lista com seu caminho (ex.: `$.clientes[id=42].email`):
   - `~` **Alterado** — valor diferente nos dois arquivos
   - `+` **Adicionado** — existe só na origem (aceitar insere no destino)
   - `−` **Removido** — existe só no destino (aceitar remove do destino)
4. Para cada uma: **Aceitar**, **Rejeitar** ou **Editar** (define o valor que será gravado). Diferenças sem decisão não são aplicadas.
5. A aba **Resultado** mostra a prévia do arquivo final com tudo destacado: inserido, alterado, editado, removido (riscado), pendente.
6. **Salvar resultado…** mostra o resumo das decisões, pede confirmação e grava o arquivo (mantendo indentação e fim de linha do original, ou os que você escolher).

### Atalhos

| Tecla | Ação |
|---|---|
| `A` | Aceitar |
| `R` | Rejeitar |
| `E` | Editar valor (`Ctrl+Enter` aplica, `Esc` cancela) |
| `U` | Desfazer decisão |
| `J` / `↓` · `K` / `↑` | Próxima / anterior |
| `N` | Próxima pendente |

Para decidir em lote, filtre a lista (por tipo, status, caminho ou valor) e use **Aceitar todas** / **Rejeitar todas** — vale só para o que está visível. Ex.: filtrar `.email` e aceitar todas as mudanças de e-mail.

## Listas (arrays)

Os itens de uma lista são pareados entre os dois arquivos antes da comparação campo a campo:

- **Por campo identificador** (automático quando existe): procura um campo presente em todos os itens, com valor único — prioridade para `id`, `_id`, `uuid`, `codigo`, `code`, `cpf`, `cnpj`, `sku` etc. Mudança de ordem não conta como diferença.
- **Por conteúdo** (quando não há identificador): itens idênticos são casados mantendo a ordem (LCS / *patience diff*); os itens que sobram entre eles são pareados e comparados campo a campo, e os excedentes viram inserção/remoção. Assim, uma inserção no meio da lista não "desloca" todas as comparações seguintes.
- **Por posição**: 1º com 1º, 2º com 2º…

Na aba **Listas / identificadores** é possível trocar a estratégia de cada lista (ex.: escolher outro campo) e recomparar — as decisões já tomadas são mantidas.

## Arquivos grandes

O processamento (leitura, comparação, prévia e exportação) roda em um *Web Worker*, e as listas são virtualizadas. Testado com dois arquivos de 30 MB (40 mil registros): comparação em < 1 s, prévia de 1,7 milhão de linhas em ~1,5 s.

## Limitações conhecidas

- Chaves numéricas (`"1"`, `"2"`…) são reordenadas pelo próprio JavaScript para o início do objeto. O app avisa quando isso acontece.
- Inteiros maiores que 9.007.199.254.740.991 perdem precisão (também avisado).

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm test         # testes do núcleo de diff/mesclagem
npm run build    # gera dist/
```

Estrutura:

```
src/core/      diff, alinhamento de arrays, mesclagem e prévia (sem dependência de UI)
src/worker/    Web Worker que guarda os documentos e executa o trabalho pesado
src/ui/        componentes React
```

## Publicação (GitHub Pages)

O workflow `.github/workflows/deploy.yml` testa, compila e publica a cada push na `main`.
Na primeira vez, ative em **Settings → Pages → Build and deployment → Source: GitHub Actions**.
