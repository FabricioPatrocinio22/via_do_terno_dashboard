import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, RefreshCw, Filter, Award, Tag, Calendar, Loader2, ArrowUp, ArrowDown, CalendarDays, Settings, Lock, User, LogOut, MapPin, Shirt, UserX } from 'lucide-react';

function App() {
  // --- ESTADO DE AUTENTICAÇÃO ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // --- ESTADOS DO DASHBOARD ---
  const [data, setData] = useState(null);
  const [dataMesAtual, setDataMesAtual] = useState(null);

  // --- NOVOS ESTADOS SEPARADOS (AVANÇADO) ---
  const [dataGraficosAvancados, setDataGraficosAvancados] = useState(null);
  const [dataChurn, setDataChurn] = useState(null);

  const [loadingGraficos, setLoadingGraficos] = useState(false);
  const [loadingChurn, setLoadingChurn] = useState(false);
  const [loading, setLoading] = useState(true); // Loading geral (Login/Resumo)

  // --- FILTROS ---
  const [ano, setAno] = useState(2026);
  const [periodoKpi, setPeriodoKpi] = useState(30);
  const [periodoGraficos, setPeriodoGraficos] = useState(30);
  const [abaAtiva, setAbaAtiva] = useState('analitico');
  const [metaMensal, setMetaMensal] = useState(60000);

  // --- NOVOS FILTROS DA ABA AVANÇADA ---
  const [avancadoDias, setAvancadoDias] = useState(30); // Filtro dos Gráficos
  const [avancadoMesesChurn, setAvancadoMesesChurn] = useState(3); // Filtro do Churn

  // Customizações de Data
  const [modoKpiCustomizado, setModoKpiCustomizado] = useState(false);
  const [modoGraficosCustomizado, setModoGraficosCustomizado] = useState(false);
  const [kpiDataInicio, setKpiDataInicio] = useState('');
  const [kpiDataFim, setKpiDataFim] = useState('');
  const [graficosDataInicio, setGraficosDataInicio] = useState('');
  const [graficosDataFim, setGraficosDataFim] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('via_token');
    if (token === 'logado_com_sucesso') {
      setIsAuthenticated(true);
    }
    setAuthLoading(false);
  }, []);

  const fetchData = async () => {
    if (!isAuthenticated) return;

    // Loading geral apenas se NÃO for a aba avançado (pois ela tem loadings próprios)
    if (abaAtiva !== 'avancado') setLoading(true);

    try {
      const BASE_API = "https://api-viadoterno.onrender.com";

      if (abaAtiva === 'analitico') {
        const res = await axios.get(`${BASE_API}/api/dashboard/resumo?ano=${ano}&dias_kpi=${periodoKpi}&dias_graficos=${periodoGraficos}`);
        setData(res.data);
        setLoading(false);
      }
      else if (abaAtiva === 'mes-atual') {
        const res = await axios.get(`${BASE_API}/api/dashboard/mes-atual?meta_mensal=${metaMensal}`);
        setDataMesAtual(res.data);
        setLoading(false);
      }
      else if (abaAtiva === 'avancado') {
        // --- LÓGICA DE DUAS ROTAS PARALELAS ---

        // 1. Chama os Gráficos (Rápido)
        setLoadingGraficos(true);
        axios.get(`${BASE_API}/api/dashboard/graficos-avancados?dias=${avancadoDias}`)
          .then(res => {
            setDataGraficosAvancados(res.data);
            setLoadingGraficos(false);
          })
          .catch(err => {
            console.error("Erro gráficos:", err);
            setLoadingGraficos(false);
          });

        // 2. Chama o Churn (Lento/Auto-Repair)
        setLoadingChurn(true);
        axios.get(`${BASE_API}/api/dashboard/churn?meses=${avancadoMesesChurn}`)
          .then(res => {
            setDataChurn(res.data);
            setLoadingChurn(false);
          })
          .catch(err => {
            console.error("Erro churn:", err);
            setLoadingChurn(false);
          });
      }
    } catch (err) {
      console.error("Erro geral:", err);
      setLoading(false);
      if (err.response && err.response.status === 401) handleLogout();
    }
  };

  // --- USE EFFECT PRINCIPAL ---
  // Aqui adicionamos 'avancadoDias' e 'avancadoMesesChurn' na lista
  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [
    ano,
    periodoKpi,
    periodoGraficos,
    abaAtiva,
    metaMensal,
    isAuthenticated,
    avancadoDias,       // <--- NOVO: Recarrega gráficos se mudar dias
    avancadoMesesChurn  // <--- NOVO: Recarrega churn se mudar meses
  ]);

  const handleLogout = () => {
    localStorage.removeItem('via_token');
    setIsAuthenticated(false);
    setData(null);
    setDataMesAtual(null);
    setDataGraficosAvancados(null);
    setDataChurn(null);
  };

  // Função para forçar atualização APENAS do Churn (Botão Sincronizar)
  const syncChurnOnly = () => {
    const BASE_API = "https://api-viadoterno.onrender.com";
    setLoadingChurn(true);
    axios.get(`${BASE_API}/api/dashboard/churn?meses=${avancadoMesesChurn}`)
      .then(res => {
        setDataChurn(res.data);
        setLoadingChurn(false);
      })
      .catch(err => setLoadingChurn(false));
  };

  if (authLoading) return null;

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const formatMoney = (val) => {
    if (typeof val === 'string') return val;
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatarPeriodo = (dias, dataInicio) => { if (!dataInicio) return `${dias} dias`; return "Período"; };
  const obterLabelPeriodo = (dias, dataInicio) => { if (dataInicio) return "Customizado"; return `${dias} dias`; };
  const aplicarPeriodoKpiCustomizado = () => { /* ... */ };
  const aplicarPeriodoGraficosCustomizado = () => { /* ... */ };
  const CORES_CATEGORIA = ['#059669', '#2563eb', '#7c3aed', '#c2410c', '#be123c', '#0d9488', '#4f46e5', '#ea580c', '#0891b2', '#65a30d'];
  const formatarNomeCategoria = (nome) => nome;

  return (
    <div className="relative min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8">
      {/* Loading Geral (Apenas para Analítico e Mês Atual) */}
      {loading && abaAtiva !== 'avancado' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm transition-all">
          <img
            src="https://viadoterno.cdn.magazord.com.br/img/2026/02/logo/3331/logo-via-do-terno.png?_gl=1*2r1ugl*_ga*MTA1MzYyMDcwOC4xNzYwNzA5OTQ0*_ga_4JXK3QVJ6X*czE3NzAyMDQ3NTckbzI5NiRnMSR0MTc3MDIxMDQzMyRqMjYkbDAkaDA."
            alt="Carregando..."
            className="h-24 md:h-32 object-contain animate-logo-breathe mb-6"
          />
          <div className="w-48 h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-slate-800 animate-[pulse_1.5s_ease-in-out_infinite] w-2/3 rounded-full"></div>
          </div>
          <p className="text-gray-500 font-light tracking-[0.2em] uppercase text-xs animate-pulse">
            Sincronizando dados...
          </p>
        </div>
      )}

      <div className={`transition-all duration-500`}>
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-gray-100 pb-8">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <img src="https://viadoterno.cdn.magazord.com.br/resources/LOGO%20HORIZONTAL%20VIA.png" alt="Via do Terno" className="h-16 md:h-20 object-contain" />
            <div className="hidden md:block w-px h-12 bg-gray-300"></div>
            <h1 className="text-gray-600 font-light text-xl md:text-2xl tracking-[0.2em] uppercase text-center md:text-left">Painel de Inteligência</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchData} className="group flex items-center gap-3 px-5 py-3 bg-white rounded-full shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-100 transition-all">
              <span className="text-xs font-bold text-gray-400 group-hover:text-blue-600 uppercase tracking-wider">Sincronizar</span>
              <RefreshCw size={18} className="text-gray-400 group-hover:text-blue-600 group-hover:rotate-180 transition-all duration-700" />
            </button>
            <button onClick={handleLogout} className="p-3 bg-red-50 rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors" title="Sair">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="mb-8 flex gap-4 border-b border-gray-200 overflow-x-auto">
          <button onClick={() => setAbaAtiva('analitico')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'analitico' ? 'text-blue-600' : 'text-gray-400'}`}>
            Análise por Período
            {abaAtiva === 'analitico' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
          <button onClick={() => setAbaAtiva('mes-atual')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'mes-atual' ? 'text-emerald-600' : 'text-gray-400'}`}>
            Mês Atual
            {abaAtiva === 'mes-atual' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></div>}
          </button>
          <button onClick={() => setAbaAtiva('avancado')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'avancado' ? 'text-purple-600' : 'text-gray-400'}`}>
            Estratégico & Churn
            {abaAtiva === 'avancado' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600"></div>}
          </button>
        </div>

        {/* RENDERIZAÇÃO CONDICIONAL DAS ABAS */}
        {abaAtiva === 'analitico' && (
          <DashboardAnalitico
            data={data} ano={ano} setAno={setAno}
            periodoKpi={periodoKpi} setPeriodoKpi={setPeriodoKpi}
            periodoGraficos={periodoGraficos} setPeriodoGraficos={setPeriodoGraficos}
            modoKpiCustomizado={modoKpiCustomizado} setModoKpiCustomizado={setModoKpiCustomizado}
            modoGraficosCustomizado={modoGraficosCustomizado} setModoGraficosCustomizado={setModoGraficosCustomizado}
            kpiDataInicio={kpiDataInicio} setKpiDataInicio={setKpiDataInicio}
            kpiDataFim={kpiDataFim} setKpiDataFim={setKpiDataFim}
            graficosDataInicio={graficosDataInicio} setGraficosDataInicio={setGraficosDataInicio}
            graficosDataFim={graficosDataFim} setGraficosDataFim={setGraficosDataFim}
            formatMoney={formatMoney} formatarPeriodo={formatarPeriodo} obterLabelPeriodo={obterLabelPeriodo}
            aplicarPeriodoKpiCustomizado={aplicarPeriodoKpiCustomizado} aplicarPeriodoGraficosCustomizado={aplicarPeriodoGraficosCustomizado}
            CORES_CATEGORIA={CORES_CATEGORIA} formatarNomeCategoria={formatarNomeCategoria}
          />
        )}

        {abaAtiva === 'mes-atual' && (
          <DashboardMesAtual
            data={dataMesAtual} formatMoney={formatMoney} metaMensal={metaMensal} setMetaMensal={setMetaMensal}
          />
        )}

        {/* NOVA TELA AVANÇADA COM PROPS ATUALIZADAS */}
        {abaAtiva === 'avancado' && (
          <DashboardAvancado
            dataGraficos={dataGraficosAvancados}
            dataChurn={dataChurn}
            formatMoney={formatMoney}

            dias={avancadoDias}
            setDias={setAvancadoDias}
            loadingGraficos={loadingGraficos}

            mesesChurn={avancadoMesesChurn}
            setMesesChurn={setAvancadoMesesChurn}
            loadingChurn={loadingChurn}

            onSyncChurn={syncChurnOnly}
          />
        )}
      </div>
    </div>
  );
}

// === COMPONENTE: DASHBOARD AVANÇADO ATUALIZADO ===
function DashboardAvancado({
  dataGraficos, dataChurn, formatMoney,
  dias, setDias, loadingGraficos,
  mesesChurn, setMesesChurn, loadingChurn,
  onSyncChurn
}) {

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

        {/* --- COLUNA ESQUERDA: GRÁFICOS --- */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-gray-800">Análise Geográfica e Produtos</h2>
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-gray-200 shadow-sm">
              <Filter size={18} className="text-blue-600" />
              <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="bg-transparent font-bold text-blue-700 outline-none cursor-pointer">
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 3 meses</option>
                <option value={180}>Últimos 6 meses</option>
              </select>
            </div>
          </div>

          {loadingGraficos ? (
            <div className="bg-white p-12 rounded-3xl text-center text-gray-400 animate-pulse border border-gray-100 shadow-sm">
              <Loader2 className="animate-spin h-8 w-8 mx-auto mb-2 text-blue-400" />
              Carregando gráficos...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gráfico Estados */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-blue-600"><MapPin size={20} /> Vendas por Estado</h3>
                {dataGraficos?.geografico?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dataGraficos.geografico} layout="vertical"><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={30} tick={{ fontWeight: 'bold' }} /><Tooltip formatter={(v) => formatMoney(v)} /><Bar dataKey="valor" fill="#3b82f6" radius={[0, 4, 4, 0]} /></BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 text-center py-10">Sem dados neste período.</p>}
              </div>
              {/* Gráfico Produtos */}
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-purple-600"><Shirt size={20} /> Top Variações</h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {dataGraficos?.produtos_variacao?.length > 0 ? dataGraficos.produtos_variacao.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm border-b border-gray-50 pb-2">
                      <span className="font-bold text-gray-700 truncate w-2/3">{p.name}</span>
                      <span className="font-black text-purple-600">{p.qtd} un</span>
                    </div>
                  )) : <p className="text-gray-400 text-center py-10">Sem dados neste período.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- SEÇÃO CHURN (Separada) --- */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-red-100 mt-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2 text-red-600"><UserX size={22} /> Clientes em Risco</h3>
            <p className="text-sm text-gray-500">Clientes que não compram há mais de {mesesChurn} meses.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onSyncChurn} disabled={loadingChurn} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors" title="Forçar busca de clientes antigos">
              <RefreshCw size={20} className={loadingChurn ? "animate-spin" : ""} />
            </button>
            <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
              <span className="text-xs font-bold text-red-400 uppercase">Considerar Inativo:</span>
              <select value={mesesChurn} onChange={(e) => setMesesChurn(Number(e.target.value))} className="bg-transparent font-bold text-red-600 outline-none text-sm cursor-pointer">
                <option value={1}>+1 Mês</option>
                <option value={2}>+2 Meses</option>
                <option value={3}>+3 Meses</option>
                <option value={6}>+6 Meses</option>
              </select>
            </div>
          </div>
        </div>

        {loadingChurn ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Analisando histórico e recuperando clientes antigos...</p>
            <p className="text-xs text-gray-300 mt-1">Isso pode levar alguns segundos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-red-50/50 text-red-400 text-xs uppercase font-bold">
                <tr><th className="px-4 py-3 text-left">Cliente</th><th className="px-4 py-3 text-left">Última Compra</th><th className="px-4 py-3 text-left">Tempo Inativo</th><th className="px-4 py-3 text-right">Ação</th></tr>
              </thead>
              <tbody>
                {dataChurn?.churn?.map((c, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-red-50 transition-colors">
                    <td className="px-4 py-3"><p className="font-bold text-gray-800 text-sm">{c.nome}</p><p className="text-xs text-gray-400">{c.email}</p></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.data_formatada}</td>
                    <td className="px-4 py-3"><span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">{c.dias_inativo} dias</span></td>
                    <td className="px-4 py-3 text-right"><a href={`mailto:${c.email}`} className="text-blue-600 font-bold text-xs hover:underline">Email</a></td>
                  </tr>
                ))}
                {(!dataChurn?.churn || dataChurn.churn.length === 0) && (
                  <tr><td colSpan="4" className="text-center py-8 text-gray-400">Nenhum cliente encontrado com estes critérios ainda.<br /><span className="text-xs">Clique no botão de atualizar para buscar mais clientes antigos.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// === COMPONENTE: TELA DE LOGIN ===
function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // AJUSTE SEU IP AQUI TBM
      await axios.post('https://api-viadoterno.onrender.com/api/login', { username, password });

      // Se deu certo:
      localStorage.setItem('via_token', 'logado_com_sucesso');
      onLoginSuccess();
    } catch (err) {
      setError('Usuário ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          <img src="https://viadoterno.cdn.magazord.com.br/resources/LOGO%20HORIZONTAL%20VIA.png" alt="Logo" className="h-16 object-contain mx-auto relative z-10 brightness-0 invert" />
          <p className="text-gray-400 text-sm mt-4 font-light tracking-widest uppercase relative z-10">Acesso Restrito</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Usuário</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 text-gray-400" size={20} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold py-3 pl-12 pr-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="Ex: admin"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold py-3 pl-12 pr-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-500 text-sm font-bold px-4 py-3 rounded-xl flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'ACESSAR DASHBOARD'}
          </button>
        </form>
      </div>
      <p className="text-gray-400 text-xs mt-8">Via do Terno Analytics &copy; 2026</p>
    </div>
  );
}

// ... MANTENHA AQUI EMBAIXO OS OUTROS COMPONENTES: DashboardAnalitico, DashboardMesAtual, KpiCard ...

// === COMPONENTE: Dashboard Analítico ===
function DashboardAnalitico({
  data, ano, setAno, periodoKpi, setPeriodoKpi, periodoGraficos, setPeriodoGraficos,
  modoKpiCustomizado, setModoKpiCustomizado, modoGraficosCustomizado, setModoGraficosCustomizado,
  kpiDataInicio, setKpiDataInicio, kpiDataFim, setKpiDataFim,
  graficosDataInicio, setGraficosDataInicio, graficosDataFim, setGraficosDataFim,
  formatMoney, formatarPeriodo, obterLabelPeriodo, aplicarPeriodoKpiCustomizado,
  aplicarPeriodoGraficosCustomizado, CORES_CATEGORIA, formatarNomeCategoria
}) {

  const linhaTempoComDiff = data?.graficos?.linha_tempo?.map((item) => {
    const passado = Number(item.vendas_passado) || 0;
    const atual = Number(item.vendas_atual) || 0;
    let diferenca_pct = passado > 0 ? Math.round(((atual - passado) / passado) * 100) : (atual > 0 ? 100 : 0);
    return { ...item, diferenca_pct };
  }) ?? [];

  return (
    <>
      {/* GRÁFICO LINHA */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-blue-600" /> Comparativo de Vendas Mensais
          </h2>
          <select
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="bg-gray-100 px-4 py-2 rounded-xl font-bold text-blue-600 outline-none"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
        </div>
        <div className="h-[350px]">
          {data && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={linhaTempoComDiff}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={({ x, y, payload }) => {
                    const row = linhaTempoComDiff.find((d) => d.name === payload.value);
                    const diff = row?.diferenca_pct;
                    const cor = diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#94a3b8';
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text x={0} y={0} dy={14} textAnchor="middle" fill="#94a3b8" fontSize={12}>
                          {payload.value}
                        </text>
                        {diff !== undefined && (
                          <text x={0} y={0} dy={28} textAnchor="middle" fill={cor} fontSize={11} fontWeight={700}>
                            {diff > 0 ? '+' : ''}{diff}%
                          </text>
                        )}
                      </g>
                    );
                  }}
                />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v / 1000}k`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload;
                    return (
                      <div className="bg-white px-4 py-3 rounded-2xl shadow-lg border border-gray-100">
                        <p className="text-xs font-bold text-gray-500 mb-2 uppercase">{label}</p>
                        <p className="text-sm text-gray-600">{ano - 1}: {formatMoney(row.vendas_passado)}</p>
                        <p className="text-sm text-gray-600">{ano}: {formatMoney(row.vendas_atual)}</p>
                        <p className="text-sm font-bold mt-2" style={{ color: row.diferenca_pct > 0 ? '#059669' : '#dc2626' }}>
                          Variação: {row.diferenca_pct > 0 ? '+' : ''}{row.diferenca_pct}%
                        </p>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="vendas_passado" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="vendas_atual" stroke="#2563eb" strokeWidth={4} dot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ESTRATÉGICO - FILTRO PARA KPIs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-t pt-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Visão Estratégica</h2>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={16} className="text-blue-600" />
            <span className="text-gray-600 font-medium">
              {obterLabelPeriodo(periodoKpi, modoKpiCustomizado ? kpiDataInicio : null, modoKpiCustomizado ? kpiDataFim : null)}
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400 text-xs">
              {formatarPeriodo(periodoKpi, modoKpiCustomizado ? kpiDataInicio : null, modoKpiCustomizado ? kpiDataFim : null)}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <button
            onClick={() => setModoKpiCustomizado(!modoKpiCustomizado)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${modoKpiCustomizado
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
          >
            <Settings size={16} className="inline mr-2" />
            {modoKpiCustomizado ? 'Modo Customizado' : 'Selecionar Datas'}
          </button>

          {!modoKpiCustomizado ? (
            <div className="bg-blue-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <Filter size={20} className="ml-2" />
              <select
                value={periodoKpi}
                onChange={(e) => setPeriodoKpi(Number(e.target.value))}
                className="bg-transparent font-bold outline-none cursor-pointer p-2"
              >
                <option value={7} className="text-gray-800">7 dias</option>
                <option value={30} className="text-gray-800">30 dias</option>
                <option value={90} className="text-gray-800">90 dias</option>
                <option value={180} className="text-gray-800">6 meses</option>
                <option value={365} className="text-gray-800">1 ano</option>
              </select>
            </div>
          ) : (
            <div className="bg-blue-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={kpiDataInicio}
                  onChange={(e) => setKpiDataInicio(e.target.value)}
                  className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg"
                />
                <span className="font-bold">até</span>
                <input
                  type="date"
                  value={kpiDataFim}
                  onChange={(e) => setKpiDataFim(e.target.value)}
                  className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg"
                />
              </div>
              <button
                onClick={aplicarPeriodoKpiCustomizado}
                disabled={!kpiDataInicio || !kpiDataFim}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <KpiCard
          title="Faturamento"
          value={data ? formatMoney(data.resumo_periodo.faturamento) : '—'}
          icon={<DollarSign size={28} />}
          accent="blue"
          crescimento={data?.resumo_periodo.crescimento_faturamento}
        />
        <KpiCard
          title="Pedidos"
          value={data?.resumo_periodo.pedidos ?? '—'}
          icon={<ShoppingBag size={28} />}
          accent="emerald"
          crescimento={data?.resumo_periodo.crescimento_pedidos}
        />
        <KpiCard
          title="Ticket Médio"
          value={data ? formatMoney(data.resumo_periodo.ticket_medio) : '—'}
          icon={<TrendingUp size={28} />}
          accent="violet"
          crescimento={data?.resumo_periodo.crescimento_ticket}
        />
      </div>

      {/* ANÁLISE DE PRODUTOS - FILTRO PARA GRÁFICOS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-t pt-8 mt-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Análise de Produtos</h2>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={16} className="text-emerald-600" />
            <span className="text-gray-600 font-medium">
              {obterLabelPeriodo(periodoGraficos, modoGraficosCustomizado ? graficosDataInicio : null, modoGraficosCustomizado ? graficosDataFim : null)}
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400 text-xs">
              {formatarPeriodo(periodoGraficos, modoGraficosCustomizado ? graficosDataInicio : null, modoGraficosCustomizado ? graficosDataFim : null)}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <button
            onClick={() => setModoGraficosCustomizado(!modoGraficosCustomizado)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${modoGraficosCustomizado
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
          >
            <Settings size={16} className="inline mr-2" />
            {modoGraficosCustomizado ? 'Modo Customizado' : 'Selecionar Datas'}
          </button>

          {!modoGraficosCustomizado ? (
            <div className="bg-emerald-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <Filter size={20} className="ml-2" />
              <select
                value={periodoGraficos}
                onChange={(e) => setPeriodoGraficos(Number(e.target.value))}
                className="bg-transparent font-bold outline-none cursor-pointer p-2"
              >
                <option value={7} className="text-gray-800">7 dias</option>
                <option value={30} className="text-gray-800">30 dias</option>
                <option value={90} className="text-gray-800">90 dias</option>
                <option value={180} className="text-gray-800">6 meses</option>
                <option value={365} className="text-gray-800">1 ano</option>
              </select>
            </div>
          ) : (
            <div className="bg-emerald-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={graficosDataInicio}
                  onChange={(e) => setGraficosDataInicio(e.target.value)}
                  className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg"
                />
                <span className="font-bold">até</span>
                <input
                  type="date"
                  value={graficosDataFim}
                  onChange={(e) => setGraficosDataFim(e.target.value)}
                  className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg"
                />
              </div>
              <button
                onClick={aplicarPeriodoGraficosCustomizado}
                disabled={!graficosDataInicio || !graficosDataFim}
                className="bg-white text-emerald-600 px-4 py-2 rounded-lg font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-orange-600">
            <Award size={22} /> Top Produtos
          </h3>
          <div className="space-y-4">
            {data?.graficos?.produtos_ranking?.map((p, i) => {
              const maxQtd = Math.max(...data.graficos.produtos_ranking.map(x => x.qtd), 1);
              return (
                <div key={i} className="flex flex-col gap-1 border-b border-gray-50 pb-2 last:border-0">
                  <div className="flex justify-between items-start gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-gray-700 uppercase">{p.nome}</p>
                      <span className="text-[10px] font-bold text-gray-400 block mt-0.5">SKU: {p.codigo}</span>
                    </div>
                    <span className="text-orange-600 font-black">{p.qtd} un.</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(p.qtd / maxQtd) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-emerald-600">
            <Tag size={22} /> Ticket / Categoria
          </h3>
          <div className="w-full">
            {data && (
              <ResponsiveContainer width="100%" height={Math.max(320, data.graficos.ticket_categoria.length * 40)}>
                <BarChart data={data.graficos.ticket_categoria} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fontWeight: 'bold' }} tickFormatter={(n) => formatarNomeCategoria(n)} />
                  <Tooltip formatter={(v) => formatMoney(v)} />
                  <Bar dataKey="ticket" radius={[0, 8, 8, 0]} barSize={32}>
                    {data.graficos.ticket_categoria.map((_, i) => (
                      <Cell key={i} fill={CORES_CATEGORIA[i % CORES_CATEGORIA.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// === COMPONENTE: Dashboard Mês Atual (CORRIGIDO) ===
// === COMPONENTE: Dashboard Mês Atual (CORRIGIDO) ===
function DashboardMesAtual({ data, formatMoney, metaMensal, setMetaMensal }) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);

  if (!data) return <div className="text-center text-gray-500 py-10">Carregando dados do mês...</div>;

  const { resumo, graficos, pedidos_recentes } = data;

  // --- CÁLCULOS NO FRONTEND (CORREÇÃO) ---
  // Garantimos que os números sejam tratados como números
  const faturamentoAtual = Number(resumo.total_faturamento) || 0;
  const diasDecorridos = Number(resumo.dias_decorridos) || 1;
  const diasRestantes = Number(resumo.dias_restantes) || 0;
  const diasTotais = diasDecorridos + diasRestantes;

  // 1. Média Diária Real (Faturamento / Dias que já passaram)
  const mediaDiaCalculada = diasDecorridos > 0 ? faturamentoAtual / diasDecorridos : 0;

  // 2. Projeção (Média Diária * Dias Totais do Mês)
  const projecaoCalculada = mediaDiaCalculada * diasTotais;

  // 3. Percentual da Meta (Faturamento / Meta Definida pelo usuário)
  const percentualProgresso = metaMensal > 0 ? (faturamentoAtual / metaMensal) * 100 : 0;
  const percentualBarra = Math.min(100, percentualProgresso);

  // 4. Falta Atingir e Necessário por Dia
  const faltaAtingir = Math.max(0, metaMensal - faturamentoAtual);
  const necessarioDia = diasRestantes > 0 ? faltaAtingir / diasRestantes : 0;

  // Lógica do Drill Down (Mantida igual)
  const listaProdutosExibida = categoriaSelecionada
    ? (graficos.produtos_por_categoria?.[categoriaSelecionada] || [])
    : graficos.top_produtos;

  const tituloProdutos = categoriaSelecionada
    ? `Top em ${categoriaSelecionada}`
    : "Top 10 Produtos (Geral)";

  return (
    <>
      {/* HEADER DO MÊS */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-8 rounded-3xl shadow-lg mb-8 text-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black mb-2">Performance do Mês</h2>
            <p className="text-emerald-100 text-lg">{resumo.mes_ano}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-2xl">
            <p className="text-xs font-semibold mb-1 text-emerald-100">Meta Mensal</p>
            <div className="flex items-center gap-2">
              <span className="text-emerald-100 font-bold">R$</span>
              <input
                type="number"
                value={metaMensal}
                onChange={(e) => setMetaMensal(Number(e.target.value))}
                className="bg-transparent text-white font-black text-xl w-32 outline-none placeholder-emerald-200"
              />
            </div>
          </div>
        </div>
      </div>

      {/* PROGRESS BAR E KPIs */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-2xl font-black text-gray-900">{percentualProgresso.toFixed(1)}% da Meta</h3>
            <p className="text-gray-500 text-sm mt-1">Faltam {formatMoney(faltaAtingir)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase font-bold">Projeção</p>
            {/* AQUI USAMOS A VARIÁVEL CALCULADA */}
            <p className="text-xl font-black text-blue-600">{formatMoney(projecaoCalculada)}</p>
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className="w-full bg-gray-200 h-8 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-1000 flex items-center justify-end px-4"
            style={{ width: `${percentualBarra}%` }}
          >
            {percentualBarra > 10 && <span className="text-white font-black text-sm">{percentualProgresso.toFixed(0)}%</span>}
          </div>
        </div>

        {/* Grid de Infos Dias */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Dias Decorridos</p>
            <p className="text-2xl font-black text-gray-900">{diasDecorridos}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Dias Restantes</p>
            <p className="text-2xl font-black text-gray-900">{diasRestantes}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Média/Dia Atual</p>
            {/* USANDO VARIÁVEL CALCULADA */}
            <p className="text-2xl font-black text-emerald-600">{formatMoney(mediaDiaCalculada)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Necessário/Dia</p>
            {/* USANDO VARIÁVEL CALCULADA */}
            <p className="text-2xl font-black text-orange-600">{formatMoney(necessarioDia)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <KpiCard title="Faturamento Total" value={formatMoney(faturamentoAtual)} icon={<DollarSign size={28} />} accent="emerald" />
        <KpiCard title="Total de Pedidos" value={resumo.total_pedidos} icon={<ShoppingBag size={28} />} accent="blue" />
        <KpiCard title="Ticket Médio" value={formatMoney(resumo.ticket_medio)} icon={<TrendingUp size={28} />} accent="violet" />
      </div>

      {/* --- O RESTANTE DOS GRÁFICOS (Vendas por dia, Categorias, etc) PERMANECE IGUAL --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-emerald-600"><Calendar size={22} /> Vendas por Dia do Mês</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={graficos.vendas_por_dia} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                labelFormatter={(label) => `Dia: ${label}`}
                formatter={(value, name) => {
                  if (name === "valor") return [formatMoney(value), "Faturamento"];
                  if (name === "qtd") return [value, "Pedidos"];
                  return [value, name];
                }}
                contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ fontWeight: 'bold' }}
              />
              <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`bg-white p-6 rounded-3xl shadow-sm border border-gray-100 transition-all duration-300 ${categoriaSelecionada ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-orange-600 truncate pr-2">
              <Award size={22} />
              <span className="truncate" title={tituloProdutos}>{tituloProdutos}</span>
            </h3>
            {categoriaSelecionada && (
              <button onClick={() => setCategoriaSelecionada(null)} className="p-1 bg-gray-100 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors" title="Limpar filtro">
                <div className="text-xs font-bold px-2">Limpar</div>
              </button>
            )}
          </div>
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
            {listaProdutosExibida.length > 0 ? (
              listaProdutosExibida.map((p, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-50 pb-2 last:border-0 animate-fadeIn">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-bold text-gray-700 truncate" title={p.nome}>{p.nome}</p>
                    <p className="text-xs text-gray-400">{p.qtd} unidades</p>
                  </div>
                  <span className="text-sm font-black text-orange-600 whitespace-nowrap">{formatMoney(p.valor)}</span>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 text-sm py-4">Nenhum produto encontrado.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-blue-600"><Tag size={22} /> Vendas por Categoria</h3>
            {!categoriaSelecionada && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Clique para detalhar</span>}
          </div>
          <div className="space-y-4">
            {graficos.categorias.slice(0, 8).map((cat, i) => {
              const isSelected = categoriaSelecionada === cat.nome;
              return (
                <div key={i} className={`flex flex-col gap-2 cursor-pointer group transition-all duration-200 ${isSelected ? 'opacity-100' : categoriaSelecionada ? 'opacity-40 hover:opacity-70' : ''}`} onClick={() => setCategoriaSelecionada(isSelected ? null : cat.nome)}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={`font-bold transition-colors ${isSelected ? 'text-blue-700' : 'text-gray-700 group-hover:text-blue-600'}`}>{cat.nome}</span>
                    <div className="text-right">
                      <span className="text-blue-600 font-black">{formatMoney(cat.valor)}</span>
                      <span className="text-gray-400 text-xs ml-2">({cat.percentual.toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isSelected ? 'bg-orange-500' : 'bg-blue-500 group-hover:bg-blue-400'}`} style={{ width: `${cat.percentual}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-violet-600"><DollarSign size={22} /> Formas de Pagamento</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graficos.formas_pagamento} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 11, fontWeight: 'bold' }} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Bar dataKey="valor" fill="#7c3aed" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="font-bold text-lg mb-6 text-gray-900">Pedidos Recentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Código</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Data</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Cliente</th>
                <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Situação</th>
                <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Valor</th>
              </tr>
            </thead>
            <tbody>
              {pedidos_recentes.map((pedido, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 font-mono text-sm font-bold text-gray-700">{pedido.codigo}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{pedido.data}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 truncate max-w-xs">{pedido.cliente}</td>
                  <td className="py-3 px-4"><span className="text-xs font-bold px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">{pedido.situacao}</span></td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900">{formatMoney(pedido.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
// === COMPONENTE: KPI Card ===
function KpiCard({ title, value, icon, accent = 'blue', crescimento }) {
  const styles = {
    blue: { card: 'border-l-blue-500', icon: 'bg-blue-50 text-blue-600' },
    emerald: { card: 'border-l-emerald-500', icon: 'bg-emerald-50 text-emerald-600' },
    violet: { card: 'border-l-violet-500', icon: 'bg-violet-50 text-violet-600' },
  };
  const style = styles[accent];

  const isPositive = crescimento > 0;
  const isNegative = crescimento < 0;

  return (
    <div className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-sm border-l-4 ${style.card} flex flex-col`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-gray-900 mt-2">{value}</h3>
        </div>
        <div className={`p-4 rounded-2xl ${style.icon}`}>{icon}</div>
      </div>

      {/* Indicador de Crescimento */}
      {crescimento !== undefined && (
        <div className="flex items-center gap-2 mt-2">
          {isPositive && (
            <>
              <div className="bg-emerald-100 p-1.5 rounded-lg">
                <ArrowUp size={16} className="text-emerald-600" />
              </div>
              <span className="text-sm font-bold text-emerald-600">
                +{Math.abs(crescimento)}%
              </span>
            </>
          )}
          {isNegative && (
            <>
              <div className="bg-red-100 p-1.5 rounded-lg">
                <ArrowDown size={16} className="text-red-600" />
              </div>
              <span className="text-sm font-bold text-red-600">
                {crescimento}%
              </span>
            </>
          )}
          {!isPositive && !isNegative && (
            <span className="text-sm font-bold text-gray-400">
              0%
            </span>
          )}
          <span className="text-xs text-gray-400 ml-1">vs período anterior</span>
        </div>
      )}
    </div>
  );
}

export default App;