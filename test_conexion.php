<?php
// test_conexion.php

// URL del servicio que queremos probar
$url = 'https://pdf-resaltador-new-production.up.railway.app/';

echo "<h1>Prueba de Conexión al Servicio de Resaltado</h1>";
echo "<p>Intentando conectar a: <strong>" . $url . "</strong></p>";

// Inicializar cURL
$ch = curl_init();

// Configurar las opciones de cURL
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Devuelve el resultado en lugar de imprimirlo
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10); // Tiempo de espera para la conexión en segundos
curl_setopt($ch, CURLOPT_TIMEOUT, 30); // Tiempo de espera total de la solicitud en segundos

// Opciones para flexibilizar la conexión SSL (importante para el diagnóstico)
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

// Ejecutar la solicitud
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);

// Cerrar la conexión
curl_close($ch);

// Mostrar los resultados
echo "<h2>Resultados:</h2>";

if ($error) {
    echo "<p style='color: red;'><strong>Error de cURL:</strong> " . $error . "</p>";
    echo "<p><strong>Diagnóstico:</strong> El servidor no pudo establecer una conexión. Esto confirma que el problema está en el hosting, que probablemente bloquea o no puede resolver la conexión segura (HTTPS).</p>";
} else {
    echo "<p><strong>Código de Estado HTTP:</strong> " . $http_code . "</p>";
    echo "<p style='color: green;'><strong>¡Conexión Exitosa!</strong> El servidor pudo conectarse al servicio de resaltado.</p>";
    echo "<p><strong>Respuesta del servicio:</strong></p>";
    echo "<pre>" . htmlspecialchars($response) . "</pre>";
}

?>