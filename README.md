# Parte de Salas

Control de mantenimiento para las salas: dirección y encargados asignan tareas de
luces, sonido y mantenimiento general; cada técnico entra con su propio código y
actualiza el estado de lo suyo.

- **Web sin compilación**: HTML, CSS y JavaScript sin ninguna dependencia. Vercel
  la publica tal cual, así que no hay build que pueda fallar.
- **Datos en Firestore**, siempre a través del servidor. El navegador nunca habla
  con Firebase ni ve credenciales.
- **Códigos cifrados** (scrypt con sal propia). Ni siquiera tú puedes leer el
  código de otra persona: solo generarle uno nuevo.

---

## Puesta en marcha

Son cuatro pasos y se hacen una sola vez. Calcula unos 20 minutos.

### 1. Crear la base de datos en Firebase

1. Entra en <https://console.firebase.google.com> y pulsa **Crear un proyecto**.
   Ponle el nombre que quieras (por ejemplo `parte-salas`). Puedes desactivar
   Google Analytics, no hace falta.
2. En el menú lateral: **Compilación → Firestore Database → Crear base de datos**.
   Elige **modo de producción** y la ubicación `eur3 (europe-west)`.
3. Abre la pestaña **Reglas** y deja exactamente esto:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

   Esto cierra la base a cualquier acceso directo desde fuera. La aplicación entra
   con la cuenta de servicio del paso siguiente, que no pasa por estas reglas.
   Pulsa **Publicar**.

4. Ve a **Configuración del proyecto** (la rueda dentada, arriba a la izquierda)
   **→ Cuentas de servicio → Generar nueva clave privada**. Se descarga un
   archivo `.json`. Guárdalo bien: contiene la llave de tu base de datos y no se
   puede volver a descargar.

### 2. Subir el proyecto a GitHub

1. Crea un repositorio nuevo en <https://github.com/new>. Ponlo **privado**.
2. Sube esta carpeta. Si usas la web de GitHub, arrastra el contenido de la
   carpeta (no la carpeta en sí) a la pantalla de subida.

   Desde la Terminal sería:

   ```bash
   cd parte-salas
   git init
   git add .
   git commit -m "Parte de Salas"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/parte-salas.git
   git push -u origin main
   ```

### 3. Publicar en Vercel

1. Entra en <https://vercel.com>, **Add New → Project**, e importa el repositorio.
2. No toques nada de la configuración de build: el proyecto no la necesita.
3. Antes de pulsar **Deploy**, abre **Environment Variables** y añade estas cinco.
   Los tres primeros valores salen del `.json` que descargaste:

   | Nombre | Valor |
   |---|---|
   | `FIREBASE_PROJECT_ID` | el campo `project_id` del json |
   | `FIREBASE_CLIENT_EMAIL` | el campo `client_email` del json |
   | `FIREBASE_PRIVATE_KEY` | el campo `private_key` del json, **entero y entre comillas dobles**, con los `\n` tal como aparecen |
   | `SESSION_SECRET` | una cadena larga al azar. Sirve `openssl rand -hex 32`, o cualquier texto largo e impredecible |
   | `SETUP_TOKEN` | una palabra que te inventes ahora. La usarás una sola vez en el paso 4 |

4. **Deploy**. En un minuto tendrás la dirección de la web.

### 4. Primera configuración

1. Abre la web. Te recibe la pantalla de **primera configuración**.
2. Escribe el `SETUP_TOKEN` que pusiste, tu nombre y el código de 4 dígitos que
   quieras usar tú.
3. Al aceptar se crean las cinco salas y tu usuario de dirección, y entras.
4. **Vuelve a Vercel y borra la variable `SETUP_TOKEN`** (Settings → Environment
   Variables → los tres puntos → Remove) y redespliega. Esa pantalla ya no hace
   falta y sin la variable nadie puede usarla.

Ya está. Ahora entra en **Equipo → Añadir** y da de alta a tus encargados y
técnicos.

---

## El día a día

**Dar de alta a alguien.** Equipo → Añadir. Al guardar sale un **código de un solo
uso** de 4 dígitos: pásaselo por donde quieras. La primera vez que entre, la
aplicación le obliga a elegir su propio código, y a partir de ahí nadie más lo
sabe. Si alguien pierde el suyo, abre su ficha y pulsa **Generar código nuevo**.

**Quién ve qué.**

| | Dirección | Encargado/a | Técnico/a |
|---|---|---|---|
| Ver tareas | las cinco salas | solo su sala | las suyas y las libres de su sala |
| Crear tareas | sí | en su sala | reportar averías |
| Asignar | sí | en su sala | no |
| Cambiar estado y notas | sí | en su sala | en las suyas |
| Gestionar equipo y salas | sí | no | no |

Los permisos se comprueban en el servidor, no en el navegador: aunque alguien
manipule la página, el servidor rechaza lo que no le corresponde.

**Intentos fallidos.** Cinco códigos erróneos seguidos bloquean a esa persona
durante 5 minutos.

**Quitar a alguien.** Si va a volver (una baja, un fijo discontinuo), ponlo como
**inactivo**: deja de poder entrar pero su historial se conserva. Eliminar la
ficha solo se puede si no tiene tareas abiertas.

---

## Trabajar en tu ordenador

```bash
npm run dev        # http://localhost:3000
```

Sin variables de Firebase los datos se guardan en memoria y desaparecen al parar
el proceso, que es justo lo que quieres para probar. El código de configuración
en ese modo es `local`.

Para probar contra Firestore de verdad, copia `.env.example` a `.env.local` y
rellénalo. `.env.local` está en el `.gitignore`: nunca se sube.

---

## Qué hay dentro

```
public/          la web: index.html, app.css, app.js
api/             los endpoints (Vercel los publica como funciones)
  _lib/db.js     acceso a Firestore por su API REST
  _lib/auth.js   códigos cifrados y sesiones firmadas
  _lib/model.js  reglas de roles y permisos
scripts/dev.mjs  servidor local
```

Los datos se guardan en tres colecciones de Firestore: `salas`, `equipo` y
`tareas`. Cada tarea lleva su historial firmado (quién, cuándo y qué).
