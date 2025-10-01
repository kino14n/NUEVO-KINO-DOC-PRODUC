<?php
// config.php
// ARCHIVO DE CONFIGURACIÓN CENTRAL PARA AMBAS APLICACIONES

// 1. CONFIGURACIÓN DE LA BASE DE DATOS (COMPARTIDA)
// Modifica estos valores para la base de datos de cada cliente.
define('DB_HOST', 'sql200.infinityfree.com');
define('DB_NAME', 'if0_39064130_buscador');
define('DB_USER', 'if0_39064130');
define('DB_PASS', 'POQ2ODdvhG');
define('DB_PORT', '3306');

// 2. CONFIGURACIÓN PARA LA APP PRINCIPAL (ADMINISTRADOR)
// Título que aparece en el encabezado del panel de administración.
define('APP_HEADER_TITLE', 'KINO COMPANY SAS V1'); 
// Ruta al logo para el panel de administración.
define('APP_LOGO_PATH', 'bc/Logo-Kino-KB.png'); 

// 3. CONFIGURACIÓN PARA EL BUSCADOR PÚBLICO (/bc)
// Título que aparece en el encabezado del buscador público.
define('PUBLIC_HEADER_TITLE', 'Buscador de Documentos');
// Ruta al logo para el buscador público (debe estar dentro de la carpeta /bc).
define('PUBLIC_LOGO_PATH', 'Logo-Kino-KB.png');

// 4. URL DEL SERVICIO DE RESALTADO DE PDF
define('PDF_HIGHLIGHTER_URL', 'https://pdf-resaltador-new-production.up.railway.app/');
?>