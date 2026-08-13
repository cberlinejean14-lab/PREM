require('dotenv').config();
const express = require('express');
const helmet = require('helmet'); 
const http = require('http');
const { Server } = require('socket.io'); 
const { QuickDB } = require('quick.db');
const rateLimit = require('express-rate-limit'); 
const { checkAuth, checkAdmin } = require('./auth'); 
const db = new QuickDB();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));

const server = http.createServer(app);
const io = new Server(server);

app.set('io', io);

io.on('connection', (socket) => {
    // Silenciado o controlado para evitar spam masivo de logs
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); 

const adminActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 15, 
    message: { success: false, message: "Demasiadas peticiones desde esta IP. Inténtelo más tarde." },
    standardHeaders: true,
    legacyHeaders: false,
});

const traducciones = {
    es: { home: "Hogar", settings: "Ajustes", customizer: "Personalización", welcome: "Canal de Bienvenida", levels: "Niveles y XP", searchPlaceholder: "Módulos de búsqueda...", saveChanges: "Guardar cambios" },
    en: { home: "Home", settings: "Settings", customizer: "Customization", welcome: "Welcome Channel", levels: "Levels & XP", searchPlaceholder: "Search modules...", saveChanges: "Save changes" },
    pt: { home: "Início", settings: "Configurações", customizer: "Personalização", welcome: "Canal de Boas-vindas", levels: "Níveis e XP", searchPlaceholder: "Pesquisar módulos...", saveChanges: "Salvar alterações" },
    fr: { home: "Accueil", settings: "Paramètres", customizer: "Personnalisation", welcome: "Canal de Bienvenue", levels: "Niveaux & XP", searchPlaceholder: "Rechercher des modules...", saveChanges: "Enregistrer" },
    hi: { home: "होम", settings: "सेटिंग्स", customizer: "कस्टमाइज़र", welcome: "स्वागत चैनल", levels: "स्तर और XP", searchPlaceholder: "मॉड्यूल खोजें...", saveChanges: "परिवर्तन सहेजें" },
    ar: { home: "الرئيسية", settings: "الإعدادات", customizer: "التخصيص", welcome: "قناة الترحيب", levels: "المستويات و XP", searchPlaceholder: "بحث عن الوحدات...", saveChanges: "حفظ التغييرات" },
    zh: { home: "首页", settings: "设置", customizer: "自定义", welcome: "欢迎频道", levels: "等级与经验", searchPlaceholder: "搜索模块...", saveChanges: "保存更改" }
};

function iniciarDashboard(client) {
    app.use((req, res, next) => {
        if (!req.session) {
            req.session = {};
        }
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

    app.get('/', async (req, res) => {
        try {
            const lang = req.query.lang || (req.session && req.session.lang) || 'es';
            const serverCount = client && client.guilds ? client.guilds.cache.size : 0;
            const totalUsers = client && client.guilds ? client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0) : 0;
            const totalCommands = await db.get('total_commands_executed').catch(() => 1420) || 1420;
            const listaReviews = await db.get('reviews_bot').catch(() => []) || [];

            return res.render('index', { 
                lang, 
                currentLang: lang,
                serverCount, 
                totalUsers, 
                totalCommands, 
                rankingDinero: [], 
                rankingXP: [], 
                rankingMusica: [], 
                listaReviews 
            });
        } catch (error) {
            console.error("Error en ruta raíz:", error.message);
            return res.status(500).send(`<h3>Error en el servidor:</h3><pre>${error && error.message ? error.message : String(error)}</pre>`);
        }
    });

    app.post('/api/accept-privacy', checkAuth, async (req, res) => {
        try {
            const userId = req.user.id; 
            await db.set(`privacyAccepted_${userId}`, true);
            await db.set(`badge_privacy_${userId}`, true);
            return res.json({ success: true, message: "Insignia otorgada correctamente." });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Error interno del servidor." });
        }
    });

    const tuIdDeDiscord = '931545363565908041';

    const checkManager = async (req, res, next) => {
        if (!req.user) {
            return res.redirect('/auth/discord');
        }
        if (req.user.id === tuIdDeDiscord) {
            return next();
        }
        const tienePermiso = await db.get(`manager_admin_${req.user.id}`);
        if (tienePermiso) {
            return next();
        }
        return res.status(403).render('403');
    };

    app.get('/dashboard/manager', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('manager-hub', { serverName: 'Panel Manager', lang });
    });

    app.get('/dashboard/manager/notificaciones', checkAuth, checkManager, async (req, res) => {
        const historial = await db.get('historial_notificaciones') || [];
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('manager-notificaciones', { serverName: 'Panel de Notificaciones', activeMenu: 'manager-notificaciones', historial, lang });
    });

    app.get('/dashboard/manager/estadisticas', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        const totalBotUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const allEntries = await db.all();
        const loggedUsersSet = new Set();
        if (allEntries) {
            allEntries.forEach(entry => {
                if (entry && entry.id && (entry.id.startsWith('xp_') || entry.id.startsWith('dinero_') || entry.id.startsWith('privacyAccepted_'))) {
                    const parts = entry.id.split('_');
                    if (parts[1]) loggedUsersSet.add(parts[1]);
                }
            });
        }

        res.render('manager-estadisticas', { 
            serverName: 'Estadísticas de Usuarios', 
            activeMenu: 'manager-estadisticas', 
            totalBotUsers, 
            totalLoggedUsers: loggedUsersSet.size, 
            lang 
        });
    });

    app.get('/dashboard/manager/sospechosos', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        const sospechosos = []; 
        res.render('manager-sospechosos', { serverName: 'Usuarios Sospechosos', activeMenu: 'manager-sospechosos', sospechosos, lang });
    });

    app.get('/dashboard/manager/permisos', checkAuth, checkManager, async (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        const allEntries = await db.all();
        const adminsList = [];
        
        if (allEntries) {
            for (const entry of allEntries) {
                if (entry && entry.id && entry.id.startsWith('manager_admin_')) {
                    const userId = entry.id.replace('manager_admin_', '');
                    adminsList.push({ id: userId });
                }
            }
        }

        const auditLogs = await db.get('manager_audit_logs') || [];
        const notifications = await db.get('manager_web_notifications') || [];

        res.render('manager-permisos', { serverName: 'Gestión de Permisos', activeMenu: 'manager-permisos', adminsList, auditLogs, notifications, lang });
    });

    app.post('/admin/agregar-permiso', adminActionLimiter, checkAuth, checkManager, async (req, res) => {
        const { targetUserId } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        if (!targetUserId) return res.status(400).send("Falta el ID del usuario.");
        const cleanId = targetUserId.trim();
        const discordIdRegex = /^\d{17,20}$/;
        if (!discordIdRegex.test(cleanId)) return res.status(400).send("ID de Discord inválido.");

        await db.set(`manager_admin_${cleanId}`, true);
        return res.redirect(`/dashboard/manager/permisos?lang=${lang}`);
    });

    app.post('/admin/eliminar-permiso', adminActionLimiter, checkAuth, checkManager, async (req, res) => {
        const { targetUserId } = req.body;
        if (!targetUserId) return res.status(400).json({ success: false, message: "Falta el ID." });
        const cleanId = targetUserId.trim();
        await db.delete(`manager_admin_${cleanId}`);
        return res.json({ success: true, message: "Permiso eliminado correctamente." });
    });

    app.post('/admin/enviar-notificacion', checkAuth, checkManager, async (req, res) => {
        const { title, message } = req.body;
        if (!title || !message) return res.status(400).send("Faltan datos.");
        const nuevaNotificacion = { id: Date.now(), title, message, date: new Date().toLocaleString() };
        let historial = await db.get('historial_notificaciones') || [];
        historial.unshift(nuevaNotificacion);
        await db.set('historial_notificaciones', historial);
        return res.redirect('/dashboard/manager/notificaciones');
    });

    app.post('/admin/eliminar-notificacion', checkAuth, checkManager, async (req, res) => {
        const { id } = req.body;
        let historial = await db.get('historial_notificaciones') || [];
        if (id) historial = historial.filter(n => n.id !== Number(id));
        else historial.shift();
        await db.set('historial_notificaciones', historial);
        return res.json({ success: true, message: "Notificación eliminada." });
    });

    app.get('/documentacion', (req, res) => {
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        res.render('documentation', { lang });
    });

    app.get('/dashboard', checkAuth, async (req, res) => {
        try {
            const lang = req.query.lang || (req.session && req.session.lang) || 'es';
            const historial = await db.get('historial_notificaciones') || [];
            
            const userGuilds = (req.user && req.user.guilds) ? req.user.guilds : [];
            const guildsList = Array.isArray(userGuilds) ? userGuilds.map(guild => ({
                id: guild.id || '',
                name: guild.name || 'Servidor sin nombre',
                icon: guild.icon || null,
                owner: Boolean(guild.owner),
                permissions: guild.permissions || 0,
                administrator: Boolean(guild.administrator),
                botInGuild: client.guilds && client.guilds.cache ? client.guilds.cache.has(guild.id) : false
            })) : [];

            return res.render('dashboard-select', { 
                guilds: guildsList, 
                serverName: 'PREM Bot', 
                historial,
                lang,
                currentLang: lang,
                user: req.user || { username: 'Invitado', id: '0' },
                t: traducciones[lang] || traducciones.es
            }); 
        } catch (error) {
            console.error("🔥 ERROR REAL EN /DASHBOARD:", error.message);
            const errorMsg = error instanceof Error ? error.stack : JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
            return res.status(500).send(`<h3>Error exacto en el servidor:</h3><pre style="background: #1e1e1e; color: #ff6b6b; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${errorMsg}</pre>`);
        }
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
            const clientId = process.env.CLIENT_ID || '1534632950224781548'; 
            const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands&guild_id=${guildId}&disable_guild_select=true`;
            return res.redirect(inviteUrl);
        }
        req.guildCache = guild; 
        next();
    };

    app.get('/dashboard/:guildId/general', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        const guildData = { id: guildId, name: guild.name, icon: guild.icon };
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
        const guildData = { id: guildId, name: guild.name, icon: guild.icon };
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
        const guildData = { id: guildId, name: guild.name, icon: guild.icon };
        const canales = guild.channels.cache.filter(c => c.type === 0);
        const roles = guild.roles.cache.filter(r => r.name !== '@everyone');
        const msgNivel = await db.get(`msgNivel_${guildId}`) || '¡Felicidades {usuario}, has subido al nivel {nivel}!';
        const canalNivel = await db.get(`canalNivel_${guildId}`) || '';
        const sistemaNiveles = await db.get(`sistemaNiveles_${guildId}`) || 'off';
        const canalesIgnorados = await db.get(`canalesIgnorados_${guildId}`) || [];
        const nivelRecompensa = await db.get(`nivelRecompensa_${guildId}`) || '';
        const rolRecompensa = await db.get(`rolRecompensa_${guildId}`) || '';
        const historial = await db.get('historial_notificaciones') || [];
        
        res.render('dashboard-niveles', { guildId, guildData, serverName: guildData.name, msgNivel, canalNivel, sistemaNiveles, canales, canalesIgnorados, roles, nivelRecompensa, rolRecompensa, historial, activeMenu: 'niveles' });
    });

    app.post('/dashboard/:guildId/niveles', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const { msgNivel, canalNivel, sistemaNiveles, canalesIgnorados, nivelRecompensa, rolRecompensa } = req.body;
        const lang = req.query.lang || (req.session && req.session.lang) || 'es';
        await db.set(`msgNivel_${guildId}`, msgNivel);
        await db.set(`canalNivel_${guildId}`, canalNivel);
        await db.set(`sistemaNiveles_${guildId}`, sistemaNiveles || 'off');
        let ignoradosArray = canalesIgnorados ? (Array.isArray(canalesIgnorados) ? canalesIgnorados : [canalesIgnorados]) : [];
        await db.set(`canalesIgnorados_${guildId}`, ignoradosArray);
        await db.set(`nivelRecompensa_${guildId}`, nivelRecompensa || '');
        await db.set(`rolRecompensa_${guildId}`, rolRecompensa || '');
        res.redirect(`/dashboard/${guildId}/niveles?lang=${lang}`);
    });

    app.get('/dashboard/:guildId/ajustes', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        const guildData = { id: guildId, name: guild.name, icon: guild.icon };
        const historial = await db.get('historial_notificaciones') || [];
        res.render('dashboard-ajustes', { guildId, guildData, serverName: guildData.name, historial, activeMenu: 'ajustes' });
    });

    app.get('/dashboard/:guildId/personalizador', checkAuth, checkAdmin, checkBotInGuild, async (req, res) => {
        const guildId = req.params.guildId;
        const guild = req.guildCache;
        const guildData = { id: guildId, name: guild.name, icon: guild.icon };
        const historial = await db.get('historial_notificaciones') || [];
        res.render('dashboard-personalizador', { guildId, guildData, serverName: guildData.name, historial, activeMenu: 'personalizador' });
    });

    app.use((req, res) => {
        res.status(404).render('404');
    });

    // --- MANEJADOR DE ERRORES SEGURO ---
    app.use((err, req, res, next) => {
        const errorText = err ? (err.stack || err.message || String(err)) : 'Error desconocido';
        console.error('❌ ERROR REAL EN EL SERVIDOR:', errorText);
        res.status(500).send(`
            <h3 style="color: #ff5252;">Error en el servidor:</h3>
            <pre style="background: #111; color: #ff5252; padding: 15px; border-radius: 5px; white-space: pre-wrap;">${errorText}</pre>
        `);
    });
}

module.exports = { iniciarDashboard, app };