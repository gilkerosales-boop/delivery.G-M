// CONFIGURACIÓN ASÍNCRONA: Reemplaza con el enlace público /exec de tu Web App de Google
const API_URL = "https://script.google.com/macros/s/AKfycbxg05fSRE735ZKWGx4WM24yhtEw6svUDHTxg70JY-QTvRRoThQzF5ZfNZpec7jLfzFf/exec"; 

// Variables de Estado de Aplicación
let pendientesCargados = [];
let reportesCargados = [];
let deudasReporte = null; // Almacenará la estructura de deudas leída para el PDF
let usuarioActivo = ""; // Almacenará el nombre del usuario logueado dinámicamente
let nombresActivo = ""; // Almacenará el nombre real (nombres) del usuario activo

/**
 * Función asíncrona de conexión global unificada (REST API Fetch Wrapper)
 * Utiliza Content-Type text/plain para evadir el Preflight OPTIONS de CORS en Google [1]
 */
async function callBackend(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain" // Elude la petición OPTIONS y previene fallas de CORS [1]
      },
      body: JSON.stringify({
        action: action,
        payload: payload,
        usuario: usuarioActivo
      })
    });
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Fallo de comunicación con la API: ", err);
    throw err;
  }
}

/**
 * Auto-ajusta dinámicamente la altura del textarea para adaptarlo a su contenido textual sin scrolls
 */
function ajustarAlturaTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/**
 * Ajusta en lote la altura de todas las casillas de ubicación del DOM.
 */
function inicializarAutoAlturaTextareas() {
  setTimeout(() => {
    const textareas = document.querySelectorAll('.loc-val, .hist-loc');
    textareas.forEach(el => {
      ajustarAlturaTextarea(el);
    });
  }, 80);
}

/**
 * Convierte una cadena de fecha con formato nativo "YYYY-MM-DD" al formato de visualización "DD-MM-YYYY".
 */
function formatearADiaMesAnio(fechaStr) {
  if (!fechaStr) return "";
  const partes = fechaStr.split("-");
  if (partes.length === 3) {
    return `${partes[2]}-${partes[1]}-${partes[0]}`;
  }
  return fechaStr;
}

/**
 * Convierte una cadena de fecha con formato de visualización "DD-MM-YYYY" al formato nativo "YYYY-MM-DD".
 */
function formatearAAnioMesDia(fechaStr) {
  if (!fechaStr) return "";
  const partes = fechaStr.split("-");
  if (partes.length === 3) {
    if (partes[0].length === 4) return fechaStr;
    return `${partes[2]}-${partes[1]}-${partes[0]}`;
  }
  return fechaStr;
}

/**
 * Inicializa la aplicación dejando los campos vacíos y deshabilitando controles.
 */
function inicializarAplicacion() {
  document.getElementById('reg-fecha-inicio').value = "";
  document.getElementById('reg-fecha-fin').value = "";
  desactivarDropdownConMensaje("Esperando rango de fechas...");
  
  // Carga de periodos de facturación guardados en Sheets
  cargarSemanasGuardadas();
  cargarSemanasFacturadas();
}

/**
 * Consulta al backend los períodos guardados en Sheets y los inserta en los selectores de facturas y editor
 */
function cargarSemanasGuardadas() {
  callBackend("obtenerPeriodosSemanales")
    .then(response => {
      const selectFactura = document.getElementById('select-semana-factura');
      const selectEditor = document.getElementById('select-semana-editor');
      
      selectFactura.innerHTML = '';
      selectEditor.innerHTML = '';
      
      const periodos = response.periodos || [];
      
      if (periodos.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No hay registros guardados";
        
        selectFactura.appendChild(option.cloneNode(true));
        selectEditor.appendChild(option.cloneNode(true));
        
        selectFactura.disabled = true;
        selectEditor.disabled = true;
      } else {
        periodos.forEach(p => {
          const option = document.createElement('option');
          option.value = p;
          option.textContent = p;
          
          selectFactura.appendChild(option.cloneNode(true));
          selectEditor.appendChild(option.cloneNode(true));
        });
        selectFactura.disabled = false;
        selectEditor.disabled = false;
      }
    })
    .catch(err => {
      mostrarNotificacion("Error al cargar períodos semanales: " + err, "error");
    });
}

/**
 * Cambiar entre pestañas de navegación
 */
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.remove('active');
  });

  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

/**
 * Muestra mensajes de estado temporales en el Toast
 */
function mostrarNotificacion(mensaje, tipo = 'success') {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = mensaje;
    toast.className = `toast ${tipo}`;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 6000);
  }
}

/**
 * Control del loader de carga de pantalla
 */
function setLoading(mostrar, texto = 'Procesando solicitud...') {
  const loader = document.getElementById('loader');
  const loaderText = document.getElementById('loader-text');
  if (loader && loaderText) {
    loaderText.textContent = texto;
    loader.style.display = mostrar ? 'flex' : 'none';
  }
}

/**
 * Valida de Lunes a Domingo de la misma semana.
 */
function esRangoSemanalValido(inicioStr, finStr) {
  if (!inicioStr || !finStr) return false;

  const inicio = new Date(inicioStr + "T00:00:00");
  const fin = new Date(finStr + "T00:00:00");

  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
    return false;
  }

  if (inicio.getDay() !== 1) {
    mostrarNotificacion("⚠️ La fecha de inicio seleccionada debe ser un día Lunes para iniciar el período semanal.", "warning");
    return false;
  }

  if (fin.getDay() !== 0) {
    mostrarNotificacion("⚠️ La fecha de finalización seleccionada debe ser un día Domingo para cerrar el período semanal.", "warning");
    return false;
  }

  const diffMs = fin.getTime() - inicio.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays !== 6) {
    mostrarNotificacion("⚠️ El período seleccionado debe abarcar exactamente una semana laboral (7 días continuos de Lunes a Domingo).", "warning");
    return false;
  }

  return true;
}

function desactivarDropdownConMensaje(mensaje) {
  const selectDia = document.getElementById('select-dia');
  const btnProcesar = document.getElementById('btn-procesar-texto');
  const accionesContainer = document.getElementById('registro-acciones-container');

  selectDia.innerHTML = '';
  const option = document.createElement('option');
  option.value = "";
  option.textContent = mensaje;
  selectDia.appendChild(option);
  
  selectDia.disabled = true;
  btnProcesar.disabled = true;
  accionesContainer.style.display = 'none';
}

function cargarDiasDisponibles() {
  const inicio = document.getElementById('reg-fecha-inicio').value;
  const fin = document.getElementById('reg-fecha-fin').value;

  if (!inicio || !fin) {
    desactivarDropdownConMensaje("Esperando rango de fechas...");
    return;
  }

  if (!esRangoSemanalValido(inicio, fin)) {
    desactivarDropdownConMensaje("Período inválido");
    return;
  }

  setLoading(true, "Verificando disponibilidad de días de entrega...");
  callBackend("obtenerDiasRegistradosEnRango", { inicio: inicio, fin: fin })
    .then(response => {
      setLoading(false);
      actualizarDropdownDias(response.dias || []);
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion("Error al verificar disponibilidad de días: " + err, "error");
    });
}

function actualizarDropdownDias(diasRegistrados) {
  const selectDia = document.getElementById('select-dia');
  const btnProcesar = document.getElementById('btn-procesar-texto');
  const accionesContainer = document.getElementById('registro-acciones-container');
  const todosLosDias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  const diasDisponibles = todosLosDias.filter(dia => !diasRegistrados.includes(dia));

  selectDia.innerHTML = '';

  if (diasDisponibles.length === 0) {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "Todos los días ya registrados";
    selectDia.appendChild(option);
    selectDia.disabled = true;
    btnProcesar.disabled = true;
    accionesContainer.style.display = 'none';
    mostrarNotificacion("Todos los días para esta semana ya están registrados. Usa la pestaña Historial para editar.", "warning");
  } else {
    diasDisponibles.forEach(dia => {
      const option = document.createElement('option');
      option.value = dia;
      option.textContent = dia;
      selectDia.appendChild(option);
    });
    selectDia.disabled = false;
    btnProcesar.disabled = false;
    accionesContainer.style.display = 'block'; 
  }
}

function procesarTextoDeWhatsapp() {
  const rawText = document.getElementById('raw-text').value;
  const diaSeleccionado = document.getElementById('select-dia').value;

  if (!diaSeleccionado) {
    mostrarNotificacion('No hay ningún día seleccionable disponible para procesar.', 'warning');
    return;
  }

  if (!rawText.trim()) {
    mostrarNotificacion('Por favor, introduce el texto de los pedidos a procesar.', 'warning');
    return;
  }

  // Expresión regular de división de bloques: detecta marcas de tiempo de WhatsApp [DD/MM], emojis o saltos de línea dobles
    const blocks = rawText.split(/(?=\[\d{1,2}\/\d{1,2}.*?\]|📱|\*(?:Tel(?:é|e)fono|Tlf):\*|Tel(?:é|e)fono:|Tlf:|(?:\r?\n){2,}(?=\s*[+\d][\d\s\-()]{5,20}(?:\r?\n|$)))/gi);

  const registrosExtraidos = [];
  
  blocks.forEach(block => {
    block = block.trim();
    if (!block) return;

    let phone3Digits = "";
    let ubicacion = "";

    let lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    lines = lines.map(line => {
      const startsWithTimestamp = /^\[\d{1,2}\/\d{1,2}/.test(line);
      let cleanLine = line.replace(/^\[\d{1,2}\/\d{1,2}.*?\]\s*/, "").trim();
      if (startsWithTimestamp) {
        cleanLine = cleanLine.replace(/^[^\s*📱+\d]+:\s*/, "").trim();
      }
      return cleanLine;
    }).filter(l => l.length > 0);

    const cleanBlockText = lines.join("\n");
    if (!cleanBlockText.trim()) return;

    const tieneUbicacionLabel = cleanBlockText.toLowerCase().includes("ubicación") || cleanBlockText.toLowerCase().includes("ubicacion") || cleanBlockText.includes("📍");
    const tieneTelefonoLabel = cleanBlockText.toLowerCase().includes("teléfono") || cleanBlockText.toLowerCase().includes("telefono") || cleanBlockText.includes("📱") || cleanBlockText.toLowerCase().includes("tlf");

    if (tieneUbicacionLabel || tieneTelefonoLabel) {
      let phoneDigits = "";
      const phoneRegex = /(?:📱|tel(?:é|e)fono|tlf|cel|m(?:ó|o)vil)[^\d+]*([+\d\s\-()]+)/i;
      const phoneMatch = cleanBlockText.match(phoneRegex);
      
      if (phoneMatch) {
        phoneDigits = phoneMatch[1].replace(/\D/g, "");
      } else {
        const fallbackMatches = cleanBlockText.match(/\+?\d[\d\s\-()]{7,15}\d/);
        if (fallbackMatches) {
          phoneDigits = fallbackMatches[0].replace(/\D/g, "");
        }
      }

      if (phoneDigits) {
        phone3Digits = phoneDigits.length >= 3 ? phoneDigits.slice(-3) : phoneDigits;
      }

      const locMatch = cleanBlockText.match(/(?:\*Ubicación:\*|Ubicación:)\s*([\s\S]*?)(?=\n\n|\r\n\r\n|\n\s*(?:🛒|[^\n]*?Pedido|$))/i);
      if (locMatch) {
        ubicacion = locMatch[1].replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
      }

    } else {
      if (lines.length >= 2) {
        const phoneDigits = lines[0].replace(/\D/g, "");
        if (phoneDigits.length >= 7) {
          phone3Digits = phoneDigits.length >= 3 ? phoneDigits.slice(-3) : phoneDigits;
          ubicacion = lines[1];
        }
      }
    }

    if (phone3Digits || ubicacion) {
      registrosExtraidos.push({ dia: diaSeleccionado, telefono: phone3Digits, ubicacion: ubicacion });
    }
  });

  if (registrosExtraidos.length === 0) {
    mostrarNotificacion('No se detectó un patrón coincidente en el texto.', 'error');
    return;
  }

  renderTablaParaAjustes(registrosExtraidos);
}

function agregarFilaManual() {
  const tbody = document.getElementById('tbody-registro');
  const tableContainer = document.getElementById('tabla-registro-container');
  const diaSeleccionado = document.getElementById('select-dia').value;

  if (!diaSeleccionado) {
    mostrarNotificacion('No hay ningún día seleccionable disponible.', 'warning');
    return;
  }

  if (tableContainer.style.display === 'none') {
    tbody.innerHTML = '';
    tableContainer.style.display = 'block';
  }

  const idUnico = tbody.children.length + "_" + Date.now();

    const tr = document.createElement('tr');
    tr.id = `fila-${idUnico}`;
    tr.innerHTML = `
      <td data-label="Día"><strong>${diaSeleccionado}</strong></td>
      <td data-label="N°">
      <input type="text" class="input-table tel-val" value="" maxLength="3" style="width: 70px; text-align: center;">
    </td>
    <td data-label="Ubicación">
      <textarea class="input-table loc-val" oninput="ajustarAlturaTextarea(this)"></textarea>
    </td>
    <td data-label="Costo">
      <input type="number" step="0.01" min="0" class="input-table cost-val" placeholder="0" style="width: 95px; text-align: right;" required>
    </td>
    <td data-label="Acción">
      <button type="button" class="btn-danger btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="eliminarFilaTabla('${idUnico}')">Remover</button>
    </td>
  `;
  tbody.appendChild(tr);
  inicializarAutoAlturaTextareas();
  mostrarNotificacion('Se añadió una fila vacía para registro manual.', 'success');
}

function renderTablaParaAjustes(items) {
    const tbody = document.getElementById('tbody-registro');
    tbody.innerHTML = '';

    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.id = `fila-${index}`;
      tr.innerHTML = `
        <td data-label="Día"><strong>${item.dia}</strong></td>
        <td data-label="N°">
        <input type="text" class="input-table hist-tel tel-val" value="${item.telefono}" maxLength="3" style="width: 70px; text-align: center;">
      </td>
      <td data-label="Ubicación">
        <textarea class="input-table loc-val" oninput="ajustarAlturaTextarea(this)">${item.ubicacion}</textarea>
      </td>
      <td data-label="Costo">
        <input type="number" step="0.01" min="0" class="input-table cost-val" placeholder="0" style="width: 95px; text-align: right;" required>
      </td>
      <td data-label="Acción">
        <button type="button" class="btn-danger btn" style="padding: 4px 8px; font-size: 0.8rem;" onclick="eliminarFilaTabla('${index}')">Remover</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tabla-registro-container').style.display = 'block';
  inicializarAutoAlturaTextareas();
  mostrarNotificacion(`Se procesaron ${items.length} pedidos. Completa el costo de envío.`, 'success');
}

function eliminarFilaTabla(idSuffix) {
  const row = document.getElementById(`fila-${idSuffix}`);
  if (row) {
    row.remove();
  }

  const tbody = document.getElementById('tbody-registro');
  if (tbody.children.length === 0) {
    document.getElementById('tabla-registro-container').style.display = 'none';
  }
}

function guardarTablaABBDD() {
  const rows = document.querySelectorAll('#tbody-registro tr');
  if (rows.length === 0) {
    mostrarNotificacion('La tabla se encuentra vacía.', 'warning');
    return;
  }

  const inicioRaw = document.getElementById('reg-fecha-inicio').value;
  const finRaw = document.getElementById('reg-fecha-fin').value;
  const inicioFormateado = formatearADiaMesAnio(inicioRaw);
  const finFormateado = formatearADiaMesAnio(finRaw);
  const periodo = `${inicioFormateado} a ${finFormateado}`;

  const payload = [];
  let inputsValidos = true;

  rows.forEach(row => {
    const dia = row.querySelector('td[data-label="Día"] strong').textContent;
    const telefonoInput = row.querySelector('.tel-val');
    const ubicacionInput = row.querySelector('.loc-val');
    const costoInput = row.querySelector('.cost-val');

    const telefono = telefonoInput.value.trim();
    const ubicacion = ubicacionInput.value.trim();
    const costo = parseFloat(costoInput.value);

    if (isNaN(costo) || costo < 0) {
      costoInput.classList.add('input-error');
      inputsValidos = false;
    } else {
      costoInput.classList.remove('input-error');
    }

    payload.push({
      dia: dia,
      telefono: telefono,
      ubicacion: ubicacion,
      costo: costo,
      periodo: periodo
    });
  });

  if (!inputsValidos) {
    mostrarNotificacion('Por favor, introduce valores válidos para el Costo de Delivery.', 'error');
    return;
  }

  setLoading(true, 'Almacenando datos en Google Sheets...');
  callBackend("guardarRegistrosDiarios", payload)
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion('Los registros se almacenaron correctamente.', 'success');
        limpiarPantallaRegistro();
        cargarDiasDisponibles();
        cargarSemanasGuardadas();
      } else {
        mostrarNotificacion('Fallo al guardar: ' + (response.error || 'Desconocido'), 'error');
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion('Error al guardar datos: ' + err, 'error');
    });
}

function limpiarPantallaRegistro() {
  document.getElementById('raw-text').value = '';
  document.getElementById('tbody-registro').innerHTML = '';
  document.getElementById('tabla-registro-container').style.display = 'none';
}

/**
     * Consulta los registros del usuario activo para cargarlos en el Editor,
     * enviando el texto del período directamente y manejando errores de forma visual [1]
     */
    function buscarRegistrosHistorial() {
      const selectSemana = document.getElementById('select-semana-editor');
      const periodoSeleccionado = selectSemana.value; // ej: "20-07-2026 a 26-07-2026"

      if (!periodoSeleccionado) {
        mostrarNotificacion('Por favor, selecciona un período semanal registrado.', 'warning');
        return;
      }

      setLoading(true, 'Buscando registros en el rango indicado...');

      callBackend("obtenerRegistrosPorRango", { periodo: periodoSeleccionado })
        .then(response => {
          setLoading(false);
          if (response && response.success) {
            renderTablaHistorial(response.registros || []);
          } else {
            mostrarNotificacion("❌ Error en el servidor: " + (response.error || "Fallo desconocido"), "error");
          }
        })
        .catch(err => {
          setLoading(false);
          mostrarNotificacion('Error de conexión con la API: ' + err, 'error');
        });
    }

function renderTablaHistorial(registros) {
  const tbody = document.getElementById('tbody-editor');
  tbody.innerHTML = '';

  if (!registros || registros.length === 0) {
    document.getElementById('tabla-editor-container').style.display = 'none';
    mostrarNotificacion('No se encontraron registros en el rango de fechas especificado.', 'warning');
    return;
  }

  registros.forEach(item => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', item.id);
    
    tr.innerHTML = `
      <td data-label="Día">
        <select class="input-table hist-dia" style="font-weight: 600;">
          <option value="Lunes" ${item.dia === 'Lunes' ? 'selected' : ''}>Lunes</option>
          <option value="Martes" ${item.dia === 'Martes' ? 'selected' : ''}>Martes</option>
          <option value="Miércoles" ${item.dia === 'Miércoles' ? 'selected' : ''}>Miércoles</option>
          <option value="Jueves" ${item.dia === 'Jueves' ? 'selected' : ''}>Jueves</option>
          <option value="Viernes" ${item.dia === 'Viernes' ? 'selected' : ''}>Viernes</option>
          <option value="Sábado" ${item.dia === 'Sábado' ? 'selected' : ''}>Sábado</option>
          <option value="Domingo" ${item.dia === 'Domingo' ? 'selected' : ''}>Domingo</option>
        </select>
      </td>
      <td data-label="N°">
        <input type="text" class="input-table hist-tel tel-val" value="${item.telefono}" maxLength="3" style="width: 70px; text-align: center;">
      </td>
      <td data-label="Ubicación">
        <textarea class="input-table hist-loc" oninput="ajustarAlturaTextarea(this)">${item.ubicacion}</textarea>
      </td>
      <td data-label="Costo">
        <input type="number" step="0.01" min="0" class="input-table hist-cost" value="${parseFloat(item.costo) || 0}">
      </td>
      <td data-label="Estado" style="font-weight: 600; color: ${item.estado === 'Facturado' ? 'var(--success)' : 'var(--warning)'}">
        ${item.estado}
      </td>
      <td data-label="Acciones">
        <button type="button" class="btn btn-danger" style="padding: 4px 8px; font-size: 0.8rem;" onclick="eliminarRegistroBD('${item.id}')">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('tabla-editor-container').style.display = 'block';
  inicializarAutoAlturaTextareas();
  mostrarNotificacion(`Se cargaron ${registros.length} registros listos para edición.`, 'success');
}

function actualizarCambiosHistorial() {
  const rows = document.querySelectorAll('#tbody-editor tr');
  if (rows.length === 0) return;

  const payload = [];
  let isValido = true;

  rows.forEach(row => {
    const id = row.getAttribute('data-id');
    if (!id) return;

    const diaEl = row.querySelector('.hist-dia');
    const telefonoInput = row.querySelector('.hist-tel') || row.querySelector('.tel-val');
    const ubicacionInput = row.querySelector('.hist-loc');
    const costoInput = row.querySelector('.hist-cost');

    if (!diaEl || !telefonoInput || !ubicacionInput || !costoInput) return;

    const dia = diaEl.value;
    const telefono = telefonoInput.value.trim();
    const ubicacion = ubicacionInput.value.trim();
    const costo = parseFloat(costoInput.value);

    if (isNaN(costo) || costo < 0) {
      costoInput.classList.add('input-error');
      isValido = false;
    } else {
      costoInput.classList.remove('input-error');
    }

    payload.push({
      id: id,
      dia: dia,
      telefono: telefono,
      ubicacion: ubicacion,
      costo: costo
    });
  });

  if (!isValido) {
    mostrarNotificacion('Hay campos con montos de costo inválidos.', 'error');
    return;
  }

  setLoading(true, 'Aplicando modificaciones...');
  callBackend("actualizarRegistrosEditados", payload)
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion('Registros actualizados exitosamente.', 'success');
        buscarRegistrosHistorial();
        cargarDiasDisponibles();
      } else {
        mostrarNotificacion('Fallo al actualizar: ' + (response.error || 'Desconocido'), 'error');
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion('Error de conexión con la API: ' + err, "error");
    });
}

function eliminarRegistroBD(id) {
  const confirmacion = confirm("¿Estás seguro de que deseas eliminar permanentemente este registro?");
  if (!confirmacion) return;

  setLoading(true, "Eliminando registro permanente...");
  callBackend("eliminarRegistro", { id: id })
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion("Registro eliminado correctamente.", "success");
        buscarRegistrosHistorial();
        cargarDiasDisponibles();
        cargarSemanasGuardadas();
      } else {
        mostrarNotificacion("Fallo al eliminar: " + (response.error || "Desconocido"), "error");
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion("Error en la solicitud de eliminación: " + err, "error");
    });
}

/**
     * Recopila los cambios editados desde la tabla del historial y los guarda en el backend.
     * Incluye validadores de seguridad para prevenir fallos por celdas vacías o nulas [1].
     */
    function actualizarCambiosHistorial() {
      const rows = document.querySelectorAll('#tbody-editor tr');
      if (rows.length === 0) return;

      const payload = [];
      let isValido = true;

      rows.forEach(row => {
        const id = row.getAttribute('data-id');
        if (!id) return; // Saltar de forma segura si la fila no tiene ID de registro [1]

        const diaEl = row.querySelector('.hist-dia');
        const telefonoInput = row.querySelector('.hist-tel') || row.querySelector('.tel-val');
        const ubicacionInput = row.querySelector('.hist-loc');
        const costoInput = row.querySelector('.hist-cost');

        // Saltar de forma segura si falta alguna casilla de datos en la tarjeta móvil [1]
        if (!diaEl || !telefonoInput || !ubicacionInput || !costoInput) return;

        const dia = diaEl.value;
        const telefono = telefonoInput.value.trim();
        const ubicacion = ubicacionInput.value.trim();
        const costo = parseFloat(costoInput.value);

        if (isNaN(costo) || costo < 0) {
          costoInput.classList.add('input-error');
          isValido = false;
        } else {
          costoInput.classList.remove('input-error');
        }

        payload.push({
          id: id,
          dia: dia,
          telefono: telefono,
          ubicacion: ubicacion,
          costo: costo
        });
      });

      if (!isValido) {
        mostrarNotificacion('Hay campos con montos de costo inválidos.', 'error');
        return;
      }

      setLoading(true, 'Aplicando modificaciones...');
      callBackend("actualizarRegistrosEditados", payload)
        .then(response => {
          setLoading(false);
          if (response && response.success) {
            mostrarNotificacion('Registros actualizados exitosamente.', 'success');
            buscarRegistrosHistorial();
            cargarDiasDisponibles();
          } else {
            mostrarNotificacion('Fallo al actualizar: ' + (response.error || 'Desconocido'), 'error');
          }
        })
        .catch(err => {
          setLoading(false);
          mostrarNotificacion('Error de conexión con la API: ' + err, "error");
        });
    }

function ocultarTablaHistorial() {
  document.getElementById('tbody-editor').innerHTML = '';
  document.getElementById('tabla-editor-container').style.display = 'none';
}


/* ==========================================
   LÓGICA FACTURACIÓN SEMANAL (ACTUALIZADA)
   ========================================== */

function cargarFacturaSemanal() {
  const selectSemana = document.getElementById('select-semana-factura');
  const periodoSeleccionado = selectSemana.value;

  if (!periodoSeleccionado) {
    mostrarNotificacion('Por favor, selecciona un período semanal registrado.', 'warning');
    return;
  }

  const partes = periodoSeleccionado.split(" a ");
  if (partes.length !== 2) {
    mostrarNotificacion('Formato de período semanal inválido.', 'error');
    return;
  }

  const inicio = formatearAAnioMesDia(partes[0]);
  const fin = formatearAAnioMesDia(partes[1]);

  setLoading(true, 'Consultando registros no facturados de la semana...');
  callBackend("obtenerPendientesEnRango", { inicio: inicio, fin: fin })
    .then(response => {
      setLoading(false);
      pendientesCargados = response.pendientes || [];
      generarTextoFactura();
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion('Error de recuperación de datos: ' + err, 'error');
    });
}

function generarTextoFactura() {
  const outputArea = document.getElementById('invoice-output');
  const btnMarcar = document.getElementById('btn-marcar-facturado');
  const btnCopiar = document.getElementById('btn-copiar');

  if (!pendientesCargados || pendientesCargados.length === 0) {
    outputArea.value = 'No se encontraron registros pendientes de facturación en el período seleccionado.';
    btnMarcar.disabled = true;
    btnCopiar.disabled = true;
    return;
  }

  const diasOrden = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  const agrupado = {};
  diasOrden.forEach(dia => {
    agrupado[dia] = [];
  });

  pendientesCargados.forEach(item => {
    const key = item.dia;
    if (!agrupado[key]) {
      agrupado[key] = [];
    }
    agrupado[key].push(item);
  });

  let textConsolidado = "";
  
  if (usuarioActivo) {
    const nombreMostrar = (nombresActivo || usuarioActivo).toUpperCase();
    textConsolidado += `          *${nombreMostrar}*\n\n`;
  }

  let subtotal = 0;

  // Renderizar listado de entregas
  diasOrden.forEach(dia => {
    const registros = agrupado[dia];
    if (registros && registros.length > 0) {
      textConsolidado += `📅 *${dia.toUpperCase()}*\n`;
      let totalDia = 0;
      
      registros.forEach(item => {
        const costo = parseFloat(item.costo) || 0;
        textConsolidado += `🛵 *${item.telefono}* ${item.ubicacion} *${Math.round(costo)}$*\n`;
        totalDia += costo;
      });
      
      textConsolidado += `*TOTAL:* *$${Math.round(totalDia)}*\n\n`;
      subtotal += totalDia;
    }
  });

  Object.keys(agrupado).forEach(dia => {
    if (!diasOrden.includes(dia) && agrupado[dia].length > 0) {
      textConsolidado += `📅 *${dia.toUpperCase()}*\n`;
      let totalDia = 0;
      agrupado[dia].forEach(item => {
        const costo = parseFloat(item.costo) || 0;
        textConsolidado += `🛵 *${item.telefono}* ${item.ubicacion} *${Math.round(costo)}$*\n`;
        totalDia += costo;
      });
      textConsolidado += `*TOTAL:* *$${Math.round(totalDia)}*\n\n`;
      subtotal += totalDia;
    }
  });

  const facturaActual = parseFloat(document.getElementById('deuda-factura-actual').value) || 0;
  const facturaPasada = parseFloat(document.getElementById('deuda-factura-pasada').value) || 0;
  const prestamos = parseFloat(document.getElementById('deuda-prestamos').value) || 0;
  const prestamosEspeciales = parseFloat(document.getElementById('deuda-prestamos-especiales').value) || 0;
  const abonaHoyInput = document.getElementById('deuda-abona-hoy');
  const abonaHoy = parseFloat(abonaHoyInput.value) || 0;

  const tieneDeudaConfigurada = (facturaActual > 0 || facturaPasada > 0 || prestamos > 0 || prestamosEspeciales > 0);

  if (tieneDeudaConfigurada && (isNaN(abonaHoy) || abonaHoyInput.value.trim() === "" || abonaHoy < 0)) {
    abonaHoyInput.classList.add('input-error');
    mostrarNotificacion("⚠️ El campo 'Abona Hoy' es obligatorio cuando existen deudas cargadas.", "error");
    outputArea.value = 'Por favor, ingresa el monto de "Abona Hoy" para generar el texto de la factura.';
    btnMarcar.disabled = true;
    btnCopiar.disabled = true;
    return;
  } else {
    abonaHoyInput.classList.remove('input-error');
  }

  const deudaTotal = facturaActual + facturaPasada + prestamos + prestamosEspeciales;
  const deudaRestante = deudaTotal - abonaHoy;
  const totalFinal = subtotal - abonaHoy;
  const imprimirBloqueDeuda = (tieneDeudaConfigurada || abonaHoy > 0);

  textConsolidado += `📊 *SUBTOTAL:* *$${Math.round(subtotal)}*\n`;

  if (imprimirBloqueDeuda) {
    textConsolidado += `\n⚠️ *DETALLE DE DEUDA:*\n`;
    if (facturaActual > 0) textConsolidado += `- FACTURA ACTUAL: $${Math.round(facturaActual)}\n`;
    if (facturaPasada > 0) textConsolidado += `- FACTURA PASADA: $${Math.round(facturaPasada)}\n`;
    if (prestamos > 0) textConsolidado += `- PRÉSTAMOS: $${Math.round(prestamos)}\n`;
    if (prestamosEspeciales > 0) textConsolidado += `- PRÉSTAMO ESPECIAL: $${Math.round(prestamosEspeciales)}\n`;
    textConsolidado += `*DEUDA TOTAL:* $${Math.round(deudaTotal)}\n`;
    textConsolidado += `*ABONA HOY:* $${Math.round(abonaHoy)}\n`;
    textConsolidado += `*DEUDA RESTANTE:* $${Math.round(deudaTotal)} - $${Math.round(abonaHoy)} = $${Math.round(deudaRestante)}\n\n`;
    textConsolidado += `💰 *TOTAL FINAL:* *$${Math.round(subtotal)}* - *$${Math.round(abonaHoy)}* = *$${Math.round(totalFinal)}*`;
  } else {
    textConsolidado += `💰 *TOTAL FINAL:* *$${Math.round(subtotal)}*`;
  }

  outputArea.value = textConsolidado;
  btnMarcar.disabled = false;
  btnCopiar.disabled = false;
}

function actualizarMathFactura() {
  if (pendientesCargados && pendientesCargados.length > 0) generarTextoFactura();
}

function copiarFacturaAlPortapapeles() {
  const outputArea = document.getElementById('invoice-output');
  outputArea.select();
  outputArea.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(outputArea.value)
    .then(() => { mostrarNotificacion('Factura copiada al portapapeles.', 'success'); })
    .catch(() => { mostrarNotificacion('No se pudo copiar automáticamente.', 'warning'); });
}

function marcarRegistrosComoFacturados() {
  if (pendientesCargados.length === 0) return;
  
  const facturaActual = parseFloat(document.getElementById('deuda-factura-actual').value) || 0;
  const facturaPasada = parseFloat(document.getElementById('deuda-factura-pasada').value) || 0;
  const prestamos = parseFloat(document.getElementById('deuda-prestamos').value) || 0;
  const prestamosEspeciales = parseFloat(document.getElementById('deuda-prestamos-especiales').value) || 0;
  const abonaHoy = parseFloat(document.getElementById('deuda-abona-hoy').value) || 0;

  const confirmacion = confirm(`¿Estás seguro de marcar estos ${pendientesCargados.length} registros como facturados?`);
  if (!confirmacion) return;

  const datosDeuda = {
    facturaActual: facturaActual,
    facturaPasada: facturaPasada,
    prestamos: prestamos,
    prestamosEspeciales: prestamosEspeciales,
    abonaHoy: abonaHoy
  };

  const idsAActualizar = pendientesCargados.map(item => item.id);
  setLoading(true, 'Actualizando registros...');
  callBackend("marcarComoFacturados", { ids: idsAActualizar, datosDeuda: datosDeuda })
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion('Se actualizaron todos los registros como "Facturado".', 'success');
        pendientesCargados = [];
        document.getElementById('invoice-output').value = '';
        document.getElementById('deuda-factura-actual').value = "0.00";
        document.getElementById('deuda-factura-pasada').value = "0.00";
        document.getElementById('deuda-prestamos').value = "0.00";
        document.getElementById('deuda-prestamos-especiales').value = "0.00";
        document.getElementById('deuda-abona-hoy').value = "0.00";
        document.getElementById('btn-marcar-facturado').disabled = true;
        document.getElementById('btn-copiar').disabled = true;
        cargarDiasDisponibles();
        cargarSemanasFacturadas(); // Actualizar las semanas disponibles para reportes cerrados
      } else {
        mostrarNotificacion('Fallo al actualizar: ' + (response.error || 'Desconocido'), 'error');
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion('Error de conexión en la API: ' + err, 'error');
    });
}

/* ==========================================================
   LÓGICA DE REPORTES PDF DE FACTURAS CERRADAS (NUEVO)
   ========================================================== */
/**
 * Carga los períodos ya marcados como "Facturado" para el selector
 */
function cargarSemanasFacturadas() {
  if (!usuarioActivo) return;
  callBackend("obtenerPeriodosFacturados")
    .then(response => {
      const select = document.getElementById('select-semana-reporte');
      select.innerHTML = '';
      
      const periodos = response.periodos || [];
      
      if (periodos.length === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No hay facturas cerradas";
        select.appendChild(option);
        select.disabled = true;
        document.getElementById('btn-descargar-pdf').disabled = true;
      } else {
        periodos.forEach(p => {
          const option = document.createElement('option');
          option.value = p;
          option.textContent = p;
          select.appendChild(option);
        });
        select.disabled = false;
      }
    })
    .catch(err => {
      mostrarNotificacion("Error al cargar períodos facturados: " + err, "error");
    });
}

/**
 * Consulta los registros históricos que ya están en estado "Facturado" de la semana seleccionada
 * notificando al usuario en pantalla de manera descriptiva si el servidor tiene un error [1]
 */
function cargarReporteSemanal() {
  const selectSemana = document.getElementById('select-semana-reporte');
  const periodoSeleccionado = selectSemana.value; // ej: "13-07-2026 a 19-07-2026"

  if (!periodoSeleccionado) {
    mostrarNotificacion('Por favor, selecciona un período semanal registrado.', 'warning');
    return;
  }

  setLoading(true, 'Consultando registros históricos...');
  
  callBackend("obtenerFacturadosEnRango", { periodo: periodoSeleccionado })
    .then(response => {
      setLoading(false);
      // Validar si el backend de Google retornó un estatus exitoso
      if (response && response.success) {
        reportesCargados = response.registros || [];
        deudasReporte = response.deudas; // Guardamos las deudas leídas de la hoja
        generarTextoReporte();
      } else {
        // Reporta visualmente en la pantalla si falta alguna función en Code.gs [1]
        mostrarNotificacion("❌ Error en el servidor: " + (response.error || "Fallo desconocido"), "error");
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion('Error de recuperación de datos: ' + err, 'error');
    });
}

function generarTextoReporte() {
  const outputArea = document.getElementById('reporte-output');
  const btnDescargar = document.getElementById('btn-descargar-pdf');

  if (!reportesCargados || reportesCargados.length === 0) {
    outputArea.value = 'No se encontraron registros facturados en el período seleccionado.';
    btnDescargar.disabled = true;
    return;
  }

  const diasOrden = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const agrupado = {};
  diasOrden.forEach(dia => agrupado[dia] = []);
  reportesCargados.forEach(item => {
    const key = item.dia;
    if (!agrupado[key]) agrupado[key] = [];
    agrupado[key].push(item);
  });

  let textConsolidado = "";
  
  // Agregar cabecera centrada
  if (usuarioActivo) {
    const nombreMostrar = (nombresActivo || usuarioActivo).toUpperCase();
    textConsolidado += `          *${nombreMostrar}*\n\n`;
  }

  let subtotal = 0;

  diasOrden.forEach(dia => {
    const registros = agrupado[dia];
    if (registros && registros.length > 0) {
      textConsolidado += `📅 *${dia.toUpperCase()}*\n`;
      let totalDia = 0;
      registros.forEach(item => {
        const costo = parseFloat(item.costo) || 0;
        textConsolidado += `🛵 *${item.telefono}* ${item.ubicacion} *${Math.round(costo)}$*\n`;
        totalDia += costo;
      });
      textConsolidado += `*TOTAL:* *$${Math.round(totalDia)}*\n\n`;
      subtotal += totalDia;
    }
  });

  // Leer variables de deudas del objeto de deudas cargado
  const facturaActual = deudasReporte ? deudasReporte.facturaActual : 0;
  const facturaPasada = deudasReporte ? deudasReporte.facturaPasada : 0;
  const prestamos = deudasReporte ? deudasReporte.prestamos : 0;
  const prestamosEspeciales = deudasReporte ? deudasReporte.prestamosEspeciales : 0;
  const abonaHoy = deudasReporte ? deudasReporte.abonaHoy : 0;

  const deudaTotal = facturaActual + facturaPasada + prestamos + prestamosEspeciales;
  const deudaRestante = deudaTotal - abonaHoy;
  const totalFinal = subtotal - abonaHoy;
  const imprimirBloqueDeuda = (deudaTotal > 0 || abonaHoy > 0);

  textConsolidado += `📊 *SUBTOTAL:* *$${Math.round(subtotal)}*\n`;

  if (imprimirBloqueDeuda) {
    textConsolidado += `\n⚠️ *DETALLE DE DEUDA:*\n`;
    if (facturaActual > 0) textConsolidado += `- FACTURA ACTUAL: $${Math.round(facturaActual)}\n`;
    if (facturaPasada > 0) textConsolidado += `- FACTURA PASADA: $${Math.round(facturaPasada)}\n`;
    if (prestamos > 0) textConsolidado += `- PRÉSTAMOS: $${Math.round(prestamos)}\n`;
    if (prestamosEspeciales > 0) textConsolidado += `- PRÉSTAMO ESPECIAL: $${Math.round(prestamosEspeciales)}\n`;
    textConsolidado += `*DEUDA TOTAL:* $${Math.round(deudaTotal)}\n`;
    textConsolidado += `*ABONA HOY:* $${Math.round(abonaHoy)}\n`;
    textConsolidado += `*DEUDA RESTANTE:* $${Math.round(deudaTotal)} - $${Math.round(abonaHoy)} = $${Math.round(deudaRestante)}\n\n`;
    textConsolidado += `💰 *TOTAL FINAL:* *$${Math.round(subtotal)}* - *$${Math.round(abonaHoy)}* = *$${Math.round(totalFinal)}*`;
  } else {
    textConsolidado += `💰 *TOTAL FINAL:* *$${Math.round(subtotal)}*`;
  }

  outputArea.value = textConsolidado;
  btnDescargar.disabled = false;
}

function descargarReportePDF() {
  const rawText = document.getElementById('reporte-output').value;
  const selectSemana = document.getElementById('select-semana-reporte');
  const periodoSeleccionado = selectSemana.value;

  if (!rawText || !periodoSeleccionado) return;

  setLoading(true, "Generando archivo PDF...");

  // Limpiar asteriscos y emojis específicos para un formato de factura impresa óptimo
  let cleanText = rawText.replace(/\*/g, ""); 
  cleanText = cleanText.replace(/📅/g, "").replace(/🛵/g, "").replace(/📊/g, "").replace(/⚠️/g, "").replace(/💰/g, "");

  const nombrePdf = `Factura_Semana_${periodoSeleccionado.replace(/\s+/g, "_")}.pdf`;

  callBackend("generarPdfFactura", { texto: cleanText, nombreArchivo: nombrePdf })
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion("¡PDF Generado con éxito! Iniciando descarga.", "success");
        
        // Disparador de descarga asíncrona compatible con navegadores móviles
        const linkSource = `data:application/pdf;base64,${response.base64}`;
        const downloadLink = document.createElement("a");
        downloadLink.href = linkSource;
        downloadLink.download = response.filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      } else {
        mostrarNotificacion("Fallo al compilar PDF: " + response.error, "error");
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion("Error al procesar el PDF en los servidores: " + err, "error");
    });
}

/* ==========================================
   LÓGICA DE CONTROL DE SESIÓN Y VISTAS
   ========================================== */

function mostrarVistaRegistro() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('register-view').style.display = 'block';
}

function mostrarVistaLogin() {
  document.getElementById('register-view').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
}

function ejecutarLogin() {
  const usuario = document.getElementById('login-usuario').value.trim();
  const clave = document.getElementById('login-clave').value;

  if (!usuario || !clave) {
    mostrarNotificacion("⚠️ Por favor, ingresa tu usuario y clave.", "warning");
    return;
  }

  setLoading(true, "Iniciando sesión...");

  callBackend("validarLogin", { usuario: usuario, clave: clave })
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion("¡Bienvenido, " + response.user.nombres + "!", "success");
        
        // Guardar usuario activo globalmente
        usuarioActivo = response.user.usuario;
        nombresActivo = response.user.nombres; // Guardar nombres de forma activa

        // Ocultar login y mostrar aplicación principal
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('main-app-container').style.display = 'block';
        
        // Inicializar la aplicación logística
        inicializarAplicacion();
      } else {
        mostrarNotificacion("❌ " + (response.error || "Error de inicio de sesión"), "error");
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion("Error del servidor: " + err, "error");
    });
}

function ejecutarRegistro() {
  const nombres = document.getElementById('reg-nombres').value.trim();
  const apellidos = document.getElementById('reg-apellidos').value.trim();
  const cedula = document.getElementById('reg-cedula').value.trim();
  const correo = document.getElementById('reg-correo').value.trim();
  const usuario = document.getElementById('reg-usuario').value.trim();
  const clave = document.getElementById('reg-clave').value;
  const confirmar = document.getElementById('reg-confirmar-clave').value;

  if (!nombres || !apellidos || !cedula || !correo || !usuario || !clave) {
    mostrarNotificacion("⚠️ Todos los campos de registro son obligatorios.", "warning");
    return;
  }

  if (clave !== confirmar) {
    mostrarNotificacion("⚠️ Las contraseñas ingresadas no coinciden.", "warning");
    return;
  }

  const datosUsuario = {
    nombres: nombres,
    apellidos: apellidos,
    cedula: cedula,
    correo: correo,
    usuario: usuario,
    clave: clave
  };

  setLoading(true, "Registrando nuevo usuario...");

  callBackend("registrarNuevoUsuario", datosUsuario)
    .then(response => {
      setLoading(false);
      if (response && response.success) {
        mostrarNotificacion("✅ Registro completado con éxito. Ahora puedes iniciar sesión.", "success");
        
        // Limpiar campos de registro
        document.getElementById('reg-nombres').value = "";
        document.getElementById('reg-apellidos').value = "";
        document.getElementById('reg-cedula').value = "";
        document.getElementById('reg-correo').value = "";
        document.getElementById('reg-usuario').value = "";
        document.getElementById('reg-clave').value = "";
        document.getElementById('reg-confirmar-clave').value = "";
        
        mostrarVistaLogin();
      } else {
        mostrarNotificacion("❌ Fallo al registrar: " + (response.error || "Desconocido"), "error");
      }
    })
    .catch(err => {
      setLoading(false);
      mostrarNotificacion("Error del servidor: " + err, "error");
    });
}
