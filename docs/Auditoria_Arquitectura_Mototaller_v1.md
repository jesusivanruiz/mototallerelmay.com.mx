# 🔍 Auditoría de Arquitectura v1 — SaaS Mototaller

**Auditor:** Senior Full-Stack Developer  
**Documento auditado:** PRD_SaaS_Mototaller.md v1.0  
**Fecha:** 20 Feb 2026  
**Veredicto general:** ⭐⭐⭐⭐ (4/5) — Muy sólido para un PRD v1. Pocas correcciones críticas, varios ajustes importantes.

---

## 📊 Resumen Ejecutivo

| Área | Calificación | Notas |
|------|:---:|-------|
| Modelo de datos | 🟢 Bien | Sólido, con ajustes menores necesarios |
| Multi-tenancy | 🟢 Bien | RLS + `taller_id` es la estrategia correcta |
| Flujo de estados OT | 🟢 Bien | Completo, bien documentado |
| Stack tecnológico | 🟡 Aceptable | Buenas decisiones, pero Next.js 14 está desactualizado |
| Seguridad | 🔴 Débil | Faltan validaciones y sanitización |
| Escalabilidad | 🟡 Aceptable | OK para MVP, necesita plan de crecimiento |
| Plan de sprints | 🟡 Aceptable | Ambicioso pero realista con ajustes |
| Manejo de errores | 🔴 Ausente | No documentado en absoluto |

---

## ✅ LO QUE ESTÁ MUY BIEN (no tocar)

### 1. Multi-tenancy con RLS — Decisión correcta
Compartir base de datos con Row Level Security de Supabase es exactamente lo que un SaaS de este tamaño necesita. Esquema por tenant sería over-engineering masivo.

**Por qué esto es profesional:** Si en tu código cometes un bug y haces `SELECT * FROM clientes` sin WHERE, el RLS de Postgres **igual** filtra por taller. Es tu red de seguridad a nivel de base de datos.

### 2. Modelo de datos normalizado y con `taller_id` en cada tabla
Esto es clave para el RLS. Cada tabla tiene su FK al taller, lo que permite políticas RLS simples y performantes.

### 3. Máquina de estados de la OT
El diagrama de flujo es completo y cubre los edge cases reales del negocio (diagnóstico cobrado sin reparación, espera de refacción, garantía como nueva OT). Esto demuestra que entiendes el dominio.

### 4. Venta de mostrador como OT tipo especial
Reutilizar el flujo de OT para ventas de mostrador es inteligente: un solo pipeline de inventario, un solo sistema de pagos. Menos código, menos bugs.

### 5. Inventario con decimales
`stock_actual: decimal` en lugar de `int` para soportar litros de aceite, metros de cable, etc. Detalle que muchos pasan por alto y que evita parches después.

### 6. Eventos de analítica bien diseñados
Los 10 eventos cubren las métricas que importan para un SaaS: activación, retención, fricción e inventario. PostHog es buena elección.

---

## 🔴 CRÍTICO — Corregir antes de escribir código

### C1. Falta tabla `Taller` y tabla `Usuario`

Tu PRD menciona `taller_id` en todas las tablas pero **nunca define la tabla `Taller` ni la tabla `Usuario`**. Esto es lo primero que vas a necesitar.

```
### `Taller`
| Campo             | Tipo     | Nota                            |
|-------------------|----------|---------------------------------|
| id                | UUID     | PK                              |
| nombre            | string   | "Moto Service Yordi"            |
| slug              | string   | Unique. Para URLs: /t/moto-yordi|
| plan              | enum     | trial, basico, pro, taller_plus |
| trial_inicio      | datetime | Fecha de inicio del trial       |
| trial_fin         | datetime | Fecha de expiración             |
| stripe_customer_id| string?  | Para facturación                |
| activo            | bool     | Soft delete / suspensión        |
| config            | jsonb?   | Configuraciones del taller      |
| created_at        | datetime |                                 |

### `Usuario`
| Campo             | Tipo     | Nota                            |
|-------------------|----------|---------------------------------|
| id                | UUID     | PK = Supabase Auth UID          |
| taller_id         | FK       | Multi-tenant                    |
| nombre            | string   |                                 |
| email             | string   | Unique                          |
| rol               | enum     | owner, recepcionista, tecnico   |
| activo            | bool     |                                 |
| created_at        | datetime |                                 |
```

**¿Por qué es crítico?** Sin estas tablas:
- No puedes implementar RLS (necesitas saber a qué taller pertenece el usuario autenticado)
- No puedes gestionar usuarios del taller (permiso del Dueño en tu tabla de permisos)
- No puedes implementar planes de suscripción ni trials

---

### C2. `CotizaciónÍtem.referencia_id` — FK polimórfica es un anti-patrón

```
| referencia_id | UUID? | FK a CatálogoServicio o Producto |
```

Esto es una **FK polimórfica**: un solo campo que puede apuntar a dos tablas diferentes. Postgres **no puede validar** esta relación con un constraint real. Si borras un producto, la base de datos no sabe que debe verificar este campo.

**Solución profesional — Dos FKs explícitas:**
```
| producto_id          | FK? → Producto          | Si tipo = refacción  |
| catalogo_servicio_id | FK? → CatálogoServicio  | Si tipo = servicio   |
```

Con un CHECK constraint:
```sql
ALTER TABLE cotizacion_items ADD CONSTRAINT chk_referencia CHECK (
  (tipo = 'refaccion' AND producto_id IS NOT NULL AND catalogo_servicio_id IS NULL)
  OR (tipo = 'servicio' AND catalogo_servicio_id IS NOT NULL AND producto_id IS NULL)
  OR (producto_id IS NULL AND catalogo_servicio_id IS NULL) -- ítem manual
);
```

**Lección clave:** Siempre que pienses "este campo puede apuntar a la tabla A o a la tabla B", usa dos campos separados con constraints.

---

### C3. `MovimientoInventario.referencia_id` — Mismo problema polimórfico

```
| referencia_tipo | enum?  | ot, compra, ajuste     |
| referencia_id   | UUID?  | ID de OT o Compra      |
```

**Solución:**
```
| ot_id     | FK? → OrdenDeTrabajo | Para salida_ot, devolucion_ot        |
| compra_id | FK? → Compra         | Para entrada_compra                  |
| -- ajuste no necesita FK, es un movimiento independiente --
```

---

### C4. No hay validación de stock negativo

Tu modelo descuenta inventario automáticamente al usar en OT, pero no hay ninguna regla documentada sobre qué pasa si `stock_actual` queda negativo.

**Decisión que debes tomar:**
1. **Bloqueo duro:** No permitir la salida si no hay stock suficiente → más seguro pero puede frenar al mecánico
2. **Permitir negativos con alerta:** Dejar que siga pero marcar la discrepancia → más flexible pero requiere disciplina
3. **Recomendación para MVP:** Opción 2, porque Yordi a veces usa piezas antes de registrar la compra

Documenta tu decisión e implementa un CHECK o trigger:
```sql
-- Opción 2: Permitir negativos pero loggear
CREATE OR REPLACE FUNCTION check_stock_negativo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_actual < 0 THEN
    -- Insertar alerta o notificación
    INSERT INTO alertas (taller_id, tipo, mensaje, ...)
    VALUES (NEW.taller_id, 'stock_negativo', ...);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### C5. `OrdenDeTrabajo.cliente_id` marcado como "redundante para velocidad" — Riesgo de inconsistencia

```
| cliente_id | FK | Redundante para velocidad |
```

Entiendo la intención (evitar JOINs OT → Moto → Cliente), pero datos redundantes = datos que se desincronizarán.

**Si una moto cambia de dueño** (vendida a otro cliente), las OTs históricas quedarían con el `cliente_id` viejo **o** necesitas actualizar todas las OTs. Ambos son problemas.

**Opciones:**
- **Mantenerlo**, pero con la semántica clara: `cliente_id` = "quién trajo la moto ESTA VEZ", no el dueño actual. Esto es válido y útil.
- **Eliminarlo** y aceptar el JOIN. En un MVP con <1000 OTs, el JOIN es despreciable.

**Mi recomendación:** Mantenlo con la semántica "cliente al momento de la entrada". Documéntalo como snapshot, no como FK viva.

---

## 🟡 IMPORTANTE — Corregir durante el desarrollo

### I1. Next.js 14 → Deberías usar Next.js 15

Next.js 14 ya no es la versión actual. Next.js 15 tiene mejoras significativas en rendimiento y estabilidad del App Router. Si estás empezando de cero, no hay razón para comenzar con la versión anterior.

```diff
- | Frontend | Next.js 14 (React) | Mobile-first, SSR, un solo lenguaje |
+ | Frontend | Next.js 15 (React 19) | Mobile-first, SSR, un solo lenguaje |
```

---

### I2. Faltan índices documentados

Tu modelo de datos no menciona ningún índice. Para tu caso de uso, estos son los mínimos:

```sql
-- Búsquedas frecuentes del día a día del taller
CREATE INDEX idx_ot_taller_estado ON ordenes_de_trabajo(taller_id, estado);
CREATE INDEX idx_ot_taller_fecha ON ordenes_de_trabajo(taller_id, fecha_entrada DESC);
CREATE INDEX idx_cliente_telefono ON clientes(taller_id, telefono);
CREATE INDEX idx_moto_placa ON motocicletas(taller_id, placa) WHERE placa IS NOT NULL;
CREATE INDEX idx_producto_nombre ON productos(taller_id, nombre);
CREATE INDEX idx_movimiento_producto ON movimientos_inventario(producto_id, fecha DESC);
CREATE INDEX idx_pago_ot ON pagos(ot_id);

-- Para el folio auto-incremental por taller
CREATE UNIQUE INDEX idx_ot_folio ON ordenes_de_trabajo(taller_id, folio);
```

**¿Por qué importa?** Sin estos índices, cuando Yordi busque un cliente por teléfono o filtre OTs por estado, Postgres hará un sequential scan (lee toda la tabla). Con 100 registros no se nota, pero con 5,000+ será lento.

---

### I3. Falta estrategia de generación de folios

El PRD dice `folio: "OT-2025-0001"` pero no documenta cómo generarlo. Esto es más complicado de lo que parece en un entorno multi-tenant concurrente.

**Estrategia recomendada:**
```sql
-- Secuencia por taller usando una tabla auxiliar
CREATE TABLE folio_sequences (
  taller_id UUID REFERENCES talleres(id),
  prefijo    VARCHAR(10) DEFAULT 'OT',
  año        INT,
  siguiente  INT DEFAULT 1,
  PRIMARY KEY (taller_id, prefijo, año)
);

-- Función que genera el folio atómicamente
CREATE OR REPLACE FUNCTION generar_folio(p_taller_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_num INT;
  v_año INT := EXTRACT(YEAR FROM NOW());
BEGIN
  INSERT INTO folio_sequences (taller_id, año, siguiente)
  VALUES (p_taller_id, 'OT', v_año, 1)
  ON CONFLICT (taller_id, prefijo, año)
  DO UPDATE SET siguiente = folio_sequences.siguiente + 1
  RETURNING siguiente INTO v_num;
  
  RETURN FORMAT('OT-%s-%s', v_año, LPAD(v_num::TEXT, 4, '0'));
END;
$$ LANGUAGE plpgsql;
```

**¿Por qué no usar un simple `MAX(folio) + 1`?** Porque dos OTs creadas al mismo tiempo podrían obtener el mismo número (race condition).

---

### I4. Falta `created_at` y `updated_at` en la mayoría de tablas

Solo `Cliente` tiene `fecha_alta` y `OrdenDeTrabajo` tiene `fecha_entrada`. Las demás tablas (Cotización, Producto, MovimientoInventario, etc.) no tienen timestamps de auditoría.

**Regla profesional:** TODA tabla debe tener:
```sql
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
```

Con un trigger genérico:
```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a cada tabla
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON clientes
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```

---

### I5. Soft delete inconsistente

`Cliente` y `Motocicleta` tienen `activo: bool` para soft delete, pero `OrdenDeTrabajo`, `Cotización`, `Producto`, `Proveedor` no lo documentan explícitamente (aunque Producto y CatálogoServicio sí lo tienen).

**Recomendación:** Decide una estrategia uniforme. Para un SaaS donde los datos se acumulan y se necesitan para reportes históricos, el soft delete es casi siempre correcto. Añade `activo: bool DEFAULT true` a **todas** las tablas de entidades (no a tablas de eventos como MovimientoInventario o Pago, que son immutables).

---

### I6. Falta tabla de `AuditLog` o estrategia de auditoría

¿Quién cambió el estado de una OT? ¿Quién modificó el precio de un producto? ¿Quién hizo un ajuste de inventario? Sin log de auditoría, estas preguntas no tienen respuesta.

**Mínimo para MVP:**
```
### `AuditLog`
| Campo      | Tipo     | Nota                                    |
|------------|----------|-----------------------------------------|
| id         | UUID     | PK                                      |
| taller_id  | FK       |                                         |
| usuario_id | FK       |                                         |
| accion     | string   | "ot.estado_cambiado", "producto.precio" |
| tabla      | string   | "ordenes_de_trabajo"                    |
| registro_id| UUID     | ID del registro afectado                |
| datos_antes| jsonb?   | Snapshot del estado anterior            |
| datos_despues| jsonb? | Snapshot del estado nuevo               |
| created_at | datetime |                                         |
```

Esto no es lujo, es protección para el dueño del taller cuando hay discrepancias de inventario o disputas con clientes.

---

### I7. Cotización sin campo `creado_por`

La OT tiene `creado_por` pero la Cotización no. ¿Quién hizo la cotización? ¿Quién la marcó como autorizada? Agrega:
```
| creado_por      | FK → Usuario | Quien creó la cotización       |
| autorizado_por  | FK → Usuario | Quien marcó la autorización    |
```

---

### I8. Falta validación de transiciones de estado a nivel de base de datos

Las transiciones permitidas están bien documentadas en la sección 5, pero no hay mecanismo que las enforce. Un bug podría pasar una OT de `abierta` directamente a `cerrada`.

**Implementación con trigger:**
```sql
CREATE OR REPLACE FUNCTION validar_transicion_ot()
RETURNS TRIGGER AS $$
DECLARE
  transiciones_validas TEXT[][];
BEGIN
  -- Definir transiciones permitidas
  IF OLD.estado = 'abierta' AND NEW.estado NOT IN ('en_diagnostico', 'cancelada') THEN
    RAISE EXCEPTION 'Transición no válida: % → %', OLD.estado, NEW.estado;
  END IF;
  -- ... etc para cada estado
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 💡 RECOMENDACIONES — Nice to have

### R1. Agregar campo `moneda` al modelo

Aunque inicialmente todo es MXN, si algún taller está en zona fronteriza o compra en USD:
```
| moneda | enum | 'MXN', 'USD' — default MXN |
```
Es un campo simple ahora, una migración dolorosa después.

### R2. Considerar `CompraÍtem` sin `taller_id`

`CompraÍtem` no necesita `taller_id` propio si siempre se accede via JOIN con `Compra` (que sí lo tiene). Esto aplica también a `CotizaciónÍtem`. Menos columnas redundantes = menor superficie de error en RLS. **Sin embargo**, Supabase RLS aplica por tabla, así que si necesitas acceso directo a estas tablas desde el frontend, sí necesitas `taller_id`. Evalúa tu patrón de acceso.

### R3. El plan de sprints de 14 semanas es ambicioso

Como desarrollador Jr, construir 6 módulos + SaaS público en 14 semanas es muy agresivo. Mi sugerencia:

- **Sprints S0-S4 (9 semanas):** Mantén el plan. Llegarás al hito de "Yordi lo puede usar".
- **No te presiones con S5-S7** hasta que S0-S4 estén estables y Yordi esté usándolo en producción.
- **Agrega un sprint de testing/hardening** después del S4. Tu yo del futuro te lo agradecerá.

### R4. Falta manejo de errores y estados de carga

El PRD no menciona:
- ¿Qué pasa si falla la conexión a Supabase?
- ¿Qué pasa si un pago se registra pero el stock no se descuenta (operación parcial)?
- ¿Hay retry logic? ¿Optimistic updates?

No necesitas un documento de 20 páginas, pero sí una sección que diga: "Las operaciones de inventario + pago se ejecutan en una transacción de base de datos. Si falla cualquier parte, se hace rollback completo."

### R5. Considerar `Cotización.ot_id` como NOT NULL vs. cotización independiente

Hoy toda cotización está atada a una OT. ¿Y si en el futuro quieres enviar cotizaciones sin abrir OT? Define si esto es un caso de uso válido ahora para no tener que migrar después.

---

## 🏗️ DIAGRAMA DE DEPENDENCIAS RECOMENDADO

```
                    ┌──────────┐
                    │  Taller  │ ← NUEVA (C1)
                    └────┬─────┘
                         │
                    ┌────┴─────┐
                    │ Usuario  │ ← NUEVA (C1)
                    └────┬─────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────┴───┐    ┌─────┴────┐   ┌────┴──────┐
     │Cliente │    │ Producto │   │ Proveedor │
     └────┬───┘    └────┬─────┘   └─────┬─────┘
          │             │               │
     ┌────┴──────┐      │          ┌────┴───┐
     │Motocicleta│      │          │ Compra  │
     └────┬──────┘      │          └────┬────┘
          │             │               │
     ┌────┴───────────┐ │         ┌─────┴─────┐
     │OrdenDeTrabajo  │ │         │CompraÍtem │
     └──┬───────┬─────┘ │         └───────────┘
        │       │       │
   ┌────┴──┐    │  ┌────┴──────────┐
   │ Pago  │    │  │Mov.Inventario │
   └───────┘    │  └───────────────┘
           ┌────┴──────┐
           │Cotización  │
           └────┬───────┘
           ┌────┴──────────┐
           │CotizaciónÍtem │ ← Corregir FK polimórfica (C2)
           └───────────────┘
```

---

## ✅ CHECKLIST DE CORRECCIONES

| #  | Tipo     | Acción                                               | Prioridad |
|----|----------|------------------------------------------------------|-----------|
| C1 | Crítico  | Agregar tablas `Taller` y `Usuario`                  | Antes de Sprint 0 |
| C2 | Crítico  | Reemplazar FK polimórfica en `CotizaciónÍtem`        | Antes de Sprint 2 |
| C3 | Crítico  | Reemplazar FK polimórfica en `MovimientoInventario`   | Antes de Sprint 3 |
| C4 | Crítico  | Definir política de stock negativo                    | Antes de Sprint 3 |
| C5 | Crítico  | Clarificar semántica de `OT.cliente_id`               | Antes de Sprint 1 |
| I1 | Importante| Actualizar a Next.js 15                              | Sprint 0 |
| I2 | Importante| Documentar y crear índices                           | Sprint 0 |
| I3 | Importante| Implementar generación atómica de folios             | Sprint 1 |
| I4 | Importante| `created_at`/`updated_at` en todas las tablas        | Sprint 0 |
| I5 | Importante| Soft delete uniforme                                 | Sprint 0 |
| I6 | Importante| Agregar tabla `AuditLog`                             | Sprint 1 |
| I7 | Importante| `creado_por` y `autorizado_por` en Cotización        | Sprint 2 |
| I8 | Importante| Trigger de validación de transiciones de estado       | Sprint 1 |
| R1 | Nice-to-have| Campo `moneda`                                    | Sprint 0 |
| R2 | Nice-to-have| Evaluar `taller_id` en tablas hijas                | Sprint 0 |
| R3 | Nice-to-have| Sprint de hardening post-S4                        | Sprint 4.5 |
| R4 | Nice-to-have| Sección de manejo de errores en PRD                | Antes de Sprint 1 |
| R5 | Nice-to-have| Definir si cotizaciones pueden ser independientes  | Antes de Sprint 2 |

---

## 🎯 CONCLUSIÓN

Tu PRD está **muy por encima del promedio** para un primer intento. El modelo de datos está bien pensado, el flujo de negocio es completo, y las decisiones de arquitectura (RLS, Supabase, Vercel) son pragmáticas y correctas para el tamaño del proyecto.

Los puntos críticos (C1-C5) son correcciones de modelo de datos que **debes resolver antes de escribir la primera línea de código**. Las tablas faltantes y las FKs polimórficas te causarían dolores de cabeza reales en producción.

Los puntos importantes (I1-I8) son mejoras que puedes ir implementando sprint a sprint, pero no los ignores — son la diferencia entre un MVP que sobrevive 6 meses y uno que escala a 50 talleres.

**Siguiente paso recomendado:** Actualiza tu PRD con las correcciones C1-C5 y luego arranca el Sprint 0.
