import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { 
  Play, Square, User, LogOut, Plus, X, Award, Shield, Zap, 
  TrendingUp, Trash2, Edit3, AlertTriangle, Bell, LayoutDashboard, 
  BookMarked, Save, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar as CalendarIcon,
  Camera, Clock, Image as ImageIcon, Target, Trophy, Star, CheckCircle2, History, AlertCircle
} from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// --- CONFIGURAÇÃO SUPABASE ---
// Certifique-se de que as variáveis de ambiente estão no seu arquivo .env
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL, 
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// --- CONSTANTES DE GAMIFICAÇÃO (PATENTES) ---
const RANKING = [
  { rank: "Recruta", min: 0, color: "text-slate-400", border: "border-slate-400/30", bg: "bg-slate-400/10" },
  { rank: "Soldado", min: 500, color: "text-emerald-500", border: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  { rank: "Cabo", min: 1500, color: "text-blue-500", border: "border-blue-500/30", bg: "bg-blue-500/10" },
  { rank: "Sargento", min: 5000, color: "text-indigo-500", border: "border-indigo-500/30", bg: "bg-indigo-500/10" },
  { rank: "Subtenente", min: 12000, color: "text-purple-500", border: "border-purple-500/30", bg: "bg-purple-500/10" },
  { rank: "Tenente", min: 25000, color: "text-amber-500", border: "border-amber-500/30", bg: "bg-amber-500/10" },
  { rank: "Capitão", min: 50000, color: "text-rose-500", border: "border-rose-500/30", bg: "bg-rose-500/10" }
];

// --- COMPONENTES DE INTERFACE AUXILIARES ---
const NavBtn = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all duration-300 ${
      active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-500 hover:text-indigo-400 hover:bg-white/5'
    }`}
  >
    {icon} 
    <span className="hidden md:inline">{label}</span>
  </button>
);

// --- FUNÇÕES UTILITÁRIAS ---
function getRank(xp) { 
  return RANKING.slice().reverse().find(r => xp >= r.min) || RANKING[0]; 
}

function getDays(d) { 
  if(!d) return 0; 
  const targetDate = new Date(d + 'T00:00:00');
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24))); 
}

function fmtSec(s) { 
  if (!s || s < 0) return "0m";
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Lógica de Status de Revisão (7 dias)
function getRevisionStatus(lastRevision) {
  if (!lastRevision) return { label: "PENDENTE", color: "text-slate-500", bg: "bg-slate-500/10", icon: <History size={10}/> };
  
  const last = new Date(lastRevision);
  const now = new Date();
  const diffTime = Math.abs(now - last);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 7) return { label: "REVISADO", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: <CheckCircle2 size={10}/> };
  return { label: "VENCIDO", color: "text-rose-500", bg: "bg-rose-500/10", icon: <AlertCircle size={10}/> };
}

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [isTimerMinimized, setIsTimerMinimized] = useState(false);
  
  const [disciplinas, setDisciplinas] = useState([]);
  const [assuntos, setAssuntos] = useState([]);
  const [historico, setHistorico] = useState([]);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0]);
  const [chartScope, setChartScope] = useState("month");

  const [activeAssuntoId, setActiveAssuntoId] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [modal, setModal] = useState({ type: null, data: null });
  const [notifications, setNotifications] = useState([]);

  // Ativa modo dark global
  useEffect(() => { 
    document.documentElement.classList.add('dark'); 
  }, []);

  // --- LÓGICA DE AUTENTICAÇÃO E SINCRONIZAÇÃO ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setUser(session.user);
          await refreshAll(session.user.id, session.user);
        } else {
          // ESSA LINHA ABAIXO É A QUE MATA O LOOP INFINITO
          setLoading(false); 
        }
      } catch (e) {
        setLoading(false);
      }
    };
    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUser(session.user);
        await refreshAll(session.user.id, session.user);
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false); // Garante que a tela de login apareça
      }
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  const refreshAll = async (uid, authUser = null) => {
    try {
      // 1. Tenta buscar o perfil primeiro
      let { data: p, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle();

      // 2. Lógica de "Upsert" manual para evitar o erro 409
      if (!p && authUser) {
        const { data: newP, error: insertError } = await supabase
          .from("profiles")
          .upsert({ // O 'upsert' atualiza se já existir ou insere se for novo
            id: uid,
            full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.custom_claims?.global_name || "Operador",
            avatar_url: authUser.user_metadata?.avatar_url || "",
            xp: 0
          }, { onConflict: 'id' }) 
          .select()
          .single();

        if (!insertError) {
          p = newP;
        } else {
          // Se ainda assim der erro, fazemos uma última tentativa de busca
          const { data: retryP } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
          p = retryP;
        }
      }

      // 3. Busca os dados em paralelo (Disciplinas, Assuntos, Histórico)
      const [d, a, h] = await Promise.all([
        supabase.from("disciplinas").select("*").eq("user_id", uid).order('nome'),
        supabase.from("assuntos").select("*").eq("user_id", uid).order('nome'),
        supabase.from("historico_estudos").select("*").eq("user_id", uid).order('data', { ascending: false })
      ]);

      // 4. Atualiza os estados do React
      setProfile(p);
      setDisciplinas(d.data || []);
      setAssuntos(a.data || []);
      setHistorico(h.data || []);

    } catch (err) {
      console.error("Erro na sincronização:", err);
    } finally {
      // ESTA LINHA É A MAIS IMPORTANTE: 
      // Ela força o fim do estado de "Loading" mesmo que o Supabase dê erro de relógio.
      setLoading(false);
    }
  };

  // CORREÇÃO DO LOGOUT: Redirecionamento forçado para a tela de Login com Discord
  const handleLogout = async () => {
    setLoading(true);
    try {
      // 1. Encerra a sessão no Supabase
      await supabase.auth.signOut();
      
      // 2. Limpa todos os vestígios locais
      localStorage.clear();
      sessionStorage.clear();
      
      // 3. Deleta cookies relacionados à sessão (opcional, mas seguro)
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      // 4. Redireciona e força o recarregamento total da página
      // Isso garantirá que o estado 'user' seja nulo e caia na tela de Login
      window.location.replace(window.location.origin);
    } catch (error) {
      console.error("Erro ao sair:", error);
      window.location.href = "/";
    }
  };

  const notify = (text, type = "info") => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, text, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 4000);
  };

  // --- CONTROLE DO CRONÔMETRO ---
  useEffect(() => {
    let interval = null;
    if (isActive) interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const saveSession = async () => {
    if (seconds < 60) return notify("A sessão deve ter pelo menos 1 minuto.", "warning");
    if (!activeAssuntoId) return notify("Selecione um tópico para registrar.", "warning");
    
    setIsActive(false);
    const target = assuntos.find(a => a.id === activeAssuntoId);
    const xpGain = Math.floor(seconds / 60);

    try {
      await supabase.from("historico_estudos").insert({
        user_id: user.id, 
        assunto_id: activeAssuntoId, 
        data: new Date().toISOString().split('T')[0], 
        duracao: seconds
      });

      await supabase.from("assuntos").update({
        tempo_total: (target.tempo_total || 0) + seconds,
        total_revisoes: (target.total_revisoes || 0) + 1,
        ultima_revisao: new Date().toISOString()
      }).eq("id", activeAssuntoId);

      await supabase.from("profiles").update({ 
        xp: (profile.xp || 0) + xpGain 
      }).eq("id", user.id);
      
      notify(`Missão Cumprida! +${xpGain} XP adicionados.`, "success");
      setSeconds(0);
      refreshAll(user.id);
    } catch (e) { 
      notify("Erro ao salvar dados no banco.", "error"); 
    }
  };

  // --- ESTATÍSTICAS ---
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const day = historico.filter(h => h.data === todayStr).reduce((a,b) => a + b.duracao, 0);
    const month = historico.filter(h => new Date(h.data + 'T00:00:00').getMonth() === now.getMonth()).reduce((a,b) => a + b.duracao, 0);
    return { day, month, year: historico.reduce((a,b) => a + b.duracao, 0) };
  }, [historico]);

  if (loading) return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center flex-col gap-6">
      <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(79,70,229,0.3)]" />
      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.5em] animate-pulse">Carregando Protocolos COE...</p>
    </div>
  );

  // TELA DE LOGIN (DESTINO DO LOGOUT)
  if (!user) return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-[#0d1117] border border-white/5 p-10 rounded-[2.5rem] text-center shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] animate-gradient-x" />
        <div className="mb-8 flex justify-center">
          <div className="p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20">
            <Shield size={42} className="text-indigo-500" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">Comando de Estudos</h1>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-10">Autenticação Necessária</p>
        <button 
          onClick={async () => {
            await supabase.auth.signInWithOAuth({
              provider: 'discord',
              options: {
                // Use o link direto da Cloudflare aqui
                redirectTo: 'https://controle-de-estudos.welson-d-o-p.workers.dev/auth/v1/callback'
              }
            });
          }} 
          className="cursor-pointer w-full bg-[#5865F2] text-white p-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-[#5865F2]/20 hover:scale-[1.02] active:scale-95 transition-all duration-300"
        >
          <Zap size={18} fill="currentColor"/> Conectar com Discord
        </button>
      </div>
    </div>
  );

  const rankInfo = getRank(profile?.xp || 0);

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 font-sans pb-40 selection:bg-indigo-500/30">
      
      {/* SISTEMA DE NOTIFICAÇÕES */}
      <div className="fixed top-6 right-6 z-[1000] space-y-3 w-72 pointer-events-none">
        {notifications.map(n => (
          <div key={n.id} className="p-4 rounded-2xl border border-white/10 backdrop-blur-xl bg-[#0d1117]/90 text-white flex items-start gap-3 animate-in slide-in-from-right-full pointer-events-auto shadow-2xl border-l-4 border-l-indigo-500">
            <Bell size={16} className="mt-1 text-indigo-400"/>
            <p className="text-[11px] font-bold leading-tight">{n.text}</p>
          </div>
        ))}
      </div>

      {/* HEADER OPERACIONAL */}
      <header className="sticky top-0 z-[100] bg-[#0d1117]/80 backdrop-blur-md border-b border-slate-800 p-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <img src={profile?.avatar_url || user?.user_metadata?.avatar_url} className="w-10 h-10 rounded-xl border-2 border-indigo-600 object-cover" alt="Avatar" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#0d1117] rounded-full" />
            </div>
            <div className="hidden md:block leading-none truncate">
              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${rankInfo.bg} ${rankInfo.color} border border-white/5`}>{rankInfo.rank}</span>
              <p className="text-sm font-black uppercase tracking-tight mt-1 truncate">{profile?.full_name || "Operador"}</p>
            </div>
          </div>

          <nav className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-white/5 shadow-inner">
            <NavBtn active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<LayoutDashboard size={16}/>} label="PAINEL" />
            <NavBtn active={view === 'edital'} onClick={() => setView('edital')} icon={<BookMarked size={16}/>} label="EDITAL" />
            <NavBtn active={view === 'profile'} onClick={() => setView('profile')} icon={<User size={16}/>} label="PERFIL" />
          </nav>
          
          <button 
            onClick={handleLogout} 
            className="cursor-pointer p-2.5 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all duration-300 active:scale-90"
            title="Sair do Sistema"
          >
            <LogOut size={20}/>
          </button>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 xl:grid-cols-4 gap-8">
        <div className="xl:col-span-3 space-y-8">
          
          {/* PAINEL INICIAL */}
          {view === 'dashboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className={`relative overflow-hidden bg-gradient-to-br ${profile?.data_prova ? 'from-indigo-600 to-blue-900' : 'from-slate-800 to-slate-900'} rounded-[2.5rem] p-8 text-white shadow-2xl transition-all duration-500`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60 mb-2">Contagem Regressiva</p>
                    <h1 className="text-5xl font-black italic uppercase tracking-tighter mb-4">
                        {profile?.data_prova ? `${getDays(profile.data_prova)} DIAS` : "---"}
                    </h1>
                    <div className="flex items-center gap-2 text-[9px] font-black bg-black/20 w-fit px-4 py-2 rounded-full border border-white/10">
                        <Target size={14} className="text-indigo-300"/> DATA ALVO: {profile?.data_prova ? new Date(profile.data_prova + 'T00:00:00').toLocaleDateString() : 'NÃO DEFINIDA'}
                    </div>
                    <Shield className="absolute right-[-30px] bottom-[-30px] w-48 h-48 opacity-10 rotate-12" />
                </div>
                <div className="bg-[#0d1117] rounded-[2.5rem] p-8 border border-slate-800 flex flex-col justify-center shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-1">Carga Horária Total</p>
                            <h2 className="text-4xl font-black italic text-indigo-500 tracking-tighter tabular-nums">{fmtSec(stats.year)}</h2>
                        </div>
                        <div className="p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10"><TrendingUp className="text-indigo-500" size={24}/></div>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)] transition-all duration-1000" style={{width: '100%'}} />
                    </div>
                </div>
              </div>

              {/* GRÁFICO E CALENDÁRIO */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-[#0d1117] p-8 rounded-[2.5rem] border border-slate-800 shadow-xl">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Fluxo de Desempenho</h3>
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-white/5">
                      {['DIA', 'MÊS', 'ANO'].map((l, i) => (
                        <button key={l} onClick={() => setChartScope(['day','month','year'][i])} className={`cursor-pointer px-5 py-2 text-[9px] font-black rounded-lg transition-all ${chartScope === ['day','month','year'][i] ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="h-80"><ActivityChart data={historico} scope={chartScope} current={currentDate} selectedDay={selectedDay} /></div>
                </div>
                
                <div className="bg-[#0d1117] p-8 rounded-[2.5rem] border border-slate-800 shadow-xl">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 italic">{currentDate.toLocaleString('pt-BR', { month: 'long' })}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()-1)))} className="cursor-pointer p-2 hover:bg-white/5 rounded-xl transition-all"><ChevronLeft size={18}/></button>
                      <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth()+1)))} className="cursor-pointer p-2 hover:bg-white/5 rounded-xl transition-all"><ChevronRight size={18}/></button>
                    </div>
                  </div>
                  <Calendar frequency={historico} currentDate={currentDate} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />
                </div>
              </div>
            </>
          )}

          {/* EDITAL VERTICALIZADO COM STATUS */}
          {view === 'edital' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">Edital Operacional</h2>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Gerenciamento de disciplinas e revisões</p>
                </div>
                <button 
                    onClick={() => setModal({ type: 'full' })} 
                    className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
                >
                  <Plus size={16}/> Adicionar Matéria
                </button>
              </div>

              {disciplinas.length === 0 && (
                <div className="bg-[#0d1117] border-2 border-dashed border-slate-800 rounded-[2.5rem] p-20 text-center">
                    <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5"><BookMarked size={24} className="text-slate-700"/></div>
                    <p className="text-slate-600 font-black text-[10px] uppercase tracking-widest">Nenhuma disciplina cadastrada na base de dados.</p>
                </div>
              )}

              {disciplinas.map(d => (
                <div key={d.id} className="bg-[#0d1117] rounded-[2rem] border border-slate-800 overflow-hidden shadow-xl transition-all hover:border-slate-700">
                  <div className="bg-slate-900/50 p-6 flex justify-between items-center border-b border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                        <h3 className="font-black uppercase text-sm tracking-widest text-indigo-400">{d.nome}</h3>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setModal({ type: 'assu', data: d.id })} className="cursor-pointer p-2.5 hover:bg-indigo-500/10 text-indigo-400 rounded-xl transition-all" title="Adicionar Assunto"><Plus size={20}/></button>
                      <button onClick={() => setModal({ type: 'delD', data: d })} className="cursor-pointer p-2.5 text-rose-500/50 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all"><Trash2 size={20}/></button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-800/40">
                    {assuntos.filter(a => a.disciplina_id === d.id).map(a => {
                      const status = getRevisionStatus(a.ultima_revisao);
                      return (
                        <div key={a.id} className="p-5 flex justify-between items-center group hover:bg-white/[0.02] transition-all">
                          <div className="flex items-center gap-5">
                            <div className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl border border-white/5 min-w-[85px] shadow-sm ${status.bg} ${status.color}`}>
                               {status.icon}
                               <span className="text-[8px] font-black mt-1 tracking-tighter">{status.label}</span>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-200">{a.nome}</p>
                              <p className="text-[9px] font-black text-slate-500 uppercase mt-1 tracking-widest flex items-center gap-2">
                                <History size={10}/> {a.total_revisoes || 0} Ciclos • Last: {a.ultima_revisao ? new Date(a.ultima_revisao).toLocaleDateString() : '---'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="font-mono text-xs font-black text-indigo-400 tabular-nums">{fmtSec(a.tempo_total || 0)}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <button onClick={() => setModal({ type: 'editA', data: a })} className="cursor-pointer p-2 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg"><Edit3 size={16}/></button>
                              <button onClick={() => setModal({ type: 'delA', data: a.id })} className="cursor-pointer p-2 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"><Trash2 size={16}/></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'profile' && <ProfileView profile={profile} user={user} refresh={refreshAll} notify={notify} />}
        </div>

        {/* BARRA LATERAL (STATUS) */}
        <aside className="space-y-6">
            <div className="bg-[#0d1117] p-1 rounded-2xl border border-slate-800 flex overflow-hidden shadow-lg">
                <div className="flex-1 p-4 text-center border-r border-slate-800">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">XP Atual</p>
                    <p className="text-xl font-black text-white italic">{profile?.xp || 0}</p>
                </div>
                <div className="flex-1 p-4 text-center">
                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Rank</p>
                    <p className={`text-sm font-black italic uppercase ${rankInfo.color}`}>{rankInfo.rank}</p>
                </div>
            </div>

            <BadgeCard label="Tempo Hoje" time={stats.day} icon={<Clock size={16}/>} color="from-emerald-600 to-teal-800" />
            <BadgeCard label="Este Mês" time={stats.month} icon={<Trophy size={16}/>} color="from-indigo-600 to-indigo-900" />
            
            <div className="bg-[#0d1117] p-6 rounded-[2rem] border border-slate-800 relative overflow-hidden group shadow-xl">
                <Award size={80} className="absolute -top-4 -right-4 opacity-[0.03] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700" />
                <p className="text-[10px] font-black text-indigo-400 uppercase mb-5 tracking-[0.2em] relative z-10">Progresso de Carreira</p>
                <div className="flex items-center gap-4 mb-5 relative z-10">
                  <div className={`p-3 rounded-2xl ${rankInfo.bg} ${rankInfo.color} border border-white/5 shadow-inner`}><Shield size={24}/></div>
                  <div>
                    <p className="text-sm font-black uppercase italic tracking-tight">{rankInfo.rank}</p>
                    <p className="text-[10px] font-black text-slate-500 uppercase">Faltam {500 - (profile?.xp % 500)} XP para novo nível</p>
                  </div>
                </div>
                <div className="h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.5)] transition-all duration-1000 ease-out" style={{width: `${(profile?.xp % 500) / 5}%`}} />
                </div>
            </div>

            <div className="bg-indigo-600/10 border border-indigo-500/20 p-6 rounded-[2rem] shadow-lg">
                <div className="flex items-center gap-3 mb-3">
                    <AlertCircle size={18} className="text-indigo-400"/>
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Protocolo COE</p>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium italic">
                    "O sucesso é a soma de pequenos esforços repetidos dia após dia." - Mantenha a constância operacional, Operador {profile?.full_name?.split(' ')[0]}.
                </p>
            </div>
        </aside>
      </main>

      {/* CRONÔMETRO FLUTUANTE PREMIUM */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${isTimerMinimized ? 'w-48' : 'w-[94%] max-w-4xl'}`}>
        <div className="bg-[#0d1117]/90 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] p-5 flex flex-col md:flex-row items-center gap-5">
          {!isTimerMinimized ? (
            <>
              <div className="relative flex-1 w-full">
                <select 
                  value={activeAssuntoId} 
                  onChange={e => setActiveAssuntoId(e.target.value)} 
                  className="cursor-pointer w-full bg-[#0a0c10] p-4 pr-12 rounded-2xl outline-none text-[10px] font-black uppercase border border-white/10 text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
                >
                  <option value="" className="bg-[#0d1117]">ALVO DA MISSÃO (SELECIONE O ASSUNTO)</option>
                  {assuntos.map(a => <option key={a.id} value={a.id} className="bg-[#0d1117]">{a.nome}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" size={16}/>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-black/40 px-8 py-4 rounded-2xl border border-indigo-500/20 text-3xl font-mono font-black text-indigo-400 tabular-nums shadow-inner tracking-tighter">
                  {new Date(seconds * 1000).toISOString().substr(11, 8)}
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsActive(!isActive)} 
                    className={`cursor-pointer w-16 h-16 rounded-2xl flex items-center justify-center ${isActive ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-500 shadow-emerald-500/20'} text-white shadow-xl hover:brightness-110 active:scale-90 transition-all duration-300`}
                    title={isActive ? "Pausar" : "Iniciar"}
                  >
                    {isActive ? <Square size={26} fill="currentColor"/> : <Play size={26} fill="currentColor" className="ml-1"/>}
                  </button>
                  <button 
                    onClick={saveSession} 
                    className="cursor-pointer w-16 h-16 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-90 transition-all duration-300"
                    title="Salvar Sessão"
                  >
                    <Save size={26}/>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4 cursor-pointer py-2 group" onClick={() => setIsTimerMinimized(false)}>
              <div className={`w-3.5 h-3.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700 shadow-inner'}`} />
              <span className="text-xl font-mono font-black text-indigo-400 tracking-tighter tabular-nums">
                {new Date(seconds * 1000).toISOString().substr(14, 5)}
              </span>
            </div>
          )}
          <button 
            onClick={() => setIsTimerMinimized(!isTimerMinimized)} 
            className="cursor-pointer p-2 text-slate-600 hover:text-white transition-colors duration-300 rounded-full hover:bg-white/5"
          >
            {isTimerMinimized ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
          </button>
        </div>
      </div>

      {/* MODAIS DO SISTEMA */}
      {modal.type && <Modal modal={modal} setModal={setModal} user={user} refreshAll={refreshAll} notify={notify} />}
    </div>
  );
}

// --- SUB-COMPONENTES DETALHADOS ---

function BadgeCard({ label, time, icon, color }) {
    return (
        <div className={`p-6 rounded-[2rem] bg-gradient-to-br ${color} text-white shadow-2xl flex justify-between items-center group transition-all duration-500 hover:scale-[1.03] hover:-translate-y-1`}>
            <div>
                <p className="text-[8px] font-black uppercase opacity-60 tracking-[0.3em] mb-1">{label}</p>
                <p className="text-2xl font-black italic tracking-tighter tabular-nums">{fmtSec(time)}</p>
            </div>
            <div className="opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 bg-black/20 p-3 rounded-2xl">{icon}</div>
        </div>
    );
}

function Calendar({ frequency, currentDate, selectedDay, setSelectedDay }) {
  const days = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    const arr = [];
    // Preenchimento de espaços vazios (offset do início do mês)
    for (let i = 0; i < firstDay; i++) arr.push({ day: null });
    
    // Geração dos dias com trava de fuso horário local
    for (let i = 1; i <= lastDay; i++) {
      // CORREÇÃO: Montamos a string YYYY-MM-DD manualmente para ignorar o deslocamento UTC
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      
      const time = frequency
        .filter(h => h.data === dStr)
        .reduce((a, b) => a + b.duracao, 0);

      arr.push({ day: i, time, date: dStr });
    }
    return arr;
  }, [frequency, currentDate]);

  // Identifica o dia de hoje no formato local para o destaque visual
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="grid grid-cols-7 gap-2.5">
      {['D','S','T','Q','Q','S','S'].map(d => (
        <div key={d} className="text-[10px] font-black text-slate-700 text-center py-2">{d}</div>
      ))}
      
      {days.map((d, idx) => d.day ? (
        <button 
          key={idx} 
          onClick={() => setSelectedDay(d.date)} 
          className={`cursor-pointer group relative w-full aspect-square flex flex-col items-center justify-center rounded-2xl border-2 transition-all duration-300 
            ${d.time > 0 
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
              : 'bg-white/[0.02] border-transparent text-slate-600 hover:bg-white/[0.05] hover:border-slate-800'} 
            ${selectedDay === d.date ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-500/20' : ''}
            ${d.date === todayStr ? 'border-indigo-500/50 shadow-[0_0_10px_rgba(79,70,229,0.2)]' : ''}`}
        >
          <span className="text-[11px] font-black">{d.day}</span>
          {d.time > 0 && (
            <span className="text-[7px] font-black opacity-60 mt-1 tabular-nums">
              {fmtSec(d.time)}
            </span>
          )}
          
          {/* Tooltip flutuante */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-slate-900 border border-white/10 text-white text-[9px] font-black px-3 py-1.5 rounded-lg shadow-2xl whitespace-nowrap pointer-events-none animate-in fade-in zoom-in-95">
            {d.time > 0 ? `${fmtSec(d.time)} ESTUDADOS` : "SEM REGISTROS"}
          </div>
        </button>
      ) : (
        <div key={idx} />
      ))}
    </div>
  );
}

function ActivityChart({ data, scope, current, selectedDay }) {
  const chartData = useMemo(() => {
    const year = current.getFullYear();
    const month = current.getMonth();
    
    // VISÃO DE DIA: Mostra as sessões individuais do dia selecionado
    if (scope === "day") {
      const dayData = data.filter(h => h.data === selectedDay);
      return dayData.length > 0 
        ? dayData.map((h, i) => ({ 
            name: `Sessão ${i + 1}`, 
            h: Number((h.duracao / 3600).toFixed(2)) 
          })) 
        : [{ name: 'Sem dados', h: 0 }];
    }
    
    // VISÃO de MÊS: Itera sobre os dias do mês atual (Local)
    if (scope === "month") {
      const lastDay = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: lastDay }, (_, i) => {
        const dayNumber = i + 1;
        // CORREÇÃO: Montagem manual da data para evitar o salto UTC das 21h
        const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        
        const val = data
          .filter(h => h.data === dStr)
          .reduce((a, b) => a + b.duracao, 0);
          
        return { 
          name: dayNumber, 
          h: Number((val / 3600).toFixed(1)) 
        };
      });
    }

    // VISÃO de ANO: Agrupa por meses (Local)
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return monthNames.map((name, i) => {
      const val = data.filter(h => {
        // CORREÇÃO: Split da data para evitar que o construtor Date() aplique fuso horário
        const [hYear, hMonth] = h.data.split('-').map(Number);
        return (hMonth - 1) === i && hYear === year;
      }).reduce((a, b) => a + b.duracao, 0);
      
      return { 
        name, 
        h: Number((val / 3600).toFixed(1)) 
      };
    });
  }, [data, scope, current, selectedDay]);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorH" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff05" />
        <XAxis 
          dataKey="name" 
          fontSize={10} 
          axisLine={false} 
          tickLine={false} 
          stroke="#475569" 
          dy={10} 
          fontStyle="italic" 
        />
        <YAxis 
          fontSize={10} 
          axisLine={false} 
          tickLine={false} 
          stroke="#475569" 
        />
        <Tooltip 
          cursor={{ stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 5' }} 
          contentStyle={{
            background: '#0d1117', 
            border: '1px solid rgba(255,255,255,0.05)', 
            borderRadius: '16px', 
            fontSize: '10px', 
            fontWeight: 'bold', 
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
          }} 
          formatter={(value) => [`${value}h`, "Tempo de Estudo"]}
        />
        <Area 
          type="monotone" 
          dataKey="h" 
          stroke="#6366f1" 
          strokeWidth={4} 
          fill="url(#colorH)" 
          animationDuration={1500} 
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProfileView({ profile, user, refresh, notify }) {
  const [name, setName] = useState(profile?.full_name || "");
  const [dataP, setDataP] = useState(profile?.data_prova || "");
  const [avatar, setAvatar] = useState(profile?.avatar_url || "");

  const handleUpdate = async () => {
    try {
        await supabase.from("profiles").update({ 
            full_name: name, 
            avatar_url: avatar, 
            data_prova: dataP 
        }).eq("id", user.id);
        
        refresh(user.id); 
        notify("Perfil atualizado com sucesso!", "success");
    } catch (e) {
        notify("Falha ao salvar perfil.", "error");
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-[#0d1117] p-12 rounded-[3rem] border border-slate-800 text-center shadow-2xl animate-in zoom-in-95 duration-500">
      <div className="relative w-32 h-32 mx-auto mb-10 group">
        <img 
            src={avatar || user?.user_metadata?.avatar_url || "https://cdn.discordapp.com/embed/avatars/0.png"} 
            className="w-full h-full rounded-[2.5rem] border-2 border-indigo-600 object-cover shadow-[0_0_30px_rgba(79,70,229,0.3)] transition-all duration-500 group-hover:scale-105" 
            alt="Avatar" 
        />
        <div className="absolute -bottom-2 -right-2 bg-indigo-600 p-3 rounded-2xl shadow-lg border-4 border-[#0d1117]"><Camera size={18} className="text-white"/></div>
      </div>
      <div className="space-y-8 text-left">
        <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Codinome Operacional</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-[#0a0c10] p-5 rounded-2xl outline-none font-bold text-sm text-white border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
        </div>
        <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Link do Avatar (Discord/URL)</label>
            <input value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="https://..." className="w-full bg-[#0a0c10] p-5 rounded-2xl outline-none font-bold text-sm text-white border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all" />
        </div>
        <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Data da Prova Alvo</label>
            <input type="date" value={dataP} onChange={e => setDataP(e.target.value)} className="w-full bg-[#0a0c10] p-5 rounded-2xl outline-none font-bold text-sm text-white border border-white/5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all color-scheme-dark" />
        </div>
        <button onClick={handleUpdate} className="cursor-pointer w-full bg-indigo-600 text-white p-6 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all duration-300">Sincronizar Protocolo</button>
      </div>
    </div>
  );
}

function Modal({ modal, setModal, user, refreshAll, notify }) {
  // Criamos estados internos para o Modal. 
  // Isso faz com que o texto colado seja reconhecido instantaneamente pelo React.
  const [nomeD, setNomeD] = useState(modal.type === 'editA' ? modal.data.nome : "");
  const [nomeA, setNomeA] = useState("");

  const handleSave = async () => {
    try {
        // Usamos as variáveis nomeD e nomeA em vez de buscar por ID
        if (modal.type === 'editA') {
            await supabase.from("assuntos").update({ nome: nomeD }).eq("id", modal.data.id);
        } else if (modal.type === 'full') {
            const { data: d } = await supabase.from("disciplinas").insert({ user_id: user.id, nome: nomeD }).select().single();
            if(d) await supabase.from("assuntos").insert({ user_id: user.id, disciplina_id: d.id, nome: nomeA });
        } else if (modal.type === 'assu') {
            await supabase.from("assuntos").insert({ user_id: user.id, disciplina_id: modal.data, nome: nomeA });
        } else if (modal.type === 'delD') {
            await supabase.from("disciplinas").delete().eq("id", modal.data.id);
        } else if (modal.type === 'delA') {
            await supabase.from("assuntos").delete().eq("id", modal.data);
        }
        
        notify("Operação realizada com sucesso!", "success");
        setModal({ type: null }); 
        refreshAll(user.id);
    } catch (e) { 
        notify("Erro ao salvar no banco de dados.", "error"); 
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-[#0a0c10]/98 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-[#0d1117] w-full max-w-sm p-10 rounded-[3rem] border border-white/10 shadow-2xl">
        <h3 className="text-[11px] font-black uppercase text-indigo-500 mb-8 flex items-center gap-2 italic">
            <Zap size={14}/> {modal.type.startsWith('del') ? 'Protocolo de Remoção' : 'Registro de Dados'}
        </h3>
        
        <div className="space-y-5">
            {!modal.type.startsWith('del') && (
                <>
                    {(modal.type === 'full' || modal.type === 'editA') && (
                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-2">Disciplina</label>
                            <input 
                              value={nomeD} 
                              onChange={(e) => setNomeD(e.target.value)}
                              placeholder="Nome da matéria" 
                              className="w-full bg-[#0a0c10] p-4 rounded-2xl outline-none text-white text-xs border border-white/5 focus:border-indigo-500 transition-all" 
                            />
                        </div>
                    )}
                    {(modal.type === 'full' || modal.type === 'assu') && (
                        <div className="space-y-2">
                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-widest ml-2">Assunto</label>
                            <input 
                              value={nomeA} 
                              onChange={(e) => setNomeA(e.target.value)}
                              placeholder="Nome do tópico" 
                              className="w-full bg-[#0a0c10] p-4 rounded-2xl outline-none text-white text-xs border border-white/5 focus:border-indigo-500 transition-all" 
                            />
                        </div>
                    )}
                </>
            )}

            {modal.type.startsWith('del') && (
                <div className="py-6 text-center">
                    <AlertTriangle size={40} className="text-rose-500 mx-auto mb-4 opacity-50" />
                    <p className="text-xs font-bold text-slate-400 uppercase">Confirmar exclusão?</p>
                </div>
            )}
            
            <div className="pt-4 space-y-3">
                <button onClick={handleSave} className={`w-full p-5 rounded-2xl font-black text-[10px] tracking-widest transition-all ${modal.type.startsWith('del') ? 'bg-rose-600' : 'bg-indigo-600'} text-white shadow-lg`}>
                    {modal.type.startsWith('del') ? 'CONFIRMAR EXCLUSÃO' : 'SALVAR NO BANCO'}
                </button>
                <button onClick={() => setModal({ type: null })} className="w-full p-5 rounded-2xl font-black text-[10px] text-slate-600 uppercase">Abortar</button>
            </div>
        </div>
      </div>
    </div>
  );
}