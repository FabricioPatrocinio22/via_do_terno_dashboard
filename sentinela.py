import requests
import time
from datetime import datetime

# --- MUDANÇA AQUI: Adicionei /docs no final ---
URL = "https://api-viadoterno.onrender.com/docs"

print(f"🤖 Sentinela Iniciado! Monitorando: {URL}")
print("Vou dar um 'cutucão' no site a cada 10 minutos para ele não dormir.")
print("-" * 50)

while True:
    try:
        momento = datetime.now().strftime("%H:%M:%S")
        response = requests.get(URL)
        
        # Agora ele vai receber 200 e mostrar verde
        if response.status_code == 200:
            print(f"[{momento}] ✅ Sucesso! O site está acordado.")
        else:
            print(f"[{momento}] ⚠️ O site respondeu com código: {response.status_code}")
            
    except Exception as e:
        print(f"[{momento}] ❌ Erro de conexão: {e}")
    
    time.sleep(500)