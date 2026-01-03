import { executeQuery, executeTransaction } from "../config/database.js"

export const getCurrentCashStatus = async (req, res) => {
  try {
    console.log("🔍 Obteniendo estado actual de caja (SIMPLIFICADO)...")

    if (req.get("Origin")) {
      res.header("Access-Control-Allow-Origin", req.get("Origin"))
      res.header("Access-Control-Allow-Credentials", "true")
    }

    // Obtener la sesión abierta
    const openSession = await executeQuery(`
      SELECT 
        cs.id, cs.opening_amount, cs.closing_amount,
        cs.expected_amount, cs.difference, cs.status,
        cs.opening_date, cs.closing_date,
        cs.opened_by, cs.closed_by,
        cs.opening_notes, cs.closing_notes,
        cs.created_at, cs.updated_at,
        u_open.name as opened_by_name,
        u_close.name as closed_by_name
      FROM cash_sessions cs
      LEFT JOIN users u_open ON cs.opened_by = u_open.id
      LEFT JOIN users u_close ON cs.closed_by = u_close.id
      WHERE cs.status = 'open'
      ORDER BY cs.id DESC
      LIMIT 1
    `)

    if (openSession.length === 0) {
      console.log("❌ No hay caja abierta")
      return res.status(200).json({
        success: true,
        data: {
          session: null,
          movements: [],
          settings: {
            min_cash_amount: 2000.0,
            max_cash_amount: 20000.0,
            auto_close_time: "22:00",
            require_count_for_close: true,
            allow_negative_cash: false,
          },
        },
      })
    }

    const session = openSession[0]
    console.log("✅ Sesión abierta encontrada:", session.id)

    // Obtener todos los movimientos de la sesión
    let movements = []
    try {
      movements = await executeQuery(
        `
        SELECT 
          cm.id, cm.cash_session_id, cm.type, cm.amount, 
          cm.description, cm.reference, cm.user_id, cm.created_at,
          cm.payment_method, cm.sale_id,
          u.name as user_name,
          s.total as sale_total
        FROM cash_movements cm
        LEFT JOIN users u ON cm.user_id = u.id
        LEFT JOIN sales s ON cm.sale_id = s.id
        WHERE cm.cash_session_id = ?
        ORDER BY cm.created_at DESC
        LIMIT 500
      `,
        [session.id],
      )
      console.log("📝 Movimientos encontrados:", movements.length)
    } catch (movError) {
      console.error("⚠️ Error obteniendo movimientos:", movError)
      movements = []
    }

    let totalVentasEfectivo = 0
    let totalVentasTarjeta = 0
    let totalVentasTransferencia = 0
    let totalPagosCuentaCorriente = 0 // Todos los métodos juntos
    let totalDepositos = 0
    let totalGastos = 0
    let totalRetiros = 0
    let totalCancelaciones = 0
    let cantidadVentas = 0

    let efectivoFisico = Number.parseFloat(session.opening_amount) || 0

    for (const movement of movements) {
      const amount = Math.abs(Number.parseFloat(movement.amount) || 0)

      switch (movement.type) {
        case "opening":
        case "closing":
          // Ignorar movimientos de apertura/cierre en cálculos
          break

        case "sale":
          cantidadVentas++
          switch (movement.payment_method) {
            case "efectivo":
              totalVentasEfectivo += amount
              efectivoFisico += amount
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              totalVentasTarjeta += amount
              break
            case "transferencia":
            case "transfer":
              totalVentasTransferencia += amount
              break
            case "multiple":
              // Para múltiples, necesitamos parsear el JSON
              if (movement.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [
                    movement.sale_id,
                  ])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const paymentMethods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of paymentMethods) {
                      const pmAmount = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          totalVentasEfectivo += pmAmount
                          efectivoFisico += pmAmount
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          totalVentasTarjeta += pmAmount
                          break
                        case "transferencia":
                        case "transfer":
                          totalVentasTransferencia += pmAmount
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando venta múltiple:", e)
                }
              }
              break
          }
          break

        case "deposit":
          // Identificar si es pago de cuenta corriente o depósito normal
          const isPagoCuentaCorriente =
            movement.description &&
            (movement.description.toLowerCase().includes("cuenta corriente") ||
              movement.description.toLowerCase().includes("pago cuenta") ||
              movement.description.toLowerCase().includes("cta cte") ||
              movement.description.toLowerCase().includes("cta. cte"))

          if (isPagoCuentaCorriente) {
            totalPagosCuentaCorriente += amount
            // Solo suma al efectivo físico si es en efectivo
            if (movement.payment_method === "efectivo") {
              efectivoFisico += amount
            }
          } else {
            totalDepositos += amount
            efectivoFisico += amount // Los depósitos siempre son efectivo
          }
          break

        case "withdrawal":
          totalRetiros += amount
          efectivoFisico -= amount
          break

        case "expense":
          totalGastos += amount
          efectivoFisico -= amount
          break

        case "cancellation":
          totalCancelaciones += amount
          cantidadVentas = Math.max(0, cantidadVentas - 1)

          // Restar del método correspondiente
          switch (movement.payment_method) {
            case "efectivo":
              totalVentasEfectivo -= amount
              efectivoFisico -= amount
              console.log(`💰 Cancelación efectivo: -$${amount} | Efectivo físico ahora: $${efectivoFisico}`)
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              totalVentasTarjeta -= amount
              break
            case "transferencia":
            case "transfer":
              totalVentasTransferencia -= amount
              break
            case "multiple":
              if (movement.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [
                    movement.sale_id,
                  ])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const paymentMethods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of paymentMethods) {
                      const pmAmount = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          totalVentasEfectivo -= pmAmount
                          efectivoFisico -= pmAmount
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          totalVentasTarjeta -= pmAmount
                          break
                        case "transferencia":
                        case "transfer":
                          totalVentasTransferencia -= pmAmount
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando cancelación múltiple:", e)
                }
              }
              break
          }
          break
      }
    }

    const totalVentas = totalVentasEfectivo + totalVentasTarjeta + totalVentasTransferencia
    const totalIngresosDia = totalVentas + totalPagosCuentaCorriente + totalDepositos
    // Corregir cálculo de egresos totales para incluir cancelaciones
    const totalEgresosDia = totalGastos + totalRetiros + totalCancelaciones
    const gananciaNetaDia = totalIngresosDia - totalEgresosDia

    const totalGeneralCaja = Number.parseFloat(session.opening_amount) + totalIngresosDia - totalEgresosDia

    console.log("💰 RESUMEN SIMPLIFICADO DEL DÍA:")
    console.log(`  📈 Total Ingresos del Día: $${totalIngresosDia.toFixed(2)}`)
    console.log(`    - Ventas totales: $${totalVentas.toFixed(2)}`)
    console.log(`      * Efectivo: $${totalVentasEfectivo.toFixed(2)}`)
    console.log(`      * Tarjeta: $${totalVentasTarjeta.toFixed(2)}`)
    console.log(`      * Transferencia: $${totalVentasTransferencia.toFixed(2)}`)
    console.log(`    - Pagos cuenta corriente: $${totalPagosCuentaCorriente.toFixed(2)}`)
    console.log(`    - Depósitos: $${totalDepositos.toFixed(2)}`)
    console.log(`  📉 Total Egresos: $${totalEgresosDia.toFixed(2)}`)
    console.log(`    - Gastos: $${totalGastos.toFixed(2)}`)
    console.log(`    - Retiros: $${totalRetiros.toFixed(2)}`)
    console.log(`    - Cancelaciones: $${totalCancelaciones.toFixed(2)}`)
    console.log(`  💵 Efectivo en Caja Física: $${efectivoFisico.toFixed(2)}`)
    console.log(`  💼 Total General de Caja: $${totalGeneralCaja.toFixed(2)}`)
    console.log(`  ✅ Ganancia Neta del Día: $${gananciaNetaDia.toFixed(2)}`)

    // Obtener configuración
    let settings = {
      min_cash_amount: 2000.0,
      max_cash_amount: 20000.0,
      auto_close_time: "22:00",
      require_count_for_close: true,
      allow_negative_cash: false,
    }

    try {
      const settingsQuery = await executeQuery("SELECT * FROM cash_settings ORDER BY id DESC LIMIT 1")
      if (settingsQuery.length > 0) {
        settings = {
          min_cash_amount: Number.parseFloat(settingsQuery[0].min_cash_amount) || 2000.0,
          max_cash_amount: Number.parseFloat(settingsQuery[0].max_cash_amount) || 20000.0,
          auto_close_time: settingsQuery[0].auto_close_time || "22:00",
          require_count_for_close: Boolean(settingsQuery[0].require_count_for_close ?? true),
          allow_negative_cash: Boolean(settingsQuery[0].allow_negative_cash ?? false),
        }
      }
    } catch (settingsError) {
      console.error("⚠️ Error obteniendo configuración:", settingsError)
    }

    const responseData = {
      session: {
        ...session,
        // Efectivo físico en caja
        efectivo_fisico: efectivoFisico,
        calculated_amount: efectivoFisico, // Para compatibilidad

        total_general_caja: totalGeneralCaja,

        // Totales del día (simplificados)
        total_ingresos_dia: totalIngresosDia,
        total_egresos_dia: totalEgresosDia,
        ganancia_neta_dia: gananciaNetaDia,

        // Desglose de ventas por método (para referencia)
        ventas_efectivo: totalVentasEfectivo,
        ventas_tarjeta: totalVentasTarjeta,
        ventas_transferencia: totalVentasTransferencia,
        total_ventas: totalVentas,

        // Otros ingresos
        pagos_cuenta_corriente: totalPagosCuentaCorriente,
        depositos: totalDepositos,

        // Egresos
        gastos: totalGastos,
        retiros: totalRetiros,
        cancelaciones: totalCancelaciones,

        // Información general
        cantidad_ventas: cantidadVentas,
        opening_amount: Number.parseFloat(session.opening_amount),
      },
      movements,
      settings,
    }

    console.log("✅ Estado de caja calculado correctamente (SIMPLIFICADO)")

    res.status(200).json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("💥 Error getting cash status:", error)
    console.error("Stack trace:", error.stack)

    if (req.get("Origin")) {
      res.header("Access-Control-Allow-Origin", req.get("Origin"))
      res.header("Access-Control-Allow-Credentials", "true")
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "CASH_STATUS_ERROR",
      details: error.message,
    })
  }
}

// Abrir caja (mantener lógica original)
export const openCash = async (req, res) => {
  try {
    const { opening_amount, notes } = req.body
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
        code: "UNAUTHORIZED",
      })
    }

    // Validar que no haya una caja abierta
    const existingCash = await executeQuery("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1")

    if (existingCash.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Ya hay una caja abierta",
        code: "CASH_ALREADY_OPEN",
      })
    }

    // Validar monto de apertura
    const openingAmount = Number.parseFloat(opening_amount)
    if (isNaN(openingAmount) || openingAmount < 0) {
      return res.status(400).json({
        success: false,
        message: "Monto de apertura inválido",
        code: "INVALID_OPENING_AMOUNT",
      })
    }

    const queries = []

    // 1. Crear sesión de caja
    queries.push({
      query: `
        INSERT INTO cash_sessions (
          opening_amount, expected_amount, status, opening_date, 
          opened_by, opening_notes, created_at, updated_at
        ) VALUES (?, ?, 'open', CURRENT_TIMESTAMP, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      params: [openingAmount, openingAmount, userId, notes || null],
    })

    // 2. Registrar movimiento de apertura
    queries.push({
      query: `
        INSERT INTO cash_movements (
          cash_session_id, type, amount, description, user_id, created_at
        ) VALUES (LAST_INSERT_ID(), 'opening', ?, 'Apertura de caja', ?, CURRENT_TIMESTAMP)
      `,
      params: [openingAmount, userId],
    })

    await executeTransaction(queries)

    // Obtener la sesión creada
    const newSession = await executeQuery(`
      SELECT 
        cs.id, cs.opening_amount, cs.expected_amount, cs.status, cs.opening_date,
        cs.opened_by, cs.opening_notes, cs.created_at, cs.updated_at,
        u.name as opened_by_name
      FROM cash_sessions cs
      LEFT JOIN users u ON cs.opened_by = u.id
      WHERE cs.status = 'open'
      ORDER BY cs.id DESC
      LIMIT 1
    `)

    res.status(201).json({
      success: true,
      message: "Caja abierta correctamente",
      data: {
        isOpen: true,
        session: newSession[0],
      },
    })
  } catch (error) {
    console.error("Error al abrir caja:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "CASH_OPEN_ERROR",
    })
  }
}

// CORREGIDO: Cerrar caja con cálculos precisos SIN cuenta corriente
export const closeCash = async (req, res) => {
  try {
    const {
      closing_amount,
      expected_amount,
      closing_notes,
      bills,
      coins,
      // New format parameters
      notes,
      physical_cash_amount,
      compare_with_physical,
    } = req.body

    console.log("🚀 === INICIO CERRAR CAJA ===")
    console.log("📝 Datos recibidos:", {
      closing_amount,
      expected_amount,
      closing_notes,
      notes,
      physical_cash_amount,
      compare_with_physical,
      userId: req.user?.id,
    })

    const currentSessionQuery = await executeQuery(
      "SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opening_date DESC LIMIT 1",
    )

    if (currentSessionQuery.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay ninguna sesión de caja abierta para cerrar",
      })
    }

    const session = currentSessionQuery[0]

    const movementsQuery = await executeQuery(
      "SELECT * FROM cash_movements WHERE cash_session_id = ? ORDER BY created_at ASC",
      [session.id],
    )

    console.log(`📊 Recalculando totales para el cierre...`)

    let salesCash = 0,
      salesCard = 0,
      salesTransfer = 0,
      salesAccountPayable = 0
    let depositsCash = 0
    let accountReceivablePayments = 0
    let physicalCashIncome = Number.parseFloat(session.opening_amount) || 0
    let totalWithdrawals = 0,
      totalExpenses = 0,
      totalCancellations = 0
    let salesCount = 0

    for (const row of movementsQuery) {
      const amount = Math.abs(Number.parseFloat(row.amount) || 0)

      switch (row.type) {
        case "sale":
          salesCount++
          switch (row.payment_method) {
            case "efectivo":
              salesCash += amount
              physicalCashIncome += amount
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              salesCard += amount
              break
            case "transferencia":
            case "transfer":
              salesTransfer += amount
              break
            case "cuenta_corriente":
              salesAccountPayable += amount
              break
            case "multiple":
              if (row.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [row.sale_id])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const methods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of methods) {
                      const amt = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          salesCash += amt
                          physicalCashIncome += amt
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          salesCard += amt
                          break
                        case "transferencia":
                        case "transfer":
                          salesTransfer += amt
                          break
                        case "cuenta_corriente":
                          salesAccountPayable += amt
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando venta múltiple:", e)
                }
              }
              break
          }
          break

        case "deposit":
          const isPagoCuentaCorriente =
            row.description &&
            (row.description.toLowerCase().includes("cuenta corriente") ||
              row.description.toLowerCase().includes("pago cuenta") ||
              row.description.toLowerCase().includes("cta cte") ||
              row.description.toLowerCase().includes("cta. cte"))

          if (isPagoCuentaCorriente) {
            accountReceivablePayments += amount
            if (row.payment_method === "efectivo") {
              physicalCashIncome += amount
            }
          } else {
            depositsCash += amount
            physicalCashIncome += amount
          }
          break

        case "withdrawal":
          totalWithdrawals += amount
          physicalCashIncome -= amount
          break

        case "expense":
          totalExpenses += amount
          physicalCashIncome -= amount
          break

        case "cancellation":
          totalCancellations += amount
          salesCount = Math.max(0, salesCount - 1)

          switch (row.payment_method) {
            case "efectivo":
              salesCash -= amount
              physicalCashIncome -= amount
              console.log(`💰 Cancelación efectivo en cierre: -${amount}`)
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              salesCard -= amount
              console.log(`💳 Cancelación tarjeta en cierre: -${amount}`)
              break
            case "transferencia":
            case "transfer":
              salesTransfer -= amount
              console.log(`🏦 Cancelación transferencia en cierre: -${amount}`)
              break
            case "multiple":
              if (row.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [row.sale_id])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const methods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of methods) {
                      const amt = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          salesCash -= amt
                          physicalCashIncome -= amt
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          salesCard -= amt
                          break
                        case "transferencia":
                        case "transfer":
                          salesTransfer -= amt
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando cancelación múltiple en cierre:", e)
                }
              }
              break
          }
          break
      }
    }

    const totalSales = salesCash + salesCard + salesTransfer + salesAccountPayable
    const totalIncome = totalSales + accountReceivablePayments + depositsCash
    const totalOutcome = totalWithdrawals + totalExpenses + totalCancellations
    const netProfit = totalIncome - totalOutcome
    const totalGeneralCash = Number.parseFloat(session.opening_amount) + totalIncome - totalOutcome

    const finalClosingAmount =
      physical_cash_amount !== undefined && physical_cash_amount !== null
        ? Number.parseFloat(physical_cash_amount)
        : closing_amount !== undefined && closing_amount !== null
          ? Number.parseFloat(closing_amount)
          : physicalCashIncome

    const finalExpectedAmount =
      expected_amount !== undefined && expected_amount !== null
        ? Number.parseFloat(expected_amount)
        : physicalCashIncome

    const finalClosingNotes = closing_notes || notes || null

    const difference = finalClosingAmount - physicalCashIncome

    console.log("📊 TOTALES EN CIERRE:")
    console.log(`  💵 Ventas Efectivo: $${salesCash}`)
    console.log(`  💳 Ventas Tarjeta: $${salesCard}`)
    console.log(`  🏦 Ventas Transferencia: $${salesTransfer}`)
    console.log(`  💰 Efectivo Físico Calculado: $${physicalCashIncome}`)
    console.log(`  💵 Efectivo Físico Contado: $${finalClosingAmount}`)
    console.log(`  📊 Diferencia: $${difference}`)
    console.log(`  ✅ Total Ingresos: $${totalIncome}`)
    console.log(`  ❌ Total Egresos: $${totalOutcome}`)
    console.log(`  💎 Ganancia Neta: $${netProfit}`)
    console.log(`  🏦 Total General Caja: $${totalGeneralCash}`)

    const earningsDetails = {
      totalEarnings: netProfit,
      totalIncome,
      totalOutcome,
      totalGeneralCash,
      sales: {
        cash: salesCash,
        card: salesCard,
        transfer: salesTransfer,
        accountPayable: salesAccountPayable,
        total: totalSales,
        count: salesCount,
      },
      deposits: {
        amount: depositsCash,
      },
      accountPayments: {
        amount: accountReceivablePayments,
      },
      expenses: {
        amount: totalExpenses,
      },
      withdrawals: {
        amount: totalWithdrawals,
      },
      cancellations: {
        amount: totalCancellations,
      },
      physicalCash: {
        expected: physicalCashIncome,
        counted: finalClosingAmount,
        difference: difference,
      },
    }

    const queries = []

    // Actualizar sesión
    queries.push({
      query: `
        UPDATE cash_sessions
        SET 
          closing_amount = ?,
          expected_amount = ?,
          difference = ?,
          closing_notes = ?,
          status = 'closed',
          closing_date = CURRENT_TIMESTAMP,
          closed_by = ?,
          total_sales = ?,
          total_cash_sales = ?,
          total_card_sales = ?,
          total_transfer_sales = ?,
          total_deposits = ?,
          total_withdrawals = ?,
          total_expenses = ?,
          sales_count = ?,
          profit = ?
        WHERE id = ?
      `,
      params: [
        finalClosingAmount,
        finalExpectedAmount,
        difference,
        finalClosingNotes,
        req.user?.id || null,
        totalSales,
        salesCash,
        salesCard,
        salesTransfer,
        depositsCash + accountReceivablePayments,
        totalWithdrawals,
        totalExpenses,
        salesCount,
        netProfit,
        session.id,
      ],
    })

    // Registrar movimiento de cierre
    queries.push({
      query: `
        INSERT INTO cash_movements (
          cash_session_id, type, amount, description, user_id, created_at
        ) VALUES (?, 'closing', ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      params: [
        session.id,
        finalClosingAmount,
        `Cierre de caja. Diferencia: ${formatCurrency(difference)}`,
        req.user?.id || null,
      ],
    })

    queries.push({
      query: `
        INSERT INTO cash_counts (
          cash_session_id, expected_amount, counted_amount, difference,
          bills, coins, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
      params: [
        session.id,
        physicalCashIncome,
        finalClosingAmount,
        difference,
        JSON.stringify(bills || {}),
        JSON.stringify(coins || {}),
        JSON.stringify({
          text: finalClosingNotes,
          earnings_details: earningsDetails,
        }),
        req.user?.id || null,
      ],
    })

    await executeTransaction(queries)

    console.log("🎉 === CAJA CERRADA EXITOSAMENTE ===")

    res.json({
      success: true,
      message: "Caja cerrada correctamente",
      data: {
        sessionId: session.id,
        closing_amount: finalClosingAmount,
        expected_amount: physicalCashIncome,
        difference,
        totalSales,
        salesCount,
        profit: netProfit,
      },
    })
  } catch (error) {
    console.error("💥 Error cerrando caja:", error)
    res.status(500).json({
      success: false,
      message: "Error al cerrar la caja",
      error: error.message,
    })
  }
}

export const getCashHistory = async (req, res) => {
  try {
    console.log("🔍 Obteniendo historial de caja...")

    const { start_date, end_date, page = 1, limit = 20 } = req.query

    let dateFilter = "WHERE cs.status = 'closed'"
    const params = []

    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(cs.closing_date) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(cs.closing_date) <= ?"
      params.push(end_date)
    }

    // Paginación
    const pageNum = Math.max(1, Number.parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit) || 20))
    const offset = (pageNum - 1) * limitNum

    // CORREGIDO: Historial excluyendo ventas cuenta corriente
    const historyQuery = `
      SELECT 
        cs.id, cs.opening_amount, cs.closing_amount,
        cs.expected_amount, cs.difference, cs.status,
        cs.opening_date, cs.closing_date,
        cs.opened_by, cs.closed_by,
        cs.opening_notes, cs.closing_notes,
        cs.created_at, cs.updated_at,
        u_open.name as opened_by_name,
        u_close.name as closed_by_name,
        COUNT(cm.id) as total_movements,
        COALESCE(SUM(CASE WHEN cm.type = 'sale' AND cm.payment_method = 'efectivo' THEN cm.amount ELSE 0 END), 0) as total_cash_sales,
        COALESCE(SUM(CASE WHEN cm.type = 'sale' AND cm.payment_method IN ('tarjeta_credito', 'tarjeta_debito', 'tarjeta', 'transferencia', 'transfer') THEN cm.amount ELSE 0 END), 0) as total_other_sales,
        COALESCE(SUM(CASE WHEN cm.type = 'deposit' AND NOT (cm.description LIKE '%cuenta corriente%' OR cm.description LIKE '%cta cte%') THEN cm.amount ELSE 0 END), 0) as total_deposits,
        COALESCE(SUM(CASE WHEN cm.type = 'deposit' AND (cm.description LIKE '%cuenta corriente%' OR cm.description LIKE '%cta cte%') THEN cm.amount ELSE 0 END), 0) as total_account_payments,
        COALESCE(SUM(CASE WHEN cm.type IN ('withdrawal', 'expense') THEN ABS(cm.amount) ELSE 0 END), 0) as total_expenses
      FROM cash_sessions cs
      LEFT JOIN users u_open ON cs.opened_by = u_open.id
      LEFT JOIN users u_close ON cs.closed_by = u_close.id
      LEFT JOIN cash_movements cm ON cs.id = cm.cash_session_id 
        AND cm.type NOT IN ('opening', 'closing')
        AND NOT (cm.type = 'sale' AND cm.payment_method IN ('cuenta_corriente', 'credito'))
      ${dateFilter}
      GROUP BY cs.id, cs.opening_amount, cs.closing_amount, cs.expected_amount, cs.difference, cs.status,
               cs.opening_date, cs.closing_date, cs.opened_by, cs.closed_by, cs.opening_notes, cs.closing_notes,
               cs.created_at, cs.updated_at, u_open.name, u_close.name
       ORDER BY cs.closing_date DESC
       LIMIT ${limitNum} OFFSET ${offset}
    `

    const history = await executeQuery(historyQuery, params)

    // Contar total para paginación
    const countQuery = `SELECT COUNT(*) as total FROM cash_sessions cs ${dateFilter}`
    const [{ total }] = await executeQuery(countQuery, params)

    const response = {
      success: true,
      data: {
        history,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: Number.parseInt(total),
          pages: Math.ceil(total / limitNum),
        },
      },
    }

    res.json(response)
  } catch (error) {
    console.error("💥 Error al obtener historial de caja:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "CASH_HISTORY_ERROR",
      details: error.message,
    })
  }
}

export const getCashSessionDetails = async (req, res) => {
  try {
    const { id } = req.params

    if (!id || isNaN(Number.parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "ID de sesión inválido",
        code: "INVALID_SESSION_ID",
      })
    }

    // Obtener datos de la sesión
    const sessionQuery = await executeQuery(
      `
      SELECT 
        cs.id, cs.opening_amount, cs.closing_amount, cs.expected_amount, cs.difference, cs.status, 
        cs.opening_date, cs.closing_date, cs.opened_by, cs.closed_by, 
        cs.opening_notes, cs.closing_notes, cs.created_at, cs.updated_at,
        cs.total_sales, cs.total_cash_sales, cs.total_card_sales, cs.total_transfer_sales,
        cs.total_deposits, cs.total_withdrawals, cs.total_expenses, cs.sales_count, cs.profit,
        u_open.name as opened_by_name,
        u_close.name as closed_by_name
      FROM cash_sessions cs
      LEFT JOIN users u_open ON cs.opened_by = u_open.id
      LEFT JOIN users u_close ON cs.closed_by = u_close.id
      WHERE cs.id = ?
    `,
      [Number.parseInt(id)],
    )

    if (sessionQuery.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Sesión no encontrada",
        code: "SESSION_NOT_FOUND",
      })
    }

    const session = sessionQuery[0]

    // CORREGIDO: Obtener movimientos excluyendo ventas cuenta corriente
    const movementsQuery = await executeQuery(
      `
      SELECT 
        cm.id, cm.cash_session_id, cm.type, cm.amount, cm.description, cm.reference, cm.user_id, cm.created_at,
        cm.payment_method, cm.sale_id,
        u.name as user_name,
        s.id as sale_id
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      LEFT JOIN sales s ON cm.sale_id = s.id
      WHERE cm.cash_session_id = ?
        AND NOT (cm.type = 'sale' AND cm.payment_method IN ('cuenta_corriente', 'credito'))
      ORDER BY cm.created_at ASC
    `,
      [Number.parseInt(id)],
    )

    // Obtener detalles de ganancias si existen
    let earningsDetails = null
    try {
      const countData = await executeQuery(`SELECT notes FROM cash_counts WHERE cash_session_id = ? LIMIT 1`, [
        Number.parseInt(id),
      ])

      if (countData.length > 0 && countData[0].notes) {
        const notesData = JSON.parse(countData[0].notes)
        earningsDetails = notesData.earnings_details || null
      }
    } catch (parseError) {
      console.warn("Error parseando detalles de ganancias:", parseError)
    }

    if (!earningsDetails && session.status === "closed") {
      earningsDetails = {
        totalEarnings: session.profit || 0,
        totalIncome: (session.total_sales || 0) + (session.total_deposits || 0),
        totalOutcome: (session.total_expenses || 0) + (session.total_withdrawals || 0),
        totalGeneralCash:
          (session.opening_amount || 0) +
          (session.total_sales || 0) +
          (session.total_deposits || 0) -
          (session.total_expenses || 0) -
          (session.total_withdrawals || 0),
        sales: {
          cash: session.total_cash_sales || 0,
          card: session.total_card_sales || 0,
          transfer: session.total_transfer_sales || 0,
          accountPayable: 0,
          total: session.total_sales || 0,
          count: session.sales_count || 0,
        },
        deposits: {
          amount: session.total_deposits || 0,
        },
        accountPayments: {
          amount: 0,
        },
        expenses: {
          amount: session.total_expenses || 0,
        },
        withdrawals: {
          amount: session.total_withdrawals || 0,
        },
        cancellations: {
          amount: 0,
        },
        physicalCash: {
          expected: session.expected_amount || 0,
          counted: session.closing_amount || 0,
          difference: session.difference || 0,
        },
      }
    }

    res.json({
      success: true,
      data: {
        session,
        movements: movementsQuery,
        earnings_details: earningsDetails,
      },
    })
  } catch (error) {
    console.error("Error al obtener detalles de sesión:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener los detalles de la sesión",
      error: error.message,
    })
  }
}

export const getCashMovements = async (req, res) => {
  try {
    const { start_date, end_date, type, current_session_only = "true", page = 1, limit = 50 } = req.query

    let sql = `
      SELECT 
        cm.id, cm.cash_session_id, cm.type, cm.amount, cm.description, cm.reference, cm.user_id, cm.created_at,
        cm.payment_method, cm.sale_id,
        u.name as user_name,
        s.id as sale_id,
        cs.opening_date as session_start
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      LEFT JOIN sales s ON cm.sale_id = s.id
      LEFT JOIN cash_sessions cs ON cm.cash_session_id = cs.id
      WHERE 1=1
        AND NOT (cm.type = 'sale' AND cm.payment_method IN ('cuenta_corriente', 'credito'))
    `
    const params = []

    // Filtrar por sesión actual por defecto
    if (current_session_only === "true") {
      sql += ` AND cs.status = 'open'`
    }

    // Filtros de fecha
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      sql += ` AND DATE(cm.created_at) >= ?`
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      sql += ` AND DATE(cm.created_at) <= ?`
      params.push(end_date)
    }

    // Filtro por tipo
    if (type && ["opening", "closing", "sale", "deposit", "withdrawal", "expense", "cancellation"].includes(type)) {
      sql += ` AND cm.type = ?`
      params.push(type)
    }

    sql += ` ORDER BY cm.created_at DESC`

    // Paginación
    const pageNum = Math.max(1, Number.parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit) || 50))
    const offset = (pageNum - 1) * limitNum

    sql += ` LIMIT ${limitNum} OFFSET ${offset}`

    const movements = await executeQuery(sql, params)

    // Contar total para paginación
    let countSql = `
      SELECT COUNT(*) as total 
      FROM cash_movements cm
      LEFT JOIN cash_sessions cs ON cm.cash_session_id = cs.id
      WHERE 1=1
        AND NOT (cm.type = 'sale' AND cm.payment_method IN ('cuenta_corriente', 'credito'))
    `
    const countParams = []

    if (current_session_only === "true") {
      countSql += ` AND cs.status = 'open'`
    }

    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      countSql += ` AND DATE(cm.created_at) >= ?`
      countParams.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      countSql += ` AND DATE(cm.created_at) <= ?`
      countParams.push(end_date)
    }

    if (type && ["opening", "closing", "sale", "deposit", "withdrawal", "expense", "cancellation"].includes(type)) {
      countSql += ` AND cm.type = ?`
      countParams.push(type)
    }

    const [{ total }] = await executeQuery(countSql, countParams)

    res.json({
      success: true,
      data: {
        movements,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: Number.parseInt(total),
          pages: Math.ceil(total / limitNum),
        },
      },
    })
  } catch (error) {
    console.error("Error al obtener movimientos:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "MOVEMENTS_FETCH_ERROR",
    })
  }
}

export const createCashMovement = async (req, res) => {
  try {
    const { type, amount, description, reference } = req.body
    const userId = req.user?.id

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Usuario no autenticado",
        code: "UNAUTHORIZED",
      })
    }

    // Validar que hay una caja abierta
    const openSession = await executeQuery("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1")

    if (openSession.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay una caja abierta",
        code: "NO_OPEN_CASH",
      })
    }

    // Validaciones
    if (!["deposit", "withdrawal", "expense"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de movimiento inválido",
        code: "INVALID_MOVEMENT_TYPE",
      })
    }

    const movementAmount = Number.parseFloat(amount)
    if (isNaN(movementAmount) || movementAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Monto inválido",
        code: "INVALID_AMOUNT",
      })
    }

    if (!description || description.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "La descripción debe tener al menos 5 caracteres",
        code: "INVALID_DESCRIPTION",
      })
    }

    // Crear movimiento
    const result = await executeQuery(
      `
      INSERT INTO cash_movements (
        cash_session_id, type, amount, description, reference, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
      [
        openSession[0].id,
        type,
        type === "withdrawal" || type === "expense" ? -Math.abs(movementAmount) : movementAmount,
        description.trim(),
        reference?.trim() || null,
        userId,
      ],
    )

    // Obtener el movimiento creado
    const newMovement = await executeQuery(
      `
      SELECT 
        cm.id, cm.cash_session_id, cm.type, cm.amount, cm.description, cm.reference, cm.user_id, cm.created_at,
        u.name as user_name
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.id = ?
    `,
      [result.insertId],
    )

    res.status(201).json({
      success: true,
      message: "Movimiento registrado correctamente",
      data: newMovement[0],
    })
  } catch (error) {
    console.error("Error al crear movimiento:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "MOVEMENT_CREATE_ERROR",
    })
  }
}

export const getCashSettings = async (req, res) => {
  try {
    const settings = await executeQuery("SELECT * FROM cash_settings ORDER BY id DESC LIMIT 1")

    if (settings.length === 0) {
      await executeQuery(`
        INSERT INTO cash_settings (
          min_cash_amount, max_cash_amount, auto_close_time, 
          require_count_for_close, allow_negative_cash
        ) VALUES (2000.00, 20000.00, '22:00:00', TRUE, FALSE)
      `)

      const newSettings = await executeQuery("SELECT * FROM cash_settings ORDER BY id DESC LIMIT 1")
      return res.json({
        success: true,
        data: newSettings[0],
      })
    }

    res.json({
      success: true,
      data: settings[0],
    })
  } catch (error) {
    console.error("Error al obtener configuración:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "SETTINGS_FETCH_ERROR",
    })
  }
}

export const updateCashSettings = async (req, res) => {
  try {
    const { min_cash_amount, max_cash_amount, auto_close_time, require_count_for_close, allow_negative_cash } = req.body

    // Validaciones básicas
    if (min_cash_amount !== undefined) {
      const minAmount = Number.parseFloat(min_cash_amount)
      if (isNaN(minAmount) || minAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Monto mínimo inválido",
          code: "INVALID_MIN_AMOUNT",
        })
      }
    }

    if (max_cash_amount !== undefined) {
      const maxAmount = Number.parseFloat(max_cash_amount)
      if (isNaN(maxAmount) || maxAmount < 0) {
        return res.status(400).json({
          success: false,
          message: "Monto máximo inválido",
          code: "INVALID_MAX_AMOUNT",
        })
      }
    }

    // Construir query de actualización dinámicamente
    const updates = []
    const params = []

    if (min_cash_amount !== undefined) {
      updates.push("min_cash_amount = ?")
      params.push(Number.parseFloat(min_cash_amount))
    }

    if (max_cash_amount !== undefined) {
      updates.push("max_cash_amount = ?")
      params.push(Number.parseFloat(max_cash_amount))
    }

    if (auto_close_time !== undefined) {
      updates.push("auto_close_time = ?")
      params.push(auto_close_time)
    }

    if (require_count_for_close !== undefined) {
      updates.push("require_count_for_close = ?")
      params.push(Boolean(require_count_for_close))
    }

    if (allow_negative_cash !== undefined) {
      updates.push("allow_negative_cash = ?")
      params.push(Boolean(allow_negative_cash))
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No hay campos para actualizar",
        code: "NO_UPDATES",
      })
    }

    updates.push("updated_at = CURRENT_TIMESTAMP")

    await executeQuery(
      `
      UPDATE cash_settings 
      SET ${updates.join(", ")} 
      WHERE id = (SELECT id FROM (SELECT id FROM cash_settings ORDER BY id DESC LIMIT 1) as temp)
    `,
      params,
    )

    // Obtener configuración actualizada
    const updatedSettings = await executeQuery("SELECT * FROM cash_settings ORDER BY id DESC LIMIT 1")

    res.json({
      success: true,
      message: "Configuración actualizada correctamente",
      data: updatedSettings[0],
    })
  } catch (error) {
    console.error("Error al actualizar configuración:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "SETTINGS_UPDATE_ERROR",
    })
  }
}

export const getSummary = async (req, res) => {
  try {
    const currentSessionQuery = await executeQuery(
      "SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opening_date DESC LIMIT 1",
    )

    if (currentSessionQuery.length === 0) {
      return res.json({
        success: true,
        data: {
          isOpen: false,
          message: "No hay ninguna sesión de caja abierta actualmente",
        },
      })
    }

    const session = currentSessionQuery[0]

    const movementsQuery = await executeQuery(
      `
      SELECT cm.*, u.name as user_name
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.cash_session_id = ?
      ORDER BY cm.created_at ASC
    `,
      [session.id],
    )

    const movements = movementsQuery

    console.log(`📊 Calculando totales para sesión ${session.id}...`)
    console.log(`📋 Total de movimientos: ${movements.length}`)

    let totalVentasEfectivo = 0
    let totalVentasTarjeta = 0
    let totalVentasTransferencia = 0
    let totalPagosCuentaCorriente = 0
    let totalDepositos = 0
    let totalGastos = 0
    let totalRetiros = 0
    let totalCancelaciones = 0
    let cantidadVentas = 0

    let efectivoFisico = Number.parseFloat(session.opening_amount) || 0

    for (const movement of movements) {
      const amount = Number.parseFloat(movement.amount) || 0
      const absAmount = Math.abs(amount)

      switch (movement.type) {
        case "opening":
        case "closing":
          // Ignorar movimientos de apertura/cierre en cálculos
          break

        case "sale":
          cantidadVentas++
          switch (movement.payment_method) {
            case "efectivo":
              totalVentasEfectivo += absAmount
              efectivoFisico += absAmount
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              totalVentasTarjeta += absAmount
              break
            case "transferencia":
            case "transfer":
              totalVentasTransferencia += absAmount
              break
            case "multiple":
              // Para múltiples, necesitamos parsear el JSON
              if (movement.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [
                    movement.sale_id,
                  ])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const paymentMethods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of paymentMethods) {
                      const pmAmount = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          totalVentasEfectivo += pmAmount
                          efectivoFisico += pmAmount
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          totalVentasTarjeta += pmAmount
                          break
                        case "transferencia":
                        case "transfer":
                          totalVentasTransferencia += pmAmount
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando venta múltiple:", e)
                }
              }
              break
          }
          break

        case "deposit":
          // Identificar si es pago de cuenta corriente o depósito normal
          const isPagoCuentaCorriente =
            movement.description &&
            (movement.description.toLowerCase().includes("cuenta corriente") ||
              movement.description.toLowerCase().includes("pago cuenta") ||
              movement.description.toLowerCase().includes("cta cte") ||
              movement.description.toLowerCase().includes("cta. cte"))

          if (isPagoCuentaCorriente) {
            totalPagosCuentaCorriente += absAmount
            // Solo suma al efectivo físico si es en efectivo
            if (movement.payment_method === "efectivo") {
              efectivoFisico += absAmount
            }
          } else {
            totalDepositos += absAmount
            efectivoFisico += absAmount // Los depósitos siempre son efectivo
          }
          break

        case "withdrawal":
          totalRetiros += absAmount
          efectivoFisico -= absAmount
          break

        case "expense":
          totalGastos += absAmount
          efectivoFisico -= absAmount
          break

        case "cancellation":
          // IMPORTANTE: Las cancelaciones tienen monto negativo
          // absAmount ya es positivo, lo usamos para restar de los totales
          totalCancelaciones += absAmount
          cantidadVentas = Math.max(0, cantidadVentas - 1)

          // Restar del método correspondiente
          switch (movement.payment_method) {
            case "efectivo":
              totalVentasEfectivo -= absAmount
              efectivoFisico -= absAmount
              console.log(`💰 Cancelación efectivo: -$${absAmount} | Efectivo físico ahora: $${efectivoFisico}`)
              break
            case "tarjeta_credito":
            case "tarjeta_debito":
            case "tarjeta":
              totalVentasTarjeta -= absAmount
              console.log(`💳 Cancelación tarjeta: -$${absAmount}`)
              break
            case "transferencia":
            case "transfer":
              totalVentasTransferencia -= absAmount
              console.log(`🏦 Cancelación transferencia: -$${absAmount}`)
              break
            case "multiple":
              if (movement.sale_id) {
                try {
                  const saleData = await executeQuery("SELECT payment_methods FROM sales WHERE id = ?", [
                    movement.sale_id,
                  ])
                  if (saleData.length > 0 && saleData[0].payment_methods) {
                    const paymentMethods = JSON.parse(saleData[0].payment_methods)
                    for (const pm of paymentMethods) {
                      const pmAmount = Number.parseFloat(pm.amount) || 0
                      switch (pm.method) {
                        case "efectivo":
                          totalVentasEfectivo -= pmAmount
                          efectivoFisico -= pmAmount
                          break
                        case "tarjeta_credito":
                        case "tarjeta_debito":
                        case "tarjeta":
                          totalVentasTarjeta -= pmAmount
                          break
                        case "transferencia":
                        case "transfer":
                          totalVentasTransferencia -= pmAmount
                          break
                      }
                    }
                  }
                } catch (e) {
                  console.warn("⚠️ Error parseando cancelación múltiple:", e)
                }
              }
              break
          }
          break
      }
    }

    // Cálculos finales
    const totalVentas = totalVentasEfectivo + totalVentasTarjeta + totalVentasTransferencia
    const totalIngresosDia = totalVentas + totalPagosCuentaCorriente + totalDepositos
    const totalEgresosDia = totalGastos + totalRetiros + totalCancelaciones
    const gananciaNetaDia = totalIngresosDia - totalEgresosDia
    const totalGeneralCaja = Number.parseFloat(session.opening_amount) + totalIngresosDia - totalEgresosDia

    console.log("📊 TOTALES CALCULADOS:")
    console.log(`  💵 Total Ventas Efectivo: $${totalVentasEfectivo}`)
    console.log(`  💳 Total Ventas Tarjeta: $${totalVentasTarjeta}`)
    console.log(`  🏦 Total Ventas Transferencia: $${totalVentasTransferencia}`)
    console.log(`  📊 Total Ventas: $${totalVentas}`)
    console.log(`  💰 Efectivo Físico en Caja: $${efectivoFisico}`)
    console.log(`  ✅ Total Ingresos del Día: $${totalIngresosDia}`)
    console.log(
      `  ❌ Total Egresos del Día: $${totalEgresosDia} (Gastos: $${totalGastos}, Retiros: $${totalRetiros}, Cancelaciones: $${totalCancelaciones})`,
    )
    console.log(`  💎 Ganancia Neta: $${gananciaNetaDia}`)
    console.log(`  🏦 Total General de Caja: $${totalGeneralCaja}`)

    const responseData = {
      session: {
        ...session,
        // Efectivo físico en caja
        efectivo_fisico: efectivoFisico,
        calculated_amount: efectivoFisico,

        total_general_caja: totalGeneralCaja,

        // Totales del día (simplificados)
        total_ingresos_dia: totalIngresosDia,
        total_egresos_dia: totalEgresosDia,
        ganancia_neta_dia: gananciaNetaDia,

        // Desglose de ventas por método (para referencia)
        ventas_efectivo: totalVentasEfectivo,
        ventas_tarjeta: totalVentasTarjeta,
        ventas_transferencia: totalVentasTransferencia,
        total_ventas: totalVentas,

        // Otros ingresos
        pagos_cuenta_corriente: totalPagosCuentaCorriente,
        depositos: totalDepositos,

        // Egresos
        gastos: totalGastos,
        retiros: totalRetiros,
        cancelaciones: totalCancelaciones,

        // Estadísticas
        sales_count: cantidadVentas,
      },
      movements,
      isOpen: true,
    }

    res.json({
      success: true,
      data: responseData,
    })
  } catch (error) {
    console.error("💥 Error obteniendo resumen de caja:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener el resumen de caja",
      error: error.message,
    })
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount)
}
