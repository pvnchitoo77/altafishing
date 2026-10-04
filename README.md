# AltaFishing

Bitácora web de pesca con alcance mundial, tema claro y datos guardados localmente. Esta entrega puede abrirse en un navegador; todavía no es una aplicación nativa lista para App Store o Google Play.

## Qué se puede probar

- Inicio, mapa, mareas, diario, comunidad local, nudos, planes y perfil.
- Onboarding con perfil, preferencias, consentimiento opcional de ubicación y aceptación de términos y privacidad.
- Capturas opcionales con foto del pez, foto del señuelo, peso, medida y ubicación; el formulario se puede cancelar sin guardar.
- Salidas de pesca y spots personales.
- Pronóstico global horario a cinco días: viento en km/h, ráfagas, temperatura, humedad, lluvia, nubosidad y dirección del viento. Selecciona día y hora en una barra.
- Tabla de nivel del mar modelado: elige un día en una barra de cinco días; el reloj de marea muestra solo hoy y su anillo avanza durante el ciclo estimado.
- Una sección gratuita. Los planes de pago se retiraron y no hay cobros habilitados.
- Perfil editable y comunidad de lectura local. Publicar y calificar requiere una cuenta real, todavía no conectada.
- Captura comunitaria preparada con foto obligatoria del pez y foto separada opcional del señuelo.
- Persistencia en el navegador, incluyendo el último lugar y la vista del mapa. Los datos no se sincronizan entre dispositivos.

## Lo que todavía requiere configuración o desarrollo

No están conectados inicio de sesión Apple/Google/Facebook, cuentas en nube, sincronización, comunidad entre usuarios, pagos ni videos protegidos. Publicar y calificar está bloqueado hasta conectar una identidad real. Los botones de proveedores explican el estado y no crean cuentas falsas. El modelo marino no entrega una tabla oficial de pleamares/bajamares. Consulta `docs/ESTADO_DEL_PROYECTO.md`.

Para publicar como app iOS/Android hay que crear el cliente Expo/React Native, configurar OAuth y backend, completar identidad legal, revisar términos y privacidad, y probar permisos y compras en dispositivos reales.

## Abrir en el computador

1. Instala Python 3 si no está disponible.
2. Abre PowerShell dentro de esta carpeta.
3. Ejecuta:

   ```powershell
   python -m http.server 8000
   ```

4. Abre `http://localhost:8000` en el navegador.

Las capturas y ajustes locales siguen disponibles sin conexión después de abrir la app, pero mapa, búsqueda y pronóstico necesitan internet. No hace falta copiar claves de API para probar esta entrega.

## Servicios y condiciones

- Mapa: MapLibre GL JS clásico desde CDN + OpenFreeMap, con datos OpenMapTiles/OpenStreetMap. Se cambió la carga ES module que podía fallar en hosting estático y se muestran errores del proveedor. Mantiene la atribución; la instancia pública no promete SLA.
- Geocodificación, tiempo y nivel del mar: endpoints de Open-Meteo. El nivel del mar es un producto de modelo con limitaciones costeras. Sus endpoints gratuitos no se deben usar para una app comercial; se necesita contratar servicio comercial o sustituir el proveedor antes de cobrar o mostrar publicidad.
- Tabla mareográfica oficial: falta integrar un proveedor que entregue extremos validados para el puerto/zona elegidos.

## Archivos principales

- `index.html`: pantallas, navegación y diálogos.
- `styles.css` y `theme.css`: componentes y paleta clara azul con acento rojo suave.
- `app.js`: lógica de interfaz, formularios y almacenamiento local.
- `docs/`: inicio, edición, seguridad, APIs, pruebas y estado real.
- `.env.example`: nombres de ajustes futuros, sin secretos.
