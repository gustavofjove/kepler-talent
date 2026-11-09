# Kepler Talento

Aplicación interna de RR. HH. para gestionar candidatos y CVs. La interfaz actual es una
SPA React; KTL-5 añade la plataforma objetivo ASP.NET Core, PostgreSQL, almacenamiento
privado de documentos, ClamAV y Nginx. Las funcionalidades heredadas que todavía usan
`localStorage` se mantienen hasta que cada vertical se migre explícitamente; identidad,
usuarios y roles ya pertenecen a la API.

## Plataforma KTL-5

- React 19, TypeScript 5.9 y Vite 7.
- .NET SDK 10.0.102 y ASP.NET Core 10.
- FastEndpoints, MediatR, FluentValidation, EF Core/Npgsql y Serilog.
- PostgreSQL 17.6.
- almacenamiento de ficheros privado con cuarentena y límite de 20 MB.
- ClamAV 1.4.3 en una red Docker privada.
- Nginx sin privilegios como único punto publicado, en `http://localhost:4200`.

La autenticación de producción usa tokens de Microsoft Entra ID. El actor sintético y el
emisor local solo existen en Development/Testing; el proceso se niega a arrancar si se
intenta habilitarlos en Production.

## Identidad y acceso KTL-16

Con `docker compose up --build`, ejecuta `npm start` desde `frontend/` y abre
`http://localhost:4300/login`. Desde KTL-45 la SPA pide usuario y contraseña (ver la sección
siguiente). El emisor de desarrollo sigue activo en la API local: la suite e2e y
`npm run seed:demo` obtienen con él un token firmado de `POST /api/dev/token` para
`admin@kepler-talento.local`, que el backend valida por el mismo pipeline JWT que las peticiones
normales.

En producción se configuran `ENTRA_CLIENT_ID`, `ENTRA_AUTHORITY` y `ENTRA_API_SCOPE`. Los
permisos efectivos se leen de PostgreSQL en cada petición y usan una sola nomenclatura
`<resource>.<action>`, por ejemplo `candidates.read`, `users.manage` y `roles.manage`.
Consulta el [contrato de autenticación y autorización](docs/ktl-16/authentication-and-authorization.md)
y el [runbook de despliegue y recuperación](docs/ktl-16/runbook.md).

## Usuario y contraseña KTL-45

La forma de iniciar sesión la decide la variable de ejecución `AUTH_MODE` de la SPA:

- `development`: un botón que entra sin contraseña como administrador local. Solo lo usa el
  navegador de la suite e2e.
- `password`: formulario de usuario y contraseña contra `POST /api/auth/token`.
- `entra`: Microsoft Entra ID.

Sin `AUTH_MODE`, se mantiene el comportamiento anterior: `APP_ENV=local` o `test` usa
`development`, y cualquier otro valor usa `entra`.

En local, tanto `http://localhost:4200` (Compose) como `http://localhost:4300` (Vite) usan
`password`. El migrador crea dos cuentas
genéricas, y sus contraseñas son **solo de desarrollo**: están publicadas en
`docker-compose.yml` y Production las rechaza.

| Usuario      | Rol          | Contraseña (solo desarrollo) |
| ------------ | ------------ | ---------------------------- |
| `rrhh_admin` | `rrhh_admin` | `KeplerLocal-Admin-2026`     |
| `rrhh_user`  | `rrhh_user`  | `KeplerLocal-User-2026`      |

La suite e2e sirve a su navegador una configuración propia con `development`, para poder actuar
con varios roles sin contraseña (`frontend/tests/e2e/support/auth.ts`).

- **Contraseñas.** Se guardan solo como hash PBKDF2-SHA256. Cambiar la contraseña configurada y
  volver a desplegar la rota.
- **Sesión.** El token vive en `sessionStorage` de la pestaña y se borra al cerrar sesión o ante
  un `401`.
- **Más detalles.** Consulta el
  [contrato de cuentas locales](docs/ktl-45/authentication-local-accounts.md) y las
  [notas de versión](docs/ktl-45/release-notes.md), que explican el orden de despliegue en el
  servidor LAN.

## Catálogos KTL-6

Los catálogos de negocio ya no viven en `localStorage`: son propiedad de la API y se sirven
desde PostgreSQL (`CAT_CatalogItems`). Las capacidades `catalogs.read` y `catalogs.manage`
se aplican en el servidor y se corresponden con el permiso `manage_catalogs` del frontend;
ocultar la interfaz no es el control.

No existe ningún endpoint de borrado físico: un valor se retira desactivándolo, de modo que
los candidatos que lo referencian conservan su significado. Las diez familias se cargan con
una semilla explícita de despliegue durante `--migrate`. La clave `rrhh-catalogs` del
navegador queda abandonada; no se migra.

La familia **Etiquetas** incluye inicialmente `Recontratable`, `No contactar` y
`Referido por plantilla`. `No contactar` es una etiqueta informativa: la aplicación no aplica
por sí sola una restricción de contacto.

El detalle de rutas, códigos de error, unicidad de nombres, concurrencia y auditoría está en
[`docs/ktl-6/catalogs.md`](docs/ktl-6/catalogs.md).

Desde KTL-41, las habilidades, idiomas, programas y etiquetas tienen un color (nueve tonos pastel;
naranja por defecto) que se elige en Catálogos al crear o editar un valor y que se aplica a sus
chips en toda la aplicación, y que el selector de valores muestra junto a cada opción. El contrato (`color` en la API, migración `AddCatalogItemColor`) está
en [`docs/ktl-41/release-notes.md`](docs/ktl-41/release-notes.md).

## Etiquetas y notas personalizadas KTL-21

La ficha del candidato permite asignar etiquetas del catálogo (panel «Competencias») y mantener un
hilo independiente de notas personalizadas (panel «Notas»). Cada nota conserva autor y fecha, usa su propia versión para evitar
sobrescrituras y se retira de forma lógica; no existe borrado físico. El campo histórico `notes`
del candidato no cambia. Las notas sin un usuario interno resoluble muestran
`Autor desconocido`. Consulta el [contrato KTL-21](docs/ktl-21/candidate-tags-and-notes.md).

## Ficha única del candidato KTL-29

Desde KTL-29 cada candidato tiene una sola página, `/app/candidates/:id`, que sustituye a la
separación entre ficha de solo lectura y página de edición de KTL-22 (consulta su
[nota de versión](docs/ktl-22/release-notes.md) como antecedente). Todos los paneles se muestran
en modo de lectura; «Datos principales», «Competencias», «Formación», «Experiencia», «Notas» y
«Documentos» tienen un botón «Editar» que convierte ese panel, en su sitio, en el editor de
siempre. «Auditoría» no se edita.

- **Datos principales y Competencias** guardan un borrador: nada se escribe hasta pulsar
  «Guardar» en ese panel, que guarda solo ese panel; «Cancelar» descarta el borrador. En
  «Competencias» solo se guardan las familias que han cambiado; si una falla, las demás quedan
  guardadas y un nuevo «Guardar» reintenta solo la que falló.
- **Formación y Experiencia** guardan cada entrada al momento (KTL-46): «Añadir» y «Actualizar»
  la escriben sin más pasos, «Quitar» pide confirmación y «Cancelar edición» solo vacía el
  formulario. El formulario aparece solo al pulsar «Nueva formación» / «Nueva experiencia» o
  «Editar» en una entrada, y se oculta al guardar o al pulsar «Cancelar». No hay «Guardar» ni
  «Cancelar» de panel; el panel se cierra con «Hecho», arriba a la derecha. Cada entrada muestra a
  la izquierda su periodo (en experiencia, `2020 (ene) – 2020 (dic)`, `2024 (jun)` o
  `2019 (mar) – actualidad`; en formación, el año de fin) y se corrige con «Editar» (KTL-43). Una
  experiencia sin fechas empieza a la izquierda, sin hueco.
- **Experiencia** (KTL-46) tiene una «Descripción» con formato (negrita, cursiva y listas) en un
  formulario de tres columnas, con fechas de mes y año que no pueden ser posteriores al mes actual.
  El «Sector» es opcional. Los «Años de experiencia» llevan un decimal (sin él si es un número
  entero) y se calculan a partir de las fechas cuando las hay. En modo de lectura, cada entrada con
  descripción se despliega para mostrarla.
- **Notas y Documentos** mantienen sus acciones inmediatas (añadir, editar, retirar, subir,
  marcar como principal, quitar); «Hecho», arriba a la derecha, vuelve al modo de lectura.
- **El panel en edición** se distingue con un fondo de color claro (KTL-46).
- **Un panel a la vez.** Abrir otro panel con cambios sin guardar pide confirmación, igual que
  salir de la página o cerrar la pestaña.
- **La sesión caduca sin perder cambios** (KTL-46). Si la sesión termina mientras un panel tiene
  cambios sin guardar, la página y lo escrito se conservan y «Iniciar sesión» permite volver a
  entrar sin salir de ella; después, el panel repite el guardado. Consulta la
  [nota de versión KTL-46](docs/ktl-46/release-notes.md).

«Editar» aparece según el permiso que comprueba la API: `candidates.update` para todos los paneles
salvo «Documentos», que depende solo de `documents.upload`. En un candidato dado de baja no se
pueden editar competencias, formación, experiencia ni notas, porque la API lo rechaza. La
dirección antigua `/app/candidates/:id/edit` redirige a la ficha, y el alta de un candidato lleva
a su ficha tras el primer guardado. Consulta la [nota de versión KTL-29](docs/ktl-29/release-notes.md).

## Candidatos en posiciones KTL-30

Cada posición tiene ahora una lista persistente de candidatos, «Candidatos de la posición», sobre
los «Candidatos que encajan». Un candidato se añade desde su fila en las coincidencias («Añadir»), desde el buscador «Añadir candidato» de la posición o desde «Añadir a posición» en
la ficha del candidato; no hace falta que cumpla los requisitos. Cada candidato tiene un estado en
la posición (Nuevo, Preseleccionado, Entrevista, Contratado o Descartado), independiente de su
estado general. «Quitar de la posición» borra el vínculo para corregir un error; para descartar,
se usa el estado Descartado. La ficha del candidato muestra el panel «Posiciones», con las
posiciones abiertas primero y las cerradas atenuadas. Una posición cerrada no admite cambios en
sus candidatos hasta reabrirla. Al cambiar el estado de un candidato, su fila no se mueve; la
lista vuelve a agruparse por estado al recargar la página (KTL-43).

Ver la lista exige `positions.read` y `candidates.read`; modificarla, `positions.manage` y
`candidates.read`. Consulta la [nota de versión KTL-30](docs/ktl-30/release-notes.md).

## Tablas coherentes KTL-31

En Candidatos, Posiciones y Presets, al hacer clic en una fila se abre su registro: la ficha del
candidato, la página de la posición o la edición del preset. Ctrl/⌘-clic o clic central lo abren en
otra pestaña, y el nombre sigue siendo un enlace accesible con el teclado. Los enlaces y controles
de la fila (correo, desplegables, «Eliminar», casilla de selección) no abren el registro. Se retiran
los botones «Abrir» y «Editar» y el diálogo de criterios de los presets: cada preset muestra sus
criterios como etiquetas en una línea bajo su fila. Los teléfonos se muestran como texto, sin
enlace `tel:`.

En Catálogos, «Subir»/«Bajar» son flechas. Desde KTL-41, la fila no reacciona al clic: la edición
en línea se abre con el lápiz de «Acciones», «Desactivar»/«Activar» son iconos, y el formulario de
alta queda oculto hasta pulsar «Nuevo», junto al selector de familia. Todas las tablas comparten el estilo `.data-table`
(`frontend/src/app/shared/components/data-table.css`): celdas centradas verticalmente y controles
compactos de 28px. Usuarios solo adopta el estilo, porque sus filas se editan en el sitio. La página de detalle de usuario y la unificación de las páginas de consulta y edición
quedan para tickets futuros. Consulta la [nota de versión KTL-31](docs/ktl-31/release-notes.md).

## Alta desde un CV KTL-32

En «Nuevo candidato», «Rellenar desde un CV» admite un PDF o DOCX de hasta 20 MB y propone el
nombre, los apellidos, el email, el teléfono, la localidad y la provincia. Solo rellena los campos
vacíos, nunca sobrescribe lo que ya se ha escrito, y marca cada valor como «Sugerido del CV» (y
«Revisar» cuando la confianza es baja). Nada se guarda hasta pulsar «Guardar».

Desde KTL-42, una vez leído el CV aparece «Adjuntar este CV al candidato», marcado por defecto
para quien tiene `documents.upload`. Al guardar, el navegador sube ese mismo archivo como CV
principal mediante la subida de documentos habitual (`POST /api/candidates/{id}/documents`, con
cuarentena y análisis ClamAV). Si la subida falla, el candidato se conserva y un aviso indica que
el CV puede subirse desde su ficha.

Desde KTL-47, en cuanto el CV se ha leído (y, por tanto, ClamAV lo ha dado por limpio) se muestra
una vista previa junto al formulario para comprobar o copiar los datos. Con un área de contenido de
al menos 1024 px aparece como columna fija a la derecha; por debajo, a continuación del formulario.
Un PDF se abre en el visor del navegador; para un DOCX se indica que la vista previa solo está
disponible para PDF. La vista previa usa el archivo que ya tiene el navegador: no se sube ni se
guarda nada hasta pulsar «Guardar». Consulta las
[notas de la versión](docs/ktl-47/release-notes.md).

La API (`POST /api/candidates/draft-from-document`) exige `candidates.create`, analiza el archivo
con ClamAV antes de leerlo y lo mantiene solo en memoria durante la petición: no se guarda, no se
registra en los logs ni en la auditoría, que anota únicamente el intento y su resultado. La
extracción usa reglas fijas, sin IA ni servicios externos. Los límites se configuran en la sección
`CvDraft` (`MaxConcurrent`, `MaxPdfPages`, `MaxCharacters`, `TimeBudgetSeconds`); los valores por
defecto son seguros. Consulta el [contrato](docs/ktl-32/cv-draft-contract.md), las
[reglas de extracción](docs/ktl-32/extraction-rules.md), la
[hoja de prueba de fiabilidad](docs/ktl-32/extraction-test-sheet.md) y la
[nota de versión KTL-32](docs/ktl-32/release-notes.md).

## Cifrado de datos personales KTL-33

Los nombres, datos de contacto, notas, experiencia, formación, nombres de archivo de CV y textos de
búsquedas guardadas de los candidatos se guardan cifrados en PostgreSQL (AES-256-GCM). Una copia de
la base de datos o de un backup no se puede leer sin el archivo de claves, que vive fuera de la base
de datos y de `backups/`. Para los usuarios no cambia nada: la búsqueda de texto y el orden por
apellidos se hacen en la API con los mismos resultados, hasta un máximo documentado de 12.000
candidatos.

**Si se pierde el archivo de claves, se pierden los datos, backups incluidos.** Guarda una copia
custodiada por dos personas. Las operaciones (`generate-keys`, `add-key`, `retire-key`, `backfill`,
`report`) están en `ktl-migrate encryption`. Los archivos de CV en disco aún no se cifran. Consulta
el [resumen técnico](docs/ktl-33/field-encryption.md), el [manual de claves](docs/ktl-33/key-runbook.md),
el [procedimiento de despliegue](docs/ktl-33/rollout-runbook.md) y la
[nota de versión KTL-33](docs/ktl-33/release-notes.md).

## Ruta de navegación KTL-23

Las páginas de detalle, alta y edición de candidatos, posiciones y presets muestran una ruta de
navegación sobre el título, por ejemplo «Candidatos › Nombre Apellido» o
«Admin › Presets › Nombre del preset». Cada tramo lleva a su página, salvo la página actual y
«Admin», que no tiene destino propio. Desde KTL-29 la ficha del candidato es también donde se
edita, así que ya no existe el tramo «Editar» del candidato. Los listados y el resto de páginas principales no
muestran ruta. Consulta la [nota de versión KTL-23](docs/ktl-23/release-notes.md).

Desde KTL-44, un candidato abierto desde la página de una posición muestra
«Posiciones › Título de la posición › Nombre Apellido», y el título vuelve a esa posición. Desde
cualquier otro sitio, en una pestaña nueva o con la dirección escrita, la ruta sigue siendo
«Candidatos › Nombre Apellido». La ruta nunca pasa de tres tramos. Consulta la
[nota de versión KTL-44](docs/ktl-44/release-notes.md).

## Selector de valores de catálogo KTL-24

Habilidades, idiomas, programas y etiquetas se eligen con un único selector en la búsqueda
avanzada, los presets, las posiciones y la edición del candidato. Cada familia ocupa una sola
línea con sus etiquetas y un botón (+); al pulsarlo aparece la lista de valores disponibles, que
se filtra al escribir, y con Intro el valor se añade como una etiqueta con su nivel. El nivel, la certificación de un
idioma o los años de un programa se cambian desde la propia etiqueta, sin quitarla y volver a
añadirla. En la búsqueda, un criterio nuevo empieza en «Cualquier nivel» y el control
«Cualquiera» / «Todos» aparece a partir de dos criterios. La dependencia nueva
`react-aria-components` y los identificadores de prueba sustituidos se explican en la
[nota de versión KTL-24](docs/ktl-24/release-notes.md).

## Panel de competencias KTL-27

Todas las pantallas muestran habilidades, idiomas, programas y etiquetas con las mismas filas, en
ese orden y con la etiqueta en la misma línea que sus valores. En la ficha del candidato, las
cuatro familias están juntas en el panel «Competencias», y todas las secciones ocupan el ancho
completo, una debajo de otra. Un idioma, una habilidad o un programa se añade con el nivel más bajo
activo de su catálogo (y, desde KTL-29, se guarda con el «Guardar» del panel); el nivel, la certificación o los años
se cambian pulsando su etiqueta. Si una familia no tiene niveles activos, no se le pueden añadir
valores. Consulta la [nota de versión KTL-27](docs/ktl-27/release-notes.md).

## Migración de Access KTL-7

El esquema de candidatos (`CND_Candidates` y sus tablas de relación de idiomas, programas,
formación, experiencia y habilidades) se entrega en este slice, junto con la herramienta que
lo rellena desde la base de datos Access heredada.

`backend/Tools/DataMigration`, compilada como `ktl-migrate`, es una **herramienta de línea de
comandos que ejecuta el operador**. Deliberadamente no es accesible por HTTP y ningún proyecto
de la API la referencia: mover todo el conjunto de datos de candidatos no es una superficie de
petición que el producto deba tener. **No** es la pantalla de administración «Importación»
(KTL-17), que sube un CSV pequeño y plano a la API con su propio permiso, su propio límite de
filas y análisis antivirus. Ambas comparten la misma semántica de filas y de resolución de
catálogos, definida una sola vez en `Application/Import/Rows`.

```powershell
ktl-migrate validate --connection <string> --export <directory> [--mappings <file>] [--output <directory>]
ktl-migrate load     --connection <string> --export <directory> --pre-migration-backup <label> [--overwrite-app-edits]
ktl-migrate report   --connection <string> --run <guid>
```

- `validate` no escribe ningún dato de negocio: prepara la exportación en un esquema de
  staging, aplica todas las reglas de fila, resuelve todas las referencias de catálogo y
  verifica todos los documentos, y después emite el informe.
- `load` se niega a arrancar sin `--pre-migration-backup`; el informe nombra esa copia de
  seguridad como la forma de deshacer la ejecución.
- Las reejecuciones se basan en un identificador de origen por fila, de modo que corrigen en
  lugar de duplicar. Los registros que la aplicación haya modificado desde su carga se omiten
  y se informan, no se sobrescriben.

La herramienta se conecta con el rol de base de datos de **migración**, nunca con el rol de
runtime. Los valores de texto libre de Access se resuelven contra entradas de catálogo
existentes y nunca se crean automáticamente; todo lo que quede sin resolver se informa para
que se tome una decisión explícita.

Consulta [`docs/ktl-7/migration-runbook.md`](docs/ktl-7/migration-runbook.md) para la
secuencia del operador y el rollback, y
[`docs/ktl-7/access-export-procedure.md`](docs/ktl-7/access-export-procedure.md) para el
contrato de exportación.

## Candidatos KTL-8

Los candidatos ya no viven en `localStorage`: son propiedad de la API y se sirven desde
PostgreSQL. La clave `rrhh-candidates` guardaba la tabla completa de candidatos —identidad,
contacto, localización, consentimiento, retención, estado y observaciones— en claro y en
cada dispositivo.

> **Nota de versión.** En el primer arranque de esta versión, cada navegador **elimina** su
> copia local de candidatos. La eliminación se ejecuta antes de cualquier llamada a la API y
> con independencia de ella, así que ocurre incluso si el backend no está disponible. Los
> candidatos creados con versiones anteriores existían solo en ese navegador y no se
> conservan: la base de datos es ahora el sistema de referencia. Tampoco se crea ya el
> candidato de ejemplo `demo-1`; una base de datos vacía muestra una lista vacía.

Las capacidades `candidates.read`, `candidates.create`, `candidates.update` y
`candidates.delete` se aplican en el servidor antes de despachar cada petición, y se
corresponden con los permisos `view_candidates`, `create_candidates`, `edit_candidates` y
`delete_candidates` del frontend; ocultar la interfaz no es el control.

No existe ningún endpoint de borrado físico: un candidato se retira desactivándolo, lo que
registra la fecha de baja y mantiene el registro recuperable. La regla también se sostiene
en la base de datos, porque el rol de runtime no tiene `DELETE` sobre `CND_Candidates`.

También desaparece el slice de referencia de KTL-5 (`/api/reference/candidates/{id}`): el
slice de lectura real cumple su función con autorización por operación, y una segunda ruta
menos protegida hacia datos personales no debe sobrevivir.

El detalle de rutas, códigos de error, concurrencia, auditoría y contrato del frontend está
en [`docs/ktl-8/candidates.md`](docs/ktl-8/candidates.md).

## Documentos de candidato KTL-9

Los CV ya no son metadatos ni enlaces simulados. El frontend envía el archivo real como
`multipart/form-data` a la API, que lo guarda con una clave opaca en cuarentena, valida su
formato y programa el análisis antivirus. La aceptación responde `202 Accepted`: significa
«aceptado y en análisis», no «disponible inmediatamente». Solo un resultado `Clean` permite
la descarga; las respuestas nunca exponen claves ni rutas internas.

Las capacidades `documents.upload` y `documents.download` usan el mismo vocabulario en el
frontend y el backend. Ambas se
comprueban por petición y son independientes de `candidates.read`. El límite de contenido es
20 MiB para PDF, DOC, DOCX, ODT, RTF, TXT, JPEG, PNG, TIFF y BMP; Nginx admite 21 MiB únicamente
para incluir el margen acotado del framing multipart.

Consulta el [contrato y flujo de documentos KTL-9](docs/ktl-9/documents.md) y la
[nota de versión](docs/ktl-9/release-notes.md).

La ficha de un candidato existente, también mientras se edita un panel, incluye una vista previa del CV
principal cuando es un PDF disponible y la persona tiene `documents.download`. Otros formatos
conservan la descarga. La vista previa reutiliza el endpoint privado de contenido y no expone rutas
ni enlaces permanentes; consulte la [documentación de KTL-20](docs/ktl-20/document-preview.md).
Cuando el área de contenido mide al menos 1360 px, la vista previa se muestra como columna fija a
la derecha de las secciones; en pantallas más estrechas aparece tras la última sección. Consulte la
[nota de versión de KTL-28](docs/ktl-28/release-notes.md).

## Presets de búsqueda KTL-14

Las búsquedas guardadas son una biblioteca compartida en PostgreSQL (`ADM_SearchPresets`). Se
gestionan en **Admin › Presets** (`/app/admin/presets`) con el permiso `manage_presets` del
frontend, que corresponde a la capacidad `presets.manage` de la API; ver y aplicar presets desde
**Búsqueda** sigue requiriendo `view_candidates` (`candidates.read`). Ambas se aplican en el
servidor; ocultar la interfaz no es el control.

La migración `ShareSearchPresets` elimina las búsquedas guardadas privadas de KTL-10, que hay que
volver a crear. Los presets se borran físicamente, con confirmación y contra la versión leída;
la regla de no borrar físicamente sigue aplicándose a candidatos y catálogos. Búsqueda y los
presets comparten un único formulario de criterios y un único resumen de solo lectura.
Al abrir **Búsqueda**, el formulario empieza con los filtros predeterminados. Los filtros de una
búsqueda guardada se aplican solo cuando se selecciona su preset.

El detalle de rutas, códigos de error, concurrencia, modelo de datos y rollback está en
[`docs/ktl-14/presets.md`](docs/ktl-14/presets.md), y la nota para usuarios en
[`docs/ktl-14/release-notes.md`](docs/ktl-14/release-notes.md).

## Listado de candidatos paginado en servidor KTL-18

El listado de **Candidatos** ya no descarga la tabla completa: pide una sola página a
`POST /api/candidates/search`, y PostgreSQL filtra, ordena y pagina. Ordenar y filtrar se aplica
a todos los candidatos que coinciden, no solo a los que tenía el navegador. La página muestra 25
por defecto (25, 50 o 100), el texto también busca en las notas y la selección solo abarca la
página visible.

La página, la ordenación y los filtros de estado, CV e inactivos viajan en la URL, así que un
enlace copiado reabre la misma vista; el texto buscado nunca se escribe en la URL. «Incluir
inactivos» requiere `candidates.delete`.

Desde KTL-40 la página de inicio se llama «Inicio» (antes «Dashboard»). Resume los candidatos
activos y su disponibilidad, las posiciones abiertas con sus candidatos por etapa, los últimos
candidatos disponibles y añadidos y las búsquedas guardadas más usadas. Cada cifra y cada fila
lleva a la vista filtrada, la ficha, la posición o la búsqueda que hay detrás. Cada panel se carga
por separado y solo aparece con su permiso. Consulta la
[nota de versión](docs/ktl-40/release-notes.md).

Consulta el [contrato del listado](docs/ktl-18/list-contract.md) y la
[nota de versión](docs/ktl-18/release-notes.md).

## Importación de candidatos KTL-17

**Admin › Importación** (`/app/admin/import`) crea candidatos reales desde un CSV. Antes la
pantalla analizaba el archivo en el navegador, guardaba un historial en `localStorage` y **no
creaba ningún candidato**; ahora todo ocurre en la API y en dos pasos:

1. **Subir y validar.** El archivo se guarda con una clave opaca en cuarentena, ClamAV lo
   analiza y solo un resultado `Clean` permite leerlo. La validación es una simulación: no
   crea, cambia ni desactiva candidatos, y devuelve un informe por fila con número de fila,
   columna y código de motivo, nunca con valores.
2. **Confirmar carga.** Solo un lote validado y sin filas rechazadas se puede confirmar. La
   carga es una operación duradera: si la API se reinicia a mitad, se reanuda sin duplicar
   candidatos. Las personas que ya existen (mismo correo) se omiten, no se rechazan.

Todo el recorrido exige `candidates.import`, que tiene `rrhh_admin`; `candidates.create` no
basta. Para probarlo en local con el stack completo:

```powershell
docker compose up --build        # aplica la migración AddImportBatches con el migrator
cd frontend; npm start           # http://localhost:4300/app/admin/import
```

Un archivo mínimo válido:

```csv
first_name,last_name,email,languages
Ana,Ruiz,ana.ruiz@example.test,Inglés:B2
```

Los archivos subidos se purgan 30 días después de cerrarse el lote (`Import:RetentionDays`);
los recuentos y el informe por fila se conservan. La purga también se puede lanzar a mano con
`dotnet backend/Web/bin/Debug/net10.0/Web.dll --purge-imports`. La clave del navegador
`rrhh.import.batches.v1` se elimina en el primer arranque y no se migra, porque describía
cargas que nunca ocurrieron.

Consulta el [contrato del archivo](docs/ktl-17/import-file-contract.md), los
[códigos de motivo](docs/ktl-17/row-reason-codes.md), el [runbook](docs/ktl-17/runbook.md) y la
[nota de versión](docs/ktl-17/release-notes.md).

## Auditoría KTL-19

Cada evento de auditoría registra el **identificador interno del usuario** que lo causó (o el
actor «sistema» para el antivirus y la conciliación de documentos). Nunca guarda correos, nombres
ni el identificador del proveedor de identidad. Además de los cambios, ahora se auditan las dos
lecturas que identifican a una persona: abrir la ficha de un candidato y descargar un documento.
Las búsquedas y los listados no se auditan a propósito.

`ktl_runtime` ya no puede modificar ni borrar eventos: el registro es de solo inserción para la
aplicación. **Admin › Auditoría** (`/app/admin/audit`) lista el registro con filtros por fechas,
tipo de evento, actor y sujeto; exige `audit.read`, que solo tiene `system_admin`. Los eventos
anteriores a KTL-19 aparecen como «Actor desconocido».

El actor sintético de desarrollo no tiene usuario almacenado, así que las operaciones auditadas lo
rechazan salvo que `DevelopmentActor:UserId` indique uno. El stack de Compose no lo usa.

Consulta el [contrato de auditoría](docs/ktl-19/audit-contract.md) y el
[runbook](docs/ktl-19/runbook.md).

## Requisitos

- Docker Desktop con Compose v2. El escáner necesita aproximadamente 3 GiB de RAM y se
  recomiendan 4 GiB disponibles para Docker.
- .NET SDK 10.0.102 para trabajar fuera de contenedores.
- Node.js 22 y npm 10 para trabajar fuera de contenedores.

La SPA React es un proyecto npm independiente en `frontend/` (código en `frontend/src/`, tests
en `frontend/tests/`, `package.json` y `node_modules/`). Todos los comandos `npm` se ejecutan
desde esa carpeta; el backend, `docs/`, `openspec/` y `scripts/` permanecen en la raíz.

Los paquetes NuGet se fijan centralmente en `backend/Directory.Packages.props`. La
herramienta `dotnet-ef` queda fijada mediante `.config/dotnet-tools.json`.

## Arranque del stack completo

```powershell
Copy-Item .env.example .env
dotnet run --project backend/Tools/DataMigration -- encryption generate-keys --out secrets/field-keys.json
docker compose up --build
```

La API necesita el archivo de claves de cifrado (KTL-33) y no arranca sin él. El segundo comando lo
genera una sola vez en `secrets/`, carpeta ignorada por git; `KTL_FIELD_KEYS_FILE` indica su ruta.
Si ya tienes una base de datos de desarrollo con datos en claro, la API se negará a arrancar hasta
cifrarlos: sigue el [procedimiento de despliegue](docs/ktl-33/rollout-runbook.md).

El migrador termina antes de que arranque la API. Nginx sirve la SPA y reenvía `/api` al
backend con el mismo origen. PostgreSQL, ClamAV y los directorios de documentos no
publican puertos ni rutas al host.

Rutas de diagnóstico:

- `http://localhost:4200/api/health/live`: proceso vivo.
- `http://localhost:4200/api/health/ready`: PostgreSQL, migraciones y almacenamiento.
- `http://localhost:4200/api/health/scanner`: estado separado de ClamAV; puede estar
  degradado sin impedir la descarga de documentos que ya estaban limpios.
- `http://localhost:4200/platform/reference`: arnés sintético, solo en Development/Test.

Para ver «Inicio» y las posiciones con contenido, carga el conjunto de datos de demostración
(ficticio; solo se escribe en un stack local, a través de la API):

```powershell
cd frontend
npm run seed:demo              # crea lo que falte; se puede repetir
npm run seed:demo -- --remove  # lo retira
```

Detalles en [docs/ktl-40/demo-data.md](docs/ktl-40/demo-data.md).

Para detener los contenedores sin borrar datos:

```powershell
docker compose down
```

Para conectar una herramienta local a PostgreSQL, aplique el override de desarrollo. El
puerto se publica exclusivamente en la interfaz loopback y no queda accesible desde la
intranet:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres
```

Use `localhost`, el puerto `POSTGRES_PORT` (5432 por defecto), la base
`kepler_talento` y el usuario `ktl_migrator`. No use este override en el despliegue de
intranet.

Los volúmenes `postgres-data`, `documents` y `clamav-signatures` son persistentes. No use
`docker compose down --volumes` salvo que quiera eliminar deliberadamente los datos de
desarrollo.

## Servidor de pruebas en la LAN

El entorno `ktl.lan` corre en el servidor de pruebas compartido con HMS: usa su PostgreSQL y su
Nginx Proxy Manager, se despliega solo desde `main` cada cinco minutos y contiene únicamente datos
de demostración. Todo visitante entra como administrador y, mientras no haya ClamAV en el
servidor, los archivos no se analizan (`ClamAv:Bypass`, rechazado en Production). Instalación y
operación en la [guía de despliegue](docs/deploy-lan-server.md).

## Trabajo local sin Compose

```powershell
dotnet tool restore
dotnet restore backend/KeplerTalento.slnx
cd frontend
npm ci
npm run build:all
npm test
npm run test:backend
```

La API nunca migra automáticamente durante el arranque normal. La migración explícita es:

```powershell
dotnet run --project backend/Web/Web.csproj -- --migrate
```

Requiere `ConnectionStrings__ApplicationDatabase` y una identidad de migración con permiso
DDL. La API usa una identidad distinta (`ktl_runtime`) con DML limitado a las tablas
aprobadas.

## Imágenes, configuración y almacenamiento

Las imágenes son reproducibles y multi-stage: `backend/Dockerfile` y
`frontend/Dockerfile`. Los valores de desarrollo están documentados en `.env.example`;
los secretos reales no deben versionarse. Dentro del volumen de documentos existen raíces
separadas `quarantine` y `available`; PostgreSQL almacena únicamente claves opacas, nunca
rutas de host, UNC ni nombres físicos derivados de candidatos.

Si la API no está lista, revise en este orden: migrador, PostgreSQL, permisos de escritura
del volumen y configuración. Si solo falla `/api/health/scanner`, revise la memoria de
Docker, la actualización de firmas y los límites de ClamAV. Los documentos nuevos se
mantienen en cuarentena durante la incidencia.

## Backup, restore y operación

El procedimiento operativo está en
[`docs/ktl-5/operator-runbook.md`](docs/ktl-5/operator-runbook.md). Los comandos principales
son:

```powershell
./scripts/operations/backup.ps1
./scripts/operations/restore.ps1 -RecoveryId <yyyyMMddTHHmmssZ> -ConfirmNonProduction
./scripts/operations/reconcile.ps1
```

Cada recovery set contiene dump PostgreSQL, archivos y manifiesto con hashes, sin
credenciales. La base inicial es backup diario, RPO de 24 horas, RTO de 4 horas y 30 días
de retención.

## Calidad y seguridad

```powershell
cd frontend
npm run lint
npm run format:check
npm run security:rls
npm run security:storage
npm run test:security
npm run release:gate
```

`security:rls` conserva el nombre histórico del gate, pero para KTL-5 valida la frontera
PostgreSQL privada y sus grants de mínimo privilegio. Las comprobaciones Supabase siguen
aplicándose solo a rutas heredadas no migradas.

## Textos de interfaz (i18n)

Los textos visibles se sirven con i18next desde `frontend/src/assets/i18n/es.json`. El español es el
único idioma activo y no hay selector de idioma; `en.json` se mantiene pero no se carga.

- Para añadir un texto, crea una clave con el esquema `funcionalidad.seccion.elemento` en
  `es.json` (con tildes correctas) y úsala con `const { t } = useTranslation()` y
  `t('clave')`. Añadir el valor en `en.json` es opcional.
- Las validaciones nuevas lanzan `TranslatableError(clave, valores)` y el componente las
  muestra con `errorText(err, t)`.
- `npm run lint` falla si un `.tsx` contiene texto JSX literal, salvo los archivos de la
  lista `LEGACY_HARDCODED_COPY` de `frontend/eslint.config.js`. Esa lista solo puede reducirse: al
  cambiar los textos de uno de esos archivos, se migran a claves y se quita de la lista.
- En tests, una clave inexistente hace fallar la ejecución.

## Alcance aplazado

KTL-5 no decide ni implementa autenticación, migración de datos Access, topología final de
producción, SMB ni el comportamiento de producto CSV. Tampoco cambia en bloque los
servicios funcionales actuales: aporta las interfaces y operaciones reutilizables para
cambios posteriores.

Documentación principal:

- [Brief KTL-5](openspec/KTL-5.md)
- [Brief KTL-6](openspec/KTL-6.md) y [catálogos KTL-6](docs/ktl-6/catalogs.md)
- [Brief KTL-7](openspec/KTL-7.md), [runbook de migración](docs/ktl-7/migration-runbook.md) y
  [procedimiento de exportación](docs/ktl-7/access-export-procedure.md)
- [Brief KTL-8](openspec/KTL-8.md) y [candidatos KTL-8](docs/ktl-8/candidates.md)
- [Cambio OpenSpec KTL-5](openspec/changes/archive/2026-08-25-ktl-5-dotnet-infrastructure)
- [Plan técnico existente](specs/001-gestion-cvs-rrhh/plan.md)
- [Principios vigentes](openspec/config.yaml)
