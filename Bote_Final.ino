#include <WiFiS3.h>                   // Librería para conexión WiFi con placas basadas en WiFiNINA (como Arduino UNO R4 WiFi)
#include <WiFiSSLClient.h>           // Cliente SSL para conexiones HTTPS
#include <ArduinoHttpClient.h>       // Librería para realizar peticiones HTTP
#include <Servo.h>                   // Librería para controlar servomotores

// Credenciales WiFi
const char ssid[] = "iPhone de Alberto"; 
const char pass[] = "KickedDust327";

// Variable para controlar cambios de nivel
int lastFillLevel = -1;  // Valor imposible para forzar la primera actualización

// Inicialización del cliente HTTPS
WiFiSSLClient wifiSSL;
HttpClient client = HttpClient(wifiSSL, "jqmqzjmkqkpgepmwzxdp.supabase.co", 443);

// Declaración del servo
Servo myservo;

// Pines para sensores ultrasónicos (1: apertura, 2: llenado)
const int trigPin = 4;
const int echoPin = 3;
const int trigPin2 = 6;
const int echoPin2 = 5;

// API KEY de Supabase y el ID del contenedor
const char* API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxbXF6am1rcWtwZ2VwbXd6eGRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3NzQ1OTIsImV4cCI6MjA2MTM1MDU5Mn0.NZqE-Mg-Tv18L-SXrUvGFkuTN_bKg9u6YSABkGGwQ_o";
const char* CONTAINER_ID = "592434a8-5b38-47c8-8911-baa168c55a1c";

// Variables de distancia y control
int distance, distance2;
bool lastOpened = false;
bool wasFull = false;

void setup() {
  Serial.begin(9600);           // Iniciar comunicación serie
  myservo.attach(8);            // Conectar servo al pin 8
  myservo.write(0);             // Asegura que la tapa inicie cerrada

  pinMode(trigPin, OUTPUT);     // Configurar pin del sensor 1 como salida
  pinMode(echoPin, INPUT);      // Configurar pin del sensor 1 como entrada
  pinMode(trigPin2, OUTPUT);    // Sensor 2 (llenado)
  pinMode(echoPin2, INPUT);
  pinMode(11, OUTPUT);          // LED indicador de apertura
  pinMode(12, OUTPUT);          // LED indicador de llenado

  connectWiFi();                // Conectar al WiFi
}

void connectWiFi() {
  Serial.print("Conectando a WiFi...");
  while (WiFi.begin(ssid, pass) != WL_CONNECTED) {  // Esperar conexión
    Serial.print(".");
    delay(1000);
  }
  Serial.println("\nConectado a WiFi");
}

// Función para obtener distancia de un sensor ultrasónico
int getDistance(int trig, int echo) {
  digitalWrite(trig, LOW);         
  delayMicroseconds(2);           
  digitalWrite(trig, HIGH);       // Disparo de 10µs
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duration = pulseIn(echo, HIGH);   // Medición del eco
  return duration * 0.034 / 2;           // Conversión a cm
}

// Enviar evento de apertura a Supabase
void sendToSupabase() {
  String payload = "{";
  payload += "\"bin_id\": \"" + String(CONTAINER_ID) + "\",";
  payload += "\"event_type\": \"APERTURA\",";
  payload += "\"description\": \"Apertura automática del contenedor\"";
  payload += "}";

  // Realizar solicitud POST
  client.beginRequest();
  client.post("/rest/v1/bin_events");
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("apikey", API_KEY);
  client.sendHeader("Authorization", "Bearer " + String(API_KEY));
  client.sendHeader("Prefer", "return=representation");
  client.sendHeader("Content-Length", payload.length());
  client.beginBody();
  client.print(payload);
  client.endRequest();

  int status = client.responseStatusCode();     // Código de estado HTTP
  String response = client.responseBody();      // Respuesta de Supabase
  Serial.print("Status: "); Serial.println(status);
  Serial.print("Response: "); Serial.println(response);
}

// Enviar evento de llenado a Supabase
void sendFullEvent() {
  String payload = "{";
  payload += "\"bin_id\": \"" + String(CONTAINER_ID) + "\",";
  payload += "\"event_type\": \"LLENADO\",";
  payload += "\"description\": \"Nivel crítico alcanzado\"";
  payload += "}";

  client.beginRequest();
  client.post("/rest/v1/bin_events");
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("apikey", API_KEY);
  client.sendHeader("Authorization", "Bearer " + String(API_KEY));
  client.sendHeader("Prefer", "return=representation");
  client.sendHeader("Content-Length", payload.length());
  client.beginBody();
  client.print(payload);
  client.endRequest();

  int status = client.responseStatusCode();
  String response = client.responseBody();
  Serial.print("Status (FULL): "); Serial.println(status);
  Serial.print("Response: "); Serial.println(response);
}

// Actualizar nivel de llenado del contenedor en Supabase
void updateTrashBin(float distance2_cm) {
  int fill_level = map(distance2_cm, 30, 10, 0, 100); // Mapea distancia a porcentaje
  fill_level = constrain(fill_level, 0, 100);         // Limita el valor entre 0-100

  bool is_open = (fill_level >= 100);  // Considera abierto si está lleno

  // Construir JSON
  String payload = "{";
  payload += "\"fill_level\": " + String(fill_level) + ",";
  payload += "\"is_open\": " + String(is_open ? "true" : "false") + ",";
  payload += "\"updated_at\": \"" + getCurrentISOTime() + "\"";
  payload += "}";

  String endpoint = "/rest/v1/trash_bins?id=eq." + String(CONTAINER_ID);

  // Enviar solicitud PATCH
  client.beginRequest();
  client.patch(endpoint.c_str());
  client.sendHeader("Content-Type", "application/json");
  client.sendHeader("apikey", API_KEY);
  client.sendHeader("Authorization", "Bearer " + String(API_KEY));
  client.sendHeader("Prefer", "return=representation");
  client.sendHeader("Content-Length", payload.length());
  client.beginBody();
  client.print(payload);
  client.endRequest();

  int status = client.responseStatusCode();
  String response = client.responseBody();
  Serial.print("Status (UPDATE): "); Serial.println(status);
  Serial.print("Response: "); Serial.println(response);
}

// Obtener hora simulada en formato ISO (puede mejorarse con NTP)
String getCurrentISOTime() {
  return "2025-05-19T12:00:00Z";  // Fecha y hora simulada
}

void loop() {
  distance = getDistance(trigPin, echoPin);   // Distancia frontal (para apertura)
  delay(50);
  distance2 = getDistance(trigPin2, echoPin2); // Distancia superior (nivel de llenado)

  int fill_level = map(distance2, 30, 10, 0, 100);  // Mapea distancia a % de llenado
  fill_level = constrain(fill_level, 0, 100);       // Limita entre 0-100
  bool isFull = (distance2 <= 10);                  // Considera lleno si ≤10cm
  digitalWrite(12, isFull ? HIGH : LOW);            // LED de llenado

  // Actualizar solo si cambia el nivel
  if (fill_level != lastFillLevel) {
    updateTrashBin(distance2);
    lastFillLevel = fill_level;
  }

  // Enviar evento de llenado solo una vez
  if (isFull && !wasFull) {
    sendFullEvent();
    wasFull = true;
  } else if (!isFull) {
    wasFull = false;
  }

  // Abrir tapa automáticamente si detecta movimiento y no está lleno
  if (!isFull && distance <= 30) {
    myservo.write(70);          // Mueve servo para abrir
    digitalWrite(11, HIGH);     // Enciende LED de apertura

    if (!lastOpened) {
      sendToSupabase();         // Enviar evento de apertura
      lastOpened = true;
    }

    delay(1500);                // Espera con la tapa abierta
  } else {
    myservo.write(0);           // Cierra la tapa
    digitalWrite(11, LOW);      // Apaga LED de apertura
    lastOpened = false;
  }

  delay(300);  // Espera antes de la siguiente iteración
}


