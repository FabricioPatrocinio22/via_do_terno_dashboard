import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")
if BASE_URL and BASE_URL.endswith('/'): BASE_URL = BASE_URL[:-1]

def testar_carrinhos_de_hoje():
    # Pega exatamente a data de hoje
    hoje = datetime.now()
    data_inicio = hoje.strftime("%Y-%m-%d 00:00:00")
    data_fim = hoje.strftime("%Y-%m-%d 23:59:59")
    
    print(f"🔍 Buscando carrinhos estritamente de HOJE: {data_inicio} até {data_fim}")
    
    res = requests.get(
        f"{BASE_URL}/v2/site/carrinho", 
        auth=(USUARIO, SENHA), 
        params={
            "limit": 50, 
            "orderDirection": "desc",
            "dataAtualizacaoInicio": data_inicio,
            "dataAtualizacaoFim": data_fim
        }
    )
    
    if res.status_code != 200:
        print(f"❌ Erro na API (Listagem): {res.status_code}")
        print(res.text)
        return

    dados = res.json()
    total = dados.get('data', {}).get('total', 0)
    items = dados.get('data', {}).get('items', [])
    
    print(f"✅ Encontrados {total} carrinhos atualizados HOJE.")
    
    # Filtra os que não viraram pedido
    abandonados = [i for i in items if not i.get('pedido')]
    print(f"🛒 Destes, {len(abandonados)} não viraram pedido (estão abertos ou abandonados).")
    
    if not abandonados:
        print("Nenhum carrinho foi abandonado hoje na primeira página.")
        return

    print("\n🔎 Inspecionando os 5 mais recentes de HOJE para ver se têm contato...")
    for item in abandonados[:5]:
        cid = item.get('id')
        status = item.get('status')
        status_nome = "Aberto" if status == 1 else "Abandonado" if status == 2 else str(status)
        
        print(f"\n--- CARRINHO ID: {cid} (Status: {status_nome}) ---")
        
        r = requests.get(f"{BASE_URL}/v2/site/carrinho/{cid}/itens", auth=(USUARIO, SENHA))
        if r.status_code == 200:
            detalhe = r.json().get('data', {}).get('carrinho', {})
            pessoa = detalhe.get('pessoa')
            
            # Imprime as datas reais que a Magazord gravou
            print(f"Data Início: {detalhe.get('data_inicio')}")
            print(f"Última Atualização: {detalhe.get('ultima_atualizacao')}")
            
            # Verifica se tem dados de contato úteis
            if pessoa and (pessoa.get('email') or pessoa.get('contato_principal') or pessoa.get('nome')):
                print("✅ CLIENTE REAL ENCONTRADO:")
                # Mascarando dados para você poder colar no chat com segurança
                nome = pessoa.get('nome') or ""
                print(f"   Nome: {nome[:4]}***")
                print(f"   Email preenchido? {'Sim' if pessoa.get('email') else 'Não'}")
                print(f"   Telefone preenchido? {'Sim' if pessoa.get('contato_principal') else 'Não'}")
            else:
                print("👻 Cliente FANTASMA (Tudo nulo). O cliente não chegou a digitar os dados no checkout.")
        else:
            print(f"❌ Erro ao abrir detalhe do carrinho {cid}")

if __name__ == "__main__":
    testar_carrinhos_de_hoje()