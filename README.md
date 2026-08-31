# Ruta Segura — App de Transporte Escolar

App web para administrar rutas de transporte escolar y para que **choferes y
nannies** registren, con botones grandes, la subida y bajada de cada alumno
(con hora, fecha y ubicación GPS) en el recorrido de **ida** y **vuelta**.

Pensada para correr 100% gratis: **Firebase** (Authentication + Firestore,
plan Spark) para el backend, y **Vercel** para publicar la web, ambos sin
tarjeta de crédito. El login es con **Google** (cuenta institucional) — no
hay contraseñas que administrar.

## Cómo funciona

**Administrador**: da de alta planteles, unidades, alumnos (manual o CSV) y
choferes/nannies (con su correo institucional). Crea rutas asignando
plantel, chofer, nanny, unidad y alumnos. Consulta reportes con mapa.

**Chofer/nanny — ida (mañana)**: ve su lista de alumnos, los marca
"Recogido" uno por uno (o busca por matrícula el primer día), y al llegar
al plantel un botón "Llegamos al plantel" cierra a todos de golpe.

**Chofer/nanny — vuelta (tarde)**: un botón "Todos abordaron" los sube a
todos de golpe, y luego va marcando "Bajó" alumno por alumno en cada
domicilio.

Cada marca guarda automáticamente hora, fecha y ubicación GPS, y al
terminar el recorrido el orden se reordena solo para el día siguiente.

## Guía de instalación completa

La guía paso a paso (Firebase, Google Sign-In, reglas, GitHub, Vercel) vive
en la conversación donde se generó este proyecto. En resumen:

1. **Firebase Console** → Authentication → habilitar proveedor Google.
2. **Firestore** → pestaña Rules → pegar el contenido de `firestore.rules`.
3. **Firestore** → pestaña Data → crear colección `admins`, con un
   documento cuyo ID sea tu correo institucional en minúsculas.
4. Dar de alta el resto de tus datos desde `/admin` (planteles, alumnos,
   choferes con su correo institucional, unidades, rutas).
5. **Vercel** → importar este repositorio de GitHub → agregar las
   variables `VITE_FIREBASE_*` (ver `.env.example`) → Deploy.

## Correr en local (opcional)

```bash
npm install
cp .env.example .env   # y llena tus credenciales de Firebase
npm run dev
```

## Modelo de datos (Firestore)

| Colección | Descripción |
|---|---|
| `admins` | Lista blanca de correos con acceso de administrador (doc ID = correo) |
| `schools` | Planteles/colegios |
| `students` | Alumnos: matrícula, nombre, `schoolId`, `routeId`, domicilio |
| `drivers` | Choferes y nannies: nombre, rol, plantel, correo institucional |
| `units` | Vehículos: placas, modelo, capacidad |
| `routes` | Plantel, chofer, nanny, unidad, y el orden de alumnos guardado (`studentOrderMorning` / `studentOrderAfternoon`) |
| `users` | Vincula el `uid` de Firebase Auth con su rol (`admin`/`driver`); se crea solo, la primera vez que la persona inicia sesión |
| `trips` | Un recorrido concreto (ruta + fecha + turno). Subcolección `stops`: hora/ubicación de subida y de bajada por alumno |

## Notas

- No se usa Firebase Storage ni Cloud Functions por ahora (ambos piden
  activar el plan de pago "Blaze", aunque el uso se mantenga en $0). Todo
  lo demás funciona en el plan gratuito "Spark".
- Cuando quieras fotos de alumnos, notificaciones automáticas, o rutas
  optimizadas con IA, ese es el momento de evaluar subir a Blaze (tiene
  capa gratuita generosa; solo se cobra si te pasas).
