import { useEffect, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, LabelList } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, RefreshCw, Filter, Award, Tag, Calendar, Loader2, ArrowUp, ArrowDown, CalendarDays, Settings, Lock, User, LogOut, MapPin, Shirt } from 'lucide-react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { Users, Map as MapIcon, RefreshCcw, Download } from "lucide-react";

// URL oficial do GeoJSON do Brasil
const geoUrl = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

// Coordenadas aproximadas do centro de cada Estado para colocar as bolhas
const COORDENADAS_ESTADOS = {
  AC: [-70.5, -9.0], AL: [-36.6, -9.5], AP: [-52.0, 1.4], AM: [-64.6, -4.3],
  BA: [-41.7, -12.9], CE: [-39.3, -5.0], DF: [-47.8, -15.7], ES: [-40.3, -19.1],
  GO: [-49.2, -15.8], MA: [-45.2, -4.9], MT: [-56.0, -12.6], MS: [-54.6, -20.3],
  MG: [-44.2, -18.5], PA: [-52.9, -3.2], PB: [-36.1, -7.1], PR: [-51.6, -24.5],
  PE: [-37.9, -8.3], PI: [-42.7, -7.7], RJ: [-43.1, -22.9], RN: [-36.6, -5.7],
  RS: [-53.2, -29.7], RO: [-62.9, -10.8], RR: [-61.3, 2.7], SC: [-50.2, -27.2],
  SP: [-48.0, -22.5], SE: [-37.3, -10.5], TO: [-48.3, -10.1]
};

function App() {
  const [dataDemografia, setDataDemografia] = useState(null);
  const [percentualDemografia, setPercentualDemografia] = useState(25);
  const [progressoData, setProgressoData] = useState(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [data, setData] = useState(null);
  const [dataMesAtual, setDataMesAtual] = useState(null);
  const [dataCarrinhos, setDataCarrinhos] = useState(null);
  const [loading, setLoading] = useState(true);

  const [ano, setAno] = useState(2026);
  const [periodoKpi, setPeriodoKpi] = useState(30);
  const [periodoGraficos, setPeriodoGraficos] = useState(30);
  const [abaAtiva, setAbaAtiva] = useState('analitico');

  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  const [metasMensais, setMetasMensais] = useState({
    "1-2026": 50000,
    "2-2026": 60000,
    "3-2026": 70000
  });

  const metaMensalAtiva = metasMensais[`${mesSelecionado}-${anoSelecionado}`] || 60000;

  const handleAtualizarMeta = (novoValor) => {
    setMetasMensais(prev => ({
      ...prev,
      [`${mesSelecionado}-${anoSelecionado}`]: novoValor
    }));
  };

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
    setLoading(true);

    try {
      const BASE_API = "https://api-viadoterno.onrender.com";
      //const BASE_API = "http://localhost:8000";

      if (abaAtiva === 'analitico') {
        let url = `${BASE_API}/api/dashboard/resumo?ano=${ano}&dias_kpi=${periodoKpi}&dias_graficos=${periodoGraficos}`;
        if (modoKpiCustomizado && kpiDataInicio && kpiDataFim) url += `&kpi_inicio=${kpiDataInicio}&kpi_fim=${kpiDataFim}`;
        if (modoGraficosCustomizado && graficosDataInicio && graficosDataFim) url += `&graficos_inicio=${graficosDataInicio}&graficos_fim=${graficosDataFim}`;
        
        const res = await axios.get(url);
        setData(res.data);
        setLoading(false);
      }
      else if (abaAtiva === 'mes-atual') {
        const res = await axios.get(`${BASE_API}/api/dashboard/mes-atual?meta_mensal=${metaMensalAtiva}&mes=${mesSelecionado}&ano=${anoSelecionado}`);
        setDataMesAtual(res.data);
        setLoading(false);
      }
      else if (abaAtiva === 'carrinhos') {
        const res = await axios.get(`${BASE_API}/api/dashboard/carrinhos-abandonados?dias=7`);
        setDataCarrinhos(res.data);
        setLoading(false);
      }
      else if (abaAtiva === 'demografia') {
        setProgressoData({ mensagem: "Conectando ao servidor...", atual: 0, total: 0 });
        const interval = setInterval(async () => {
          try {
            const pRes = await axios.get(`${BASE_API}/api/dashboard/progresso-demografia`);
            setProgressoData(pRes.data);
          } catch (e) { }
        }, 1000);

        try {
          const res = await axios.get(`${BASE_API}/api/dashboard/clientes-demografia?percentual=${percentualDemografia}`);
          setDataDemografia(res.data);
        } finally {
          clearInterval(interval);
          setProgressoData(null);
          setLoading(false);
        }
      }
    } catch (err) {
      console.error("Erro geral:", err);
      setLoading(false);
      if (err.response && err.response.status === 401) handleLogout();
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [ano, periodoKpi, periodoGraficos, abaAtiva, metaMensalAtiva, isAuthenticated, mesSelecionado, anoSelecionado, percentualDemografia]);

  const handleLogout = () => {
    localStorage.removeItem('via_token');
    setIsAuthenticated(false);
    setData(null);
    setDataMesAtual(null);
    setDataCarrinhos(null);
    setDataDemografia(null);
  };

  if (authLoading) return null;
  if (!isAuthenticated) return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;

  const formatMoney = (val) => {
    if (typeof val === 'string') return val;
    return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatarPeriodo = (dias, dataInicio) => { if (!dataInicio) return `${dias} dias`; return "Período"; };
  const obterLabelPeriodo = (dias, dataInicio) => { if (dataInicio) return "Customizado"; return `${dias} dias`; };
  const aplicarPeriodoKpiCustomizado = () => fetchData();
  const aplicarPeriodoGraficosCustomizado = () => fetchData();
  const CORES_CATEGORIA = ['#059669', '#2563eb', '#7c3aed', '#c2410c', '#be123c', '#0d9488', '#4f46e5', '#ea580c', '#0891b2', '#65a30d'];
  const formatarNomeCategoria = (nome) => nome;

  return (
    <div className="relative min-h-screen bg-gray-50 text-gray-800 p-4 md:p-8">
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm transition-all">
          <img src="https://viadoterno.cdn.magazord.com.br/img/2026/02/logo/3331/logo-via-do-terno.png?_gl=1*2r1ugl*_ga*MTA1MzYyMDcwOC4xNzYwNzA5OTQ0*_ga_4JXK3QVJ6X*czE3NzAyMDQ3NTckbzI5NiRnMSR0MTc3MDIxMDQzMyRqMjYkbDAkaDA." alt="Carregando..." className="h-24 md:h-32 object-contain animate-logo-breathe mb-6" />
          {abaAtiva === 'demografia' && progressoData ? (
            <div className="w-72 flex flex-col items-center">
              <p className="text-gray-600 font-bold text-sm mb-3 uppercase tracking-wider">{progressoData.mensagem}</p>
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2 shadow-inner">
                <div className="h-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: progressoData.total > 0 ? `${(progressoData.atual / progressoData.total) * 100}%` : '0%' }}></div>
              </div>
              {progressoData.total > 0 && <p className="text-xs text-blue-600 font-black">{progressoData.atual} de {progressoData.total} Registos</p>}
            </div>
          ) : (
            <div className="w-64 flex flex-col items-center">
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-slate-800 animate-[pulse_1.5s_ease-in-out_infinite] w-2/3 rounded-full"></div>
              </div>
              <p className="text-gray-500 font-light tracking-[0.2em] uppercase text-xs animate-pulse whitespace-nowrap">Sincronizando dados...</p>
            </div>
          )}
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
            <button onClick={handleLogout} className="p-3 bg-red-50 rounded-full text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors" title="Sair"><LogOut size={20} /></button>
          </div>
        </header>

        <div className="mb-8 flex gap-4 border-b border-gray-200 overflow-x-auto">
          <button onClick={() => setAbaAtiva('analitico')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'analitico' ? 'text-blue-600' : 'text-gray-400'}`}>
            Análise por Período
            {abaAtiva === 'analitico' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
          <button onClick={() => setAbaAtiva('mes-atual')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'mes-atual' ? 'text-emerald-600' : 'text-gray-400'}`}>
            Vendas Por mês
            {abaAtiva === 'mes-atual' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></div>}
          </button>
          <button onClick={() => setAbaAtiva('carrinhos')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'carrinhos' ? 'text-orange-600' : 'text-gray-400'}`}>
            Recuperação de Carrinho
            {abaAtiva === 'carrinhos' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600"></div>}
          </button>
          <button onClick={() => setAbaAtiva('demografia')} className={`pb-4 px-6 font-bold text-sm transition-all whitespace-nowrap relative ${abaAtiva === 'demografia' ? 'text-blue-600' : 'text-gray-400'}`}>
            Público & Demografia
            {abaAtiva === 'demografia' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>}
          </button>
        </div>

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
            data={dataMesAtual}
            formatMoney={formatMoney}
            metaMensal={metaMensalAtiva}
            setMetaMensal={handleAtualizarMeta}
            mesSelecionado={mesSelecionado}
            setMesSelecionado={setMesSelecionado}
            anoSelecionado={anoSelecionado}
            setAnoSelecionado={setAnoSelecionado}
          />
        )}

        {abaAtiva === 'carrinhos' && <DashboardCarrinhos data={dataCarrinhos} formatMoney={formatMoney} />}
        {abaAtiva === 'demografia' && <DashboardDemografia data={dataDemografia} percentual={percentualDemografia} setPercentual={setPercentualDemografia} />}
      </div>
    </div>
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
      await axios.post('https://api-viadoterno.onrender.com/api/login', { username, password });
      //await axios.post('http://localhost:8000/api/login', { username, password });
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
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold py-3 pl-12 pr-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" placeholder="Ex: admin" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-50 border border-gray-200 text-gray-800 font-bold py-3 pl-12 pr-4 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all" placeholder="••••••" />
            </div>
          </div>
          {error && (
            <div className="bg-red-50 text-red-500 text-sm font-bold px-4 py-3 rounded-xl flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>{error}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-slate-800 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center">
            {loading ? <Loader2 className="animate-spin" /> : 'ACESSAR DASHBOARD'}
          </button>
        </form>
      </div>
      <p className="text-gray-400 text-xs mt-8">Via do Terno Analytics &copy; 2026</p>
    </div>
  );
}

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
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="text-blue-600" /> Comparativo de Vendas Mensais
          </h2>
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="bg-gray-100 px-4 py-2 rounded-xl font-bold text-blue-600 outline-none">
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
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={({ x, y, payload }) => {
                  const row = linhaTempoComDiff.find((d) => d.name === payload.value);
                  const diff = row?.diferenca_pct;
                  const cor = diff > 0 ? '#059669' : diff < 0 ? '#dc2626' : '#94a3b8';
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <text x={0} y={0} dy={14} textAnchor="middle" fill="#94a3b8" fontSize={12}>{payload.value}</text>
                      {diff !== undefined && <text x={0} y={0} dy={28} textAnchor="middle" fill={cor} fontSize={11} fontWeight={700}>{diff > 0 ? '+' : ''}{diff}%</text>}
                    </g>
                  );
                }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v / 1000}k`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload;
                  return (
                    <div className="bg-white px-4 py-3 rounded-2xl shadow-lg border border-gray-100">
                      <p className="text-xs font-bold text-gray-500 mb-2 uppercase">{label}</p>
                      <p className="text-sm text-gray-600">{ano - 1}: {formatMoney(row.vendas_passado)}</p>
                      <p className="text-sm text-gray-600">{ano}: {formatMoney(row.vendas_atual)}</p>
                      <p className="text-sm font-bold mt-2" style={{ color: row.diferenca_pct > 0 ? '#059669' : '#dc2626' }}>Variação: {row.diferenca_pct > 0 ? '+' : ''}{row.diferenca_pct}%</p>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="vendas_passado" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                <Line type="monotone" dataKey="vendas_atual" stroke="#2563eb" strokeWidth={4} dot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-t pt-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Visão Estratégica</h2>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={16} className="text-blue-600" />
            <span className="text-gray-600 font-medium">{obterLabelPeriodo(periodoKpi, modoKpiCustomizado ? kpiDataInicio : null, modoKpiCustomizado ? kpiDataFim : null)}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400 text-xs">{formatarPeriodo(periodoKpi, modoKpiCustomizado ? kpiDataInicio : null, modoKpiCustomizado ? kpiDataFim : null)}</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <button onClick={() => setModoKpiCustomizado(!modoKpiCustomizado)} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${modoKpiCustomizado ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            <Settings size={16} className="inline mr-2" />{modoKpiCustomizado ? 'Modo Customizado' : 'Selecionar Datas'}
          </button>

          {!modoKpiCustomizado ? (
            <div className="bg-blue-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <Filter size={20} className="ml-2" />
              <select value={periodoKpi} onChange={(e) => setPeriodoKpi(Number(e.target.value))} className="bg-transparent font-bold outline-none cursor-pointer p-2">
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
                <input type="date" value={kpiDataInicio} onChange={(e) => setKpiDataInicio(e.target.value)} className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg" />
                <span className="font-bold">até</span>
                <input type="date" value={kpiDataFim} onChange={(e) => setKpiDataFim(e.target.value)} className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg" />
              </div>
              <button onClick={aplicarPeriodoKpiCustomizado} disabled={!kpiDataInicio || !kpiDataFim} className="bg-white text-blue-600 px-4 py-2 rounded-lg font-bold hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <KpiCard title="Faturamento" value={data ? formatMoney(data.resumo_periodo.faturamento) : '—'} icon={<DollarSign size={28} />} accent="blue" crescimento={data?.resumo_periodo.crescimento_faturamento} />
        <KpiCard title="Pedidos" value={data?.resumo_periodo.pedidos ?? '—'} icon={<ShoppingBag size={28} />} accent="emerald" crescimento={data?.resumo_periodo.crescimento_pedidos} />
        <KpiCard title="Ticket Médio" value={data ? formatMoney(data.resumo_periodo.ticket_medio) : '—'} icon={<TrendingUp size={28} />} accent="violet" crescimento={data?.resumo_periodo.crescimento_ticket} />
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4 border-t pt-8 mt-8">
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Análise de Produtos</h2>
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays size={16} className="text-emerald-600" />
            <span className="text-gray-600 font-medium">{obterLabelPeriodo(periodoGraficos, modoGraficosCustomizado ? graficosDataInicio : null, modoGraficosCustomizado ? graficosDataFim : null)}</span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-400 text-xs">{formatarPeriodo(periodoGraficos, modoGraficosCustomizado ? graficosDataInicio : null, modoGraficosCustomizado ? graficosDataFim : null)}</span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <button onClick={() => setModoGraficosCustomizado(!modoGraficosCustomizado)} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${modoGraficosCustomizado ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            <Settings size={16} className="inline mr-2" />{modoGraficosCustomizado ? 'Modo Customizado' : 'Selecionar Datas'}
          </button>

          {!modoGraficosCustomizado ? (
            <div className="bg-emerald-600 text-white p-2 rounded-2xl flex items-center gap-2 shadow-lg">
              <Filter size={20} className="ml-2" />
              <select value={periodoGraficos} onChange={(e) => setPeriodoGraficos(Number(e.target.value))} className="bg-transparent font-bold outline-none cursor-pointer p-2">
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
                <input type="date" value={graficosDataInicio} onChange={(e) => setGraficosDataInicio(e.target.value)} className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg" />
                <span className="font-bold">até</span>
                <input type="date" value={graficosDataFim} onChange={(e) => setGraficosDataFim(e.target.value)} className="bg-white text-gray-800 font-medium outline-none px-3 py-2 rounded-lg" />
              </div>
              <button onClick={aplicarPeriodoGraficosCustomizado} disabled={!graficosDataInicio || !graficosDataFim} className="bg-white text-emerald-600 px-4 py-2 rounded-lg font-bold hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-orange-600"><Award size={22} /> Top Produtos</h3>
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
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-emerald-600"><Tag size={22} /> Ticket / Categoria</h3>
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

// === COMPONENTE: Dashboard Mês Atual ===
function DashboardMesAtual({
  data, formatMoney, metaMensal, setMetaMensal, mesSelecionado, setMesSelecionado, anoSelecionado, setAnoSelecionado
}) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(null);

  if (!data) return <div className="text-center text-gray-500 py-10">Carregando dados do mês...</div>;

  const { resumo, graficos, pedidos_recentes } = data;

  const faturamentoAtual = Number(resumo?.total_faturamento) || 0;
  const faturamentoAnterior = Number(resumo?.faturamento_anterior) || 0;
  const crescFaturamento = Number(resumo?.cresc_faturamento) || 0;
  const estornoAtual = Number(resumo?.total_estorno) || 0;
  const pedidosAtual = Number(resumo?.total_pedidos) || 0;
  const pedidosAnterior = Number(resumo?.pedidos_anterior) || 0;
  const crescPedidos = Number(resumo?.cresc_pedidos) || 0;
  const ticketAtual = Number(resumo?.ticket_medio) || 0;
  const ticketAnterior = Number(resumo?.ticket_medio_anterior) || 0;
  const crescTicket = Number(resumo?.cresc_ticket) || 0;
  const diasDecorridos = Number(resumo?.dias_decorridos) || 1;
  const diasRestantes = Number(resumo?.dias_restantes) || 0;

  const diasTotais = diasDecorridos + diasRestantes;
  const mediaDiaCalculada = diasDecorridos > 0 ? faturamentoAtual / diasDecorridos : 0;
  const projecaoCalculada = mediaDiaCalculada * diasTotais;
  const percentualProgresso = metaMensal > 0 ? (faturamentoAtual / metaMensal) * 100 : 0;
  const percentualBarra = Math.min(100, percentualProgresso);
  const faltaAtingir = Math.max(0, metaMensal - faturamentoAtual);
  const necessarioDia = diasRestantes > 0 ? faltaAtingir / diasRestantes : 0;

  const listaProdutosExibida = categoriaSelecionada ? (graficos?.produtos_por_categoria?.[categoriaSelecionada] || []) : (graficos?.top_produtos || []);
  const tituloProdutos = categoriaSelecionada ? `Top em ${categoriaSelecionada}` : "Top 10 Produtos (Geral)";

  return (
    <>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-8 rounded-3xl shadow-lg mb-8 text-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black mb-3">Performance Mensal</h2>
            <div className="flex items-center gap-3">
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))} className="bg-white/20 text-white border border-emerald-400/50 rounded-xl px-4 py-2 outline-none font-bold focus:bg-emerald-700 transition-colors cursor-pointer appearance-none">
                <option value={1} className="text-gray-800">Janeiro</option>
                <option value={2} className="text-gray-800">Fevereiro</option>
                <option value={3} className="text-gray-800">Março</option>
                <option value={4} className="text-gray-800">Abril</option>
                <option value={5} className="text-gray-800">Maio</option>
                <option value={6} className="text-gray-800">Junho</option>
                <option value={7} className="text-gray-800">Julho</option>
                <option value={8} className="text-gray-800">Agosto</option>
                <option value={9} className="text-gray-800">Setembro</option>
                <option value={10} className="text-gray-800">Outubro</option>
                <option value={11} className="text-gray-800">Novembro</option>
                <option value={12} className="text-gray-800">Dezembro</option>
              </select>
              <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(Number(e.target.value))} className="bg-white/20 text-white border border-emerald-400/50 rounded-xl px-4 py-2 outline-none font-bold focus:bg-emerald-700 transition-colors cursor-pointer appearance-none">
                <option value={2024} className="text-gray-800">2024</option>
                <option value={2025} className="text-gray-800">2025</option>
                <option value={2026} className="text-gray-800">2026</option>
                <option value={2027} className="text-gray-800">2027</option>
              </select>
            </div>
          </div>
          <div className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-2xl">
            <p className="text-xs font-semibold mb-1 text-emerald-100">Meta Mensal</p>
            <div className="flex items-center gap-2">
              <span className="text-emerald-100 font-bold">R$</span>
              <input type="number" value={metaMensal} onChange={(e) => setMetaMensal(Number(e.target.value))} className="bg-transparent text-white font-black text-xl w-32 outline-none placeholder-emerald-200" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 mb-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-2xl font-black text-gray-900">{percentualProgresso.toFixed(1)}% da Meta</h3>
            <p className="text-gray-500 text-sm mt-1">Faltam {formatMoney(faltaAtingir)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase font-bold">Projeção do Mês</p>
            <p className="text-xl font-black text-blue-600">{formatMoney(projecaoCalculada)}</p>
          </div>
        </div>
        <div className="w-full bg-gray-200 h-8 rounded-full overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-1000 flex items-center justify-end px-4" style={{ width: `${percentualBarra}%` }}>
            {percentualBarra > 10 && <span className="text-white font-black text-sm">{percentualProgresso.toFixed(0)}%</span>}
          </div>
        </div>
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
            <p className="text-2xl font-black text-emerald-600">{formatMoney(mediaDiaCalculada)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase font-bold">Necessário/Dia</p>
            <p className="text-2xl font-black text-orange-600">{formatMoney(necessarioDia)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-gray-500 font-bold text-sm uppercase">Faturamento (Líquido)</p>
              <h3 className="text-2xl lg:text-3xl font-black text-gray-900 mt-1">{formatMoney(faturamentoAtual)}</h3>
            </div>
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl"><DollarSign size={24} /></div>
          </div>
          <div className="flex items-center gap-2 text-sm mt-auto pt-4 border-t border-gray-50">
            <span className={`font-bold flex items-center gap-1 ${crescFaturamento >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{crescFaturamento >= 0 ? '↑' : '↓'} {Math.abs(crescFaturamento).toFixed(1)}%</span>
            <span className="text-gray-400 font-medium truncate">vs {formatMoney(faturamentoAnterior)}</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-gray-500 font-bold text-sm uppercase">Total Devolvido</p>
              <h3 className="text-2xl lg:text-3xl font-black text-red-600 mt-1">{formatMoney(estornoAtual)}</h3>
            </div>
            <div className="p-3 bg-red-100 text-red-600 rounded-2xl"><RefreshCw size={24} /></div>
          </div>
          <div className="flex items-center gap-2 text-sm mt-auto pt-4 border-t border-gray-50">
             <span className="text-gray-400 font-medium truncate">Dinheiro devolvido a clientes</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-gray-500 font-bold text-sm uppercase">Total de Pedidos</p>
              <h3 className="text-2xl lg:text-3xl font-black text-gray-900 mt-1">{pedidosAtual}</h3>
            </div>
            <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><ShoppingBag size={24} /></div>
          </div>
          <div className="flex items-center gap-2 text-sm mt-auto pt-4 border-t border-gray-50">
            <span className={`font-bold flex items-center gap-1 ${crescPedidos >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{crescPedidos >= 0 ? '↑' : '↓'} {Math.abs(crescPedidos).toFixed(1)}%</span>
            <span className="text-gray-400 font-medium">vs {pedidosAnterior} ant.</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-gray-500 font-bold text-sm uppercase">Ticket Médio</p>
              <h3 className="text-2xl lg:text-3xl font-black text-gray-900 mt-1">{formatMoney(ticketAtual)}</h3>
            </div>
            <div className="p-3 bg-violet-100 text-violet-600 rounded-2xl"><TrendingUp size={24} /></div>
          </div>
          <div className="flex items-center gap-2 text-sm mt-auto pt-4 border-t border-gray-50">
            <span className={`font-bold flex items-center gap-1 ${crescTicket >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{crescTicket >= 0 ? '↑' : '↓'} {Math.abs(crescTicket).toFixed(1)}%</span>
            <span className="text-gray-400 font-medium truncate">vs {formatMoney(ticketAnterior)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 lg:col-span-2">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-emerald-600">Vendas por Dia do Mês</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={graficos?.vendas_por_dia || []} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="dia" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip labelFormatter={(label) => `Dia: ${label}`} formatter={(value, name) => { if (name === "valor") return [formatMoney(value), "Faturamento"]; if (name === "qtd") return [value, "Pedidos"]; return [value, name]; }} contentStyle={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} itemStyle={{ fontWeight: 'bold' }} />
              <Bar dataKey="valor" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={`bg-white p-6 rounded-3xl shadow-sm border border-gray-100 transition-all duration-300 ${categoriaSelecionada ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-orange-600 truncate pr-2">
              <span className="truncate" title={tituloProdutos}>{tituloProdutos}</span>
            </h3>
            {categoriaSelecionada && (
              <button onClick={() => setCategoriaSelecionada(null)} className="p-1 bg-gray-100 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors" title="Limpar filtro"><div className="text-xs font-bold px-2">Limpar</div></button>
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
            ) : (<p className="text-center text-gray-400 text-sm py-4">Nenhum produto encontrado.</p>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-blue-600">Vendas por Categoria</h3>
            {!categoriaSelecionada && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Clique para detalhar</span>}
          </div>
          <div className="space-y-4">
            {(graficos?.categorias || []).slice(0, 8).map((cat, i) => {
              const isSelected = categoriaSelecionada === cat.nome;
              return (
                <div key={i} className={`flex flex-col gap-2 cursor-pointer group transition-all duration-200 ${isSelected ? 'opacity-100' : categoriaSelecionada ? 'opacity-40 hover:opacity-70' : ''}`} onClick={() => setCategoriaSelecionada(isSelected ? null : cat.nome)}>
                  <div className="flex justify-between items-center text-sm">
                    <span className={`font-bold transition-colors ${isSelected ? 'text-blue-700' : 'text-gray-700 group-hover:text-blue-600'}`}>{cat.nome}</span>
                    <div className="text-right">
                      <span className="text-blue-600 font-black">{formatMoney(cat.valor)}</span>
                      <span className="text-gray-400 text-xs ml-2">({Number(cat.percentual || 0).toFixed(1)}%)</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isSelected ? 'bg-orange-500' : 'bg-blue-500 group-hover:bg-blue-400'}`} style={{ width: `${cat.percentual || 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-violet-600">Formas de Pagamento</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graficos?.formas_pagamento || []} layout="vertical">
              <XAxis type="number" hide />
              <YAxis dataKey="nome" type="category" width={120} tick={{ fontSize: 11, fontWeight: 'bold' }} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Bar dataKey="valor" fill="#7c3aed" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="font-bold text-lg mb-6 text-gray-900">Pedidos Recentes / Estornos</h3>
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
              {(pedidos_recentes || []).map((pedido, i) => {
                const situacaoSegura = String(pedido.situacao || "").toUpperCase();
                const isEstorno = situacaoSegura.includes('DEVOLVIDO') || situacaoSegura.includes('ESTORNO');
                
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-sm font-bold text-gray-700">{pedido.codigo || 'N/A'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{pedido.data || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-600 truncate max-w-xs">{pedido.cliente || 'Cliente não identificado'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${isEstorno ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-100 text-emerald-700'}`}>
                        {pedido.situacao || 'Desconhecido'}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${isEstorno ? 'text-red-600' : 'text-gray-900'}`}>
                      {isEstorno ? '-' : ''}{formatMoney(Number(pedido.valor) || 0)}
                    </td>
                  </tr>
                );
              })}
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
      {crescimento !== undefined && (
        <div className="flex items-center gap-2 mt-2">
          {isPositive && <><div className="bg-emerald-100 p-1.5 rounded-lg"><ArrowUp size={16} className="text-emerald-600" /></div><span className="text-sm font-bold text-emerald-600">+{Math.abs(crescimento)}%</span></>}
          {isNegative && <><div className="bg-red-100 p-1.5 rounded-lg"><ArrowDown size={16} className="text-red-600" /></div><span className="text-sm font-bold text-red-600">{crescimento}%</span></>}
          {!isPositive && !isNegative && <span className="text-sm font-bold text-gray-400">0%</span>}
          <span className="text-xs text-gray-400 ml-1">vs período anterior</span>
        </div>
      )}
    </div>
  );
}

// === COMPONENTE: Carrinhos ===
function DashboardCarrinhos({ data, formatMoney }) {
  if (!data || !data.carrinhos) return <div className="text-center py-20 text-gray-400">Buscando leads em carrinhos abandonados...</div>;
  const getWaLink = (tel, nome) => {
    const limpo = String(tel || "").replace(/\D/g, "");
    const primeiroNome = (nome || "Cliente").split(" ")[0];
    const msg = `Olá ${primeiroNome}, tudo bem? Vimos que você deixou alguns itens no carrinho da Via do Terno e preparamos uma condição especial para você finalizar sua compra!\n\nUse o cupom *FRETEGRATIS* para conseguir 15% OFF e frete grátis!`
    return `https://wa.me/55${limpo}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-2xl mb-8">
        <div className="flex items-center gap-3">
          <Award className="text-orange-600" />
          <div><h3 className="font-bold text-orange-800">Recuperação Ativa</h3><p className="text-orange-700 text-sm">Estes clientes chegaram até o checkout mas não finalizaram. Entre em contato para fechar a venda!</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data.carrinhos.map((c, i) => (
          <div key={i} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4"><span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full font-bold uppercase">{c.data}</span><span className="bg-orange-100 text-orange-600 px-2 py-1 rounded-lg text-xs font-black">{c.total_itens} item(ns)</span></div>
              <h3 className="font-black text-gray-800 text-lg mb-1 uppercase truncate">{c.nome || "Lead sem nome"}</h3>
              <p className="text-gray-400 text-sm mb-4 truncate">{c.email || "Sem e-mail cadastrado"}</p>
              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {(c.produtos || []).map((p, idx) => (<img key={idx} src={p.img} alt={p.nome} className="h-12 w-12 rounded-lg object-cover border border-gray-50" title={p.nome} />))}
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex gap-2">
              {c.telefone ? (
                <a href={getWaLink(c.telefone, c.nome)} target="_blank" rel="noreferrer" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-center py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors"><RefreshCw size={16} /> WhatsApp</a>
              ) : (
                <button disabled title="O cliente não informou o telefone no carrinho" className="flex-1 bg-gray-200 text-gray-400 text-center py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-not-allowed"><RefreshCw size={16} /> Sem Número</button>
              )}
              <a href={c.url_checkout} target="_blank" rel="noreferrer" className="flex-1 bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 text-center py-3 rounded-xl text-sm font-bold transition-colors">Checkout</a>
            </div>
          </div>
        ))}
      </div>
      {data.carrinhos.length === 0 && <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200"><p className="text-gray-400">Nenhum lead encontrado nos carrinhos dos últimos dias.</p></div>}
    </div>
  );
}

// === COMPONENTE: Demografia ===
function DashboardDemografia({ data, percentual, setPercentual }) {
  const [estadoSelecionado, setEstadoSelecionado] = useState(null);
  const [faixaSelecionada, setFaixaSelecionada] = useState(null);

  const handleMudarPercentual = (e) => {
    const val = Number(e.target.value);
    if (val === 100) {
      const confirma = window.confirm("Atenção! Analisar 100% da base pode demorar alguns minutos da primeira vez. Deseja prosseguir?");
      if (!confirma) return;
    }
    setPercentual(val);
  };

  if (!data || !data.clientes) return <div className="text-center py-20 text-gray-500">A carregar mapa...</div>;
  const clientes = data.clientes;
  const clientesFiltrados = clientes.filter(c => (estadoSelecionado ? c.estado === estadoSelecionado : true) && (faixaSelecionada ? c.faixa === faixaSelecionada : true));
  const clientesParaBarras = clientes.filter(c => estadoSelecionado ? c.estado === estadoSelecionado : true);
  const contagemFaixas = clientesParaBarras.reduce((acc, c) => { acc[c.faixa] = (acc[c.faixa] || 0) + 1; return acc; }, {});
  const dataBarras = Object.keys(contagemFaixas).map(faixa => ({ faixa, quantidade: contagemFaixas[faixa] })).sort((a, b) => a.faixa.localeCompare(b.faixa));
  const clientesParaMapa = clientes.filter(c => faixaSelecionada ? c.faixa === faixaSelecionada : true);
  const contagemEstados = clientesParaMapa.reduce((acc, c) => { if (c.estado !== "Desconhecido") { acc[c.estado] = (acc[c.estado] || 0) + 1; } return acc; }, {});
  const totalComEstado = Object.values(contagemEstados).reduce((a, b) => a + b, 0);
  const maxQtd = Math.max(...Object.values(contagemEstados), 1);
  const limparFiltros = () => { setEstadoSelecionado(null); setFaixaSelecionada(null); };
  const getBubbleColor = (ratio) => { if (ratio >= 0.8) return "#1e40af"; if (ratio >= 0.5) return "#3b82f6"; if (ratio >= 0.3) return "#60a5fa"; if (ratio >= 0.1) return "#f87171"; return "#b91c1c"; };

  const exportarCSV = () => {
    if (clientesFiltrados.length === 0) return alert("Não há clientes para exportar com estes filtros.");
    const headers = ["Nome", "Email", "Telefone", "Cidade", "Estado", "Faixa Etária"];
    const linhas = clientesFiltrados.map(c => `"${c.nome || ''}","${c.email || ''}","${c.telefone || ''}","${c.cidade || ''}","${c.estado || ''}","${c.faixa || ''}"`);
    const csvContent = [headers.join(","), ...linhas].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Leads_${estadoSelecionado || 'Geral'}_${faixaSelecionada || 'TodasIdades'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 p-6 rounded-3xl shadow-lg text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-3"><Users size={28} /> Demografia de Clientes</h2>
          <p className="text-blue-100 text-sm mt-1">Clique num Estado ou numa Faixa Etária para cruzar os dados.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white/20 p-1.5 rounded-xl">
            <span className="text-xs font-bold text-blue-100 pl-2 uppercase tracking-wider">Amostragem:</span>
            <select value={percentual} onChange={handleMudarPercentual} className="bg-blue-800 text-white border-none rounded-lg px-3 py-1.5 outline-none font-bold focus:ring-2 focus:ring-blue-400 transition-colors cursor-pointer appearance-none text-sm">
               <option value={25}>25% da Base</option>
               <option value={50}>50% da Base</option>
               <option value={75}>75% da Base</option>
               <option value={100}>100% da Base</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportarCSV} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl transition-colors font-bold text-sm shadow-sm"><Download size={16} /> Exportar ({clientesFiltrados.length})</button>
            {(estadoSelecionado || faixaSelecionada) && <button onClick={limparFiltros} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl transition-colors font-bold text-sm"><RefreshCcw size={16} /> Limpar</button>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col relative">
          <h3 className="font-bold text-lg mb-4 text-gray-800 flex items-center gap-2"><MapIcon className="text-orange-500" /> Concentração de Público {faixaSelecionada && <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-lg ml-2 font-bold">Filtrado: {faixaSelecionada}</span>}</h3>
          <div className="flex-1 bg-blue-50/30 rounded-2xl relative overflow-hidden group cursor-grab active:cursor-grabbing pb-12" style={{ minHeight: '550px' }}>
            <div className="absolute top-4 left-4 z-10 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <p className="text-[10px] font-bold text-gray-500 uppercase">Use a roda do rato para Zoom</p>
            </div>
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 650, center: [-54, -15] }} style={{ width: "100%", height: "100%" }}>
              <ZoomableGroup zoom={1} minZoom={1} maxZoom={6} center={[-54, -15]}>
                <Geographies geography={geoUrl}>{({ geographies }) => geographies.map((geo) => <Geography key={geo.rsmKey} geography={geo} fill="#f1f5f9" stroke="#cbd5e1" style={{ default: { outline: 'none' }, hover: { fill: '#e2e8f0', outline: 'none' }, pressed: { outline: 'none' } }} />)}</Geographies>
                {Object.entries(COORDENADAS_ESTADOS).map(([uf, coords]) => {
                  const qtd = contagemEstados[uf] || 0;
                  if (qtd === 0) return null;
                  const ratio = qtd / maxQtd;
                  const pct = (qtd / totalComEstado) * 100;
                  const size = 16 + (ratio * 29);
                  const isSelected = uf === estadoSelecionado;
                  const isFaded = estadoSelecionado && !isSelected;
                  return (
                    <Marker key={uf} coordinates={coords} onClick={() => setEstadoSelecionado(isSelected ? null : uf)} style={{ cursor: "pointer" }}>
                      <circle r={size} fill={getBubbleColor(ratio)} fillOpacity={isFaded ? 0.2 : 0.9} stroke={isSelected ? "#fff" : "rgba(255,255,255,0.4)"} strokeWidth={isSelected ? 3 : 1} className="transition-all duration-300" />
                      <text textAnchor="middle" y={size > 22 ? -2 : 3} style={{ fontSize: size > 22 ? "12px" : "9px", fill: "#fff", fontWeight: "900", pointerEvents: "none", textShadow: "0px 1px 3px rgba(0,0,0,0.8)" }} className="transition-all duration-300">{uf}</text>
                      {size > 22 && <text textAnchor="middle" y={9} style={{ fontSize: "9px", fill: "#fff", fontWeight: "bold", pointerEvents: "none", textShadow: "0px 1px 2px rgba(0,0,0,0.8)" }} className="transition-all duration-300">{pct.toFixed(1)}%</text>}
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>
            <div className="absolute bottom-4 left-0 right-0 mx-auto w-max bg-white/90 backdrop-blur-sm px-6 py-3 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center z-10">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2">Densidade de Clientes</span>
              <div className="w-48 h-2.5 rounded-full" style={{ background: "linear-gradient(to right, #b91c1c, #f87171, #60a5fa, #3b82f6, #1e40af)" }}></div>
              <div className="w-full flex justify-between text-[9px] font-black text-gray-400 mt-1 uppercase"><span>Menor</span><span>Maior</span></div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="font-bold text-lg mb-6 text-gray-800 flex items-center gap-2"><Users className="text-blue-500" /> Distribuição por Idade {estadoSelecionado && <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-lg ml-2 font-bold">Filtrado: {estadoSelecionado}</span>}</h3>
          <div className="flex-1" style={{ minHeight: '550px' }}>
            {dataBarras.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataBarras} margin={{ top: 30, right: 30, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="faixa" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="quantidade" name="Clientes" radius={[6, 6, 0, 0]} onClick={(data) => setFaixaSelecionada(data.faixa === faixaSelecionada ? null : data.faixa)}>
                    {dataBarras.map((entry, index) => {
                      const isSelected = entry.faixa === faixaSelecionada;
                      const isFaded = faixaSelecionada && !isSelected;
                      return <Cell key={`cell-${index}`} fill={isSelected ? "#2563eb" : "#3b82f6"} fillOpacity={isFaded ? 0.3 : 1} style={{ cursor: 'pointer', transition: 'all 0.3s' }} />;
                    })}
                    <LabelList dataKey="quantidade" position="top" fill="#64748b" fontSize={13} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (<div className="h-full flex items-center justify-center text-gray-400">Nenhum dado encontrado para este filtro.</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;