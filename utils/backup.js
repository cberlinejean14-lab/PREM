const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

function iniciarSistemaBackups() {
    // Programa una tarea automática todos los días a las 3:00 AM
    // Formato cron: '0 3 * * *' (Minuto Hora Día Mes DíaDeLaSemana)
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log('🔄 [BACKUP] Iniciando respaldo automático de la base de datos...');

            // QuickDB por defecto suele guardar sus datos en un archivo JSON (como 'json.sqlite' o similar dependiendo de la versión)
            // Buscamos el archivo de base de datos local común de QuickDB
            const dbPath = path.join(__dirname, '../json.sqlite'); // O ajusta el nombre si tu archivo de base de datos es distinto
            const backupDir = path.join(__dirname, '../backups');

            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            if (fs.existsSync(dbPath)) {
                const fecha = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = path.join(backupDir, `backup-${fecha}.sqlite`);

                fs.copyFileSync(dbPath, backupFile);
                console.log(`✅ [BACKUP] Respaldo creado exitosamente en: ${backupFile}`);
            } else {
                console.log('⚠️ [BACKUP] No se encontró el archivo de base de datos en la ruta predeterminada para respaldar.');
            }
        } catch (error) {
            console.error('❌ [BACKUP] Error al generar el respaldo automático:', error);
        }
    });

    console.log('🛡️ [SISTEMA] Módulo de respaldos automáticos programado correctamente.');
}

module.exports = { iniciarSistemaBackups };