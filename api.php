<?php 
// api.php
// Versión 3.0: Corregido el envío de archivos a través de cURL para funcionar entre diferentes servidores.

// --- CONFIGURACIÓN DE LOGS ---
define('LOG_FILE', __DIR__ . '/debug_log.txt');
function write_log($message) {
    $timestamp = date("Y-m-d H:i:s");
    file_put_contents(LOG_FILE, "[$timestamp] " . print_r($message, true) . "\n", FILE_APPEND);
}
write_log("--- INICIANDO NUEVA SOLICITUD API ---");


// --- MANEJO DE CORS (Cross-Origin Resource Sharing) ---
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    http_response_code(200);
    exit();
}
header("Access-Control-Allow-Origin: *");


// --- CONFIGURACIÓN INICIAL DE PHP ---
ini_set('display_errors', 1); 
error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');


// --- FUNCIÓN PARA ENVIAR RESPUESTAS JSON ESTANDARIZADAS ---
function send_json_response($success, $message, $data = [], $details = '') {
    http_response_code($success ? 200 : 400);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data'    => $data,
        'details' => $details
    ]);
    exit;
}


// --- CONEXIÓN A LA BASE DE DATOS ---
try {
    $dsn = "mysql:host=" . DB_HOST . ";port=" . DB_PORT . ";dbname=" . DB_NAME . ";charset=utf8mb4";
    $db = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    send_json_response(false, 'Error de conexión con la base de datos.', [], $e->getMessage());
}


// --- ENRUTADOR DE ACCIONES PRINCIPAL ---
$action = $_REQUEST['action'] ?? '';
write_log("Acción solicitada: $action");
write_log("Datos recibidos (\$_REQUEST): " . json_encode($_REQUEST));

switch ($action) {
  
  case 'highlight_pdf':
    header_remove('Content-Type');
    write_log("[PHP] Entrando al caso 'highlight_pdf'.");

    $docId = (int)($_POST['id'] ?? 0);
    $codesRaw = $_POST['codes'] ?? '';
    $codesToHighlight = array_filter(array_map('trim', explode(',', $codesRaw)));
    
    if (!$docId || empty($codesToHighlight)) {
        send_json_response(false, 'Error Crítico: Faltan el ID del documento o los códigos para resaltar.');
    }
    
    $stmt = $db->prepare('SELECT path FROM documents WHERE id = ?');
    $stmt->execute([$docId]);
    $path = $stmt->fetchColumn();
    $full_path_to_check = __DIR__ . '/uploads/' . $path;
    
    if (!$path || !file_exists($full_path_to_check)) {
        http_response_code(404);
        send_json_response(false, 'El archivo PDF no fue encontrado en el servidor.', [], 'Ruta verificada: ' . $full_path_to_check);
    }
    
    $postData = [
        'specific_codes' => implode("\n", $codesToHighlight), 
        'pdf_file'       => new CURLFile($full_path_to_check, 'application/pdf', basename($path))
    ];
    
    write_log("[PHP] Preparando para enviar archivo a Python. Datos POST:");
    write_log($postData);
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, PDF_HIGHLIGHTER_URL);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    $responseHeaders = [];
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($curl, $header) use (&$responseHeaders) {
        $len = strlen($header);
        $header = explode(':', $header, 2);
        if (count($header) < 2) return $len;
        $responseHeaders[strtolower(trim($header[0]))][] = trim($header[1]);
        return $len;
    });
    
    write_log("[PHP] Enviando solicitud cURL a: " . PDF_HIGHLIGHTER_URL);
    $responseBody = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    write_log("[PHP] Respuesta de Python recibida. Código HTTP: $httpCode");

    if ($httpCode === 200 && isset($responseHeaders['content-type'][0]) && strpos($responseHeaders['content-type'][0], 'application/pdf') !== false) {
        write_log("[PHP] Éxito. Devolviendo PDF al navegador.");
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="extracto_' . basename($path) . '"');
        if (isset($responseHeaders['x-pages-found'])) {
            header('X-Pages-Found: ' . $responseHeaders['x-pages-found'][0]);
            header('Access-Control-Expose-Headers: X-Pages-Found');
        }
        echo $responseBody;
    } else {
        write_log("[PHP] Fallo. Devolviendo error JSON. Body: " . $responseBody);
        http_response_code(500);
        header('Content-Type: application/json');
        $error_details = json_decode($responseBody, true) ?? ['error' => 'Respuesta inválida del servicio de resaltado', 'details' => $responseBody];
        send_json_response(false, $error_details['error'] ?? 'El servicio de resaltado falló.', [], $error_details['details'] ?? 'Sin detalles técnicos.');
    }
    exit;

  // Aquí irían los otros 'case' de tu aplicación (search, list, upload, etc.)
  
  default:
    send_json_response(false, 'Acción no reconocida o no especificada.');
    break;
}
?>