<?php 
// api.php
// Versión 3.0: Corregido el envío de archivos a través de cURL para funcionar entre diferentes servidores.

// --- CONFIGURACIÓN DE LOGS ---
define('LOG_FILE', __DIR__ . '/debug_log.txt');
function write_log($message) {
    $timestamp = date("Y-m-d H:i:s");
    // Usamos print_r para poder ver arrays y objetos en el log
    file_put_contents(LOG_FILE, "[$timestamp] " . print_r($message, true) . "\n", FILE_APPEND);
}
// Limpia el log para una nueva sesión de depuración (opcional, comentar en producción)
// file_put_contents(LOG_FILE, ''); 
write_log("--- INICIANDO NUEVA SOLICITUD API ---");


// --- MANEJO DE CORS (Cross-Origin Resource Sharing) ---
// Esencial para que el frontend pueda comunicarse con esta API
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    http_response_code(200);
    exit();
}
// Aplicar header para todas las respuestas
header("Access-Control-Allow-Origin: *");


// --- CONFIGURACIÓN INICIAL DE PHP ---
ini_set('display_errors', 1); 
error_reporting(E_ALL);
require_once __DIR__ . '/config.php';
// El Content-Type por defecto será JSON, pero lo cambiaremos si devolvemos un PDF.
header('Content-Type: application/json');


// --- FUNCIÓN PARA ENVIAR RESPUESTAS JSON ESTANDARIZADAS ---
function send_json_response($success, $message, $data = [], $details = '') {
    // Asignar un código de estado HTTP lógico (200 para éxito, 400 para error del cliente)
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
    http_response_code(500); // Error de servidor
    send_json_response(false, 'Error de conexión con la base de datos.', [], $e->getMessage());
}


// --- ENRUTADOR DE ACCIONES PRINCIPAL ---
$action = $_REQUEST['action'] ?? '';
write_log("Acción solicitada: $action");
write_log("Datos recibidos (\$_REQUEST): " . json_encode($_REQUEST));

switch ($action) {
  
  case 'highlight_pdf':
    // Quitamos el header JSON porque la respuesta final podría ser un PDF
    header_remove('Content-Type');
    write_log("[PHP] Entrando al caso 'highlight_pdf'.");

    $docId = (int)($_POST['id'] ?? 0);
    $codesRaw = $_POST['codes'] ?? '';
    $codesToHighlight = array_filter(array_map('trim', explode(',', $codesRaw)));
    
    // Validaciones de seguridad
    if (!$docId || empty($codesToHighlight)) {
        send_json_response(false, 'Error Crítico: Faltan el ID del documento o los códigos para resaltar.');
    }
    
    // Búsqueda del archivo en la base de datos
    $stmt = $db->prepare('SELECT path FROM documents WHERE id = ?');
    $stmt->execute([$docId]);
    $path = $stmt->fetchColumn();
    $full_path_to_check = __DIR__ . '/uploads/' . $path;
    
    if (!$path || !file_exists($full_path_to_check)) {
        http_response_code(404); // Not Found
        send_json_response(false, 'El archivo PDF no fue encontrado en el servidor.', [], 'Ruta verificada: ' . $full_path_to_check);
    }
    
    // --- LÓGICA DE cURL CORREGIDA Y ROBUSTA ---
    // Al usar CURLFile, cURL se encarga de establecer el Content-Type a 'multipart/form-data'.
    // No se deben añadir headers de 'Content-Type: application/json' aquí, ya que eso causa el conflicto.
    $postData = [
        'specific_codes' => implode("\n", $codesToHighlight), 
        'pdf_file'       => new CURLFile($full_path_to_check, 'application/pdf', basename($path))
    ];
    
    write_log("[PHP] Preparando para enviar archivo a Python. Datos POST:");
    write_log($postData); // Esto mostrará el objeto CURLFile, es normal.
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, PDF_HIGHLIGHTER_URL);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData); // PHP y cURL construirán la petición multipart/form-data
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Necesario para algunos entornos de hosting
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    // Capturar las cabeceras de la respuesta de Python
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

    // Procesar la respuesta
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
        http_response_code(500); // Error de servidor
        header('Content-Type: application/json'); // Asegurar que la respuesta de error sea JSON
        $error_details = json_decode($responseBody, true) ?? ['error' => 'Respuesta inválida del servicio de resaltado', 'details' => $responseBody];
        send_json_response(false, $error_details['error'] ?? 'El servicio de resaltado falló.', [], $error_details['details'] ?? 'Sin detalles técnicos.');
    }
    exit;

  // --- AQUÍ VAN LOS OTROS 'CASE' DE TU APLICACIÓN (search, list, upload, etc.) ---
  
  default:
    send_json_response(false, 'Acción no reconocida o no especificada.');
    break;
}
?>