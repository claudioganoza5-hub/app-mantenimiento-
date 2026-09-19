/* ============================================================
   Parte de Salas — interfaz.
   Sin dependencias: el servidor manda JSON y aqui se pinta.
   ============================================================ */

const AREAS = { luces: "Luces", sonido: "Sonido", general: "Mantenimiento general" };
const ESTADOS = { pendiente: "Pendiente", en_curso: "En curso", bloqueada: "Bloqueada", hecha: "Hecha" };
const PRIOS = { baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" };
const ROLES = { director: "Dirección", encargado: "Encargado/a", tecnico: "Técnico/a" };
const ORDEN_PRIO = { urgente: 0, alta: 1, media: 2, baja: 3 };

const raiz = document.getElementById("raiz");

const S = {
  vista: "cargando", // cargando | acceso | app
  yo: null,
  salas: [],
  equipo: [],
  tareas: [],
  tab: "",
  filtro: { estado: "abiertas", sala: "", area: "" },
  hoja: null,
  toast: null,
  acceso: { paso: "lista", personas: [], persona: null, codigoTemporal: "", primerNuevo: "", cargando: false },
  pad: { valor: "", mensaje: "", error: false, ocupado: false },
  setup: { error: "" },
};

/* ------------------------------ utilidades ------------------------------ */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const porId = (lista, id) => lista.find((x) => x.id === id) || null;
const salaNombre = (id) => porId(S.salas, id)?.nombre || "—";
const personaNombre = (id) => porId(S.equipo, id)?.nombre || null;
const iniciales = (n) =>
  String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const vencida = (t) => Boolean(t.vence && t.estado !== "hecha" && t.vence < hoyISO());

function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
function fechaHora(iso) {
  const d = new Date(iso);
  return isNaN(d)
    ? ""
    : `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
}

let tiempoToast;
function aviso(mensaje, malo = false) {
  S.toast = { mensaje, malo };
  pintar();
  clearTimeout(tiempoToast);
  tiempoToast = setTimeout(() => {
    S.toast = null;
    pintar();
  }, malo ? 4200 : 2300);
}

/* --------------------------- llamadas al servidor --------------------------- */

async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(opciones.headers || {}) },
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  let datos = {};
  try {
    datos = await res.json();
  } catch {}
  if (!res.ok) {
    const e = new Error(datos.error || "No se pudo completar la operación.");
    e.estado = res.status;
    e.datos = datos;
    throw e;
  }
  return datos;
}

async function cargarDatos() {
  const d = await api("/api/datos");
  S.yo = d.yo;
  S.salas = d.salas || [];
  S.equipo = d.equipo || [];
  S.tareas = d.tareas || [];
}

/* ------------------------------- permisos ------------------------------- */

const esDirector = () => S.yo?.rol === "director";
const esEncargado = () => S.yo?.rol === "encargado";
const esTecnico = () => S.yo?.rol === "tecnico";
const puedeAsignar = () => esDirector() || esEncargado();

function misSalas() {
  if (!S.yo) return [];
  if (esDirector()) return S.salas;
  const mias = S.yo.salas || [];
  return mias.length ? S.salas.filter((s) => mias.includes(s.id)) : S.salas;
}
function gestionaTarea(t) {
  if (esDirector()) return true;
  return esEncargado() && misSalas().some((s) => s.id === t.sala);
}
function avanzaTarea(t) {
  if (gestionaTarea(t)) return true;
  if (!esTecnico()) return false;
  return t.asignadoA === S.yo.id || (!t.asignadoA && misSalas().some((s) => s.id === t.sala));
}

/* ================================ PINTADO ================================ */

function pintar() {
  let html = "";
  if (S.vista === "cargando") html = `<div class="cargando"><span class="giro"></span>Cargando…</div>`;
  else if (S.vista === "acceso") html = vistaAcceso();
  else html = vistaApp();

  if (S.hoja) html += S.hoja.html();
  if (S.toast) html += `<div class="toast ${S.toast.malo ? "malo" : ""}">${esc(S.toast.mensaje)}</div>`;
  raiz.innerHTML = html;

  const foco = raiz.querySelector("[data-autofoco]");
  if (foco) foco.focus();
}

const LOGO = `<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="var(--surface-2)"/><path d="M13 33l11-19 11 19z" fill="var(--accent)"/><circle cx="24" cy="29" r="3" fill="var(--surface-2)"/></svg>`;

const ICONO_BORRAR = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 12z"/><path d="M15 9l-4 6M11 9l4 6"/></svg>`;

/* ----------------------------- acceso ----------------------------- */

function vistaAcceso() {
  const a = S.acceso;
  if (a.paso === "setup") return vistaSetup();
  if (a.paso === "lista") return vistaListaPersonas();
  return vistaPinPad();
}

function vistaListaPersonas() {
  const personas = S.acceso.personas;
  let cuerpo;
  if (!personas.length) {
    cuerpo = `<div class="empty"><b>Sin personas</b>Todavía no hay nadie dado de alta en la aplicación.</div>`;
  } else {
    const grupos = [
      ["director", "Dirección"],
      ["encargado", "Encargados"],
      ["tecnico", "Técnicos"],
    ];
    cuerpo = `<div class="personas">${grupos
      .map(([rol, etiqueta]) => {
        const gente = personas.filter((p) => p.rol === rol);
        if (!gente.length) return "";
        return (
          `<div class="grupo-label">${esc(etiqueta)}</div>` +
          gente
            .map((p) => {
              const sub = p.estrena
                ? "Primer acceso"
                : p.rol === "tecnico"
                ? AREAS[p.especialidad] || "Técnico/a"
                : ROLES[p.rol];
              return `<button class="persona ${p.rol === "director" ? "director" : ""}" data-persona="${esc(p.id)}">
                <span class="avatar">${esc(iniciales(p.nombre))}</span>
                <span style="min-width:0"><b>${esc(p.nombre)}</b>
                <small class="${p.estrena ? "nuevo" : ""}">${esc(sub)}</small></span></button>`;
            })
            .join("")
        );
      })
      .join("")}</div>`;
  }

  return `<div class="acceso"><div class="acceso-caja">
    <div class="marca">${LOGO}<b>Parte de Salas</b><p>Elige tu nombre para entrar.</p></div>
    ${cuerpo}
  </div></div>`;
}

function vistaPinPad() {
  const a = S.acceso;
  const p = a.persona;
  const titulos = {
    pin: { titulo: p?.nombre || "", pie: "Introduce tu código de 4 dígitos" },
    nuevo1: { titulo: "Tu código", pie: "Elige un código de 4 dígitos. Solo lo sabrás tú." },
    nuevo2: { titulo: "Repítelo", pie: "Escribe otra vez el mismo código." },
  };
  const t = titulos[a.paso] || titulos.pin;
  const mensaje = S.pad.mensaje || t.pie;

  const puntos = Array.from({ length: 4 }, (_, i) => `<i class="${i < S.pad.valor.length ? "on" : ""}"></i>`).join("");
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "borrar"];

  const cabecera =
    a.paso === "pin" && p
      ? `<div class="pin-cabecera">
          <span class="avatar ${p.rol === "director" ? "director" : ""}">${esc(iniciales(p.nombre))}</span>
          <b>${esc(p.nombre)}</b></div>`
      : `<div class="pin-cabecera">${LOGO}<b>${esc(t.titulo)}</b></div>`;

  const pie =
    a.paso === "pin"
      ? `<button class="btn ghost" data-accion="volver-lista">← Cambiar de usuario</button>`
      : a.paso === "nuevo2"
      ? `<button class="btn ghost" data-accion="reiniciar-nuevo">← Empezar de nuevo</button>`
      : `<button class="btn ghost" data-accion="salir-sesion">Salir</button>`;

  return `<div class="acceso"><div class="acceso-caja">
    ${cabecera}
    <p class="pin-mensaje ${S.pad.error ? "error" : ""}">${esc(mensaje)}</p>
    <div class="puntos ${S.pad.error ? "error" : ""}">${puntos}</div>
    <div class="teclado">${teclas
      .map((k) => {
        if (k === "") return `<span class="tecla vacia"></span>`;
        if (k === "borrar")
          return `<button class="tecla accion" data-tecla="borrar" aria-label="Borrar"${
            S.pad.valor ? "" : " disabled"
          }>${ICONO_BORRAR}</button>`;
        return `<button class="tecla" data-tecla="${k}"${S.pad.ocupado ? " disabled" : ""}>${k}</button>`;
      })
      .join("")}</div>
    <div class="acceso-pie">${pie}</div>
  </div></div>`;
}

function vistaSetup() {
  return `<div class="acceso"><div class="acceso-caja">
    <div class="marca">${LOGO}<b>Primera configuración</b>
      <p>Crea tu usuario de dirección. Esto solo se hace una vez.</p></div>
    ${S.setup.error ? `<div class="aviso-error" style="margin-bottom:14px">${esc(S.setup.error)}</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label>Código de configuración</label>
        <input id="su-token" type="password" autocomplete="off" placeholder="El valor de SETUP_TOKEN" data-autofoco></div>
      <div class="field"><label>Tu nombre</label>
        <input id="su-nombre" autocomplete="name" placeholder="Nombre y apellido"></div>
      <div class="field"><label>Tu código de acceso (4 dígitos)</label>
        <input id="su-codigo" inputmode="numeric" maxlength="4" class="mono"
               style="letter-spacing:.5em;max-width:140px;font-size:19px" placeholder="····"></div>
      <button class="btn primary" data-accion="hacer-setup" style="justify-content:center;padding:11px">
        Crear y entrar</button>
      <div class="note">Se crearán también las cinco salas iniciales. Podrás añadir, renombrar o borrar salas después.</div>
    </div>
  </div></div>`;
}

/* ------------------------------ aplicación ------------------------------ */

function pestanas() {
  if (esDirector()) return [["resumen", "Resumen"], ["tareas", "Tareas"], ["equipo", "Equipo"], ["salas", "Salas"]];
  if (esEncargado()) return [["resumen", "Resumen"], ["tareas", "Tareas"]];
  return [["mias", "Mis tareas"], ["sala", "Mi sala"]];
}

function vistaApp() {
  const tabs = pestanas();
  if (!tabs.some((t) => t[0] === S.tab)) S.tab = tabs[0][0];

  const cuerpo =
    S.tab === "resumen"
      ? vistaResumen()
      : S.tab === "tareas"
      ? vistaTareas(S.tareas, true)
      : S.tab === "equipo"
      ? vistaEquipo()
      : S.tab === "salas"
      ? vistaSalas()
      : S.tab === "mias"
      ? vistaMias()
      : vistaTareas(tareasDeMisSalas(), false);

  return `<header class="bar"><div class="wrap">
      <div class="bar-in">
        <div class="brand"><b>Parte de Salas</b><span>${esc(ROLES[S.yo.rol])}</span></div>
        <div class="who"><b>${esc(S.yo.nombre)}</b>
          <button class="iconbtn" data-accion="menu-yo" title="Opciones" aria-label="Opciones">⋯</button></div>
      </div>
      <nav class="tabs" role="tablist">${tabs
        .map((t) => `<button role="tab" data-tab="${t[0]}" aria-selected="${S.tab === t[0]}">${esc(t[1])}</button>`)
        .join("")}</nav>
    </div></header>
    <main class="wrap">${cuerpo}</main>`;
}

const tareasDeMisSalas = () => {
  const ids = misSalas().map((s) => s.id);
  return S.tareas.filter((t) => ids.includes(t.sala));
};

function botonNuevo(etiqueta) {
  return `<button class="fab" data-accion="nueva-tarea">＋ ${esc(etiqueta || "Nueva tarea")}</button>`;
}

function vistaResumen() {
  const salas = misSalas();
  const tarjetas = salas
    .map((s) => {
      const ts = S.tareas.filter((t) => t.sala === s.id);
      const abiertas = ts.filter((t) => t.estado !== "hecha");
      const curso = abiertas.filter((t) => t.estado === "en_curso");
      const urgentes = abiertas.filter((t) => t.prioridad === "urgente" || t.prioridad === "alta" || vencida(t));
      return `<button class="sala-card" data-ir-sala="${esc(s.id)}">
        <div><span class="tipo">${esc(s.tipo || "")}</span><h3>${esc(s.nombre)}</h3></div>
        <div class="counts">
          <span class="count"><b class="mono">${abiertas.length}</b><span>Abiertas</span></span>
          <span class="count"><b class="mono">${curso.length}</b><span>En curso</span></span>
          <span class="count ${urgentes.length ? "alerta" : ""}"><b class="mono">${urgentes.length}</b><span>Prioridad</span></span>
        </div></button>`;
    })
    .join("");

  const abiertas = S.tareas.filter((t) => t.estado !== "hecha");
  const sinAsignar = abiertas.filter((t) => !t.asignadoA);
  const atrasadas = abiertas.filter(vencida);
  const avisos =
    sinAsignar.length || atrasadas.length
      ? `<div class="panel" style="margin-bottom:18px"><div class="panel-b" style="display:flex;gap:10px;flex-wrap:wrap">
          ${atrasadas.length ? `<button class="btn sm danger" data-ver="atrasadas">${atrasadas.length} fuera de plazo</button>` : ""}
          ${sinAsignar.length ? `<button class="btn sm" data-ver="sinasignar">${sinAsignar.length} sin asignar</button>` : ""}
        </div></div>`
      : "";

  const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `<div class="eyebrow" style="margin-bottom:10px">Parte del ${esc(fecha)}</div>
    ${avisos}<div class="salas-grid">${tarjetas}</div>${botonNuevo()}`;
}

function vistaTareas(lista, conSalas) {
  const f = S.filtro;
  let out = lista.slice();
  if (f.estado === "abiertas") out = out.filter((t) => t.estado !== "hecha");
  else if (f.estado === "atrasadas") out = out.filter(vencida);
  else if (f.estado === "sinasignar") out = out.filter((t) => !t.asignadoA && t.estado !== "hecha");
  else if (f.estado !== "todas") out = out.filter((t) => t.estado === f.estado);
  if (f.sala) out = out.filter((t) => t.sala === f.sala);
  if (f.area) out = out.filter((t) => t.area === f.area);

  out.sort((a, b) => {
    if ((a.estado === "hecha") !== (b.estado === "hecha")) return a.estado === "hecha" ? 1 : -1;
    const va = vencida(a) ? 0 : 1, vb = vencida(b) ? 0 : 1;
    if (va !== vb) return va - vb;
    if (ORDEN_PRIO[a.prioridad] !== ORDEN_PRIO[b.prioridad]) return ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad];
    return String(b.creadoEn || "").localeCompare(String(a.creadoEn || ""));
  });

  const estados = [
    ["abiertas", "Abiertas"], ["en_curso", "En curso"], ["bloqueada", "Bloqueadas"],
    ["atrasadas", "Fuera de plazo"], ["hecha", "Hechas"], ["todas", "Todas"],
  ];
  let html = `<div class="filters">${estados
    .map((c) => `<button class="chip" data-f-estado="${c[0]}" aria-pressed="${f.estado === c[0]}">${esc(c[1])}</button>`)
    .join("")}</div>`;

  if (conSalas && misSalas().length > 1) {
    html += `<div class="filters">
      <button class="chip" data-f-sala="" aria-pressed="${!f.sala}">Todas las salas</button>
      ${misSalas()
        .map((s) => `<button class="chip" data-f-sala="${esc(s.id)}" aria-pressed="${f.sala === s.id}">${esc(s.nombre)}</button>`)
        .join("")}</div>`;
  }
  html += `<div class="filters">
    <button class="chip" data-f-area="" aria-pressed="${!f.area}">Todas las áreas</button>
    ${Object.entries(AREAS)
      .map(([k, v]) => `<button class="chip" data-f-area="${k}" aria-pressed="${f.area === k}">${esc(v)}</button>`)
      .join("")}</div>`;

  html += out.length
    ? `<div class="tasks">${out.map(tarjetaTarea).join("")}</div>`
    : `<div class="empty"><b>Sin tareas aquí</b>Cambia el filtro o crea una nueva.</div>`;
  return html + botonNuevo();
}

function tarjetaTarea(t) {
  const asign = t.asignadoA ? personaNombre(t.asignadoA) : null;
  const destacada = t.prioridad === "urgente" || t.prioridad === "alta";
  return `<button class="task" data-abrir="${esc(t.id)}" data-pr="${esc(t.prioridad)}" data-hecha="${t.estado === "hecha" ? 1 : 0}">
    <span class="stripe"></span><span class="task-in">
      <span class="task-top">
        <span class="pill st-${esc(t.estado)}"><i class="dot"></i>${esc(ESTADOS[t.estado] || t.estado)}</span>
        <span class="area">${esc(AREAS[t.area] || "")}</span>
        ${destacada ? `<span class="pill pr-${esc(t.prioridad)}" style="background:transparent;padding-left:0">▲ ${esc(PRIOS[t.prioridad])}</span>` : ""}
      </span>
      <span class="task-title">${esc(t.titulo)}</span>
      <span class="task-meta">
        <span class="sala-tag">${esc(salaNombre(t.sala))}</span>
        ${asign ? `<span>· ${esc(asign)}</span>` : `<span class="sin-asignar">· Sin asignar</span>`}
        ${t.vence ? `<span class="vence mono ${vencida(t) ? "late" : ""}">· ${vencida(t) ? "Venció " : ""}${esc(fechaCorta(t.vence))}</span>` : ""}
      </span></span></button>`;
}

function vistaMias() {
  const mias = S.tareas.filter((t) => t.asignadoA === S.yo.id);
  const abiertas = mias.filter((t) => t.estado !== "hecha");
  const libres = S.tareas.filter((t) => !t.asignadoA && t.estado !== "hecha");
  const hechas = mias.filter((t) => t.estado === "hecha").slice(0, 12);

  abiertas.sort((a, b) => {
    const va = vencida(a) ? 0 : 1, vb = vencida(b) ? 0 : 1;
    if (va !== vb) return va - vb;
    return ORDEN_PRIO[a.prioridad] - ORDEN_PRIO[b.prioridad];
  });

  let html = `<div class="eyebrow" style="margin-bottom:10px">Asignadas a ti · ${abiertas.length} abierta${abiertas.length === 1 ? "" : "s"}</div>`;
  html += abiertas.length
    ? `<div class="tasks">${abiertas.map(tarjetaTarea).join("")}</div>`
    : `<div class="empty"><b>Todo al día</b>No tienes tareas abiertas.</div>`;
  if (libres.length) {
    html += `<div class="eyebrow" style="margin:26px 0 10px">Sin asignar en tus salas</div>
      <div class="tasks">${libres.map(tarjetaTarea).join("")}</div>`;
  }
  if (hechas.length) {
    html += `<div class="eyebrow" style="margin:26px 0 10px">Cerradas recientemente</div>
      <div class="tasks">${hechas.map(tarjetaTarea).join("")}</div>`;
  }
  return html + botonNuevo("Reportar avería");
}

function vistaEquipo() {
  const orden = { director: 0, encargado: 1, tecnico: 2 };
  const lista = S.equipo.slice().sort((a, b) => (orden[a.rol] - orden[b.rol]) || a.nombre.localeCompare(b.nombre, "es"));
  return `<div class="panel"><div class="panel-h"><h2>Equipo</h2>
      <button class="btn sm primary" data-accion="nueva-persona">＋ Añadir</button></div>
    <div class="tablewrap"><table class="team"><thead><tr>
      <th>Nombre</th><th>Rol</th><th>Salas</th><th>Abiertas</th><th></th></tr></thead><tbody>
      ${lista
        .map((p) => {
          const salas = p.rol === "director" ? "Todas" : (p.salas?.length ? p.salas.map(salaNombre).join(", ") : "Todas");
          const ab = S.tareas.filter((t) => t.asignadoA === p.id && t.estado !== "hecha").length;
          return `<tr${p.activo === false ? ' style="opacity:.5"' : ""}>
            <td><b>${esc(p.nombre)}</b>${p.activo === false ? ' <span class="area">(inactivo)</span>' : ""}
              ${p.debeElegirCodigo ? ' <span class="area" style="color:var(--accent)">· código sin estrenar</span>' : ""}</td>
            <td>${esc(ROLES[p.rol])}${p.rol === "tecnico" && p.especialidad ? `<br><span class="area">${esc(AREAS[p.especialidad])}</span>` : ""}</td>
            <td style="font-size:12.5px;color:var(--text-2)">${esc(salas)}</td>
            <td class="mono">${ab}</td>
            <td style="text-align:right"><button class="btn sm ghost" data-editar-persona="${esc(p.id)}">Editar</button></td>
          </tr>`;
        })
        .join("")}
    </tbody></table></div>
    <div class="panel-b"><div class="note">Al dar de alta a alguien verás un código de un solo uso. Pásaselo: la primera vez que entre, la aplicación le pedirá que elija el suyo propio, que ya nadie más podrá ver.</div></div>
  </div>`;
}

function vistaSalas() {
  return `<div class="panel"><div class="panel-h"><h2>Salas</h2>
      <button class="btn sm primary" data-accion="nueva-sala">＋ Añadir</button></div>
    <div class="tablewrap"><table class="team"><thead><tr>
      <th>Sala</th><th>Tipo</th><th>Abiertas</th><th></th></tr></thead><tbody>
      ${S.salas
        .map((s) => {
          const ab = S.tareas.filter((t) => t.sala === s.id && t.estado !== "hecha").length;
          return `<tr><td><b>${esc(s.nombre)}</b></td><td style="color:var(--text-2)">${esc(s.tipo || "")}</td>
            <td class="mono">${ab}</td>
            <td style="text-align:right"><button class="btn sm ghost" data-editar-sala="${esc(s.id)}">Editar</button></td></tr>`;
        })
        .join("")}
    </tbody></table></div></div>`;
}

/* -------------------------------- hojas -------------------------------- */

const cerrarHoja = () => {
  S.hoja = null;
  pintar();
};

function hojaTarea(id) {
  return {
    tipo: "tarea",
    id,
    html() {
      const t = porId(S.tareas, id);
      if (!t) return "";
      const gestiona = gestionaTarea(t);
      const avanza = avanzaTarea(t);
      const hist = (t.historial || []).slice().reverse();
      const gente = S.equipo.filter((p) => p.activo !== false && p.rol !== "director");

      return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Detalle de tarea">
        <div class="sheet-h"><h2>Tarea</h2>
          ${gestiona ? `<button class="btn sm ghost" data-accion="editar-tarea">Editar</button>` : ""}
          <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
        <div class="sheet-b">
          <div>
            <div class="row" style="gap:8px;margin-bottom:8px">
              <span class="sala-tag">${esc(salaNombre(t.sala))}</span>
              <span class="area">${esc(AREAS[t.area] || "")}</span>
              <span class="pill pr-${esc(t.prioridad)}" style="background:var(--surface-2)">${esc(PRIOS[t.prioridad])}</span>
            </div>
            <h2 style="font-size:20px;text-transform:none;letter-spacing:0">${esc(t.titulo)}</h2>
            ${t.detalle ? `<p style="color:var(--text-2);margin:9px 0 0;font-size:14px;white-space:pre-wrap">${esc(t.detalle)}</p>` : ""}
          </div>
          <div class="grid2">
            <div class="field"><label>Asignada a</label>
              ${
                gestiona && puedeAsignar()
                  ? `<select id="f-asign" data-campo="asignadoA"><option value="">— Sin asignar —</option>
                      ${gente.map((p) => `<option value="${esc(p.id)}"${t.asignadoA === p.id ? " selected" : ""}>${esc(p.nombre)}${p.especialidad ? " · " + esc(AREAS[p.especialidad]) : ""}</option>`).join("")}
                     </select>`
                  : `<div style="padding-top:4px">${esc(personaNombre(t.asignadoA) || "Sin asignar")}</div>`
              }
            </div>
            <div class="field"><label>Fecha límite</label>
              ${
                gestiona
                  ? `<input type="date" id="f-vence" value="${esc(t.vence || "")}" data-campo="vence">`
                  : `<div style="padding-top:4px" class="mono ${vencida(t) ? "vence late" : ""}">${esc(t.vence || "—")}</div>`
              }
            </div>
          </div>
          ${
            avanza
              ? `<div><label class="eyebrow" style="display:block;margin-bottom:7px">Cambiar estado</label>
                  <div class="statusrow">${Object.entries(ESTADOS)
                    .map(([k, v]) => `<button class="st-${k}" data-estado="${k}" aria-pressed="${t.estado === k}">${esc(v)}</button>`)
                    .join("")}</div></div>`
              : ""
          }
          ${
            avanza
              ? `<div class="field"><label>Añadir nota de trabajo</label>
                  <textarea id="f-nota" placeholder="Qué has hecho, qué falta, material necesario…"></textarea>
                  <div class="row" style="justify-content:flex-end">
                    <button class="btn primary sm" data-accion="guardar-nota">Guardar nota</button></div></div>`
              : ""
          }
          ${
            hist.length
              ? `<div><label class="eyebrow" style="display:block;margin-bottom:9px">Historial</label>
                  <div class="hist">${hist
                    .map(
                      (h) => `<div class="hist-item"><div class="h-meta"><b>${esc(h.quien || "—")}</b>
                        <span class="mono">${esc(fechaHora(h.ts))}</span></div><div>${esc(h.texto)}</div></div>`
                    )
                    .join("")}</div></div>`
              : ""
          }
          <div class="row" style="justify-content:space-between;padding-top:4px">
            <span class="mono" style="font-size:11px;color:var(--text-3)">Creada por ${esc(personaNombre(t.creadoPor) || "—")} · ${esc(fechaCorta(t.creadoEn))}</span>
            ${gestiona ? `<button class="btn sm danger" data-accion="borrar-tarea">Eliminar</button>` : ""}
          </div>
        </div></div></div>`;
    },
  };
}

function hojaFormTarea(id) {
  return {
    tipo: "form-tarea",
    id: id || null,
    html() {
      const t = id ? porId(S.tareas, id) : null;
      const salas = misSalas();
      const salaDef = t ? t.sala : S.filtro.sala || salas[0]?.id || "";
      const areaDef = t ? t.area : esTecnico() ? S.yo.especialidad || "general" : "luces";
      const gente = S.equipo.filter((p) => p.activo !== false && p.rol !== "director");
      const reporta = esTecnico();

      return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Formulario de tarea">
        <div class="sheet-h"><h2>${t ? "Editar tarea" : reporta ? "Reportar avería" : "Nueva tarea"}</h2>
          <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
        <div class="sheet-b">
          <div class="field"><label>Título</label>
            <input id="n-titulo" value="${esc(t?.titulo || "")}" data-autofoco
              placeholder="Ej. Cabeza móvil del escenario no responde a DMX"></div>
          <div class="grid2">
            <div class="field"><label>Sala</label><select id="n-sala">
              ${salas.map((s) => `<option value="${esc(s.id)}"${salaDef === s.id ? " selected" : ""}>${esc(s.nombre)}</option>`).join("")}
            </select></div>
            <div class="field"><label>Área</label><select id="n-area">
              ${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${areaDef === k ? " selected" : ""}>${esc(v)}</option>`).join("")}
            </select></div>
          </div>
          <div class="field"><label>Detalle</label>
            <textarea id="n-detalle" placeholder="Síntoma, ubicación exacta, material necesario…">${esc(t?.detalle || "")}</textarea></div>
          <div class="grid2">
            <div class="field"><label>Prioridad</label><select id="n-prio">
              ${Object.entries(PRIOS).map(([k, v]) => `<option value="${k}"${(t?.prioridad || "media") === k ? " selected" : ""}>${esc(v)}</option>`).join("")}
            </select></div>
            <div class="field"><label>Fecha límite</label>
              <input type="date" id="n-vence" value="${esc(t?.vence || "")}"></div>
          </div>
          ${
            puedeAsignar()
              ? `<div class="field"><label>Asignar a</label><select id="n-asign">
                  <option value="">— Sin asignar —</option>
                  ${gente.map((p) => `<option value="${esc(p.id)}"${t?.asignadoA === p.id ? " selected" : ""}>${esc(p.nombre)}${p.especialidad ? " · " + esc(AREAS[p.especialidad]) : ""}</option>`).join("")}
                </select></div>`
              : `<div class="note">Llegará a dirección y al encargado de la sala para que la asignen.</div>`
          }
          <div class="row" style="justify-content:flex-end">
            <button class="btn ghost" data-accion="cerrar">Cancelar</button>
            <button class="btn primary" data-accion="guardar-tarea">${t ? "Guardar cambios" : "Crear tarea"}</button>
          </div>
        </div></div></div>`;
    },
  };
}

function hojaPersona(id) {
  const p = id ? porId(S.equipo, id) : null;
  return {
    tipo: "persona",
    id: id || null,
    salasSel: p ? (p.salas || []).slice() : [],
    codigoNuevo: null,
    html() {
      if (this.codigoNuevo) {
        return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Código de acceso">
          <div class="sheet-h"><h2>Código de un solo uso</h2>
            <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
          <div class="sheet-b">
            <p style="margin:0;color:var(--text-2);font-size:14px">Pásale este código a
              <b style="color:var(--text)">${esc(this.codigoNuevo.nombre)}</b>. Al entrar por primera vez
              la aplicación le pedirá que elija su propio código.</p>
            <div class="codigo-grande">${esc(this.codigoNuevo.codigo)}</div>
            <div class="note">No se vuelve a mostrar. Si se pierde, entra en su ficha y pulsa “Generar código nuevo”.</div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn primary" data-accion="cerrar">Entendido</button></div>
          </div></div></div>`;
      }
      const salasSel = this.salasSel;
      return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Ficha de persona">
        <div class="sheet-h"><h2>${p ? "Editar persona" : "Añadir al equipo"}</h2>
          <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
        <div class="sheet-b">
          <div class="field"><label>Nombre</label>
            <input id="p-nombre" value="${esc(p?.nombre || "")}" placeholder="Nombre y apellido" data-autofoco></div>
          <div class="grid2">
            <div class="field"><label>Rol</label><select id="p-rol">
              ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${(p?.rol || "tecnico") === k ? " selected" : ""}>${esc(v)}</option>`).join("")}
            </select></div>
            <div class="field"><label>Especialidad (técnicos)</label><select id="p-esp">
              <option value="">—</option>
              ${Object.entries(AREAS).map(([k, v]) => `<option value="${k}"${(p?.especialidad || "") === k ? " selected" : ""}>${esc(v)}</option>`).join("")}
            </select></div>
          </div>
          <div class="field"><label>Salas a su cargo</label>
            <div class="row" style="gap:7px">${S.salas
              .map((s) => `<button type="button" class="chip" data-toggle-sala="${esc(s.id)}" aria-pressed="${salasSel.includes(s.id)}">${esc(s.nombre)}</button>`)
              .join("")}</div>
            <div class="note" style="margin-top:6px">Sin ninguna marcada, verá todas las salas.</div>
          </div>
          ${
            p
              ? `<div class="field"><label>Estado</label><select id="p-activo">
                  <option value="1"${p.activo !== false ? " selected" : ""}>Activo</option>
                  <option value="0"${p.activo === false ? " selected" : ""}>Inactivo (no puede entrar)</option></select></div>
                 <button class="btn sm" data-accion="reiniciar-codigo">Generar código nuevo</button>`
              : `<div class="note">Al guardar verás un código de un solo uso para dárselo.</div>`
          }
          <div class="row" style="justify-content:space-between">
            ${p && p.id !== S.yo.id ? `<button class="btn sm danger" data-accion="borrar-persona">Eliminar</button>` : "<span></span>"}
            <span><button class="btn ghost" data-accion="cerrar">Cancelar</button>
            <button class="btn primary" data-accion="guardar-persona">Guardar</button></span>
          </div>
        </div></div></div>`;
    },
  };
}

function hojaSala(id) {
  const s = id ? porId(S.salas, id) : null;
  return {
    tipo: "sala",
    id: id || null,
    html() {
      return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Ficha de sala">
        <div class="sheet-h"><h2>${s ? "Editar sala" : "Nueva sala"}</h2>
          <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
        <div class="sheet-b">
          <div class="field"><label>Nombre</label>
            <input id="s-nombre" value="${esc(s?.nombre || "")}" placeholder="Ej. Sala New York" data-autofoco></div>
          <div class="field"><label>Tipo</label>
            <input id="s-tipo" value="${esc(s?.tipo || "")}" placeholder="Discoteca / Bar musical / Local de espectáculos"></div>
          <div class="row" style="justify-content:space-between">
            ${s ? `<button class="btn sm danger" data-accion="borrar-sala">Eliminar</button>` : "<span></span>"}
            <span><button class="btn ghost" data-accion="cerrar">Cancelar</button>
            <button class="btn primary" data-accion="guardar-sala">Guardar</button></span>
          </div>
        </div></div></div>`;
    },
  };
}

function hojaOpciones() {
  return {
    tipo: "opciones",
    html() {
      return `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-label="Opciones">
        <div class="sheet-h"><h2>${esc(S.yo.nombre)}</h2>
          <button class="iconbtn" data-accion="cerrar" aria-label="Cerrar">✕</button></div>
        <div class="sheet-b">
          <div class="note">${esc(ROLES[S.yo.rol])}${S.yo.especialidad ? " · " + esc(AREAS[S.yo.especialidad]) : ""}</div>
          <button class="btn" data-accion="cambiar-codigo" style="justify-content:center">Cambiar mi código</button>
          <button class="btn danger" data-accion="salir-sesion" style="justify-content:center">Cerrar sesión</button>
        </div></div></div>`;
    },
  };
}

/* =============================== ACCIONES =============================== */

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest(
    "[data-persona],[data-tecla],[data-accion],[data-tab],[data-abrir],[data-estado]," +
      "[data-f-estado],[data-f-sala],[data-f-area],[data-ir-sala],[data-ver]," +
      "[data-editar-persona],[data-editar-sala],[data-toggle-sala],[data-scrim]"
  );
  if (!el) return;

  if (el.hasAttribute("data-scrim")) {
    if (ev.target === el) cerrarHoja();
    return;
  }

  if (el.hasAttribute("data-persona")) return elegirPersona(el.getAttribute("data-persona"));
  if (el.hasAttribute("data-tecla")) return pulsarTecla(el.getAttribute("data-tecla"));
  if (el.hasAttribute("data-tab")) { S.tab = el.getAttribute("data-tab"); return pintar(); }
  if (el.hasAttribute("data-abrir")) { S.hoja = hojaTarea(el.getAttribute("data-abrir")); return pintar(); }
  if (el.hasAttribute("data-f-estado")) { S.filtro.estado = el.getAttribute("data-f-estado"); return pintar(); }
  if (el.hasAttribute("data-f-sala")) { S.filtro.sala = el.getAttribute("data-f-sala"); return pintar(); }
  if (el.hasAttribute("data-f-area")) { S.filtro.area = el.getAttribute("data-f-area"); return pintar(); }
  if (el.hasAttribute("data-ir-sala")) {
    S.filtro.sala = el.getAttribute("data-ir-sala"); S.filtro.estado = "abiertas"; S.tab = "tareas"; return pintar();
  }
  if (el.hasAttribute("data-ver")) {
    S.filtro.estado = el.getAttribute("data-ver"); S.filtro.sala = ""; S.tab = "tareas"; return pintar();
  }
  if (el.hasAttribute("data-editar-persona")) { S.hoja = hojaPersona(el.getAttribute("data-editar-persona")); return pintar(); }
  if (el.hasAttribute("data-editar-sala")) { S.hoja = hojaSala(el.getAttribute("data-editar-sala")); return pintar(); }
  if (el.hasAttribute("data-toggle-sala")) {
    const sid = el.getAttribute("data-toggle-sala");
    const arr = S.hoja.salasSel;
    const i = arr.indexOf(sid);
    if (i >= 0) arr.splice(i, 1); else arr.push(sid);
    el.setAttribute("aria-pressed", String(i < 0));
    return;
  }
  if (el.hasAttribute("data-estado")) return cambiarEstado(el.getAttribute("data-estado"));

  switch (el.getAttribute("data-accion")) {
    case "cerrar": return cerrarHoja();
    case "volver-lista": return volverALista();
    case "reiniciar-nuevo": S.acceso.paso = "nuevo1"; S.acceso.primerNuevo = ""; S.pad = { valor: "", mensaje: "", error: false, ocupado: false }; return pintar();
    case "salir-sesion": return salir();
    case "menu-yo": S.hoja = hojaOpciones(); return pintar();
    case "cambiar-codigo": return pedirCambioCodigo();
    case "hacer-setup": return hacerSetup();
    case "nueva-tarea": S.hoja = hojaFormTarea(null); return pintar();
    case "editar-tarea": S.hoja = hojaFormTarea(S.hoja.id); return pintar();
    case "guardar-tarea": return guardarTarea();
    case "borrar-tarea": return borrarTarea();
    case "guardar-nota": return guardarNota();
    case "nueva-persona": S.hoja = hojaPersona(null); return pintar();
    case "guardar-persona": return guardarPersona();
    case "borrar-persona": return borrarPersona();
    case "reiniciar-codigo": return reiniciarCodigo();
    case "nueva-sala": S.hoja = hojaSala(null); return pintar();
    case "guardar-sala": return guardarSala();
    case "borrar-sala": return borrarSala();
  }
});

document.addEventListener("change", (ev) => {
  const campo = ev.target.getAttribute?.("data-campo");
  if (campo === "asignadoA") reasignar(ev.target.value);
  if (campo === "vence") cambiarVence(ev.target.value);
});

document.addEventListener("keydown", (ev) => {
  if (S.vista === "acceso" && S.acceso.paso !== "lista" && S.acceso.paso !== "setup") {
    if (/^[0-9]$/.test(ev.key)) { ev.preventDefault(); pulsarTecla(ev.key); }
    else if (ev.key === "Backspace") { ev.preventDefault(); pulsarTecla("borrar"); }
  }
  if (ev.key === "Escape" && S.hoja) cerrarHoja();
});

/* ------------------------------ acceso ------------------------------ */

function reiniciarPad(mensaje = "") {
  S.pad = { valor: "", mensaje, error: false, ocupado: false };
}

function elegirPersona(id) {
  S.acceso.persona = S.acceso.personas.find((p) => p.id === id) || null;
  S.acceso.paso = "pin";
  reiniciarPad();
  pintar();
}

function volverALista() {
  S.acceso.paso = "lista";
  S.acceso.persona = null;
  reiniciarPad();
  pintar();
}

async function pulsarTecla(tecla) {
  if (S.pad.ocupado) return;
  if (tecla === "borrar") {
    S.pad.valor = S.pad.valor.slice(0, -1);
    S.pad.error = false;
    S.pad.mensaje = "";
    return pintar();
  }
  if (S.pad.valor.length >= 4) return;
  S.pad.valor += tecla;
  S.pad.error = false;
  S.pad.mensaje = "";
  pintar();
  if (navigator.vibrate) { try { navigator.vibrate(8); } catch {} }
  if (S.pad.valor.length === 4) await completarPad(S.pad.valor);
}

function fallarPad(mensaje) {
  S.pad = { valor: "", mensaje, error: true, ocupado: false };
  pintar();
}

async function completarPad(codigo) {
  const a = S.acceso;
  S.pad.ocupado = true;
  pintar();

  if (a.paso === "pin") {
    try {
      const r = await api("/api/login", { method: "POST", cuerpo: { personaId: a.persona.id, codigo } });
      a.codigoTemporal = codigo;
      if (r.yo?.debeElegirCodigo) {
        a.paso = "nuevo1";
        a.primerNuevo = "";
        reiniciarPad();
        return pintar();
      }
      return await entrar();
    } catch (e) {
      return fallarPad(e.message);
    }
  }

  if (a.paso === "nuevo1") {
    if (codigo === a.codigoTemporal) return fallarPad("Elige un código distinto del que te dieron.");
    a.primerNuevo = codigo;
    a.paso = "nuevo2";
    reiniciarPad();
    return pintar();
  }

  if (a.paso === "nuevo2") {
    if (codigo !== a.primerNuevo) {
      a.paso = "nuevo1";
      a.primerNuevo = "";
      return fallarPad("No coinciden. Empieza otra vez.");
    }
    try {
      await api("/api/pin", { method: "POST", cuerpo: { codigoActual: a.codigoTemporal, codigoNuevo: codigo } });
      a.codigoTemporal = codigo;
      await entrar();
      aviso("Código guardado. Solo lo sabes tú.");
    } catch (e) {
      a.paso = "nuevo1";
      a.primerNuevo = "";
      fallarPad(e.message);
    }
  }
}

async function entrar() {
  await cargarDatos();
  S.vista = "app";
  S.tab = "";
  S.acceso.paso = "lista";
  reiniciarPad();
  pintar();
}

function pedirCambioCodigo() {
  S.hoja = null;
  S.vista = "acceso";
  S.acceso.persona = { id: S.yo.id, nombre: S.yo.nombre, rol: S.yo.rol };
  S.acceso.paso = "nuevo1";
  S.acceso.primerNuevo = "";
  S.acceso.codigoTemporal = "";
  reiniciarPad("Elige tu código nuevo de 4 dígitos.");
  pintar();
}

async function salir() {
  try { await api("/api/logout", { method: "POST" }); } catch {}
  S.yo = null; S.hoja = null; S.tareas = []; S.equipo = []; S.salas = [];
  await mostrarAcceso();
}

async function mostrarAcceso() {
  S.vista = "acceso";
  S.acceso.paso = "lista";
  S.acceso.persona = null;
  reiniciarPad();
  pintar();
  try {
    const { personas } = await api("/api/personas");
    S.acceso.personas = personas || [];
    if (!S.acceso.personas.length) {
      const estado = await api("/api/setup");
      if (estado.necesitaConfiguracion) S.acceso.paso = "setup";
    }
  } catch (e) {
    aviso(e.message, true);
  }
  pintar();
}

async function hacerSetup() {
  const token = document.getElementById("su-token").value.trim();
  const nombre = document.getElementById("su-nombre").value.trim();
  const codigo = document.getElementById("su-codigo").value.trim();
  S.setup.error = "";
  if (!token || !nombre) { S.setup.error = "Rellena el código de configuración y tu nombre."; return pintar(); }
  if (!/^[0-9]{4}$/.test(codigo)) { S.setup.error = "Tu código debe tener 4 dígitos."; return pintar(); }
  try {
    await api("/api/setup", { method: "POST", cuerpo: { token, nombre, codigo } });
    await entrar();
    aviso("Listo. Ya puedes dar de alta a tu equipo.");
  } catch (e) {
    S.setup.error = e.message;
    pintar();
  }
}

/* ------------------------------ tareas ------------------------------ */

async function conError(fn, mensajeOk) {
  try {
    await fn();
    if (mensajeOk) aviso(mensajeOk);
  } catch (e) {
    if (e.estado === 401) { aviso("Tu sesión ha caducado.", true); return mostrarAcceso(); }
    if (e.datos?.debeElegirCodigo) return pedirCambioCodigo();
    aviso(e.message, true);
  }
}

async function guardarTarea() {
  const id = S.hoja.id;
  const titulo = document.getElementById("n-titulo").value.trim();
  if (!titulo) return aviso("Falta el título.", true);
  const cuerpo = {
    titulo,
    sala: document.getElementById("n-sala").value,
    area: document.getElementById("n-area").value,
    detalle: document.getElementById("n-detalle").value.trim(),
    prioridad: document.getElementById("n-prio").value,
    vence: document.getElementById("n-vence").value || "",
  };
  const asign = document.getElementById("n-asign");
  if (asign) cuerpo.asignadoA = asign.value;

  await conError(async () => {
    if (id) {
      await api(`/api/tareas?id=${encodeURIComponent(id)}`, { method: "PATCH", cuerpo });
      await cargarDatos();
      S.hoja = hojaTarea(id);
    } else {
      await api("/api/tareas", { method: "POST", cuerpo });
      await cargarDatos();
      S.hoja = null;
    }
    pintar();
  }, id ? "Tarea actualizada" : esTecnico() ? "Avería reportada" : "Tarea creada");
}

async function parchearTarea(cuerpo, mensajeOk) {
  const id = S.hoja?.id;
  if (!id) return;
  await conError(async () => {
    await api(`/api/tareas?id=${encodeURIComponent(id)}`, { method: "PATCH", cuerpo });
    await cargarDatos();
    pintar();
  }, mensajeOk);
}

const cambiarEstado = (estado) => parchearTarea({ estado }, ESTADOS[estado]);
const reasignar = (personaId) => parchearTarea({ asignadoA: personaId }, "Asignación actualizada");
const cambiarVence = (vence) => parchearTarea({ vence }, "Fecha actualizada");

async function guardarNota() {
  const ta = document.getElementById("f-nota");
  const nota = ta.value.trim();
  if (!nota) return;
  ta.value = "";
  await parchearTarea({ nota }, "Nota guardada");
}

async function borrarTarea() {
  const id = S.hoja.id;
  await conError(async () => {
    await api(`/api/tareas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await cargarDatos();
    S.hoja = null;
    pintar();
  }, "Tarea eliminada");
}

/* ------------------------------ equipo ------------------------------ */

function leerFichaPersona() {
  return {
    nombre: document.getElementById("p-nombre").value.trim(),
    rol: document.getElementById("p-rol").value,
    especialidad: document.getElementById("p-esp").value,
    salas: S.hoja.salasSel.slice(),
    activo: document.getElementById("p-activo") ? document.getElementById("p-activo").value === "1" : true,
  };
}

async function guardarPersona() {
  const id = S.hoja.id;
  const cuerpo = leerFichaPersona();
  if (!cuerpo.nombre) return aviso("Falta el nombre.", true);

  await conError(async () => {
    const r = id
      ? await api(`/api/equipo?id=${encodeURIComponent(id)}`, { method: "PATCH", cuerpo })
      : await api("/api/equipo", { method: "POST", cuerpo });
    await cargarDatos();
    if (r.codigoTemporal) {
      const hoja = hojaPersona(r.persona.id);
      hoja.codigoNuevo = { nombre: r.persona.nombre, codigo: r.codigoTemporal };
      S.hoja = hoja;
    } else {
      S.hoja = null;
      aviso("Ficha actualizada");
    }
    pintar();
  });
}

async function reiniciarCodigo() {
  const id = S.hoja.id;
  await conError(async () => {
    const r = await api(`/api/equipo?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      cuerpo: { reiniciarCodigo: true },
    });
    await cargarDatos();
    const hoja = hojaPersona(id);
    hoja.codigoNuevo = { nombre: r.persona.nombre, codigo: r.codigoTemporal };
    S.hoja = hoja;
    pintar();
  });
}

async function borrarPersona() {
  const id = S.hoja.id;
  await conError(async () => {
    await api(`/api/equipo?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await cargarDatos();
    S.hoja = null;
    pintar();
  }, "Persona eliminada");
}

/* ------------------------------- salas ------------------------------- */

async function guardarSala() {
  const id = S.hoja.id;
  const cuerpo = {
    nombre: document.getElementById("s-nombre").value.trim(),
    tipo: document.getElementById("s-tipo").value.trim(),
  };
  if (!cuerpo.nombre) return aviso("Falta el nombre.", true);
  await conError(async () => {
    if (id) await api(`/api/salas?id=${encodeURIComponent(id)}`, { method: "PATCH", cuerpo });
    else await api("/api/salas", { method: "POST", cuerpo });
    await cargarDatos();
    S.hoja = null;
    pintar();
  }, id ? "Sala actualizada" : "Sala añadida");
}

async function borrarSala() {
  const id = S.hoja.id;
  await conError(async () => {
    await api(`/api/salas?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await cargarDatos();
    S.hoja = null;
    pintar();
  }, "Sala eliminada");
}

/* =============================== ARRANQUE =============================== */

async function arrancar() {
  try {
    await cargarDatos();
    if (S.yo?.debeElegirCodigo) {
      S.vista = "acceso";
      S.acceso.persona = { id: S.yo.id, nombre: S.yo.nombre, rol: S.yo.rol };
      S.acceso.paso = "nuevo1";
      S.acceso.codigoTemporal = "";
      reiniciarPad("Elige tu código de 4 dígitos.");
      return pintar();
    }
    S.vista = "app";
    pintar();
  } catch {
    await mostrarAcceso();
  }
}

// Refresco periodico mientras la pestana esta a la vista y no hay nada abierto.
setInterval(async () => {
  if (S.vista !== "app" || S.hoja || document.hidden) return;
  try {
    await cargarDatos();
    pintar();
  } catch {}
}, 20000);

document.addEventListener("visibilitychange", async () => {
  if (!document.hidden && S.vista === "app" && !S.hoja) {
    try { await cargarDatos(); pintar(); } catch {}
  }
});

arrancar();
