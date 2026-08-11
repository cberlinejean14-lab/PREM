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

// Módulos de seguridad añadidos
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// --- SISTEMA DE RESPALDOS AÑADIDO ---
const { iniciarSistemaBackups } = require('./utils/backup');
// ------------------------------------

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
    plugins: [
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new YtDlpPlugin()
    ]
});

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new Strategy({
    clientID: process.env.CLIENT_ID || 'TU_CLIENT_ID',
    clientSecret: process.env.CLIENT_SECRET || 'TU_CLIENT_SECRET',
    callbackURL: 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'guilds']
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

const { iniciarDashboard, app } = require('./dashboard.js');

// --- CONFIGURACIÓN DE SEGURIDAD ---
app.use(helmet({
    contentSecurityPolicy: false,
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200 
});
app.use(limiter);
// ----------------------------------

app.use(session({
    secret: process.env.SESSION_SECRET || 'una_clave_secreta_muy_segura_para_tu_proyecto',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

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

app.get('/', async (req, res) => {
    if (req.query.lang) {
        req.session.lang = req.query.lang;
    }
    const currentLang = req.query.lang || req.session.lang || 'es';

    const serverCount = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    const totalCommands = await db.get('totalComandosEjecutados') || 15420;
    const historial = await db.get('historial_notificaciones') || [];

    const todasLasReviews = await db.get('reviews_globales') || [];
    const listaReviews = todasLasReviews.filter(rev => rev.estrellas >= 4);

    const allEntries = await db.all();
    
    const xpMap = {};
    allEntries.forEach(entry => {
        if (entry.id.startsWith('xp_')) {
            const parts = entry.id.split('_');
            const userId = parts[1];
            xpMap[userId] = (xpMap[userId] || 0) + entry.value;
        }
    });
    const sortedXP = Object.keys(xpMap)
        .map(id => ({ id, value: xpMap[id] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const rankingXP = [];
    for (const item of sortedXP) {
        const info = await obtenerInfoUsuario(item.id);
        rankingXP.push({ id: item.id, value: item.value, username: info.username, avatar: info.avatar });
    }

    const dineroMap = {};
    allEntries.forEach(entry => {
        if (entry.id.startsWith('dinero_')) {
            const userId = entry.id.split('_')[1];
            dineroMap[userId] = entry.value;
        }
    });
    const sortedDinero = Object.keys(dineroMap)
        .map(id => ({ id, value: dineroMap[id] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const rankingDinero = [];
    for (const item of sortedDinero) {
        const info = await obtenerInfoUsuario(item.id);
        rankingDinero.push({ id: item.id, value: item.value, username: info.username, avatar: info.avatar });
    }

    const musicaMap = {};
    allEntries.forEach(entry => {
        if (entry.id.startsWith('musica_')) {
            const userId = entry.id.split('_')[1];
            musicaMap[userId] = entry.value;
        }
    });
    const sortedMusica = Object.keys(musicaMap)
        .map(id => ({ id, value: musicaMap[id] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

    const rankingMusica = [];
    for (const item of sortedMusica) {
        const info = await obtenerInfoUsuario(item.id);
        rankingMusica.push({ id: item.id, value: item.value, username: info.username, avatar: info.avatar });
    }

    if (typeof res.render === 'function') {
        return res.render('index', {
            user: req.user,
            lang: currentLang,
            currentLang: currentLang,
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

app.get('/variables', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    
    res.render('variables', { 
        user: req.user || null,
        lang: currentLang,
        currentLang: currentLang,
        historial
    });
});

app.get('/dashboard/custom-bot', checkAuth, async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];

    const t = {
        es: { home: "Inicio", settings: "Ajustes", welcome: "Bienvenida", levels: "Niveles", customizer: "Personalizador" },
        en: { home: "Home", settings: "Settings", welcome: "Welcome", levels: "Levels", customizer: "Customizer" }
    };

    res.render('custom-bot', {
        user: req.user,
        lang: currentLang,
        currentLang: currentLang,
        t: t[currentLang] || t['es'],
        historial,
        activeMenu: 'custom-bot'
    });
});

app.get('/dashboard/custom-commands', checkAuth, async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];

    const t = {
        es: { home: "Inicio", settings: "Ajustes", welcome: "Bienvenida", levels: "Niveles", customizer: "Personalizador" },
        en: { home: "Home", settings: "Settings", welcome: "Welcome", levels: "Levels", customizer: "Customizer" }
    };

    try {
        const esPremium = await db.get(`premium_user_${req.user.id}`) || false;

        if (!esPremium) {
            return res.render('premium-required', {
                user: req.user,
                lang: currentLang,
                currentLang: currentLang,
                t: t[currentLang] || t['es'],
                historial,
                activeMenu: 'custom-commands'
            });
        }

        res.render('custom-commands', {
            user: req.user,
            lang: currentLang,
            currentLang: currentLang,
            t: t[currentLang] || t['es'],
            historial,
            activeMenu: 'custom-commands'
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error al cargar la sección de comandos personalizados");
    }
});

app.get('/tos', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    res.render('tos', { lang: currentLang, currentLang, user: req.user, historial });
});

app.get('/privacy', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];

    const t = {
        es: {
            title: "Política de Privacidad - PREM Bot",
            heading: "Política de Privacidad",
            updated: "Última actualización: Agosto de 2026",
            intro: "En PREM Bot nos tomamos muy en serio la privacidad de nuestros usuarios y comunidades.",
            back: "Volver al inicio"
        }
    };

    const strings = t[currentLang] || t['es'];

    res.render('privacy', { 
        lang: currentLang, 
        currentLang, 
        t: strings,
        user: req.user,
        historial 
    });
});

app.get('/documentacion', async (req, res) => {
    if (req.query.lang) req.session.lang = req.query.lang;
    const currentLang = req.query.lang || req.session.lang || 'es';
    const historial = await db.get('historial_notificaciones') || [];
    
    res.render('documentation', {
        user: req.user, 
        lang: currentLang, 
        currentLang: currentLang,
        historial 
    });
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', {
        failureRedirect: '/'
    }), 
    (req, res) => {
        const guildId = req.query.guild_id;
        if (guildId) {
            return res.redirect(`/dashboard/${guildId}`);
        }
        res.redirect('/dashboard');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { console.error(err); }
        res.redirect('/');
    });
});

iniciarDashboard(client);

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const slashCommandsArray = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        slashCommandsArray.push(command.data.toJSON());
    } else {
        console.log(`⚠️ El comando en ${filePath} le falta la propiedad 'data' o 'execute'.`);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Hubo un error al ejecutar este comando.', ephemeral: true });
        }
    }
});

client.once('clientReady', async () => {
    console.log(`🤖 ¡Bot en línea como ${client.user.tag}!`);

    // --- INICIALIZAR SISTEMA DE RESPALDOS AQUÍ ---
    iniciarSistemaBackups();
    // --------------------------------------------

    client.user.setPresence({
        activities: [{
            name: 'Custom Status',
            type: 4, 
            state: '✨ Original de PREM'
        }],
        status: 'online'
    });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommandsArray });
        console.log('✅ ¡Comandos de barra (/) cargados y registrados exitosamente desde la carpeta commands!');
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.TOKEN);