import requests
import base64
import os
from dotenv import load_dotenv

load_dotenv()

USUARIO = os.getenv("MAGAZORD_USER")
SENHA = os.getenv("MAGAZORD_PASS")
BASE_URL = os.getenv("MAGAZORD_URL")

def testar_rota_estoque():
    print("🕵️ Testando rota de Projeção de Estoque para imagens...")
    
    credenciais = f"{USUARIO}:{SENHA}"
    token_b64 = base64.b64encode(credenciais.encode()).decode()
    headers = {"Authorization": f"Basic {token_b64}"}
    
    # Vamos pedir apenas os primeiros 5 produtos para testar
    url = f"{BASE_URL}/v2/site/estoque/projecaoEstoque/produtoDerivacao"
    params = {"limit": 5}
    
    try:
        res = requests.get(url, headers=headers, params=params)
        if res.status_code != 200:
            print(f"❌ Erro na API: {res.status_code}")
            return

        dados = res.json().get('data', {}).get('items', [])
        
        for item in dados:
            nome = item.get('nome')
            sku = item.get('sku')
            midia = item.get('midia')
            
            print(f"\n📦 Produto: {nome} (SKU: {sku})")
            if midia:
                url_final = f"https://viadoterno.cdn.magazord.com.br/{midia}"
                print(f"🖼️ URL DA IMAGEM: {url_final}")
            else:
                print("⚠️ Produto sem campo 'midia'.")

    except Exception as e:
        print(f"❌ Erro: {e}")

if __name__ == "__main__":
    testar_rota_estoque()