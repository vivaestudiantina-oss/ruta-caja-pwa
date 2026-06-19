'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CalendarDays, CheckCircle2, Clock3, History, ListChecks, LogOut, Plus, RefreshCw, WalletCards } from 'lucide-react';

type Tipo = 'Ingreso' | 'Gasto' | 'Reserva';
type Estado = 'Pendiente' | 'Cobrado' | 'Pagado' | 'Parcial' | 'Reprogramado' | 'Cancelado';

type Movimiento = {
  id: string;
  fecha: string;
  tipo: Tipo;
  categoria: string | null;
  nombre: string;
  descripcion: string | null;
  monto: number;
  estado: Estado;
  monto_pagado: number | null;
  fecha_check: string | null;
  nota: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CL', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  });
};

const signedAmount = (m: Movimiento) => (m.tipo === 'Ingreso' ? m.monto : -m.monto);
const isDone = (m: Movimiento) => ['Cobrado', 'Pagado'].includes(m.estado);

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [items, setItems] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'hoy' | 'semana' | 'flujo' | 'historial' | 'agregar'>('hoy');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fecha: todayLocal(),
    tipo: 'Ingreso' as Tipo,
    categoria: 'Otro',
    nombre: '',
    descripcion: '',
    monto: '',
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) fetchItems();
  }, [session]);

  const fetchItems = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('movimientos_caja')
      .select('*')
      .order('fecha', { ascending: true })
      .order('creado_en', { ascending: true });

    if (!error && data) setItems(data as Movimiento[]);
    setLoading(false);
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError('Correo o clave incorrecta.');
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setItems([]);
  };

  const updateStatus = async (m: Movimiento, estado: Estado, montoPagado?: number) => {
    setSaving(true);
    const payload: any = {
      estado,
      fecha_check: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };
    if (typeof montoPagado === 'number') payload.monto_pagado = montoPagado;
    if (estado === 'Cobrado' || estado === 'Pagado') payload.monto_pagado = m.monto;

    const { error } = await supabase.from('movimientos_caja').update(payload).eq('id', m.id);
    if (!error) await fetchItems();
    setSaving(false);
  };

  const partial = async (m: Movimiento) => {
    const raw = window.prompt('Monto parcial recibido/pagado:', String(m.monto_pagado || ''));
    if (!raw) return;
    const monto = Number(raw.replace(/[^0-9]/g, ''));
    if (!monto) return;
    await updateStatus(m, 'Parcial', monto);
  };

  const reprogram = async (m: Movimiento) => {
    const newDate = window.prompt('Nueva fecha YYYY-MM-DD:', m.fecha);
    if (!newDate) return;
    setSaving(true);
    const { error } = await supabase
      .from('movimientos_caja')
      .update({ fecha: newDate, estado: 'Reprogramado', actualizado_en: new Date().toISOString() })
      .eq('id', m.id);
    if (!error) await fetchItems();
    setSaving(false);
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(form.monto.replace(/[^0-9]/g, ''));
    if (!form.nombre || !monto) return;
    setSaving(true);
    const { error } = await supabase.from('movimientos_caja').insert({
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      nombre: form.nombre,
      descripcion: form.descripcion || form.nombre,
      monto,
      estado: 'Pendiente',
    });
    if (!error) {
      setForm({ fecha: todayLocal(), tipo: 'Ingreso', categoria: 'Otro', nombre: '', descripcion: '', monto: '' });
      await fetchItems();
      setTab('hoy');
    }
    setSaving(false);
  };

  const today = todayLocal();
  const tomorrowLimit = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayItems = items.filter((m) => m.fecha === today && m.estado === 'Pendiente');
  const weekItems = items.filter((m) => m.fecha >= today && m.fecha <= tomorrowLimit && m.estado === 'Pendiente');
  const flowItems = items.filter((m) => !['Cobrado', 'Pagado', 'Cancelado'].includes(m.estado));
  const historyItems = items.filter(isDone).sort((a, b) => (b.fecha_check || '').localeCompare(a.fecha_check || ''));

  const visibleItems = tab === 'hoy' ? todayItems : tab === 'semana' ? weekItems : tab === 'flujo' ? flowItems : historyItems;

  const summary = useMemo(() => {
    const base = tab === 'hoy' ? todayItems : tab === 'semana' ? weekItems : flowItems;
    const ingresos = base.filter((m) => m.tipo === 'Ingreso').reduce((a, b) => a + b.monto, 0);
    const gastos = base.filter((m) => m.tipo !== 'Ingreso').reduce((a, b) => a + b.monto, 0);
    const saldo = items.reduce((a, b) => a + signedAmount(b), 0);
    return { ingresos, gastos, saldo };
  }, [tab, todayItems, weekItems, flowItems, items]);

  const runningBalances = useMemo(() => {
    let total = 0;
    const map = new Map<string, number>();
    [...items]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creado_en || '').localeCompare(b.creado_en || ''))
      .forEach((m) => {
        total += signedAmount(m);
        map.set(m.id, total);
      });
    return map;
  }, [items]);

  if (loading) {
    return <div className="login-page"><div className="login-card"><h1>Ruta Caja</h1><p>Cargando...</p></div></div>;
  }

  if (!session) {
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="logo" style={{ marginBottom: 16 }}>RC</div>
          <h1>Ruta Caja</h1>
          <p>Ingresa para controlar tus cobros, pagos y flujo diario.</p>
          {loginError && <div className="error">{loginError}</div>}
          <div className="field">
            <label>Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Clave</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-green" type="submit" style={{ width: '100%' }}>Entrar</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="header">
        <div className="brand">
          <div className="logo">RC</div>
          <div>
            <h1>Ruta Caja</h1>
            <p>{tab === 'hoy' ? dateLabel(today) : 'Control móvil de flujo'}</p>
          </div>
        </div>
        <button className="logout" onClick={logout}><LogOut size={17} /></button>
      </header>

      {tab !== 'historial' && tab !== 'agregar' && (
        <section className="summary-grid">
          <div className="summary-card income"><span>Por cobrar</span><strong>{money(summary.ingresos)}</strong></div>
          <div className="summary-card expense"><span>Por pagar</span><strong>{money(summary.gastos)}</strong></div>
          <div className={`summary-card balance ${summary.saldo < 0 ? 'negative' : ''}`}><span>Saldo proyectado</span><strong>{money(summary.saldo)}</strong></div>
        </section>
      )}

      {tab === 'agregar' ? (
        <section className="form-card">
          <div className="section-title"><h2>Agregar movimiento</h2></div>
          <form className="form-grid" onSubmit={addItem}>
            <div className="two">
              <div className="field"><label>Fecha</label><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
              <div className="field"><label>Tipo</label><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })}><option>Ingreso</option><option>Gasto</option><option>Reserva</option></select></div>
            </div>
            <div className="field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Arriendo, Entel, préstamo" /></div>
            <div className="two">
              <div className="field"><label>Categoría</label><input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /></div>
              <div className="field"><label>Monto</label><input inputMode="numeric" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="185000" /></div>
            </div>
            <div className="field"><label>Nota</label><textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
            <button disabled={saving} className="btn btn-blue" type="submit">Guardar movimiento</button>
          </form>
        </section>
      ) : (
        <>
          <div className="section-title">
            <h2>{tab === 'hoy' ? 'Tareas de hoy' : tab === 'semana' ? 'Próximos 7 días' : tab === 'flujo' ? 'Flujo pendiente' : 'Historial'}</h2>
            <button className="btn btn-light" onClick={fetchItems}><RefreshCw size={16} /></button>
          </div>
          {visibleItems.length === 0 ? (
            <div className="empty">No hay movimientos para mostrar.</div>
          ) : (
            <section className="cards">
              {visibleItems.map((m) => {
                const balance = runningBalances.get(m.id) || 0;
                const isIngreso = m.tipo === 'Ingreso';
                const done = isDone(m);
                return (
                  <article className={`mov-card ${balance < 0 ? 'warning' : ''}`} key={m.id}>
                    <div className="mov-head">
                      <div>
                        <h3 className="mov-title">{m.nombre}</h3>
                        <p className="mov-sub">{dateLabel(m.fecha)} · {m.categoria || m.tipo}</p>
                      </div>
                      <div className={`amount ${m.tipo.toLowerCase()}`}>{isIngreso ? '+' : '-'}{money(m.monto)}</div>
                    </div>
                    <div className="badges">
                      <span className={`badge ${done ? 'done' : 'pending'}`}>{m.estado}</span>
                      <span className="badge">{m.tipo}</span>
                      <span className={`badge ${balance < 0 ? 'alert' : ''}`}>Saldo: {money(balance)}</span>
                      {m.monto_pagado ? <span className="badge">Parcial: {money(m.monto_pagado)}</span> : null}
                    </div>
                    {m.descripcion && <p className="mov-sub">{m.descripcion}</p>}
                    {!done && (
                      <div className="actions">
                        {isIngreso ? (
                          <button disabled={saving} className="btn btn-green" onClick={() => updateStatus(m, 'Cobrado')}>Cobrado</button>
                        ) : (
                          <button disabled={saving} className="btn btn-red" onClick={() => updateStatus(m, 'Pagado')}>Pagado</button>
                        )}
                        <button disabled={saving} className="btn btn-yellow" onClick={() => partial(m)}>Parcial</button>
                        <button disabled={saving} className="btn btn-gray" onClick={() => reprogram(m)}>Reprogramar</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      <nav className="nav">
        <button className={tab === 'hoy' ? 'active' : ''} onClick={() => setTab('hoy')}><Clock3 size={18} />Hoy</button>
        <button className={tab === 'semana' ? 'active' : ''} onClick={() => setTab('semana')}><CalendarDays size={18} />Semana</button>
        <button className={tab === 'flujo' ? 'active' : ''} onClick={() => setTab('flujo')}><WalletCards size={18} />Flujo</button>
        <button className={tab === 'historial' ? 'active' : ''} onClick={() => setTab('historial')}><History size={18} />Historial</button>
        <button className={tab === 'agregar' ? 'active' : ''} onClick={() => setTab('agregar')}><Plus size={18} />Agregar</button>
      </nav>
    </main>
  );
}
