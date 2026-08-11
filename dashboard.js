require('dotenv').config();
const express = require('express');
const helmet = require('helmet'); // 🛡️ 1. Importamos Helmet
const http = require('http'); // NECESARIO para Socket.io
const { Server } = require('socket.io'); // Importar Socket.io
const { QuickDB } = require('quick.db');
const rateLimit = require('express-rate-limit'); // 🛡️ Importamos el limitador de peticiones
const { checkAuth, checkAdmin } = require('./auth'); // Importamos los middlewares de seguridad
const db = new QuickDB();

const app = express();
const PORT = 3000;

// 🛡️ 2. Activamos Helmet para proteger los encabezados HTTP y ocultar tecnologías del servidor
app.use(helmet());

// Configuración del servidor HTTP y Socket.io
const server = http.createServer(app);
const io = new Server(server);

// Guardar io globalmente para usarlo en las rutas
app.set('io', io);

io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado al panel en tiempo real.');
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // NECESARIO para que Express pueda leer los datos en formato JSON enviados desde el botón de la web

// 🛡️ 3. Configuración del Rate Limiter (Protección contra fuerza bruta en acciones de admin)
const adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // Ventana de 15 minutos
    max: 15, // Máximo 15 peticiones permitidas por IP en esos 15 minutos para rutas críticas
    message: { success: false, message: "Demasiadas peticiones desde esta IP. Inténtelo más tarde." },
    standardHeaders: true,
    legacyHeaders: false,
});

const traducciones = {
    es: {
        home: "Hogar",
        settings: "Ajustes",
        customizer: "Personalización",
        welcome: "Canal de Bienvenida",
        levels: "Niveles y XP",
        searchPlaceholder: "Módulos de búsqueda...",
        saveChanges: "Guardar cambios"
    },
    en: {
        home: "Home",
        settings: "Settings",
        customizer: "Customization",
        welcome: "Welcome Channel",
        levels: "Levels & XP",
        searchPlaceholder: "Search modules...",
        saveChanges: "Save changes"
    },
    pt: {
        home: "Início",
        settings: "Configurações",
        customizer: "Personalização",
        welcome: "Canal de Boas-vindas",
        levels: "Níveis e XP",
        searchPlaceholder: "Pesquisar módulos...",
        saveChanges: "Salvar alterações"
    },
    fr: {
        home: "Accueil",
        settings: "Paramètres",
        customizer: "Personnalisation",
        welcome: "Canal de Bienvenue",
        levels: "Niveaux & XP",
        searchPlaceholder: "Rechercher des modules...",
        saveChanges: "Enregistrer"
    },
    hi: {
        home: "होम",
        settings: "सेटिंग्स",
        customizer: "कस्टमाइज़र",
        welcome: "स्वागत चैनल",
        levels: "स्तर और XP",
        searchPlaceholder: "मॉड्यूल खोजें...",
        saveChanges: "परिवर्तन सहेजें"
    },
    ar: {
        home: "الرئيسية",
        settings: "الإعدادات",
        customizer: "التخصيص",
        welcome: "قناة الترحيب",
        levels: "المستويات و XP",
        searchPlaceholder: "بحث عن الوحدات...",
        saveChanges: "حفظ التغييرات"
    },
    zh: {
        home: "首页",
        settings: "设置",
        customizer: "自定义",
        welcome: "欢迎频道",
        levels: "等级与经验",
        searchPlaceholder: "搜索模块...",
        saveChanges: "保存更改"
    }
};

function iniciarDashboard(client) {
    // Middleware global para inyectar variables de idioma y usuario en todas las vistas de forma automática
    app.use((req, res, next) => {
        if (req.query.lang) {
            req.session.lang = req.query.lang;
        }
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        res.locals.t = traducciones[lang] || traducciones.es;
        res.locals.currentLang = lang;
        res.locals.lang = lang;
        res.locals.user = req.user || null;
        next();
    });

    app.get('/', (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('index', { lang });
    });

    // RUTA API NUEVA: Registra la aceptación de la política de privacidad y otorga la insignia
    app.post('/api/accept-privacy', checkAuth, async (req, res) => {
        try {
            const userId = req.user.id; // Obtenemos el ID del usuario autenticado mediante Discord

            // Guardamos en la base de datos que aceptó los terms y le asignamos la insignia
            await db.set(`privacyAccepted_${userId}`, true);
            await db.set(`badge_privacy_${userId}`, true);

            console.log(`✅ El usuario con ID ${userId} aceptó la política de privacidad y recibió su insignia.`);
            return res.json({ success: true, message: "Insignia otorgada correctamente." });
        } catch (error) {
            console.error("❌ Error al otorgar la insignia de privacidad:", error);
            return res.status(500).json({ success: false, message: "Error interno del servidor." });
        }
    });

    // ==========================================
    // SECCIÓN DE MANAGER (EXCLUSIVO PARA LA CREADORA Y ADMINS)
    // ==========================================
    const tuIdDeDiscord = '931545363565908041';

    const checkManager = async (req, res, next) => {
        if (!req.user) {
            return res.redirect('/auth/discord');
        }

        // Si es la creadora principal, pasa directo
        if (req.user.id === tuIdDeDiscord) {
            return next();
        }

        // Verificamos si tiene permiso guardado en la base de datos
        const tienePermiso = await db.get(`manager_admin_${req.user.id}`);
        if (tienePermiso) {
            return next();
        }

        return res.status(403).render('403');
    };

    // 1. SALA PRINCIPAL DE MANAGER (Centro con tarjetas de acceso)
    app.get('/dashboard/manager', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('manager-hub', { serverName: 'Panel Manager', lang });
    });

    // 2. RUTA PARA EL PANEL DE CREADORA (MUESTRA EL HISTORIAL DE NOTIFICACIONES)
    app.get('/dashboard/manager/notificaciones', checkAuth, checkManager, async (req, res) => {
        const historial = await db.get('historial_notificaciones') || [];
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        res.render('manager-notificaciones', { serverName: 'Panel de Notificaciones', activeMenu: 'manager-notificaciones', historial, lang });
    });

    // 3. RUTA PARA ESTADÍSTICAS DE USUARIOS (Usuarios totales del bot y sesiones en dashboard)
    app.get('/dashboard/manager/estadisticas', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        // Usuarios totales que usan el bot en los servidores cacheados
        const totalBotUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        // Sesiones únicas guardadas en la base de datos
        const allEntries = await db.all();
        const loggedUsersSet = new Set();
        allEntries.forEach(entry => {
            if (entry.id.startsWith('xp_') || entry.id.startsWith('dinero_') || entry.id.startsWith('privacyAccepted_')) {
                const parts = entry.id.split('_');
                if (parts[1]) loggedUsersSet.add(parts[1]);
            }
        });

        res.render('manager-estadisticas', { 
            serverName: 'Estadísticas de Usuarios', 
            activeMenu: 'manager-estadisticas', 
            totalBotUsers, 
            totalLoggedUsers: loggedUsersSet.size, 
            lang 
        });
    });

    // 4. RUTA PARA USUARIOS SOSPECHOSOS
    app.get('/dashboard/manager/sospechosos', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        // Analítica básica de cuentas o registros irregulares
        const sospechosos = []; 

        res.render('manager-sospechosos', { 
            serverName: 'Usuarios Sospechosos', 
            activeMenu: 'manager-sospechosos', 
            sospechosos, 
            lang 
        });
    });

    // 5. NUEVA SECCIÓN: GESTIÓN DE PERMISOS DE MANAGER
    app.get('/dashboard/manager/permisos', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        // Buscamos en la base de datos todos los registros que sean de permisos de manager
        const allEntries = await db.all();
        const adminsList = [];
        
        for (const entry of allEntries) {
            if (entry.id.startsWith('manager_admin_')) {
                const userId = entry.id.replace('manager_admin_', '');
                adminsList.push({ id: userId });
            }
        }

        // Obtener historial de auditoría y centro de notificaciones web internos
        const auditLogs = await db.get('manager_audit_logs') || [];
        const notifications = await db.get('manager_web_notifications') || [];

        res.render('manager-permisos', { 
            serverName: 'Gestión de Permisos', 
            activeMenu: 'manager-permisos', 
            adminsList, 
            auditLogs,
            notifications,
            lang 
        });
    });

    // RUTA POST PARA AGREGAR UN NUEVO ADMIN DE MANAGER (BLINDADA)
    app.post('/admin/agregar-permiso', adminActionLimiter, checkAuth, checkManager, async (req, res) => {
        const { targetUserId } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        const executor = req.user;

        if (!targetUserId) {
            return res.status(400).send("Falta el ID del usuario.");
        }

        const cleanId = targetUserId.trim();

        // 🛡️ Validación de seguridad estricta para ID de Discord
        const discordIdRegex = /^\d{17,20}$/;
        if (!discordIdRegex.test(cleanId)) {
            console.warn(`⚠️ Intento de inyección o ID inválido detectado: "${cleanId}" por ${executor.username}`);
            return res.status(400).send("Error de seguridad: El ID de Discord introducido no es válido.");
        }

        await db.set(`manager_admin_${cleanId}`, true);

        // --- REGISTRO DE AUDITORÍA INTERNO ---
        const auditLogs = await db.get('manager_audit_logs') || [];
        auditLogs.unshift({
            id: Date.now(),
            username: executor.username || 'Admin',
            action: 'CONCEDER_PERMISO',
            details: `Se otorgó acceso de Manager al usuario ID: ${cleanId}`,
            timestamp: Date.now()
        });
        await db.set('manager_audit_logs', auditLogs.slice(0, 50));

        // --- NOTIFICACIÓN WEB INTERNA ---
        const notifications = await db.get('manager_web_notifications') || [];
        notifications.unshift({
            id: Date.now(),
            title: 'Nuevo Acceso Concedido',
            message: `El administrador ${executor.username} autorizó al usuario ID: ${cleanId}`,
            type: 'success',
            timestamp: Date.now()
        });
        await db.set('manager_web_notifications', notifications.slice(0, 30));

        console.log(`🔑 Permiso de Manager concedido al usuario ID: ${cleanId}`);
        return res.redirect(`/dashboard/manager/permisos?lang=${lang}`);
    });

    // RUTA POST PARA ELIMINAR UN ADMIN DE MANAGER (BLINDADA)
    app.post('/admin/eliminar-permiso', adminActionLimiter, checkAuth, checkManager, async (req, res) => {
        const { targetUserId } = req.body;
        const executor = req.user;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "Falta el ID." });
        }

        const cleanId = targetUserId.trim();
        
        const discordIdRegex = /^\d{17,20}$/;
        if (!discordIdRegex.test(cleanId)) {
            return res.status(400).json({ success: false, message: "ID de Discord inválido." });
        }

        await db.delete(`manager_admin_${cleanId}`);

        // --- REGISTRO DE AUDITORÍA INTERNO ---
        const auditLogs = await db.get('manager_audit_logs') || [];
        auditLogs.unshift({
            id: Date.now(),
            username: executor.username || 'Admin',
            action: 'REVOCAR_PERMISO',
            details: `Se revocaron los accesos de Manager al usuario ID: ${cleanId}`,
            timestamp: Date.now()
        });
        await db.set('manager_audit_logs', auditLogs.slice(0, 50));

        // --- NOTIFICACIÓN WEB INTERNA ---
        const notifications = await db.get('manager_web_notifications') || [];
        notifications.unshift({
            id: Date.now(),
            title: 'Acceso Revocado',
            message: `El administrador ${executor.username} eliminó los permisos del usuario ID: ${cleanId}`,
            type: 'warning',
            timestamp: Date.now()
        });
        await db.set('manager_web_notifications', notifications.slice(0, 30));

        console.log(`🗑️ Permiso de Manager revocado al usuario ID: ${cleanId}`);
        return res.json({ success: true, message: "Permiso eliminado correctamente." });
    });

    // RUTA PARA ENVIAR NOTIFICACIONES Y GUARDARLAS EN EL HISTORIAL
    app.post('/admin/enviar-notificacion', checkAuth, checkManager, async (req, res) => {
        const { title, message } = req.body;
        
        if (!title || !message) {
            return res.status(400).send("Faltan datos obligatorios.");
        }

        const timestamp = Date.now();
        const nuevaNotificacion = { id: timestamp, title, message, date: new Date().toLocaleString() };

        let historial = await db.get('historial_notificaciones') || [];
        historial.unshift(nuevaNotificacion);
        await db.set('historial_notificaciones', historial);
        
        const ioInstance = req.app.get('io');
        if (ioInstance) {
            ioInstance.emit('nueva-notificacion', { title, message });
        }

        console.log(`📢 Notificación enviada: "${title}" - "${message}"`);
        return res.redirect('/dashboard/manager/notificaciones');
    });

    // RUTA PARA ELIMINAR UNA NOTIFICACIÓN DEL HISTORIAL
    app.post('/admin/eliminar-notificacion', checkAuth, checkManager, async (req, res) => {
        const { id } = req.body;
        let historial = await db.get('historial_notificaciones') || [];
        
        if (id) {
            historial = historial.filter(n => n.id !== Number(id));
        } else {
            historial.shift();
        }

        await db.set('historial_notificaciones', historial);

        const ioInstance = req.app.get('io');
        if (ioInstance) {
            ioInstance.emit('borrar-notificacion', { id });
        }

        console.log(`🗑️ Notificación eliminada del historial.`);
        return res.json({ success: true, message: "Notificación eliminada.", historial });
    });

    // ==========================================

    // RUTA DE DOCUMENTACIÓN
    app.get('/documentacion', (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('documentation', { lang });
    });

    // Listado de servidores protegidos con checkAuth
    app.get('/dashboard', checkAuth, async (req, res) => {
        const historial = await db.get('historial_notificaciones') || [];
        const userGuilds = req.user.guilds.filter(guild => {
            const permissions = BigInt(guild.permissions);
            const ADMINISTRATOR = 0x8n;
            return (permissions & ADMINISTRATOR) === ADMINISTRATOR || guild.owner;
        }).map(guild => {
            const cachedGuild = client.guilds.cache.get(guild.id);
            return {
                ...guild,
                banner: cachedGuild ? cachedGuild.banner : guild.banner,
                botInGuild: !!cachedGuild
            };
        });

        res.render('dashboard-select', { guilds: userGuilds, serverName: 'PREM Bot', historial }); 
    });

    app.get('/dashboard/custom-commands', checkAuth, async (req, res) => {
        const historial = await db.get('historial_notificaciones') || [];
        res.render('premium-required', { serverName: 'PREM Bot', activeMenu: 'custom-commands', historial });
    });

    app.get('/dashboard/:guildId', checkAuth, checkAdmin, async (req, res) => {
        const guildId = req.params.guildId;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.redirect(`/dashboard/${guildId}/general?lang=${lang}`);
    });

    const checkBotInGuild = (req, res, next) => {
        const guildId = req.params.guildId;
        const guild = client.guilds.cache.get(guildId);

        if (!guild) {
            const clientId = process.env.CLIENT_ID || 'TU_CLIENT_ID'; 
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
            return res.redirect(inviteUrl);
        }
        
        req.guildCache = guild; 
        next();
    };

    app.get('/dashboard/:guildId/general', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        
        const guildData = {
            id: guildId,
            name: guild.name,
            icon: guild.icon
        };

        const prefix = await db.get(`prefix_${guildId}`) || '!';
        const historial = await db.get('historial_notificaciones') || [];
        
        res.render('dashboard-general', { guildId, guildData, serverName: guildData.name, prefix, historial, activeMenu: 'general' });
    });

    app.post('/dashboard/:guildId/general', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const { prefix } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        await db.set(`prefix_${guildId}`, prefix);
        res.redirect(`/dashboard/${guildId}/general?lang=${lang}`);
    });

    app.get('/dashboard/:guildId/bienvenida', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        
        const guildData = {
            id: guildId,
            name: guild.name,
            icon: guild.icon
        };

        const canales = guild.channels.cache.filter(c => c.type === 0);
        const canalBienvenida = await db.get(`bienvenida_${guildId}`) || '';
        const msgBienvenida = await db.get(`msgBienvenida_${guildId}`) || '¡Bienvenido a {servidor}, {usuario}!';
        const historial = await db.get('historial_notificaciones') || [];
        
        res.render('dashboard-bienvenida', { guildId, guildData, serverName: guildData.name, canalBienvenida, msgBienvenida, canales, historial, activeMenu: 'bienvenida' });
    });

    app.post('/dashboard/:guildId/bienvenida', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const { canalBienvenida, msgBienvenida } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        await db.set(`bienvenida_${guildId}`, canalBienvenida);
        await db.set(`msgBienvenida_${guildId}`, msgBienvenida);
        res.redirect(`/dashboard/${guildId}/bienvenida?lang=${lang}`);
    });

    app.get('/dashboard/:guildId/niveles', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        
        const guildData = {
            id: guildId,
            name: guild.name,
            icon: guild.icon
        };

        const canales = guild.channels.cache.filter(c => c.type === 0);
        const roles = guild.roles.cache.filter(r => r.name !== '@everyone');

        const msgNivel = await db.get(`msgNivel_${guildId}`) || '¡Felicidades {usuario}, has subido al nivel {nivel}!';
        const canalNivel = await db.get(`canalNivel_${guildId}`) || '';
        const sistemaNiveles = await db.get(`sistemaNiveles_${guildId}`) || 'off';
        const canalesIgnorados = await db.get(`canalesIgnorados_${guildId}`) || [];
        const nivelRecompensa = await db.get(`nivelRecompensa_${guildId}`) || '';
        const rolRecompensa = await db.get(`rolRecompensa_${guildId}`) || '';
        const historial = await db.get('historial_notificaciones') || [];
        
        res.render('dashboard-niveles', { 
            guildId, 
            guildData,
            serverName: guildData.name,
            msgNivel, 
            canalNivel, 
            sistemaNiveles, 
            canales, 
            canalesIgnorados, 
            roles, 
            nivelRecompensa, 
            rolRecompensa, 
            historial,
            activeMenu: 'niveles' 
        });
    });

    app.post('/dashboard/:guildId/niveles', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const { msgNivel, canalNivel, sistemaNiveles, canalesIgnorados, nivelRecompensa, rolRecompensa } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        
        await db.set(`msgNivel_${guildId}`, msgNivel);
        await db.set(`canalNivel_${guildId}`, canalNivel);
        await db.set(`sistemaNiveles_${guildId}`, sistemaNiveles || 'off');
        
        let ignoradosArray = [];
        if (canalesIgnorados) {
            ignoradosArray = Array.isArray(canalesIgnorados) ? canalesIgnorados : [canalesIgnorados];
        }
        await db.set(`canalesIgnorados_${guildId}`, ignoradosArray);
        await db.set(`nivelRecompensa_${guildId}`, nivelRecompensa || '');
        await db.set(`rolRecompensa_${guildId}`, rolRecompensa || '');

        res.redirect(`/dashboard/${guildId}/niveles?lang=${lang}`);
    });

    app.get('/dashboard/:guildId/ajustes', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        
        const guildData = {
            id: guildId,
            name: guild.name,
            icon: guild.icon
        };

        const historial = await db.get('historial_notificaciones') || [];
        res.render('dashboard-ajustes', { guildId, guildData, serverName: guildData.name, historial, activeMenu: 'ajustes' });
    });

    app.get('/dashboard/:guildId/personalizador', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        
        const guildData = {
            id: guildId,
            name: guild.name,
            icon: guild.icon
        };

        const historial = await db.get('historial_notificaciones') || [];
        res.render('dashboard-personalizador', { guildId, guildData, serverName: guildData.name, historial, activeMenu: 'personalizador' });
    });

    // --- MANEJO DE ERRORES Y PÁGINAS DE ESTADO (403 / 404) ---
    app.use((req, res) => {
        res.status(404).render('404');
    });

    app.use((err, req, res, next) => {
        console.error('❌ Error crítico en el servidor web:', err.stack);
        res.status(500).render('403');
    });
    // ---------------------------------------------------------

    server.listen(PORT, () => {
        console.log(`🌐 Dashboard corriendo en http://localhost:${PORT}`);
    });
}

module.exports = { iniciarDashboard, app };