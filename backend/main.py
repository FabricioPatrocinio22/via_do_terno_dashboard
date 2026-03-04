import os
import json
import base64
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from collections import defaultdict
from datetime import datetime, timedelta, timezone
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
    return datetime.now(timezone.utc) - timedelta(hours=3)

def get_headers():
    credenciais = f"{USUARIO}:{SENHA}"
    token_b64 = base64.b64encode(credenciais.encode()).decode()
    return {"Authorization": f"Basic {token_b64}", "Content-Type": "application/json"}

# --- GESTÃO DE CACHE (A SOLUÇÃO DO TRAVAMENTO) ---
def carregar_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: return {}
    return {}

def salvar_cache(cache):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f: 
            json.dump(cache, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print(f"Erro ao salvar cache: {e}")

# --- GESTÃO DE USUÁRIOS ---
def carregar_usuarios():
    if not os.path.exists(USERS_FILE):
        padrao = {"admin": "via123"}
        with open(USERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(padrao, f, indent=4)
        return padrao
    try:
        with open(USERS_FILE, 'r', encoding='utf-8') as f: return json.load(f)
    except: return {}

class LoginData(BaseModel):
    username: str
    password: str

@app.post("/api/login")
def login(data: LoginData):
    usuarios = carregar_usuarios()
    if usuarios.get(data.username) == data.password:
        return {"status": "success", "token": "logado_com_sucesso"}
    raise HTTPException(status_code=401, detail="Usuário ou senha incorretos")

# --- FUNÇÕES INTELIGENTES (SMART FETCH) ---

def buscar_detalhes_paralelo_smart(lista_resumo, cache_existente):
    """
    Só busca na API os pedidos que NÃO estão no cache.
    Isso economiza milhares de requisições e evita travamentos.
    """
    pedidos_para_baixar = []
    
    # 1. Filtra: Quem eu já tenho?
    for p in lista_resumo:
        pid = str(p.get('id') or p.get('codigo'))
        if pid not in cache_existente:
            pedidos_para_baixar.append(p)
            
    if not pedidos_para_baixar:
        print("⚡ Todos os pedidos já estão no cache! Processamento instantâneo.")
        return []

    print(f"📥 Baixando {len(pedidos_para_baixar)} novos pedidos (os outros {len(lista_resumo) - len(pedidos_para_baixar)} já temos)...")
    
    novos_detalhes = []
    headers = get_headers()

    def fetch_one(pedido_resumo):
        pid = str(pedido_resumo.get('id') or pedido_resumo.get('codigo'))
        try:
            res = requests.get(f"{BASE_URL}/v2/site/pedido/{pid}", headers=headers, timeout=20)
            if res.status_code == 200:
                return pid, res.json().get('data', {})
        except: pass
        return pid, None

    # Usa 15 conexões para baixar o que falta
    with ThreadPoolExecutor(max_workers=15) as executor:
        results = executor.map(fetch_one, pedidos_para_baixar)
        
        for pid, dados in results:
            if dados:
                novos_detalhes.append((pid, dados))
            
    return novos_detalhes

def buscar_lista_periodo(dias_atras):
    headers = get_headers()
    lista_final = []
    pagina = 1
    
    # Filtro Otimizado na API
    data_corte = get_now_br() - timedelta(days=dias_atras)
    data_inicio_api = data_corte.strftime("%Y-%m-%d")
    
    print(f"📅 Buscando lista de pedidos desde: {data_inicio_api}")

    while True:
        try:
            params = {
                "limit": 100, # Aumentei para 100 para ser mais rápido
                "page": pagina, 
                "order": "dataHora", "orderDirection": "desc",
                "dataInicio": data_inicio_api
            }
            res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, params=params, timeout=15)
            items = res.json().get('data', {}).get('items', [])
            if not items: break

            lista_final.extend(items)
            pagina += 1
            if pagina > 200: break 
        except: break
            
    print(f"✅ Lista encontrada: {len(lista_final)} pedidos.")
    return lista_final

# ==========================================
# ROTA 1: GRÁFICOS AVANÇADOS (COM SALVAMENTO AUTOMÁTICO)
# ==========================================
@app.get("/api/dashboard/graficos-avancados")
def get_graficos_avancados(dias: int = 30):
    cache = carregar_cache()
    
    # 1. Busca lista atualizada da API
    lista_resumo = buscar_lista_periodo(dias)
    
    # --- LÓGICA DE DOWNLOAD INTELIGENTE COM SALVAMENTO ---
    pedidos_para_baixar = []
    ids_no_periodo = []

    # Separa o que já temos do que falta
    for p in lista_resumo:
        pid = str(p.get('id') or p.get('codigo'))
        ids_no_periodo.append(pid)
        if pid not in cache:
            pedidos_para_baixar.append(p)
    
    # Se tiver coisa nova, baixa em lotes
    if pedidos_para_baixar:
        print(f"📥 Baixando {len(pedidos_para_baixar)} novos pedidos...")
        headers = get_headers()
        
        def fetch_one(pedido_resumo):
            pid = str(pedido_resumo.get('id') or pedido_resumo.get('codigo'))
            try:
                res = requests.get(f"{BASE_URL}/v2/site/pedido/{pid}", headers=headers, timeout=20)
                if res.status_code == 200:
                    return pid, res.json().get('data', {})
            except: pass
            return pid, None

        # Processa e SALVA A CADA 50 PEDIDOS
        contador = 0
        with ThreadPoolExecutor(max_workers=10) as executor: # Reduzi para 10 para ser mais estável
            results = executor.map(fetch_one, pedidos_para_baixar)
            
            for pid, dados in results:
                if dados:
                    cache[pid] = dados
                    contador += 1
                
                # O PULO DO GATO: Salva a cada 50 pedidos baixados
                if contador % 50 == 0:
                    print(f"💾 Salvando progresso parcial... ({contador}/{len(pedidos_para_baixar)})")
                    salvar_cache(cache)
        
        # Salva o finalzinho que sobrou
        salvar_cache(cache)
        print("✅ Download concluído e salvo!")
    else:
        print("⚡ Todos os pedidos já estão no cache!")

    # --- GERAÇÃO DOS GRÁFICOS (IGUAL ANTES) ---
    vendas_por_estado = defaultdict(float)
    produtos_tamanho_cor = defaultdict(int)

    for pid in ids_no_periodo:
        detalhe = cache.get(pid)
        if not detalhe: continue

        situacao = detalhe.get('pedidoSituacaoDescricao', '').lower()
        if 'cancelado' in situacao: continue

        estado = detalhe.get('estadoSigla', 'N/A')
        if estado and len(estado) == 2:
            vendas_por_estado[estado] += float(detalhe.get('valorTotalFinal', 0))

        itens = detalhe.get('arrayPedidoRastreio', [])
        for rastreio in itens:
            for item in rastreio.get('pedidoItem', []):
                nome_base = item.get('produtoNome', 'Item')
                variacao = item.get('produtoDerivacaoNome', '') 
                chave = f"{nome_base} [{variacao}]" if variacao else nome_base
                produtos_tamanho_cor[chave] += float(item.get('quantidade', 1))

    return {
        "geografico": sorted([{"name": k, "valor": v} for k, v in vendas_por_estado.items()], key=lambda x: x["valor"], reverse=True)[:10],
        "produtos_variacao": sorted([{"name": k, "qtd": v} for k, v in produtos_tamanho_cor.items()], key=lambda x: x["qtd"], reverse=True)[:10]
    }

# ==========================================
# ROTA 2: CHURN (COM SMART CACHE + FILTRO)
# ==========================================
@app.get("/api/dashboard/churn")
def get_churn_clientes(meses: int = 3):
    cache = carregar_cache()
    
    # Busca 6 meses de histórico
    lista_resumo = buscar_lista_periodo(180) 
    
    # Baixa o que falta
    novos = buscar_detalhes_paralelo_smart(lista_resumo, cache)
    
    if novos:
        for pid, dados in novos:
            cache[str(pid)] = dados
        salvar_cache(cache)
    
    clientes_ultima_compra = {}
    hoje = get_now_br()
    dias_corte = meses * 30
    
    ids_no_periodo = [str(p.get('id') or p.get('codigo')) for p in lista_resumo]

    for pid in ids_no_periodo:
        detalhe = cache.get(pid)
        if not detalhe: continue
        
        # Filtro de Status
        if 'cancelado' in detalhe.get('pedidoSituacaoDescricao', '').lower(): continue

        email = detalhe.get('pessoaEmail')
        nome = detalhe.get('pessoaNome')
        data_str = detalhe.get('dataHora')
        
        if email and data_str:
            try:
                dt_pedido = datetime.strptime(data_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc) - timedelta(hours=3)
                dias_inativo = (hoje - dt_pedido).days

                if email not in clientes_ultima_compra or dias_inativo < clientes_ultima_compra[email]['dias_inativo']:
                    clientes_ultima_compra[email] = {
                        "nome": nome,
                        "email": email,
                        "data_formatada": dt_pedido.strftime("%d/%m/%Y"),
                        "dias_inativo": dias_inativo
                    }
            except: continue

    lista_churn = sorted(
        [c for c in clientes_ultima_compra.values() if c['dias_inativo'] > dias_corte],
        key=lambda x: x['dias_inativo'], reverse=True
    )[:50]

    return {"churn": lista_churn}

# ==========================================
# ROTA 3: MÊS ATUAL (MANTIDA DO SEU CÓDIGO)
# ==========================================
@app.get("/api/dashboard/mes-atual")
def get_mes_atual_data(meta_mensal: float = 60000, mes: int = None, ano: int = None):
    cache = carregar_cache()
    headers = get_headers()
    
    hoje = get_now_br()
    
    # --- LÓGICA DO MÊS ALVO ---
    alvo_mes = mes if mes is not None else hoje.month
    alvo_ano = ano if ano is not None else hoje.year
    
    # --- LÓGICA DO MÊS ANTERIOR ---
    if alvo_mes == 1:
        mes_anterior = 12
        ano_anterior = alvo_ano - 1
    else:
        mes_anterior = alvo_mes - 1
        ano_anterior = alvo_ano

    # Data marco zero: Dia 1º do mês ANTERIOR
    # Ex: Quer março? Começa a buscar desde 1º de fevereiro.
    data_inicio_busca = datetime(ano_anterior, mes_anterior, 1)
    data_inicio_api = data_inicio_busca.strftime("%Y-%m-%d")

    # Fim do Mês Alvo
    if alvo_mes == 12: proximo_mes = datetime(alvo_ano + 1, 1, 1)
    else: proximo_mes = datetime(alvo_ano, alvo_mes + 1, 1)
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

    # Variáveis do mês anterior
    faturamento_anterior = 0.0
    pedidos_anterior = 0

    while continuar:
        # O PULO DO GATO: Tiramos o dataFim para não bugar a API.
        res = requests.get(f"{BASE_URL}/v2/site/pedido", headers=headers, 
                           params={"limit": 100, "page": pagina, "order": "dataHora", "orderDirection": "desc", 
                                   "dataInicio": data_inicio_api})
        
        if res.status_code != 200: break
        items = res.json().get('data', {}).get('items', [])
        if not items: break
        
        for p_resumo in items:
            try:
                # Extrai a data blindada contra formatos quebrados da API
                data_str = p_resumo.get('dataHora', '')[:10]
                dt_pedido = datetime.strptime(data_str, "%Y-%m-%d")
                
                # TRAVA MANUAL 1: Passou do mês anterior? PARA a busca inteira!
                if dt_pedido.date() < data_inicio_busca.date():
                    continuar = False
                    break
                
                # TRAVA MANUAL 2: Se o usuário escolheu um mês antigo, ignora os dias do futuro
                if dt_pedido.date() > ultimo_dia_mes_date.date():
                    continue

                situacao = p_resumo.get('pedidoSituacaoDescricao', '').lower()
                if 'cancelado' in situacao: continue
                
                valor_total = float(p_resumo.get('valorTotal') or 0)
                valor_frete = float(p_resumo.get('valorFrete') or 0)
                valor = valor_total - valor_frete
                
                # ==========================================
                # SEPARAÇÃO DE MESES
                # ==========================================
                
                # ---> MÊS ATUAL
                if dt_pedido.month == alvo_mes and dt_pedido.year == alvo_ano:
                    total_faturamento += valor
                    total_pedidos += 1
                    vendas_por_dia[dt_pedido.day]["valor"] += valor
                    vendas_por_dia[dt_pedido.day]["qtd"] += 1
                    
                    if 'aguardando' in situacao: continue

                    codigo_p = str(p_resumo.get('codigo'))
                    if codigo_p not in cache:
                        try:
                            det = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo_p}", headers=headers, timeout=10).json()
                            cache[codigo_p] = det.get('data', {})
                        except: pass
                    
                    pedido_det = cache.get(codigo_p)
                    
                    if pedido_det:
                        forma_pag = pedido_det.get('pedidoFormaPagamentoDescricao', 'Outros')
                        vendas_por_forma_pagamento[forma_pag] += valor
                        cliente_nome = pedido_det.get('clienteNome', 'Consumidor')

                        for r in pedido_det.get('arrayPedidoRastreio', []):
                            for item in r.get('pedidoItem', []):
                                cat = item.get('categoria') or 'Outros'
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

                # ---> MÊS ANTERIOR (Onde estava dando zero!)
                elif dt_pedido.month == mes_anterior and dt_pedido.year == ano_anterior:
                    faturamento_anterior += valor
                    pedidos_anterior += 1

            except: continue

        pagina += 1
        if pagina > 100: break

    salvar_cache(cache)
    
    # Processamento Final (Agrupamentos)
    produtos_agrupados_geral = defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    produtos_agrupados_cat = defaultdict(lambda: defaultdict(lambda: {"qtd": 0, "valor": 0.0}))

    for p in produtos_vendidos:
        produtos_agrupados_geral[p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_geral[p["nome"]]["valor"] += p["valor"]
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["qtd"] += p["qtd"]
        produtos_agrupados_cat[p["categoria"]][p["nome"]]["valor"] += p["valor"]

    top_produtos = sorted([{"nome": k, "qtd": v["qtd"], "valor": v["valor"]} for k, v in produtos_agrupados_geral.items()], key=lambda x: x["valor"], reverse=True)[:10]

    produtos_drilldown = {}
    for cat, prods in produtos_agrupados_cat.items():
        produtos_drilldown[cat] = sorted([{"nome": nome, "qtd": dados["qtd"], "valor": dados["valor"]} for nome, dados in prods.items()], key=lambda x: x["valor"], reverse=True)

    vendas_dia_lista = [{"dia": d, "valor": vendas_por_dia[d]["valor"], "qtd": vendas_por_dia[d]["qtd"]} for d in range(1, ultimo_dia_mes + 1)]
    categorias_lista = sorted([{"nome": k, "valor": v, "percentual": (v/total_faturamento*100) if total_faturamento > 0 else 0} for k, v in vendas_por_categoria.items()], key=lambda x: x['valor'], reverse=True)

    se_mes_passado = (alvo_mes < hoje.month and alvo_ano <= hoje.year) or (alvo_ano < hoje.year)
    dias_decorridos = ultimo_dia_mes if se_mes_passado else hoje.day
    dias_restantes = ultimo_dia_mes - dias_decorridos
    
    media_dia = total_faturamento / dias_decorridos if dias_decorridos > 0 else 0
    projecao_mes = media_dia * ultimo_dia_mes

    nome_meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
    mes_ano_formatado = f"{nome_meses[alvo_mes - 1]}/{alvo_ano}"

    # Cálculos de Ticket e Crescimento
    ticket_medio_atual = total_faturamento / total_pedidos if total_pedidos > 0 else 0
    ticket_medio_anterior = faturamento_anterior / pedidos_anterior if pedidos_anterior > 0 else 0

    def calc_cresc(atual, anterior):
        if anterior == 0: return 100.0 if atual > 0 else 0.0
        return round(((atual - anterior) / anterior) * 100, 1)

    return {
        "resumo": {
            "mes_ano": mes_ano_formatado,
            "total_faturamento": total_faturamento,
            "total_pedidos": total_pedidos,
            "ticket_medio": ticket_medio_atual,
            "faturamento_anterior": faturamento_anterior,
            "pedidos_anterior": pedidos_anterior,
            "ticket_medio_anterior": ticket_medio_anterior,
            "cresc_faturamento": calc_cresc(total_faturamento, faturamento_anterior),
            "cresc_pedidos": calc_cresc(total_pedidos, pedidos_anterior),
            "cresc_ticket": calc_cresc(ticket_medio_atual, ticket_medio_anterior),
            "meta_mensal": meta_mensal,
            "percentual_meta": (total_faturamento / meta_mensal * 100) if meta_mensal > 0 else 0,
            "falta_atingir": max(0, meta_mensal - total_faturamento),
            "dias_decorridos": dias_decorridos,
            "dias_restantes": dias_restantes,
            "media_dia": media_dia,
            "projecao_mes": projecao_mes,
        },
        "graficos": {
            "vendas_por_dia": vendas_dia_lista,
            "categorias": categorias_lista,
            "formas_pagamento": sorted([{"nome": k, "valor": v} for k, v in vendas_por_forma_pagamento.items()], key=lambda x: x['valor'], reverse=True),
            "top_produtos": top_produtos,
            "produtos_por_categoria": produtos_drilldown
        },
        "pedidos_recentes": sorted(pedidos_detalhados, key=lambda x: x['data'], reverse=True)[:20]
    }
# ==========================================
# ROTA 4: RESUMO GERAL (MANTIDA E OTIMIZADA)
# ==========================================
@app.get("/api/dashboard/resumo")
def get_dashboard_data(ano: int = 2026, dias_kpi: int = 30, dias_graficos: int = 30, kpi_inicio: str = None, kpi_fim: str = None, graficos_inicio: str = None, graficos_fim: str = None):
    cache = carregar_cache() # <--- Otimização
    headers = get_headers()
    
    ano_anterior = ano - 1
    agora = get_now_br()
    
    # ==========================================
    # 1. DEFINIÇÃO DAS DATAS DOS KPIs
    # ==========================================
    if kpi_inicio and kpi_fim:
        # Se vieram datas personalizadas da URL, usa elas
        data_limite_kpi = datetime.strptime(kpi_inicio, "%Y-%m-%d").date()
        data_fim_kpi_real = datetime.strptime(kpi_fim, "%Y-%m-%d").date()
        dias_diferenca = (data_fim_kpi_real - data_limite_kpi).days + 1
        data_limite_kpi_anterior = data_limite_kpi - timedelta(days=dias_diferenca)
    else:
        # Se NÃO vieram datas, usa a lógica ORIGINAL
        data_limite_kpi = (agora - timedelta(days=dias_kpi)).date()
        data_fim_kpi_real = agora.date()
        data_limite_kpi_anterior = (agora - timedelta(days=dias_kpi * 2)).date()

    # ==========================================
    # 2. DEFINIÇÃO DAS DATAS DOS GRÁFICOS E PRODUTOS
    # ==========================================
    if graficos_inicio and graficos_fim:
        # Se vieram datas personalizadas, usa elas
        data_limite_graficos = datetime.strptime(graficos_inicio, "%Y-%m-%d").date()
        data_fim_graficos_real = datetime.strptime(graficos_fim, "%Y-%m-%d").date()
    else:
        # Lógica ORIGINAL
        data_limite_graficos = (agora - timedelta(days=dias_graficos)).date()
        data_fim_graficos_real = agora.date()
    
    # Variáveis Originais mantidas
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
        
        # Trava de segurança original
        if not items or pagina > 200: break 

        for p_resumo in items:
            dt_pedido_full = datetime.strptime(p_resumo.get('dataHora').split()[0], "%Y-%m-%d")
            dt_pedido = dt_pedido_full.date() # Extrai apenas a data para ficar fácil de comparar
            situacao = p_resumo.get('pedidoSituacaoDescricao', '').lower()
            
            if 'cancelado' in situacao or 'aguardando' in situacao: continue

            # --- CÁLCULO DESCONTANDO O FRETE (Mantido) ---
            valor_total = float(p_resumo.get('valorTotal') or 0)
            valor_frete = float(p_resumo.get('valorFrete') or 0)
            valor = valor_total - valor_frete

            if dt_pedido_full.year == ano: vendas_atual[dt_pedido_full.month] += valor
            elif dt_pedido_full.year == ano_anterior: vendas_passado[dt_pedido_full.month] += valor
            
            if dt_pedido_full.year < ano_anterior:
                continuar = False
                break

            # --- FILTROS DOS KPIs COM SUPORTE A DATAS CUSTOMIZADAS ---
            if dt_pedido >= data_limite_kpi and dt_pedido <= data_fim_kpi_real:
                faturamento_periodo += valor
                pedidos_periodo += 1
            elif dt_pedido >= data_limite_kpi_anterior and dt_pedido < data_limite_kpi:
                faturamento_periodo_anterior += valor
                pedidos_periodo_anterior += 1

            # --- FILTROS DE PRODUTOS/GRÁFICOS COM SUPORTE A DATAS CUSTOMIZADAS ---
            if dt_pedido >= data_limite_graficos and dt_pedido <= data_fim_graficos_real:
                codigo_p = str(p_resumo.get('codigo'))
                # OTIMIZAÇÃO: Tenta cache primeiro (Mantido)
                if codigo_p not in cache:
                    try:
                        det = requests.get(f"{BASE_URL}/v2/site/pedido/{codigo_p}", headers=headers).json()
                        cache[codigo_p] = det.get('data', {})
                    except: pass
                
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

    # Processamento Final (Produtos) - Mantido igualzinho
    produtos_final = {}
    for d in analise_produtos:
        key = f"{d['nome']}|{d['codigo']}"
        if key not in produtos_final:
            produtos_final[key] = {"nome": d['nome'], "codigo": d['codigo'], "qtd": 0}
        produtos_final[key]["qtd"] += 1

    top_produtos = sorted(produtos_final.values(), key=lambda x: x["qtd"], reverse=True)[:15]
    
    def calcular_crescimento(atual, anterior):
        if anterior == 0: return 100.0 if atual > 0 else 0.0
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


# ==========================================
# ROTA: CARRINHOS ABANDONADOS (COM LEAD)
# ==========================================
@app.get("/api/dashboard/carrinhos-abandonados")
def get_carrinhos_abandonados(dias: int = 7):
    headers = get_headers()
    hoje = get_now_br()
    data_inicio = (hoje - timedelta(days=dias)).strftime("%Y-%m-%d")
    data_fim = hoje.strftime("%Y-%m-%d")

    # 1. Busca a lista resumida
    res = requests.get(
        f"{BASE_URL}/v2/site/carrinho", 
        auth=(USUARIO, SENHA), 
        params={
            "limit": 100, 
            "order": "id",
            "orderDirection": "desc", 
            "dataAtualizacaoInicio": data_inicio,
            "dataAtualizacaoFim": data_fim
        }
    )
    
    if res.status_code != 200:
        return {"carrinhos": []}

    itens_brutos = res.json().get('data', {}).get('items', [])
    
    # ==========================================
    # 💥 O FILTRO MÁGICO QUE REMOVE COMPRAS FINALIZADAS
    # Só mantemos o carrinho se o campo "pedido" estiver vazio (None)
    # ==========================================
    itens_resumo = [item for item in itens_brutos if not item.get('pedido')]

    leads_encontrados = []

    # 2. Função para buscar o detalhe de cada carrinho (será usada em paralelo)
    def fetch_carrinho_detail(item):
        cid = item.get('id')
        try:
            res_det = requests.get(f"{BASE_URL}/v2/site/carrinho/{cid}/itens", auth=(USUARIO, SENHA), timeout=10)
            if res_det.status_code == 200:
                dados = res_det.json().get('data', {}).get('carrinho', {})
                pessoa = dados.get('pessoa', {})
                
                # Só retorna se tiver contato
                if pessoa and (pessoa.get('email') or pessoa.get('contato_principal')):
                    # Formata data
                    dt_str = dados.get('ultima_atualizacao', item.get('dataAtualizacao', ''))
                    try:
                        dt_obj = datetime.strptime(dt_str[:19], "%Y-%m-%d %H:%M:%S")
                        data_pt = dt_obj.strftime("%d/%m/%Y %H:%M")
                    except:
                        data_pt = dt_str

                    return {
                        "id": cid,
                        "data": data_pt,
                        "nome": pessoa.get('nome'),
                        "email": pessoa.get('email'),
                        "telefone": pessoa.get('contato_principal'),
                        "url_checkout": dados.get('url_checkout'),
                        "total_itens": len(dados.get('itens', [])),
                        "produtos": [
                            {"nome": i.get('produto_nome', 'Produto'), "img": i.get('midia_url')} 
                            for i in dados.get('itens', [])
                        ]
                    }
        except: pass
        return None

    # 3. Execução em paralelo para ser rápido
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_carrinho_detail, itens_resumo))
        leads_encontrados = [r for r in results if r is not None]

    # --- ADICIONE ESTA LINHA ---
    leads_encontrados.sort(key=lambda x: x["id"], reverse=True)

    return {"carrinhos": leads_encontrados}

if __name__ == "__main__":
    import uvicorn
    # Usa porta 8000 para local, ou a que o ambiente pedir
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)