<?php 
// api.php
// Versión 1.4: Añadidas verificaciones de ID más específicas.

define('LOG_FILE', __DIR__ . '/debug_log.txt');
function write_log($message) {
    $timestamp = date("Y-m-d H:i:s");
    file_put_contents(LOG_FILE, "[$timestamp] " . print_r($message, true) . "\n", FILE_APPEND);
}
// file_put_contents(LOG_FILE, ''); 
write_log("--- INICIANDO NUEVA SOLICITUD API ---");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    http_response_code(200);
    exit();
}

ini_set('display_errors', 1); error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

function send_json_response($success, $message, $data = [], $details = '') { /* ... código sin cambios ... */ }
try {
    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $db = new PDO($dsn, DB_USER, DB_PASS, [ PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC ]);
} catch (PDOException $e) { /* ... código sin cambios ... */ }

$action = $_REQUEST['action'] ?? '';
write_log("Acción solicitada: $action");
write_log("Datos recibidos (\$_REQUEST): " . json_encode($_REQUEST));

switch ($action) {
  // ... (otros casos sin cambios) ...
  
  case 'highlight_pdf':
    header_remove('Content-Type');
    write_log("[MARCADOR PHP 1] Entrando al caso 'highlight_pdf'.");

    $docId = (int)($_POST['id'] ?? 0);
    $codesRaw = $_POST['codes'] ?? '';
    $codesToHighlight = array_filter(array_map('trim', explode(',', $codesRaw)));
    
    // --- BARRERA DE SEGURIDAD REFORZADA ---
    if (!$docId) {
        http_response_code(400);
        $id_recibido = isset($_POST['id']) ? $_POST['id'] : 'NO FUE PROPORCIONADO';
        $log_msg = "[ERROR CRÍTICO PHP] El ID del documento no es válido o no fue recibido. Valor: '$id_recibido'. La petición se detiene aquí.";
        write_log($log_msg);
        send_json_response(false, 'Error Crítico: El ID del documento no fue recibido por el servidor.', [], $log_msg);
    }
    if (empty($codesToHighlight)) {
        http_response_code(400);
        $log_msg = "[ERROR CRÍTICO PHP] La lista de códigos está vacía. La petición se detiene.";
        write_log($log_msg);
        send_json_response(false, 'Error Crítico: La lista de códigos para resaltar está vacía.', [], $log_msg);
    }
    
    write_log("[MARCADOR PHP 2] ID de documento validado: $docId");
    
    // ... (resto del código del caso 'highlight_pdf' sin cambios) ...
    $stmt = $db->prepare('SELECT path FROM documents WHERE id = ?');
    $stmt->execute([$docId]);
    $path = $stmt->fetchColumn();
    $full_path_to_check = __DIR__ . '/uploads/' . $path;
    write_log("[MARCADOR PHP 4] Ruta de archivo consultada en BD: $path");
    if (!$path || !file_exists($full_path_to_check)) {
        http_response_code(404);
        write_log("[ERROR PHP] El archivo no existe en la ruta: $full_path_to_check");
        send_json_response(false, 'El archivo PDF no fue encontrado en el servidor.', [], 'Ruta verificada: ' . $full_path_to_check);
    }
    $ch = curl_init();
    $postData = [
        'specific_codes' => implode("\n", $codesToHighlight), 
        'pdf_file'       => new CURLFile($full_path_to_check, 'application/pdf', basename($path))
    ];
    write_log("[MARCADOR PHP 6] Preparando para enviar a Python. Datos POST:"); write_log($postData);
    curl_setopt($ch, CURLOPT_URL, PDF_HIGHLIGHTER_URL);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $responseHeaders = [];
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$responseHeaders) {
        $len = strlen($header); $header = explode(':', $header, 2); if (count($header) < 2) return $len;
        $responseHeaders[strtolower(trim($header[0]))][] = trim($header[1]); return $len;
    });
    write_log("[MARCADOR PHP 7] Enviando solicitud cURL a: " . PDF_HIGHLIGHTER_URL);
    $responseBody = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    write_log("[MARCADOR PHP 8] Respuesta de Python recibida.");
    write_log("  - Código HTTP: $httpCode");
    write_log("  - Error cURL (si hubo): " . ($error ? $error : 'Ninguno'));
    if ($httpCode !== 200) { write_log("  - Cuerpo de la respuesta (error): " . $responseBody); }
    if ($httpCode === 200 && isset($responseHeaders['content-type'][0]) && strpos($responseHeaders['content-type'][0], 'application/pdf') !== false) {
        write_log("[MARCADOR PHP 9] Éxito. Devolviendo PDF al navegador.");
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="resaltado_' . basename($path) . '"');
        if (isset($responseHeaders['x-pages-found'])) {
            header('X-Pages-Found: ' . $responseHeaders['x-pages-found'][0]);
            header('Access-Control-Expose-Headers: X-Pages-Found');
        }
        echo $responseBody;
    } else {
        http_response_code(500);
        header('Content-Type: application/json');
        write_log("[MARCADOR PHP 9] Fallo. Devolviendo error JSON al navegador.");
        $error_details = json_decode($responseBody, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            send_json_response(false, $error_details['error'] ?? 'El servicio de resaltado falló.', [], $error_details['details'] ?? 'Sin detalles técnicos.');
        } else {
            send_json_response(false, 'El servicio de resaltado devolvió una respuesta inesperada.', [], $error ? 'cURL error: ' . $error : 'HTTP status: ' . $httpCode . ' | Response: ' . $responseBody);
        }
    }
    exit;

  default:
    // ... (código sin cambios) ...
    break;
}