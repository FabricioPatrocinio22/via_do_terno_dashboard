import os
import json
import base64
import requests
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime, timedelta, timezone # <--- CHANGED
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")
CACHE_FILE = "cache_pedidos.json"
USERS_FILE = "users.json"

# --- HELPER: TIMEZONE BRASIL (UTC-3) ---
def get_now_br():
    # Garante que pegamos a hora do Brasil independente de onde o servidor está (Render/AWS/etc)
    return datetime.now(timezone.utc) - timedelta(hours=3)

# --- GESTÃO DE USUÁRIOS ---
def carregar_usuarios():
    if not os.path.exists(USERS_FILE):
        padrao = {"admin": "via123"}
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

# --- FUNÇÃO AUXILIAR: BUSCAR DETALHES EM PARALELO (REAL-TIME) ---
def buscar_detalhes_tempo_real(lista_pedidos_resumidos):
    """
    Recebe uma lista de pedidos (Resumo) e busca os detalhes completos na API.
    Usa 10 conexões simultâneas para ser rápido.
    """
    pedidos_completos = []
    headers = get_headers()

    def fetch_one(pedido_resumo):
        pid = pedido_resumo.get('id') or pedido_resumo.get('codigo')
        try:
            # Chama a API de detalhe
            res = requests.get(f"{BASE_URL}/v2/site/pedido/{pid}", headers=headers, timeout=20)
            if res.status_code == 200:
                return res.json().get('data', {})
        except:
            pass
        return None

    # Processamento Paralelo (10 workers = 10x mais rápido que um loop normal)
    print(f"🔄 Baixando detalhes de {len(lista_pedidos_resumidos)} pedidos em tempo real...")
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(fetch_one, lista_pedidos_resumidos)
        
        for p in results:
            if p: pedidos_completos.append(p)
            
    return pedidos_completos

# --- FUNÇÃO AUXILIAR: BUSCAR LISTA POR PERÍODO ---
def buscar_lista_periodo(dias_atras):
    """
    Pagina a API da Magazord voltando no tempo até atingir a data limite.
    """
    headers = get_headers()
    lista_final = []
    pagina = 1
    continuar = True
    
    # Define a data de corte (Ex: Hoje - 30 dias)
    data_corte = get_now_br() - timedelta(days=dias_atras)
    
    print(f"📅 Buscando pedidos dos últimos {dias_atras} dias (desde {data_corte.strftime('%d/%m/%Y')})...")

    while continuar:
        try:
            # Busca página
            res = requests.get(
                f"{BASE_URL}/v2/site/pedido", 
                headers=headers,
                params={
                    "limit": 50, # 50 por página
                    "page": pagina, 
                    "order": "dataHora", 
                    "orderDirection": "desc"
                },
                timeout=15
            )
            
            items = res.json().get('data', {}).get('items', [])
            if not items: break

            for p in items:
                data_str = p.get('dataHora', '')
                try:
                    dt_pedido = datetime.strptime(data_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) - timedelta(hours=3)
                    
                    # Se o pedido for MAIS NOVO que a data de corte, a gente pega
                    if dt_pedido >= data_corte:
                        lista_final.append(p)
                    else:
                        # Se encontramos um pedido mais velho que a data de corte, 
                        # podemos parar de buscar (pois a lista vem ordenada)
                        continuar = False
                        break
                except:
                    continue
            
            pagina += 1
            if pagina > 100: break # Trava de segurança anti-loop infinito

        except Exception as e:
            print(f"Erro na paginação: {e}")
            break
            
    return lista_final

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
    
    # --- CORREÇÃO DE DATA (TIMEZONE) ---
    hoje = get_now_br() # Usa a função com timezone corrigido
    
    # Lógica para pegar último dia do mês corretamente
    if hoje.month == 12:
        proximo_mes = hoje.replace(year=hoje.year + 1, month=1, day=1)
    else:
        proximo_mes = hoje.replace(month=hoje.month + 1, day=1)
        
    ultimo_dia_mes_date = proximo_mes - timedelta(days=1)
    ultimo_dia_mes = ultimo_dia_mes_date.day
    
    vendas_por_dia = {dia: {"valor": 0.0, "qtd": 0} for dia in range(1, ultimo_dia_mes + 1)}
    
    pagina = 1
    continuar = True
    total_faturamento = 0.0
    total_pedidos = 0
    
    produtos_vendidos = [] 
    vendas_por_categoria = defaultdict(float)
    vendas_por_forma_pagamento = defaultdict(float)
    pedidos_detalhados = []

    while continuar:
        # Request da API Magazord
        res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, 
                           params={"limit": 100, "page": pagina, "order": "dataHora", "orderDirection": "desc"})
        
        if res.status_code != 200: break
        items = res.json().get('data', {}).get('items', [])
        if not items: break
        
        for p_resumo in items:
            try:
                # Parse da data do pedido
                dt_pedido = datetime.strptime(p_resumo.get('dataHora').split()[0], "%Y-%m-%d")
                
                # Se mudou o mês/ano, paramos (considerando timezone Brasil na comparação)
                if dt_pedido.month != hoje.month or dt_pedido.year != hoje.year:
                    # Se a data do pedido for menor que o dia 1 do mês atual, paramos
                    if dt_pedido < hoje.replace(day=1, hour=0, minute=0, second=0, microsecond=0).replace(tzinfo=None):
                        continuar = False
                    continue
                
                valor = float(p_resumo.get('valorTotal', 0))
                situacao = p_resumo.get('pedidoSituacaoDescricao', '').lower()
                
                # Ignorar cancelados
                if 'cancelado' in situacao: continue
                
                # Atualiza totais
                total_faturamento += valor
                total_pedidos += 1

                # Atualiza dia a dia
                vendas_por_dia[dt_pedido.day]["valor"] += valor
                vendas_por_dia[dt_pedido.day]["qtd"] += 1
                
                # Detalhes do produto (com Cache)
                codigo_p = p_resumo.get('codigo')
                if codigo_p not in cache:
                    det = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo_p}", headers=headers).json()
                    cache[codigo_p] = det.get('data', {})
                
                pedido_det = cache.get(codigo_p)
                
                if pedido_det:
                    forma_pag = pedido_det.get('pedidoFormaPagamentoDescricao', 'Outros')
                    vendas_por_forma_pagamento[forma_pag] += valor
                    
                    cliente_nome = pedido_det.get('clienteNome', 'Consumidor')

                    for r in pedido_det.get('arrayPedidoRastreio', []):
                        for item in r.get('pedidoItem', []):
                            cat = item.get('categoria') or 'Outros' # Proteção contra Null
                            valor_item = float(item.get('valorItem', 0))
                            
                            vendas_por_categoria[cat] += valor_item
                            
                            produtos_vendidos.append({
                                "nome": item.get('produtoNome'),
                                "qtd": float(item.get('quantidade', 1)),
                                "valor": valor_item,
                                "categoria": cat
                            })
                    
                    pedidos_detalhados.append({
                        "codigo": codigo_p,
                        "data": dt_pedido.strftime("%d/%m/%Y"),
                        "valor": valor,
                        "situacao": p_resumo.get('pedidoSituacaoDescricao'),
                        "cliente": cliente_nome
                    })
            except Exception as e:
                print(f"Erro ao processar pedido {p_resumo.get('codigo')}: {e}")
                continue

        pagina += 1
        # AUMENTO DO LIMITE: 50 -> 100 páginas (10.000 pedidos/mês) para garantir
        if pagina > 100: break

    salvar_cache(cache)
    
    # --- PROCESSAMENTO DOS DADOS (Mantido Igual) ---
    produtos_agrupados_geral = defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    produtos_agrupados_cat = defaultdict(lambda: defaultdict(lambda: {"qtd": 0, "valor": 0.0}))

    for p in produtos_vendidos:
        # Geral
        produtos_agrupados_geral[p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_geral[p["nome"]]["valor"] += p["valor"]
        # Por Categoria
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["valor"] += p["valor"]

    top_produtos = sorted(
        [{"nome": k, "qtd": v["qtd"], "valor": v["valor"]} for k, v in produtos_agrupados_geral.items()],
        key=lambda x: x["valor"], reverse=True
    )[:10]

    produtos_drilldown = {}
    for cat, prods in produtos_agrupados_cat.items():
        lista_ordenada = sorted(
            [{"nome": nome, "qtd": dados["qtd"], "valor": dados["valor"]} for nome, dados in prods.items()],
            key=lambda x: x["valor"], reverse=True
        )
        produtos_drilldown[cat] = lista_ordenada

    vendas_dia_lista = [{"dia": d, "valor": vendas_por_dia[d]["valor"], "qtd": vendas_por_dia[d]["qtd"]} for d in range(1, ultimo_dia_mes + 1)]
    
    categorias_lista = sorted(
        [{"nome": k, "valor": v, "percentual": (v/total_faturamento*100) if total_faturamento > 0 else 0} for k, v in vendas_por_categoria.items()],
        key=lambda x: x['valor'], reverse=True
    )

    formas_pagamento_lista = sorted([{"nome": k, "valor": v} for k, v in vendas_por_forma_pagamento.items()], key=lambda x: x['valor'], reverse=True)

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
            "produtos_por_categoria": produtos_drilldown
        },
        "pedidos_recentes": sorted(pedidos_detalhados, key=lambda x: x['data'], reverse=True)[:20]
    }

# --- (O RESTANTE DO CÓDIGO PERMANECE IGUAL, INCLUINDO O ENDPOINT /resumo) ---
# APENAS CERTIFIQUE-SE DE USAR get_now_br() NO LUGAR DE datetime.now() NO OUTRO ENDPOINT TAMBÉM SE QUISER PRECISÃO TOTAL

@app.get("/api/dashboard/resumo")
def get_dashboard_data(ano: int = 2026, dias_kpi: int = 30, dias_graficos: int = 30):
    cache = carregar_cache()
    headers = get_headers()
    
    ano_anterior = ano - 1
    
    # CORREÇÃO DE TIMEZONE AQUI TAMBÉM
    agora = get_now_br() 
    
    data_limite_kpi = agora - timedelta(days=dias_kpi)
    data_limite_kpi_anterior = agora - timedelta(days=dias_kpi * 2)
    data_limite_graficos = agora - timedelta(days=dias_graficos)
    
    # ... Restante do código do endpoint resumo (idêntico ao original) ...
    # (Copie o conteúdo original da função get_dashboard_data aqui para baixo, 
    # apenas certifique-se de que a lógica de "vendas_atual" usa a variável 'ano' corretamente)

    vendas_atual = {m: 0.0 for m in range(1, 13)}
    vendas_passado = {m: 0.0 for m in range(1, 13)}
    
    faturamento_periodo = 0.0
    pedidos_periodo = 0
    faturamento_periodo_anterior = 0.0
    pedidos_periodo_anterior = 0
    
    analise_produtos = []
    categorias_stats = defaultdict(lambda: {"total": 0.0, "qtd": 0})

    pagina = 1
    continuar = True
    while continuar:
        res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, 
                          params={"limit": 100, "page": pagina, "order": "dataHora", "orderDirection": "desc"})
        if res.status_code != 200: break
        items = res.json().get('data', {}).get('items', [])
        # AQUI TAMBÉM AUMENTEI O LIMITE DE PÁGINAS PARA ANÁLISE HISTÓRICA
        if not items or pagina > 150: break 

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

            # ... (Lógica de KPI e Cache mantida igual) ...
            # Obs: Como data_limite_kpi agora é baseada em timezone BR, a comparação será correta
            if dt_pedido.date() >= data_limite_kpi.date():
                faturamento_periodo += valor
                pedidos_periodo += 1
            
            elif dt_pedido.date() >= data_limite_kpi_anterior.date() and dt_pedido.date() < data_limite_kpi.date():
                faturamento_periodo_anterior += valor
                pedidos_periodo_anterior += 1

            if dt_pedido.date() >= data_limite_graficos.date():
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

    # ... (Restante do processamento de produtos mantido igual) ...
    produtos_final = {}
    for d in analise_produtos:
        key = f"{d['nome']}|{d['codigo']}"
        if key not in produtos_final:
            produtos_final[key] = {"nome": d['nome'], "codigo": d['codigo'], "qtd": 0}
        produtos_final[key]["qtd"] += 1

    top_produtos = sorted(produtos_final.values(), key=lambda x: x["qtd"], reverse=True)[:15]
    
    def calcular_crescimento(atual, anterior):
        if anterior == 0:
            return 100.0 if atual > 0 else 0.0
        return round(((atual - anterior) / anterior) * 100, 1)
    
    ticket_medio_atual = faturamento_periodo / pedidos_periodo if pedidos_periodo else 0
    ticket_medio_anterior = faturamento_periodo_anterior / pedidos_periodo_anterior if pedidos_periodo_anterior else 0
    
    return {
        "resumo_periodo": {
            "faturamento": faturamento_periodo,
            "faturamento_anterior": faturamento_periodo_anterior,
            "crescimento_faturamento": calcular_crescimento(faturamento_periodo, faturamento_periodo_anterior),
            "pedidos": pedidos_periodo,
            "pedidos_anterior": pedidos_periodo_anterior,
            "crescimento_pedidos": calcular_crescimento(pedidos_periodo, pedidos_periodo_anterior),
            "ticket_medio": ticket_medio_atual,
            "ticket_medio_anterior": ticket_medio_anterior,
            "crescimento_ticket": calcular_crescimento(ticket_medio_atual, ticket_medio_anterior)
        },
        "graficos": {
            "linha_tempo": [{"name": ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][i], "vendas_atual": vendas_atual[i+1], "vendas_passado": vendas_passado[i+1]} for i in range(12)],
            "produtos_ranking": top_produtos,
            "ticket_categoria": sorted([{"name": k, "ticket": v["total"]/v["qtd"]} for k,v in categorias_stats.items() if v["qtd"] > 0], key=lambda x: x['ticket'], reverse=True)
        }
    }

# --- ROTA 1: GRÁFICOS RÁPIDOS (Estado e Produtos) ---
@app.get("/api/dashboard/graficos-avancados")
def get_graficos_avancados(dias: int = 30):
    cache = carregar_cache()
    
    vendas_por_estado = defaultdict(float)
    produtos_tamanho_cor = defaultdict(int)
    
    hoje = get_now_br()
    data_limite = hoje - timedelta(days=dias)

    # Processamento Rápido (Só memória)
    for pedido_id, detalhe in cache.items():
        data_str = detalhe.get('dataHora')
        if not data_str: continue
        
        try:
            data_compra = datetime.strptime(data_str[:10], "%Y-%m-%d")
            data_compra_aware = data_compra.replace(tzinfo=timezone.utc) - timedelta(hours=3)
        except:
            continue

        # Filtro de Data
        if data_compra_aware.date() >= data_limite.date():
            # Geográfico
            estado = detalhe.get('estadoSigla', 'N/A')
            if estado and len(estado) == 2:
                vendas_por_estado[estado] += float(detalhe.get('valorTotalFinal', 0))

            # Produtos
            itens = detalhe.get('arrayPedidoRastreio', [])
            for rastreio in itens:
                for item in rastreio.get('pedidoItem', []):
                    nome_base = item.get('produtoNome', 'Item')
                    variacao = item.get('produtoDerivacaoNome', '') 
                    chave = f"{nome_base} [{variacao}]" if variacao else nome_base
                    produtos_tamanho_cor[chave] += float(item.get('quantidade', 1))

    # Formatação
    lista_estados = sorted(
        [{"name": k, "valor": v} for k, v in vendas_por_estado.items()],
        key=lambda x: x["valor"], reverse=True
    )[:10]

    lista_tamanhos = sorted(
        [{"name": k, "qtd": v} for k, v in produtos_tamanho_cor.items()],
        key=lambda x: x["qtd"], reverse=True
    )[:10]

    return {
        "geografico": lista_estados,
        "produtos_variacao": lista_tamanhos
    }

# --- ROTA 2: CHURN INTELIGENTE (Com Auto-Repair) ---
@app.get("/api/dashboard/churn")
def get_churn_clientes(meses: int = 3):
    cache = carregar_cache()
    headers = get_headers()
    
    clientes_ultima_compra = {}
    hoje = get_now_br()
    dias_churn_corte = meses * 30

    # --- AUTO-REPAIR HÍBRIDO (Mantemos aqui pois é quem precisa do email) ---
    pedidos_sem_email = []
    for pid, dados in cache.items():
        if 'pessoaEmail' not in dados:
            pedidos_sem_email.append((pid, dados.get('dataHora', '')))
    
    pedidos_sem_email.sort(key=lambda x: x[1], reverse=True)
    
    pedidos_para_reparar = []
    qtd = len(pedidos_sem_email)
    
    # Repara 10 Recentes + 10 Antigos
    if qtd > 0:
        pedidos_para_reparar.extend([x[0] for x in pedidos_sem_email[:10]])
        if qtd > 10:
            pedidos_para_reparar.extend([x[0] for x in pedidos_sem_email[-10:]])
    
    pedidos_para_reparar = list(set(pedidos_para_reparar))
    
    atualizados = 0
    for pid in pedidos_para_reparar:
        try:
            res = requests.get(f"{BASE_URL}/v2/site/pedido/{pid}", headers=headers, timeout=5)
            if res.status_code == 200:
                cache[pid] = res.json().get('data', {})
                atualizados += 1
        except: pass

    if atualizados > 0:
        salvar_cache(cache)

    # --- CÁLCULO DO CHURN ---
    for pedido_id, detalhe in cache.items():
        email = detalhe.get('pessoaEmail')
        nome = detalhe.get('pessoaNome')
        data_str = detalhe.get('dataHora')
        
        if email and data_str:
            try:
                data_compra = datetime.strptime(data_str[:10], "%Y-%m-%d")
                data_compra_aware = data_compra.replace(tzinfo=timezone.utc) - timedelta(hours=3)
                
                dias_inativo = (hoje - data_compra_aware).days

                if email not in clientes_ultima_compra or data_compra_aware > clientes_ultima_compra[email]['data_obj']:
                    clientes_ultima_compra[email] = {
                        "nome": nome,
                        "email": email,
                        "data_obj": data_compra_aware,
                        "data_formatada": data_compra_aware.strftime("%d/%m/%Y"),
                        "dias_inativo": dias_inativo
                    }
            except: continue

    lista_churn = sorted(
        [c for c in clientes_ultima_compra.values() if c['dias_inativo'] > dias_churn_corte],
        key=lambda x: x['dias_inativo'], reverse=True
    )[:50]

    return {
        "churn": lista_churn,
        "reparados": atualizados
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)