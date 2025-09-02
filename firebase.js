document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURACIÓN DE FIREBASE ---
    const firebaseConfig = {
      apiKey: "AIzaSyAzyTU0ctWWPpKT2BdV908cpvnBD6L6KX0",
      authDomain: "horario-635ba.firebaseapp.com",
  databaseURL: "https://horario-635ba-default-rtdb.europe-west1.firebasedatabase.app",
   // ✅ CORRECTA
  projectId: "horario-635ba",
  storageBucket: "horario-635ba.appspot.com",
  messagingSenderId: "681160039040",
  appId: "1:681160039040:web:c13dbb9c11281d32d56465"
};

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const scheduleRef = database.ref('scheduleApp');

    // --- ESTADO DE LA APLICACIÓN ---
    const state = {
        modalSignaturePad: null,
        currentWorker: null,
        currentDate: null,
        workers: [],
        scheduleData: {},
    };

    // --- INICIALIZACIÓN ---
    init();

    function init() {
        initSignaturePads();
        setupEventListeners();
        setupThemeToggle();
        setupFirebaseListener(); // Conecta y escucha a Firebase.
        const now = new Date();
        document.getElementById('month-select').value = now.getMonth();
        document.getElementById('year-select').value = now.getFullYear();
    }

    function initSignaturePads() {
        const modalCanvas = document.getElementById('modal-signature-pad');
        state.modalSignaturePad = new SignaturePad(modalCanvas, {
            backgroundColor: 'rgb(255, 255, 255)'
        });
    }

    function setupEventListeners() {
        document.getElementById('connect-btn').addEventListener('click', handleConnection);
        document.getElementById('add-worker-btn').addEventListener('click', addWorker);
        document.getElementById('save-data-btn').addEventListener('click', saveData);
        document.getElementById('export-txt-btn').addEventListener('click', exportDataAsTxt);
        document.getElementById('export-json-btn').addEventListener('click', exportDataAsJson);
        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', importData);
        document.getElementById('reset-data-btn').addEventListener('click', resetAllData);
        document.getElementById('generate-btn').addEventListener('click', generateSchedule);
        document.getElementById('generate-report-btn').addEventListener('click', generateMonthlyReport);
        document.querySelectorAll('.close').forEach(btn => btn.addEventListener('click', closeModal));
        document.getElementById('modal-clear-signature').addEventListener('click', () => state.modalSignaturePad.clear());
        document.getElementById('set-entry-now').addEventListener('click', () => setCurrentTime('entry'));
        document.getElementById('set-exit-now').addEventListener('click', () => setCurrentTime('exit'));
        document.getElementById('save-time-btn').addEventListener('click', saveTime);
        document.getElementById('mark-day-off-btn').addEventListener('click', markDayAsOff);
        document.getElementById('unmark-day-off-btn').addEventListener('click', unmarkDayAsOff);
    }

    function setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;
        const icon = themeToggle.querySelector('i');

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                body.classList.add('dark-mode');
                icon.classList.replace('fa-moon', 'fa-sun');
            } else {
                body.classList.remove('dark-mode');
                icon.classList.replace('fa-sun', 'fa-moon');
            }
        };

        themeToggle.addEventListener('click', () => {
            const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });

        applyTheme(localStorage.getItem('theme') || 'light');
    }

    function handleConnection() {
        showNotification('Esta versión está conectada a la nube de Firebase.', 'info');
    }

    /**
     * Se activa al principio y cada vez que hay un cambio en la nube.
     * Es la ÚNICA función que modifica el estado local (state) y redibuja la pantalla.
     */
    function setupFirebaseListener() {
        const statusElement = document.getElementById('connection-status');
        
        // Listener para el estado de la conexión
        database.ref(".info/connected").on("value", (snap) => {
          if (snap.val() === true) {
            statusElement.innerHTML = `<i class="fas fa-check-circle"></i> Conectado a Firebase`;
            statusElement.className = `status-indicator status-online`;
          } else {
            statusElement.innerHTML = `<i class="fas fa-times-circle"></i> Desconectado`;
            statusElement.className = `status-indicator status-offline`;
          }
        });

        // Listener para los datos
        scheduleRef.on('value', (snapshot) => {
            const data = snapshot.val();
            console.log("Datos cargados desde Firebase:", data);
            if (data) {
                state.workers = data.workers || [];
                state.scheduleData = data.schedule || {};
            } else {
                state.workers = [];
                state.scheduleData = {};
            }
            generateSchedule(); // Redibuja la tabla con los datos frescos
        }, (error) => {
            console.error("Error de lectura de Firebase:", error);
            showNotification("Error al leer datos de la nube.", "error");
        });
    }

    /**
     * Función central para guardar el estado completo en Firebase.
     * Todas las demás funciones de escritura deben llamar a esta.
     */
    function saveData() {
        const dataToSave = { workers: state.workers, schedule: state.scheduleData || {} };
        scheduleRef.set(dataToSave)
            .then(() => {
                showNotification('Datos guardados en la nube.', 'success');
            })
            .catch((error) => {
                console.error("Error al guardar datos:", error);
                showNotification(`Error al guardar: ${error.message}`, 'error');
            });
    }

    // --- GESTIÓN DE DATOS (CRUD) ---
    function addWorker() {
        const workerNameInput = document.getElementById('worker-name');
        const workerName = workerNameInput.value.trim();
        if (!workerName) return showNotification('Ingresa un nombre de trabajador', 'error');
        if (state.workers.includes(workerName)) return showNotification('El trabajador ya existe', 'error');
        
        // 1. Modificar estado local
        state.workers.push(workerName);
        
        // 2. Actualizar UI local para respuesta instantánea
        generateSchedule();
        workerNameInput.value = '';

        // 3. Sincronizar el nuevo estado completo con la nube
        saveData();
    }

    function deleteWorker(workerToDelete) {
        if (confirm(`¿Estás seguro de que quieres eliminar a ${workerToDelete}? Se borrarán todos sus registros.`)) {
            // 1. Modificar estado local
            state.workers = state.workers.filter(w => w !== workerToDelete);
            delete state.scheduleData[workerToDelete];
            
            // 2. Actualizar UI local
            generateSchedule();

            // 3. Sincronizar con la nube
            saveData();
        }
    }

    function resetAllData() {
        if (confirm('¿Estás seguro que deseas borrar TODOS los datos de la nube? Esta acción no se puede deshacer.')) {
            // Borra los datos en Firebase. El listener se encargará de actualizar el estado y la UI.
            scheduleRef.remove()
                .then(() => {
                    showNotification('Todos los datos han sido borrados de la nube.', 'success');
                })
                .catch((error) => {
                    showNotification(`Error al borrar: ${error.message}`, 'error');
                });
        }
    }

    function importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                if (!file.name.endsWith('.json')) throw new Error('Formato de archivo no soportado');
                const data = JSON.parse(e.target.result);
                if (data.workers === undefined || data.schedule === undefined) throw new Error('El archivo JSON no tiene el formato correcto.');
                
                // Al importar, sobreescribimos los datos en Firebase. El listener actualizará la UI.
                scheduleRef.set(data)
                    .then(() => {
                        showNotification('Datos importados y subidos a la nube correctamente', 'success');
                    })
                    .catch((error) => {
                        showNotification(`Error al importar: ${error.message}`, 'error');
                    });
            } catch (error) {
                showNotification(`Error al leer el archivo: ${error.message}`, 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    // --- RENDERIZADO DEL HORARIO ---
    function generateSchedule() {
        const month = parseInt(document.getElementById('month-select').value);
        const year = parseInt(document.getElementById('year-select').value);
        renderScheduleHeader(month, year);
        renderScheduleBody(month, year);
    }

    function renderScheduleHeader(month, year) {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const tableHead = document.querySelector('#schedule-table thead tr');
        while (tableHead.children.length > 1) tableHead.removeChild(tableHead.lastChild);

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][date.getDay()];
            const th = document.createElement('th');
            th.className = 'day-header';
            th.textContent = `${dayName} ${day}`;
            tableHead.appendChild(th);
        }
    }

    function renderScheduleBody(month, year) {
        const tableBody = document.querySelector('#schedule-table tbody');
        tableBody.innerHTML = '';
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        state.workers.forEach(worker => {
            const row = document.createElement('tr');
            row.className = 'worker-row';
            row.dataset.workerName = worker;

            const workerCell = document.createElement('td');
            const contentDiv = document.createElement('div');
            contentDiv.className = 'worker-cell-content';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = worker;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-worker-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
            deleteBtn.title = `Eliminar a ${worker}`;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteWorker(worker);
            });

            contentDiv.appendChild(nameSpan);
            contentDiv.appendChild(deleteBtn);
            workerCell.appendChild(contentDiv);
            row.appendChild(workerCell);

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${day}/${month + 1}/${year}`;
                const cell = document.createElement('td');
                cell.className = 'time-cell';
                updateScheduleCellContent(cell, worker, dateStr);
                cell.addEventListener('click', () => openTimeModal(worker, dateStr));
                row.appendChild(cell);
            }
            tableBody.appendChild(row);
        });
    }

    function updateScheduleCell(worker, dateStr) {
        const dayIndex = parseInt(dateStr.split('/')[0]);
        const row = document.querySelector(`.worker-row[data-worker-name="${worker}"]`);
        if (!row) return;
        const cell = row.cells[dayIndex];
        if (!cell) return;
        updateScheduleCellContent(cell, worker, dateStr);
    }

    function updateScheduleCellContent(cell, worker, dateStr) {
        const safeDateStr = dateStr.replace(/\//g, '-');
        const entry = state.scheduleData[worker]?.[safeDateStr] || {};
        
        if (entry.isDayOff) {
            cell.innerHTML = `<div style="color: var(--info); font-weight: bold;">Descanso</div>`;
            cell.style.backgroundColor = '#e1f5fe';
            return;
        }

        let cellContent = entry.entryTime || entry.exitTime ? `<div>${entry.entryTime || '--:--'} - ${entry.exitTime || '--:--'}</div>` : '<div class="highlight">Editar</div>';
        
        if (entry.incidents) {
            cellContent += `<i class="fas fa-exclamation-circle" style="color: var(--danger); font-size: 0.8rem; margin-left: 5px;" title="Incidencia: ${entry.incidents}"></i>`;
        }

        cell.innerHTML = cellContent;
        cell.style.backgroundColor = entry.signature ? 'var(--light)' : '';
    }

    // --- MODAL DE REGISTRO DE TIEMPO ---
    function openTimeModal(worker, dateStr) {
        state.currentWorker = worker;
        state.currentDate = dateStr;
        
        const safeDateStr = dateStr.replace(/\//g, '-');
        const entry = state.scheduleData[worker]?.[safeDateStr] || {};

        if (entry.isDayOff) {
            document.getElementById('day-off-view').style.display = 'block';
            document.getElementById('edit-view').style.display = 'none';
        } else {
            document.getElementById('day-off-view').style.display = 'none';
            document.getElementById('edit-view').style.display = 'block';
            document.getElementById('entry-time').value = entry.entryTime || '';
            document.getElementById('exit-time').value = entry.exitTime || '';
            document.getElementById('modal-incidents').value = entry.incidents || '';
            state.modalSignaturePad.clear();
            if (entry.signature) {
                state.modalSignaturePad.fromDataURL(entry.signature);
            }
        }
        document.getElementById('time-modal').style.display = 'flex';
    }

    function saveTime() {
        const entryTime = document.getElementById('entry-time').value;
        const exitTime = document.getElementById('exit-time').value;
        if (!entryTime || !exitTime) return showNotification('Debe especificar hora de entrada y salida.', 'error');

        const incidents = document.getElementById('modal-incidents').value.trim();
        const signatureData = state.modalSignaturePad.isEmpty() ? null : state.modalSignaturePad.toDataURL();
        
        const record = { entryTime, exitTime, signature: signatureData, incidents, isDayOff: false };
        const safeDateStr = state.currentDate.replace(/\//g, '-');

        // 1. Modificar estado local
        if (!state.scheduleData[state.currentWorker]) {
            state.scheduleData[state.currentWorker] = {};
        }
        state.scheduleData[state.currentWorker][safeDateStr] = record;

        // 2. Actualizar UI local
        updateScheduleCell(state.currentWorker, state.currentDate);
        closeModal();

        // 3. Sincronizar con la nube
        saveData();
    }

    function markDayAsOff() {
        const safeDateStr = state.currentDate.replace(/\//g, '-');
        const record = { isDayOff: true };

        // 1. Modificar estado local
        if (!state.scheduleData[state.currentWorker]) {
            state.scheduleData[state.currentWorker] = {};
        }
        state.scheduleData[state.currentWorker][safeDateStr] = record;

        // 2. Actualizar UI local
        updateScheduleCell(state.currentWorker, state.currentDate);
        closeModal();

        // 3. Sincronizar con la nube
        saveData();
    }

    function unmarkDayAsOff() {
        const safeDateStr = state.currentDate.replace(/\//g, '-');

        // 1. Modificar estado local
        if (state.scheduleData[state.currentWorker]) {
            delete state.scheduleData[state.currentWorker][safeDateStr];
        }

        // 2. Actualizar UI local
        updateScheduleCell(state.currentWorker, state.currentDate);
        closeModal();

        // 3. Sincronizar con la nube
        saveData();
    }

    // --- INFORMES Y UTILIDADES ---
    function generateMonthlyReport() {
        const month = parseInt(document.getElementById('month-select').value);
        const year = parseInt(document.getElementById('year-select').value);
        const reportBody = document.getElementById('report-table-body');
        reportBody.innerHTML = '';

        state.workers.forEach(worker => {
            let totalMinutes = 0;
            const workerSchedule = state.scheduleData[worker] || {};
            
            for (const safeDateStr in workerSchedule) {
                const dateParts = safeDateStr.split('-');
                const entryMonth = parseInt(dateParts[1]) - 1;
                const entryYear = parseInt(dateParts[2]);

                if (entryMonth === month && entryYear === year) {
                    const entry = workerSchedule[safeDateStr];
                    if (entry.entryTime && entry.exitTime) {
                        const entryDate = new Date(`1970-01-01T${entry.entryTime}`);
                        let exitDate = new Date(`1970-01-01T${entry.exitTime}`);
                        
                        if (exitDate < entryDate) {
                            exitDate.setDate(exitDate.getDate() + 1);
                        }
                        totalMinutes += (exitDate - entryDate) / 60000;
                    }
                }
            }

            const hours = Math.floor(totalMinutes / 60);
            const minutes = Math.round(totalMinutes % 60);
            const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            const row = document.createElement('tr');
            row.innerHTML = `<td>${worker}</td><td>${hours}</td><td>${Math.round(totalMinutes)}</td><td>${formattedTime}</td>`;
            reportBody.appendChild(row);
        });

        document.getElementById('report-results').style.display = 'block';
        showNotification('Informe generado correctamente', 'success');
    }

    function exportDataAsTxt() {
        const month = parseInt(document.getElementById('month-select').value);
        const year = parseInt(document.getElementById('year-select').value);
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        let txtContent = `INFORME DE HORARIOS - ${monthNames[month]} ${year}\n\n`;

        state.workers.forEach(worker => {
            txtContent += `============================================\n`;
            txtContent += `TRABAJADOR: ${worker}\n`;
            txtContent += `============================================\n`;
            let hasDataForMonth = false;

            const workerSchedule = state.scheduleData[worker] || {};
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const safeDateStr = `${day}-${month + 1}-${year}`;
                const entry = workerSchedule[safeDateStr];
                if (entry) {
                    hasDataForMonth = true;
                    const displayDate = safeDateStr.replace(/-/g, '/');
                    txtContent += `Fecha: ${displayDate}\n`;
                    if (entry.isDayOff) {
                        txtContent += `  Estado: Día de Descanso\n`;
                    } else {
                        txtContent += `  Entrada: ${entry.entryTime || 'N/A'}\n  Salida:  ${entry.exitTime || 'N/A'}\n`;
                        if (entry.signature) txtContent += `  (Firmado)\n`;
                        if (entry.incidents) txtContent += `  Incidencia: ${entry.incidents}\n`;
                    }
                    txtContent += `\n`;
                }
            }

            if (!hasDataForMonth) {
                txtContent += "No hay datos registrados para este trabajador en este mes.\n\n";
            }
        });
        
        const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
        saveAs(blob, `informe_horario_${year}_${monthNames[month]}.txt`);
        showNotification('Informe TXT exportado', 'success');
    }

    function exportDataAsJson() {
        const dataToSave = { workers: state.workers, schedule: state.scheduleData };
        const dataStr = JSON.stringify(dataToSave, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
        saveAs(blob, `datos_horario_firebase.json`);
        showNotification('Datos exportados en formato JSON', 'success');
    }

    function closeModal() {
        document.getElementById('time-modal').style.display = 'none';
    }

    function setCurrentTime(field) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        document.getElementById(`${field}-time`).value = `${hours}:${minutes}`;
    }

    function showNotification(message, type = 'success') {
        const el = document.getElementById('notification');
        el.textContent = message;
        el.className = `notification ${type} show`;
        setTimeout(() => el.classList.remove('show'), 3000);
    }
});
