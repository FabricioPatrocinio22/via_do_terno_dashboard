import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")
if BASE_URL and BASE_URL.endswith('/'): BASE_URL = BASE_URL[:-1]

def testar_detalhe_pessoa():
    print(f"🌐 Conectando em: {BASE_URL}")
    print("1. Buscando o último cliente para pegar o ID...")
    
    # 1. Pega 1 cliente da lista
    res = requests.get(
        f"{BASE_URL}/v2/site/pessoa", 
        auth=(USUARIO, SENHA), 
        params={"limit": 1, "orderDirection": "desc"}
    )
    
    if res.status_code != 200:
        print(f"❌ Erro na lista: {res.status_code} - {res.text}")
        return
        
    items = res.json().get("data", {}).get("items", [])
    if isinstance(items, dict): items = [items]
    
    if not items:
        print("Nenhum cliente encontrado na lista.")
        return
        
    pid = items[0].get("id")
    nome = items[0].get("nome")
    
    print(f"✅ Encontrado! ID: {pid} | Nome: {nome}")
    print(f"\n2. Acessando a ficha detalhada: /v2/site/pessoa/{pid} ...")
    
    # 2. Puxa a ficha detalhada
    res_det = requests.get(f"{BASE_URL}/v2/site/pessoa/{pid}", auth=(USUARIO, SENHA))
    
    print(f"Status da resposta: {res_det.status_code}\n")
    
    try:
        json_detalhe = res_det.json()
        print("="*60)
        print("📦 JSON COMPLETO DA FICHA DETALHADA:")
        print("="*60)
        print(json.dumps(json_detalhe, indent=2, ensure_ascii=False))
        print("="*60)
    except Exception as e:
        print(f"Erro ao ler JSON: {e}")
        print("Texto bruto retornado:")
        print(res_det.text)

if __name__ == "__main__":
    if not BASE_URL or not USUARIO or not SENHA:
        print("❌ ERRO: Variáveis de ambiente faltando.")
    else:
        testar_detalhe_pessoa()