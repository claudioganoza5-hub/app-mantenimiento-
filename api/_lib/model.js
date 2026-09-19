/** Reglas del negocio: roles, permisos y valores admitidos. */

import { ErrorDatos } from "./db.js";

export const AREAS = ["luces", "sonido", "general"];
export const ESTADOS = ["pendiente", "en_curso", "bloqueada", "hecha"];
export const PRIORIDADES = ["baja", "media", "alta", "urgente"];
export const ROLES = ["director", "encargado", "tecnico"];

/** Salas con las que arranca la aplicacion en la primera configuracion. */
export const SALAS_INICIALES = [
  { id: "s_ny", nombre: "Sala New York", tipo: "Discoteca", orden: 1 },
  { id: "s_chbcn", nombre: "La Chismosa Barcelona", tipo: "Discoteca", orden: 2 },
  { id: "s_chcer", nombre: "La Chismosa Cerdañola", tipo: "Discoteca", orden: 3 },
  { id: "s_ofi", nombre: "La Oficina Lounge", tipo: "Bar musical", orden: 4 },
  { id: "s_chula", nombre: "La Chula", tipo: "Local de espectáculos", orden: 5 },
];

export const esDirector = (p) => p?.rol === "director";
export const esEncargado = (p) => p?.rol === "encargado";
export const esTecnico = (p) => p?.rol === "tecnico";

/** Identificadores de las salas que esta persona tiene a su cargo. */
export function salasDe(persona, todasLasSalas) {
  if (esDirector(persona)) return todasLasSalas.map((s) => s.id);
  const suyas = Array.isArray(persona?.salas) ? persona.salas : [];
  return suyas.length ? suyas : todasLasSalas.map((s) => s.id);
}

/** Tareas que esta persona puede ver. */
export function tareasVisibles(persona, tareas, salas) {
  if (esDirector(persona)) return tareas;
  const mias = salasDe(persona, salas);
  if (esEncargado(persona)) return tareas.filter((t) => mias.includes(t.sala));
  return tareas.filter((t) => t.asignadoA === persona.id || (mias.includes(t.sala) && !t.asignadoA));
}

/** Puede crear tareas en esa sala. */
export function puedeCrearEn(persona, salaId, salas) {
  if (esDirector(persona)) return true;
  return salasDe(persona, salas).includes(salaId);
}

/**
 * Que campos puede tocar cada rol en una tarea.
 * Direccion y encargados gestionan la tarea entera dentro de su ambito;
 * el tecnico asignado solo mueve el estado y anade notas.
 */
export function permisoSobreTarea(persona, tarea, salas) {
  if (esDirector(persona)) return { gestionar: true, avanzar: true };
  const mias = salasDe(persona, salas);
  if (esEncargado(persona) && mias.includes(tarea.sala)) return { gestionar: true, avanzar: true };
  if (esTecnico(persona)) {
    const suya = tarea.asignadoA === persona.id;
    const libreEnSuSala = !tarea.asignadoA && mias.includes(tarea.sala);
    return { gestionar: false, avanzar: suya || libreEnSuSala };
  }
  return { gestionar: false, avanzar: false };
}

export function validarEnLista(valor, lista, campo) {
  if (!lista.includes(valor)) {
    throw new ErrorDatos(`Valor no admitido en "${campo}".`, 400);
  }
  return valor;
}

/** Fecha "AAAA-MM-DD" o cadena vacia. */
export function validarFecha(valor) {
  const v = String(valor || "").trim();
  if (!v) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ErrorDatos("La fecha limite no es valida.", 400);
  return v;
}

export function lineaHistorial(persona, textoLinea) {
  return { ts: new Date().toISOString(), quien: persona.nombre, texto: textoLinea };
}

/** Recorta el historial para que un documento no crezca sin limite. */
export function historialConLimite(historial, maximo = 60) {
  const h = Array.isArray(historial) ? historial : [];
  return h.length > maximo ? h.slice(h.length - maximo) : h;
}

/** Version de una persona apta para enviar al navegador: sin la huella del codigo. */
export function personaPublica(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    rol: p.rol,
    especialidad: p.especialidad || "",
    salas: Array.isArray(p.salas) ? p.salas : [],
    activo: p.activo !== false,
    debeElegirCodigo: Boolean(p.debeElegirCodigo),
  };
}
