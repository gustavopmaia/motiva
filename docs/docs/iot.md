---
sidebar_position: 4
title: IoT & Dispositivos
---

# IoT & Dispositivos

## Hardware

Cada nó IoT usa três componentes:

| Componente  | Função                                                                     |
| ----------- | -------------------------------------------------------------------------- |
| **ESP32**   | Microcontrolador principal — WiFi/GSM, lógica de leitura e publicação MQTT |
| **HC-SR04** | Sensor ultrassônico — mede a distância até o topo da vegetação em cm       |
| **SIM800L** | Módulo GSM/GPRS — conectividade via rede celular onde não há WiFi          |

O HC-SR04 é instalado invertido acima da vegetação. A distância medida é convertida em altura da planta subtraindo a distância do sensor ao solo.

## Protocolo MQTT

O broker é Mosquitto. Os sensores IoT publicam leituras no tópico:

```
sensors/{nodeId}/reading
```

O `nodeId` identifica o nó físico. O sistema extrai esse identificador da posição [1] do tópico (`topic.split('/')[1]`) e usa para buscar o sensor cadastrado no banco.

### Payload

O payload é JSON, idêntico ao aceito pelo endpoint HTTP `POST /api/v1/readings`:

```json
{
  "source": "iot",
  "lat": -27.5954,
  "lon": -48.548,
  "heightCm": 45
}
```

`heightCm` é a altura da vegetação em centímetros. O score é calculado no servidor: `score = heightCm × 1,4` (clamped em 100).

### Autenticação MQTT

O nó se autentica com a API Key gerada no cadastro do sensor. A chave é enviada no campo `username` da conexão MQTT (senha em branco).

## Fontes de dados

O sistema aceita três tipos de leitura. Cada uma tem payload distinto:

### IoT — sensor ultrassônico fixo

```json
{
  "source": "iot",
  "lat": -27.5954,
  "lon": -48.548,
  "heightCm": 45
}
```

Fórmula do score: `score = heightCm × 1,4` → clamped [0, 100]

Exemplos:

- 20 cm → score 28
- 45 cm → score 63
- 72+ cm → score 100

### Veículo — câmera embarcada

```json
{
  "source": "vehicle",
  "lat": -27.5954,
  "lon": -48.548,
  "classification": "urgent",
  "confidence": 0.92
}
```

`classification` aceita: `"ok"`, `"attention"`, `"urgent"`.

Fórmula do score:

```
ok        → valor base 10
attention → valor base 50
urgent    → valor base 85

score = valor_base × confidence  →  clamped [0, 100]
```

`confidence` pode vir como 0–1 ou como percentual 0–100 — o sistema normaliza automaticamente.

Exemplos com `confidence: 0.92`:

- ok → 9.2
- attention → 46
- urgent → 78.2

### Satélite — índice NDVI (Sentinel-2)

```json
{
  "source": "satellite",
  "lat": -27.5954,
  "lon": -48.548,
  "ndvi": 0.61
}
```

Fórmula do score:

```
score = (ndvi − 0,2) × 200  →  clamped [0, 100]
```

NDVI de 0,2 (vegetação esparsa) a 0,7 (densa) mapeia linearmente para 0–100. Abaixo de 0,2 → score 0. Acima de 0,7 → score 100.

Exemplos:

- ndvi 0.20 → score 0
- ndvi 0.45 → score 50
- ndvi 0.70 → score 100

## Cadastro de sensor

Sensores são cadastrados pelo manager via API. A API Key gerada é usada para autenticar as leituras.

```
POST /api/v1/auth/api-keys
Authorization: Bearer <token-manager>

{
  "name": "sensor-br101-km10",
  "source": "iot"
}

→ { "key": "<chave-raw>", "id": "...", "name": "sensor-br101-km10" }
```

A chave raw é exibida **uma única vez**. Grave imediatamente no firmware do dispositivo.

## Associação ao segmento

O sensor não precisa saber a qual segmento pertence. Envia lat/lon e o servidor encontra o segmento mais próximo via `ST_Distance` sobre a geometria PostGIS dos segmentos cadastrados.

```sql
ORDER BY ST_Distance(
  geometry::geography,
  ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
)
LIMIT 1
```

## Envio via HTTP

Sensores sem suporte a MQTT podem enviar leituras via HTTP:

```
POST /api/v1/readings
X-Api-Key: <chave-raw>
Content-Type: application/json

{ payload conforme tipo de fonte }
```
