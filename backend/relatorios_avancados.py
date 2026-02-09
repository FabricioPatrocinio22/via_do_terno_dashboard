import json
import os
from datetime import datetime, timedelta
from collections import defaultdict
import pandas as pd # Opcional: Se quiser exportar para Excel, senão removemos

CACHE_FILE = "cache_pedidos.json"

def carregar_dados():
    if not os.path.exists(CACHE_FILE):
        print("⚠️ Arquivo de cache não encontrado. Rode o dashboard primeiro para gerar dados.")
        return {}
    
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def gerar_relatorios():
    dados = carregar_dados()
    if not dados: return

    print(f"📊 Analisando {len(dados)} pedidos do cache...\n")

    # --- ESTRUTURAS DE DADOS ---
    vendas_por_estado = defaultdict(float)
    vendas_por_cidade = defaultdict(float)
    
    produtos_tamanho_cor = defaultdict(int) # Para saber o que mais sai (Ex: Terno G Azul)
    
    clientes_ultima_compra = {} # Para o Churn (Inativos)
    
    hoje = datetime.now()

    # --- PROCESSAMENTO ---
    for pedido_id, detalhe in dados.items():
        # 1. SEGMENTAÇÃO GEOGRÁFICA
        estado = detalhe.get('estadoSigla', 'N/A')
        cidade = detalhe.get('cidadeNome', 'N/A')
        
        # Somar valor total do pedido para a região
        valor_total = float(detalhe.get('valorTotalFinal', 0))
        vendas_por_estado[estado] += valor_total
        vendas_por_cidade[f"{cidade}-{estado}"] += valor_total

        # 2. SEGMENTAÇÃO POR PRODUTO (TAMANHO/COR)
        # O campo 'produtoDerivacaoNome' geralmente traz "Cor / Tamanho"
        itens = detalhe.get('arrayPedidoRastreio', [])
        for rastreio in itens:
            for item in rastreio.get('pedidoItem', []):
                nome_base = item.get('produtoNome', 'Item')
                # AQUI ESTÁ O SEGREDO DO TAMANHO:
                variacao = item.get('produtoDerivacaoNome', '') 
                
                chave_produto = f"{nome_base} [{variacao}]" if variacao else nome_base
                qtd = float(item.get('quantidade', 1))
                
                produtos_tamanho_cor[chave_produto] += qtd

        # 3. DADOS PARA CHURN (CLIENTES INATIVOS)
        email = detalhe.get('pessoaEmail')
        nome = detalhe.get('pessoaNome')
        data_str = detalhe.get('dataHora')
        
        if email and data_str:
            # Pega apenas os 10 primeiros caracteres (AAAA-MM-DD) e ignora o resto
            data_compra = datetime.strptime(data_str[:10], "%Y-%m-%d")
            
            # Se o cliente já está na lista, vemos se essa compra é mais recente
            if email not in clientes_ultima_compra or data_compra > clientes_ultima_compra[email]['data']:
                clientes_ultima_compra[email] = {
                    "nome": nome,
                    "data": data_compra,
                    "dias_inativo": (hoje - data_compra).days
                }

    # --- EXIBIÇÃO DOS RELATÓRIOS ---

    print("=== 🌍 TOP 5 ESTADOS (FATURAMENTO) ===")
    top_estados = sorted(vendas_por_estado.items(), key=lambda x: x[1], reverse=True)[:5]
    for est, val in top_estados:
        print(f"  {est}: R$ {val:,.2f}")
    print("-" * 30)

    print("=== 👕 TOP 10 PRODUTOS + VARIAÇÃO (TAMANHO/COR) ===")
    top_prods = sorted(produtos_tamanho_cor.items(), key=lambda x: x[1], reverse=True)[:10]
    for prod, qtd in top_prods:
        print(f"  {prod}: {int(qtd)} unid.")
    print("-" * 30)

    print("=== 💤 CLIENTES INATIVOS (+90 DIAS) ===")
    # Filtrar quem não compra há mais de 90 dias
    inativos = [c for c in clientes_ultima_compra.values() if c['dias_inativo'] > 90]
    inativos_ordenados = sorted(inativos, key=lambda x: x['dias_inativo'], reverse=True)[:10] # Top 10 mais antigos
    
    print(f"Total de clientes em risco: {len(inativos)}")
    for c in inativos_ordenados:
        print(f"  {c['nome']} -> {c['dias_inativo']} dias sem comprar (Última: {c['data'].strftime('%d/%m/%Y')})")

if __name__ == "__main__":
    gerar_relatorios()