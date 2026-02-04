import os
import json
import base64
import requests
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime, timedelta
from pydantic import BaseModel # <--- Importante para o Login

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")
CACHE_FILE = "cache_pedidos.json"
USERS_FILE = "users.json" # <--- Arquivo de usuários

# --- GESTÃO DE USUÁRIOS ---
def carregar_usuarios():
    # Se não existir, cria o usuário padrão
    if not os.path.exists(USERS_FILE):
        padrao = {"admin": "via123"} # <--- USUÁRIO E SENHA PADRÃO
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(padrao, f, indent=4)
        return padrao
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

class LoginData(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login(data: LoginData):
    usuarios = carregar_usuarios()
    senha_real = usuarios.get(data.username)
    
    if senha_real and senha_real == data.password:
        return {"status": "success", "token": "logado_com_sucesso"}
    
    raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

def get_headers():
    credenciais = f"{USUARIO}:{SENHA}"
    token_b64 = base64.b64encode(credenciais.encode()).decode()
    return {"Authorization": f"Basic {token_b64}", "Content-Type": "application/json"}

def carregar_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return {}
    return {}

def salvar_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f: json.dump(cache, f, ensure_ascii=False, indent=4)

@app.get("/api/dashboard/mes-atual")
def get_mes_atual_data(meta_mensal: float = 50000):
    cache = carregar_cache()
    headers = get_headers()
    
    hoje = datetime.now()
    proximo_mes = hoje.replace(day=28) + timedelta(days=4)
    ultimo_dia_mes = (proximo_mes - timedelta(days=proximo_mes.day)).day
    
    vendas_por_dia = {dia: 0.0 for dia in range(1, ultimo_dia_mes + 1)}
    
    pagina = 1
    continuar = True
    total_faturamento = 0.0
    total_pedidos = 0
    
    # LISTA BRUTA AGORA COM CATEGORIA
    produtos_vendidos = [] 
    
    vendas_por_categoria = defaultdict(float)
    vendas_por_forma_pagamento = defaultdict(float)
    pedidos_detalhados = []

    while continuar:
        res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, 
                           params={"limit": 100, "page": pagina, "order": "dataHora", "orderDirection": "desc"})
        if res.status_code != 200: break
        items = res.json().get('data', {}).get('items', [])
        if not items: break
        
        for p_resumo in items:
            dt_pedido = datetime.strptime(p_resumo.get('dataHora').split()[0], "%Y-%m-%d")
            
            if dt_pedido.month != hoje.month or dt_pedido.year != hoje.year:
                if dt_pedido < hoje.replace(day=1): continuar = False
                continue
            
            valor = float(p_resumo.get('valorTotal', 0))
            situacao = p_resumo.get('pedidoSituacaoDescricao', '').lower()
            if 'cancelado' in situacao: continue
            
            vendas_por_dia[dt_pedido.day] += valor
            total_faturamento += valor
            total_pedidos += 1
            
            codigo_p = p_resumo.get('codigo')
            if codigo_p not in cache:
                det = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo_p}", headers=headers).json()
                cache[codigo_p] = det.get('data', {})
            
            pedido_det = cache.get(codigo_p)
            if pedido_det:
                forma_pag = pedido_det.get('pedidoFormaPagamentoDescricao', 'Outros')
                vendas_por_forma_pagamento[forma_pag] += valor
                
                for r in pedido_det.get('arrayPedidoRastreio', []):
                    for item in r.get('pedidoItem', []):
                        cat = item.get('categoria', 'Outros')
                        valor_item = float(item.get('valorItem', 0))
                        vendas_por_categoria[cat] += valor_item
                        
                        # SALVANDO CATEGORIA JUNTO COM O PRODUTO
                        produtos_vendidos.append({
                            "nome": item.get('produtoNome'),
                            "qtd": item.get('quantidade', 1),
                            "valor": valor_item,
                            "categoria": cat # <--- Importante para o Drill Down
                        })
                
                pedidos_detalhados.append({
                    "codigo": codigo_p,
                    "data": dt_pedido.strftime("%d/%m/%Y"),
                    "valor": valor,
                    "situacao": p_resumo.get('pedidoSituacaoDescricao'),
                    "cliente": pedido_det.get('clienteNome', 'N/A')
                })

        pagina += 1
        if pagina > 50: break

    salvar_cache(cache)
    
    # PROCESSO DE AGRUPAMENTO (DRILL DOWN)
    
    # 1. Agrupamento Geral (Top 10)
    produtos_agrupados_geral = defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    
    # 2. Agrupamento por Categoria (Drill Down)
    produtos_agrupados_cat = defaultdict(lambda: defaultdict(lambda: {"qtd": 0, "valor": 0.0}))

    for p in produtos_vendidos:
        # Geral
        produtos_agrupados_geral[p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_geral[p["nome"]]["valor"] += p["valor"]
        
        # Por Categoria
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["valor"] += p["valor"]

    # Lista Top 10 Geral
    top_produtos = sorted(
        [{"nome": k, "qtd": v["qtd"], "valor": v["valor"]} for k, v in produtos_agrupados_geral.items()],
        key=lambda x: x["valor"], reverse=True
    )[:10]

    # Dicionário de Produtos por Categoria
    produtos_drilldown = {}
    for cat, prods in produtos_agrupados_cat.items():
        lista_ordenada = sorted(
            [{"nome": nome, "qtd": dados["qtd"], "valor": dados["valor"]} for nome, dados in prods.items()],
            key=lambda x: x["valor"], reverse=True
        )
        produtos_drilldown[cat] = lista_ordenada

    vendas_dia_lista = [{"dia": d, "valor": vendas_por_dia[d]} for d in range(1, ultimo_dia_mes + 1)]
    
    categorias_lista = sorted(
        [{"nome": k, "valor": v, "percentual": (v/total_faturamento*100) if total_faturamento > 0 else 0} 
         for k, v in vendas_por_categoria.items()],
        key=lambda x: x['valor'], reverse=True
    )

    formas_pagamento_lista = sorted(
        [{"nome": k, "valor": v} for k, v in vendas_por_forma_pagamento.items()],
        key=lambda x: x['valor'], reverse=True
    )

    # Métricas finais
    dias_decorridos = hoje.day
    dias_restantes = ultimo_dia_mes - dias_decorridos
    percentual_meta = (total_faturamento / meta_mensal * 100) if meta_mensal > 0 else 0
    ticket_medio = total_faturamento / total_pedidos if total_pedidos > 0 else 0
    media_dia = total_faturamento / dias_decorridos if dias_decorridos > 0 else 0
    projecao_mes = media_dia * ultimo_dia_mes

    return {
        "resumo": {
            "total_faturamento": total_faturamento,
            "total_pedidos": total_pedidos,
            "ticket_medio": ticket_medio,
            "meta_mensal": meta_mensal,
            "percentual_meta": percentual_meta,
            "falta_atingir": max(0, meta_mensal - total_faturamento),
            "dias_decorridos": dias_decorridos,
            "dias_restantes": dias_restantes,
            "media_dia": media_dia,
            "projecao_mes": projecao_mes,
            "mes_ano": hoje.strftime("%m/%Y")
        },
        "graficos": {
            "vendas_por_dia": vendas_dia_lista,
            "categorias": categorias_lista,
            "formas_pagamento": formas_pagamento_lista,
            "top_produtos": top_produtos,
            "produtos_por_categoria": produtos_drilldown # <--- NOVO CAMPO
        },
        "pedidos_recentes": sorted(pedidos_detalhados, key=lambda x: x['data'], reverse=True)[:20]
    }

@app.get("/api/debug/pedido/{codigo}")
def debug_pedido(codigo: str):
    """Endpoint para debug - ver estrutura completa do pedido"""
    headers = get_headers()
    res = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo}", headers=headers)
    if res.status_code == 200:
        return res.json()
    return {"error": "Pedido não encontrado"}


@app.get("/api/dashboard/resumo")
def get_dashboard_data(ano: int = 2026, dias_kpi: int = 30, dias_graficos: int = 30):
    cache = carregar_cache()
    headers = get_headers()
    
    ano_anterior = ano - 1
    # Limites para KPIs
    data_limite_kpi = datetime.now() - timedelta(days=dias_kpi)
    data_limite_kpi_anterior = datetime.now() - timedelta(days=dias_kpi * 2)
    
    # Limites para gráficos de produtos
    data_limite_graficos = datetime.now() - timedelta(days=dias_graficos)
    
    vendas_atual = {m: 0.0 for m in range(1, 13)}
    vendas_passado = {m: 0.0 for m in range(1, 13)}
    
    # Dados para KPIs
    faturamento_periodo = 0.0
    pedidos_periodo = 0
    faturamento_periodo_anterior = 0.0
    pedidos_periodo_anterior = 0
    
    # Dados para gráficos
    analise_produtos = []
    categorias_stats = defaultdict(lambda: {"total": 0.0, "qtd": 0})

    pagina = 1
    continuar = True
    while continuar:
        res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, 
                          params={"limit": 100, "page": pagina, "order": "dataHora", "orderDirection": "desc"})
        if res.status_code != 200: break
        items = res.json().get('data', {}).get('items', [])
        if not items or pagina > 100: break 

        for p_resumo in items:
            dt_pedido = datetime.strptime(p_resumo.get('dataHora').split()[0], "%Y-%m-%d")
            valor = float(p_resumo.get('valorTotal', 0))
            situacao = p_resumo.get('pedidoSituacaoDescricao', '').lower()
            if 'cancelado' in situacao or 'aguardando' in situacao: continue

            if dt_pedido.year == ano: vendas_atual[dt_pedido.month] += valor
            elif dt_pedido.year == ano_anterior: vendas_passado[dt_pedido.month] += valor
            if dt_pedido.year < ano_anterior:
                continuar = False
                break

            # Período atual para KPIs
            if dt_pedido >= data_limite_kpi:
                faturamento_periodo += valor
                pedidos_periodo += 1
            
            # Período anterior para KPIs (comparação)
            elif dt_pedido >= data_limite_kpi_anterior and dt_pedido < data_limite_kpi:
                faturamento_periodo_anterior += valor
                pedidos_periodo_anterior += 1

            # Período para análise de produtos e categorias (gráficos)
            if dt_pedido >= data_limite_graficos:
                codigo_p = p_resumo.get('codigo')
                if codigo_p not in cache:
                    det = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo_p}", headers=headers).json()
                    cache[codigo_p] = det.get('data', {})
                
                p = cache.get(codigo_p)
                if p:
                    for r in p.get('arrayPedidoRastreio', []):
                        for item in r.get('pedidoItem', []):
                            analise_produtos.append({
                                "nome": item.get('produtoNome'),
                                "codigo": item.get('produtoDerivacaoCodigo')
                            })
                            cat = item.get('categoria', 'Outros')
                            categorias_stats[cat]["total"] += float(item.get('valorItem', 0))
                            categorias_stats[cat]["qtd"] += 1
                
        pagina += 1

    salvar_cache(cache)

    # Agrupar Produtos
    produtos_final = {}
    for d in analise_produtos:
        key = f"{d['nome']}|{d['codigo']}"
        if key not in produtos_final:
            produtos_final[key] = {"nome": d['nome'], "codigo": d['codigo'], "qtd": 0}
        produtos_final[key]["qtd"] += 1

    top_produtos = sorted(produtos_final.values(), key=lambda x: x["qtd"], reverse=True)[:15]
    
    # Calcular crescimento percentual
    def calcular_crescimento(atual, anterior):
        if anterior == 0:
            return 100.0 if atual > 0 else 0.0
        return round(((atual - anterior) / anterior) * 100, 1)
    
    ticket_medio_atual = faturamento_periodo / pedidos_periodo if pedidos_periodo else 0
    ticket_medio_anterior = faturamento_periodo_anterior / pedidos_periodo_anterior if pedidos_periodo_anterior else 0
    
    crescimento_faturamento = calcular_crescimento(faturamento_periodo, faturamento_periodo_anterior)
    crescimento_pedidos = calcular_crescimento(pedidos_periodo, pedidos_periodo_anterior)
    crescimento_ticket = calcular_crescimento(ticket_medio_atual, ticket_medio_anterior)
    
    meses_nome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    linha_tempo = [{"name": meses_nome[i], "vendas_atual": vendas_atual[i+1], "vendas_passado": vendas_passado[i+1]} for i in range(12)]

    return {
        "resumo_periodo": {
            "faturamento": faturamento_periodo,
            "faturamento_anterior": faturamento_periodo_anterior,
            "crescimento_faturamento": crescimento_faturamento,
            "pedidos": pedidos_periodo,
            "pedidos_anterior": pedidos_periodo_anterior,
            "crescimento_pedidos": crescimento_pedidos,
            "ticket_medio": ticket_medio_atual,
            "ticket_medio_anterior": ticket_medio_anterior,
            "crescimento_ticket": crescimento_ticket
        },
        "graficos": {
            "linha_tempo": linha_tempo,
            "produtos_ranking": top_produtos,
            "ticket_categoria": sorted([{"name": k, "ticket": v["total"]/v["qtd"]} for k,v in categorias_stats.items() if v["qtd"] > 0], key=lambda x: x['ticket'], reverse=True)
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)