# Ação Clara

Protótipo educacional para analisar ações brasileiras a partir de preços históricos. Não é recomendação de investimento.

## Executar

Requer Python 3.10+ e acesso à internet.

```bash
python -m venv .venv
source .venv/bin/activate # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Abra http://localhost:8000. Para trocar a porta, defina a variável `PORT`.

## Fonte e limitações

Pesquisa e histórico diário obtidos dos endpoints públicos não oficiais do Yahoo Finance. Disponibilidade, abrangência, qualidade e continuidade não são garantidas; sujeito aos termos do Yahoo Finance e a restrições de licença ou uso comercial — verifique antes de publicar ou comercializar. O histórico usa o campo `adjclose` fornecido pelo Yahoo, normalmente ajustado para dividendos e desdobramentos segundo a metodologia da fonte; não há verificação independente desses ajustes. Caso não exista, a análise é recusada. O dia corrente é excluído para evitar o uso de uma cotação ainda em formação. A fonte pode sofrer atrasos ou revisões.

## Método

Regressão logística padronizada com retornos de 5, 20 e 60 pregões, volatilidade de 20 e distância das médias de 20 e 60, calculados apenas com fechamento ajustado até a data de referência. O volume é obtido quando fornecido, mas não é utilizado pelo modelo. Rótulo de alta: fechamento ajustado futuro estritamente maior; igualdade é “não subiu”. Não são considerados fatores externos.

Validação progressiva em quatro blocos cronológicos. Para cada bloco, o treino usa apenas amostras cujo rótulo já era conhecido antes do primeiro dia do bloco (expurgo do horizonte), sem atualização dentro do bloco. Métricas nas previsões fora da amostra: acerto direcional, Brier (quanto menor melhor), comparação com a frequência de alta do treino e tabela de calibração. Faixas têm amostras sobrepostas no tempo, portanto não devem ser tratadas como observações independentes. O modelo final usa todos os rótulos conhecidos até o último fechamento disponível; dados de teste não são usados para escolher hiperparâmetros. A validação descreve o passado e não garante o futuro. Sem simulação de compra/venda.

## Testes

```bash
python -m unittest discover -s tests
```

## Publicar na Vercel

Esta versão exporta uma aplicação Flask (`app` em `app.py`) para as rotas da API e coloca os arquivos públicos em `public/`, servidos pela CDN da Vercel. A pasta `static/` continua sendo usada pelo servidor local. Ao alterar o frontend, mantenha as duas pastas sincronizadas.

1. Coloque o conteúdo desta pasta na raiz do repositório GitHub (ou configure-a como Root Directory na Vercel).
2. Na Vercel, crie um projeto importando o repositório. O framework Flask deve ser detectado pelo `requirements.txt`.
3. Faça o deploy, abra o endereço e teste a pesquisa e uma análise.

Nenhuma chave de API é necessária para a fonte atual. O acesso à fonte não oficial pode ser bloqueado ou limitado, inclusive pela origem das requisições; os termos e limites da Vercel e da fonte devem ser verificados antes de uso público/comercial. O primeiro acesso pode demorar pela inicialização e os pacotes científicos aumentam o tamanho da função. Veja os logs do deployment e da função se houver falhas.
