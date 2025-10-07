<?php
// api_actualizado.php: API simplificada con validación de resaltado y envío de PDF.
// Esta versión implementa únicamente las acciones validate_highlight y highlight_pdf.

require_once __DIR__ . '/config.php';

// Devuelve una respuesta JSON estándar y detiene la ejecución
function send_json_response($success, $message, $data = [], $details = '') {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data'    => $data,
        'details' => $details
    ]);
    exit;
}

// Crear conexión PDO a la base de datos
try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    $db  = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    send_json_response(false, 'Error de conexión a la base de datos.', [], $e->getMessage());
}

$action = $_REQUEST['action'] ?? '';

switch ($action) {
    // Validar que el documento exista y que los códigos pertenezcan a ese documento
    case 'validate_highlight':
        $docId    = isset($_POST['id']) ? (int)$_POST['id'] : 0;
        $codesRaw = $_POST['codes'] ?? '';
        $codes    = array_filter(array_map('trim', preg_split('/[\n,]/', $codesRaw)));

        if (!$docId) {
            send_json_response(false, 'Se requiere un ID de documento.', [], 'ID inválido');
        }
        if (empty($codes)) {
            send_json_response(false, 'Debe proporcionar al menos un código para validar.', [], 'Códigos vacíos');
        }
        // Obtener los códigos asociados al documento
        $stmt = $db->prepare('SELECT codes FROM documents WHERE id = ?');
        $stmt->execute([$docId]);
        $codesString = $stmt->fetchColumn();
        if (!$codesString) {
            send_json_response(false, 'El documento no existe.', [], 'ID no encontrado');
        }
        $docCodes = array_filter(array_map('trim', preg_split('/\R/', $codesString)));
        foreach ($codes as $code) {
            if (!in_array($code, $docCodes)) {
                send_json_response(false, "El código {$code} no pertenece al documento.");
            }
        }
        send_json_response(true, 'Validación exitosa.', []);
        break;

    // Enviar el PDF y los códigos al microservicio resaltador
    case 'highlight_pdf':
        // Permitir devolver PDF en binario
        header_remove('Content-Type');
        $docId    = isset($_POST['id']) ? (int)$_POST['id'] : 0;
        $codesRaw = $_POST['codes'] ?? '';
        $codes    = array_filter(array_map('trim', preg_split('/[\n,]/', $codesRaw)));
        if (!$docId) {
            http_response_code(400);
            send_json_response(false, 'El ID del documento no fue recibido por el servidor.', [], 'ID vacío o nulo');
        }
        if (empty($codes)) {
            http_response_code(400);
            send_json_response(false, 'La lista de códigos para resaltar está vacía.', [], 'Códigos vacíos');
        }
        // Obtener ruta del PDF
        $stmt = $db->prepare('SELECT path FROM documents WHERE id = ?');
        $stmt->execute([$docId]);
        $path = $stmt->fetchColumn();
        $fullPath = __DIR__ . '/uploads/' . $path;
        if (!$path || !file_exists($fullPath)) {
            http_response_code(404);
            send_json_response(false, 'El archivo PDF no fue encontrado en el servidor.', [], 'Ruta verificada: ' . $fullPath);
        }
        // Preparar datos para el microservicio resaltador
        $postData = [
            'specific_codes' => implode("\n", $codes),
            'pdf_file'       => new CURLFile($fullPath, 'application/pdf', basename($path))
        ];
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, PDF_HIGHLIGHTER_URL);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        // Capturar cabeceras
        $responseHeaders = [];
        curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($curl, $header) use (&$responseHeaders) {
            $len    = strlen($header);
            $header = explode(':', $header, 2);
            if (count($header) < 2) return $len;
            $responseHeaders[strtolower(trim($header[0]))][] = trim($header[1]);
            return $len;
        });
        $responseBody = curl_exec($ch);
        $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error        = curl_error($ch);
        curl_close($ch);
        // Evaluar respuesta
        if ($httpCode === 200 && isset($responseHeaders['content-type'][0]) && strpos($responseHeaders['content-type'][0], 'application/pdf') !== false) {
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
            // Intentar decodificar error JSON del microservicio
            $errorDetails = json_decode($responseBody, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                send_json_response(false, $errorDetails['error'] ?? 'El servicio de resaltado falló.', [], $errorDetails['details'] ?? 'Sin detalles técnicos.');
            } else {
                send_json_response(false, 'El servicio de resaltado devolvió una respuesta inesperada.', [], $error ? 'cURL error: ' . $error : 'HTTP status: ' . $httpCode . ' | Response: ' . $responseBody);
            }
        }
        exit;
        break;
    default:
        // Para otras acciones no implementadas en esta versión
        send_json_response(false, 'Acción no soportada por esta versión de la API.');
        break;
}
