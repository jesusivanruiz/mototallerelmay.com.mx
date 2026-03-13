# PRD + Arquitectura Técnica — SaaS Gestión de Taller de Motocicletas
**Versión:** 2.0 | **Fecha:** 20-Feb-2026 | **Autor:** Product Manager + Solution Architect
**Estado:** Aprobado para desarrollo — Post-auditoría de arquitectura

### Changelog v1 → v2
| Cambio | Origen |
|--------|--------|
| Tablas `Taller` y `Usuario` agregadas | Auditoría C1 |
| FKs polimórficas eliminadas en `CotizaciónÍtem` y `MovimientoInventario` | Auditoría C2, C3 |
| Política de stock negativo definida | Auditoría C4 |
| `OT.cliente_id` semántica clarificada como snapshot | Auditoría C5 |
| `created_at`/`updated_at` en todas las tablas | Auditoría I4 |
| Soft delete uniforme documentado | Auditoría I5 |
| Tabla `AuditLog` agregada | Auditoría I6 |
| `creado_por`/`autorizado_por` en Cotización | Auditoría I7 |
| Índices de base de datos documentados | Auditoría I2 |
| Estrategia de generación de folios documentada | Auditoría I3 |
| Stack actualizado: Next.js 15, hosting por fases | Auditoría I1 + decisión de arquitectura |
| Patrón de acceso definido: todo via API Routes | Decisión de arquitectura |
| Prevención de abuso de trial | Observación de revisión |
| Estrategia de backup documentada | Observación de revisión |
| Manejo de errores y transacciones definido | Auditoría R4 |
| Sprint de hardening agregado | Observación de revisión |

---

## 1. Contexto y Objetivo

### Problema
Los talleres de motos pequeños en México (1–5 personas) operan con:
- Órdenes de trabajo en papel o WhatsApp
- Inventario manejado de memoria o en libreta
- Sin historial por cliente ni por moto
- Cotizaciones sin evidencia de autorización
- Discrepancias de stock constantes
- Sin visibilidad de utilidad real por trabajo

### Solución
SaaS por suscripción que digitaliza el flujo completo del taller:

```
Recepción → Diagnóstico → Cotización → Autorización → Reparación → Entrega → Cobro
```

Conectado con inventario en tiempo real y reportes básicos de negocio.

### Cliente objetivo inicial
**Yordi Juárez** — Mecánico joven, dueño y único empleado, usa Mercado Libre/tiendas locales para refacciones, comunica todo por WhatsApp. Representa al segmento: taller pequeño informal que quiere profesionalizarse.

### Modelo de negocio
SaaS por suscripción mensual. El sistema debe ser vendible a cualquier taller, no solo a Yordi.

---

## 2. MVP — Módulos y Alcance

### 6 Módulos

| # | Módulo | Qué entra en MVP | Qué NO entra |
|---|--------|-----------------|--------------|
| **M1** | Recepción + Clientes/Motos | Alta de cliente, alta de moto, búsqueda por nombre/placa/teléfono | Historial fotográfico, agenda de citas |
| **M2** | Órdenes de Trabajo | Crear OT, estados completos, diagnóstico, notas internas, OT de garantía | Asignación multi-técnico, app del cliente |
| **M3** | Cotización + Autorización | Ítems de servicios y refacciones, versiones de cotización, copiar mensaje para WhatsApp, marcar autorización | Firma digital, PDF con branding, envío automático |
| **M4** | Inventario | Catálogo de productos, stock en tiempo real, entradas manuales, descuento automático al usar en OT, venta de mostrador, ajuste de inventario, alertas de mínimo | Código de barras, múltiples almacenes, EDI con proveedor |
| **M5** | Compras + Proveedores | Alta de proveedor, registrar compra con ítems, actualización de stock y costo | PO automatizada, recepción parcial avanzada |
| **M6** | Pagos + Cierre | Registro de pagos por OT (efectivo/transferencia/tarjeta), anticipos, saldo pendiente, utilidad por OT | Facturación SAT (CFDI), TPV integrado |

> **Reportes** van embebidos en cada módulo. No son módulo separado en MVP.

### Prioridad de construcción
1. (**Crítico**) Inventario + OT + Cotización/Autorización
2. (**Alto**) Pagos + Cierre
3. (**Medio**) Compras + Proveedores
4. (**Después del MVP**) Reportes avanzados, CFDI, WhatsApp API

---

## 3. Perfiles de Usuario y Permisos

### 3 Roles

| Rol | Descripción |
|-----|-------------|
| **Dueño/Admin** | Acceso total. Único rol en MVP para Yordi. |
| **Recepcionista** | Atiende clientes, abre OTs, cotiza, registra pagos. No ve costos ni utilidades. |
| **Técnico** | Registra diagnóstico, cambia estado de OT en taller. No ve precios de compra ni utilidades. |

### Tabla de permisos

| Acción | Dueño | Recepción | Técnico |
|--------|:-----:|:---------:|:-------:|
| Ver dashboard completo | ✅ | ✅ | ❌ |
| Crear/editar cliente y moto | ✅ | ✅ | ❌ |
| Abrir y cerrar OT | ✅ | ✅ | ❌ |
| Registrar diagnóstico técnico | ✅ | ❌ | ✅ |
| Crear/editar cotización | ✅ | ✅ | ❌ |
| Marcar autorización del cliente | ✅ | ✅ | ❌ |
| Cambiar estado de OT (taller) | ✅ | ✅ | ✅ |
| Ver y usar inventario en OT | ✅ | ✅ | ✅ |
| Editar precios y costos de inventario | ✅ | ❌ | ❌ |
| Registrar compras y proveedores | ✅ | ✅ | ❌ |
| Registrar pagos | ✅ | ✅ | ❌ |
| Ver utilidades y costos | ✅ | ❌ | ❌ |
| Ajuste manual de inventario | ✅ | ❌ | ❌ |
| Gestionar usuarios del taller | ✅ | ❌ | ❌ |

---

## 4. Modelo de Datos

### Convenciones globales

Todas las tablas de entidades incluyen los siguientes campos de auditoría (no se repiten en cada tabla por brevedad):

| Campo | Tipo | Nota |
|-------|------|------|
| created_at | timestamptz | `DEFAULT NOW()` — inmutable |
| updated_at | timestamptz | `DEFAULT NOW()` — se actualiza con trigger automático en cada UPDATE |

**Soft delete:** Todas las tablas de entidades (marcadas con 🗑️) usan `activo: bool DEFAULT true` en lugar de DELETE físico. Las tablas de eventos (MovimientoInventario, Pago, AuditLog) son inmutables y no tienen soft delete.

**Trigger de `updated_at`** (se aplica a todas las tablas de entidades):
```sql
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de aplicación (repetir para cada tabla de entidades)
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
```

---

### `Taller` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| nombre | string | "Moto Service Yordi" |
| slug | string | UNIQUE. Para URLs: `/t/moto-yordi` |
| telefono_registro | string | Teléfono usado al registrar (prevención de abuso de trial) |
| plan | enum | `trial`, `basico`, `pro`, `taller_plus` |
| trial_inicio | timestamptz | Fecha de inicio del trial |
| trial_fin | timestamptz | Fecha de expiración (trial_inicio + 14 días) |
| stripe_customer_id | string? | Para facturación en fase SaaS |
| moneda | enum | `MXN`, `USD` — default `MXN` |
| config | jsonb? | Configuraciones del taller (formato de folio, zona horaria, etc.) |
| activo | bool | Soft delete / suspensión por falta de pago |

> **Prevención de abuso de trial:** No se permite crear un nuevo taller con un `telefono_registro` que ya existe en otro taller con trial activo o con suscripción vigente. La validación ocurre en la capa de aplicación (API Route) al momento del registro. En fase SaaS futura se puede reforzar con verificación por SMS.

---

### `Usuario` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK = Supabase Auth UID |
| taller_id | FK → Taller | Multi-tenant |
| nombre | string | |
| email | string | UNIQUE |
| rol | enum | `owner`, `recepcionista`, `tecnico` |
| activo | bool | |

> **Relación con Supabase Auth:** El `id` de Usuario es el mismo UUID que genera Supabase Auth al registrar al usuario. La tabla `usuarios` extiende los datos de auth con el contexto del taller y rol. El RLS de todas las tablas se resuelve consultando `auth.uid()` → `usuarios.taller_id`.

---

### `Cliente` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | Multi-tenant |
| nombre_completo | string | |
| teléfono | string | Principal, WhatsApp |
| email | string? | Opcional |
| notas | text? | |
| activo | bool | Soft delete |

---

### `Motocicleta` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| cliente_id | FK → Cliente | Dueño actual |
| taller_id | FK → Taller | |
| marca | string | |
| modelo | string | |
| año | int | |
| color | string? | |
| placa | string? | |
| vin | string? | Número de serie |
| km_actuales | int? | Se actualiza en cada entrada |
| notas | text? | |
| foto_url | string? | |
| activo | bool | |

---

### `OrdenDeTrabajo` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| folio | string | Auto-generado: `OT-2025-0001` (ver §4.1) |
| taller_id | FK → Taller | Multi-tenant |
| moto_id | FK → Motocicleta | |
| cliente_id | FK → Cliente | **Snapshot:** quién trajo la moto en ESTA visita, no necesariamente el dueño actual de la moto. No se actualiza si la moto cambia de dueño después. |
| tipo | enum | `servicio`, `diagnóstico`, `garantía`, `venta_mostrador` |
| estado | enum | Ver §5 |
| descripción_cliente | text | Lo que dijo el cliente |
| diagnóstico_técnico | text? | |
| km_entrada | int? | |
| diagnóstico_cobrado | bool | ¿Se cobra el diagnóstico aparte? |
| costo_diagnóstico | decimal? | |
| ot_origen_id | FK → OT? | Solo si tipo = garantía |
| garantía_días | int? | |
| fecha_entrada | timestamptz | |
| fecha_estimada | date? | Promesa al cliente |
| fecha_cierre | timestamptz? | |
| notas_internas | text? | |
| creado_por | FK → Usuario | |
| activo | bool | |

---

### `Cotización` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| ot_id | FK → OT | |
| versión | int | 1, 2, 3… |
| estado | enum | `borrador`, `enviada`, `autorizada`, `rechazada` |
| subtotal | decimal | |
| descuento | decimal | |
| total | decimal | |
| medio_autorización | enum? | `en_persona`, `whatsapp`, `otro` |
| fecha_autorización | timestamptz? | |
| notas_autorización | text? | |
| creado_por | FK → Usuario | Quién creó esta versión de la cotización |
| autorizado_por | FK → Usuario? | Quién registró la autorización en el sistema |
| activo | bool | |

---

### `CotizaciónÍtem`
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| cotización_id | FK → Cotización | |
| tipo | enum | `servicio`, `refacción` |
| producto_id | FK → Producto? | Cuando `tipo = refacción`. NULL si ítem manual. |
| catalogo_servicio_id | FK → CatálogoServicio? | Cuando `tipo = servicio`. NULL si ítem manual. |
| descripción | string | Editable aunque venga de catálogo |
| cantidad | decimal | |
| precio_unitario | decimal | Fijado al momento de cotizar |
| costo_unitario | decimal | Para calcular margen |

**Constraint de integridad referencial:**
```sql
ALTER TABLE cotizacion_items ADD CONSTRAINT chk_referencia_tipo CHECK (
  (tipo = 'refaccion' AND producto_id IS NOT NULL AND catalogo_servicio_id IS NULL)
  OR (tipo = 'servicio' AND catalogo_servicio_id IS NOT NULL AND producto_id IS NULL)
  OR (producto_id IS NULL AND catalogo_servicio_id IS NULL)  -- ítem manual sin catálogo
);
```

> **Sin `taller_id`:** Esta tabla siempre se accede vía JOIN con `Cotización` (que sí tiene `taller_id` vía OT). Todo acceso pasa por API Routes, nunca queries directos desde el frontend. Ver §7.1.

---

### `CatálogoServicio` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| nombre | string | "Afinación básica" |
| descripción | text? | |
| precio_sugerido | decimal | |
| tiempo_estimado_min | int? | |
| activo | bool | |

---

### `Producto` (Inventario) 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| sku | string? | Opcional en MVP |
| nombre | string | |
| descripción | text? | |
| categoría | string? | |
| precio_venta | decimal | |
| costo_promedio | decimal | Promedio ponderado móvil |
| stock_actual | decimal | Soporta fracciones (litros). Puede ser negativo (ver §4.2) |
| stock_mínimo | decimal | Umbral para alerta |
| unidad | enum | `pieza`, `litro`, `metro`, `kit` |
| activo | bool | |

---

### `MovimientoInventario` *(inmutable — sin soft delete)*
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| producto_id | FK → Producto | |
| tipo | enum | `entrada_compra`, `salida_ot`, `venta_mostrador`, `ajuste_positivo`, `ajuste_negativo`, `devolucion_ot` |
| cantidad | decimal | Siempre positivo; el tipo determina el signo |
| costo_unitario | decimal? | Para entradas |
| precio_unitario | decimal? | Para salidas/ventas |
| ot_id | FK → OrdenDeTrabajo? | Para `salida_ot`, `venta_mostrador`, `devolucion_ot` |
| compra_id | FK → Compra? | Para `entrada_compra` |
| notas | text? | Para ajustes: razón del ajuste |
| creado_por | FK → Usuario | |

> **Sin `referencia_tipo`/`referencia_id`:** Se reemplazó la FK polimórfica con FKs explícitas (`ot_id`, `compra_id`). Los ajustes no requieren FK — son movimientos independientes con `notas` como justificación.

---

### `Proveedor` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| nombre | string | |
| teléfono | string? | |
| email | string? | |
| url | string? | Tienda en línea |
| notas | text? | |
| activo | bool | |

---

### `Compra` 🗑️
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| proveedor_id | FK → Proveedor? | Nullable si es compra casual |
| fecha | date | |
| folio_externo | string? | Número de factura del proveedor |
| estado | enum | `pendiente`, `recibida` |
| total | decimal | |
| notas | text? | |
| creado_por | FK → Usuario | |
| activo | bool | |

---

### `CompraÍtem`
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| compra_id | FK → Compra | |
| producto_id | FK → Producto | |
| cantidad | decimal | |
| costo_unitario | decimal | |

> **Sin `taller_id`:** Misma razón que CotizaciónÍtem. Se accede vía JOIN con Compra.

---

### `Pago` *(inmutable — sin soft delete)*
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| ot_id | FK → OrdenDeTrabajo | |
| tipo | enum | `anticipo`, `parcial`, `final` |
| monto | decimal | |
| método | enum | `efectivo`, `transferencia`, `tarjeta` |
| referencia | string? | Últimos 4 dígitos o clave rastreo |
| notas | text? | |
| creado_por | FK → Usuario | |

> **Pagos son inmutables.** Si un pago se registró por error, se crea un pago de ajuste con monto negativo y nota explicativa. No se borran ni editan pagos.

---

### `AuditLog` *(inmutable — sin soft delete)*
| Campo | Tipo | Nota |
|-------|------|------|
| id | UUID | PK |
| taller_id | FK → Taller | |
| usuario_id | FK → Usuario | |
| accion | string | `ot.estado_cambiado`, `producto.precio_editado`, `inventario.ajuste`, etc. |
| tabla | string | Nombre de la tabla afectada |
| registro_id | UUID | ID del registro afectado |
| datos_antes | jsonb? | Snapshot del estado anterior (solo para updates) |
| datos_despues | jsonb? | Snapshot del estado nuevo |
| created_at | timestamptz | |

> **¿Qué se audita?** Cambios de estado de OT, ediciones de precio/costo de productos, ajustes manuales de inventario, cambios de permisos de usuarios, y autorizaciones de cotización. No se audita: lecturas, ni creación de entidades nuevas (eso ya lo cubre `created_at` + `creado_por`).

---

### 4.1 Generación de Folios

Los folios de OT siguen el formato `OT-{AÑO}-{CONSECUTIVO}` y son únicos por taller.

```sql
CREATE TABLE folio_sequences (
  taller_id  UUID REFERENCES talleres(id),
  prefijo    VARCHAR(10) DEFAULT 'OT',
  año        INT,
  siguiente  INT DEFAULT 1,
  PRIMARY KEY (taller_id, prefijo, año)
);

CREATE OR REPLACE FUNCTION fn_generar_folio(p_taller_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_num INT;
  v_año INT := EXTRACT(YEAR FROM NOW());
BEGIN
  INSERT INTO folio_sequences (taller_id, prefijo, año, siguiente)
  VALUES (p_taller_id, 'OT', v_año, 1)
  ON CONFLICT (taller_id, prefijo, año)
  DO UPDATE SET siguiente = folio_sequences.siguiente + 1
  RETURNING siguiente INTO v_num;

  RETURN FORMAT('OT-%s-%s', v_año, LPAD(v_num::TEXT, 4, '0'));
END;
$$ LANGUAGE plpgsql;
```

> La generación es atómica vía `ON CONFLICT ... DO UPDATE` para evitar race conditions si dos OTs se crean simultáneamente.

---

### 4.2 Política de Stock Negativo

**Decisión: Permitir stock negativo con alerta.**

Justificación: En la operación real del taller, es común usar una pieza y registrar la compra después. Bloquear la salida de inventario frenaría al mecánico en medio de una reparación.

Comportamiento:
1. Cuando `stock_actual` de un producto queda por debajo de `stock_mínimo` → la API genera un registro de alerta (evento `stock_bajo_detectado`).
2. Cuando `stock_actual` queda negativo → la API genera una alerta de tipo `stock_negativo` más prominente.
3. La lógica de alerta se ejecuta en la **capa de aplicación** (API Route), no en triggers de base de datos. Razón: los triggers son difíciles de debuggear y mantener; la lógica de negocio es más visible y testeable en la aplicación.
4. El dashboard muestra productos con stock negativo en rojo como indicador de discrepancia pendiente.

> **Lo que SÍ se enforce a nivel de base de datos:** Los CHECK constraints y las validaciones de transiciones de estado de OT (ver §5.1), porque estas son reglas de integridad de datos, no lógica de negocio.

---

### 4.3 Índices de Base de Datos

```sql
-- Búsquedas frecuentes del día a día
CREATE INDEX idx_ot_taller_estado    ON ordenes_de_trabajo(taller_id, estado);
CREATE INDEX idx_ot_taller_fecha     ON ordenes_de_trabajo(taller_id, fecha_entrada DESC);
CREATE INDEX idx_cliente_telefono    ON clientes(taller_id, telefono);
CREATE INDEX idx_moto_placa          ON motocicletas(taller_id, placa) WHERE placa IS NOT NULL;
CREATE INDEX idx_producto_nombre     ON productos(taller_id, nombre);
CREATE INDEX idx_movimiento_producto ON movimientos_inventario(producto_id, created_at DESC);
CREATE INDEX idx_pago_ot             ON pagos(ot_id);

-- Folio único por taller
CREATE UNIQUE INDEX idx_ot_folio     ON ordenes_de_trabajo(taller_id, folio);

-- AuditLog: búsqueda por registro
CREATE INDEX idx_audit_registro      ON audit_log(tabla, registro_id);
CREATE INDEX idx_audit_taller_fecha  ON audit_log(taller_id, created_at DESC);
```

---

## 5. Estados de la Orden de Trabajo

### Diagrama de flujo

```
abierta ──────────────────────────────────────────────► cancelada
  │
  ▼
en_diagnóstico ────────────────────────────────────────► cancelada
  │
  ├─► [diagnóstico pagado, sin reparación] ──────────► cerrada
  │
  ▼
pendiente_autorización ────────────────────────────────► cancelada (cliente rechazó)
  │
  ▼
autorizada
  │
  ▼
en_reparación ◄────────────────────────────────────────┐
  │                                                    │
  ├─► en_espera_refacción (llegó pieza) ──────────────►┘
  │         │
  │         └──────────────────────────────────────────► cancelada
  │
  ▼
lista_para_entrega
  │
  ▼
entregada ──────────────────────────────────────────────► [nueva OT garantía]
  │
  ▼
cerrada ────────────────────────────────────────────────► [nueva OT garantía]
```

> **Garantía:** No es un estado. Genera una **nueva OT** con `tipo = garantía` vinculada a la OT original via `ot_origen_id`.

### Transiciones permitidas

| Estado actual | Puede ir a | Quién autoriza |
|--------------|-----------|----------------|
| `abierta` | `en_diagnóstico`, `cancelada` | Dueño, Recepción |
| `en_diagnóstico` | `pendiente_autorización`, `autorizada`*, `cerrada`†, `cancelada` | Técnico, Dueño |
| `pendiente_autorización` | `autorizada`, `cancelada` | Dueño, Recepción |
| `autorizada` | `en_reparación`, `cancelada` | Dueño, Recepción |
| `en_reparación` | `en_espera_refacción`, `lista_para_entrega`, `cancelada` | Técnico, Dueño |
| `en_espera_refacción` | `en_reparación`, `cancelada` | Dueño, Recepción |
| `lista_para_entrega` | `entregada` | Dueño, Recepción |
| `entregada` | `cerrada` | Dueño, Recepción |
| `cerrada` | *(terminal)* | — |
| `cancelada` | *(terminal)* | — |

> \* Sin cotización cuando el servicio es obvio y cliente ya autorizó en persona.
> † Diagnóstico cobrado y cliente no continúa → cierre directo.

### 5.1 Validación de transiciones en base de datos

Las transiciones de estado se validan con un trigger que impide estados inválidos a nivel de Postgres:

```sql
CREATE OR REPLACE FUNCTION fn_validar_transicion_ot()
RETURNS TRIGGER AS $$
DECLARE
  transiciones JSONB := '{
    "abierta": ["en_diagnostico", "cancelada"],
    "en_diagnostico": ["pendiente_autorizacion", "autorizada", "cerrada", "cancelada"],
    "pendiente_autorizacion": ["autorizada", "cancelada"],
    "autorizada": ["en_reparacion", "cancelada"],
    "en_reparacion": ["en_espera_refaccion", "lista_para_entrega", "cancelada"],
    "en_espera_refaccion": ["en_reparacion", "cancelada"],
    "lista_para_entrega": ["entregada"],
    "entregada": ["cerrada"],
    "cerrada": [],
    "cancelada": []
  }'::JSONB;
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    IF NOT transiciones->OLD.estado ? NEW.estado THEN
      RAISE EXCEPTION 'Transición no válida: % → %', OLD.estado, NEW.estado;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_transicion_ot
BEFORE UPDATE ON ordenes_de_trabajo
FOR EACH ROW EXECUTE FUNCTION fn_validar_transicion_ot();
```

> **¿Por qué esto SÍ es un trigger y las alertas de stock NO?** Porque la integridad de transiciones de estado es una regla estructural que nunca debe violarse, independientemente de bugs en la aplicación. Las alertas de stock son lógica de negocio que puede evolucionar.

### Casos de Diagnóstico

| Caso | Comportamiento |
|------|---------------|
| Diagnóstico incluido en servicio | `diagnóstico_cobrado = false`, costo absorbido en cotización |
| Diagnóstico cobrado + cliente continúa | `diagnóstico_cobrado = true`, aparece como ítem en cotización |
| Diagnóstico cobrado + cliente NO continúa | OT cierra directamente con pago solo del diagnóstico |
| Check-up preventivo | `tipo = diagnóstico`, cierra con pago de revisión |

### Casos de Movimiento de Inventario

| Caso | Cómo se modela |
|------|---------------|
| Refacción usada en OT | `salida_ot` con `ot_id` + ítem en cotización |
| Refacción no usada, regresa al stock | `devolucion_ot` con `ot_id` |
| Venta de mostrador (sin OT) | OT `tipo = venta_mostrador` → `venta_mostrador` con `ot_id` |
| Refacción trajo el cliente | Ítem con nota "POR CLIENTE", no toca inventario |
| Uso parcial (ej. medio litro de aceite) | Cantidad decimal en `MovimientoInventario` |

---

## 6. Eventos de Analítica del Producto

| # | Evento | Cuándo se dispara | Propiedades clave |
|---|--------|-------------------|-------------------|
| 1 | `ot_created` | Al guardar OT nueva | `tipo_ot`, `es_cliente_nuevo`, `tiene_foto_moto`, `canal` |
| 2 | `diagnostico_registrado` | Al guardar diagnóstico en OT | `ot_id`, `diagnóstico_cobrado`, `tiempo_desde_apertura_min` |
| 3 | `cotizacion_generada` | Al crear/versionar cotización | `ot_id`, `versión`, `total`, `items_count`, `tiene_refacciones`, `tiene_servicios` |
| 4 | `cotizacion_autorizada` | Al marcar autorizada | `ot_id`, `total`, `medio_autorización`, `tiempo_desde_envío_min`, `versión` |
| 5 | `cotizacion_rechazada` | Al marcar rechazada | `ot_id`, `total`, `razón`, `tiempo_desde_envío_min` |
| 6 | `ot_estado_cambiado` | Cada cambio de estado | `ot_id`, `estado_anterior`, `estado_nuevo`, `tiempo_en_estado_min` |
| 7 | `pago_registrado` | Al guardar un pago | `ot_id`, `tipo`, `método`, `monto`, `saldo_pendiente_resultante` |
| 8 | `ot_cerrada` | Al pasar a `cerrada` | `ot_id`, `tipo_ot`, `duración_total_horas`, `total_cobrado`, `margen_bruto`, `métodos_pago_usados[]` |
| 9 | `stock_bajo_detectado` | Al quedar producto ≤ mínimo | `producto_id`, `nombre`, `stock_actual`, `stock_mínimo` |
| 10 | `compra_registrada` | Al guardar compra | `proveedor_id`, `tiene_proveedor`, `items_count`, `total` |

**Cobertura:** Activación (1–3) · Retención (7–8·10) · Fricción (5–6) · Salud de inventario (9)

---

## 7. Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|--------------|
| Frontend | Next.js 15 (React 19) | Mobile-first, SSR, App Router estable, un solo lenguaje |
| Estilos | Tailwind CSS | UI rápida y consistente |
| API | Next.js API Routes (Route Handlers) | Sin servidor separado en MVP |
| Base de datos | PostgreSQL vía Supabase Cloud | RLS nativo para multi-tenant, tier gratuito 500 MB |
| Autenticación | Supabase Auth | Email/contraseña y magic link |
| Archivos | Supabase Storage | Fotos de motos, evidencias (tier gratuito 1 GB) |
| Hosting (Fase Yordi) | Oracle Cloud Free Tier (ARM) | 4 vCPU, 24 GB RAM, 200 GB — costo $0 |
| Hosting (Fase SaaS) | Vercel Pro o VPS | Migración sin cambios de código |
| Analítica | PostHog | Open source, tier gratuito, eventos en tiempo real |
| Suscripciones SaaS | Stripe | Acepta MXN, maneja planes y trials (solo fase SaaS) |
| WhatsApp | Web Share API (nativo) | Copiar mensaje al portapapeles, sin API externa |

### 7.1 Patrón de Acceso a Datos

**Decisión: Todo el acceso a Supabase pasa por API Routes de Next.js.** El frontend nunca ejecuta queries directos contra Supabase.

```
┌──────────────┐     HTTPS      ┌──────────────────┐     SQL/RLS     ┌─────────────┐
│  React UI    │ ──────────────► │  API Routes      │ ──────────────► │  Supabase   │
│  (browser)   │                 │  (Next.js server)│                 │  (Postgres) │
└──────────────┘                 └──────────────────┘                 └─────────────┘
```

**Implicaciones:**
- Las validaciones de negocio, permisos y lógica de transacciones viven en las API Routes.
- El RLS de Supabase actúa como segunda capa de seguridad (defense in depth), no como la única.
- Las tablas hijas (`CotizaciónÍtem`, `CompraÍtem`) no necesitan `taller_id` porque nunca se consultan directamente desde el frontend.
- El cliente de Supabase (`@supabase/supabase-js`) se usa **solo del lado servidor** (en API Routes), autenticado con la service role key.

---

## 8. Arquitectura de Infraestructura

### 8.1 Fase Yordi — Piloto con un taller (costo ~$15 USD/año)

```
┌──────────────────────────────────────┐
│  Oracle Cloud Free Tier (ARM)        │
│  ┌────────────────────────────────┐  │
│  │  Docker                        │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │  Next.js App (Node.js)   │  │  │
│  │  │  Puerto 3000             │  │  │
│  │  └───────────┬──────────────┘  │  │
│  │              │                 │  │
│  │  ┌───────────┴──────────────┐  │  │
│  │  │  Nginx (reverse proxy)   │  │  │
│  │  │  SSL via Let's Encrypt   │  │  │
│  │  │  Puerto 443              │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
               │
               │ HTTPS (API calls)
               ▼
┌──────────────────────────────────────┐
│  Supabase Cloud (Free Tier)          │
│  • PostgreSQL 500 MB                 │
│  • Auth (email/contraseña)           │
│  • Storage 1 GB (fotos de motos)     │
│  • RLS activo                        │
│  • Backup diario (retención 7 días)  │
└──────────────────────────────────────┘
```

**Costo:** Solo el dominio (~$10-15 USD/año). La instancia de Oracle es de la cuenta propia de Yordi, reutilizable para su sitio web, tienda y otros proyectos.

### 8.2 Fase SaaS — Múltiples talleres (costo ~$50-70 USD/mes)

```
Vercel Pro / VPS  +  Supabase Pro  +  Stripe  +  PostHog
```

**Migración:** No requiere cambios de código en la aplicación. Solo se actualizan variables de entorno (URL de Supabase, keys) y se cambia el destino de deploy.

### 8.3 Estrategia de Backups

| Fase | Qué cubre | Retención | Point-in-Time Recovery |
|------|-----------|-----------|----------------------|
| Yordi (Supabase Free) | Backup diario automático de Supabase | 7 días | ❌ No disponible |
| SaaS (Supabase Pro) | Backup diario + PITR | 7 días + PITR | ✅ Hasta cualquier segundo de los últimos 7 días |

**Limitación conocida en Fase Yordi:** Si se borran datos por error un viernes y nadie lo nota hasta el lunes, el backup del viernes ya expiró si pasaron más de 7 días. Mitigación: la aplicación usa soft delete (nunca DELETE físico) y la tabla `AuditLog` permite reconstruir el estado anterior.

> **Plan para v2:** Agregar export manual a CSV/JSON desde el dashboard del dueño como backup controlado por el usuario.

---

## 9. Arquitectura Multi-Tenant

### Estrategia: Shared Database + Row Level Security

Todos los talleres comparten la misma base de datos. Cada tabla principal tiene una columna `taller_id`. La base de datos aplica **Row Level Security (RLS)** para garantizar que ningún taller acceda a datos de otro, sin importar el código de la aplicación.

```
Yordi inicia sesión
  → Supabase sabe que su taller_id = "taller-yordi"
  → TODA consulta filtra automáticamente WHERE taller_id = 'taller-yordi'
  → Un bug en el código NO puede exponer datos de otro taller
```

### Flujo de alta de un nuevo taller

```
1. Taller llega a /registro
2. Ingresa: nombre del taller, nombre, teléfono, email, contraseña
3. Validación anti-abuso: ¿telefono_registro ya existe en otro taller activo/trial?
   ├── SÍ → Rechazar registro, mostrar mensaje
   └── NO → Continuar
4. Sistema crea (en transacción):
   ├── Usuario en Supabase Auth
   ├── Registro en tabla `talleres` (nombre, plan=trial, trial_inicio, trial_fin)
   ├── Registro en tabla `usuarios` (rol=owner, taller_id)
   └── Registro en `folio_sequences` (taller_id, prefijo='OT', año actual, siguiente=1)
5. Usuario entra al panel → taller vacío, listo para operar
```

### Planes de suscripción sugeridos

| Plan | Precio MXN/mes | Usuarios | OTs/mes |
|------|---------------|---------|---------|
| Trial | $0 (14 días) | Todos | Ilimitadas |
| Básico | $299 | 1 | 50 |
| Pro | $599 | 3 | Ilimitadas + reportes |
| Taller+ | $999 | 5 | Ilimitadas + multi-sucursal + soporte |

---

## 10. Manejo de Errores y Transacciones

### Principio: Operaciones críticas en transacción

Las siguientes operaciones involucran múltiples tablas y deben ejecutarse como transacción atómica. Si falla cualquier paso, se revierte todo (rollback).

| Operación | Tablas involucradas | Qué pasa si falla |
|-----------|--------------------|--------------------|
| Registrar uso de refacción en OT | `MovimientoInventario` + `Producto.stock_actual` + `CotizaciónÍtem` | Rollback completo. No se descuenta stock ni se agrega ítem. |
| Registrar compra con ítems | `Compra` + `CompraÍtem` + `MovimientoInventario` + `Producto.stock_actual` + `Producto.costo_promedio` | Rollback completo. No se actualiza stock ni costo. |
| Cerrar OT | `OrdenDeTrabajo.estado` + validación de saldo + `AuditLog` | Rollback. OT permanece en estado anterior. |
| Registrar pago | `Pago` + recálculo de saldo en OT + `AuditLog` | Rollback. Ni se registra pago ni se modifica saldo. |

### Implementación

Las transacciones se ejecutan usando el cliente de Supabase con `rpc()` (funciones de Postgres) o mediante queries SQL directos con `BEGIN/COMMIT/ROLLBACK` en las API Routes.

```
API Route recibe request
  → Valida datos de entrada (zod)
  → Valida permisos del usuario (rol + taller_id)
  → Ejecuta transacción en Supabase
    ├── Paso 1...
    ├── Paso 2...
    └── Si error → ROLLBACK + respuesta 500 con mensaje claro
  → Si éxito → COMMIT + respuesta 200
  → Emite evento de analítica (PostHog) — fuera de la transacción
```

> **Los eventos de analítica se emiten DESPUÉS de la transacción**, no dentro de ella. Si PostHog falla, la operación de negocio no se afecta.

---

## 11. Plan de Desarrollo — 8 Sprints (15 semanas)

> **Supuesto:** 1 desarrollador full-stack con apoyo de IA, a tiempo completo.

| Sprint | Duración | Entregable | Acumulado |
|--------|---------|-----------|-----------|
| **S0** Cimientos | 1 sem | Proyecto en Oracle, tablas + RLS en Supabase, login, tablas Taller/Usuario, folio_sequences, triggers base | 1 sem |
| **S1** Recepción + OT | 2 sem | Alta de clientes/motos, crear OT con folio, lista de OTs por estado, trigger de transiciones | 3 sem |
| **S2** Cotización + Auth | 2 sem | Diagnóstico, cotización con ítems (FKs correctas), copiar WhatsApp, marcar autorización, AuditLog | 5 sem |
| **S3** Inventario | 2 sem | Catálogo, stock en tiempo real, descuento transaccional en OT, alertas en app layer | 7 sem |
| **S4** Pagos + Cierre | 2 sem | Registrar pagos, anticipos, cerrar OT transaccional, utilidad por OT | 9 sem |
| **S4.5** Hardening | 1 sem | Yordi en producción real. Bugs, UX, edge cases, feedback directo. Estabilización. | 10 sem |
| **S5** Compras + Proveedores | 2 sem | Alta proveedor, registrar compra transaccional, actualizar stock + costo promedio | 12 sem |
| **S6** Analítica + Reportes | 1 sem | PostHog integrado, dashboard básico, historial por cliente | 13 sem |
| **S7** SaaS público | 2 sem | Landing, registro de taller con anti-abuso, Stripe, trial, onboarding | **15 sem** |

### Hitos clave

> **Al terminar S4 (~9 semanas):** Yordi puede usar el sistema en producción en su taller real.
>
> **S4.5 (semana 10):** Sprint de estabilización con feedback de Yordi en uso real. No se agrega funcionalidad nueva; se pulen bugs, UX y edge cases del mundo real.
>
> **Al terminar S7 (~15 semanas):** SaaS listo para registro público de talleres.

---

## 12. Decisiones de Diseño + Supuestos

| Tema | Decisión tomada |
|------|----------------|
| Autorización de cotización | Checkbox en sistema + nota de medio (WhatsApp/en persona). Sin firma digital en MVP. |
| Multi-sucursal | Arquitectura preparada (multi-tenant) pero UI single-sucursal en MVP. |
| Offline | MVP requiere conexión. Consulta offline de OTs abiertas en v2. |
| WhatsApp | Mensaje pre-redactado + botón "Copiar". Sin API de WhatsApp Business en MVP. |
| Garantías | Nueva OT con `tipo = garantía` vinculada a OT origen via `ot_origen_id`. |
| Diagnóstico | Campo en OT: `diagnóstico_cobrado` (bool) + `costo_diagnóstico`. 4 casos cubiertos. |
| Inventario fraccional | `stock_actual` y `cantidad` son `decimal`, no `int`. Soporta litros y metros. |
| Costo de inventario | Costo promedio ponderado móvil. Se recalcula en cada entrada de compra. |
| Venta de mostrador | OT con `tipo = venta_mostrador`. Reutiliza el flujo de OT sin diagnóstico ni cotización. |
| Stock negativo | Se permite con alerta. Lógica de alertas en capa de aplicación, no en triggers. |
| OT.cliente_id | Snapshot: "quién trajo la moto esta vez". No se actualiza si la moto cambia de dueño. |
| FKs polimórficas | Prohibidas. Siempre FKs explícitas con CHECK constraints. |
| Acceso a datos | Todo via API Routes. Frontend nunca ejecuta queries directos contra Supabase. |
| Tablas hijas sin taller_id | `CotizaciónÍtem` y `CompraÍtem` no tienen `taller_id`. Se acceden via JOIN. |
| Soft delete | Uniforme en tablas de entidades (`activo: bool`). Tablas de eventos son inmutables. |
| Pagos | Inmutables. Correcciones vía pago de ajuste con monto negativo. |
| Triggers vs. App logic | Triggers solo para integridad de datos (transiciones de estado, `updated_at`). Lógica de negocio (alertas, notificaciones) en API Routes. |
| Abuso de trial | Validación por `telefono_registro` único por taller activo. SMS en fase SaaS. |
| Backups | Supabase diario (7d). Soft delete + AuditLog como mitigación. Export CSV en v2. |
| Moneda | Campo `moneda` en Taller. Default MXN. Preparado para USD fronterizo. |
