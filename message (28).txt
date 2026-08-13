require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { QuickDB } = require("quick.db");
const db = new QuickDB();

const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Collection } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');

const passport = require('passport');
const Strategy = require('passport-discord').Strategy;
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { iniciarSistemaBackups } = require('./utils/backup');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
    ],
    partials: ['Channel', 'Message', 'GuildMember', 'User']
});

client.commands = new Collection();

const distube = new DisTube(client, {
    plugins: [new SpotifyPlugin(), new SoundCloudPlugin(), new YtDlpPlugin()]
});

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(obj));

const callbackURL = process.env.NODE_ENV === 'production' 
    ? 'https://prem-production-1585.up.railway.app/auth/discord/callback'
    : (process.env.CALLBACK_URL || 'http://localhost:3000/auth/discord/callback');

passport.use(new Strategy({
    clientID: process.env.CLIENT_ID || '1534632950224781548',
    clientSecret: process.env.CLIENT_SECRET || 'D4zUqryJU37CFmXqIAnJMoWEGsItV_LN',
    callbackURL: callbackURL,
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

const { iniciarDashboard, app } = require('./dashboard.js');

// --- SEGURIDAD Y SESIONES ---
app.use(helmet({ contentSecurityPolicy: false }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'clave_super_secreta_prem_2026',
    resave: true,
    saveUninitialized: true,
    cookie: { 
        secure: false, 
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- 1. RUTAS DE AUTENTICACIÓN ---
app.get('/auth/discord', passport.authenticate('discord', { scope: ['identify', 'guilds'] }));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/' }), 
    (req, res) => {
        const guildId = req.query.guild_id;
        if (guildId) {
            return res.redirect(`/dashboard/${guildId}`);
        }
        res.redirect('/dashboard');
    }
);

app.get('/auth/logout', async (req, res) => {
    try {
        await new Promise((resolve, reject) => {
            req.logout((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        if (req.session) {
            req.session.destroy(() => {
                res.redirect('/');
            });
        } else {
            res.redirect('/');
        }
    } catch (err) {
        console.error("Error al cerrar sesión:", err);
        res.redirect('/');
    }
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    return res.redirect('/auth/discord');
}

async function obtenerInfoUsuario(userId) {
    let username = `Usuario_${userId.substring(0, 4)}`;
    let avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
    try {
        const user = await client.users.fetch(userId, { force: true });
        if (user) {
            username = user.username;
            if (user.avatar) {
                avatar = user.displayAvatarURL({ dynamic: true, size: 128 });
            }
        }
    } catch (e) {}
    return { username, avatar };
}

async function configurarAutoMod(guild) {
    try {
        const rules = await guild.autoModerationRules.fetch();
        if (!rules.find(r => r.name === 'PREM AutoMod - Protección Automática')) {
            await guild.autoModerationRules.create({
                name: 'PREM AutoMod - Protección Automática',
                eventType: 1, triggerType: 5,
                triggerMetadata: { mentionTotalLimit: 5 },
                actions: [{ type: 1 }], enabled: true,
            });
        }
    } catch (error) { console.error(`⚠️ AutoMod error:`, error.message); }
}

// --- 2. RUTA PRINCIPAL ---
app.get('/', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';

    const serverCount = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const totalCommands = await db.get('totalComandosEjecutados') || 15420;
    const historial = await db.get('historial_notificaciones') || [];
    const todasLasReviews = await db.get('reviews_globales') || [];
    const listaReviews = todasLasReviews.filter(rev => rev.estrellas >= 4);

    const allEntries = await db.all();
    
    const getRanking = async (prefix) => {
        const map = {};
        allEntries.forEach(entry => {
            if (entry.id.startsWith(prefix)) {
                const userId = entry.id.split('_')[1];
                map[userId] = (map[userId] || 0) + entry.value;
            }
        });
        const sorted = Object.keys(map).map(id => ({ id, value: map[id] })).sort((a, b) => b.value - a.value).slice(0, 10);
        const ranking = [];
        for (const item of sorted) {
            const info = await obtenerInfoUsuario(item.id);
            ranking.push({ ...item, ...info });
        }
        return ranking;
    };

    const rankingXP = await getRanking('xp_');
    const rankingDinero = await getRanking('dinero_');
    const rankingMusica = await getRanking('musica_');

    const botUser = client.user ? { 
        username: client.user.username, 
        avatar: client.user.displayAvatarURL({ dynamic: true, size: 128 }) 
    } : { username: "PREM Bot", avatar: "https://cdn.discordapp.com/embed/avatars/0.png" };

    if (typeof res.render === 'function') {
        return res.render('index', {
            user: req.user || null,
            botUser,
            lang: currentLang,
            currentLang,
            serverCount,
            totalUsers,
            totalCommands,
            listaReviews,
            rankingXP,
            rankingDinero,
            rankingMusica,
            historial
        });
    }
    res.send('Dashboard activo');
});

// --- RUTA DASHBOARD SELECT ---
app.get('/dashboard', checkAuth, async (req, res) => {
    try {
        if (req.query.lang) req.session.lang = req.query.lang;
        const currentLang = req.query.lang || req.session.lang || 'es';
        const historial = await db.get('historial_notificaciones') || [];
        const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;

        const guildsList = (req.user && Array.isArray(req.user.guilds)) ? req.user.guilds.map(guild => ({
            id: guild.id || '',
            name: guild.name || 'Servidor sin nombre',
            icon: guild.icon || null,
            owner: Boolean(guild.owner),
            permissions: guild.permissions || 0,
            administrator: Boolean(guild.administrator),
            botInGuild: client.guilds.cache.has(guild.id)
        })) : [];

        return res.render('dashboard-select', { 
            guilds: guildsList, 
            serverName: 'PREM Bot', 
            historial,
            lang: currentLang,
            currentLang,
            user: req.user || { username: 'Invitado', id: '0' },
            botUser
        }); 
    } catch (error) {
        console.error("🔥 ERROR DETALLADO EN /DASHBOARD:", error);
        const errorMsg = error instanceof Error ? error.stack : JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
        return res.status(500).send(`
            <div style="background: #1e1e1e; color: #ff6b6b; padding: 25px; font-family: monospace; border-radius: 8px; margin: 20px;">
                <h2>¡Ocurrió un error exacto!</h2>
                <pre style="white-space: pre-wrap; background: #2d2d2d; padding: 15px; border-radius: 5px;">${errorMsg}</pre>
            </div>
        `);
    }
});

app.get('/variables', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;
    
    res.render('variables', { user: req.user || null, botUser, lang: currentLang, currentLang, historial });
});

app.get('/dashboard/custom-bot', checkAuth, async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;

    res.render('custom-bot', {
        user: req.user,
        botUser,
        lang: currentLang,
        currentLang,
        historial,
        activeMenu: 'custom-bot'
    });
});

app.get('/dashboard/custom-commands', checkAuth, async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;

    try {
        const esPremium = await db.get(`premium_user_${req.user.id}`) || false;
        const viewName = esPremium ? 'custom-commands' : 'premium-required';

        res.render(viewName, {
            user: req.user,
            botUser,
            lang: currentLang,
            currentLang,
            historial,
            activeMenu: 'custom-commands'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error al cargar comandos personalizados");
    }
});

app.get('/tos', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;
    res.render('tos', { lang: currentLang, currentLang, user: req.user, botUser, historial });
});

app.get('/privacy', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;

    res.render('privacy', { 
        lang: currentLang, 
        currentLang, 
        user: req.user,
        botUser,
        historial 
    });
});

app.get('/documentacion', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    const botUser = client.user ? { username: client.user.username, avatar: client.user.displayAvatarURL() } : null;
    
    res.render('documentation', { user: req.user, botUser, lang: currentLang, currentLang, historial });
});

// --- 3. INICIALIZAR EL DASHBOARD AL FINAL ---
iniciarDashboard(client);

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    const slashCommandsArray = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            slashCommandsArray.push(command.data.toJSON());
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction); } catch (error) { console.error(error); }
});

client.on('guildCreate', guild => { configurarAutoMod(guild); });

client.once('clientReady', async () => {
    console.log(`🤖 ¡Bot en línea como ${client.user.tag}!`);
    iniciarSistemaBackups();
    client.guilds.cache.forEach(guild => configurarAutoMod(guild));
    
    client.user.setPresence({ activities: [{ name: '✨ Original de PREM', type: 4 }], status: 'online' });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
        console.log('✅ Comandos cargados correctamente.');
    } catch (error) { console.error(error); }
});

client.login(process.env.TOKEN);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor web activo en el puerto ${PORT}`);
});