import { executeQuery } from "../config/database.js"
import PDFDocument from "pdfkit"

// Obtener configuración del negocio
export const getBusinessConfig = async (req, res) => {
  try {
    const businessConfig = await executeQuery(
      "SELECT * FROM business_config ORDER BY id DESC LIMIT 1"
    )

    if (businessConfig.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Configuración del negocio no encontrada",
        code: "BUSINESS_CONFIG_NOT_FOUND"
      })
    }

    res.json({
      success: true,
      data: businessConfig[0]
    })
  } catch (error) {
    console.error("Error obteniendo configuración del negocio:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener configuración del negocio",
      code: "BUSINESS_CONFIG_ERROR"
    })
  }
}

// Actualizar configuración del negocio
export const updateBusinessConfig = async (req, res) => {
  try {
    const {
      business_name,
      business_address,
      business_phone,
      business_email,
      business_cuit,
      business_website,
      business_logo,
      business_slogan,
      business_footer_message
    } = req.body

    // Validar que al menos el nombre del negocio esté presente
    if (!business_name || business_name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre del negocio es requerido",
        code: "BUSINESS_NAME_REQUIRED"
      })
    }

    // Verificar si existe configuración
    const existingConfig = await executeQuery(
      "SELECT id FROM business_config LIMIT 1"
    )

    if (existingConfig.length === 0) {
      // Crear nueva configuración
      await executeQuery(
        `INSERT INTO business_config (
          business_name, business_address, business_phone, business_email,
          business_cuit, business_website, business_logo, business_slogan,
          business_footer_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          business_name,
          business_address || null,
          business_phone || null,
          business_email || null,
          business_cuit || null,
          business_website || null,
          business_logo || null,
          business_slogan || null,
          business_footer_message || null
        ]
      )
    } else {
      // Actualizar configuración existente
      await executeQuery(
        `UPDATE business_config SET
          business_name = ?,
          business_address = ?,
          business_phone = ?,
          business_email = ?,
          business_cuit = ?,
          business_website = ?,
          business_logo = ?,
          business_slogan = ?,
          business_footer_message = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          business_name,
          business_address || null,
          business_phone || null,
          business_email || null,
          business_cuit || null,
          business_website || null,
          business_logo || null,
          business_slogan || null,
          business_footer_message || null,
          existingConfig[0].id
        ]
      )
    }

    // Obtener configuración actualizada
    const updatedConfig = await executeQuery(
      "SELECT * FROM business_config ORDER BY id DESC LIMIT 1"
    )

    res.json({
      success: true,
      message: "Configuración del negocio actualizada correctamente",
      data: updatedConfig[0]
    })
  } catch (error) {
    console.error("Error actualizando configuración del negocio:", error)
    res.status(500).json({
      success: false,
      message: "Error al actualizar configuración del negocio",
      code: "BUSINESS_CONFIG_UPDATE_ERROR"
    })
  }
}

// Obtener configuración de tickets
export const getTicketConfig = async (req, res) => {
  try {
    const ticketConfig = await executeQuery(
      "SELECT * FROM ticket_config ORDER BY id DESC LIMIT 1"
    )

    if (ticketConfig.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Configuración de tickets no encontrada",
        code: "TICKET_CONFIG_NOT_FOUND"
      })
    }

    res.json({
      success: true,
      data: ticketConfig[0]
    })
  } catch (error) {
    console.error("Error obteniendo configuración de tickets:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener configuración de tickets",
      code: "TICKET_CONFIG_ERROR"
    })
  }
}

// Actualizar configuración de tickets
export const updateTicketConfig = async (req, res) => {
  try {
    const {
      enable_print,
      auto_print,
      printer_name,
      paper_width,
      show_logo,
      show_business_info,
      show_cuit,
      show_barcode,
      show_qr,
      font_size,
      print_duplicate,
      copies_count,
      header_message,
      footer_message,
      return_policy,
      show_cashier,
      show_customer,
      show_payment_method,
      show_change,
      fiscal_type,
      show_tax_breakdown,
      include_cae
    } = req.body

    // Validar valores
    if (paper_width && ![58, 80].includes(Number(paper_width))) {
      return res.status(400).json({
        success: false,
        message: "Ancho de papel inválido. Debe ser 58mm o 80mm",
        code: "INVALID_PAPER_WIDTH"
      })
    }

    if (font_size && !['small', 'normal', 'large'].includes(font_size)) {
      return res.status(400).json({
        success: false,
        message: "Tamaño de fuente inválido",
        code: "INVALID_FONT_SIZE"
      })
    }

    if (fiscal_type && !['TICKET', 'FACTURA_A', 'FACTURA_B', 'FACTURA_C'].includes(fiscal_type)) {
      return res.status(400).json({
        success: false,
        message: "Tipo fiscal inválido",
        code: "INVALID_FISCAL_TYPE"
      })
    }

    // Verificar si existe configuración
    const existingConfig = await executeQuery(
      "SELECT id FROM ticket_config LIMIT 1"
    )

    if (existingConfig.length === 0) {
      // Crear nueva configuración
      await executeQuery(
        `INSERT INTO ticket_config (
          enable_print, auto_print, printer_name, paper_width,
          show_logo, show_business_info, show_cuit, show_barcode, show_qr,
          font_size, print_duplicate, copies_count,
          header_message, footer_message, return_policy,
          show_cashier, show_customer, show_payment_method, show_change,
          fiscal_type, show_tax_breakdown, include_cae,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          enable_print ?? true,
          auto_print ?? false,
          printer_name || null,
          paper_width || 80,
          show_logo ?? true,
          show_business_info ?? true,
          show_cuit ?? true,
          show_barcode ?? false,
          show_qr ?? false,
          font_size || 'normal',
          print_duplicate ?? false,
          copies_count || 1,
          header_message || null,
          footer_message || null,
          return_policy || null,
          show_cashier ?? true,
          show_customer ?? true,
          show_payment_method ?? true,
          show_change ?? true,
          fiscal_type || 'TICKET',
          show_tax_breakdown ?? true,
          include_cae ?? false
        ]
      )
    } else {
      // Actualizar configuración existente
      await executeQuery(
        `UPDATE ticket_config SET
          enable_print = ?,
          auto_print = ?,
          printer_name = ?,
          paper_width = ?,
          show_logo = ?,
          show_business_info = ?,
          show_cuit = ?,
          show_barcode = ?,
          show_qr = ?,
          font_size = ?,
          print_duplicate = ?,
          copies_count = ?,
          header_message = ?,
          footer_message = ?,
          return_policy = ?,
          show_cashier = ?,
          show_customer = ?,
          show_payment_method = ?,
          show_change = ?,
          fiscal_type = ?,
          show_tax_breakdown = ?,
          include_cae = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [
          enable_print ?? true,
          auto_print ?? false,
          printer_name || null,
          paper_width || 80,
          show_logo ?? true,
          show_business_info ?? true,
          show_cuit ?? true,
          show_barcode ?? false,
          show_qr ?? false,
          font_size || 'normal',
          print_duplicate ?? false,
          copies_count || 1,
          header_message || null,
          footer_message || null,
          return_policy || null,
          show_cashier ?? true,
          show_customer ?? true,
          show_payment_method ?? true,
          show_change ?? true,
          fiscal_type || 'TICKET',
          show_tax_breakdown ?? true,
          include_cae ?? false,
          existingConfig[0].id
        ]
      )
    }

    // Obtener configuración actualizada
    const updatedConfig = await executeQuery(
      "SELECT * FROM ticket_config ORDER BY id DESC LIMIT 1"
    )

    res.json({
      success: true,
      message: "Configuración de tickets actualizada correctamente",
      data: updatedConfig[0]
    })
  } catch (error) {
    console.error("Error actualizando configuración de tickets:", error)
    res.status(500).json({
      success: false,
      message: "Error al actualizar configuración de tickets",
      code: "TICKET_CONFIG_UPDATE_ERROR"
    })
  }
}

// Obtener toda la configuración (negocio + tickets) en una sola llamada
export const getAllConfig = async (req, res) => {
  try {
    const [businessConfig, ticketConfig] = await Promise.all([
      executeQuery("SELECT * FROM business_config ORDER BY id DESC LIMIT 1"),
      executeQuery("SELECT * FROM ticket_config ORDER BY id DESC LIMIT 1")
    ])

    res.json({
      success: true,
      data: {
        business: businessConfig[0] || null,
        ticket: ticketConfig[0] || null
      }
    })
  } catch (error) {
    console.error("Error obteniendo configuración completa:", error)
    res.status(500).json({
      success: false,
      message: "Error al obtener configuración",
      code: "CONFIG_ERROR"
    })
  }
}

export const generateThermalPDF = async (req, res) => {
  try {
    const { saleData, businessConfig, ticketConfig } = req.body

    if (!saleData || !saleData.sale || !saleData.items) {
      return res.status(400).json({
        success: false,
        message: "Datos de venta incompletos",
        code: "INCOMPLETE_SALE_DATA"
      })
    }

    // 58mm = 164.409 puntos (1mm = 2.834645669 puntos)
    const THERMAL_WIDTH = 164.409 // 58mm en puntos
    const MARGIN_LEFT = 3  // Reducido de 8 a 3
    const MARGIN_RIGHT = 3 // Reducido de 8 a 3
    const CONTENT_WIDTH = THERMAL_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

    // Tamaños de fuente según configuración
    const fontSizes = {
      small: { title: 10, header: 8, body: 7, small: 6 },
      normal: { title: 12, header: 9, body: 8, small: 7 },
      large: { title: 14, header: 10, body: 9, small: 8 }
    }
    const fontSize = fontSizes[ticketConfig?.font_size || 'normal']

    // Crear documento PDF con tamaño térmico exacto de 58mm
    const doc = new PDFDocument({
      size: [THERMAL_WIDTH, 10000], // Alto dinámico, se ajustará
      margins: { top: 8, bottom: 10, left: MARGIN_LEFT, right: MARGIN_RIGHT }, // Margen superior reducido
      bufferPages: true
    })

    // Buffer para almacenar el PDF
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    
    // Promesa para cuando termine de generar
    const pdfPromise = new Promise((resolve, reject) => {
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks)
        resolve(pdfBuffer)
      })
      doc.on('error', reject)
    })

    let yPosition = doc.y

    // === ENCABEZADO CON INFORMACIÓN DEL NEGOCIO ===
    if (ticketConfig?.show_business_info && businessConfig) {
      // Nombre del negocio - centrado
      doc.font('Helvetica-Bold')
        .fontSize(fontSize.title)
        .fillColor('#000000') // Color negro sólido
        .text(businessConfig.business_name || 'MI NEGOCIO', MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 2 // Reducido espaciado

      // Información del negocio
      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido para toda la info

      if (businessConfig.business_address) {
        doc.text(businessConfig.business_address, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
        yPosition = doc.y + 1
      }

      if (businessConfig.business_phone) {
        doc.text(`Tel: ${businessConfig.business_phone}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
        yPosition = doc.y + 1
      }

      if (ticketConfig?.show_cuit && businessConfig.business_cuit) {
        doc.text(`CUIT: ${businessConfig.business_cuit}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
        yPosition = doc.y + 1
      }

      if (businessConfig.business_email) {
        doc.text(businessConfig.business_email, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
        yPosition = doc.y + 1
      }
    }

    // Mensaje de encabezado personalizado
    if (ticketConfig?.header_message) {
      yPosition += 3
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .dash(1, { space: 1 }) // Líneas más delgadas
        .stroke()
      yPosition += 3

      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(ticketConfig.header_message, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 2
    }

    yPosition += 3
    doc.undash()
      .moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 1
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 3

    // === TIPO FISCAL Y NÚMERO ===
    doc.font('Helvetica-Bold')
      .fontSize(fontSize.header)
      .fillColor('#000000') // Color negro sólido
      .text(`${ticketConfig?.fiscal_type || 'TICKET'} #${saleData.sale.id}`, MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH,
        align: 'center'
      })
    yPosition = doc.y + 1

    // Fecha y hora
    const saleDate = new Date(saleData.sale.created_at)
    const dateStr = saleDate.toLocaleDateString('es-AR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })
    const timeStr = saleDate.toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    })
    
    doc.font('Helvetica-Bold')
      .fontSize(fontSize.small)
      .fillColor('#000000') // Color negro sólido
      .text(`${dateStr} ${timeStr}`, MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH,
        align: 'center'
      })
    yPosition = doc.y + 3

    // Línea separadora
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .dash(1, { space: 1 })
      .stroke()
    yPosition += 3

    // === INFORMACIÓN DEL CLIENTE ===
    if (ticketConfig?.show_customer && saleData.sale.customer_name && 
        saleData.sale.customer_name !== 'Consumidor Final') {
      doc.undash()
        .font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(`Cliente: ${saleData.sale.customer_name}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH
        })
      yPosition = doc.y + 1

      if (saleData.sale.customer_document) {
        doc.text(`DNI/CUIT: ${saleData.sale.customer_document}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH
        })
        yPosition = doc.y + 1
      }
    }

    // === INFORMACIÓN DEL CAJERO ===
    if (ticketConfig?.show_cashier && saleData.sale.cashier_name) {
      doc.fillColor('#000000') // Color negro sólido
        .text(`Cajero: ${saleData.sale.cashier_name}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH
        })
      yPosition = doc.y + 1
    }

    // Línea separadora
    yPosition += 2
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .dash(1, { space: 1 })
      .stroke()
    yPosition += 3

    // === DETALLE DE PRODUCTOS ===
    doc.undash()
      .font('Helvetica-Bold')
      .fontSize(fontSize.body)
      .fillColor('#000000') // Color negro sólido
      .text('DETALLE DE COMPRA', MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH,
        align: 'left' // Alineado a la izquierda
      })
    yPosition = doc.y + 2

    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .dash(1, { space: 1 })
      .stroke()
    yPosition += 3

    // Items
    doc.undash().font('Helvetica-Bold').fontSize(fontSize.small).fillColor('#000000') // Color negro sólido
    
    for (const item of saleData.items) {
      const quantity = parseFloat(item.quantity)
      const unitPrice = parseFloat(item.unit_price)
      const totalPrice = quantity * unitPrice
      const unit = item.product_unit_type === 'kg' ? 'kg' : 'un'

      // Nombre del producto
      doc.font('Helvetica-Bold')
        .fillColor('#000000') // Color negro sólido
        .text(item.product_name, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH
        })
      yPosition = doc.y

      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
      
      const detailText = `${quantity} ${unit} x $${unitPrice.toFixed(2)}`
      const totalText = `$${totalPrice.toFixed(2)}`
      
      // Cantidad y precio unitario
      doc.text(detailText, MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH * 0.65,
        continued: true
      })
      // Total alineado a la derecha
      .text(totalText, {
        width: CONTENT_WIDTH * 0.35,
        align: 'right'
      })
      
      yPosition = doc.y + 2
    }

    yPosition += 1
    doc.fontSize(fontSize.body)
      .moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 1
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 3

    // === TOTALES ===
    const subtotal = parseFloat(saleData.sale.subtotal)
    const tax = parseFloat(saleData.sale.tax || 0)
    const total = parseFloat(saleData.sale.total)

    doc.font('Helvetica-Bold')
      .fontSize(fontSize.body)
      .fillColor('#000000') // Color negro sólido
      .text('Subtotal', MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH * 0.5,
        continued: true
      })
      .text(`$${subtotal.toFixed(2)}`, {
        width: CONTENT_WIDTH * 0.5,
        align: 'right'
      })
    yPosition = doc.y + 1

    // Desglose de IVA
    if (ticketConfig?.show_tax_breakdown && tax > 0) {
      doc.fillColor('#000000') // Color negro sólido
        .text('IVA (21%)', MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH * 0.5,
          continued: true
        })
      .text(`$${tax.toFixed(2)}`, {
        width: CONTENT_WIDTH * 0.5,
        align: 'right'
      })
      yPosition = doc.y + 1
    }

    // Línea doble
    yPosition += 2
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 1
    doc.moveTo(MARGIN_LEFT, yPosition)
      .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
      .stroke()
    yPosition += 3

    // TOTAL
    doc.font('Helvetica-Bold')
      .fontSize(fontSize.header)
      .fillColor('#000000') // Color negro sólido
      .text('TOTAL:', MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH * 0.5,
        continued: true
      })
      .text(`$${total.toFixed(2)}`, {
        width: CONTENT_WIDTH * 0.5,
        align: 'right'
      })
    yPosition = doc.y + 3

    // === MÉTODO DE PAGO ===
    if (ticketConfig?.show_payment_method) {
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .dash(1, { space: 1 })
        .stroke()
      yPosition += 3

      doc.undash()
        .font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido

      if (saleData.sale.payment_method === 'multiple' && saleData.sale.payment_methods_formatted) {
        doc.font('Helvetica-Bold').text('FORMAS DE PAGO:', MARGIN_LEFT, yPosition)
        yPosition = doc.y + 1

        doc.font('Helvetica-Bold').fillColor('#000000') // Color negro sólido
        for (const pm of saleData.sale.payment_methods_formatted) {
          const methodLabels = {
            efectivo: 'Efectivo',
            tarjeta_credito: 'T. Crédito',
            tarjeta_debito: 'T. Débito',
            transferencia: 'Transferencia',
            cuenta_corriente: 'Cta. Cte.'
          }
          const methodLabel = methodLabels[pm.method] || pm.method

          doc.text(`${methodLabel}`, MARGIN_LEFT, yPosition, {
            width: CONTENT_WIDTH * 0.6,
            continued: true
          })
          .text(`$${parseFloat(pm.amount).toFixed(2)}`, {
            width: CONTENT_WIDTH * 0.4,
            align: 'right'
          })
          yPosition = doc.y + 1
        }
      } else {
        const methodLabels = {
          efectivo: 'Efectivo',
          tarjeta_credito: 'T. Crédito',
          tarjeta_debito: 'T. Débito',
          transferencia: 'Transferencia',
          cuenta_corriente: 'Cta. Cte.',
          multiple: 'Múltiples'
        }
        const methodLabel = methodLabels[saleData.sale.payment_method] || saleData.sale.payment_method

        doc.text(`Forma de pago: ${methodLabel}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH
        })
        yPosition = doc.y + 2
      }
    }

    // === CAE (AFIP) ===
    if (ticketConfig?.include_cae && saleData.sale.cae) {
      yPosition += 2
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .dash(1, { space: 1 })
        .stroke()
      yPosition += 3

      doc.undash()
        .font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(`CAE: ${saleData.sale.cae}`, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y

      doc.text(`Vto. CAE: ${saleData.sale.cae_expiration}`, MARGIN_LEFT, yPosition, {
        width: CONTENT_WIDTH,
        align: 'center'
      })
      yPosition = doc.y + 2
    }

    // === POLÍTICA DE DEVOLUCIONES ===
    if (ticketConfig?.return_policy) {
      yPosition += 3
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .stroke()
      yPosition += 1
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .stroke()
      yPosition += 3

      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text('POLÍTICA DE DEVOLUCIONES', MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 1

      doc.font('Helvetica-Bold')
        .fillColor('#000000') // Color negro sólido
        .text(ticketConfig.return_policy, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 2
    }

    // === PIE DE PÁGINA ===
    if (ticketConfig?.footer_message || businessConfig?.business_footer_message) {
      yPosition += 3
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .stroke()
      yPosition += 1
      doc.moveTo(MARGIN_LEFT, yPosition)
        .lineTo(THERMAL_WIDTH - MARGIN_RIGHT, yPosition)
        .stroke()
      yPosition += 3

      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(ticketConfig.footer_message || businessConfig.business_footer_message, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 2
    }

    // Información adicional del negocio
    if (businessConfig?.business_slogan) {
      doc.font('Helvetica-Oblique')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(businessConfig.business_slogan, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 1
    }

    if (businessConfig?.business_website) {
      doc.font('Helvetica-Bold')
        .fontSize(fontSize.small)
        .fillColor('#000000') // Color negro sólido
        .text(businessConfig.business_website, MARGIN_LEFT, yPosition, {
          width: CONTENT_WIDTH,
          align: 'center'
        })
      yPosition = doc.y + 2
    }

    // Agregado espacio adicional de 30 puntos al final
    yPosition += 30

    // Finalizar el documento
    doc.end()

    // Esperar a que se genere el PDF
    const pdfBuffer = await pdfPromise

    // Enviar el PDF como respuesta
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${saleData.sale.id}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.send(pdfBuffer)

  } catch (error) {
    console.error("Error generando PDF térmico:", error)
    res.status(500).json({
      success: false,
      message: "Error al generar PDF térmico",
      code: "PDF_GENERATION_ERROR",
      error: error.message
    })
  }
}
+9