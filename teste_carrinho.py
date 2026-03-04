import requests
import json
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")

if BASE_URL and BASE_URL.endswith('/'):
    BASE_URL = BASE_URL[:-1]

# ==========================================
# CONFIGURAÇÃO DE TEMPO
# Mude aqui para quantos dias para trás você quer buscar
DIAS_DE_BUSCA = 30  
# ==========================================

def investigar_carrinhos():
    print(f"🌐 Conectando em: {BASE_URL}")
    print(f"1. Buscando os últimos carrinhos ({DIAS_DE_BUSCA} dias)...")
    
    url_lista = f"{BASE_URL}/v2/site/carrinho"
    
    hoje = datetime.now()
    data_inicio = (hoje - timedelta(days=DIAS_DE_BUSCA)).strftime("%Y-%m-%d")
    data_fim = hoje.strftime("%Y-%m-%d")
    
    params = {
        "limit": 100,
        "orderDirection": "desc",
        "dataAtualizacaoInicio": data_inicio,
        "dataAtualizacaoFim": data_fim
    }
    
    res = requests.get(url_lista, auth=(USUARIO, SENHA), params=params)
    
    if res.status_code != 200:
        print(f"Erro na listagem: {res.status_code} - {res.text}")
        return
        
    itens = res.json().get("data", {}).get("items", [])
    
    if not itens:
        print(f"Nenhum carrinho encontrado nos últimos {DIAS_DE_BUSCA} dias.")
        return
        
    print(f"✅ Encontrados {len(itens)} carrinhos recentes.")
    print("🕵️‍♂️ Filtrando silenciosamente apenas os que possuem contato...\n")
    print("="*60)
    
    carrinhos_com_lead = 0
    
    for carrinho in itens:
        carrinho_id = carrinho.get("id")
        
        # Pega a data da listagem primeiro para garantir
        data_atualizacao_str = carrinho.get("dataAtualizacao", "")
        
        url_detalhe = f"{BASE_URL}/v2/site/carrinho/{carrinho_id}/itens"
        res_det = requests.get(url_detalhe, auth=(USUARIO, SENHA))
        
        if res_det.status_code == 200:
            dados_carrinho = res_det.json().get("data", {}).get("carrinho", {})
            pessoa = dados_carrinho.get("pessoa", {})
            
            # Se a data não veio na lista, tenta pegar do detalhe
            if not data_atualizacao_str:
                data_atualizacao_str = dados_carrinho.get("ultima_atualizacao", "")
                
            # Formatação da data (de "2026-03-04 14:30:00" para "04/03/2026 às 14:30")
            data_formatada = "Data Desconhecida"
            if data_atualizacao_str:
                try:
                    # Corta os milissegundos se houver e formata
                    dt_obj = datetime.strptime(data_atualizacao_str[:19], "%Y-%m-%d %H:%M:%S")
                    data_formatada = dt_obj.strftime("%d/%m/%Y às %H:%M")
                except:
                    data_formatada = data_atualizacao_str

            # Verifica se tem contato
            if pessoa and (pessoa.get("email") or pessoa.get("contato_principal")):
                carrinhos_com_lead += 1
                
                print(f"\n🚨 LEAD QUENTE ENCONTRADO! (Carrinho: {carrinho_id})")
                print(f"🕒 Abandono em: {data_formatada}") # <--- DATA AQUI
                print(f"👤 Nome:        {pessoa.get('nome')}")
                print(f"📧 E-mail:      {pessoa.get('email')}")
                print(f"📱 Telefone:    {pessoa.get('contato_principal')}")
                print(f"🔗 Checkout:    {dados_carrinho.get('url_checkout')}")
                
                itens_carrinho = dados_carrinho.get('itens', [])
                print(f"📦 Produtos:    {len(itens_carrinho)} item(ns)")
                for item in itens_carrinho:
                     print(f"   - SKU: {item.get('codigo_produto')} (Qtd: {item.get('quantidade')})")
                
                print("-" * 60)
            else:
                print(".", end="", flush=True)
        else:
            print(f"\nErro no carrinho {carrinho_id}: HTTP {res_det.status_code}")

    print("\n" + "="*60)
    print(f"📊 RESUMO: De {len(itens)} carrinhos recentes, {carrinhos_com_lead} tinham contatos salvos!")

if __name__ == "__main__":
    if not BASE_URL or not USUARIO or not SENHA:
        print("❌ ERRO: Variáveis de ambiente faltando.")
    else:
        investigar_carrinhos()