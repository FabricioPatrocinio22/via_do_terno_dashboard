import requests
import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")
if BASE_URL and BASE_URL.endswith('/'): BASE_URL = BASE_URL[:-1]

def buscar_carrinhos_hoje():
    hoje = datetime.now()
    hoje_str = hoje.strftime("%Y-%m-%d")
    amanha_str = (hoje + timedelta(days=1)).strftime("%Y-%m-%d")
    
    print(f"🔍 Buscando carrinhos CRIADOS HOJE ({hoje_str})...")
    
    carrinhos_brutos = []
    
    for pagina in range(1, 6):
        print(f"   Lendo página {pagina} da API...")
        res = requests.get(
            f"{BASE_URL}/v2/site/carrinho", 
            auth=(USUARIO, SENHA), 
            params={
                "limit": 100,
                "page": pagina,
                "orderDirection": "desc",
                # Usa amanhã como fim para garantir que carrinhos de hoje entram
                "dataAtualizacaoInicio": hoje_str,
                "dataAtualizacaoFim": amanha_str
            }
        )
        
        if res.status_code == 200:
            items = res.json().get('data', {}).get('items', [])
            if not items: break
            
            for item in items:
                if item.get('pedido'):
                    continue
                
                # Filtra apenas os criados HOJE pelo dataInicio
                data_inicio_item = item.get('dataInicio', '')[:10]
                if data_inicio_item == hoje_str:
                    carrinhos_brutos.append(item)
                    
            if len(items) < 100: break
        else:
            print(f"   ❌ Erro na página {pagina}: {res.status_code}")
            break

    print(f"\n📦 Carrinhos criados HOJE (sem pedido): {len(carrinhos_brutos)}")
    
    if not carrinhos_brutos:
        print("⚠️  Nenhum carrinho criado hoje encontrado.")
        print("    Isso pode significar que não houve carrinhos hoje ainda.")
        return

    carrinhos_brutos.sort(key=lambda x: x.get('id', 0), reverse=True)
    
    print(f"\n🔎 IDs encontrados hoje: {[c.get('id') for c in carrinhos_brutos]}\n")
    print("🔎 Investigando em busca de contatos...\n")
    
    leads_encontrados = []
    
    for item in carrinhos_brutos:
        cid = item.get('id')
        data_criacao = item.get('dataInicio', '')[:16].replace('T', ' ')
        r = requests.get(f"{BASE_URL}/v2/site/carrinho/{cid}/itens", auth=(USUARIO, SENHA))
        
        if r.status_code == 200:
            detalhe = r.json().get('data', {}).get('carrinho', {})
            pessoa = detalhe.get('pessoa')
            
            if pessoa and (pessoa.get('email') or pessoa.get('contato_principal')):
                leads_encontrados.append(cid)
                nome = pessoa.get('nome') or "Sem Nome"
                telefone = pessoa.get('contato_principal') or "Sem Telefone"
                email = pessoa.get('email') or "Sem Email"
                print(f"   ✅ [ID {cid}] [{data_criacao}] LEAD: {nome} | Tel: {telefone} | Email: {email}")
            else:
                print(f"   👻 [ID {cid}] [{data_criacao}] Fantasma (sem contato)")
        else:
            print(f"   ❌ [ID {cid}] Erro ao abrir detalhes: {r.status_code}")

    print("\n========================================")
    print(f"🎯 RESULTADO: {len(leads_encontrados)} leads de hoje!")
    print("========================================")

if __name__ == "__main__":
    buscar_carrinhos_hoje()