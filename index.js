require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const path = require('path');

const app = express();

// 1. Inicializar el cliente de Discord con sus Intents necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Configurar el motor de vistas EJS y la carpeta pública
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// 2. Ruta API para alimentar las estadísticas en tiempo real
app.get('/api/stats', async (req, res) => {
    try {
        const serverCount = client.guilds.cache.size;
        // Suma los miembros de todos los servidores en caché de forma segura
        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const totalCommands = 2800000; // Puedes cambiarlo si tienes un contador en base de datos

        res.json({
            servers: serverCount.toLocaleString() + '+',
            users: (totalUsers / 1000).toFixed(1).replace('.0', '') + 'K+',
            commands: (totalCommands / 1000000).toFixed(1).replace('.0', '') + 'M+'
        });
    } catch (error) {
        console.error('Error al obtener estadísticas en tiempo real:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// 3. Ruta Principal (Página de inicio)
app.get('/', (req, res) => {
    res.render('index', { 
        user: req.user || null,
        currentLang: req.query.lang || 'es',
        rankingDinero: [],
        rankingXP: [],
        rankingMusica: [],
        listaReviews: []
    });
});

// 4. Ruta del Dashboard
app.get('/dashboard', (req, res) => {
    const guilds = [
        { id: '1', name: 'Servidor de Ejemplo 1', icon: null, owner: true, permissions: 8 },
        { id: '2', name: 'Servidor de Ejemplo 2', icon: null, owner: false, permissions: 8 }
    ];
    
    res.render('dashboard-select', { 
        user: req.user || { username: 'Ganzita', id: '123456789', avatar: 'default' },
        guilds: guilds,
        lang: req.query.lang || 'es'
    });
});

// 5. Iniciar sesión del bot de Discord y levantar el servidor web con el puerto de Railway y 0.0.0.0
const TOKEN = process.env.TOKEN;
const PORT = process.env.PORT || 3000;

client.login(TOKEN).then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Bot conectado y servidor web corriendo en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error('Error al iniciar sesión con el bot de Discord:', err);
});